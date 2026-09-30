import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { hashDoToken, origemPermitida, origensPermitidas, readTenantHostConfig, resolveSession } from '@pipe/authentication';
import { ASSUNTOS } from '@pipe/contracts';
import type { Assunto, EventoDoServidor, Subscription, QuadroDeControle } from '@pipe/contracts';
import { databaseOwner } from './database.js';
import { lerCookie, SESSION_COOKIE_NAME } from './session.js';
import { resolveRequestTenantSlug } from './request-tenant.js';
import { registrar } from './realtime.js';
import type { Conexao } from './realtime.js';

/**
 * Browser realtime channel at `GET /v1/eventos` with `Upgrade: websocket`, using `packages/contracts/src/eventos.ts`: client sends `Inscricao`, server replies `QuadroDeControle`, then sends only `EventoDoServidor` (`{assunto, id, em}`), never full records. Authenticate with the existing `pipe_sessao` cookie through `resolverSessao`, as `GuardaSessao` does; derive tenant from that session and reject missing, expired, or forged sessions with 401 before opening a socket. Check `Origin` against `PIPE_ORIGENS` manually because CORS does not protect WebSocket handshakes: a malicious site could open a socket with the victim's cookie. `SameSite=Lax` also blocks this today, but may change independently; the explicit origin check preserves the boundary. Reject an unauthenticated `Upgrade` with `401`.
 */

/** Blip `CONNECTION_TEST_INTERVAL`: check the connection every 15 seconds. */
const INTERVALO_PING_MS = Number(process.env['PIPE_WS_PING_MS'] ?? 15_000);
/** `PING_TIMEOUT` da Blip: 5 s para o `pong` voltar. */
const TIMEOUT_PONG_MS = Number(process.env['PIPE_WS_PONG_TIMEOUT_MS'] ?? 5_000);
/**
 * Blip `MAX_PING_RETRIES` is 1: tolerate one unanswered ping and drop on the second. The browser can reconnect and refetch quickly; a zombie socket makes the screen appear live but frozen.
 */
const MAX_PINGS_SEM_RESPOSTA = Number(process.env['PIPE_WS_MAX_PINGS'] ?? 1);

const CAMINHO = '/v1/eventos';

function ehAssunto(value: unknown): value is Assunto {
  return typeof value === 'string' && (ASSUNTOS as readonly string[]).includes(value);
}

function enviar(socket: WebSocket, dado: EventoDoServidor | QuadroDeControle): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(dado));
}

function recusar(socket: Duplex, status: number, motivo: string): void {
  socket.write(`HTTP/1.1 ${status} ${motivo}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export interface ChannelOfEvents {
  fechar: () => Promise<void>;
}

export function connectChannelOfEvents(servidor: Server): ChannelOfEvents {
  const wss = new WebSocketServer({ noServer: true });

  const toUp = (request: IncomingMessage, socket: Duplex, cabeca: Buffer): void => {
    // Use `void` because `upgrade` does not await a promise; convert every failure into an explicit refusal.
    void (async () => {
      try {
        const url = new URL(request.url ?? '/', 'http://interno');
        if (url.pathname !== CAMINHO) return recusar(socket, 404, 'Not Found');

        const origem = request.headers.origin;
        // No `Origin` means a non-browser client, such as a test or integration. The cookie is still required below, so this does not bypass authentication.
        if (origem && !origemPermitida(origem.replace(/\/$/, ''), origensPermitidas())) {
          return recusar(socket, 403, 'Forbidden');
        }

        const token = lerCookie(request.headers.cookie, SESSION_COOKIE_NAME);
        if (!token) return recusar(socket, 401, 'Unauthorized');
        const session = await resolveSession(databaseOwner(), hashDoToken(token));
        if (!session) return recusar(socket, 401, 'Unauthorized');

        const requestedSlug = resolveRequestTenantSlug({ host: request.headers.host, origin: request.headers.origin }, readTenantHostConfig());
        if (requestedSlug && requestedSlug !== session.tenantSlug) return recusar(socket, 403, 'Forbidden');

        wss.handleUpgrade(request, socket, cabeca, (ws) => {
          void aoConectar(ws, session.tenantId, session.userId);
        });
      } catch {
        recusar(socket, 500, 'Internal Server Error');
      }
    })();
  };

  servidor.on('upgrade', toUp);

  return {
    fechar: async () => {
      servidor.off('upgrade', toUp);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

async function aoConectar(ws: WebSocket, tenantId: string, userId: string): Promise<void> {
  // Start with no subscriptions: the socket exists but delivers nothing until `Inscricao` arrives. Subscribing to all by default would reveal subjects the screen did not request.
  const assuntos = new Set<Assunto>();

  // `semResposta` conta pings que estouraram os 5 s do `PING_TIMEOUT`. No
  // `MAX_PING_RETRIES` da Blip (1), o segundo estouro derruba.
  let semResposta = 0;
  let aguardandoPong: NodeJS.Timeout | null = null;

  const respondeu = (): void => {
    semResposta = 0;
    if (aguardandoPong) {
      clearTimeout(aguardandoPong);
      aguardandoPong = null;
    }
  };

  /**
   * Attach listeners before any `await`. `registrar` talks to Redis, and awaiting it before `on('message')` creates a gap in which the browser's immediate `Inscricao` is lost. `ws` does not buffer events without listeners, leaving a live socket with no events or error log.
   */
  // Wait until this process is subscribed to the tenant's Redis channel before acknowledging the client; otherwise the screen could appear connected while an event published in that gap is lost.
  // cliente espera por ela: dizer "inscrito" antes de o registro existir abriria uma
  let registrado: () => void;
  const pronto = new Promise<void>((resolve) => {
    registrado = resolve;
  });

  ws.on('message', (cru) => {
    let pedido: Subscription;
    try {
      pedido = JSON.parse(String(cru)) as Subscription;
    } catch {
      enviar(ws, { tipo: 'recusado', motivo: 'assunto_desconhecido' });
      return;
    }
    // Treat every client message as activity: a browser that speaks is alive.
    // vivo mesmo que o `pong` tenha se perdido.
    respondeu();

    const pedidos = Array.isArray(pedido.assuntos) ? pedido.assuntos : [];
    if (pedidos.length === 0 || !pedidos.every(ehAssunto)) {
      enviar(ws, { tipo: 'recusado', motivo: 'assunto_desconhecido' });
      return;
    }

    // Never take `tenant_id` from `Inscricao`; it was derived from the session. The client chooses only the subject, not whose events it receives.
    assuntos.clear();
    for (const assunto of pedidos) assuntos.add(assunto);
    // Event delivery begins here, but confirm only after registration.
    void pronto.then(() => enviar(ws, { tipo: 'inscrito', assuntos: [...assuntos] }));
  });
  ws.on('pong', respondeu);

  const conexao: Conexao = {
    tenantId,
    userId,
    assuntos,
    entregar: (evento) => enviar(ws, evento),
  };
  const desligar = await registrar(conexao);

  // The socket may have died during the Redis `await`; remove it from registration so the process does not keep writing to a departed client.
  if (ws.readyState === ws.CLOSING || ws.readyState === ws.CLOSED) {
    await desligar();
    return;
  }
  registrado!();

  const relogio = setInterval(() => {
    // Use two pings: protocol ping keeps proxies and the socket alive, while contract ping lets the screen detect liveness without low-level APIs.
    ws.ping();
    enviar(ws, { tipo: 'ping' });

    if (aguardandoPong) clearTimeout(aguardandoPong);
    aguardandoPong = setTimeout(() => {
      semResposta += 1;
      if (semResposta > MAX_PINGS_SEM_RESPOSTA) {
        // Terminate a zombie socket whose client vanished. `close` waits for a handshake this peer will not answer; early termination lets the browser reconnect and refetch instead of displaying a stale but apparently live screen. Use `terminate` for the dead peer.
        // melhor que manter o socket: o navegador reconecta em segundos e rebusca,
        // enquanto um socket morto faz a tela parecer viva e parada.
        ws.terminate();
      }
    }, TIMEOUT_PONG_MS);
    aguardandoPong.unref?.();
  }, INTERVALO_PING_MS);
  relogio.unref?.();

  const encerrar = (): void => {
    clearInterval(relogio);
    if (aguardandoPong) clearTimeout(aguardandoPong);
    void desligar();
  };
  ws.on('close', encerrar);
  ws.on('error', encerrar);
}

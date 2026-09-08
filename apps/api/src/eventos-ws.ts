import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { hashDoToken, origemPermitida, origensPermitidas, resolverSessao } from '@pipe/autenticacao';
import { ASSUNTOS } from '@pipe/contracts';
import type { Assunto, EventoDoServidor, Inscricao, QuadroDeControle } from '@pipe/contracts';
import { bancoDono } from './banco.js';
import { lerCookie } from './sessao.js';
import { registrar } from './tempo-real.js';
import type { Conexao } from './tempo-real.js';

/**
 * O canal de tempo real do navegador — `GET /v1/eventos` com `Upgrade: websocket`.
 *
 * Fala o contrato de `packages/contracts/src/eventos.ts` sem inventar nada: o cliente
 * manda uma `Inscricao`, o servidor responde `QuadroDeControle` e a partir daí só
 * trafega `EventoDoServidor` — `{assunto, id, em}`, e nunca o registro em si.
 *
 * ## Autenticação: a MESMA sessão do cookie
 *
 * Nada de token de socket. O `Upgrade` carrega o cookie `pipe_sessao`, ele é resolvido
 * pelo mesmo `resolverSessao` do `GuardaSessao`, e o tenant sai DALI. Sessão ausente,
 * vencida ou forjada recebe `401` e o socket nunca chega a existir.
 *
 * ## Por que o `Origin` é conferido à mão
 *
 * **CORS não vale para WebSocket.** O navegador não faz preflight nem bloqueia
 * handshake por origem, então um site qualquer poderia abrir um socket para a nossa
 * API e o navegador anexaria o cookie da vítima — é o *cross-site WebSocket
 * hijacking*. O `SameSite=Lax` do nosso cookie já barra isso hoje, mas ele é uma
 * defesa que mora em OUTRO arquivo e pode mudar sem ninguém lembrar daqui. A conferência
 * de `Origin` contra `PIPE_ORIGENS` é a mesma lista fechada do CORS, e é barata.
 */

/** `CONNECTION_TEST_INTERVAL` da Blip: 15 s entre verificações de conexão. */
const INTERVALO_PING_MS = Number(process.env['PIPE_WS_PING_MS'] ?? 15_000);
/** `PING_TIMEOUT` da Blip: 5 s para o `pong` voltar. */
const TIMEOUT_PONG_MS = Number(process.env['PIPE_WS_PONG_TIMEOUT_MS'] ?? 5_000);
/**
 * `MAX_PING_RETRIES` da Blip: 1. Ou seja, o servidor tolera UM ping sem resposta e
 * derruba no segundo. Derrubar cedo é melhor que manter um socket morto: o navegador
 * reconecta em segundos e rebusca, enquanto um socket zumbi faz a tela parecer viva
 * e parada — que é o pior dos dois.
 */
const MAX_PINGS_SEM_RESPOSTA = Number(process.env['PIPE_WS_MAX_PINGS'] ?? 1);

const CAMINHO = '/v1/eventos';

function ehAssunto(valor: unknown): valor is Assunto {
  return typeof valor === 'string' && (ASSUNTOS as readonly string[]).includes(valor);
}

function enviar(socket: WebSocket, dado: EventoDoServidor | QuadroDeControle): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(dado));
}

function recusar(socket: Duplex, status: number, motivo: string): void {
  socket.write(`HTTP/1.1 ${status} ${motivo}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export interface CanalDeEventos {
  fechar: () => Promise<void>;
}

export function ligarCanalDeEventos(servidor: Server): CanalDeEventos {
  const wss = new WebSocketServer({ noServer: true });

  const aoSubir = (requisicao: IncomingMessage, socket: Duplex, cabeca: Buffer): void => {
    // `void` porque `upgrade` não espera promessa; toda falha vira recusa explícita.
    void (async () => {
      try {
        const url = new URL(requisicao.url ?? '/', 'http://interno');
        if (url.pathname !== CAMINHO) return recusar(socket, 404, 'Not Found');

        const origem = requisicao.headers.origin;
        // Sem `Origin` é cliente que não é navegador (teste, integração). O cookie
        // continua sendo exigido logo abaixo, então isto não abre porta.
        if (origem && !origemPermitida(origem.replace(/\/$/, ''), origensPermitidas())) {
          return recusar(socket, 403, 'Forbidden');
        }

        const token = lerCookie(requisicao.headers.cookie, 'pipe_sessao');
        if (!token) return recusar(socket, 401, 'Unauthorized');
        const sessao = await resolverSessao(bancoDono(), hashDoToken(token));
        if (!sessao) return recusar(socket, 401, 'Unauthorized');

        wss.handleUpgrade(requisicao, socket, cabeca, (ws) => {
          void aoConectar(ws, sessao.tenantId, sessao.usuarioId);
        });
      } catch {
        recusar(socket, 500, 'Internal Server Error');
      }
    })();
  };

  servidor.on('upgrade', aoSubir);

  return {
    fechar: async () => {
      servidor.off('upgrade', aoSubir);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

async function aoConectar(ws: WebSocket, tenantId: string, usuarioId: string): Promise<void> {
  // Começa sem assunto nenhum: o socket existe, mas não entrega nada até a `Inscricao`
  // chegar. Assinar tudo por padrão seria entregar o que a tela não pediu.
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
   * **Os ouvintes ANTES de qualquer `await`.**
   *
   * `registrar` fala com o Redis, e um `await` entre o socket abrir e o
   * `on('message')` existir é uma janela em que a `Inscricao` do cliente se perde: o
   * `ws` não guarda evento sem ouvinte. O navegador manda a inscrição no mesmo
   * instante em que o socket abre, então ele cairia justamente nessa janela e ficaria
   * pendurado para sempre — socket vivo, nenhum evento, e nada no log.
   */
  // Resolve quando o processo já está assinado no canal do tenant. A confirmação ao
  // cliente espera por ela: dizer "inscrito" antes de o registro existir abriria uma
  // janela — curta, mas real — em que a tela se acha ligada e um evento publicado
  // naquele instante não chega a ninguém.
  let registrado: () => void;
  const pronto = new Promise<void>((resolve) => {
    registrado = resolve;
  });

  ws.on('message', (cru) => {
    let pedido: Inscricao;
    try {
      pedido = JSON.parse(String(cru)) as Inscricao;
    } catch {
      enviar(ws, { tipo: 'recusado', motivo: 'assunto_desconhecido' });
      return;
    }
    // Qualquer mensagem do cliente conta como sinal de vida: navegador que fala está
    // vivo mesmo que o `pong` tenha se perdido.
    respondeu();

    const pedidos = Array.isArray(pedido.assuntos) ? pedido.assuntos : [];
    if (pedidos.length === 0 || !pedidos.every(ehAssunto)) {
      enviar(ws, { tipo: 'recusado', motivo: 'assunto_desconhecido' });
      return;
    }

    // **O `tenant_id` NÃO vem da inscrição** — sai da sessão, e já saiu. O cliente só
    // escolhe ASSUNTO; de quem ele ouve não é escolha dele.
    assuntos.clear();
    for (const assunto of pedidos) assuntos.add(assunto);
    // A partir daqui a conexão já entrega — mas só confirma depois de registrada.
    void pronto.then(() => enviar(ws, { tipo: 'inscrito', assuntos: [...assuntos] }));
  });
  ws.on('pong', respondeu);

  const conexao: Conexao = {
    tenantId,
    usuarioId,
    assuntos,
    entregar: (evento) => enviar(ws, evento),
  };
  const desligar = await registrar(conexao);

  // O socket pode ter morrido durante o `await` do Redis. Sem isto, a conexão ficaria
  // no registro para sempre e o processo escreveria em quem já foi embora.
  if (ws.readyState === ws.CLOSING || ws.readyState === ws.CLOSED) {
    await desligar();
    return;
  }
  registrado!();

  const relogio = setInterval(() => {
    // Dois pings de propósito: o do protocolo, que o navegador responde sozinho e
    // mantém proxies de olho aberto, e o do CONTRATO, que a tela usa para saber que
    // a conexão está viva sem depender de API de baixo nível.
    ws.ping();
    enviar(ws, { tipo: 'ping' });

    if (aguardandoPong) clearTimeout(aguardandoPong);
    aguardandoPong = setTimeout(() => {
      semResposta += 1;
      if (semResposta > MAX_PINGS_SEM_RESPOSTA) {
        // Socket zumbi: o cliente sumiu sem fechar. `terminate` e não `close`, porque
        // `close` espera um handshake que este par já não responde. Derrubar cedo é
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

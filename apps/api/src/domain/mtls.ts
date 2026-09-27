import https from 'node:https';
import { sql } from 'drizzle-orm';
import { decifrar } from '@pipe/db';
import { keyring, noTenant } from '../database.js';
import { confirmarUrlSegura } from './management/integrations.js';

/**
 * Outbound mTLS: Pipe presents the customer's certificate when Pipe calls that customer's addresses; Pipe is the TLS client, not a server demanding certificates. This mirrors the `/mtls` setup in `referencias-blip/pesquisa/blip-certificados-mtls.md`: a `.pfx` is bound to hosts and presented on outbound calls. `webhooks-saida.ts` and the Integrations Test button use `chamarComMtls`; a future Builder `ProcessHttp` action can use `chamarComMtls(tenantId, url, ...)` when `dominio/fluxo.ts` supports it. Match hostname and port, ignoring URL path. Without a certificate use a normal call; if two certificates match, use the most recently registered. Cache each tenant's host index for `TTL_INDICE_MS` and each certificate's `https.Agent` until `esquecerCertificadosMtls` invalidates it on create/delete in `gestao/certificados.ts`. Certificates are immutable, so short TTL bounds stale indexes across API instances. Decrypted `.pfx` exists only in the Agent and never in logs. Registered `hosts` may include `https://api.cliente.com.br` or `https://api.cliente.com.br:8443/x`; match `hostname` plus port, and keep decrypted bytes inside the `Agent`.
 */

const TTL_INDICE_MS = Number(process.env['PIPE_MTLS_TTL_INDICE_MS'] ?? 60_000);

interface HostComCertificado {
  certificadoId: string;
  hostname: string;
  /** An empty string means the default port 443, as in `URL.port`. The stored form is `''` for that default port. */
  porta: string;
}

interface IndiceDoTenant {
  lidoEm: number;
  hosts: HostComCertificado[];
}

const indexByTenant = new Map<string, IndiceDoTenant>();
const agentByCertificate = new Map<string, https.Agent>();

/** Reduce a registered `certificado_mtls_host` URL to hostname and port; ignore invalid URLs, which should not exist. Match the `hostname` and port. */
function hostDe(certificadoId: string, url: string): HostComCertificado | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return { certificadoId, hostname: u.hostname, porta: u.port };
  } catch {
    return null;
  }
}

async function indiceDe(tenantId: string): Promise<IndiceDoTenant> {
  const guardado = indexByTenant.get(tenantId);
  if (guardado && Date.now() - guardado.lidoEm < TTL_INDICE_MS) return guardado;

  const linhas = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ certificado_id: string; host: string }>(sql`
      select h.certificado_id, h.host
        from certificado_mtls_host h
        join certificado_mtls c on c.id = h.certificado_id
       where c.tenant_id = ${tenantId}::uuid
         and c.arquivo_cifrado is not null
       order by c.criado_em desc, h.criado_em asc
    `);
    return rows;
  });
  const hosts: HostComCertificado[] = [];
  for (const linha of linhas) {
    const host = hostDe(linha.certificado_id, linha.host);
    if (host) hosts.push(host);
  }

  // Discard an agent whose certificate disappeared from the host index, possibly deleted in another instance.
  // ou entre um TTL e outro) morre aqui, junto com os sockets dele.
  if (guardado) {
    const vivos = new Set(hosts.map((h) => h.certificadoId));
    for (const antigo of guardado.hosts) {
      if (!vivos.has(antigo.certificadoId)) descartarAgente(antigo.certificadoId);
    }
  }

  const indice = { lidoEm: Date.now(), hosts };
  indexByTenant.set(tenantId, indice);
  return indice;
}

function descartarAgente(certificadoId: string): void {
  const agente = agentByCertificate.get(certificadoId);
  if (!agente) return;
  agente.destroy();
  agentByCertificate.delete(certificadoId);
}

async function agenteDoCertificado(tenantId: string, certificadoId: string): Promise<https.Agent | null> {
  const guardado = agentByCertificate.get(certificadoId);
  if (guardado) return guardado;

  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ fileEncrypted: string | null; senha_cifrada: string | null }>(sql`
      select arquivo_cifrado as "fileEncrypted", senha_cifrada from certificado_mtls
       where id = ${certificadoId}::uuid and tenant_id = ${tenantId}::uuid
       limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha?.fileEncrypted || !linha.senha_cifrada) return null;

  // Decrypt here and pass to the Agent. If the key was removed from the keyring, `decifrar` throws `SegredoErro`, which delivery records like any other error.
  // chave saiu do chaveiro — e a entrega registra o erro como qualquer outro.
  const chaves = keyring();
  const agente = new https.Agent({
    pfx: Buffer.from(decifrar(linha.fileEncrypted, chaves), 'base64'),
    passphrase: decifrar(linha.senha_cifrada, chaves),
    keepAlive: true,
  });
  agentByCertificate.set(certificadoId, agente);
  return agente;
}

/**
 * Return an `https.Agent` with this URL's client certificate, or null when the host has no certificate or the URL is not HTTPS; then use a normal request. Return `null` for the ordinary request path.
 */
export async function agenteMtlsPara(tenantId: string, url: string): Promise<https.Agent | null> {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return null;
  }
  if (alvo.protocol !== 'https:') return null;

  const indice = await indiceDe(tenantId);
  const casa = indice.hosts.find((h) => h.hostname === alvo.hostname && h.porta === alvo.port);
  if (!casa) return null;
  return agenteDoCertificado(tenantId, casa.certificadoId);
}

/**
 * Forget a tenant's host index and all or one of its certificate agents; without a tenant, clear everything.
 */
export function esquecerCertificadosMtls(tenantId?: string, certificadoId?: string): void {
  if (!tenantId) {
    for (const id of [...agentByCertificate.keys()]) descartarAgente(id);
    indexByTenant.clear();
    return;
  }
  const indice = indexByTenant.get(tenantId);
  if (indice) {
    for (const h of indice.hosts) {
      if (!certificadoId || h.certificadoId === certificadoId) descartarAgente(h.certificadoId);
    }
  }
  if (certificadoId) descartarAgente(certificadoId);
  indexByTenant.delete(tenantId);
}

/* ------------------------------------------------------------- chamada */

export interface PedidoDeSaida {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  /** Caller's own deadline (a flow action's time limit), combined with `timeoutMs`. */
  signal?: AbortSignal;
}

function prazoDo(pedido: PedidoDeSaida): AbortSignal {
  const tempo = AbortSignal.timeout(pedido.timeoutMs);
  return pedido.signal ? AbortSignal.any([tempo, pedido.signal]) : tempo;
}

/** Response subset shared by requests with and without a certificate, as needed for delivery. This is the subset of `Response` used by delivery. */
export interface RespostaDeSaida {
  ok: boolean;
  status: number;
  texto: () => Promise<string>;
}

/** Use `https.request` with the agent; global `fetch` (undici) does not accept `https.Agent`. */
function pedirComAgente(url: string, pedido: PedidoDeSaida, agente: https.Agent): Promise<RespostaDeSaida> {
  return new Promise((resolver, rejeitar) => {
    const request = https.request(
      url,
      {
        method: pedido.metodo ?? 'POST',
        headers: pedido.headers,
        agent: agente,
        signal: prazoDo(pedido),
      },
      (resposta) => {
        const pedacos: Buffer[] = [];
        resposta.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
        resposta.on('error', rejeitar);
        resposta.on('end', () => {
          const status = resposta.statusCode ?? 0;
          resolver({
            ok: status >= 200 && status < 300,
            status,
            texto: async () => Buffer.concat(pedacos).toString('utf8'),
          });
        });
      },
    );
    request.on('error', rejeitar);
    request.end(pedido.body);
  });
}

/** Redirect hops followed by `chamarComMtls`, each one re-validated by `confirmarUrlSegura`. */
export const MAX_REDIRECIONAMENTOS = 3;

/**
 * Call a customer URL for the tenant, presenting its certificate if the host has one and using ordinary `fetch` otherwise. This is the single outbound path for webhooks, flow HTTP (ProcessHttp, SendMessageFromHttp, HTTP content), script `request.fetchAsync` and the Builder test run.
 * Callers validate the first URL; `fetch` must never follow a redirect on its own (a public URL answering `302 Location: http://169.254.169.254/...` would bypass that check), so every hop goes through `confirmarUrlSegura` here, at most `MAX_REDIRECIONAMENTOS` times. `https.request` (mTLS path) never follows redirects.
 */
export async function chamarComMtls(
  tenantId: string,
  url: string,
  pedido: PedidoDeSaida,
): Promise<RespostaDeSaida> {
  let atual = url;
  let p = pedido;
  const prazo = prazoDo(pedido);
  for (let salto = 0; ; salto += 1) {
    const agente = await agenteMtlsPara(tenantId, atual);
    if (agente) return pedirComAgente(atual, p, agente);

    const resposta = await fetch(atual, {
      method: p.metodo ?? 'POST',
      headers: p.headers,
      body: p.body,
      signal: prazo,
      redirect: 'manual',
    });
    const destino = resposta.headers.get('location');
    if (resposta.status < 300 || resposta.status >= 400 || !destino) {
      return { ok: resposta.ok, status: resposta.status, texto: () => resposta.text() };
    }
    await resposta.body?.cancel();
    if (salto >= MAX_REDIRECIONAMENTOS) {
      throw new Error(`A URL redirecionou mais de ${MAX_REDIRECIONAMENTOS} vezes.`);
    }
    const proxima = new URL(destino, atual);
    confirmarUrlSegura(proxima.toString());
    // Like `fetch`: 303, or 301/302 after a POST, continue as GET without a body; credentials
    // never follow the request to another origin.
    const metodo =
      resposta.status === 303 || ((resposta.status === 301 || resposta.status === 302) && (p.metodo ?? 'POST') === 'POST')
        ? 'GET'
        : (p.metodo ?? 'POST');
    const mesmaOrigem = proxima.origin === new URL(atual).origin;
    const headers = mesmaOrigem
      ? p.headers
      : Object.fromEntries(
          Object.entries(p.headers).filter(([k]) => !['authorization', 'cookie', 'proxy-authorization'].includes(k.toLowerCase())),
        );
    p = { ...p, metodo, headers };
    if (metodo === 'GET') delete p.body;
    atual = proxima.toString();
  }
}

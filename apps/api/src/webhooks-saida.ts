import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { decifrar, estaCifrado } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import type { TYPES_AUTHENTICATION_WEBHOOK } from '@pipe/db/schema';
import { keyring, noTenant } from './database.js';
import { chamarComMtls } from './domain/mtls.js';

/**
 * Outbound webhooks — `apis.md` §5.5.
 *
 * Signature `X-Pipe-Signature: sha256=HMAC-SHA256(secret, "<timestamp>.<body>")`, with `X-Pipe-Timestamp` and `X-Pipe-Delivery` alongside it. The timestamp goes **inside** what gets signed: signing only the body makes replay free, one of the two gaps found in Chatwoot. The other — optional secret — the schema already closes: `webhook_saida.segredo` is `not null`.
 *
 * `entrega_webhook` stores the attempt and the error. A webhook that fails silently has the same disease as a send that fails silently.
 *
 * The POST itself goes out through `chamarComMtls` (`dominio/mtls.ts`): if the webhook's host has a certificate registered under `/contrato/certificados`, Pipe presents it (mTLS); if not, it's the usual `fetch`.
 */

export const EVENTOS = [
  'conversa.criada',
  'conversa.estado_alterado',
  'conversa.atribuida',
  'conversa.encerrada',
  'mensagem.criada',
  'mensagem.estado_entrega_alterado',
  'contato.criado',
  /** A Meta recategorizou um modelo de mensagem (`dominio/whatsapp/eventos-de-modelo.ts`). */
  'modelo.recategorizado',
  /** The SLA clock (`dominio/gestao/sla-motor.ts`) reached the alert/breach threshold. */
  'sla.alertou',
  'sla.estourou',
] as const;

export type EventoWebhook = (typeof EVENTOS)[number];

export const MAX_TENTATIVAS_WEBHOOK = Number(process.env['PIPE_WEBHOOK_MAX_TENTATIVAS'] ?? 5);
const TIME_LIMIT_MS = Number(process.env['PIPE_WEBHOOK_TIMEOUT_MS'] ?? 5_000);
/** Recommended tolerance for the consumer, published alongside the payload. */
export const TOLERANCIA_REPLAY_SEG = 300;

export function assinar(secret: string, timestamp: string, corpo: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${corpo}`).digest('hex')}`;
}

/**
 * Authentication and custom headers — the origin's "Configurações de autenticação" and "Cabeçalhos customizados" (migration 0036, `dominio/gestao/integracoes.ts`). Lives here because both the real delivery (`entregarUma`) and the "Testar" button (`testarWebhook`, in the domain) build the SAME request.
 */
export type TypeAuthenticationWebhook = (typeof TYPES_AUTHENTICATION_WEBHOOK)[number];

/** The reserved headers: no custom header may use one of these names. */
export const CABECALHOS_RESERVADOS = [
  'content-type',
  'x-pipe-signature',
  'x-pipe-timestamp',
  'x-pipe-delivery',
  'authorization',
] as const;

export interface CabecalhoCustomizado {
  key: string;
  value: string;
}

/** Already decrypted — what comes out of the database, ready to build the request. */
export interface AuthenticationOfOutputDecrypted {
  type: TypeAuthenticationWebhook;
  user?: string | null;
  senha?: string | null;
  oauth2UrlAuthorization?: string | null;
  oauth2ClientId?: string | null;
  oauth2ClientSecret?: string | null;
}

/**
 * `POST` `client_credentials` — no token cache (ponytail: one token per delivery; cache by `(tenantId, webhookId)` until it expires, if delivery volume calls for it).
 */
async function obterTokenOAuth2(auth: AuthenticationOfOutputDecrypted): Promise<string> {
  const corpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: auth.oauth2ClientId ?? '',
    client_secret: auth.oauth2ClientSecret ?? '',
  });
  const resposta = await fetch(auth.oauth2UrlAuthorization ?? '', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: corpo,
    signal: AbortSignal.timeout(TIME_LIMIT_MS),
  });
  if (!resposta.ok) throw new Error(`token OAuth2: HTTP ${resposta.status}`);
  const json = (await resposta.json().catch(() => null)) as { access_token?: unknown } | null;
  if (!json || typeof json.access_token !== 'string' || !json.access_token) {
    throw new Error('token OAuth2: resposta sem access_token');
  }
  return json.access_token;
}

/** Null means no `Authorization` header (`nenhuma` authentication). The sentinel is `null`. */
export async function headerOfAuthorization(
  auth: AuthenticationOfOutputDecrypted,
): Promise<string | null> {
  if (auth.type === 'basica') {
    const par = `${auth.user ?? ''}:${auth.senha ?? ''}`;
    return `Basic ${Buffer.from(par, 'utf8').toString('base64')}`;
  }
  if (auth.type === 'oauth2_client_credentials') {
    return `Bearer ${await obterTokenOAuth2(auth)}`;
  }
  return null;
}

/**
 * Write custom headers first and reserved headers afterward, overriding them so customer-supplied values cannot disable signatures. Registration also rejects reserved names; this is defense in depth.
 */
export function cabecalhosDeSaida(params: {
  secret: string;
  timestamp: string;
  body: string;
  deliveryId: string;
  customizados?: readonly CabecalhoCustomizado[] | null;
}): Record<string, string> {
  const cabecalhos: Record<string, string> = {};
  for (const { key, value } of params.customizados ?? []) cabecalhos[key] = value;
  cabecalhos['content-type'] = 'application/json';
  cabecalhos['x-pipe-signature'] = assinar(params.secret, params.timestamp, params.body);
  cabecalhos['x-pipe-timestamp'] = params.timestamp;
  cabecalhos['x-pipe-delivery'] = params.deliveryId;
  return cabecalhos;
}

/**
 * Decrypt a `webhook_saida` secret field. Pass null, empty, or non-Pipe-envelope text through, as in tolerant `dominio/twenty.ts`, so data written directly to the database does not break delivery. Pass `null` through unchanged.
 */
export function decryptSecretOfWebhook(valor: string | null): string | null {
  if (!valor) return null;
  return estaCifrado(valor) ? decifrar(valor, keyring()) : valor;
}

/**
 * Enqueue an event for every subscribed active outbound webhook inside the transaction that wrote the underlying fact. Commit both fact and event together or neither; delivery happens separately after the transaction.
 */
export async function emitir(
  tx: TransactionPipe,
  tenantId: string,
  evento: EventoWebhook,
  data: Record<string, unknown>,
): Promise<number> {
  const { rows: assinantes } = await tx.execute<{ id: string }>(sql`
    select id from webhook_saida
     where ativo and ${evento} = any(eventos)
  `);
  if (assinantes.length === 0) return 0;

  const payload = {
    event: evento,
    delivery_id: randomUUID(),
    tenant_id: tenantId,
    occurred_at: new Date().toISOString(),
    data: data,
  };

  // Run serially: `Promise.all` inside this transaction can lose the session's tenant context.
  for (const assinante of assinantes) {
    await tx.execute(sql`
      insert into entrega_webhook (tenant_id, webhook_id, evento, payload, estado)
      values (${tenantId}, ${assinante.id}, ${evento}, ${JSON.stringify(payload)}::jsonb, 'pendente')
    `);
  }
  return assinantes.length;
}

export interface ResultDeliveryWebhook {
  id: string;
  state: 'entregue' | 'pendente' | 'descartada';
  error?: string;
}

type LineDelivery = {
  id: string;
  url: string;
  secret: string;
  payload: unknown;
  tentativas: number;
  typeAuthentication: TypeAuthenticationWebhook;
  authenticationUser: string | null;
  authenticationPassword: string | null;
  oauth2UrlAuthorization: string | null;
  oauth2_client_id: string | null;
  oauth2_client_secret: string | null;
  cabecalhos: CabecalhoCustomizado[] | null;
};

/**
 * Drains a tenant's pending deliveries. Called after the operation's commit and also by periodic sweep — delivery must happen even if the process that created it died between the commit and the POST.
 */
export async function entregarPendentes(
  tenantId: string,
  lote = 20,
): Promise<ResultDeliveryWebhook[]> {
  const pendentes = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineDelivery>(sql`
      with alvo as (
        select id from entrega_webhook
         where estado = 'pendente'
           and (proxima_tentativa_em is null or proxima_tentativa_em <= now())
         order by criado_em
         limit ${lote}
         for update skip locked
      )
      select e.id, w.url, w.segredo as "secret", e.payload, e.tentativas,
             w.tipo_autenticacao as "typeAuthentication", w.autenticacao_usuario as "authenticationUser",
             w.autenticacao_senha as "authenticationPassword",
             w.oauth2_url_autorizacao as "oauth2UrlAuthorization", w.oauth2_client_id, w.oauth2_client_secret,
             w.cabecalhos
        from entrega_webhook e
        join webhook_saida w on w.id = e.webhook_id
       where e.id in (select id from alvo)
    `);
    return rows;
  });

  const resultados: ResultDeliveryWebhook[] = [];
  // // Serially: each delivery opens its own transaction to record the result.
  for (const linha of pendentes) {
    resultados.push(await entregarUma(tenantId, linha));
  }
  return resultados;
}

async function entregarUma(
  tenantId: string,
  linha: LineDelivery,
): Promise<ResultDeliveryWebhook> {
  const corpo = JSON.stringify(linha.payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const deliveryId = randomUUID();
  const tentativas = linha.tentativas + 1;

  let error: string | null = null;
  try {
    const cabecalhos = cabecalhosDeSaida({
      secret: linha.secret,
      timestamp,
      body: corpo,
      deliveryId: deliveryId,
      customizados: linha.cabecalhos,
    });
    const authorization = await headerOfAuthorization({
      type: linha.typeAuthentication,
      user: linha.authenticationUser,
      senha: decryptSecretOfWebhook(linha.authenticationPassword),
      oauth2UrlAuthorization: linha.oauth2UrlAuthorization,
      oauth2ClientId: linha.oauth2_client_id,
      oauth2ClientSecret: decryptSecretOfWebhook(linha.oauth2_client_secret),
    });
    if (authorization) cabecalhos['authorization'] = authorization;

    const resposta = await chamarComMtls(tenantId, linha.url, {
      metodo: 'POST',
      headers: cabecalhos,
      body: corpo,
      timeoutMs: TIME_LIMIT_MS,
    });
    if (!resposta.ok) error = `HTTP ${resposta.status}`;
  } catch (falha) {
    error = (falha as Error).message;
  }

  if (!error) {
    await noTenant(tenantId, async (tx) => {
      await tx.execute(sql`
        update entrega_webhook
           set estado = 'entregue', tentativas = ${tentativas}, ultimo_erro = null,
               proxima_tentativa_em = null
         where id = ${linha.id}
      `);
    });
    return { id: linha.id, state: 'entregue' };
  }

  // // `descartada`, not `falhou`: the `entrega_webhook` status catalog distinguishes
  // // "still retrying" from "gave up," and the screen needs to tell the two apart.
  const desistiu = tentativas >= MAX_TENTATIVAS_WEBHOOK;
  const esperaSeg = Math.min(3600, 10 * 2 ** (tentativas - 1));
  await noTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      update entrega_webhook
         set estado = ${desistiu ? 'descartada' : 'pendente'},
             tentativas = ${tentativas},
             ultimo_erro = ${error},
             proxima_tentativa_em = ${
               desistiu ? null : sql`now() + ${`${esperaSeg} seconds`}::interval`
             }
       where id = ${linha.id}
    `);
  });
  return { id: linha.id, state: desistiu ? 'descartada' : 'pendente', error };
}

/**
 * Triggers the drain without holding the HTTP response. A failure here must not become an error for whoever sent the message — the `entrega_webhook` row stays pending and the sweep picks it up later.
 */
export function drenarEmSegundoPlano(tenantId: string): void {
  void entregarPendentes(tenantId).catch((error: unknown) => {
    console.error('[webhook-saida] falhou ao drenar', error);
  });
}

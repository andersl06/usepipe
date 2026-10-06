import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { cifrarConfig, registrarAuditoria } from '@pipe/db';
import { databaseOwner, forgetChannel, keyring, noTenant, resolveChannel } from '../database.js';
import type { ChannelResolved } from '../database.js';
import { PipeError } from '../errors.js';
import { enqueueInbound } from '../queues.js';

/**
 * Pipe Chat: an embeddable web chat. The channel is a `canal` row of type 'widget'; its `config` holds the public `widgetKey`, the encrypted `widgetSecret` (visitor token HMAC key), the exact-match `allowedOrigins` list and the `greeting`. No table is added: visitors are stateless (id + HMAC token) and their identity lives in `contato_identidade` like any other channel.
 */

export const MAX_TEXT_LENGTH = 2000;
export const MAX_ROWS_POLL = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[0-9a-f]{32}$/;

export interface WidgetChannelVisible {
  id: string;
  name: string;
  active: boolean;
  widgetKey: string;
  allowedOrigins: string[];
  greeting: string;
  createdAt: string;
}

export interface WidgetMessage {
  id: string;
  direction: 'in' | 'out';
  text: string;
  createdAt: string;
}

type Row = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date | string;
  config: Record<string, unknown> | null;
};

function invalid(message: string): PipeError {
  return new PipeError(422, 'configuration_invalid', message);
}

/** Normalize one origin to `scheme://host[:port]` in lowercase; anything else is rejected. */
export function normalizeOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalid(`A origem "${raw}" não é válida. Use o formato https://exemplo.com.`);
  }
  const hasPath =
    url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '';
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || hasPath) {
    throw invalid(`A origem "${raw}" não é válida. Use o formato https://exemplo.com.`);
  }
  return `${url.protocol}//${url.host}`.toLowerCase();
}

function normalizeOrigins(list: unknown): string[] {
  if (!Array.isArray(list)) throw invalid('As origens permitidas devem ser uma lista.');
  const out = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string') throw invalid('As origens permitidas devem ser texto.');
    if (item.trim() === '') continue;
    out.add(normalizeOrigin(item));
  }
  return [...out];
}

function visible(row: Row): WidgetChannelVisible {
  const config = row.config ?? {};
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    widgetKey: typeof config['widgetKey'] === 'string' ? config['widgetKey'] : '',
    allowedOrigins: Array.isArray(config['allowedOrigins']) ? (config['allowedOrigins'] as string[]) : [],
    greeting: typeof config['greeting'] === 'string' ? config['greeting'] : '',
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

const COLUMNS = sql`id, nome as "name", ativo as "active", criado_em as "createdAt", config`;

export async function listWidgetChannels(tenantId: string): Promise<WidgetChannelVisible[]> {
  return noTenant(tenantId, async (tx) =>
    (await tx.execute<Row>(sql`select ${COLUMNS} from canal where tipo = 'widget' order by criado_em`)).rows.map(visible),
  );
}

export async function createWidgetChannel(
  tenantId: string,
  userId: string,
  input: { name?: string; allowedOrigins?: unknown; greeting?: string },
): Promise<WidgetChannelVisible> {
  const name = (input.name ?? '').trim() || 'Pipe Chat';
  const config = {
    widgetKey: randomBytes(16).toString('hex'),
    widgetSecret: randomBytes(32).toString('hex'),
    allowedOrigins: normalizeOrigins(input.allowedOrigins ?? []),
    greeting: (input.greeting ?? '').trim().slice(0, MAX_TEXT_LENGTH),
    title: name,
  };
  const row = await noTenant(tenantId, async (tx) => {
    const created = (
      await tx.execute<{ id: string }>(sql`
        insert into canal (tenant_id, tipo, nome, config)
        values (${tenantId}::uuid, 'widget', ${name}, ${JSON.stringify(cifrarConfig(config, keyring()))}::jsonb)
        returning id
      `)
    ).rows[0]!;
    await tx.execute(sql`
      insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
      values (${tenantId}::uuid, ${created.id}::uuid, ${name}, null)
    `);
    await registrarAuditoria(tx, tenantId, {
      ator: { type: 'usuario', id: userId },
      acao: 'criou',
      objetoTipo: 'canal',
      objetoId: created.id,
      depois: { id: created.id, tipo: 'widget' },
    });
    return (await tx.execute<Row>(sql`select ${COLUMNS} from canal where id = ${created.id}::uuid`)).rows[0]!;
  });
  return visible(row);
}

export async function updateWidgetChannel(
  tenantId: string,
  userId: string,
  id: string,
  input: { name?: string; allowedOrigins?: unknown; greeting?: string; rotateKey?: boolean },
): Promise<WidgetChannelVisible> {
  if (!UUID.test(id)) throw PipeError.naoEncontrado('Canal');
  const row = await noTenant(tenantId, async (tx) => {
    const current = (
      await tx.execute<Row>(sql`select ${COLUMNS} from canal where id = ${id}::uuid and tipo = 'widget' for update`)
    ).rows[0];
    if (!current) throw PipeError.naoEncontrado('Canal');
    const config: Record<string, unknown> = { ...(current.config ?? {}) };
    if (input.allowedOrigins !== undefined) config['allowedOrigins'] = normalizeOrigins(input.allowedOrigins);
    if (input.greeting !== undefined) config['greeting'] = String(input.greeting).trim().slice(0, MAX_TEXT_LENGTH);
    if (input.rotateKey) config['widgetKey'] = randomBytes(16).toString('hex');
    const name = input.name?.trim() || current.name;
    config['title'] = name;
    // The stored widgetSecret is already ciphertext; cifrarConfig leaves encrypted values untouched.
    const updated = (
      await tx.execute<Row>(sql`
        update canal set nome = ${name}, config = ${JSON.stringify(cifrarConfig(config, keyring()))}::jsonb, atualizado_em = now()
         where id = ${id}::uuid
        returning ${COLUMNS}
      `)
    ).rows[0]!;
    await registrarAuditoria(tx, tenantId, {
      ator: { type: 'usuario', id: userId },
      acao: 'alterou',
      objetoTipo: 'canal',
      objetoId: id,
      depois: { id, tipo: 'widget', rotateKey: input.rotateKey === true },
    });
    return updated;
  });
  forgetChannel(id);
  return visible(row);
}

/**
 * Resolve the channel from the public key. The tenant is derived only from this lookup, never from client input. ponytail: this is an unindexed jsonb scan over widget channels; add an expression index on `config->>'widgetKey'` (needs a reserved migration number) when widget channels grow.
 */
export async function resolveWidgetChannel(key: string): Promise<ChannelResolved | null> {
  if (!KEY.test(key)) return null;
  const { rows } = await databaseOwner().execute<{ id: string }>(sql`
    select id from canal
     where tipo = 'widget' and ativo and config->>'widgetKey' = ${key}
     limit 1
  `);
  const found = rows[0];
  if (!found) return null;
  const channel = await resolveChannel(found.id);
  if (!channel || !channel.active || channel.type !== 'widget') return null;
  // A cached copy may predate a key rotation; confirm the key still matches.
  return channel.config['widgetKey'] === key ? channel : null;
}

/** The decrypted HMAC secret of a resolved widget channel; it stays inside the process. */
export function visitorSecretOf(channel: ChannelResolved): string {
  const secret = channel.config['widgetSecret'];
  if (typeof secret !== 'string' || secret === '') throw PipeError.naoEncontrado('Canal');
  return secret;
}

export function visitorToken(secret: string, visitorId: string): string {
  return createHmac('sha256', secret).update(visitorId).digest('hex');
}

export function validVisitor(secret: string, visitorId: unknown, token: unknown): visitorId is string {
  if (typeof visitorId !== 'string' || !UUID.test(visitorId) || typeof token !== 'string') return false;
  const expected = Buffer.from(visitorToken(secret, visitorId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Push a visitor text through the shared inbound path as a Meta-shaped payload. */
export async function widgetInbound(
  channel: ChannelResolved,
  visitorId: string,
  name: string | null,
  text: string,
): Promise<void> {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: channel.id,
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ wa_id: visitorId, profile: { name: name ?? 'Visitante' } }],
              messages: [
                {
                  from: visitorId,
                  id: randomUUID(),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  await enqueueInbound(channel.id, payload);
}

export async function widgetMessagesSince(
  channel: ChannelResolved,
  visitorId: string,
  since: string | null,
): Promise<WidgetMessage[]> {
  const sinceDate = since ? new Date(since) : null;
  if (sinceDate && Number.isNaN(sinceDate.getTime())) {
    throw new PipeError(400, 'since_invalido', 'Parâmetro since inválido.');
  }
  const filterSince = sinceDate ? sql`and date_trunc('milliseconds', m.criada_em) > ${sinceDate.toISOString()}::timestamptz` : sql``;
  const { rows } = await noTenant(channel.tenantId, (tx) =>
    tx.execute<{ id: string; direction: string; type: string; content: string | null; createdAt: Date | string }>(sql`
      select m.id, m.direcao as direction, m.tipo as type, m.conteudo as content, m.criada_em as "createdAt"
        from mensagem m
        left join conversa cv on cv.id = m.conversa_id
        left join execucao_fluxo ex on ex.id = m.execucao_id
        join inbox i on i.id = coalesce(cv.inbox_id, ex.inbox_id)
        join contato_identidade ci on ci.contato_id = coalesce(cv.contato_id, ex.contato_id)
       where i.canal_id = ${channel.id}::uuid
         and ci.canal_tipo = 'widget' and ci.identificador = ${visitorId}
         ${filterSince}
       order by m.criada_em asc, m.id asc
       limit ${MAX_ROWS_POLL}
    `),
  );
  return rows.map((r) => ({
    id: r.id,
    direction: r.direction === 'entrada' ? 'in' : 'out',
    text: r.type === 'texto' ? (r.content ?? '') : `[${r.type}]`,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

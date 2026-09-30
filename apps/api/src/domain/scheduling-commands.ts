import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { CommandRequest } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../errors.js';
import { cancelDelayedJob, scheduleDelayedJob } from '../delayed-jobs.js';
import { createLinkTracked, urlCurtaDe } from './rastreador-de-cliques.js';

/**
 * P7 commands in Blip's shape (`{method, status, type, resource}`, or `status: 'failure'` with a
 * LIME reason: 64 invalid argument, 67 not found, 1 general error):
 *
 * - `postmaster@scheduler.msging.net`: `set /schedules`, `get/delete /schedules/{id}`. The message
 *   fires later through the normal outbound path (`scheduled-messages.ts`), to a contact or to a
 *   distribution list (`{lista}@broadcast.msging.net`).
 * - `postmaster@broadcast.msging.net`: `/lists`, `/lists/{lista}`, `/lists/{lista}/recipients[/{id}]`
 *   over the same `lista_distribuicao` tables `ManageList` writes.
 * - `postmaster@analytics.msging.net`: `set /event-track`, `get /event-track[/{category}]`.
 * - `postmaster@clicktracker.msging.net`: `set /entrypoint/encode`, a short link from the click tracker.
 *
 * `get /tunnels/{id}` needs no tenant data and runs in the engine (`@pipe/core` builder-commands).
 * The handlers only parse and answer; where the data lands is `MessagingEffects`: real tables in
 * production, memory in the Builder's test run (a test never schedules a real message).
 */

export const SCHEDULED_MESSAGE_JOB = 'mensagem-agendada';

const BROADCAST_DOMAIN = 'broadcast.msging.net';

export type ScheduleState = 'agendada' | 'executada' | 'cancelada' | 'falhou';

export interface ScheduledMessage {
  messageId: string;
  name: string | null;
  to: string;
  type: string;
  content: unknown;
  when: Date;
}

export interface EventCount {
  storageDate: string;
  category: string;
  action: string;
  count: number;
}

/** Where the P7 commands read and write. Each call runs in the command's transaction (a savepoint). */
export interface MessagingEffects {
  /** The execution's contact, the default `to` of a scheduled message. */
  contactIdentity: string;
  schedule(tx: TransactionPipe, message: ScheduledMessage): Promise<void>;
  scheduleOf(tx: TransactionPipe, messageId: string): Promise<(ScheduledMessage & { state: ScheduleState }) | null>;
  /** False when there is no such schedule. */
  cancelSchedule(tx: TransactionPipe, messageId: string): Promise<boolean>;
  lists(tx: TransactionPipe): Promise<string[]>;
  createList(tx: TransactionPipe, name: string): Promise<void>;
  deleteList(tx: TransactionPipe, name: string): Promise<boolean>;
  /** The list's recipient identities; null when the list does not exist. */
  recipients(tx: TransactionPipe, name: string): Promise<string[] | null>;
  /** Creates the list when missing, as `ManageList` does; false when the identity is no contact. */
  addRecipient(tx: TransactionPipe, name: string, identity: string): Promise<boolean>;
  removeRecipient(tx: TransactionPipe, name: string, identity: string): Promise<boolean>;
  trackEvent(tx: TransactionPipe, event: { category: string; action: string; extras: Record<string, unknown> }): Promise<void>;
  eventCategories(tx: TransactionPipe): Promise<string[]>;
  eventCounts(
    tx: TransactionPipe,
    category: string,
    range: { start: Date | null; end: Date | null; take: number },
  ): Promise<EventCount[]>;
  /** The click tracker's short URL for `url`. */
  encodeLink(tx: TransactionPipe, url: string, name: string): Promise<string>;
}

export type SchedulingCommandResponse = Record<string, unknown>;
export type SchedulingCommandHandler = (
  tx: TransactionPipe,
  request: CommandRequest,
  effects: MessagingEffects,
) => Promise<SchedulingCommandResponse>;

const success = (method: string, type?: string, resource?: unknown): SchedulingCommandResponse =>
  type === undefined ? { method, status: 'success' } : { method, status: 'success', type, resource };

const failure = (method: string, code: 1 | 64 | 67, description: string): SchedulingCommandResponse => ({
  method,
  status: 'failure',
  reason: { code, description },
});

const collection = (method: string, itemType: string, items: unknown[]): SchedulingCommandResponse =>
  success(method, 'application/vnd.lime.collection+json', { total: items.length, itemType, items });

/** A resource Blip sends as JSON may arrive as text after variable replacement. */
function parsed(resource: unknown): unknown {
  if (typeof resource !== 'string') return resource;
  try {
    return JSON.parse(resource);
  } catch {
    return resource;
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** `clientes@broadcast.msging.net` → `clientes`; the Pipe list is stored by its bare name. */
export function listName(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf('@');
  return at > 0 && trimmed.slice(at + 1).toLowerCase() === BROADCAST_DOMAIN ? trimmed.slice(0, at) : trimmed;
}

export const listIdentity = (name: string): string => `${name}@${BROADCAST_DOMAIN}`;

/** `true` when `to` names a distribution list rather than a contact. */
export const isBroadcastAddress = (to: string): boolean => to.trim().toLowerCase().endsWith(`@${BROADCAST_DOMAIN}`);

/** The identity in a `set .../recipients` resource: plain text or `{identity}`. */
function identityOf(resource: unknown): string {
  const value = parsed(resource);
  return text(value) || text(asRecord(value)?.['identity']);
}

const SCHEDULE_STATUS: Record<ScheduleState, string> = {
  agendada: 'scheduled',
  executada: 'executed',
  cancelada: 'canceled',
  falhou: 'failed',
};

async function setSchedule(tx: TransactionPipe, request: CommandRequest, effects: MessagingEffects): Promise<SchedulingCommandResponse> {
  const method = request.command.method;
  const body = asRecord(parsed(request.resource));
  const message = asRecord(parsed(body?.['message']));
  if (!body || !message) return failure(method, 64, "O agendamento exige 'message' e 'when'.");
  const when = new Date(text(body['when']));
  if (Number.isNaN(when.getTime())) return failure(method, 64, `A data '${text(body['when'])}' do agendamento é inválida.`);
  const type = text(message['type']);
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(type)) return failure(method, 64, 'O tipo da mensagem agendada é inválido.');
  const content = message['content'];
  if (content === undefined || content === null || content === '') return failure(method, 64, 'A mensagem agendada não tem conteúdo.');
  const messageId = text(message['id']) || randomUUID();
  if (messageId.length > 200) return failure(method, 64, 'O id da mensagem agendada passa de 200 caracteres.');
  if (JSON.stringify(content).length > 65_536) return failure(method, 64, 'A mensagem agendada passa de 64 KB.');
  await effects.schedule(tx, {
    messageId,
    name: text(body['name']) || null,
    to: text(message['to']) || effects.contactIdentity,
    type,
    content,
    when,
  });
  return success(method);
}

async function scheduleItem(tx: TransactionPipe, request: CommandRequest, effects: MessagingEffects): Promise<SchedulingCommandResponse> {
  const { method, params } = request.command;
  const id = params['id'] ?? '';
  if (method === 'delete') {
    return (await effects.cancelSchedule(tx, id)) ? success(method) : failure(method, 67, `O agendamento '${id}' não existe.`);
  }
  const schedule = await effects.scheduleOf(tx, id);
  if (!schedule) return failure(method, 67, `O agendamento '${id}' não existe.`);
  return success(method, 'application/vnd.iris.schedule+json', {
    name: schedule.name ?? undefined,
    when: schedule.when.toISOString(),
    message: { id: schedule.messageId, to: schedule.to, type: schedule.type, content: schedule.content },
    status: SCHEDULE_STATUS[schedule.state],
  });
}

async function lists(tx: TransactionPipe, request: CommandRequest, effects: MessagingEffects): Promise<SchedulingCommandResponse> {
  const method = request.command.method;
  if (method === 'get') return collection(method, 'application/vnd.lime.identity', (await effects.lists(tx)).map(listIdentity));
  const value = parsed(request.resource);
  const name = listName(text(value) || text(asRecord(value)?.['identity']));
  if (!name) return failure(method, 64, "Informe a 'identity' da lista.");
  await effects.createList(tx, name);
  return success(method);
}

async function listItem(tx: TransactionPipe, request: CommandRequest, effects: MessagingEffects): Promise<SchedulingCommandResponse> {
  const { method, params } = request.command;
  const name = listName(params['list'] ?? '');
  if (method === 'delete') {
    return (await effects.deleteList(tx, name)) ? success(method) : failure(method, 67, `A lista '${name}' não existe.`);
  }
  const members = await effects.recipients(tx, name);
  return members === null
    ? failure(method, 67, `A lista '${name}' não existe.`)
    : success(method, 'application/vnd.iris.distribution-list+json', { identity: listIdentity(name) });
}

function page<T>(items: T[], query: URLSearchParams): T[] {
  const skip = Math.max(0, Number(query.get('$skip')) || 0);
  const take = Math.min(500, Math.max(1, Number(query.get('$take')) || 100));
  return items.slice(skip, skip + take);
}

async function recipients(tx: TransactionPipe, request: CommandRequest, effects: MessagingEffects): Promise<SchedulingCommandResponse> {
  const { method, params, query } = request.command;
  const name = listName(params['list'] ?? '');
  if (method === 'get') {
    const members = await effects.recipients(tx, name);
    if (members === null) return failure(method, 67, `A lista '${name}' não existe.`);
    const items = page(members, query);
    return success(method, 'application/vnd.lime.collection+json', {
      total: members.length,
      itemType: 'application/vnd.lime.identity',
      items,
    });
  }
  const identity = identityOf(request.resource);
  if (!identity) return failure(method, 64, 'Informe a identidade do destinatário.');
  return (await effects.addRecipient(tx, name, identity))
    ? success(method)
    : failure(method, 67, `O contato '${identity}' não existe neste Pipe.`);
}

async function recipientItem(tx: TransactionPipe, request: CommandRequest, effects: MessagingEffects): Promise<SchedulingCommandResponse> {
  const { method, params } = request.command;
  const name = listName(params['list'] ?? '');
  const identity = params['id'] ?? '';
  if (method === 'delete') {
    return (await effects.removeRecipient(tx, name, identity))
      ? success(method)
      : failure(method, 67, `O destinatário '${identity}' não está na lista '${name}'.`);
  }
  const members = await effects.recipients(tx, name);
  const local = identity.split('@')[0]!;
  const found = members?.find((member) => member === identity || member.split('@')[0] === local);
  return found ? success(method, 'application/vnd.lime.identity', found) : failure(method, 67, `O destinatário '${identity}' não está na lista '${name}'.`);
}

async function eventTrack(tx: TransactionPipe, request: CommandRequest, effects: MessagingEffects): Promise<SchedulingCommandResponse> {
  const method = request.command.method;
  if (method === 'get') {
    const categories = await effects.eventCategories(tx);
    return collection(method, 'application/vnd.iris.eventTrack+json', categories.map((category) => ({ category })));
  }
  const body = asRecord(parsed(request.resource));
  const category = text(body?.['category']);
  const action = text(body?.['action']);
  if (!category || !action) return failure(method, 64, "O evento exige 'category' e 'action'.");
  if (category.length > 200 || action.length > 200) return failure(method, 64, 'Categoria e ação vão até 200 caracteres.');
  const extras = asRecord(parsed(body?.['extras'])) ?? {};
  if (JSON.stringify(extras).length > 16_384) return failure(method, 64, "Os 'extras' do evento passam de 16 KB.");
  await effects.trackEvent(tx, { category, action, extras });
  return success(method);
}

function dateOf(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function eventTrackCategory(tx: TransactionPipe, request: CommandRequest, effects: MessagingEffects): Promise<SchedulingCommandResponse> {
  const { method, params, query } = request.command;
  const end = dateOf(query.get('endDate'));
  // An end date names a whole day, as in Blip's reports.
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(query.get('endDate') ?? '')) end.setUTCDate(end.getUTCDate() + 1);
  const items = await effects.eventCounts(tx, params['category'] ?? '', {
    start: dateOf(query.get('startDate')),
    end,
    take: Math.min(500, Math.max(1, Number(query.get('$take')) || 100)),
  });
  return collection(method, 'application/vnd.iris.eventTrack+json', items);
}

async function encodeLink(tx: TransactionPipe, request: CommandRequest, effects: MessagingEffects): Promise<SchedulingCommandResponse> {
  const method = request.command.method;
  const value = parsed(request.resource);
  const body = asRecord(value);
  const url = text(value) || ['url', 'uri', 'link', 'originalUrl', 'destination'].map((key) => text(body?.[key])).find(Boolean) || '';
  if (!url) return failure(method, 64, 'Informe a URL a encurtar.');
  try {
    return success(method, 'text/plain', await effects.encodeLink(tx, url, text(body?.['name']) || 'Link do bot'));
  } catch (error) {
    if (error instanceof PipeError) return failure(method, 64, error.message);
    throw error;
  }
}

/** Handlers by `COMMAND_ROUTES` name; `executeCommand` runs them with the caller's `MessagingEffects`. */
export const SCHEDULING_COMMANDS: Readonly<Record<string, SchedulingCommandHandler>> = Object.freeze({
  'scheduler.schedules.set': setSchedule,
  'scheduler.schedules.item': scheduleItem,
  'broadcast.lists': lists,
  'broadcast.lists.item': listItem,
  'broadcast.recipients': recipients,
  'broadcast.recipients.item': recipientItem,
  'analytics.eventTrack': eventTrack,
  'analytics.eventTrack.category': eventTrackCategory,
  'clicktracker.encode': encodeLink,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The tenant's contact a LIME identity names: Pipe's contact id, or a channel identity
 * (`5511…@wa.gw.msging.net`) by its channel identifier or phone digits.
 */
export async function contactOfIdentity(tx: TransactionPipe, tenantId: string, identity: string): Promise<string | null> {
  const local = identity.includes('@') ? identity.slice(0, identity.indexOf('@')) : identity;
  if (UUID.test(local)) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from contato where id = ${local}::uuid and tenant_id = ${tenantId}::uuid limit 1
    `);
    return rows[0]?.id ?? null;
  }
  const digits = local.replace(/\D/g, '');
  if (!local.trim()) return null;
  const { rows } = await tx.execute<{ id: string }>(sql`
    select contato_id as id from contato_identidade
     where tenant_id = ${tenantId}::uuid and identificador = ${local}
    union all
    select id from contato
     where tenant_id = ${tenantId}::uuid and ${digits} <> '' and regexp_replace(coalesce(telefone_e164, ''), '\\D', '', 'g') = ${digits}
    limit 1
  `);
  return rows[0]?.id ?? null;
}

/** A contact's LIME identity: its WhatsApp identity when it has one, its Pipe id otherwise. */
const IDENTITY_OF_CONTACT = (contactId: ReturnType<typeof sql>) => sql`
  coalesce(
    (select ci.identificador || '@wa.gw.msging.net' from contato_identidade ci
      where ci.contato_id = ${contactId} and ci.canal_tipo = 'whatsapp_cloud' order by ci.criado_em limit 1),
    ${contactId}::text
  )
`;

/**
 * Production effects: the tenant's tables, inside the inbound transaction. A new schedule also
 * wakes a delayed job at its time; the row stays authoritative (see `delayed-jobs.ts`).
 */
export function databaseMessagingEffects(scope: { tenantId: string; flowId: string; contactId: string }): MessagingEffects {
  const { tenantId, flowId, contactId } = scope;
  const listIdOf = async (tx: TransactionPipe, name: string): Promise<string | null> => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from lista_distribuicao where tenant_id = ${tenantId}::uuid and nome = ${name} limit 1
    `);
    return rows[0]?.id ?? null;
  };
  const createList = async (tx: TransactionPipe, name: string): Promise<string> => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into lista_distribuicao (tenant_id, nome, atualizado_em)
      values (${tenantId}, ${name}, now())
      on conflict (tenant_id, nome) do update set atualizado_em = now()
      returning id
    `);
    return rows[0]!.id;
  };
  return {
    contactIdentity: contactId,
    schedule: async (tx, message) => {
      const { rows } = await tx.execute<{ id: string }>(sql`
        insert into agendamento_mensagem (tenant_id, fluxo_id, contato_id, mensagem_id, nome, destino, tipo, conteudo, quando)
        values (
          ${tenantId}, ${flowId}::uuid, ${contactId}::uuid, ${message.messageId}, ${message.name}, ${message.to},
          ${message.type}, ${JSON.stringify(message.content)}::jsonb, ${message.when}
        )
        on conflict (tenant_id, mensagem_id) do update
           set nome = excluded.nome, destino = excluded.destino, tipo = excluded.tipo, conteudo = excluded.conteudo,
               quando = excluded.quando, fluxo_id = excluded.fluxo_id, contato_id = excluded.contato_id,
               estado = 'agendada', resultado = null, executado_em = null, atualizado_em = now()
        returning id
      `);
      await scheduleDelayedJob(SCHEDULED_MESSAGE_JOB, rows[0]!.id, message.when, { tenantId, scheduleId: rows[0]!.id });
    },
    scheduleOf: async (tx, messageId) => {
      const { rows } = await tx.execute<{
        name: string | null;
        to: string;
        type: string;
        content: unknown;
        when: Date | string;
        state: ScheduleState;
      }>(sql`
        select nome as name, destino as "to", tipo as type, conteudo as content, quando as "when", estado as state
          from agendamento_mensagem where tenant_id = ${tenantId}::uuid and mensagem_id = ${messageId} limit 1
      `);
      const row = rows[0];
      return row ? { messageId, name: row.name, to: row.to, type: row.type, content: row.content, when: new Date(row.when), state: row.state } : null;
    },
    cancelSchedule: async (tx, messageId) => {
      const { rows } = await tx.execute<{ id: string; state: ScheduleState }>(sql`
        update agendamento_mensagem
           set estado = case when estado = 'agendada' then 'cancelada' else estado end, atualizado_em = now()
         where tenant_id = ${tenantId}::uuid and mensagem_id = ${messageId}
        returning id, estado as state
      `);
      if (rows[0]?.state === 'cancelada') await cancelDelayedJob(SCHEDULED_MESSAGE_JOB, rows[0].id);
      return rows.length > 0;
    },
    lists: async (tx) => {
      const { rows } = await tx.execute<{ nome: string }>(sql`
        select nome from lista_distribuicao where tenant_id = ${tenantId}::uuid order by nome
      `);
      return rows.map((row) => row.nome);
    },
    createList: async (tx, name) => {
      await createList(tx, name);
    },
    deleteList: async (tx, name) => {
      const { rows } = await tx.execute(sql`
        delete from lista_distribuicao where tenant_id = ${tenantId}::uuid and nome = ${name} returning id
      `);
      return rows.length > 0;
    },
    recipients: async (tx, name) => {
      const listId = await listIdOf(tx, name);
      if (!listId) return null;
      const { rows } = await tx.execute<{ identity: string }>(sql`
        select ${IDENTITY_OF_CONTACT(sql`c.contato_id`)} as identity
          from lista_distribuicao_contato c
         where c.tenant_id = ${tenantId}::uuid and c.lista_id = ${listId}::uuid
         order by c.criado_em, c.id
      `);
      return rows.map((row) => row.identity);
    },
    addRecipient: async (tx, name, identity) => {
      const member = await contactOfIdentity(tx, tenantId, identity);
      if (!member) return false;
      const listId = await createList(tx, name);
      await tx.execute(sql`
        insert into lista_distribuicao_contato (tenant_id, lista_id, contato_id, atualizado_em)
        values (${tenantId}, ${listId}::uuid, ${member}::uuid, now())
        on conflict (tenant_id, lista_id, contato_id) do nothing
      `);
      return true;
    },
    removeRecipient: async (tx, name, identity) => {
      const member = await contactOfIdentity(tx, tenantId, identity);
      const listId = await listIdOf(tx, name);
      if (!member || !listId) return false;
      const { rows } = await tx.execute(sql`
        delete from lista_distribuicao_contato
         where tenant_id = ${tenantId}::uuid and lista_id = ${listId}::uuid and contato_id = ${member}::uuid
        returning id
      `);
      return rows.length > 0;
    },
    trackEvent: async (tx, { category, action, extras }) => {
      await tx.execute(sql`
        insert into evento_rastreado (tenant_id, fluxo_id, contato_id, categoria, acao, extras)
        values (${tenantId}, ${flowId}::uuid, ${contactId}::uuid, ${category}, ${action}, ${JSON.stringify(extras)}::jsonb)
      `);
    },
    eventCategories: async (tx) => {
      const { rows } = await tx.execute<{ categoria: string }>(sql`
        select distinct categoria from evento_rastreado where tenant_id = ${tenantId}::uuid order by categoria limit 500
      `);
      return rows.map((row) => row.categoria);
    },
    eventCounts: async (tx, category, { start, end, take }) => {
      const { rows } = await tx.execute<{ day: string; action: string; count: number }>(sql`
        select to_char(date_trunc('day', em at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.000"Z"') as day,
               acao as action, count(*)::int as count
          from evento_rastreado
         where tenant_id = ${tenantId}::uuid and categoria = ${category}
           and (${start}::timestamptz is null or em >= ${start}::timestamptz)
           and (${end}::timestamptz is null or em < ${end}::timestamptz)
         group by 1, 2
         order by 1 desc, 2
         limit ${take}
      `);
      return rows.map((row) => ({ storageDate: row.day, category, action: row.action, count: row.count }));
    },
    encodeLink: async (tx, url, name) => {
      const { rows } = await tx.execute<{ codigo: string }>(sql`
        select codigo from link_rastreado
         where tenant_id = ${tenantId}::uuid and fluxo_id = ${flowId}::uuid and destino_url = ${url}
         order by criado_em limit 1
      `);
      if (rows[0]) return urlCurtaDe(rows[0].codigo);
      return (await createLinkTracked(tx, tenantId, flowId, { name, destination: url })).urlCurta;
    },
  };
}

export interface MemorySchedule extends ScheduledMessage {
  state: ScheduleState;
}

/**
 * The Builder test run's effects: nothing reaches a tenant table and no message is ever scheduled
 * for real. `lists` is the test run's own list store, shared with `ManageList`.
 */
export function memoryMessagingEffects(store: {
  contactIdentity: string;
  lists: Map<string, Set<string>>;
  schedules?: Map<string, MemorySchedule>;
  events?: { category: string; action: string; at: Date }[];
}): MessagingEffects {
  const schedules = (store.schedules ??= new Map());
  const events = (store.events ??= []);
  return {
    contactIdentity: store.contactIdentity,
    schedule: async (_tx, message) => {
      schedules.set(message.messageId, { ...message, state: 'agendada' });
    },
    scheduleOf: async (_tx, messageId) => schedules.get(messageId) ?? null,
    cancelSchedule: async (_tx, messageId) => {
      const schedule = schedules.get(messageId);
      if (!schedule) return false;
      if (schedule.state === 'agendada') schedule.state = 'cancelada';
      return true;
    },
    lists: async () => [...store.lists.keys()].sort(),
    createList: async (_tx, name) => {
      if (!store.lists.has(name)) store.lists.set(name, new Set());
    },
    deleteList: async (_tx, name) => store.lists.delete(name),
    recipients: async (_tx, name) => {
      const members = store.lists.get(name);
      return members ? [...members] : null;
    },
    addRecipient: async (_tx, name, identity) => {
      const members = store.lists.get(name) ?? new Set<string>();
      members.add(identity);
      store.lists.set(name, members);
      return true;
    },
    removeRecipient: async (_tx, name, identity) => store.lists.get(name)?.delete(identity) ?? false,
    trackEvent: async (_tx, { category, action }) => {
      events.push({ category, action, at: new Date() });
    },
    eventCategories: async () => [...new Set(events.map((event) => event.category))].sort(),
    eventCounts: async (_tx, category, { start, end, take }) => {
      const counts = new Map<string, EventCount>();
      for (const event of events) {
        if (event.category !== category || (start && event.at < start) || (end && event.at >= end)) continue;
        const day = new Date(Date.UTC(event.at.getUTCFullYear(), event.at.getUTCMonth(), event.at.getUTCDate())).toISOString();
        const key = `${day}|${event.action}`;
        const count = counts.get(key) ?? { storageDate: day, category, action: event.action, count: 0 };
        count.count += 1;
        counts.set(key, count);
      }
      return [...counts.values()].slice(0, take);
    },
    // A test run never registers a link: it answers with a placeholder short URL.
    encodeLink: async () => urlCurtaDe('teste'),
  };
}

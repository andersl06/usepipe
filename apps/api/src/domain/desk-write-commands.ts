import { sql } from 'drizzle-orm';
import { isClosedState, type ClosedBy, type CommandRequest, type ServicosDoMotor } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { ticketById, type CommandResponse } from './desk-commands.js';
import type { TicketEffects } from './engine-services.js';

/**
 * Desk write commands a bot sends to `postmaster@desk.msging.net`, in Blip's vocabulary (`team`
 * name, `ClosedClient`, `sequentialId`), applied through the same `TicketEffects` as the Pipe
 * ticket routes: production writes the real conversation (`transbordar`, `closeInTransaction`),
 * the Builder test run writes its memory. The bot only acts on its own conversation's ticket; an
 * empty id (an unset `{{ticketId}}`) means that ticket, as in Blip. Blip answers errors with a
 * LIME failure instead of throwing, and imported flows branch on `status`, so the expected
 * refusals here are failures too.
 */

export interface DeskWriteEffects {
  tickets: TicketEffects;
  recordSatisfactionAnswer?: ServicosDoMotor['recordSatisfactionAnswer'];
  /** Flow running the command: the queue named by `team` is looked up only inside it. */
  flowId?: string;
}

type DeskWriteHandler = (
  tx: TransactionPipe,
  tenantId: string,
  request: Pick<CommandRequest, 'resource' | 'command'>,
  effects: DeskWriteEffects,
) => Promise<CommandResponse>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET = 'application/vnd.iris.ticket+json';

/** LIME command reason codes. */
const INVALID_ARGUMENT = 64;
const NOT_ALLOWED = 66;
const NOT_FOUND = 67;

const success = (type?: string, resource?: unknown): CommandResponse =>
  type === undefined ? { method: 'set', status: 'success' } : { method: 'set', status: 'success', type, resource };

const failure = (code: number, description: string): CommandResponse => ({
  method: 'set',
  status: 'failure',
  reason: { code, description },
});

/** Blip closing statuses the bot may set, and who closed in Pipe's vocabulary. */
const CLOSED_BY: Readonly<Record<string, ClosedBy>> = {
  closedclient: 'cliente',
  closedclientinactivity: 'inatividade',
  closedattendant: 'atendente',
};

interface CurrentTicket {
  id: string;
  closed: boolean;
  /** A real conversation; false in a Builder test run. */
  real: boolean;
  ticket: Record<string, unknown>;
}

/** The ticket of the conversation the bot runs in, in Blip's shape. */
async function currentTicket(tx: TransactionPipe, tenantId: string, tickets: TicketEffects): Promise<CurrentTicket | null> {
  const row = (await tickets.get(tx)) as { id?: unknown; estado?: unknown } | null;
  if (!row || typeof row.id !== 'string') return null;
  const state = typeof row.estado === 'string' ? row.estado : '';
  if (UUID.test(row.id)) {
    const ticket = await ticketById(tx, tenantId, row.id);
    if (ticket) return { id: row.id, closed: ticket['closed'] === true, real: true, ticket };
  }
  const closed = isClosedState(state);
  return { id: row.id, closed, real: false, ticket: { id: row.id, status: state || 'Waiting', closed } };
}

/** Whether a ticket id from the flow (UUID, `sequentialId`, or empty) names the current ticket. */
function namesCurrent(given: string, current: CurrentTicket): boolean {
  if (given === '' || given === current.id || !current.real) return true;
  return /^\d+$/.test(given) && Number(given) === current.ticket['sequentialId'];
}

function bodyOf(resource: unknown): Record<string, unknown> {
  return resource && typeof resource === 'object' && !Array.isArray(resource) ? (resource as Record<string, unknown>) : {};
}

function textOf(body: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

/** The current ticket, or the failure to answer when the flow names another one. */
async function targetTicket(
  tx: TransactionPipe,
  tenantId: string,
  tickets: TicketEffects,
  given: string,
): Promise<CurrentTicket | CommandResponse> {
  const current = await currentTicket(tx, tenantId, tickets);
  if (!current) return failure(NOT_FOUND, 'A conversa deste bot não tem ticket.');
  if (!namesCurrent(given, current)) {
    return failure(NOT_ALLOWED, `O ticket '${given}' não é o atendimento desta conversa; o bot só altera o próprio ticket.`);
  }
  return current;
}

const isFailure = (value: CurrentTicket | CommandResponse): value is CommandResponse => 'status' in value;

async function answerWithTicket(tx: TransactionPipe, tenantId: string, tickets: TicketEffects): Promise<CommandResponse> {
  const after = await currentTicket(tx, tenantId, tickets);
  return success(TICKET, after?.ticket ?? null);
}

/**
 * `set /tickets[/{customerIdentity}]`: open the ticket (the handoff), leaving the queue to the
 * attendance rules like `ForwardToDesk`. The customer is always this conversation's contact.
 * A second call is a no-op (`enterQueue` enters once) and answers the same ticket.
 */
const createTicket: DeskWriteHandler = async (tx, tenantId, _request, { tickets }) => {
  // The ticket is born here when the bot has not handed off yet.
  const current = await currentTicket(tx, tenantId, tickets);
  if (!current?.closed) await tickets.enqueue(tx);
  return answerWithTicket(tx, tenantId, tickets);
};

/**
 * `set /tickets/change-status[-without-redirect]` `{id, status}`. `Waiting` enters the queue;
 * the closing statuses close with the matching actor. `Open` with `agentIdentity` would assign an
 * agent directly, which Pipe leaves to distribution, so it is refused.
 */
const changeStatus: DeskWriteHandler = async (tx, tenantId, { resource }, { tickets }) => {
  const body = bodyOf(resource);
  const status = textOf(body, 'status');
  if (!status) return failure(INVALID_ARGUMENT, "O comando change-status exige 'status'.");
  const target = await targetTicket(tx, tenantId, tickets, textOf(body, 'id'));
  if (isFailure(target)) return target;
  const closedBy = CLOSED_BY[status.toLowerCase()];
  if (closedBy) {
    if (target.closed) return failure(NOT_ALLOWED, 'O ticket já está encerrado.');
    await tickets.close(tx, closedBy);
  } else if (status.toLowerCase() === 'waiting') {
    if (target.closed) return failure(NOT_ALLOWED, 'O ticket já está encerrado.');
    await tickets.enqueue(tx);
  } else if (status.toLowerCase() === 'open') {
    return failure(NOT_ALLOWED, "O Pipe não atribui atendente por comando: a distribuição da fila escolhe quem atende.");
  } else {
    return failure(INVALID_ARGUMENT, `O status '${status}' não é um status de ticket aceito.`);
  }
  return answerWithTicket(tx, tenantId, tickets);
};

/**
 * `set /tickets/{id}/close` `{tags[, status]}`: finish the ticket as closed by the customer
 * (`status` may say `ClosedClientInactivity`/`ClosedAttendant`), applying the tags first. On a
 * ticket that is already closed only the tags apply, which is the Blip use (finish a ticket the
 * customer closed).
 */
const closeTicket: DeskWriteHandler = async (tx, tenantId, { resource, command }, { tickets }) => {
  const body = bodyOf(resource);
  const target = await targetTicket(tx, tenantId, tickets, command.params['id'] ?? '');
  if (isFailure(target)) return target;
  const status = textOf(body, 'status').toLowerCase();
  const closedBy = status ? CLOSED_BY[status] : 'cliente';
  if (!closedBy) return failure(INVALID_ARGUMENT, `O status '${textOf(body, 'status')}' não encerra um ticket.`);
  const tags = Array.isArray(body['tags']) ? body['tags'].filter((tag): tag is string => typeof tag === 'string' && tag !== '') : [];
  if (tags.length > 0) await tickets.changeTags(tx, tags);
  if (!target.closed) await tickets.close(tx, closedBy);
  return answerWithTicket(tx, tenantId, tickets);
};

/**
 * `set /tickets/{id}/transfer` `{team[, agentIdentity]}`: the queue by name (Blip's team is the
 * queue name). A requested agent is not forced: the queue's distribution assigns.
 */
const transferTicket: DeskWriteHandler = async (tx, tenantId, { resource, command }, { tickets, flowId }) => {
  const team = textOf(bodyOf(resource), 'team');
  if (!team) return failure(INVALID_ARGUMENT, "O comando de transferência exige 'team' (o nome da fila).");
  // Without a ticket yet (the bot still holds the contact) the transfer is the handoff that creates it.
  const given = command.params['id'] ?? '';
  if ((await currentTicket(tx, tenantId, tickets)) || given) {
    const target = await targetTicket(tx, tenantId, tickets, given);
    if (isFailure(target)) return target;
    if (target.closed) return failure(NOT_ALLOWED, 'O ticket já está encerrado.');
  }
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fila where tenant_id = ${tenantId}::uuid and ativa and fluxo_id = ${flowId ?? null}::uuid and lower(nome) = lower(${team})
     order by ordem, nome limit 1
  `);
  if (!rows[0]) return failure(NOT_FOUND, `A fila '${team}' não existe neste fluxo.`);
  await tickets.transfer(tx, rows[0].id);
  return answerWithTicket(tx, tenantId, tickets);
};

/**
 * `set /attendance-survey-answer`: the satisfaction answer, recorded like the native survey block
 * (`pesquisa_satisfacao_resposta`, 1-5 rating). Accepts the rating as `rating`/`score`/`value`/
 * `answer` (or a bare number) and the comment as `comment`/`text`.
 */
const surveyAnswer: DeskWriteHandler = async (_tx, _tenantId, { resource }, { recordSatisfactionAnswer }) => {
  const body = bodyOf(resource);
  const raw = typeof resource === 'number' || typeof resource === 'string' ? String(resource) : textOf(body, 'rating', 'score', 'value', 'answer');
  const rating = raw === '' ? null : Number(raw);
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
    return failure(INVALID_ARGUMENT, `A nota '${raw}' da pesquisa de satisfação deve ser um inteiro de 1 a 5.`);
  }
  const comment = textOf(body, 'comment', 'text') || null;
  const status = rating === null ? 'sem_resposta' : comment ? 'completa' : 'so_nota';
  await recordSatisfactionAnswer?.({ rating, comment, status });
  return success('application/json', { rating, comment });
};

/** Handlers by `COMMAND_ROUTES` name. */
export const DESK_WRITE_COMMANDS: Readonly<Record<string, DeskWriteHandler>> = {
  'desk.tickets.create': createTicket,
  'desk.tickets.changeStatus': changeStatus,
  'desk.tickets.close': closeTicket,
  'desk.tickets.transfer': transferTicket,
  'desk.attendanceSurveyAnswer': surveyAnswer,
};

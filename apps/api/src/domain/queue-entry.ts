import { sql } from 'drizzle-orm';
import {
  dentroDoExpediente,
  destinationQueue,
  type DeskUnavailableStatus,
  type HourAttendance,
  type OperadorDeRegra,
  type QueueRule,
  type QueueRuleContext,
} from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../errors.js';
import { teamsWithAgentsOnline } from './desk-commands.js';
import { distributeConversation } from './distribution.js';
import { registrarEvento } from './eventos.js';
import { evaluatePriority, loadRulesOfPriorityActive } from './management/priority-engine.js';

/**
 * The one way a conversation enters a queue: the bot handoff (`flow.ts` `transbordar`), a new
 * conversation without a bot (`inbound.ts`) and a Desk transfer to a queue (`conversation.ts`) all
 * come through here, so the queue rules, the priority rules, the `criada`/entry events and the
 * load-based distribution always run the same way.
 *
 * Destination: `chooseQueue`.
 */

export interface EnterQueueInput {
  tenantId: string;
  conversationId: string;
  /** Flow serving the conversation: rules, `teams`, default queue and priority are read only inside it. */
  flowId: string | null;
  /** Explicit destination; `null` lets the attendance rules decide. */
  queueId: string | null;
  /** Used when there is no explicit queue and no rule matches. */
  defaultQueueId: string | null;
  /** The customer message the rules and priority read (`mensagem`). */
  message: string | null;
  at: Date;
  /** `transferencia` records `transferida_fila` instead of `enfileirada`. */
  origin: 'fluxo' | 'entrada' | 'transferencia';
  /** Throw instead of entering "no queue" when neither explicit, rule nor default gives one (the bot handoff). */
  requireQueue?: boolean;
  userId?: string | null;
  eventData?: Record<string, unknown>;
  /** Caller writes that must precede the assignment (its own webhooks, the bot's note), given the chosen queue. */
  beforeDistribution?: (queueId: string | null) => Promise<void>;
  /** Contact extras that win over `contato.atributos` when choosing the queue (an isolated sub-bot's own extras). */
  extrasOverlay?: Record<string, unknown> | null;
}

export interface QueueEntry {
  /** False when the conversation already had a queue or an agent: nothing was written. */
  entered: boolean;
  queueId: string | null;
  /** Rule that chose the queue, when one did. */
  ruleId: string | null;
  /** Agent the distribution assigned, if any. */
  agentId: string | null;
}

type ContactRow = {
  priority: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  extras: Record<string, unknown> | null;
};

/** Active rules pointing at an active queue, with their conditions. Tenant filter explicit on top of RLS. */
export async function loadActiveQueueRules(tx: TransactionPipe, tenantId: string, flowId: string): Promise<QueueRule[]> {
  const { rows: heads } = await tx.execute<Omit<QueueRule, 'conditions'>>(sql`
    select r.id, r.nome as name, r.ordem as "order", r.combinador as combiner,
           r.fila_destino_id as "queueDestinationId", f.nome as "queueDestinationName", r.ativa as active
      from regra_fila r
      join fila f on f.id = r.fila_destino_id and f.tenant_id = r.tenant_id and f.ativa
             and f.fluxo_id = ${flowId}::uuid
     where r.tenant_id = ${tenantId}::uuid and r.ativa
  `);
  if (heads.length === 0) return [];
  const { rows: conditions } = await tx.execute<{ ruleId: string; field: string; operator: string; value: string | null }>(sql`
    select regra_id as "ruleId", campo as field, operador as operator, valor as value
      from regra_fila_condicao
     where tenant_id = ${tenantId}::uuid
       and regra_id in (${sql.join(heads.map((h) => sql`${h.id}::uuid`), sql`, `)})
  `);
  return heads.map((h) => ({
    ...h,
    conditions: conditions
      .filter((c) => c.ruleId === h.id)
      .map((c) => ({ field: c.field, operator: c.operator as OperadorDeRegra, value: c.value ?? '' })),
  }));
}

export interface QueueChoice {
  queueId: string | null;
  /** Rule that chose the queue, when one did. */
  ruleId: string | null;
}

const WRONG_FLOW_QUEUE = ['fila_de_outro_fluxo', 'A fila escolhida não pertence a este fluxo.'] as const;

/** Throws unless the queue is an active queue of this flow (tenant and flow filters explicit on top of RLS). */
export async function assertQueueOfFlow(tx: TransactionPipe, tenantId: string, flowId: string, queueId: string): Promise<void> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fila
     where id = ${queueId}::uuid and tenant_id = ${tenantId}::uuid and ativa and fluxo_id = ${flowId}::uuid
  `);
  if (!rows[0]) throw PipeError.request(...WRONG_FLOW_QUEUE);
}

/**
 * Where a conversation without a queue lands, always inside `flowId`: the explicit queue (ForwardToDesk
 * `filaId`, `/transfer`, Desk transfer; rejected when it belongs to another flow); else the first
 * attendance rule (`regra_fila`) matching the message and the contact; else the active queue named by
 * `contact.extras.teams` (Blip flows `MergeContact` the queue name there before the handoff); else the
 * flow default queue (`fluxo.fila_padrao_id`, then `inbox.fila_padrao_id` if it is a queue of the flow), else
 * the flow's first active queue. Inactive queues are never chosen.
 */
export async function chooseQueue(
  tx: TransactionPipe,
  tenantId: string,
  input: Pick<EnterQueueInput, 'flowId' | 'queueId' | 'defaultQueueId' | 'message'> & { contact: QueueRuleContext['contact'] },
): Promise<QueueChoice> {
  const { flowId } = input;
  if (!flowId) {
    if (input.queueId) throw PipeError.request(...WRONG_FLOW_QUEUE);
    return { queueId: null, ruleId: null };
  }
  if (input.queueId) {
    await assertQueueOfFlow(tx, tenantId, flowId, input.queueId);
    return { queueId: input.queueId, ruleId: null };
  }
  const match = destinationQueue(await loadActiveQueueRules(tx, tenantId, flowId), { message: input.message, contact: input.contact });
  if (match) return { queueId: match.queueDestinationId, ruleId: match.regraId };
  const teams = input.contact?.extras?.['teams'];
  if (typeof teams === 'string' && teams.trim()) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from fila
       where tenant_id = ${tenantId}::uuid and fluxo_id = ${flowId}::uuid and ativa and lower(nome) = lower(${teams.trim()})
       order by ordem limit 1
    `);
    if (rows[0]) return { queueId: rows[0].id, ruleId: null };
  }
  const { rows: flowRows } = await tx.execute<{ id: string | null }>(sql`
    select f.fila_padrao_id as id from fluxo f
      join fila q on q.id = f.fila_padrao_id and q.tenant_id = f.tenant_id and q.fluxo_id = f.id and q.ativa
     where f.id = ${flowId}::uuid and f.tenant_id = ${tenantId}::uuid
  `);
  if (flowRows[0]?.id) return { queueId: flowRows[0].id, ruleId: null };
  if (input.defaultQueueId) {
    const { rows: inboxRows } = await tx.execute<{ id: string }>(sql`
      select id from fila
       where id = ${input.defaultQueueId}::uuid and tenant_id = ${tenantId}::uuid and fluxo_id = ${flowId}::uuid and ativa
    `);
    if (inboxRows[0]) return { queueId: inboxRows[0].id, ruleId: null };
  }
  // No usable default: the flow's first active queue, so the ticket is still distributed, timed and closed.
  const { rows: firstRows } = await tx.execute<{ id: string }>(sql`
    select id from fila
     where tenant_id = ${tenantId}::uuid and fluxo_id = ${flowId}::uuid and ativa
     order by ordem, nome limit 1
  `);
  return { queueId: firstRows[0]?.id ?? null, ruleId: null };
}

/**
 * The flow serving a conversation: its queue's flow; else the flow of its latest execution; else the
 * live flow (or router) of the inbox channel; else null.
 */
export async function flowOfConversation(tx: TransactionPipe, tenantId: string, conversationId: string): Promise<string | null> {
  const first = async (query: ReturnType<typeof sql>) => (await tx.execute<{ id: string }>(query)).rows[0]?.id ?? null;
  return (
    (await first(sql`
      select f.fluxo_id as id from conversa c join fila f on f.id = c.fila_id
       where c.id = ${conversationId}::uuid and c.tenant_id = ${tenantId}::uuid
    `)) ??
    (await first(sql`
      select v.fluxo_id as id from execucao_fluxo e join fluxo_versao v on v.id = e.fluxo_versao_id
       where e.conversa_id = ${conversationId}::uuid and e.tenant_id = ${tenantId}::uuid
       order by e.iniciada_em desc limit 1
    `)) ??
    (await first(sql`
      select f.id from conversa c
        join inbox i on i.id = c.inbox_id
        join fluxo f on f.tenant_id = c.tenant_id and f.estado <> 'arquivado'
         and (f.canal_id = i.canal_id or exists (
           select 1 from roteador_canal rc where rc.roteador_id = f.id and rc.canal_id = i.canal_id))
       where c.id = ${conversationId}::uuid and c.tenant_id = ${tenantId}::uuid
       order by f.criado_em limit 1
    `))
  );
}

async function contactOfConversation(tx: TransactionPipe, tenantId: string, conversationId: string): Promise<ContactRow> {
  const { rows } = await tx.execute<ContactRow>(sql`
    select c.prioridade as priority, ct.nome as name, ct.email, ct.telefone_e164 as phone, ct.atributos as extras
      from conversa c
      left join contato ct on ct.id = c.contato_id
     where c.id = ${conversationId}::uuid and c.tenant_id = ${tenantId}::uuid
     limit 1
  `);
  const row = rows[0];
  if (!row) throw new Error(`A conversa '${conversationId}' não existe.`);
  return row;
}

function withOverlay<T extends { extras: Record<string, unknown> | null }>(row: T, overlay?: Record<string, unknown> | null): T {
  return overlay ? { ...row, extras: { ...(row.extras ?? {}), ...overlay } } : row;
}

/** `chooseQueue` for an existing conversation, reading its contact. */
export async function chooseQueueOfConversation(
  tx: TransactionPipe,
  input: Pick<EnterQueueInput, 'tenantId' | 'conversationId' | 'flowId' | 'queueId' | 'defaultQueueId' | 'message' | 'extrasOverlay'>,
): Promise<QueueChoice> {
  const contact = withOverlay(await contactOfConversation(tx, input.tenantId, input.conversationId), input.extrasOverlay);
  return chooseQueue(tx, input.tenantId, { ...input, contact });
}

/** `chooseQueue` before any ticket exists (the bot still holds the contact), reading the contact. */
export async function chooseQueueOfContact(
  tx: TransactionPipe,
  input: Pick<EnterQueueInput, 'tenantId' | 'flowId' | 'queueId' | 'defaultQueueId' | 'message' | 'extrasOverlay'> & { contactId: string },
): Promise<QueueChoice> {
  const { rows } = await tx.execute<Omit<ContactRow, 'priority'>>(sql`
    select nome as name, email, telefone_e164 as phone, atributos as extras
      from contato where id = ${input.contactId}::uuid and tenant_id = ${input.tenantId}::uuid limit 1
  `);
  return chooseQueue(tx, input.tenantId, { ...input, contact: rows[0] ? withOverlay(rows[0], input.extrasOverlay) : null });
}

/**
 * The first of `checks` that fails for the queue: a closed queue (its `horario_id` schedule,
 * exceptions included) before a queue with nobody online. A queue without a schedule uses the tenant's
 * regular schedule; with no regular schedule either it is always open (24h). No queue means nothing to check.
 */
export async function queueUnavailability(
  tx: TransactionPipe,
  tenantId: string,
  queueId: string | null,
  at: Date,
  checks: readonly DeskUnavailableStatus[],
): Promise<DeskUnavailableStatus | null> {
  if (!queueId) return null;
  if (checks.includes('OutOfAttendanceHour') && !dentroDoExpediente(at, await scheduleOfQueue(tx, tenantId, queueId))) {
    return 'OutOfAttendanceHour';
  }
  if (checks.includes('NoAgentAvailable')) {
    const online = (await teamsWithAgentsOnline(tx, tenantId)).find((t) => t.id === queueId)?.agentsOnline ?? 0;
    if (online === 0) return 'NoAgentAvailable';
  }
  return null;
}

/**
 * The schedule that governs a queue: its own `horario_id`, else the tenant's regular schedule (a deleted schedule
 * leaves `horario_id` null, so its queues fall back too). Null means no schedule at all: the queue works 24h.
 */
export async function scheduleOfQueue(tx: TransactionPipe, tenantId: string, queueId: string): Promise<HourAttendance | null> {
  const { rows } = await tx.execute<{ id: string; fuso: string }>(sql`
    select h.id, h.fuso from fila f
      join horario_atendimento h on h.tenant_id = f.tenant_id
       and h.id = coalesce(f.horario_id, (select r.id from horario_atendimento r where r.tenant_id = f.tenant_id and r.regular limit 1))
     where f.id = ${queueId}::uuid and f.tenant_id = ${tenantId}::uuid
  `);
  const head = rows[0];
  if (!head) return null;
  const { rows: faixas } = await tx.execute<{ diaSemana: number; inicio: string; fim: string }>(sql`
    select dia_semana as "diaSemana", inicio::text as inicio, fim::text as fim
      from horario_faixa where horario_id = ${head.id}::uuid and tenant_id = ${tenantId}::uuid
  `);
  const { rows: exceptions } = await tx.execute<{
    data: string;
    fechado: boolean;
    inicio: string | null;
    fim: string | null;
    inicioEm: string | null;
    fimEm: string | null;
  }>(sql`
    select data::text as data, fechado, inicio::text as inicio, fim::text as fim,
           inicio_em as "inicioEm", fim_em as "fimEm"
      from horario_excecao where horario_id = ${head.id}::uuid and tenant_id = ${tenantId}::uuid
  `);
  return {
    fuso: head.fuso,
    faixas,
    exceptions: exceptions.map((e) => ({
      ...e,
      inicioEm: e.inicioEm ? new Date(e.inicioEm) : null,
      fimEm: e.fimEm ? new Date(e.fimEm) : null,
    })),
  };
}

export async function enterQueue(tx: TransactionPipe, input: EnterQueueInput): Promise<QueueEntry> {
  const row = await contactOfConversation(tx, input.tenantId, input.conversationId);
  const { queueId, ruleId } = await chooseQueue(tx, input.tenantId, { ...input, contact: withOverlay(row, input.extrasOverlay) });
  if (!queueId && input.requireQueue) {
    throw new Error('Nenhuma regra de atendimento casou e a inbox do canal não tem fila padrão: não há para onde transferir.');
  }

  // `fila_id is null`: the entry happens once; a second handoff of the same conversation is a no-op.
  const { rows: updated } = await tx.execute<{ id: string }>(sql`
    update conversa set fila_id = ${queueId}, estado = 'Waiting', atualizado_em = now()
     where id = ${input.conversationId}::uuid and atendente_id is null and fila_id is null
    returning id
  `);
  if (!updated[0]) return { entered: false, queueId, ruleId, agentId: null };

  // An explicit priority (inherited on transfer, or set by the bot's `/priority`) wins over the rules.
  if (row.priority === 'sem_prioridade') {
    const priorityRules = await loadRulesOfPriorityActive(tx, input.flowId);
    const level = priorityRules.length
      ? evaluatePriority(priorityRules, {
          queueId,
          message: input.message,
          contact: { nome: row.name, email: row.email, telefone: row.phone, atributos: row.extras ?? {} },
        })
      : null;
    if (level) {
      await tx.execute(sql`update conversa set prioridade = ${level}, atualizado_em = now() where id = ${input.conversationId}::uuid`);
    }
  }

  const data = { ...input.eventData, ...(ruleId ? { regra_fila_id: ruleId } : {}) };
  const base = { tenantId: input.tenantId, conversationId: input.conversationId, at: input.at, queueId, data };
  await registrarEvento(tx, { ...base, type: 'criada', userId: input.userId ?? null });
  await registrarEvento(tx, {
    ...base,
    type: input.origin === 'transferencia' ? 'transferida_fila' : 'enfileirada',
    userId: input.userId ?? null,
  });

  await input.beforeDistribution?.(queueId);
  const agentId = queueId ? await distributeConversation(tx, input.tenantId, input.conversationId, queueId, input.at) : null;
  return { entered: true, queueId, ruleId, agentId };
}

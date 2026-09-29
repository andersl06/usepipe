import { sql } from 'drizzle-orm';
import { destinationQueue, type OperadorDeRegra, type QueueRule } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { distributeConversation } from './distribution.js';
import { registrarEvento } from './eventos.js';
import { evaluatePriority, loadRulesOfPriorityActive } from './management/priority-engine.js';

/**
 * The one way a conversation enters a queue: the bot handoff (`flow.ts` `transbordar`), a new
 * conversation without a bot (`inbound.ts`) and a Desk transfer to a queue (`conversation.ts`) all
 * come through here, so the queue rules, the priority rules, the `criada`/entry events and the
 * load-based distribution always run the same way.
 *
 * Destination: the explicit queue when the caller has one (ForwardToDesk `filaId`, `/transfer`,
 * Desk transfer); otherwise the first attendance rule (`regra_fila`) that matches the message and
 * the contact; otherwise the default queue (`inbox.fila_padrao_id`).
 */

export interface EnterQueueInput {
  tenantId: string;
  conversationId: string;
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
export async function loadActiveQueueRules(tx: TransactionPipe, tenantId: string): Promise<QueueRule[]> {
  const { rows: heads } = await tx.execute<Omit<QueueRule, 'conditions'>>(sql`
    select r.id, r.nome as name, r.ordem as "order", r.combinador as combiner,
           r.fila_destino_id as "queueDestinationId", f.nome as "queueDestinationName", r.ativa as active
      from regra_fila r
      join fila f on f.id = r.fila_destino_id and f.tenant_id = r.tenant_id and f.ativa
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

export async function enterQueue(tx: TransactionPipe, input: EnterQueueInput): Promise<QueueEntry> {
  const { rows } = await tx.execute<ContactRow>(sql`
    select c.prioridade as priority, ct.nome as name, ct.email, ct.telefone_e164 as phone, ct.atributos as extras
      from conversa c
      left join contato ct on ct.id = c.contato_id
     where c.id = ${input.conversationId}::uuid and c.tenant_id = ${input.tenantId}::uuid
     limit 1
  `);
  const row = rows[0];
  if (!row) throw new Error(`A conversa '${input.conversationId}' não existe.`);

  let queueId = input.queueId;
  let ruleId: string | null = null;
  if (!queueId) {
    const match = destinationQueue(await loadActiveQueueRules(tx, input.tenantId), {
      message: input.message,
      contact: { name: row.name, email: row.email, phone: row.phone, extras: row.extras },
    });
    queueId = match?.queueDestinationId ?? input.defaultQueueId;
    ruleId = match?.regraId ?? null;
  }
  if (!queueId && input.requireQueue) {
    throw new Error('Nenhuma regra de atendimento casou e a inbox do canal não tem fila padrão: não há para onde transferir.');
  }

  // `fila_id is null`: the entry happens once; a second handoff of the same conversation is a no-op.
  const { rows: updated } = await tx.execute<{ id: string }>(sql`
    update conversa set fila_id = ${queueId}, estado = 'na_fila', atualizado_em = now()
     where id = ${input.conversationId}::uuid and atendente_id is null and fila_id is null
    returning id
  `);
  if (!updated[0]) return { entered: false, queueId, ruleId, agentId: null };

  // An explicit priority (inherited on transfer, or set by the bot's `/priority`) wins over the rules.
  if (row.priority === 'sem_prioridade') {
    const priorityRules = await loadRulesOfPriorityActive(tx);
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

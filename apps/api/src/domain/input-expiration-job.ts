import { sql } from 'drizzle-orm';
import { databaseOwner, noTenant } from '../database.js';
import { registerDelayedJob } from '../delayed-jobs.js';
import { enfileirarProcessHttp, enqueueDelivery } from '../queues.js';
import { flowPublishedOfChannel, runFlowInInbound, type ResultOfFlow } from './flow.js';
import { INPUT_EXPIRATION_JOB } from './input-expiration.js';

/**
 * Input expiration (P8), firing side: when the block a contact waits in expires, run the engine
 * once with the block's expiration input (`inputExpirationMessage` in `@pipe/core`), through the
 * same `runFlowInInbound` path a customer message takes (replies to the outbox, steps in
 * `execucao_passo`, handoff rules, the next expiration armed by `syncInputExpiration`).
 *
 * At most once: the execution row is claimed (both columns cleared) only when it is still waiting,
 * already due and not changed by a later input. A job and the sweep racing on it, a customer answer
 * that arrived first, or a conversation now owned by a person all leave nothing to run. The input's
 * `id_provedor` carries the armed time, so `execucao_passo_entrada_uk` rejects a repeated firing.
 */

type ClaimedExpiration = {
  stateId: string;
  expiresAt: Date;
  conversationId: string;
  contactId: string;
  channelId: string;
  queueId: string | null;
  agentId: string | null;
  queueDefaultId: string | null;
  closed: boolean;
};

export async function fireInputExpiration(tenantId: string, executionId: string): Promise<ResultOfFlow | null> {
  const result = await noTenant(tenantId, async (tx) => {
    // `skip locked`: a customer message holding the row wins, and re-arms or clears it itself. The
    // 2 s tolerance absorbs a timer firing a hair early against the database clock.
    const { rows } = await tx.execute<{ stateId: string; expiresAt: Date | string }>(sql`
      update execucao_fluxo e
         set entrada_expira_em = null, entrada_expira_bloco = null
       where e.id = (
         select id from execucao_fluxo
          where id = ${executionId}::uuid and tenant_id = ${tenantId}::uuid and estado = 'aguardando'
            and entrada_expira_em <= now() + interval '2 seconds' and entrada_expira_bloco is not null
          for update skip locked
       )
         and e.entrada_expira_em <= now() + interval '2 seconds'
      returning e.entrada_expira_bloco as "stateId", e.entrada_expira_em as "expiresAt"
    `);
    if (!rows[0]) return null;
    const { rows: details } = await tx.execute<Omit<ClaimedExpiration, 'stateId' | 'expiresAt'>>(sql`
      select e.conversa_id as "conversationId", e.contato_id as "contactId", f.canal_id as "channelId",
             c.fila_id as "queueId", c.atendente_id as "agentId", i.fila_padrao_id as "queueDefaultId",
             c.estado = 'encerrada' as closed
        from execucao_fluxo e
        join conversa c on c.id = e.conversa_id
        join fluxo_versao v on v.id = e.fluxo_versao_id
        join fluxo f on f.id = v.fluxo_id
        join inbox i on i.id = c.inbox_id
       where e.id = ${executionId}::uuid
    `);
    const claimed: ClaimedExpiration | undefined = details[0]
      ? { ...details[0], stateId: rows[0].stateId, expiresAt: new Date(rows[0].expiresAt) }
      : undefined;
    // A closed conversation no longer talks to the bot; the next customer message opens a new one.
    if (!claimed || claimed.closed || !claimed.channelId || !claimed.contactId) return null;
    const publicado = await flowPublishedOfChannel(tx, claimed.channelId, claimed.contactId);
    if (!publicado) return null;
    return runFlowInInbound(tx, publicado, {
      tenantId,
      conversation: {
        id: claimed.conversationId,
        nova: false,
        queueId: claimed.queueId,
        agentId: claimed.agentId,
        queueDefaultId: claimed.queueDefaultId,
      },
      contactId: claimed.contactId,
      message: {
        id: null,
        idProvedor: `expiracao-entrada:${executionId}:${claimed.expiresAt.getTime()}`,
        type: 'texto',
        content: '',
      },
      inputExpiration: { stateId: claimed.stateId },
    });
  });
  if (!result) return null;
  // After commit, like an inbound message: nudge delivery and start a suspended ProcessHttp.
  if (result.respostas > 0) await enqueueDelivery({});
  if (result.processHttpId) await enfileirarProcessHttp({ tenantId, processoId: result.processHttpId });
  return result;
}

/** Overdue expirations of every tenant: a lost job, or one that fired before its row was committed. */
export async function dueInputExpirations(batch = 100): Promise<{ tenantId: string; executionId: string }[]> {
  const { rows } = await databaseOwner().execute<{ tenant_id: string; id: string }>(sql`
    select tenant_id, id from execucao_fluxo
     where entrada_expira_em <= now() and estado = 'aguardando'
     order by entrada_expira_em limit ${batch}
  `);
  return rows.map((row) => ({ tenantId: row.tenant_id, executionId: row.id }));
}

/** Wires the input-expiration kind into the delayed-job runner (`servidor.ts`). */
export function registerInputExpirations(): void {
  registerDelayedJob(INPUT_EXPIRATION_JOB, {
    run: async (data) => {
      await fireInputExpiration(String(data['tenantId']), String(data['executionId']));
    },
    sweep: async () => {
      const due = await dueInputExpirations();
      for (const { tenantId, executionId } of due) await fireInputExpiration(tenantId, executionId);
      return due.length;
    },
  });
}

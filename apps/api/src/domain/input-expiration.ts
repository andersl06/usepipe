import { sql } from 'drizzle-orm';
import { pendingInputExpiration } from '@pipe/core';
import type { FlowBlip } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { cancelDelayedJob, scheduleDelayedJob } from '../delayed-jobs.js';

/**
 * Input expiration (P8, Blip `input.expiration`): arming side. After each input the engine
 * processed for a conversation, `syncInputExpiration` records on the execution row when the block
 * the contact now waits in expires (`entrada_expira_em`, `entrada_expira_bloco`), or clears both
 * when the contact waits in no expiring block, and (re)schedules the delayed job keyed by the
 * execution. This is Blip's `InputExpirationHandler`: a user input cancels the pending expiration
 * and the processed input schedules the next one. The firing side is `input-expiration-job.ts`.
 */

export const INPUT_EXPIRATION_JOB = 'expiracao-entrada';

export async function syncInputExpiration(
  tx: TransactionPipe,
  tenantId: string,
  executionId: string,
  flow: FlowBlip,
  waitingStateId: string | null,
): Promise<void> {
  const pending = pendingInputExpiration(flow, waitingStateId);
  if (!pending) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      update execucao_fluxo set entrada_expira_em = null, entrada_expira_bloco = null
       where id = ${executionId} and entrada_expira_em is not null
      returning id
    `);
    if (rows[0]) await cancelDelayedJob(INPUT_EXPIRATION_JOB, executionId);
    return;
  }
  const runAt = new Date(Date.now() + pending.seconds * 1000);
  await tx.execute(sql`
    update execucao_fluxo set entrada_expira_em = ${runAt}, entrada_expira_bloco = ${pending.stateId}
     where id = ${executionId}
  `);
  await scheduleDelayedJob(INPUT_EXPIRATION_JOB, executionId, runAt, { tenantId, executionId });
}

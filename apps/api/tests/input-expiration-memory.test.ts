import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowBlip } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';

process.env['PIPE_FILAS'] = 'memoria';

const delayed = await import('../src/delayed-jobs.js');
const { INPUT_EXPIRATION_JOB, syncInputExpiration } = await import('../src/domain/input-expiration.js');

/**
 * P8 arming rule with no database: `syncInputExpiration` writes the execution columns and
 * (re)schedules the delayed job only for a block that waits for input and has an expiration, and
 * clears/cancels otherwise. The DB suite `input-expiration.test.ts` covers the claim and firing.
 */

const flow: FlowBlip = {
  id: 'f1',
  states: [
    { id: 'inicio', root: true, input: {}, outputs: [{ stateId: 'pergunta' }] },
    { id: 'pergunta', input: { expiration: '0:1' }, outputs: [] },
    { id: 'direto', input: { expiration: '0:1', bypass: true }, outputs: [] },
  ],
};

function fakeTx(rowsReturned: unknown[] = []) {
  const queries: string[] = [];
  const tx = {
    execute: async (query: { queryChunks?: unknown[] }) => {
      queries.push(JSON.stringify(query.queryChunks ?? query));
      return { rows: rowsReturned };
    },
  } as unknown as TransactionPipe;
  return { tx, queries };
}

afterEach(async () => {
  await delayed.closeDelayedJobs();
});

describe('syncInputExpiration', () => {
  it('arms only a waiting block with an expiration, writing both columns', async () => {
    const { tx, queries } = fakeTx();
    await syncInputExpiration(tx, 't1', 'exec-1', flow, 'pergunta');
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('entrada_expira_bloco');
    expect(queries[0]).not.toContain('is not null');
  });

  it('clears the columns and cancels the pending job when the block does not expire', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(async () => {});
      delayed.registerDelayedJob(INPUT_EXPIRATION_JOB, { run });
      await syncInputExpiration(fakeTx().tx, 't1', 'exec-2', flow, 'pergunta');
      const armed = fakeTx([{ id: 'exec-2' }]);
      await syncInputExpiration(armed.tx, 't1', 'exec-2', flow, 'direto');
      expect(armed.queries[0]).toContain('entrada_expira_em is not null');
      await vi.advanceTimersByTimeAsync(120_000);
      expect(run).not.toHaveBeenCalled();

      const nothing = fakeTx([]);
      await syncInputExpiration(nothing.tx, 't1', 'exec-3', flow, null);
      expect(nothing.queries).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fires the registered run when the memory timer elapses', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(async () => {});
      delayed.registerDelayedJob(INPUT_EXPIRATION_JOB, { run });
      const { tx } = fakeTx();
      await syncInputExpiration(tx, 't1', 'exec-5', flow, 'pergunta');
      await vi.advanceTimersByTimeAsync(59_000);
      expect(run).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(run).toHaveBeenCalledWith({ tenantId: 't1', executionId: 'exec-5' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-arming the same execution replaces the pending job (no double firing)', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(async () => {});
      delayed.registerDelayedJob(INPUT_EXPIRATION_JOB, { run });
      const { tx } = fakeTx();
      await syncInputExpiration(tx, 't1', 'exec-4', flow, 'pergunta');
      await vi.advanceTimersByTimeAsync(30_000);
      await syncInputExpiration(tx, 't1', 'exec-4', flow, 'pergunta');
      await vi.advanceTimersByTimeAsync(40_000);
      expect(run).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(25_000);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

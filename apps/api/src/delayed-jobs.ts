import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { conexaoRedis } from '@pipe/workers';

/**
 * Work that must run at a given time: a scheduled message (P7, `set /schedules`) today, the input
 * expiration (P8) next. Each kind registers a `run` for one job and, optionally, a `sweep` that
 * finds overdue work. The database row is always authoritative; the delayed job only wakes the
 * `api` at the right moment, and the sweep recovers a job that Redis lost or that fired before
 * its row was committed. So enqueue failures are logged and swallowed, like the other queues.
 *
 * With `PIPE_FILAS=memoria` (development and tests, no Redis) a job is a process-local timer, and
 * the sweep runs on an interval only with `PIPE_AGENDADOS_EM_MEMORIA=1`.
 */

export interface DelayedJobKind {
  run(data: Record<string, unknown>): Promise<void>;
  /** Runs the overdue work the kind owns; returns how many items it handled. */
  sweep?(): Promise<number>;
}

const QUEUE_DELAYED = 'pipe-delayed';
/** Longest `setTimeout` delay; later memory-mode jobs are left to the sweep. */
const MAX_TIMER_MS = 2_147_483_647;

const kinds = new Map<string, DelayedJobKind>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let connection: IORedis | null = null;
let queue: Queue | null = null;
let consumer: Worker | null = null;
let sweepClock: ReturnType<typeof setInterval> | null = null;

const inMemory = (): boolean => process.env['PIPE_FILAS'] === 'memoria';

function delayedQueue(): Queue {
  connection ??= new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null });
  queue ??= new Queue(QUEUE_DELAYED, { connection });
  return queue;
}

/** BullMQ 5 rejects `:` in custom job ids; keep hyphens. */
const jobIdOf = (kind: string, key: string): string => `${kind}-${key}`.replace(/:/g, '-');

export function registerDelayedJob(kind: string, handler: DelayedJobKind): void {
  kinds.set(kind, handler);
}

async function runJob(kind: string, data: Record<string, unknown>): Promise<void> {
  const handler = kinds.get(kind);
  if (!handler) return;
  await handler.run(data);
}

/**
 * Wake `kind` with `data` at `runAt`. Scheduling the same `key` again replaces the pending job, so
 * a rescheduled message fires only at its new time.
 */
export async function scheduleDelayedJob(kind: string, key: string, runAt: Date, data: Record<string, unknown>): Promise<void> {
  const delay = Math.max(0, runAt.getTime() - Date.now());
  const jobId = jobIdOf(kind, key);
  if (inMemory()) {
    clearTimeout(timers.get(jobId));
    timers.delete(jobId);
    if (delay > MAX_TIMER_MS) return;
    const timer = setTimeout(() => {
      timers.delete(jobId);
      runJob(kind, data).catch((error: unknown) => {
        console.error(`[agendados] ${jobId} falhou: ${(error as Error).message}`);
      });
    }, delay);
    timer.unref();
    timers.set(jobId, timer);
    return;
  }
  try {
    const q = delayedQueue();
    await q.remove(jobId);
    await q.add(kind, data, { jobId, delay, attempts: 1, removeOnComplete: 1_000, removeOnFail: 1_000 });
  } catch (error) {
    console.error(`[agendados] não agendou ${jobId}: ${(error as Error).message}`);
  }
}

/** Drop the pending job of `key`; the caller also marks its row, which is what the sweep reads. */
export async function cancelDelayedJob(kind: string, key: string): Promise<void> {
  const jobId = jobIdOf(kind, key);
  if (inMemory()) {
    clearTimeout(timers.get(jobId));
    timers.delete(jobId);
    return;
  }
  try {
    await delayedQueue().remove(jobId);
  } catch (error) {
    console.error(`[agendados] não cancelou ${jobId}: ${(error as Error).message}`);
  }
}

async function sweepAll(): Promise<number> {
  let handled = 0;
  for (const [kind, handler] of kinds) {
    if (!handler.sweep) continue;
    try {
      handled += await handler.sweep();
    } catch (error) {
      console.error(`[agendados] varredura de ${kind} falhou: ${(error as Error).message}`);
    }
  }
  return handled;
}

/** Consume delayed jobs in the `api`, which owns the domain rules and the outbound send path. */
export function consumeDelayedJobs(): void {
  if (inMemory() || consumer) return;
  consumer = new Worker(
    QUEUE_DELAYED,
    async (job) => {
      if (job.name === 'varredura') return sweepAll();
      await runJob(job.name, job.data as Record<string, unknown>);
      return null;
    },
    {
      connection: (connection ??= new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null })),
      concurrency: Number(process.env['PIPE_AGENDADOS_CONCORRENCIA'] ?? 4),
    },
  );
}

/** Safety sweep for every registered kind. */
export async function scheduleSweepDelayedJobs(): Promise<void> {
  const every = Number(process.env['PIPE_AGENDADOS_VARREDURA_MS'] ?? 60_000);
  if (inMemory()) {
    if (process.env['PIPE_AGENDADOS_EM_MEMORIA'] !== '1' || sweepClock) return;
    let running = false;
    sweepClock = setInterval(() => {
      if (running) return;
      running = true;
      void sweepAll().finally(() => {
        running = false;
      });
    }, every);
    sweepClock.unref();
    return;
  }
  await delayedQueue().upsertJobScheduler('sweep-delayed', { every }, { name: 'varredura', data: {} });
}

export async function closeDelayedJobs(): Promise<void> {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  if (sweepClock) clearInterval(sweepClock);
  sweepClock = null;
  await consumer?.close();
  await queue?.close();
  await connection?.quit();
  consumer = null;
  queue = null;
  connection = null;
}

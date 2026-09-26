import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { PASTA_MIGRATIONS } from '@pipe/db';
import { databaseApp, databaseOwner } from './database.js';
import { pingRedis } from './queues.js';

/**
 * `GET /saude` and its probes use short deadlines. A hanging healthcheck is worse than a failed one: a stuck `select 1` would keep the orchestrator waiting while customer traffic still reaches an unresponsive process.
 */

export const TIME_LIMIT_MS = Number(process.env['PIPE_SAUDE_TIMEOUT_MS'] ?? 2_000);

/** The image stamps `PIPE_VERSAO` at build time; outside it, use the package version. */
export const VERSAO = process.env['PIPE_VERSAO'] ?? '0.1.0';

export type Veredito = 'ok' | 'falha';

export interface Saude {
  ok: boolean;
  versao: string;
  database: Veredito;
  redis: Veredito;
}

/**
 * Race probes against a deadline. Catch the losing promise too: if it rejects after timeout without a handler, `unhandledRejection` could crash the service that the healthcheck is meant to monitor. The losing promise needs its own `catch`.
 */
async function sondar(trabalho: () => Promise<unknown>): Promise<Veredito> {
  let despertador: NodeJS.Timeout | undefined;
  const emCurso = trabalho();
  emCurso.catch(() => undefined);
  try {
    await Promise.race([
      emCurso,
      new Promise((_, recusar) => {
        despertador = setTimeout(() => recusar(new Error('tempo-limite')), TIME_LIMIT_MS);
      }),
    ]);
    return 'ok';
  } catch {
    return 'falha';
  } finally {
    if (despertador) clearTimeout(despertador);
  }
}

export async function verificarSaude(): Promise<Saude> {
  // Probe the `app` pool used by business traffic. The owner pool handles only two resolutions and does not represent customer-facing health.
  const [database, redis] = await Promise.all([
    sondar(() => databaseApp().execute(sql`select 1`)),
    sondar(() => pingRedis()),
  ]);

  // Set `ok` from database health alone. Without Redis, the API can still receive webhooks and serve reads; without the database it cannot serve, which distinguishes 200 from 503.
  return { ok: database === 'ok', versao: VERSAO, database, redis };
}

/**
 * Count repository migrations not yet applied. Return null when unknowable (image lacks `drizzle`, database is down, or migration table is missing); omit that metric rather than emit a false zero that would silence `MigrationPendente`. The unknown value is `null`, not zero.
 */
export async function migrationsPendentes(): Promise<number | null> {
  try {
    const cru = await readFile(path.join(PASTA_MIGRATIONS, 'meta', '_journal.json'), 'utf8');
    const diario = JSON.parse(cru) as { entries?: unknown[] };
    const noRepositorio = diario.entries?.length ?? 0;

    const { rows } = await databaseOwner().execute<{ total: string }>(
      sql`select count(*)::text as total from drizzle.__drizzle_migrations`,
    );
    const aplicadas = Number(rows[0]?.total ?? 0);
    return Math.max(0, noRepositorio - aplicadas);
  } catch {
    return null;
  }
}

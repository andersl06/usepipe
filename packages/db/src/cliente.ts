import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type DatabasePipe = NodePgDatabase<typeof schema> & { $client: pg.Pool };

export interface OptionsDatabase {
  url?: string | undefined;
  maxConnections?: number | undefined;
  /** Enable SQL logging, useful for RLS tests that need to inspect the transaction. */
  registrarSql?: boolean | undefined;
}

/**
 * Create the pool and Drizzle client. The `api` uses the application-role URL without `bypassrls`; migrations and seeds use the owner-role URL. Mixing them can make RLS appear active while queries actually bypass it.
 */
export function createDatabase(options: OptionsDatabase = {}): DatabasePipe {
  const url = options.url ?? process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL não definida: o Pipe não sobe sem banco.');
  }
  const pool = new pg.Pool({ connectionString: url, max: options.maxConnections ?? 10 });
  return drizzle(pool, { schema, logger: options.registrarSql ?? false });
}

export async function closeDatabase(db: DatabasePipe): Promise<void> {
  await db.$client.end();
}

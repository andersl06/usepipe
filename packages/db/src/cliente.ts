import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type DatabasePipe = NodePgDatabase<typeof schema> & { $client: pg.Pool };

export interface OptionsDatabase {
  url?: string | undefined;
  maxConnections?: number | undefined;
  /** Liga o log de SQL. Útil no teste de RLS, onde o interesse é ver a transação. */
  registrarSql?: boolean | undefined;
}

/**
 * Cria o pool e o cliente Drizzle. A `api` usa a URL do papel da aplicação, que **não**
 * tem `bypassrls`; migration e seed usam a URL do papel dono. Confundir as duas é o
 * jeito mais rápido de achar que a RLS está ligada quando ela está sendo ignorada.
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

import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type BancoPipe = NodePgDatabase<typeof schema> & { $client: pg.Pool };

export interface OpcoesBanco {
  url?: string | undefined;
  maxConexoes?: number | undefined;
  /** Liga o log de SQL. Útil no teste de RLS, onde o interesse é ver a transação. */
  registrarSql?: boolean | undefined;
}

/**
 * Cria o pool e o cliente Drizzle. A `api` usa a URL do papel da aplicação, que **não**
 * tem `bypassrls`; migration e seed usam a URL do papel dono. Confundir as duas é o
 * jeito mais rápido de achar que a RLS está ligada quando ela está sendo ignorada.
 */
export function criarBanco(opcoes: OpcoesBanco = {}): BancoPipe {
  const url = opcoes.url ?? process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL não definida: o Pipe não sobe sem banco.');
  }
  const pool = new pg.Pool({ connectionString: url, max: opcoes.maxConexoes ?? 10 });
  return drizzle(pool, { schema, logger: opcoes.registrarSql ?? false });
}

export async function fecharBanco(db: BancoPipe): Promise<void> {
  await db.$client.end();
}

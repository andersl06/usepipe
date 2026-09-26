import { sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { DatabasePipe } from './cliente.js';
import type * as schema from './schema/index.js';

export type TransactionPipe = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TenantInvalidError extends Error {
  constructor(value: string) {
    super(`tenant_id inválido: ${JSON.stringify(value)}`);
    this.name = 'TenantInvalidoErro';
  }
}

/**
 * Open a transaction, set `pipe.tenant_id` for it, and run the work inside.
 *
 * `set_config(..., true)` is the parameterized form of `set local` from section 1 of the data model. SQL `set local` does not accept a parameter; concatenating the UUID into SQL would reopen the injection path RLS is meant to close. The setting is local to the transaction and cannot leak to the next borrower of the pooled connection.
 */
export async function comTenant<T>(
  db: DatabasePipe,
  tenantId: string,
  fn: (tx: TransactionPipe) => Promise<T>,
): Promise<T> {
  if (!UUID.test(tenantId)) {
    throw new TenantInvalidError(tenantId);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('pipe.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/** The tenant active in this transaction, for logging and assertions. */
export async function tenantAtual(tx: TransactionPipe): Promise<string | null> {
  const resultado = await tx.execute<{ tenant: string | null }>(
    sql`select nullif(current_setting('pipe.tenant_id', true), '') as tenant`,
  );
  return resultado.rows[0]?.tenant ?? null;
}

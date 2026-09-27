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
  let sessao: { prepareQuery: unknown } | undefined;
  try {
    return await db.transaction(async (tx) => {
      // drizzle creates one session per pooled transaction; every query (`execute`, builders,
      // savepoints) goes through its `prepareQuery`.
      sessao = (tx as unknown as { session: { prepareQuery: unknown } }).session;
      await tx.execute(sql`select set_config('pipe.tenant_id', ${tenantId}, true)`);
      return fn(tx);
    });
  } finally {
    // After COMMIT/ROLLBACK the client is back in the pool. A promise that outlived the
    // transaction (an action past its time limit, say) must not run a query through it: it
    // would land without `pipe.tenant_id`, or inside another request's transaction.
    if (sessao) {
      sessao.prepareQuery = () => {
        throw new TransactionClosedError();
      };
    }
  }
}

export class TransactionClosedError extends Error {
  constructor() {
    super('A transação já terminou: nada mais pode ser executado nela.');
    this.name = 'TransacaoEncerradaErro';
  }
}

/** The tenant active in this transaction, for logging and assertions. */
export async function tenantAtual(tx: TransactionPipe): Promise<string | null> {
  const resultado = await tx.execute<{ tenant: string | null }>(
    sql`select nullif(current_setting('pipe.tenant_id', true), '') as tenant`,
  );
  return resultado.rows[0]?.tenant ?? null;
}

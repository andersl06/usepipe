import { sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { BancoPipe } from './cliente.js';
import type * as schema from './schema/index.js';

export type TransacaoPipe = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TenantInvalidoErro extends Error {
  constructor(valor: string) {
    super(`tenant_id inválido: ${JSON.stringify(valor)}`);
    this.name = 'TenantInvalidoErro';
  }
}

/**
 * Abre a transação, fixa `pipe.tenant_id` nela e roda o trabalho dentro.
 *
 * `set_config(..., true)` é o `set local` da §1 do modelo de dados em forma de função:
 * o `set local` do SQL não aceita parâmetro, e concatenar o uuid no texto do comando
 * seria abrir a porta que a RLS existe para fechar. Como é *local*, a variável morre
 * com a transação e não vaza para a próxima que pegar a mesma conexão do pool.
 */
export async function comTenant<T>(
  db: BancoPipe,
  tenantId: string,
  fn: (tx: TransacaoPipe) => Promise<T>,
): Promise<T> {
  if (!UUID.test(tenantId)) {
    throw new TenantInvalidoErro(tenantId);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('pipe.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/** O tenant em vigor na transação, para log e asserção. */
export async function tenantAtual(tx: TransacaoPipe): Promise<string | null> {
  const resultado = await tx.execute<{ tenant: string | null }>(
    sql`select nullif(current_setting('pipe.tenant_id', true), '') as tenant`,
  );
  return resultado.rows[0]?.tenant ?? null;
}

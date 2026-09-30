import { sql } from 'drizzle-orm';
import { createDatabase, closeDatabase } from '../src/cliente.js';
import type { DatabasePipe } from '../src/cliente.js';
import { migrate } from '../src/migrate.js';

export const URL_DONO =
  process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

/**
 * The application role. RLS must be tested with this role: the table owner bypasses the policy, so an owner-role test could pass without proving isolation.
 */
export const URL_APP =
  process.env['DATABASE_URL_APP'] ?? 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

export interface Cenario {
  dono: DatabasePipe;
  app: DatabasePipe;
  tenantA: string;
  tenantB: string;
  queueA: string;
  queueB: string;
  flowA: string;
  flowB: string;
  encerrar: () => Promise<void>;
}

/**
 * Migrate the schema and seed two tenants with one queue each using the owner role. `sufixo` keeps runs independent when the database is retained.
 */
export async function montarCenario(sufixo: string): Promise<Cenario> {
  await migrate(URL_DONO);

  const dono = createDatabase({ url: URL_DONO, maxConnections: 2 });
  const app = createDatabase({ url: URL_APP, maxConnections: 4 });

  const create = async (slug: string, nameQueue: string) => {
    const tenant = await dono.execute<{ id: string }>(
      sql`insert into tenant (nome, slug) values (${slug}, ${slug}) returning id`,
    );
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) throw new Error(`não criou o tenant ${slug}`);
    const flow = await dono.execute<{ id: string }>(
      sql`insert into fluxo (tenant_id, nome, short_name) values (${tenantId}, ${slug}, 'fluxo') returning id`,
    );
    const flowId = flow.rows[0]?.id;
    if (!flowId) throw new Error(`não criou o fluxo de ${slug}`);
    const queue = await dono.execute<{ id: string }>(
      sql`insert into fila (tenant_id, fluxo_id, nome) values (${tenantId}, ${flowId}, ${nameQueue}) returning id`,
    );
    const queueId = queue.rows[0]?.id;
    if (!queueId) throw new Error(`não criou a fila de ${slug}`);
    return { tenantId, queueId, flowId };
  };

  const a = await create(`rls-a-${sufixo}`, `Fila A ${sufixo}`);
  const b = await create(`rls-b-${sufixo}`, `Fila B ${sufixo}`);

  return {
    dono,
    app,
    tenantA: a.tenantId,
    tenantB: b.tenantId,
    queueA: a.queueId,
    queueB: b.queueId,
    flowA: a.flowId,
    flowB: b.flowId,
    encerrar: async () => {
      await dono.execute(
        sql`delete from tenant where id in (${a.tenantId}::uuid, ${b.tenantId}::uuid)`,
      );
      await closeDatabase(app);
      await closeDatabase(dono);
    },
  };
}

/**
 * Did the query fail closed? Either `current_setting` threw or the policy filtered every row. Both outcomes are acceptable; returning a row is not.
 */
export async function falhouFechada(query: () => Promise<{ rows: unknown[] }>): Promise<boolean> {
  try {
    const resultado = await query();
    return resultado.rows.length === 0;
  } catch {
    return true;
  }
}

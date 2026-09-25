import { sql } from 'drizzle-orm';
import { createDatabase, closeDatabase } from '../src/cliente.js';
import type { DatabasePipe } from '../src/cliente.js';
import { migrate } from '../src/migrar.js';

export const URL_DONO =
  process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

/**
 * O papel da aplicação. É o único jeito honesto de testar RLS: com o papel dono a
 * política é ignorada e o teste passaria sem provar nada.
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
  encerrar: () => Promise<void>;
}

/**
 * Sobe o schema e semeia dois tenants com uma fila cada, usando o papel dono.
 * O `sufixo` mantém as execuções independentes quando o banco não é descartado.
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
    const queue = await dono.execute<{ id: string }>(
      sql`insert into fila (tenant_id, nome) values (${tenantId}, ${nameQueue}) returning id`,
    );
    const queueId = queue.rows[0]?.id;
    if (!queueId) throw new Error(`não criou a fila de ${slug}`);
    return { tenantId, queueId };
  };

  const a = await create(`rls-a-${sufixo}`, `Fila A ${sufixo}`);
  const b = await create(`rls-b-${sufixo}`, `Fila B ${sufixo}`);

  return {
    dono,
    app,
    tenantA: a.tenantId,
    tenantB: b.tenantId,
    queueA: a.filaId,
    queueB: b.filaId,
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
 * A consulta falhou fechada? Ou o `current_setting` lançou, ou a política filtrou
 * tudo. As duas formas são aceitáveis; devolver linha não é.
 */
export async function falhouFechada(query: () => Promise<{ rows: unknown[] }>): Promise<boolean> {
  try {
    const resultado = await query();
    return resultado.rows.length === 0;
  } catch {
    return true;
  }
}

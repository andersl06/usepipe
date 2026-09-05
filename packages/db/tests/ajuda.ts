import { sql } from 'drizzle-orm';
import { criarBanco, fecharBanco } from '../src/cliente.js';
import type { BancoPipe } from '../src/cliente.js';
import { migrar } from '../src/migrar.js';

export const URL_DONO =
  process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

/**
 * O papel da aplicação. É o único jeito honesto de testar RLS: com o papel dono a
 * política é ignorada e o teste passaria sem provar nada.
 */
export const URL_APP =
  process.env['DATABASE_URL_APP'] ?? 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

export interface Cenario {
  dono: BancoPipe;
  app: BancoPipe;
  tenantA: string;
  tenantB: string;
  filaA: string;
  filaB: string;
  encerrar: () => Promise<void>;
}

/**
 * Sobe o schema e semeia dois tenants com uma fila cada, usando o papel dono.
 * O `sufixo` mantém as execuções independentes quando o banco não é descartado.
 */
export async function montarCenario(sufixo: string): Promise<Cenario> {
  await migrar(URL_DONO);

  const dono = criarBanco({ url: URL_DONO, maxConexoes: 2 });
  const app = criarBanco({ url: URL_APP, maxConexoes: 4 });

  const criar = async (slug: string, nomeFila: string) => {
    const tenant = await dono.execute<{ id: string }>(
      sql`insert into tenant (nome, slug) values (${slug}, ${slug}) returning id`,
    );
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) throw new Error(`não criou o tenant ${slug}`);
    const fila = await dono.execute<{ id: string }>(
      sql`insert into fila (tenant_id, nome) values (${tenantId}, ${nomeFila}) returning id`,
    );
    const filaId = fila.rows[0]?.id;
    if (!filaId) throw new Error(`não criou a fila de ${slug}`);
    return { tenantId, filaId };
  };

  const a = await criar(`rls-a-${sufixo}`, `Fila A ${sufixo}`);
  const b = await criar(`rls-b-${sufixo}`, `Fila B ${sufixo}`);

  return {
    dono,
    app,
    tenantA: a.tenantId,
    tenantB: b.tenantId,
    filaA: a.filaId,
    filaB: b.filaId,
    encerrar: async () => {
      await dono.execute(
        sql`delete from tenant where id in (${a.tenantId}::uuid, ${b.tenantId}::uuid)`,
      );
      await fecharBanco(app);
      await fecharBanco(dono);
    },
  };
}

/**
 * A consulta falhou fechada? Ou o `current_setting` lançou, ou a política filtrou
 * tudo. As duas formas são aceitáveis; devolver linha não é.
 */
export async function falhouFechada(consulta: () => Promise<{ rows: unknown[] }>): Promise<boolean> {
  try {
    const resultado = await consulta();
    return resultado.rows.length === 0;
  } catch {
    return true;
  }
}

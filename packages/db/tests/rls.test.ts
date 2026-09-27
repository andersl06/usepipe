import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comTenant, tenantAtual } from '../src/tenant.js';
import { falhouFechada, montarCenario } from './ajuda.js';
import type { Cenario } from './ajuda.js';

/**
 * Foundation acceptance criterion: `tenant_isolado` must isolate rows, and a missing session setting must fail closed.
 *
 * The policy checks run with `pipe_app`, which owns no tables and has no `bypassrls` privilege. The owner role would bypass RLS and could make the tests pass without proving isolation.
 */
describe('Enforce tenant isolation through row-level security', () => {
  let cenario: Cenario;

  beforeAll(async () => {
    cenario = await montarCenario(String(Date.now()));
  });

  afterAll(async () => {
    await cenario?.encerrar();
  });

  it('o tenant A não enxerga a linha do tenant B', async () => {
    const doA = await comTenant(cenario.app, cenario.tenantA, async (tx) => {
      const r = await tx.execute<{ id: string; nome: string }>(sql`select id, nome from fila`);
      return r.rows;
    });

    expect(doA.map((linha) => linha.id)).toEqual([cenario.queueA]);
    expect(doA.map((linha) => linha.id)).not.toContain(cenario.queueB);

    // Check the reverse direction too, so the filter cannot pass by row-order coincidence.
    const doB = await comTenant(cenario.app, cenario.tenantB, async (tx) => {
      const r = await tx.execute<{ id: string }>(sql`select id from fila`);
      return r.rows;
    });
    expect(doB.map((linha) => linha.id)).toEqual([cenario.queueB]);

    // Looking up the other tenant by ID also returns nothing: the policy filters the
    // row, not the query.
    const espiada = await comTenant(cenario.app, cenario.tenantA, async (tx) => {
      const r = await tx.execute<{ id: string }>(
        sql`select id from fila where id = ${cenario.queueB}::uuid`,
      );
      return r.rows;
    });
    expect(espiada).toHaveLength(0);
  });

  it('a transaction handle that outlives comTenant can no longer run queries (CR-06)', async () => {
    let vazado: Parameters<Parameters<typeof comTenant>[2]>[0] | undefined;
    await comTenant(cenario.app, cenario.tenantA, async (tx) => {
      vazado = tx;
      await tx.execute(sql`select 1`);
    });
    // After COMMIT the client is back in the pool; a late promise must not write through it
    // (with or without `pipe.tenant_id`, possibly inside another request's transaction).
    await expect((async () => vazado!.execute(sql`select 1`))()).rejects.toThrow(/transação já terminou/);
    await expect(vazado!.transaction(async (sp) => sp.execute(sql`select 1`))).rejects.toThrow(/transação já terminou/);

    let depoisDoErro: typeof vazado;
    await expect(comTenant(cenario.app, cenario.tenantA, async (tx) => {
      depoisDoErro = tx;
      throw new Error('falhou');
    })).rejects.toThrow('falhou');
    await expect((async () => depoisDoErro!.execute(sql`select 1`))()).rejects.toThrow(/transação já terminou/);
  });

  it('Deny queries when `pipe.tenant_id` is unset', async () => {
    const fechou = await falhouFechada(() =>
      cenario.app.execute<{ id: string }>(sql`select id from fila`),
    );
    expect(fechou).toBe(true);

    // Even the total is isolated: `count(*)` without a tenant must not return 2.
    const count = await cenario.app
      .execute<{ n: string }>(sql`select count(*)::text as n from fila`)
      .then((r) => r.rows[0]?.n ?? null)
      .catch(() => null);
    expect(count).not.toBe('2');

    // Writes are isolated too: an insert without an active tenant must fail.
    await expect(
      cenario.app.execute(
        sql`insert into fila (tenant_id, nome) values (${cenario.tenantA}::uuid, 'sem tenant em vigor')`,
      ),
    ).rejects.toThrow();
  });

  it('`withTenant` sets the tenant only for its transaction', async () => {
    const dentro = await comTenant(cenario.app, cenario.tenantA, async (tx) => tenantAtual(tx));
    expect(dentro).toBe(cenario.tenantA);

    // `set local` ends with the transaction. If it leaked, the pooled connection
    // would carry tenant A into the next borrower's work.
    const fechou = await falhouFechada(() =>
      cenario.app.execute<{ id: string }>(sql`select id from fila`),
    );
    expect(fechou).toBe(true);

    // The next transaction, with another tenant, sees only its own rows.
    const depois = await comTenant(cenario.app, cenario.tenantB, async (tx) => {
      const r = await tx.execute<{ id: string }>(sql`select id from fila`);
      return r.rows.map((linha) => linha.id);
    });
    expect(depois).toEqual([cenario.queueB]);

    // The policy also applies to writes: inserting a row stamped with another tenant
    // is blocked by `with check`.
    await expect(
      comTenant(cenario.app, cenario.tenantA, async (tx) =>
        tx.execute(
          sql`insert into fila (tenant_id, nome) values (${cenario.tenantB}::uuid, 'fila intrusa')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('Reject an invalid `tenant_id` before querying the database', async () => {
    await expect(
      comTenant(cenario.app, "' or true --", async (tx) => tenantAtual(tx)),
    ).rejects.toThrow(/tenant_id inválido/);
  });

  /*
   * The four tests above exercise the policy on one table. The five below check its assumptions: if one fails, the earlier tests could pass without proving isolation.
   */

  it('The application role owns no tables and cannot bypass row-level security', async () => {
    const { rows } = await cenario.dono.execute<{
      bypassrls: boolean;
      superusuario: boolean;
      tabelas_proprias: string;
    }>(sql`
      select r.rolbypassrls as bypassrls,
             r.rolsuper as superusuario,
             (select count(*) from pg_tables where tableowner = 'pipe_app')::text as tabelas_proprias
        from pg_roles r
       where r.rolname = 'pipe_app'
    `);
    expect(rows[0]?.bypassrls).toBe(false);
    expect(rows[0]?.superusuario).toBe(false);
    expect(rows[0]?.tabelas_proprias).toBe('0');
  });

  it('toda tabela com tenant_id tem a política ligada — nenhuma escapa', async () => {
    const { rows } = await cenario.dono.execute<{ tabela: string }>(sql`
      select c.relname as tabela
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
       where n.nspname = 'public'
         and c.relkind in ('r', 'p')
         and a.attisdropped = false
         and (c.relrowsecurity = false
              or not exists (select 1 from pg_policies p
                              where p.schemaname = 'public' and p.tablename = c.relname))
       order by c.relname
    `);
    // Report the table names when this fails: a new table without a policy is the defect this
    // suite must catch when someone creates it.
    expect(rows.map((r) => r.tabela)).toEqual([]);
  });

  it('Apply row-level security to newly created partitions', async () => {
    const mes = new Date();
    mes.setMonth(mes.getMonth() + 2);
    const first = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}-01`;
    const { rows: criada } = await cenario.dono.execute<{ pipeCreatePartitionMonth: string }>(
      sql`select pipe_criar_particao_mes('mensagem', ${first}::date) as "pipeCreatePartitionMonth"`,
    );
    const nome = criada[0]?.pipeCreatePartitionMonth ?? '';
    expect(nome).toMatch(/^mensagem_\d{4}_\d{2}$/);

    const { rows: politica } = await cenario.dono.execute<{ n: string }>(sql`
      select count(*)::text as n
        from pg_policies
       where schemaname = 'public' and tablename = ${nome} and policyname = 'tenant_isolado'
    `);
    expect(politica[0]?.n).toBe('1');
  });

  it('Evaluate `current_setting` once per query rather than once per row', async () => {
    // The planner promotes the scalar subquery form to an InitPlan.
    // Without it, the policy evaluates the function for every examined row, and
    // scanning `mensagem` becomes expensive without an obvious warning.
    const { rows } = await cenario.dono.execute<{ tabela: string }>(sql`
      select tablename as tabela
        from pg_policies
       where schemaname = 'public'
         and policyname = 'tenant_isolado'
         and qual::text not like '%( SELECT %'
       order by tablename
    `);
    expect(rows.map((r) => r.tabela)).toEqual([]);
  });

  it('Clear the tenant setting after a failed transaction', async () => {
    // Returning a connection with a dirty tenant setting to the pool would silently leak data:
    // a consulta seguinte enxergaria o tenant de quem falhou antes.
    await expect(
      comTenant(cenario.app, cenario.tenantA, async () => {
        throw new Error('falha proposital');
      }),
    ).rejects.toThrow('falha proposital');

    const vazou = await falhouFechada(() =>
      cenario.app.execute(sql`select id from fila`),
    );
    expect(vazou).toBe(true);
  });
});

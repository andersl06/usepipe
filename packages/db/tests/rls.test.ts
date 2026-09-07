import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comTenant, tenantAtual } from '../src/tenant.js';
import { falhouFechada, montarCenario } from './ajuda.js';
import type { Cenario } from './ajuda.js';

/**
 * Critério de aceite da fundação: a política `tenant_isolado` precisa isolar de
 * verdade, e a ausência da variável de sessão precisa fechar a porta, não abri-la.
 *
 * Tudo aqui roda com o papel `pipe_app`, que não é dono das tabelas e não tem
 * `bypassrls`. Rodar com o papel dono faria os três testes passarem sem provar nada.
 */
describe('isolamento por tenant', () => {
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

    expect(doA.map((linha) => linha.id)).toEqual([cenario.filaA]);
    expect(doA.map((linha) => linha.id)).not.toContain(cenario.filaB);

    // E o caminho inverso, para descartar que o filtro seja coincidência de ordem.
    const doB = await comTenant(cenario.app, cenario.tenantB, async (tx) => {
      const r = await tx.execute<{ id: string }>(sql`select id from fila`);
      return r.rows;
    });
    expect(doB.map((linha) => linha.id)).toEqual([cenario.filaB]);

    // Buscar pelo id do outro tenant também não devolve nada: a política filtra a
    // linha, não a consulta.
    const espiada = await comTenant(cenario.app, cenario.tenantA, async (tx) => {
      const r = await tx.execute<{ id: string }>(
        sql`select id from fila where id = ${cenario.filaB}::uuid`,
      );
      return r.rows;
    });
    expect(espiada).toHaveLength(0);
  });

  it('consulta sem pipe.tenant_id definido falha fechada', async () => {
    const fechou = await falhouFechada(() =>
      cenario.app.execute<{ id: string }>(sql`select id from fila`),
    );
    expect(fechou).toBe(true);

    // Nem o total escapa: `count(*)` sem tenant não pode devolver 2.
    const contagem = await cenario.app
      .execute<{ n: string }>(sql`select count(*)::text as n from fila`)
      .then((r) => r.rows[0]?.n ?? null)
      .catch(() => null);
    expect(contagem).not.toBe('2');

    // E a escrita também: inserir sem tenant em vigor não pode passar.
    await expect(
      cenario.app.execute(
        sql`insert into fila (tenant_id, nome) values (${cenario.tenantA}::uuid, 'sem tenant em vigor')`,
      ),
    ).rejects.toThrow();
  });

  it('o helper comTenant fixa a variável na transação e ela não vaza para a seguinte', async () => {
    const dentro = await comTenant(cenario.app, cenario.tenantA, async (tx) => tenantAtual(tx));
    expect(dentro).toBe(cenario.tenantA);

    // `set local` morre com a transação. Se vazasse, a conexão devolvida ao pool
    // levaria o tenant A para quem pegasse ela depois.
    const fechou = await falhouFechada(() =>
      cenario.app.execute<{ id: string }>(sql`select id from fila`),
    );
    expect(fechou).toBe(true);

    // A transação seguinte, com outro tenant, enxerga só o que é dela.
    const depois = await comTenant(cenario.app, cenario.tenantB, async (tx) => {
      const r = await tx.execute<{ id: string }>(sql`select id from fila`);
      return r.rows.map((linha) => linha.id);
    });
    expect(depois).toEqual([cenario.filaB]);

    // E a política também vale na escrita: gravar linha carimbada com o outro tenant
    // é barrado pelo `with check`.
    await expect(
      comTenant(cenario.app, cenario.tenantA, async (tx) =>
        tx.execute(
          sql`insert into fila (tenant_id, nome) values (${cenario.tenantB}::uuid, 'fila intrusa')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('recusa tenant_id que não é uuid antes de tocar no banco', async () => {
    await expect(
      comTenant(cenario.app, "' or true --", async (tx) => tenantAtual(tx)),
    ).rejects.toThrow(/tenant_id inválido/);
  });

  /*
   * Os quatro acima provam a política numa tabela. Os cinco abaixo provam as
   * PREMISSAS da política — cada um deles falhando significa que os outros
   * passariam sem provar nada.
   */

  it('o papel da aplicação não é dono das tabelas e não tem bypassrls', async () => {
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
    // Falha nomeando as tabelas: tabela nova sem política é o defeito que essa
    // suíte existe para pegar no dia em que alguém a criar.
    expect(rows.map((r) => r.tabela)).toEqual([]);
  });

  it('a partição criada agora nasce com a política, e não é porta dos fundos', async () => {
    const mes = new Date();
    mes.setMonth(mes.getMonth() + 2);
    const primeiro = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}-01`;
    const { rows: criada } = await cenario.dono.execute<{ pipe_criar_particao_mes: string }>(
      sql`select pipe_criar_particao_mes('mensagem', ${primeiro}::date)`,
    );
    const nome = criada[0]?.pipe_criar_particao_mes ?? '';
    expect(nome).toMatch(/^mensagem_\d{4}_\d{2}$/);

    const { rows: politica } = await cenario.dono.execute<{ n: string }>(sql`
      select count(*)::text as n
        from pg_policies
       where schemaname = 'public' and tablename = ${nome} and policyname = 'tenant_isolado'
    `);
    expect(politica[0]?.n).toBe('1');
  });

  it('a política avalia current_setting uma vez, não por linha', async () => {
    // A forma com subconsulta escalar é o que o planejador promove a InitPlan.
    // Sem ela a política volta a rodar a função em cada linha examinada, e a
    // varredura de `mensagem` fica cara sem ninguém perceber.
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

  it('o tenant de uma transação não sobrevive ao erro da anterior', async () => {
    // Conexão devolvida ao pool com variável suja seria vazamento silencioso:
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

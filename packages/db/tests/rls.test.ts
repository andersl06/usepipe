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
});

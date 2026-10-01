import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { montarCenario } = await import('./ajuda.js');
const { politicaConferida, salvarPoliticaSla, excluirPoliticaSla } = await import(
  '../src/domain/management/regras-sla.js'
);

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

describe('politicaConferida', () => {
  const ok = { name: ' SLA Padrão ', padrao: true, metas: { espera_fila: 60 } };

  it('aceita e normaliza', () => {
    expect(politicaConferida(ok)).toEqual({
      name: 'SLA Padrão',
      padrao: true,
      queueIds: [],
      metas: [{ target: 'espera_fila', deadlineSeg: 60 }],
    });
  });

  it.each([
    ['sem nome', { ...ok, name: '  ' }],
    ['nome com mais de 100 caracteres', { ...ok, name: 'x'.repeat(101) }],
    ['sem escopo', { ...ok, padrao: false }],
    ['sem metas', { ...ok, metas: {} }],
    ['meta desconhecida', { ...ok, metas: { foo: 10 } }],
    ['prazo zero', { ...ok, metas: { espera_fila: 0 } }],
    ['prazo além de uma semana', { ...ok, metas: { espera_fila: 604_801 } }],
    ['prazo fracionado', { ...ok, metas: { espera_fila: 1.5 } }],
    ['filas que não são lista', { ...ok, padrao: false, queueIds: 'x' }],
    ['corpo que não é objeto', 'x'],
  ])('recusa %s', (_nome, corpo) => {
    expect(() => politicaConferida(corpo)).toThrow();
  });
});

describe('política de SLA gravada no banco', () => {
  let a: Cenario;
  let b: Cenario;

  async function permitir(c: Cenario): Promise<void> {
    await c.dono.execute(sql`
      insert into usuario_permissao (tenant_id, usuario_id, permissao_codigo, concedida)
      values (${c.tenantId}::uuid, ${c.agentId}::uuid, 'regra.gerenciar', true)
    `);
  }
  const salvar = (c: Cenario, corpo: unknown, id?: string) =>
    noTenant(c.tenantId, (tx) => salvarPoliticaSla(tx, c.tenantId, c.agentId, corpo, id));
  const linhas = async (c: Cenario) => {
    const { rows } = await c.dono.execute<{ nome: string; alvo: string; prazo_seg: number; escopo_tipo: string }>(sql`
      select nome, alvo, prazo_seg, escopo_tipo from regra_sla where tenant_id = ${c.tenantId}::uuid order by alvo, escopo_tipo
    `);
    return rows;
  };

  beforeAll(async () => {
    a = await montarCenario(`pol-a-${randomUUID().slice(0, 8)}`);
    b = await montarCenario(`pol-b-${randomUUID().slice(0, 8)}`);
    await permitir(a);
  }, 180_000);

  afterAll(async () => {
    await a?.encerrar();
    await b?.encerrar();
  });

  it('cria uma linha por meta e por escopo, edita e exclui o conjunto', async () => {
    const { id } = await salvar(a, {
      name: 'Financeiro',
      padrao: true,
      queueIds: [a.queueId],
      metas: { espera_fila: 60, resolucao: 3600 },
    });
    expect(await linhas(a)).toHaveLength(4);

    // Tirar a meta de resolução e o padrão deixa 1 linha; o prazo da espera muda.
    const { id: idEditada } = await salvar(a, { name: 'Financeiro 2', padrao: false, queueIds: [a.queueId], metas: { espera_fila: 120 } }, id);
    expect(await linhas(a)).toEqual([
      { nome: 'Financeiro 2', alvo: 'espera_fila', prazo_seg: 120, escopo_tipo: 'fila' },
    ]);

    await noTenant(a.tenantId, (tx) => excluirPoliticaSla(tx, a.tenantId, a.agentId, idEditada));
    expect(await linhas(a)).toEqual([]);
  });

  it('recusa nome repetido e a mesma meta no mesmo escopo em outra política', async () => {
    await salvar(a, { name: 'Uma', padrao: false, queueIds: [a.queueId], metas: { espera_fila: 60 } });
    await expect(
      salvar(a, { name: 'Uma', padrao: true, metas: { resolucao: 60 } }),
    ).rejects.toMatchObject({ codigo: 'name_in_use' });
    await expect(
      salvar(a, { name: 'Duas', padrao: false, queueIds: [a.queueId], metas: { espera_fila: 90 } }),
    ).rejects.toMatchObject({ codigo: 'sla_scope_conflict' });
  });

  it('recusa fila de outro tenant, e a política de um tenant não aparece nem se edita pelo outro', async () => {
    await expect(
      salvar(a, { name: 'Alheia', padrao: false, queueIds: [b.queueId], metas: { resolucao: 60 } }),
    ).rejects.toMatchObject({ codigo: 'queue_not_found' });

    const [existente] = await linhas(a);
    expect(existente).toBeDefined();
    const { rows } = await a.dono.execute<{ id: string }>(sql`
      select id from regra_sla where tenant_id = ${a.tenantId}::uuid limit 1
    `);
    await permitir(b);
    await expect(
      salvar(b, { name: 'Invasão', padrao: true, metas: { resolucao: 60 } }, rows[0]!.id),
    ).rejects.toThrow();
    await expect(
      noTenant(b.tenantId, (tx) => excluirPoliticaSla(tx, b.tenantId, b.agentId, rows[0]!.id)),
    ).rejects.toThrow();
    expect(await linhas(b)).toEqual([]);
    expect((await linhas(a)).length).toBeGreaterThan(0);
  });

  it('recusa quem não tem a permissão de gerenciar regras', async () => {
    const c = await montarCenario(`pol-c-${randomUUID().slice(0, 8)}`);
    try {
      await expect(
        salvar(c, { name: 'Sem permissão', padrao: true, metas: { resolucao: 60 } }),
      ).rejects.toThrow();
    } finally {
      await c.encerrar();
    }
  });
});

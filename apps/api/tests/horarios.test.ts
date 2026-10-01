import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { dentroDoExpediente } from '@pipe/core';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { montarCenario } = await import('./ajuda.js');
const { agruparPeriodos, diasDoPeriodo, excluirHorario, horarioConferido, salvarHorarioCompleto } =
  await import('../src/domain/management/horarios.js');
const { carregarHorarios } = await import('../src/domain/management/registrations.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

const base = { name: 'Comercial', queueIds: [], faixas: [], periods: [] };

describe('horarioConferido', () => {
  it('aceita e normaliza', () => {
    expect(
      horarioConferido({
        name: ' Comercial ',
        faixas: [{ dayWeek: 1, start: '08:00', end: '18:00' }],
        periods: [{ title: ' Recesso ', from: '2026-12-24', to: '2026-12-26' }],
      }),
    ).toEqual({
      name: 'Comercial',
      queueIds: [],
      faixas: [{ dayWeek: 1, start: '08:00', end: '18:00' }],
      periods: [{ title: 'Recesso', from: '2026-12-24', to: '2026-12-26' }],
    });
  });

  it.each([
    ['sem nome', { ...base, name: ' ' }],
    ['nome longo', { ...base, name: 'x'.repeat(101) }],
    ['corpo que não é objeto', 'x'],
    ['fila que não é uuid', { ...base, queueIds: ['1'] }],
    ['dia da semana inválido', { ...base, faixas: [{ dayWeek: 7, start: '08:00', end: '18:00' }] }],
    ['hora inválida', { ...base, faixas: [{ dayWeek: 1, start: '8h', end: '18:00' }] }],
    ['fim antes do início', { ...base, faixas: [{ dayWeek: 1, start: '18:00', end: '08:00' }] }],
    [
      'faixas sobrepostas',
      {
        ...base,
        faixas: [
          { dayWeek: 1, start: '08:00', end: '12:00' },
          { dayWeek: 1, start: '11:00', end: '18:00' },
        ],
      },
    ],
    ['data inexistente', { ...base, periods: [{ title: '', from: '2026-02-31', to: '2026-03-01' }] }],
    ['fim do período antes do início', { ...base, periods: [{ title: '', from: '2026-03-02', to: '2026-03-01' }] }],
    ['período de 91 dias', { ...base, periods: [{ title: '', from: '2026-01-01', to: '2026-04-02' }] }],
    [
      'períodos sobrepostos',
      {
        ...base,
        periods: [
          { title: 'a', from: '2026-01-01', to: '2026-01-10' },
          { title: 'b', from: '2026-01-10', to: '2026-01-12' },
        ],
      },
    ],
  ])('recusa %s', (_nome, corpo) => {
    expect(() => horarioConferido(corpo)).toThrow();
  });

  it('aceita período de exatamente 90 dias e faixas encostadas', () => {
    expect(() =>
      horarioConferido({
        ...base,
        faixas: [
          { dayWeek: 1, start: '08:00', end: '12:00' },
          { dayWeek: 1, start: '12:00', end: '18:00' },
        ],
        periods: [{ title: '', from: '2026-01-01', to: '2026-03-31' }],
      }),
    ).not.toThrow();
  });
});

describe('dias do período', () => {
  it('expande atravessando mês e ano, inclusive nas pontas', () => {
    expect(diasDoPeriodo('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(diasDoPeriodo('2026-10-01', '2026-10-01')).toEqual(['2026-10-01']);
  });

  it('agrupa dias consecutivos com o mesmo título e separa os demais', () => {
    expect(
      agruparPeriodos([
        { data: '2026-12-26', motivo: 'Recesso' },
        { data: '2026-12-24', motivo: 'Recesso' },
        { data: '2026-12-25', motivo: 'Recesso' },
        { data: '2026-12-27', motivo: 'Outro' },
        { data: '2026-12-29', motivo: null },
      ]),
    ).toEqual([
      { title: 'Recesso', from: '2026-12-24', to: '2026-12-26' },
      { title: 'Outro', from: '2026-12-27', to: '2026-12-27' },
      { title: '', from: '2026-12-29', to: '2026-12-29' },
    ]);
  });

  it('o dia fechado vale no fuso do horário: a virada do dia é a meia-noite local, não a UTC', () => {
    const horario = {
      fuso: 'America/Sao_Paulo',
      faixas: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, inicio: '00:00', fim: '24:00' })),
      exceptions: [{ data: '2026-10-02', fechado: true, inicio: null, fim: null }],
    };
    expect(dentroDoExpediente(new Date('2026-10-02T02:59:00Z'), horario)).toBe(true);
    expect(dentroDoExpediente(new Date('2026-10-02T03:00:00Z'), horario)).toBe(false);
    expect(dentroDoExpediente(new Date('2026-10-03T02:59:00Z'), horario)).toBe(false);
    expect(dentroDoExpediente(new Date('2026-10-03T03:00:00Z'), horario)).toBe(true);
  });
});

describe('horário gravado no banco', () => {
  let a: Cenario;
  let b: Cenario;

  async function permitir(c: Cenario): Promise<void> {
    await c.dono.execute(sql`
      insert into usuario_permissao (tenant_id, usuario_id, permissao_codigo, concedida)
      values (${c.tenantId}::uuid, ${c.agentId}::uuid, 'horario.gerenciar', true)
    `);
  }
  const salvar = (c: Cenario, corpo: unknown, id?: string) =>
    noTenant(c.tenantId, (tx) => salvarHorarioCompleto(tx, c.tenantId, c.agentId, corpo, id));
  const ler = (c: Cenario) => noTenant(c.tenantId, (tx) => carregarHorarios(tx));

  beforeAll(async () => {
    a = await montarCenario(`hor-a-${randomUUID().slice(0, 8)}`);
    b = await montarCenario(`hor-b-${randomUUID().slice(0, 8)}`);
    await permitir(a);
    await permitir(b);
  }, 180_000);

  afterAll(async () => {
    await a?.encerrar();
    await b?.encerrar();
  });

  it('cria, lê, edita e exclui; a fila vinculada volta a ficar sem horário', async () => {
    const { id } = await salvar(a, {
      name: 'Comercial',
      queueIds: [a.queueId],
      faixas: [
        { dayWeek: 1, start: '08:00', end: '12:00' },
        { dayWeek: 1, start: '13:00', end: '18:00' },
      ],
      periods: [{ title: 'Recesso', from: '2026-12-24', to: '2026-12-26' }],
    });
    let lido = await ler(a);
    const h = lido.horarios.find((x) => x.id === id)!;
    expect(h.faixas).toHaveLength(2);
    expect(h.queueIds).toEqual([a.queueId]);
    expect(h.periods).toEqual([{ title: 'Recesso', from: '2026-12-24', to: '2026-12-26' }]);
    expect(lido.queueList.map((q) => q.id)).toContain(a.queueId);

    await salvar(
      a,
      { name: 'Comercial 2', queueIds: [], faixas: [{ dayWeek: 2, start: '09:00', end: '10:00' }], periods: [] },
      id,
    );
    lido = await ler(a);
    const editado = lido.horarios.find((x) => x.id === id)!;
    expect(editado).toMatchObject({ name: 'Comercial 2', queueIds: [], periods: [] });
    expect(editado.faixas).toHaveLength(1);

    await salvar(a, { name: 'Comercial 2', queueIds: [a.queueId], faixas: [], periods: [] }, id);
    await noTenant(a.tenantId, (tx) => excluirHorario(tx, a.tenantId, a.agentId, id));
    const { rows } = await a.dono.execute<{ horario_id: string | null }>(sql`
      select horario_id from fila where id = ${a.queueId}::uuid
    `);
    expect(rows[0]!.horario_id).toBeNull();
    expect((await ler(a)).horarios.find((x) => x.id === id)).toBeUndefined();
  });

  it('guarda a exceção com horário especial e recusa período que cai em cima dela', async () => {
    const { id } = await salvar(a, { ...base, name: 'Com exceção' });
    await a.dono.execute(sql`
      insert into horario_excecao (tenant_id, horario_id, data, fechado, inicio, fim)
      values (${a.tenantId}::uuid, ${id}::uuid, '2026-11-20', false, '10:00', '14:00')
    `);
    await salvar(
      a,
      { ...base, name: 'Com exceção', periods: [{ title: '', from: '2026-11-01', to: '2026-11-02' }] },
      id,
    );
    const { rows } = await a.dono.execute<{ data: string; fechado: boolean }>(sql`
      select data::text as data, fechado from horario_excecao where horario_id = ${id}::uuid order by data
    `);
    expect(rows).toEqual([
      { data: '2026-11-01', fechado: true },
      { data: '2026-11-02', fechado: true },
      { data: '2026-11-20', fechado: false },
    ]);
    await expect(
      salvar(
        a,
        { ...base, name: 'Com exceção', periods: [{ title: '', from: '2026-11-19', to: '2026-11-21' }] },
        id,
      ),
    ).rejects.toMatchObject({ codigo: 'period_conflicts_exception' });
  });

  it('recusa nome repetido no mesmo tenant', async () => {
    await salvar(a, { ...base, name: 'Único' });
    await expect(salvar(a, { ...base, name: 'Único' })).rejects.toMatchObject({ codigo: 'name_in_use' });
  });

  it('isola o tenant: fila alheia recusada; editar e excluir por outro tenant falham', async () => {
    await expect(salvar(a, { ...base, name: 'Alheia', queueIds: [b.queueId] })).rejects.toMatchObject({
      codigo: 'not_found',
    });
    const { id } = await salvar(b, { ...base, name: 'Do B' });
    await expect(salvar(a, { ...base, name: 'Invasão' }, id)).rejects.toThrow();
    await expect(noTenant(a.tenantId, (tx) => excluirHorario(tx, a.tenantId, a.agentId, id))).rejects.toThrow();
    expect((await ler(b)).horarios.map((x) => x.name)).toContain('Do B');
    expect((await ler(a)).horarios.map((x) => x.name)).not.toContain('Do B');
  });

  it('recusa quem não tem a permissão de gerenciar horários', async () => {
    const c = await montarCenario(`hor-c-${randomUUID().slice(0, 8)}`);
    try {
      await expect(salvar(c, { ...base, name: 'Sem permissão' })).rejects.toThrow();
    } finally {
      await c.encerrar();
    }
  });
});

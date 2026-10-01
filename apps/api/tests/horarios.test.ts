import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
const { queueUnavailability } = await import('../src/domain/queue-entry.js');

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
      description: null,
      regular: false,
      queueIds: [],
      faixas: [{ dayWeek: 1, start: '08:00', end: '18:00' }],
      periods: [{ title: 'Recesso', fullDay: true, from: '2026-12-24', fromTime: '00:00', to: '2026-12-26', toTime: '23:59' }],
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
      { title: 'Recesso', fullDay: true, from: '2026-12-24', fromTime: '00:00', to: '2026-12-26', toTime: '23:59' },
      { title: 'Outro', fullDay: true, from: '2026-12-27', fromTime: '00:00', to: '2026-12-27', toTime: '23:59' },
      { title: '', fullDay: true, from: '2026-12-29', fromTime: '00:00', to: '2026-12-29', toTime: '23:59' },
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
    expect(h.periods).toEqual([{ title: 'Recesso', fullDay: true, from: '2026-12-24', fromTime: '00:00', to: '2026-12-26', toTime: '23:59' }]);
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

describe('horarioConferido: descrição, regular e períodos com hora', () => {
  const periodo = (extra: Record<string, unknown>) => ({
    ...base,
    periods: [{ title: 'p', from: '2026-12-24', to: '2026-12-24', fullDay: false, fromTime: '14:00', toTime: '18:00', ...extra }],
  });

  it('aceita descrição, regular e período com hora', () => {
    expect(horarioConferido({ ...periodo({}), description: ' Padrão ', regular: true })).toMatchObject({
      description: 'Padrão',
      regular: true,
      periods: [{ fullDay: false, fromTime: '14:00', toTime: '18:00' }],
    });
  });

  it.each([
    ['descrição acima de 300', { ...base, description: 'x'.repeat(301) }],
    ['fim antes do início no mesmo dia', periodo({ fromTime: '18:00', toTime: '14:00' })],
    ['fim igual ao início', periodo({ toTime: '14:00' })],
    ['hora inválida', periodo({ fromTime: '25:00' })],
    ['hora ausente sem dia completo', periodo({ fromTime: undefined })],
    [
      'períodos com hora que se sobrepõem',
      { ...base, periods: [periodo({}).periods[0], periodo({ fromTime: '17:00', toTime: '19:00' }).periods[0]] },
    ],
    [
      'dia completo em cima de período com hora',
      { ...base, periods: [periodo({}).periods[0], { title: '', from: '2026-12-24', to: '2026-12-24' }] },
    ],
  ])('recusa %s', (_nome, corpo) => {
    expect(() => horarioConferido(corpo)).toThrow();
  });

  it('aceita períodos com hora encostados no mesmo dia e vários dias com hora', () => {
    expect(() =>
      horarioConferido({
        ...base,
        periods: [
          periodo({ toTime: '16:00' }).periods[0],
          periodo({ fromTime: '16:00', toTime: '18:00' }).periods[0],
          { title: '', from: '2027-01-01', to: '2027-03-31', fullDay: false, fromTime: '10:00', toTime: '09:00' },
        ],
      }),
    ).not.toThrow();
  });
});

describe('horário regular e fila sem horário', () => {
  const AGORA = new Date('2026-10-14T15:00:00Z');
  const DIA_TODO = [0, 1, 2, 3, 4, 5, 6].map((dayWeek) => ({ dayWeek, start: '00:00', end: '23:59' }));
  let a: Cenario;
  let b: Cenario;
  const salvar = (c: Cenario, corpo: unknown, id?: string) =>
    noTenant(c.tenantId, (tx) => salvarHorarioCompleto(tx, c.tenantId, c.agentId, corpo, id));
  const ler = (c: Cenario) => noTenant(c.tenantId, (tx) => carregarHorarios(tx));
  const excluir = (c: Cenario, id: string) =>
    noTenant(c.tenantId, (tx) => excluirHorario(tx, c.tenantId, c.agentId, id));
  const situacao = (c: Cenario, em: Date = AGORA) =>
    noTenant(c.tenantId, (tx) => queueUnavailability(tx, c.tenantId, c.queueId, em, ['OutOfAttendanceHour']));
  /** Fechado sempre: sem faixa nenhuma. */
  const fechado = { ...base, faixas: [] };
  const aberto = { ...base, faixas: DIA_TODO };

  beforeAll(async () => {
    a = await montarCenario(`reg-a-${randomUUID().slice(0, 8)}`);
    b = await montarCenario(`reg-b-${randomUUID().slice(0, 8)}`);
    for (const c of [a, b]) {
      await c.dono.execute(sql`
        insert into usuario_permissao (tenant_id, usuario_id, permissao_codigo, concedida)
        values (${c.tenantId}::uuid, ${c.agentId}::uuid, 'horario.gerenciar', true)
      `);
    }
  }, 180_000);

  beforeEach(async () => {
    for (const c of [a, b]) {
      await c.dono.execute(sql`delete from horario_atendimento where tenant_id = ${c.tenantId}::uuid`);
    }
  });

  afterAll(async () => {
    await a?.encerrar();
    await b?.encerrar();
  });

  it('fila sem horário usa o regular: regular fechado dá OutOfAttendanceHour', async () => {
    expect(await situacao(a)).toBeNull();
    await salvar(a, { ...fechado, name: 'Regular', regular: true });
    expect(await situacao(a)).toBe('OutOfAttendanceHour');
  });

  it('fila com horário próprio não é afetada pelo regular', async () => {
    await salvar(a, { ...fechado, name: 'Regular', regular: true });
    await salvar(a, { ...aberto, name: 'Próprio', queueIds: [a.queueId] });
    expect(await situacao(a)).toBeNull();
  });

  it('excluir o horário da fila faz a fila usar o regular; sem regular, volta a 24 horas', async () => {
    const { id: regular } = await salvar(a, { ...aberto, name: 'Regular', regular: true });
    const { id: proprio } = await salvar(a, { ...fechado, name: 'Fechado', queueIds: [a.queueId] });
    expect(await situacao(a)).toBe('OutOfAttendanceHour');
    await excluir(a, proprio);
    expect(await situacao(a)).toBeNull(); // regular aberto
    await salvar(a, { ...fechado, name: 'Regular', regular: true }, regular);
    expect(await situacao(a)).toBe('OutOfAttendanceHour'); // regular fechado
    await excluir(a, regular);
    expect(await situacao(a)).toBeNull(); // nenhum horário: 24 horas
  });

  it('marcar outro horário como regular desmarca o anterior; no máximo um por tenant', async () => {
    const { id: um } = await salvar(a, { ...aberto, name: 'Um', regular: true });
    const { id: dois } = await salvar(a, { ...aberto, name: 'Dois', regular: true });
    const lido = (await ler(a)).horarios;
    expect(lido.find((h) => h.id === um)?.regular).toBe(false);
    expect(lido.find((h) => h.id === dois)?.regular).toBe(true);
    await salvar(a, { ...aberto, name: 'Dois', regular: false }, dois);
    expect((await ler(a)).horarios.some((h) => h.regular)).toBe(false);
  });

  it('o horário regular de outro tenant não vale para a fila deste', async () => {
    await salvar(b, { ...fechado, name: 'Regular do B', regular: true });
    expect(await situacao(a)).toBeNull();
    expect(await situacao(b)).toBe('OutOfAttendanceHour');
  });

  it('grava e lê descrição, dia completo e período com hora; o fuso do tenant decide a virada', async () => {
    const { id } = await salvar(a, {
      ...aberto,
      name: 'Com períodos',
      description: 'Horário de feriados',
      queueIds: [a.queueId],
      periods: [
        { title: 'Natal', from: '2026-12-24', to: '2026-12-25', fullDay: true },
        { title: 'Tarde', from: '2026-12-30', to: '2026-12-31', fullDay: false, fromTime: '14:00', toTime: '09:00' },
      ],
    });
    const h = (await ler(a)).horarios.find((x) => x.id === id)!;
    expect(h.description).toBe('Horário de feriados');
    expect(h.periods).toEqual([
      { title: 'Natal', fullDay: true, from: '2026-12-24', fromTime: '00:00', to: '2026-12-25', toTime: '23:59' },
      { title: 'Tarde', fullDay: false, from: '2026-12-30', fromTime: '14:00', to: '2026-12-31', toTime: '09:00' },
    ]);
    // dia completo: 24/12 00:00 a 26/12 00:00 em America/Sao_Paulo (UTC-3)
    expect(await situacao(a, new Date('2026-12-24T02:58:00Z'))).toBeNull();
    expect(await situacao(a, new Date('2026-12-24T03:00:00Z'))).toBe('OutOfAttendanceHour');
    expect(await situacao(a, new Date('2026-12-26T02:59:00Z'))).toBe('OutOfAttendanceHour');
    expect(await situacao(a, new Date('2026-12-26T03:00:00Z'))).toBeNull();
    // com hora: 30/12 14:00 a 31/12 09:00 locais
    expect(await situacao(a, new Date('2026-12-30T16:59:00Z'))).toBeNull();
    expect(await situacao(a, new Date('2026-12-30T17:00:00Z'))).toBe('OutOfAttendanceHour');
    expect(await situacao(a, new Date('2026-12-31T11:59:00Z'))).toBe('OutOfAttendanceHour');
    expect(await situacao(a, new Date('2026-12-31T12:00:00Z'))).toBeNull();
  });
});

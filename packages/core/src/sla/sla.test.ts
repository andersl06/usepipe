import { describe, expect, it } from 'vitest';

import {
  avaliarSla,
  avancarNoExpediente,
  dentroDoExpediente,
  faixasDoDia,
  inicioDoAlvo,
  alvoFulfillment,
  minutosDoRelogio,
  proximaAbertura,
  segundosUteisEntre,
  subtrairEsperas,
  type Espera,
  type HourAttendance,
} from './index.js';

/**
 * Weekday business hours are 09:00–18:00 in the tenant timezone. São Paulo remains UTC−3 throughout these 2026 tests, so 09:00 local equals 12:00Z. Reference dates: 02/03 Monday, 03/03 Tuesday, 04/03 Wednesday, 07/03 Saturday, 08/03 Sunday.
 */
const COMERCIAL: HourAttendance = {
  fuso: 'America/Sao_Paulo',
  faixas: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, inicio: '09:00', fim: '18:00' })),
  exceptions: [],
};

/** Mesmo expediente, com 03/03 como feriado. */
const COM_FERIADO: HourAttendance = {
  ...COMERCIAL,
  exceptions: [{ data: '2026-03-03', fechado: true, motivo: 'Feriado municipal' }],
};

/** Split schedule: 09:00–12:00 and 13:00–18:00, excluding lunch. */
const COM_ALMOCO: HourAttendance = {
  fuso: 'America/Sao_Paulo',
  faixas: [
    { diaSemana: 1, inicio: '09:00', fim: '12:00' },
    { diaSemana: 1, inicio: '13:00', fim: '18:00' },
  ],
};

const utc = (iso: string) => new Date(iso);

describe('relógio local do tenant', () => {
  it('converte HH:MM em minutos, inclusive 24:00', () => {
    expect(minutosDoRelogio('00:00')).toBe(0);
    expect(minutosDoRelogio('09:30')).toBe(570);
    expect(minutosDoRelogio('18:00')).toBe(1080);
    expect(minutosDoRelogio('24:00')).toBe(1440);
  });

  it('faixas do dia respeitam o dia da semana', () => {
    expect(faixasDoDia(COMERCIAL, 2026, 3, 2)).toEqual([{ de: 540, ate: 1080 }]); // segunda
    expect(faixasDoDia(COMERCIAL, 2026, 3, 7)).toEqual([]); // sábado
    expect(faixasDoDia(COMERCIAL, 2026, 3, 8)).toEqual([]); // domingo
  });

  it('a holiday closes the whole day', () => {
    expect(faixasDoDia(COM_FERIADO, 2026, 3, 3)).toEqual([]);
  });

  it('an exception with its own hours overrides the weekly band', () => {
    const vespera: HourAttendance = {
      ...COMERCIAL,
      exceptions: [{ data: '2026-03-03', fechado: false, inicio: '09:00', fim: '13:00' }],
    };
    expect(faixasDoDia(vespera, 2026, 3, 3)).toEqual([{ de: 540, ate: 780 }]);
  });

  const casosDentro: [string, boolean][] = [
    ['2026-03-02T11:59:59Z', false], // 08:59:59 local
    ['2026-03-02T12:00:00Z', true], // 09:00:00 local, abertura
    ['2026-03-02T20:59:59Z', true], // 17:59:59 local
    ['2026-03-02T21:00:00Z', false], // 18:00:00 local, fechamento
    ['2026-03-07T15:00:00Z', false], // sábado
  ];
  for (const [iso, esperado] of casosDentro) {
    it(`${iso} ${esperado ? 'está' : 'não está'} no expediente`, () => {
      expect(dentroDoExpediente(utc(iso), COMERCIAL)).toBe(esperado);
    });
  }

  it('sem horário configurado, é ininterrupto', () => {
    expect(dentroDoExpediente(utc('2026-03-08T03:00:00Z'), null)).toBe(true);
  });
});

describe('próxima abertura (§10)', () => {
  const casos: [string, string | null][] = [
    ['2026-03-02T13:00:00Z', '2026-03-02T13:00:00.000Z'],
    ['2026-03-02T05:00:00Z', '2026-03-02T12:00:00.000Z'],
    ['2026-03-02T21:30:00Z', '2026-03-03T12:00:00.000Z'],
    ['2026-03-07T15:00:00Z', '2026-03-09T12:00:00.000Z'],
  ];
  for (const [inbound, esperado] of casos) {
    it(`de ${inbound} abre em ${esperado}`, () => {
      expect(proximaAbertura(utc(inbound), COMERCIAL)?.toISOString()).toBe(esperado);
    });
  }

  it('expediente sem faixa nenhuma nunca abre', () => {
    expect(proximaAbertura(utc('2026-03-02T13:00:00Z'), { fuso: 'America/Sao_Paulo', faixas: [] })).toBeNull();
  });
});

describe('segundos úteis entre dois instantes', () => {
  const casos: { nome: string; de: string; ate: string; esperado: number }[] = [
    { nome: 'meia hora dentro do expediente', de: '2026-03-02T13:00:00Z', ate: '2026-03-02T13:30:00Z', esperado: 1800 },
    { nome: 'a madrugada não conta', de: '2026-03-02T05:00:00Z', ate: '2026-03-02T12:30:00Z', esperado: 1800 },
    { nome: 'um dia comercial inteiro tem 9 horas', de: '2026-03-02T00:00:00Z', ate: '2026-03-03T00:00:00Z', esperado: 32_400 },
    { nome: 'o fim de semana inteiro vale zero', de: '2026-03-07T00:00:00Z', ate: '2026-03-09T00:00:00Z', esperado: 0 },
    { nome: 'intervalo invertido vale zero', de: '2026-03-02T14:00:00Z', ate: '2026-03-02T13:00:00Z', esperado: 0 },
    { nome: 'atravessando a virada do expediente', de: '2026-03-02T20:30:00Z', ate: '2026-03-03T12:30:00Z', esperado: 3600 },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(segundosUteisEntre(utc(caso.de), utc(caso.ate), COMERCIAL)).toBe(caso.esperado);
    });
  }

  it('lunch outside business hours does not count', () => {
    expect(
      segundosUteisEntre(utc('2026-03-02T14:30:00Z'), utc('2026-03-02T16:30:00Z'), COM_ALMOCO),
    ).toBe(3600);
  });

  it('with no configured hours, everything counts', () => {
    expect(segundosUteisEntre(utc('2026-03-08T03:00:00Z'), utc('2026-03-08T04:00:00Z'), null)).toBe(3600);
  });
});

describe('esperas pausam o relógio', () => {
  it('subtracts the wait window from the intervals', () => {
    const intervalos = [{ inicio: utc('2026-03-02T10:00:00Z'), fim: utc('2026-03-02T11:00:00Z') }];
    const esperas: Espera[] = [
      { inicio: utc('2026-03-02T10:10:00Z'), fim: utc('2026-03-02T10:40:00Z') },
    ];
    expect(subtrairEsperas(intervalos, esperas)).toEqual([
      { inicio: utc('2026-03-02T10:00:00Z'), fim: utc('2026-03-02T10:10:00Z') },
      { inicio: utc('2026-03-02T10:40:00Z'), fim: utc('2026-03-02T11:00:00Z') },
    ]);
  });

  it('espera aberta corta tudo dali para a frente', () => {
    const intervalos = [{ inicio: utc('2026-03-02T10:00:00Z'), fim: utc('2026-03-02T11:00:00Z') }];
    expect(subtrairEsperas(intervalos, [{ inicio: utc('2026-03-02T10:10:00Z'), fim: null }])).toEqual([
      { inicio: utc('2026-03-02T10:00:00Z'), fim: utc('2026-03-02T10:10:00Z') },
    ]);
  });

  it('a wait covering the whole interval zeros the clock', () => {
    const intervalos = [{ inicio: utc('2026-03-02T10:00:00Z'), fim: utc('2026-03-02T11:00:00Z') }];
    expect(
      subtrairEsperas(intervalos, [
        { inicio: utc('2026-03-02T09:00:00Z'), fim: utc('2026-03-02T12:00:00Z') },
      ]),
    ).toEqual([]);
  });
});

describe('avançar no expediente', () => {
  const casos: { nome: string; de: string; segundos: number; esperado: string | null }[] = [
    { nome: 'meia hora dentro do dia', de: '2026-03-02T13:00:00Z', segundos: 1800, esperado: '2026-03-02T13:30:00.000Z' },
    { nome: 'atravessa a virada do expediente', de: '2026-03-02T20:30:00Z', segundos: 3600, esperado: '2026-03-03T12:30:00.000Z' },
    { nome: 'começa na abertura seguinte', de: '2026-03-02T05:00:00Z', segundos: 1800, esperado: '2026-03-02T12:30:00.000Z' },
    { nome: 'pula o fim de semana', de: '2026-03-06T20:30:00Z', segundos: 3600, esperado: '2026-03-09T12:30:00.000Z' },
    { nome: 'prazo zero não anda', de: '2026-03-02T13:00:00Z', segundos: 0, esperado: '2026-03-02T13:00:00.000Z' },
    // Forty business hours from Monday 09:00: Monday through Thursday supply 36 hours; the remaining four run Friday from 09:00 to 13:00 local (16:00Z).
    // fecham 36h; as 4h restantes caem na sexta, de 09:00 a 13:00 local (16:00Z).
    { nome: 'prazo longo, em dias úteis', de: '2026-03-02T12:00:00Z', segundos: 40 * 3600, esperado: '2026-03-06T16:00:00.000Z' },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(avancarNoExpediente(utc(caso.de), caso.segundos, COMERCIAL)?.toISOString() ?? null).toBe(
        caso.esperado,
      );
    });
  }

  it('feriado empurra o prazo para o dia seguinte útil', () => {
    // Monday 17:30 with a one-hour deadline uses 30 minutes Monday; Tuesday is a holiday, leaving
    // 30 minutes on Wednesday, ending at 09:30 local or 12:30Z.
    expect(
      avancarNoExpediente(utc('2026-03-02T20:30:00Z'), 3600, COM_FERIADO)?.toISOString(),
    ).toBe('2026-03-04T12:30:00.000Z');
  });

  it('expediente sem faixa nenhuma não tem prazo', () => {
    expect(
      avancarNoExpediente(utc('2026-03-02T13:00:00Z'), 60, { fuso: 'America/Sao_Paulo', faixas: [] }),
    ).toBeNull();
  });

  it('espera aberta deixa o prazo indefinido', () => {
    expect(
      avancarNoExpediente(utc('2026-03-02T13:00:00Z'), 3600, COMERCIAL, [
        { inicio: utc('2026-03-02T13:10:00Z'), fim: null },
      ]),
    ).toBeNull();
  });
});

describe('SLA evaluation (§11)', () => {
  const regra = { prazoSeg: 3600, alertaSeg: 1800 };

  const casos: { nome: string; agora: string; state: string; decorrido: number }[] = [
    { nome: 'dentro do prazo', agora: '2026-03-02T13:15:00Z', state: 'dentro', decorrido: 900 },
    { nome: 'no limiar exato do alerta', agora: '2026-03-02T13:30:00Z', state: 'alerta', decorrido: 1800 },
    { nome: 'entre o alerta e o estouro', agora: '2026-03-02T13:45:00Z', state: 'alerta', decorrido: 2700 },
    { nome: 'no segundo exato do estouro', agora: '2026-03-02T14:00:00Z', state: 'estourado', decorrido: 3600 },
    { nome: 'muito depois do estouro', agora: '2026-03-02T16:00:00Z', state: 'estourado', decorrido: 10_800 },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      const saida = avaliarSla({
        regra,
        inicio: utc('2026-03-02T13:00:00Z'),
        agora: utc(caso.agora),
        horario: COMERCIAL,
      });
      expect(saida.state).toBe(caso.state);
      expect(saida.decorridoSeg).toBe(caso.decorrido);
      expect(saida.prazoEm?.toISOString()).toBe('2026-03-02T14:00:00.000Z');
      expect(saida.alertaEm?.toISOString()).toBe('2026-03-02T13:30:00.000Z');
    });
  }

  it('a conversation arriving outside business hours does not breach overnight', () => {
    const saida = avaliarSla({
      regra,
      inicio: utc('2026-03-03T05:00:00Z'),
      agora: utc('2026-03-03T11:00:00Z'),
      horario: COMERCIAL,
    });
    expect(saida.decorridoSeg).toBe(0);
    expect(saida.state).toBe('dentro');
    expect(saida.inicioEfetivo?.toISOString()).toBe('2026-03-03T12:00:00.000Z');
    expect(saida.prazoEm?.toISOString()).toBe('2026-03-03T13:00:00.000Z');
  });

  it('prazo que atravessa a virada do expediente', () => {
    const saida = avaliarSla({
      regra,
      inicio: utc('2026-03-02T20:30:00Z'), // 17:30 local
      agora: utc('2026-03-02T20:50:00Z'),
      horario: COMERCIAL,
    });
    expect(saida.decorridoSeg).toBe(1200);
    expect(saida.state).toBe('dentro');
    expect(saida.prazoEm?.toISOString()).toBe('2026-03-03T12:30:00.000Z');
  });

  it('espera pausa o relógio: 60 min de parede, 30 de SLA', () => {
    const saida = avaliarSla({
      regra,
      inicio: utc('2026-03-02T13:00:00Z'),
      agora: utc('2026-03-02T14:00:00Z'),
      horario: COMERCIAL,
      esperas: [{ inicio: utc('2026-03-02T13:10:00Z'), fim: utc('2026-03-02T13:40:00Z') }],
    });
    expect(saida.decorridoSeg).toBe(1800);
    expect(saida.state).toBe('alerta');
    expect(saida.restanteSeg).toBe(1800);
    // O estouro escorrega os 30 minutos da espera.
    expect(saida.prazoEm?.toISOString()).toBe('2026-03-02T14:30:00.000Z');
  });

  it('espera ainda aberta: sem data de estouro a prometer', () => {
    const saida = avaliarSla({
      regra,
      inicio: utc('2026-03-02T13:00:00Z'),
      agora: utc('2026-03-02T14:00:00Z'),
      horario: COMERCIAL,
      esperas: [{ inicio: utc('2026-03-02T13:10:00Z'), fim: null }],
    });
    expect(saida.decorridoSeg).toBe(600);
    expect(saida.state).toBe('dentro');
    expect(saida.prazoEm).toBeNull();
  });

  it('alvo cumprido congela o decorrido', () => {
    const saida = avaliarSla({
      regra,
      inicio: utc('2026-03-02T13:00:00Z'),
      agora: utc('2026-03-02T17:00:00Z'),
      cumpridoEm: utc('2026-03-02T13:20:00Z'),
      horario: COMERCIAL,
    });
    expect(saida.cumprido).toBe(true);
    expect(saida.decorridoSeg).toBe(1200);
    expect(saida.state).toBe('dentro');
  });

  it('sem limiar de alerta, pula direto de dentro para estourado', () => {
    const saida = avaliarSla({
      regra: { prazoSeg: 3600 },
      inicio: utc('2026-03-02T13:00:00Z'),
      agora: utc('2026-03-02T13:59:59Z'),
      horario: COMERCIAL,
    });
    expect(saida.state).toBe('dentro');
    expect(saida.alertaEm).toBeNull();
  });

  it('uninterrupted attendance ignores business hours', () => {
    const saida = avaliarSla({
      regra,
      inicio: utc('2026-03-08T03:00:00Z'), // domingo de madrugada
      agora: utc('2026-03-08T04:00:00Z'),
      horario: null,
    });
    expect(saida.decorridoSeg).toBe(3600);
    expect(saida.state).toBe('estourado');
  });
});

describe('start and fulfillment per target', () => {
  const marcos = {
    criadaEm: utc('2026-03-02T12:00:00Z'),
    atribuidaEm: utc('2026-03-02T12:10:00Z'),
    firstRespostaIn: utc('2026-03-02T12:20:00Z'),
    encerradaEm: utc('2026-03-02T13:00:00Z'),
    aguardandoRespostaDesde: utc('2026-03-02T12:40:00Z'),
  };

  it('first response counts from assignment', () => {
    expect(inicioDoAlvo('primeira_resposta', marcos)).toEqual(marcos.atribuidaEm);
    expect(alvoFulfillment('primeira_resposta', marcos)).toEqual(marcos.firstRespostaIn);
  });

  it('with no assignment, the first response counts from creation', () => {
    expect(inicioDoAlvo('primeira_resposta', { ...marcos, atribuidaEm: null })).toEqual(marcos.criadaEm);
  });

  it('response time counts from the customer\'s last unanswered message', () => {
    expect(inicioDoAlvo('tempo_resposta', marcos)).toEqual(marcos.aguardandoRespostaDesde);
    expect(inicioDoAlvo('tempo_resposta', { ...marcos, aguardandoRespostaDesde: null })).toBeNull();
  });

  it('closure counts from creation', () => {
    expect(inicioDoAlvo('encerramento', marcos)).toEqual(marcos.criadaEm);
    expect(alvoFulfillment('encerramento', marcos)).toEqual(marcos.encerradaEm);
  });
});

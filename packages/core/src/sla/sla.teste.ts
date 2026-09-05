import { describe, expect, it } from 'vitest';

import {
  avaliarSla,
  avancarNoExpediente,
  dentroDoExpediente,
  faixasDoDia,
  inicioDoAlvo,
  cumprimentoDoAlvo,
  minutosDoRelogio,
  proximaAbertura,
  segundosUteisEntre,
  subtrairEsperas,
  type Espera,
  type HorarioAtendimento,
} from './index.js';

/**
 * Expediente comercial de segunda a sexta, 09:00–18:00, no fuso do tenant.
 * São Paulo está em UTC−3 o ano inteiro desde 2019, então 09:00 local = 12:00Z.
 *
 * Datas de referência (todas de 2026):
 *   02/03 segunda · 03/03 terça · 04/03 quarta · 07/03 sábado · 08/03 domingo
 */
const COMERCIAL: HorarioAtendimento = {
  fuso: 'America/Sao_Paulo',
  faixas: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, inicio: '09:00', fim: '18:00' })),
  excecoes: [],
};

/** Mesmo expediente, com 03/03 como feriado. */
const COM_FERIADO: HorarioAtendimento = {
  ...COMERCIAL,
  excecoes: [{ data: '2026-03-03', fechado: true, motivo: 'Feriado municipal' }],
};

/** Expediente partido: 09:00–12:00 e 13:00–18:00, com almoço fora. */
const COM_ALMOCO: HorarioAtendimento = {
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

  it('feriado fecha o dia inteiro', () => {
    expect(faixasDoDia(COM_FERIADO, 2026, 3, 3)).toEqual([]);
  });

  it('exceção com horário próprio manda sobre a faixa semanal', () => {
    const vespera: HorarioAtendimento = {
      ...COMERCIAL,
      excecoes: [{ data: '2026-03-03', fechado: false, inicio: '09:00', fim: '13:00' }],
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
    // Dentro do expediente: a abertura é o próprio instante.
    ['2026-03-02T13:00:00Z', '2026-03-02T13:00:00.000Z'],
    // Madrugada de segunda → abre às 09:00 local da própria segunda.
    ['2026-03-02T05:00:00Z', '2026-03-02T12:00:00.000Z'],
    // Depois do fechamento de segunda → abre na terça.
    ['2026-03-02T21:30:00Z', '2026-03-03T12:00:00.000Z'],
    // Sábado → abre na segunda seguinte.
    ['2026-03-07T15:00:00Z', '2026-03-09T12:00:00.000Z'],
  ];
  for (const [entrada, esperado] of casos) {
    it(`de ${entrada} abre em ${esperado}`, () => {
      expect(proximaAbertura(utc(entrada), COMERCIAL)?.toISOString()).toBe(esperado);
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
    // 17:30 de segunda até 09:30 de terça: 30 min de segunda + 30 min de terça.
    { nome: 'atravessando a virada do expediente', de: '2026-03-02T20:30:00Z', ate: '2026-03-03T12:30:00Z', esperado: 3600 },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(segundosUteisEntre(utc(caso.de), utc(caso.ate), COMERCIAL)).toBe(caso.esperado);
    });
  }

  it('almoço fora do expediente não conta', () => {
    // 11:30 → 13:30 local: 30 min antes do almoço + 30 min depois.
    expect(
      segundosUteisEntre(utc('2026-03-02T14:30:00Z'), utc('2026-03-02T16:30:00Z'), COM_ALMOCO),
    ).toBe(3600);
  });

  it('sem horário configurado conta tudo', () => {
    expect(segundosUteisEntre(utc('2026-03-08T03:00:00Z'), utc('2026-03-08T04:00:00Z'), null)).toBe(3600);
  });
});

describe('esperas pausam o relógio', () => {
  it('subtrai a janela de espera dos intervalos', () => {
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

  it('espera que cobre o intervalo inteiro zera o relógio', () => {
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
    // Começa às 17:30 local: 30 min cabem na segunda, os outros 30 caem às 09:30 de terça.
    { nome: 'atravessa a virada do expediente', de: '2026-03-02T20:30:00Z', segundos: 3600, esperado: '2026-03-03T12:30:00.000Z' },
    // Chegou de madrugada: o relógio só começa às 09:00 local.
    { nome: 'começa na abertura seguinte', de: '2026-03-02T05:00:00Z', segundos: 1800, esperado: '2026-03-02T12:30:00.000Z' },
    // Sexta às 17:30 → 30 min na sexta, resto na segunda.
    { nome: 'pula o fim de semana', de: '2026-03-06T20:30:00Z', segundos: 3600, esperado: '2026-03-09T12:30:00.000Z' },
    { nome: 'prazo zero não anda', de: '2026-03-02T13:00:00Z', segundos: 0, esperado: '2026-03-02T13:00:00.000Z' },
    // 40 horas úteis a partir de segunda 09:00: 9h por dia de segunda a quinta
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
    // 17:30 de segunda, prazo de 1h: 30 min na segunda; terça é feriado; sobra
    // meia hora na quarta, às 09:30 local = 12:30Z.
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

describe('avaliação de SLA (§11)', () => {
  const regra = { prazoSeg: 3600, alertaSeg: 1800 };

  const casos: { nome: string; agora: string; estado: string; decorrido: number }[] = [
    { nome: 'dentro do prazo', agora: '2026-03-02T13:15:00Z', estado: 'dentro', decorrido: 900 },
    { nome: 'no limiar exato do alerta', agora: '2026-03-02T13:30:00Z', estado: 'alerta', decorrido: 1800 },
    { nome: 'entre o alerta e o estouro', agora: '2026-03-02T13:45:00Z', estado: 'alerta', decorrido: 2700 },
    { nome: 'no segundo exato do estouro', agora: '2026-03-02T14:00:00Z', estado: 'estourado', decorrido: 3600 },
    { nome: 'muito depois do estouro', agora: '2026-03-02T16:00:00Z', estado: 'estourado', decorrido: 10_800 },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      const saida = avaliarSla({
        regra,
        inicio: utc('2026-03-02T13:00:00Z'),
        agora: utc(caso.agora),
        horario: COMERCIAL,
      });
      expect(saida.estado).toBe(caso.estado);
      expect(saida.decorridoSeg).toBe(caso.decorrido);
      expect(saida.prazoEm?.toISOString()).toBe('2026-03-02T14:00:00.000Z');
      expect(saida.alertaEm?.toISOString()).toBe('2026-03-02T13:30:00.000Z');
    });
  }

  it('conversa que chega fora do expediente não estoura na madrugada', () => {
    // Chegou às 02:00 local de terça; às 08:00 local o relógio ainda não começou.
    const saida = avaliarSla({
      regra,
      inicio: utc('2026-03-03T05:00:00Z'),
      agora: utc('2026-03-03T11:00:00Z'),
      horario: COMERCIAL,
    });
    expect(saida.decorridoSeg).toBe(0);
    expect(saida.estado).toBe('dentro');
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
    expect(saida.estado).toBe('dentro');
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
    expect(saida.estado).toBe('alerta');
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
    expect(saida.estado).toBe('dentro');
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
    expect(saida.estado).toBe('dentro');
  });

  it('sem limiar de alerta, pula direto de dentro para estourado', () => {
    const saida = avaliarSla({
      regra: { prazoSeg: 3600 },
      inicio: utc('2026-03-02T13:00:00Z'),
      agora: utc('2026-03-02T13:59:59Z'),
      horario: COMERCIAL,
    });
    expect(saida.estado).toBe('dentro');
    expect(saida.alertaEm).toBeNull();
  });

  it('atendimento ininterrupto ignora expediente', () => {
    const saida = avaliarSla({
      regra,
      inicio: utc('2026-03-08T03:00:00Z'), // domingo de madrugada
      agora: utc('2026-03-08T04:00:00Z'),
      horario: null,
    });
    expect(saida.decorridoSeg).toBe(3600);
    expect(saida.estado).toBe('estourado');
  });
});

describe('início e cumprimento por alvo', () => {
  const marcos = {
    criadaEm: utc('2026-03-02T12:00:00Z'),
    atribuidaEm: utc('2026-03-02T12:10:00Z'),
    primeiraRespostaEm: utc('2026-03-02T12:20:00Z'),
    encerradaEm: utc('2026-03-02T13:00:00Z'),
    aguardandoRespostaDesde: utc('2026-03-02T12:40:00Z'),
  };

  it('primeira resposta parte da atribuição', () => {
    expect(inicioDoAlvo('primeira_resposta', marcos)).toEqual(marcos.atribuidaEm);
    expect(cumprimentoDoAlvo('primeira_resposta', marcos)).toEqual(marcos.primeiraRespostaEm);
  });

  it('sem atribuição, a primeira resposta parte da criação', () => {
    expect(inicioDoAlvo('primeira_resposta', { ...marcos, atribuidaEm: null })).toEqual(marcos.criadaEm);
  });

  it('tempo de resposta parte da última mensagem do cliente sem resposta', () => {
    expect(inicioDoAlvo('tempo_resposta', marcos)).toEqual(marcos.aguardandoRespostaDesde);
    expect(inicioDoAlvo('tempo_resposta', { ...marcos, aguardandoRespostaDesde: null })).toBeNull();
  });

  it('encerramento parte da criação', () => {
    expect(inicioDoAlvo('encerramento', marcos)).toEqual(marcos.criadaEm);
    expect(cumprimentoDoAlvo('encerramento', marcos)).toEqual(marcos.encerradaEm);
  });
});

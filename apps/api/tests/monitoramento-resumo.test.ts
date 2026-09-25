import { describe, expect, it } from 'vitest';
import { metricsByKey, normalizeTicketsByHour } from '../src/dominio/gestao/monitoramento.js';

const metrica = (value: number | null) => ({ value, populacao: value === null ? 0 : 1, excluidas: 0, soma: value ?? 0 });

describe('resumo detalhado do monitoramento', () => {
  it('leva as médias já calculadas no relatório para cada linha da tabela', () => {
    const resumo = metricsByKey([
      {
        chave: 'Comercial',
        conversations: 3,
        inQueue: metrica(30),
        firstResponse: metrica(45),
        esperaTotal: metrica(60),
        resposta: { ...metrica(20), conversationsConsideradas: 2 },
        attendance: metrica(120),
        closures: { perdida: 0, abandonada: 0, finalizada: 3, fechada: 3, abertas: 0 },
      },
    ]);

    expect(resumo.get('Comercial')).toEqual({
      conversasFinalizadas: 3,
      tempoMedioNaFilaSeg: 30,
      tempoMedioPrimeiraRespostaSeg: 45,
      tempoMedioAtendimentoSeg: 120,
    });
  });
});

describe('tickets abertos por hora', () => {
  it('preenche as 24 horas sem inventar dados entre os horários retornados pelo banco', () => {
    expect(normalizeTicketsByHour([{ hora: 8, total: 3 }, { hora: 23, total: 1 }])).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);
  });
});

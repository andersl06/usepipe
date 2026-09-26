import { describe, expect, it } from 'vitest';
import { metricsByKey, normalizeTicketsByHour } from '../src/domain/management/monitoring.js';

const metrica = (value: number | null) => ({ value, population: value === null ? 0 : 1, excluidas: 0, soma: value ?? 0 });

describe('Build the detailed monitoring summary', () => {
  it('Carry precomputed report averages into each summary table row', () => {
    const resumo = metricsByKey([
      {
        key: 'Comercial',
        conversations: 3,
        inQueue: metrica(30),
        firstResponse: metrica(45),
        esperaTotal: metrica(60),
        resposta: { ...metrica(20), conversationsConsidered: 2 },
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

describe('Count opened tickets by hour', () => {
  it('Fill all 24 hourly slots with zeroes where the database returned no data', () => {
    expect(normalizeTicketsByHour([{ hour: 8, total: 3 }, { hour: 23, total: 1 }])).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);
  });
});

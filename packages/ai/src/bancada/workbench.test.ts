import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { calcularNota } from '../evaluation/index.js';
import type { ResultEvaluation } from '../evaluation/index.js';
import { FormatIaError } from '../cliente/index.js';
import { consumoDe } from '../consumo/index.js';
import { carregarConjunto, lerConjunto, rodarBancada, type CasoReferencia } from './index.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONJUNTO = join(AQUI, '..', '..', 'fixtures', 'conjunto-referencia.json');

async function conjunto(): Promise<CasoReferencia[]> {
  return lerConjunto(CONJUNTO);
}


function avaliadorQueResponde(trocas: Record<string, Record<string, string>> = {}) {
  return async (caso: CasoReferencia): Promise<ResultEvaluation> => {
    const troca = trocas[caso.id] ?? {};
    const calculada = calcularNota(
      caso.formulario,
      caso.gabarito.map((g) => ({
        criterioId: g.criterioId,
        value: troca[g.criterioId] ?? g.value,
        justificativa: 'dublê',
        evidenciaMessageId: null,
      })),
    );
    return {
      formularioId: caso.formulario.id,
      nota: calculada.nota,
      notaAntesDoFatal: calculada.notaAntesDoFatal,
      fatalReprovados: calculada.fatalReprovados,
      respostas: calculada.respostas,
      confianca: 0.7,
      consumo: consumoDe('claude-sonnet-5', 5_000, 600),
      template: 'claude-sonnet-5',
      prompt: 'avaliacao@v1',
    };
  };
}

describe('conjunto de referência', () => {
  it('loads the cases from the file and converts timestamps into Date', async () => {
    const casos = await conjunto();
    expect(casos.length).toBeGreaterThanOrEqual(3);
    expect(casos[0]!.messages[0]!.criadaEm).toBeInstanceOf(Date);
    expect(casos.map((c) => c.id)).toContain('dado-de-terceiro');
  });

  it('tem gabarito humano cobrindo todos os critérios de cada formulário', async () => {
    for (const caso of await conjunto()) {
      const ids = caso.formulario.groups.flatMap((g) => g.criterios.map((c) => c.id));
      expect(caso.gabarito.map((g) => g.criterioId).sort()).toEqual([...ids].sort());
    }
  });

  it('the "third-party data" answer key zeros the score via the fatal criterion', async () => {
    const caso = (await conjunto()).find((c) => c.id === 'dado-de-terceiro')!;
    const nota = calcularNota(
      caso.formulario,
      caso.gabarito.map((g) => ({ ...g, justificativa: 'g', evidenciaMessageId: null })),
    );
    expect(nota.nota).toBe(0);
    expect(nota.notaAntesDoFatal).toBeGreaterThan(0);
    expect(nota.fatalReprovados).toEqual(['c-dados']);
  });

  it('recusa gabarito que cita critério inexistente', () => {
    expect(() =>
      carregarConjunto({
        casos: [
          {
            id: 'x',
            mensagens: [
              {
                id: 'a',
                criadaEm: '2026-03-02T13:00:00Z',
                direcao: 'entrada',
                autorTipo: 'contato',
                tipo: 'texto',
                conteudo: 'oi',
              },
            ],
            formulario: {
              id: 'f',
              nome: 'f',
              notaMaxima: 100,
              grupos: [
                {
                  id: 'g',
                  nome: 'g',
                  peso: 1,
                  criterios: [{ id: 'c1', nome: 'c1', peso: 1, tipo: 'conforme', fatal: false }],
                },
              ],
            },
            gabarito: [{ criterioId: 'c-que-nao-existe', value: 'conforme' }],
          },
        ],
      }),
    ).toThrow(FormatIaError);
  });

  it('rejects malformed JSON', () => {
    expect(() => carregarConjunto({ casos: [] })).toThrow(FormatIaError);
    expect(() => carregarConjunto('nada disso')).toThrow(FormatIaError);
  });
});

describe('bancada', () => {
  it('IA idêntica ao humano dá acurácia cheia e desvio zero', async () => {
    const casos = await conjunto();
    const r = await rodarBancada({ casos, avaliar: avaliadorQueResponde() });

    expect(r.casos).toBe(casos.length);
    expect(r.falhas).toEqual([]);
    expect(r.acuraciaGeral).toBe(1);
    expect(r.desvioMedioNota).toBe(0);
    for (const c of r.byCriterio) expect(c.acuracia).toBe(1);
  });

  it('measures deviation per criterion, not just the total', async () => {
    const casos = await conjunto();
    const r = await rodarBancada({
      casos,
      avaliar: avaliadorQueResponde({ 'troca-sem-prazo': { 'c-prazo': 'conforme' } }),
    });

    const prazo = r.byCriterio.find((c) => c.criterioId === 'c-prazo')!;
    expect(prazo.n).toBe(casos.length);
    expect(prazo.acertos).toBe(casos.length - 1);
    expect(prazo.acuracia).toBeCloseTo((casos.length - 1) / casos.length, 4);
    expect(prazo.desvioMedioPontos).toBeGreaterThan(0);

    const greeting = r.byCriterio.find((c) => c.criterioId === 'c-saudacao')!;
    expect(greeting.acuracia).toBe(1);
    expect(greeting.desvioMedioPontos).toBe(0);

    // O total sozinho esconderia o estrago: 1 de 30 respostas erradas.
    expect(r.acuraciaGeral).toBeLessThan(1);
    expect(r.acuraciaGeral).toBeGreaterThan(0.9);
  });

  it('sorts from worst criterion to best: that is the queue of prompts to review', async () => {
    const casos = await conjunto();
    const r = await rodarBancada({
      casos,
      avaliar: avaliadorQueResponde({
        'troca-sem-prazo': { 'c-prazo': 'conforme', 'c-clareza': '5' },
        'cliente-irritado': { 'c-prazo': 'nao_conforme', 'c-clareza': '5' },
        'boleto-resolvido': { 'c-clareza': '2' },
      }),
    });

    const acuracias = r.byCriterio.map((c) => c.acuracia);
    expect([...acuracias].sort((a, b) => a - b)).toEqual(acuracias);
    expect(r.byCriterio[0]!.criterioId).toBe('c-clareza');
  });

  it('desvio da nota acompanha a diferença real, inclusive quando o fatal zera', async () => {
    const casos = await conjunto();
    // The AI misses exposure of a third party's data: the human zeroed the score, but the AI did not.
    const r = await rodarBancada({
      casos,
      avaliar: avaliadorQueResponde({ 'dado-de-terceiro': { 'c-dados': 'conforme' } }),
    });
    const caso = r.byCaso.find((c) => c.casoId === 'dado-de-terceiro')!;
    expect(caso.notaHumana).toBe(0);
    expect(caso.notaIa).toBeGreaterThan(80);
    expect(caso.desvioNota).toBe(caso.notaIa);
    expect(r.desvioMedioNota).toBeCloseTo(caso.desvioNota / casos.length, 2);
  });

  it('caso que estoura vira falha declarada e sai do denominador', async () => {
    const casos = await conjunto();
    const r = await rodarBancada({
      casos,
      avaliar: async (caso) => {
        if (caso.id === 'cliente-irritado') throw new Error('modelo recusou');
        return avaliadorQueResponde()(caso);
      },
    });

    expect(r.falhas).toEqual([{ casoId: 'cliente-irritado', erro: 'modelo recusou' }]);
    expect(r.casos).toBe(casos.length - 1);
    // A failed case neither improves nor worsens accuracy: it is excluded from the calculation but reported.
    expect(r.acuraciaGeral).toBe(1);
    expect(r.byCriterio[0]!.n).toBe(casos.length - 1);
  });

  it('sums consumption across all cases, per model', async () => {
    const casos = await conjunto();
    const r = await rodarBancada({ casos, avaliar: avaliadorQueResponde() });
    expect(r.consumo).toHaveLength(1);
    expect(r.consumo[0]!.tokensInbound).toBe(5_000 * casos.length);
    expect(r.consumo[0]!.custoCentavos).toBeGreaterThan(0);
  });
});

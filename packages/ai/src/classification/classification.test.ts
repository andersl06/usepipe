import { describe, expect, it } from 'vitest';

import type { ChamadaEstruturada } from '../cliente/index.js';
import { FormatIaError } from '../cliente/index.js';
import { consumoDe } from '../consumo/index.js';
import { PROMPT_CLASSIFICATION, optionKey, prepararOptions } from '../prompts/index.js';
import type { Taxonomia } from '../prompts/index.js';
import { montarTranscription } from '../transcription/index.js';
import { matchOption, classificarConversation, normalizarRotulo } from './index.js';

const taxonomia: Taxonomia = {
  options: [
    { categoria: 'Financeiro', subcategoria: 'Segunda via', usos: 900 },
    { categoria: 'Suporte', subcategoria: 'Troca de produto', usos: 300 },
    { categoria: 'Financeiro', subcategoria: 'Cobrança em duplicidade', usos: 120 },
    { categoria: 'Cadastro', usos: 40 },
    { categoria: 'Outros', usos: 1 },
  ],
  intents: ['resolver', 'informar-se', 'reclamar'],
};

const transcription = montarTranscription([
  {
    id: 'uuid-a',
    criadaEm: new Date('2026-03-02T13:00:00Z'),
    direction: 'entrada',
    autorTipo: 'contato',
    tipo: 'texto',
    conteudo: 'perdi o boleto, consigo a segunda via?',
  },
]);

function duble(saida: Record<string, unknown>): ChamadaEstruturada {
  return async () =>
    ({
      dados: saida as never,
      consumo: consumoDe('claude-sonnet-5', 3_000, 200),
      modelo: 'claude-sonnet-5',
    }) as never;
}

describe('option preparation', () => {
  it('sorts by actual usage, from most chosen to least', () => {
    expect(prepararOptions(taxonomia).map(optionKey)).toEqual([
      'Financeiro > Segunda via',
      'Suporte > Troca de produto',
      'Financeiro > Cobrança em duplicidade',
      'Cadastro',
      'Outros',
    ]);
  });

  it('poda a lista ao teto pedido', () => {
    expect(prepararOptions(taxonomia, 2).map(optionKey)).toEqual([
      'Financeiro > Segunda via',
      'Suporte > Troca de produto',
    ]);
  });

  it('breaks ties alphabetically so the list stays stable across runs', () => {
    const sem = { opcoes: [{ categoria: 'Zeta' }, { categoria: 'Alfa' }, { categoria: 'Meio' }] };
    expect(prepararOptions(sem).map(optionKey)).toEqual(['Alfa', 'Meio', 'Zeta']);
  });

  it('nunca devolve lista vazia', () => {
    expect(prepararOptions(taxonomia, 0)).toHaveLength(1);
  });
});

describe('classification prompt', () => {
  it('lists options in usage order and reports the transcript cutoff', () => {
    const texto = PROMPT_CLASSIFICATION.montar({
      transcription: 'oi',
      truncada: true,
      messagesOmitidas: 12,
      taxonomia,
      maxOptions: 2,
    });
    expect(texto.sistema.indexOf('Financeiro > Segunda via')).toBeLessThan(
      texto.sistema.indexOf('Suporte > Troca de produto'),
    );
    expect(texto.sistema).not.toContain('Outros');
    expect(texto.user).toContain('12 mensagens do meio foram omitidas');
  });
});

describe('label normalization', () => {
  it('perdoa acento, caixa, espaço duplo e aspa em HTML', () => {
    expect(normalizarRotulo('Cobrança  em   Duplicidade')).toBe('cobranca em duplicidade');
    expect(normalizarRotulo('Diz &quot;oi&quot;')).toBe('diz "oi"');
    expect(normalizarRotulo('  Café & Cia ')).toBe('cafe & cia');
  });

  it('matches the option even when the model writes it differently', () => {
    const achada = matchOption(prepararOptions(taxonomia), 'financeiro', 'cobranca  em duplicidade');
    expect(achada?.subcategoria).toBe('Cobrança em duplicidade');
  });
});

describe('classifyConversation', () => {
  it('stores the taxonomy label, not what the model typed', async () => {
    const r = await classificarConversation({
      transcription,
      taxonomia,
      chamar: duble({
        desfecho: 'Cliente pediu a segunda via e a atendente enviou.',
        categoria: 'financeiro',
        subcategoria: 'segunda  via',
        intencao: 'resolver',
        sentimento: 'positivo',
        confianca: 0.82,
      }),
    });

    expect(r.categoria).toBe('Financeiro');
    expect(r.subcategoria).toBe('Segunda via');
    expect(r.sentiment).toBe('positivo');
    expect(r.confianca).toBe(0.82);
    expect(r.prompt).toBe('classificacao@v1');
  });

  it('accepts an option without a subcategory', async () => {
    const r = await classificarConversation({
      transcription,
      taxonomia,
      chamar: duble({
        desfecho: 'x',
        categoria: 'Cadastro',
        subcategoria: null,
        intencao: null,
        sentimento: 'neutro',
        confianca: 0.5,
      }),
    });
    expect(r.categoria).toBe('Cadastro');
    expect(r.subcategoria).toBeNull();
  });

  it('recusa rótulo fora da lista apresentada', async () => {
    await expect(
      classificarConversation({
        transcription,
        taxonomia,
        chamar: duble({
          desfecho: 'x',
          categoria: 'Jurídico',
          subcategoria: 'Processo',
          intencao: null,
          sentimento: 'neutro',
          confianca: 0.9,
        }),
      }),
    ).rejects.toThrow(FormatIaError);
  });

  it('rejects an option pruned from the list, even if it exists in the taxonomy', async () => {
    await expect(
      classificarConversation({
        transcription,
        taxonomia,
        maxOptions: 1,
        chamar: duble({
          desfecho: 'x',
          categoria: 'Outros',
          subcategoria: null,
          intencao: null,
          sentimento: 'neutro',
          confianca: 0.9,
        }),
      }),
    ).rejects.toThrow(FormatIaError);
  });
});

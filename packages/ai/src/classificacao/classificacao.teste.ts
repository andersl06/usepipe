import { describe, expect, it } from 'vitest';

import type { ChamadaEstruturada } from '../cliente/index.js';
import { ErroFormatoIa } from '../cliente/index.js';
import { consumoDe } from '../consumo/index.js';
import { PROMPT_CLASSIFICACAO, chaveDaOpcao, prepararOpcoes } from '../prompts/index.js';
import type { Taxonomia } from '../prompts/index.js';
import { montarTranscricao } from '../transcricao/index.js';
import { casarOpcao, classificarConversa, normalizarRotulo } from './index.js';

const taxonomia: Taxonomia = {
  opcoes: [
    { categoria: 'Financeiro', subcategoria: 'Segunda via', usos: 900 },
    { categoria: 'Suporte', subcategoria: 'Troca de produto', usos: 300 },
    { categoria: 'Financeiro', subcategoria: 'Cobrança em duplicidade', usos: 120 },
    { categoria: 'Cadastro', usos: 40 },
    { categoria: 'Outros', usos: 1 },
  ],
  intencoes: ['resolver', 'informar-se', 'reclamar'],
};

const transcricao = montarTranscricao([
  {
    id: 'uuid-a',
    criadaEm: new Date('2026-03-02T13:00:00Z'),
    direcao: 'entrada',
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

describe('preparo das opções', () => {
  it('ordena por uso real, do mais escolhido para o menos', () => {
    expect(prepararOpcoes(taxonomia).map(chaveDaOpcao)).toEqual([
      'Financeiro > Segunda via',
      'Suporte > Troca de produto',
      'Financeiro > Cobrança em duplicidade',
      'Cadastro',
      'Outros',
    ]);
  });

  it('poda a lista ao teto pedido', () => {
    expect(prepararOpcoes(taxonomia, 2).map(chaveDaOpcao)).toEqual([
      'Financeiro > Segunda via',
      'Suporte > Troca de produto',
    ]);
  });

  it('desempata em ordem alfabética para a lista ser estável entre execuções', () => {
    const sem = { opcoes: [{ categoria: 'Zeta' }, { categoria: 'Alfa' }, { categoria: 'Meio' }] };
    expect(prepararOpcoes(sem).map(chaveDaOpcao)).toEqual(['Alfa', 'Meio', 'Zeta']);
  });

  it('nunca devolve lista vazia', () => {
    expect(prepararOpcoes(taxonomia, 0)).toHaveLength(1);
  });
});

describe('prompt de classificação', () => {
  it('lista as opções na ordem de uso e informa o corte da transcrição', () => {
    const texto = PROMPT_CLASSIFICACAO.montar({
      transcricao: 'oi',
      truncada: true,
      mensagensOmitidas: 12,
      taxonomia,
      maxOpcoes: 2,
    });
    expect(texto.sistema.indexOf('Financeiro > Segunda via')).toBeLessThan(
      texto.sistema.indexOf('Suporte > Troca de produto'),
    );
    expect(texto.sistema).not.toContain('Outros');
    expect(texto.usuario).toContain('12 mensagens do meio foram omitidas');
  });
});

describe('normalização do rótulo', () => {
  it('perdoa acento, caixa, espaço duplo e aspa em HTML', () => {
    expect(normalizarRotulo('Cobrança  em   Duplicidade')).toBe('cobranca em duplicidade');
    expect(normalizarRotulo('Diz &quot;oi&quot;')).toBe('diz "oi"');
    expect(normalizarRotulo('  Café & Cia ')).toBe('cafe & cia');
  });

  it('casa a opção mesmo com o modelo escrevendo diferente', () => {
    const achada = casarOpcao(prepararOpcoes(taxonomia), 'financeiro', 'cobranca  em duplicidade');
    expect(achada?.subcategoria).toBe('Cobrança em duplicidade');
  });
});

describe('classificarConversa', () => {
  it('grava o rótulo da taxonomia, não o que o modelo digitou', async () => {
    const r = await classificarConversa({
      transcricao,
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
    expect(r.sentimento).toBe('positivo');
    expect(r.confianca).toBe(0.82);
    expect(r.prompt).toBe('classificacao@v1');
  });

  it('aceita opção sem subcategoria', async () => {
    const r = await classificarConversa({
      transcricao,
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
      classificarConversa({
        transcricao,
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
    ).rejects.toThrow(ErroFormatoIa);
  });

  it('recusa opção podada da lista, mesmo existindo na taxonomia', async () => {
    await expect(
      classificarConversa({
        transcricao,
        taxonomia,
        maxOpcoes: 1,
        chamar: duble({
          desfecho: 'x',
          categoria: 'Outros',
          subcategoria: null,
          intencao: null,
          sentimento: 'neutro',
          confianca: 0.9,
        }),
      }),
    ).rejects.toThrow(ErroFormatoIa);
  });
});

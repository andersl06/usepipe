import { describe, expect, it } from 'vitest';

import {
  avaliarCondicao,
  avaliarExpressao,
  calcularScore,
  faixaDoValor,
  lerCampo,
  type DadosLead,
  type FaixaScore,
  type RegraScore,
} from './index.js';

/**
 * Faixas do dia 1, espelhando o corte do webhook n8n `kq4lU8aFv5CKNpvr`:
 * 60 ou mais vai para closer, abaixo disso para o Comercial.
 */
const FAIXAS: FaixaScore[] = [
  { nome: 'frio', minimo: 0, maximo: 39 },
  { nome: 'morno', minimo: 40, maximo: 59 },
  { nome: 'quente', minimo: 60, maximo: null },
];

const REGRAS: RegraScore[] = [
  {
    id: 'r1',
    nome: 'renda alta',
    versao: 2,
    pontos: 30,
    ativa: true,
    condicao: { campo: 'renda', operador: 'maior_igual', valor: 10_000 },
  },
  {
    id: 'r2',
    nome: 'quer investir',
    versao: 1,
    pontos: 20,
    ativa: true,
    condicao: {
      combinador: 'ou',
      condicoes: [
        { campo: 'objetivo', operador: 'igual', valor: 'investir' },
        { campo: 'interesses', operador: 'contem', valor: 'renda passiva' },
      ],
    },
  },
  {
    id: 'r3',
    nome: 'e-mail corporativo',
    versao: 1,
    pontos: 10,
    ativa: false, // desligada: não pode entrar no cálculo nem na explicação
    condicao: { campo: 'contato.email', operador: 'contem', valor: '@empresa' },
  },
  {
    id: 'r4',
    nome: 'sem telefone',
    versao: 1,
    pontos: -15,
    ativa: true,
    condicao: { campo: 'contato.telefone', operador: 'nao_existe' },
  },
  {
    id: 'r5',
    nome: 'origem qualificada',
    versao: 1,
    pontos: 25,
    ativa: true,
    condicao: { campo: 'origem', operador: 'em', valor: ['indicacao', 'evento'] },
  },
];

const LEAD_QUENTE: DadosLead = {
  renda: 12_000,
  objetivo: 'Investir', // acento e caixa não podem quebrar a comparação
  origem: 'indicacao',
  contato: { email: 'ana@empresa.com.br', telefone: '+5511999990000' },
};

const LEAD_MORNO: DadosLead = {
  renda: 3_000,
  interesses: ['renda passiva', 'previdência'],
  origem: 'site',
  contato: { email: 'joao@gmail.com' },
};

const LEAD_VAZIO: DadosLead = {};

describe('leitura de campo', () => {
  const casos: [string, unknown][] = [
    ['renda', 12_000],
    ['contato.email', 'ana@empresa.com.br'],
    ['contato.inexistente', undefined],
    ['nada.de.nada', undefined],
  ];
  for (const [caminho, esperado] of casos) {
    it(`lê ${caminho}`, () => {
      expect(lerCampo(LEAD_QUENTE, caminho)).toEqual(esperado);
    });
  }
});

describe('operadores de condição', () => {
  const dados: DadosLead = {
    nome: 'Ana Maria',
    idade: 34,
    tags: ['vip', 'renovação'],
    saldo: '1500',
    vazio: '',
  };

  const casos: { nome: string; condicao: Parameters<typeof avaliarCondicao>[0]; esperado: boolean }[] = [
    { nome: 'igual com acento e caixa diferentes', condicao: { campo: 'nome', operador: 'igual', valor: 'ana maria' }, esperado: true },
    { nome: 'diferente', condicao: { campo: 'nome', operador: 'diferente', valor: 'joão' }, esperado: true },
    { nome: 'contém em texto', condicao: { campo: 'nome', operador: 'contem', valor: 'maria' }, esperado: true },
    { nome: 'contém em lista', condicao: { campo: 'tags', operador: 'contem', valor: 'VIP' }, esperado: true },
    { nome: 'não contém', condicao: { campo: 'nome', operador: 'nao_contem', valor: 'pedro' }, esperado: true },
    { nome: 'não contém em campo ausente é verdadeiro', condicao: { campo: 'sumiu', operador: 'nao_contem', valor: 'x' }, esperado: true },
    { nome: 'maior', condicao: { campo: 'idade', operador: 'maior', valor: 30 }, esperado: true },
    { nome: 'maior_igual no limite', condicao: { campo: 'idade', operador: 'maior_igual', valor: 34 }, esperado: true },
    { nome: 'menor', condicao: { campo: 'idade', operador: 'menor', valor: 34 }, esperado: false },
    { nome: 'menor_igual no limite', condicao: { campo: 'idade', operador: 'menor_igual', valor: 34 }, esperado: true },
    { nome: 'número em texto compara como número', condicao: { campo: 'saldo', operador: 'maior', valor: 1000 }, esperado: true },
    { nome: 'comparação numérica com texto não numérico é falsa', condicao: { campo: 'nome', operador: 'maior', valor: 10 }, esperado: false },
    { nome: 'em', condicao: { campo: 'idade', operador: 'em', valor: [30, 34, 40] }, esperado: true },
    { nome: 'nao_em', condicao: { campo: 'idade', operador: 'nao_em', valor: [1, 2] }, esperado: true },
    { nome: 'existe', condicao: { campo: 'nome', operador: 'existe' }, esperado: true },
    { nome: 'string vazia não existe', condicao: { campo: 'vazio', operador: 'existe' }, esperado: false },
    { nome: 'nao_existe em campo ausente', condicao: { campo: 'sumiu', operador: 'nao_existe' }, esperado: true },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(avaliarCondicao(caso.condicao, dados)).toBe(caso.esperado);
    });
  }
});

describe('composição com E e OU', () => {
  const dados: DadosLead = { a: 1, b: 2 };

  it('E exige todas', () => {
    expect(
      avaliarExpressao(
        {
          combinador: 'e',
          condicoes: [
            { campo: 'a', operador: 'igual', valor: 1 },
            { campo: 'b', operador: 'igual', valor: 2 },
          ],
        },
        dados,
      ),
    ).toBe(true);
    expect(
      avaliarExpressao(
        {
          combinador: 'e',
          condicoes: [
            { campo: 'a', operador: 'igual', valor: 1 },
            { campo: 'b', operador: 'igual', valor: 99 },
          ],
        },
        dados,
      ),
    ).toBe(false);
  });

  it('OU exige uma', () => {
    expect(
      avaliarExpressao(
        {
          combinador: 'ou',
          condicoes: [
            { campo: 'a', operador: 'igual', valor: 99 },
            { campo: 'b', operador: 'igual', valor: 2 },
          ],
        },
        dados,
      ),
    ).toBe(true);
  });

  it('aninhamento de E dentro de OU', () => {
    expect(
      avaliarExpressao(
        {
          combinador: 'ou',
          condicoes: [
            { campo: 'a', operador: 'igual', valor: 99 },
            {
              combinador: 'e',
              condicoes: [
                { campo: 'a', operador: 'igual', valor: 1 },
                { campo: 'b', operador: 'igual', valor: 2 },
              ],
            },
          ],
        },
        dados,
      ),
    ).toBe(true);
  });

  it('composta sem condição nenhuma não casa', () => {
    expect(avaliarExpressao({ combinador: 'e', condicoes: [] }, dados)).toBe(false);
  });
});

describe('faixas', () => {
  const casos: [number, string | null][] = [
    [0, 'frio'],
    [39, 'frio'],
    [40, 'morno'],
    [59, 'morno'],
    [60, 'quente'], // o corte do closer
    [1000, 'quente'],
    [-1, null],
  ];
  for (const [valor, esperado] of casos) {
    it(`${valor} cai em ${esperado ?? 'nenhuma faixa'}`, () => {
      expect(faixaDoValor(valor, FAIXAS)).toBe(esperado);
    });
  }
});

describe('cálculo de score', () => {
  it('lead quente: 30 + 20 + 25 = 75', () => {
    const saida = calcularScore(REGRAS, LEAD_QUENTE, { faixas: FAIXAS });
    expect(saida.valor).toBe(75);
    expect(saida.faixa).toBe('quente');
    expect(saida.explicacao).toEqual([
      { regra: 'r1', versao: 2, pontos: 30 },
      { regra: 'r2', versao: 1, pontos: 20 },
      { regra: 'r5', versao: 1, pontos: 25 },
    ]);
    // A maior versão entre as regras ativas é a carimbada no score_lead.
    expect(saida.versaoRegra).toBe(2);
  });

  it('lead morno: 20 de interesse menos 15 por não ter telefone = 5', () => {
    const saida = calcularScore(REGRAS, LEAD_MORNO, { faixas: FAIXAS });
    expect(saida.valor).toBe(5);
    expect(saida.faixa).toBe('frio');
    expect(saida.explicacao).toEqual([
      { regra: 'r2', versao: 1, pontos: 20 },
      { regra: 'r4', versao: 1, pontos: -15 },
    ]);
  });

  it('lead vazio: só a penalidade de -15, e faixa nenhuma', () => {
    const saida = calcularScore(REGRAS, LEAD_VAZIO, { faixas: FAIXAS });
    expect(saida.valor).toBe(-15);
    expect(saida.faixa).toBeNull();
    expect(saida.explicacao).toEqual([{ regra: 'r4', versao: 1, pontos: -15 }]);
  });

  it('regra desativada não conta nem aparece na explicação', () => {
    // r3 casaria com ana@empresa.com.br, mas está inativa.
    const saida = calcularScore(REGRAS, LEAD_QUENTE, { faixas: FAIXAS });
    expect(saida.explicacao.some((item) => item.regra === 'r3')).toBe(false);
    expect(saida.valor).toBe(75);
  });

  it('a explicação soma exatamente o valor', () => {
    const saida = calcularScore(REGRAS, LEAD_QUENTE);
    expect(saida.explicacao.reduce((total, item) => total + item.pontos, 0)).toBe(saida.valor);
  });

  it('é determinístico: a ordem das regras na entrada não muda a saída', () => {
    const embaralhada = [REGRAS[4], REGRAS[1], REGRAS[3], REGRAS[0], REGRAS[2]] as RegraScore[];
    expect(calcularScore(embaralhada, LEAD_QUENTE, { faixas: FAIXAS })).toEqual(
      calcularScore(REGRAS, LEAD_QUENTE, { faixas: FAIXAS }),
    );
  });

  it('é reprodutível: dez execuções seguidas produzem o mesmo JSON', () => {
    const primeira = JSON.stringify(calcularScore(REGRAS, LEAD_QUENTE, { faixas: FAIXAS }));
    for (let i = 0; i < 10; i += 1) {
      expect(JSON.stringify(calcularScore(REGRAS, LEAD_QUENTE, { faixas: FAIXAS }))).toBe(primeira);
    }
  });

  it('sem regra nenhuma o score é zero, não null', () => {
    const saida = calcularScore([], LEAD_QUENTE, { faixas: FAIXAS });
    expect(saida.valor).toBe(0);
    expect(saida.faixa).toBe('frio');
    expect(saida.explicacao).toEqual([]);
    expect(saida.versaoRegra).toBe(0);
  });

  it('limites travam o valor quando o tenant quer escala fechada', () => {
    expect(calcularScore(REGRAS, LEAD_VAZIO, { limites: { minimo: 0 } }).valor).toBe(0);
    expect(calcularScore(REGRAS, LEAD_QUENTE, { limites: { maximo: 50 } }).valor).toBe(50);
  });

  it('versão pode ser carimbada de fora', () => {
    expect(calcularScore(REGRAS, LEAD_QUENTE, { versaoRegra: 7 }).versaoRegra).toBe(7);
  });
});

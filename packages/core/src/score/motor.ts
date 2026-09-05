/**
 * Motor de lead score — `2026-09-05-pipe-design.md` §4.2 e modelo de dados §5.
 *
 * `regra_score` (condição, peso, versão, ativa) produz `score_lead`
 * (valor, faixa, explicação). A explicação é o array de `{regra, versao, pontos}`
 * que produziu o número: é o que permite responder *por que* o lead tirou 62 e
 * recalcular a base inteira quando a regra muda, sem perder o histórico.
 *
 * Determinismo é requisito, não desejo: mesma entrada, mesma saída, sempre.
 * Por isso as regras são avaliadas em ordem estável de identificador, e não na
 * ordem em que o banco devolveu as linhas.
 */

import { compararIdentificador } from '../comum/tempo.js';

export type Operador =
  | 'igual'
  | 'diferente'
  | 'contem'
  | 'nao_contem'
  | 'maior'
  | 'maior_igual'
  | 'menor'
  | 'menor_igual'
  | 'em'
  | 'nao_em'
  | 'existe'
  | 'nao_existe';

export interface Condicao {
  campo: string;
  operador: Operador;
  valor?: unknown;
}

export interface CondicaoComposta {
  combinador: 'e' | 'ou';
  condicoes: readonly (Condicao | CondicaoComposta)[];
}

export type Expressao = Condicao | CondicaoComposta;

export interface RegraScore {
  id: string;
  nome: string;
  versao: number;
  pontos: number;
  condicao: Expressao;
  ativa: boolean;
}

export interface FaixaScore {
  nome: string;
  minimo: number;
  /** Inclusivo. `null` significa sem teto. */
  maximo: number | null;
}

export interface ItemExplicacao {
  regra: string;
  versao: number;
  pontos: number;
}

export interface ResultadoScore {
  valor: number;
  faixa: string | null;
  explicacao: ItemExplicacao[];
  /** Versão de regra carimbada no `score_lead`. */
  versaoRegra: number;
}

export interface OpcoesScore {
  faixas?: readonly FaixaScore[];
  /** Trava o valor num intervalo. Desligado por padrão — peso negativo é legítimo. */
  limites?: { minimo?: number; maximo?: number };
  /** Versão a carimbar. Sem ela, usa a maior versão entre as regras ativas. */
  versaoRegra?: number;
}

export type DadosLead = Readonly<Record<string, unknown>>;

function ehComposta(expressao: Expressao): expressao is CondicaoComposta {
  return 'combinador' in expressao;
}

/** Lê `campo` com caminho por ponto (contato.email), sem depender de biblioteca. */
export function lerCampo(dados: DadosLead, caminho: string): unknown {
  let atual: unknown = dados;
  for (const parte of caminho.split('.')) {
    if (atual === null || atual === undefined || typeof atual !== 'object') return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

/** Texto comparável: sem acento, sem caixa, sem espaço nas pontas. */
function normalizarTexto(valor: unknown): string {
  return String(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function comparavelNumero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function iguais(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'string' || typeof b === 'string') {
    if (a === null || a === undefined || b === null || b === undefined) return a === b;
    return normalizarTexto(a) === normalizarTexto(b);
  }
  return a === b;
}

/** Avalia uma condição folha contra os dados do lead. */
export function avaliarCondicao(condicao: Condicao, dados: DadosLead): boolean {
  const atual = lerCampo(dados, condicao.campo);
  const esperado = condicao.valor;

  switch (condicao.operador) {
    case 'existe':
      return atual !== undefined && atual !== null && atual !== '';
    case 'nao_existe':
      return atual === undefined || atual === null || atual === '';
    case 'igual':
      return iguais(atual, esperado);
    case 'diferente':
      return !iguais(atual, esperado);
    case 'contem':
      if (Array.isArray(atual)) return atual.some((item) => iguais(item, esperado));
      if (atual === undefined || atual === null) return false;
      return normalizarTexto(atual).includes(normalizarTexto(esperado));
    case 'nao_contem':
      return !avaliarCondicao({ ...condicao, operador: 'contem' }, dados);
    case 'em':
      return Array.isArray(esperado) && esperado.some((item) => iguais(atual, item));
    case 'nao_em':
      return !(Array.isArray(esperado) && esperado.some((item) => iguais(atual, item)));
    case 'maior':
    case 'maior_igual':
    case 'menor':
    case 'menor_igual': {
      const a = comparavelNumero(atual);
      const b = comparavelNumero(esperado);
      if (a === null || b === null) return false;
      if (condicao.operador === 'maior') return a > b;
      if (condicao.operador === 'maior_igual') return a >= b;
      if (condicao.operador === 'menor') return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

/** Avalia uma expressão (folha ou composta com E/OU). */
export function avaliarExpressao(expressao: Expressao, dados: DadosLead): boolean {
  if (!ehComposta(expressao)) return avaliarCondicao(expressao, dados);
  if (expressao.condicoes.length === 0) return false;
  return expressao.combinador === 'e'
    ? expressao.condicoes.every((c) => avaliarExpressao(c, dados))
    : expressao.condicoes.some((c) => avaliarExpressao(c, dados));
}

/** Encontra a faixa do valor. Faixas ordenadas por mínimo; `maximo` é inclusivo. */
export function faixaDoValor(valor: number, faixas: readonly FaixaScore[]): string | null {
  const ordenadas = [...faixas].sort((a, b) => a.minimo - b.minimo);
  for (const faixa of ordenadas) {
    const dentroDoPiso = valor >= faixa.minimo;
    const dentroDoTeto = faixa.maximo === null || valor <= faixa.maximo;
    if (dentroDoPiso && dentroDoTeto) return faixa.nome;
  }
  return null;
}

/**
 * Calcula o score de um lead.
 *
 * - Regra inativa não é avaliada nem aparece na explicação.
 * - Só regra que casou entra na explicação — é a resposta para "por que 62".
 * - A ordem da explicação é a ordem estável de `regra.id`, para o mesmo conjunto
 *   de regras produzir exatamente o mesmo JSON qualquer que seja a ordem das
 *   linhas devolvidas pelo banco.
 */
export function calcularScore(
  regras: readonly RegraScore[],
  dados: DadosLead,
  opcoes: OpcoesScore = {},
): ResultadoScore {
  const ativas = regras
    .filter((regra) => regra.ativa)
    .sort((a, b) => compararIdentificador(a.id, b.id));

  const explicacao: ItemExplicacao[] = [];
  let valor = 0;

  for (const regra of ativas) {
    if (!avaliarExpressao(regra.condicao, dados)) continue;
    valor += regra.pontos;
    explicacao.push({ regra: regra.id, versao: regra.versao, pontos: regra.pontos });
  }

  if (opcoes.limites) {
    if (opcoes.limites.minimo !== undefined) valor = Math.max(opcoes.limites.minimo, valor);
    if (opcoes.limites.maximo !== undefined) valor = Math.min(opcoes.limites.maximo, valor);
  }

  const versaoRegra =
    opcoes.versaoRegra ?? ativas.reduce((maior, regra) => Math.max(maior, regra.versao), 0);

  return {
    valor,
    faixa: opcoes.faixas ? faixaDoValor(valor, opcoes.faixas) : null,
    explicacao,
    versaoRegra,
  };
}

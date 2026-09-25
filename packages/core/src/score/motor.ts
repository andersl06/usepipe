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

export interface Condition {
  campo: string;
  operador: Operador;
  valor?: unknown;
}

export interface ConditionComposta {
  combinador: 'e' | 'ou';
  condicoes: readonly (Condition | ConditionComposta)[];
}

export type Expressao = Condition | ConditionComposta;

export interface RegraScore {
  id: string;
  nome: string;
  versao: number;
  pontos: number;
  condition: Expressao;
  active: boolean;
}

export interface FaixaScore {
  nome: string;
  minimo: number;
  /** Inclusivo. `null` significa sem teto. */
  maximo: number | null;
}

export interface ItemExplanation {
  regra: string;
  versao: number;
  pontos: number;
}

export interface ResultadoScore {
  value: number;
  faixa: string | null;
  explanation: ItemExplanation[];
  /** Versão de regra carimbada no `score_lead`. */
  versaoRegra: number;
}

export interface OptionsScore {
  faixas?: readonly FaixaScore[];
  /** Trava o valor num intervalo. Desligado por padrão — peso negativo é legítimo. */
  limites?: { minimo?: number; maximo?: number };
  /** Versão a carimbar. Sem ela, usa a maior versão entre as regras ativas. */
  versaoRegra?: number;
}

export type DataLead = Readonly<Record<string, unknown>>;

function ehComposta(expressao: Expressao): expressao is ConditionComposta {
  return 'combinador' in expressao;
}

/** Lê `campo` com caminho por ponto (contato.email), sem depender de biblioteca. */
export function lerCampo(data: DataLead, caminho: string): unknown {
  let atual: unknown = data;
  for (const parte of caminho.split('.')) {
    if (atual === null || atual === undefined || typeof atual !== 'object') return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

/** Texto comparável: sem acento, sem caixa, sem espaço nas pontas. */
function normalizarTexto(value: unknown): string {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function comparavelNumero(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function equal(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'string' || typeof b === 'string') {
    if (a === null || a === undefined || b === null || b === undefined) return a === b;
    return normalizarTexto(a) === normalizarTexto(b);
  }
  return a === b;
}

/** Avalia uma condição folha contra os dados do lead. */
export function avaliarCondition(condition: Condition, data: DataLead): boolean {
  const atual = lerCampo(data, condition.campo);
  const esperado = condition.valor;

  switch (condition.operador) {
    case 'existe':
      return atual !== undefined && atual !== null && atual !== '';
    case 'nao_existe':
      return atual === undefined || atual === null || atual === '';
    case 'igual':
      return equal(atual, esperado);
    case 'diferente':
      return !equal(atual, esperado);
    case 'contem':
      if (Array.isArray(atual)) return atual.some((item) => equal(item, esperado));
      if (atual === undefined || atual === null) return false;
      return normalizarTexto(atual).includes(normalizarTexto(esperado));
    case 'nao_contem':
      return !avaliarCondition({ ...condition, operador: 'contem' }, data);
    case 'em':
      return Array.isArray(esperado) && esperado.some((item) => equal(atual, item));
    case 'nao_em':
      return !(Array.isArray(esperado) && esperado.some((item) => equal(atual, item)));
    case 'maior':
    case 'maior_igual':
    case 'menor':
    case 'menor_igual': {
      const a = comparavelNumero(atual);
      const b = comparavelNumero(esperado);
      if (a === null || b === null) return false;
      if (condition.operador === 'maior') return a > b;
      if (condition.operador === 'maior_igual') return a >= b;
      if (condition.operador === 'menor') return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

/** Avalia uma expressão (folha ou composta com E/OU). */
export function avaliarExpressao(expressao: Expressao, data: DataLead): boolean {
  if (!ehComposta(expressao)) return avaliarCondition(expressao, data);
  if (expressao.condicoes.length === 0) return false;
  return expressao.combinador === 'e'
    ? expressao.condicoes.every((c) => avaliarExpressao(c, data))
    : expressao.condicoes.some((c) => avaliarExpressao(c, data));
}

/** Encontra a faixa do valor. Faixas ordenadas por mínimo; `maximo` é inclusivo. */
export function valueTier(value: number, faixas: readonly FaixaScore[]): string | null {
  const ordenadas = [...faixas].sort((a, b) => a.minimo - b.minimo);
  for (const faixa of ordenadas) {
    const dentroDoPiso = value >= faixa.minimo;
    const dentroDoTeto = faixa.maximo === null || value <= faixa.maximo;
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
  data: DataLead,
  options: OptionsScore = {},
): ResultadoScore {
  const ativas = regras
    .filter((regra) => regra.active)
    .sort((a, b) => compararIdentificador(a.id, b.id));

  const explanation: ItemExplanation[] = [];
  let value = 0;

  for (const regra of ativas) {
    if (!avaliarExpressao(regra.condition, data)) continue;
    value += regra.pontos;
    explanation.push({ regra: regra.id, versao: regra.versao, pontos: regra.pontos });
  }

  if (options.limites) {
    if (options.limites.minimo !== undefined) value = Math.max(options.limites.minimo, value);
    if (options.limites.maximo !== undefined) value = Math.min(options.limites.maximo, value);
  }

  const versaoRegra =
    options.versaoRegra ?? ativas.reduce((maior, regra) => Math.max(maior, regra.versao), 0);

  return {
    value,
    faixa: options.faixas ? valueTier(value, options.faixas) : null,
    explanation,
    versaoRegra,
  };
}

/**
 * Portado de takenet/blip-sdk-csharp (Apache-2.0),
 * src/Take.Blip.Builder/Models/Condition.cs, ConditionComparison.cs, ConditionOperator.cs,
 * ValueSource.cs, ConditionsExtensions.cs e StringExtensions.cs
 * — modificado: C# → TypeScript; os enums viram as strings do JSON publicado da Blip
 * (camelCase, como o Newtonsoft grava, lidas sem diferenciar maiúscula); mensagens de
 * erro em português; `decimal.TryParse` virou `paraDecimal`; a regex não tem o limite
 * de 2 minutos do original (JS não tem timeout de regex).
 */

import type { Contexto, EntradaPreguicosa } from './contexto.js';
import { obterVariavel } from './contexto.js';

/** `ConditionComparison`. A ordem é a do enum original; o primeiro é o padrão. */
export const COMPARACOES = [
  'equals',
  'notEquals',
  'contains',
  'startsWith',
  'endsWith',
  'greaterThan',
  'lessThan',
  'greaterThanOrEquals',
  'lessThanOrEquals',
  'matches',
  'approximateTo',
  'exists',
  'notExists',
] as const;
export type Comparacao = (typeof COMPARACOES)[number];

/** `ConditionOperator`: `or` é o padrão (o primeiro valor do enum). */
export const OPERADORES = ['or', 'and'] as const;
export type OperadorBlip = (typeof OPERADORES)[number];

/** `ValueSource`: `input` é o padrão. */
export const FONTES = ['input', 'context', 'intent', 'entity'] as const;
export type Fonte = (typeof FONTES)[number];

/** `Condition`, com as chaves exatamente como vêm no JSON da Blip. */
export interface CondicaoBlip {
  source?: string;
  variable?: string;
  entity?: string;
  comparison?: string;
  operator?: string;
  values?: string[] | null;
}

export class ErroDeValidacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeValidacao';
  }
}

/** O Newtonsoft lê enum sem diferenciar maiúscula; valor desconhecido é erro de leitura. */
function lerEnum<T extends string>(
  valor: string | undefined,
  lista: readonly T[],
  campo: string,
): T {
  if (valor === undefined || valor === null) return lista[0] as T;
  const achado = lista.find((v) => v.toLowerCase() === String(valor).toLowerCase());
  if (!achado) throw new ErroDeValidacao(`Valor '${valor}' inválido para '${campo}'.`);
  return achado;
}

export const fonteDe = (c: CondicaoBlip): Fonte => lerEnum(c.source, FONTES, 'source');
export const comparacaoDe = (c: CondicaoBlip): Comparacao =>
  lerEnum(c.comparison, COMPARACOES, 'comparison');
export const operadorDe = (c: CondicaoBlip): OperadorBlip =>
  lerEnum(c.operator, OPERADORES, 'operator');

/** `GetComparisonType`: só `exists` e `notExists` são unárias. */
export function ehUnaria(comparacao: Comparacao): boolean {
  return comparacao === 'exists' || comparacao === 'notExists';
}

/** `Condition.Validate()`. */
export function validarCondicao(c: CondicaoBlip): void {
  const fonte = fonteDe(c);
  const comparacao = comparacaoDe(c);
  operadorDe(c);
  if (fonte === 'context' && !c.variable?.trim()) {
    throw new ErroDeValidacao(
      'O nome da variável é obrigatório quando a fonte da comparação é o contexto.',
    );
  }
  if (fonte === 'entity' && !c.entity?.trim()) {
    throw new ErroDeValidacao(
      'O nome da entidade é obrigatório quando a fonte da comparação é entidade.',
    );
  }
  const temValores = !!c.values && c.values.length > 0;
  if (ehUnaria(comparacao) && temValores) {
    throw new ErroDeValidacao(
      'A condição não leva valores quando a comparação é exists ou notExists.',
    );
  }
  if (!ehUnaria(comparacao) && !temValores) {
    throw new ErroDeValidacao(
      'A condição precisa de valores quando a comparação não é exists nem notExists.',
    );
  }
}

/**
 * `CompareOptions.IgnoreNonSpace | IgnoreCase` com cultura invariante: ignora
 * maiúscula e acento. O colador em `base` é o equivalente do JS.
 */
const COLADOR = new Intl.Collator('en', { sensitivity: 'base' });

/** `string.Compare(v1, v2, InvariantCulture, IgnoreNonSpace | IgnoreCase) == 0`, com o nulo do C#. */
function comparaIgual(v1: string | null, v2: string | null): boolean {
  if (v1 === null || v2 === null) return v1 === v2;
  return COLADOR.compare(v1, v2) === 0;
}

/** `StringComparison.OrdinalIgnoreCase` compara pela maiúscula invariante, sem ignorar acento. */
const maiuscula = (v: string): string => v.toUpperCase();

/**
 * `decimal.TryParse` com cultura invariante: ponto decimal, vírgula de milhar, sinal e
 * espaço nas pontas. Devolve `null` onde o C# devolveria `false`.
 *
 * ponytail: a cultura do servidor da Blip não é conhecida; invariante é o palpite. Se
 * um fluxo real comparar "1,5" esperando 1.5, é aqui que muda.
 */
export function paraDecimal(v: string | null): number | null {
  if (v === null) return null;
  const t = v.trim();
  if (!/^[+-]?[\d,]*\.?\d*$/.test(t) || !/\d/.test(t)) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** `CalculateLevenshteinDistance`, com as duas linhas do original. */
export function distanciaDeLevenshtein(s: string, t: string): number {
  const n = s.length;
  const m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const d: number[][] = Array.from({ length: n + 1 }, () => [0, 0]);
  for (let i = 0; i <= n; i++) d[i]![0] = i;
  for (let j = 1; j <= m; j++) {
    d[0]![j % 2] = j;
    for (let i = 1; i <= n; i++) {
      if (s[i - 1] === t[j - 1]) {
        d[i]![j % 2] = d[i - 1]![(j - 1) % 2]!;
      } else {
        d[i]![j % 2] = Math.min(
          Math.min(d[i - 1]![j % 2]! + 1, d[i]![(j - 1) % 2]! + 1),
          d[i - 1]![(j - 1) % 2]! + 1,
        );
      }
    }
  }
  return d[n]![m % 2]!;
}

/** `ToUnaryDelegate`. */
export function delegadoUnario(comparacao: Comparacao): (v: string | null) => boolean {
  switch (comparacao) {
    case 'exists':
      return (v) => v !== null && v !== '';
    case 'notExists':
      return (v) => v === null || v === '';
    default:
      throw new ErroDeValidacao(`'${comparacao}' não é comparação unária.`);
  }
}

/** `ToBinaryDelegate`. */
export function delegadoBinario(
  comparacao: Comparacao,
): (v1: string | null, v2: string | null) => boolean {
  const numeros = (v1: string | null, v2: string | null): [number, number] | null => {
    const n1 = paraDecimal(v1);
    const n2 = paraDecimal(v2);
    return n1 === null || n2 === null ? null : [n1, n2];
  };
  switch (comparacao) {
    case 'equals':
      return (v1, v2) => comparaIgual(v1, v2);
    case 'notEquals':
      return (v1, v2) => !comparaIgual(v1, v2);
    case 'contains':
      return (v1, v2) => v1 !== null && v2 !== null && maiuscula(v1).includes(maiuscula(v2));
    case 'startsWith':
      return (v1, v2) => v1 !== null && v2 !== null && maiuscula(v1).startsWith(maiuscula(v2));
    case 'endsWith':
      return (v1, v2) => v1 !== null && v2 !== null && maiuscula(v1).endsWith(maiuscula(v2));
    case 'matches':
      // ponytail: sem o timeout de 2 min do original. Regex escrita pelo dono do fluxo
      // contra texto do cliente; se aparecer backtracking catastrófico, rodar em worker.
      return (v1, v2) => v1 !== null && v2 !== null && new RegExp(v2).test(v1);
    case 'approximateTo':
      // Aceita diferença de 25% do texto.
      return (v1, v2) =>
        v1 !== null &&
        v2 !== null &&
        distanciaDeLevenshtein(v1.toLowerCase(), v2.toLowerCase()) <= Math.ceil(v1.length * 0.25);
    case 'greaterThan':
      return (v1, v2) => {
        const n = numeros(v1, v2);
        return n !== null && n[0] > n[1];
      };
    case 'lessThan':
      return (v1, v2) => {
        const n = numeros(v1, v2);
        return n !== null && n[0] < n[1];
      };
    case 'greaterThanOrEquals':
      return (v1, v2) => {
        const n = numeros(v1, v2);
        return n !== null && n[0] >= n[1];
      };
    case 'lessThanOrEquals':
      return (v1, v2) => {
        const n = numeros(v1, v2);
        return n !== null && n[0] <= n[1];
      };
    default:
      throw new ErroDeValidacao(`'${comparacao}' não é comparação binária.`);
  }
}

/** `Condition.EvaluateConditionAsync`. */
export async function avaliarCondicaoBlip(
  condicao: CondicaoBlip,
  entrada: EntradaPreguicosa,
  contexto: Contexto,
): Promise<boolean> {
  let valor: string | null;
  switch (fonteDe(condicao)) {
    case 'input':
      valor = entrada.conteudoSerializado;
      break;
    case 'context':
      valor = await obterVariavel(contexto, condicao.variable ?? '');
      break;
    case 'intent':
      // Sem provedor de IA no Pipe: é o mesmo que a Blip devolve quando a análise falha.
      valor = entrada.intencao?.name ?? null;
      break;
    case 'entity':
      valor =
        entrada.entidades?.find((e) => e.name?.toLowerCase() === condicao.entity?.toLowerCase())
          ?.value ?? null;
      break;
  }

  const comparacao = comparacaoDe(condicao);
  if (ehUnaria(comparacao)) return delegadoUnario(comparacao)(valor);

  const binaria = delegadoBinario(comparacao);
  const valores = condicao.values ?? [];
  if (operadorDe(condicao) === 'and') return valores.every((v) => binaria(valor, v));
  // O original trata `notEquals` com `or` como "diferente de todos", não "de algum".
  if (comparacao === 'notEquals') return !valores.some((v) => comparaIgual(valor, v));
  return valores.some((v) => binaria(valor, v));
}

/** `ConditionsExtensions.EvaluateConditionsAsync`: todas, em ordem, parando na primeira falsa. */
export async function avaliarCondicoes(
  condicoes: readonly CondicaoBlip[],
  entrada: EntradaPreguicosa,
  contexto: Contexto,
): Promise<boolean> {
  for (const condicao of condicoes) {
    if (!(await avaliarCondicaoBlip(condicao, entrada, contexto))) return false;
  }
  return true;
}

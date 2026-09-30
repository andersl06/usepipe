/**
 * Ported from takenet/blip-sdk-csharp (Apache-2.0), src/Take.Blip.Builder/Models/Condition.cs, ConditionComparison.cs, ConditionOperator.cs, ValueSource.cs, ConditionsExtensions.cs, and StringExtensions.cs. Changes from C# to TypeScript: enum values become strings from published Blip JSON (Newtonsoft camelCase and case-insensitive reads); error messages remain Portuguese; `decimal.TryParse` becomes `paraDecimal`; JavaScript regex has no original two-minute timeout.
 */

import type { Context, InboundLazy } from './context.js';
import { getVariable } from './context.js';
import { analyzeInbound } from './nlp.js';

/** `ConditionComparison` order follows the original enum; its first value is the default. */
export const COMPARISONS = [
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
export type Comparison = (typeof COMPARISONS)[number];

/** `ConditionOperator`: `or` is the default, first enum value. */
export const OPERADORES = ['or', 'and'] as const;
export type OperadorBlip = (typeof OPERADORES)[number];

/** `ValueSource`: `input` is the default. */
export const FONTES = ['input', 'context', 'intent', 'entity'] as const;
export type Fonte = (typeof FONTES)[number];

/** `Condition` keys match Blip JSON exactly. */
export interface ConditionBlip {
  source?: string;
  variable?: string;
  entity?: string;
  comparison?: string;
  operator?: string;
  values?: string[] | null;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroDeValidacao';
  }
}

/** Newtonsoft reads enum values case-insensitively; unknown values are parse errors. */
function lerEnum<T extends string>(
  value: string | undefined,
  lista: readonly T[],
  campo: string,
): T {
  if (value === undefined || value === null) return lista[0] as T;
  const achado = lista.find((v) => v.toLowerCase() === String(value).toLowerCase());
  if (!achado) throw new ValidationError(`Valor '${value}' inválido para '${campo}'.`);
  return achado;
}

export const fonteDe = (c: ConditionBlip): Fonte => lerEnum(c.source, FONTES, 'source');
export const comparisonOf = (c: ConditionBlip): Comparison =>
  lerEnum(c.comparison, COMPARISONS, 'comparison');
export const operadorDe = (c: ConditionBlip): OperadorBlip =>
  lerEnum(c.operator, OPERADORES, 'operator');

/** `GetComparisonType`: only `exists` and `notExists` are unary. */
export function ehUnaria(comparison: Comparison): boolean {
  return comparison === 'exists' || comparison === 'notExists';
}

/** `Condition.Validate()`. */
export function validateCondition(c: ConditionBlip): void {
  const fonte = fonteDe(c);
  const comparison = comparisonOf(c);
  operadorDe(c);
  if (fonte === 'context' && !c.variable?.trim()) {
    throw new ValidationError(
      'O nome da variável é obrigatório quando a fonte da comparação é o contexto.',
    );
  }
  if (fonte === 'entity' && !c.entity?.trim()) {
    throw new ValidationError(
      'O nome da entidade é obrigatório quando a fonte da comparação é entidade.',
    );
  }
  const hasValues = !!c.values && c.values.length > 0;
  if (ehUnaria(comparison) && hasValues) {
    throw new ValidationError(
      'A condição não leva valores quando a comparação é exists ou notExists.',
    );
  }
  if (!ehUnaria(comparison) && !hasValues) {
    throw new ValidationError(
      'A condição precisa de valores quando a comparação não é exists nem notExists.',
    );
  }
}

/**
 * Invariant-culture `CompareOptions.IgnoreNonSpace | IgnoreCase` ignores case and accents; JS collator sensitivity `base` is the equivalent.
 */
const COLADOR = new Intl.Collator('en', { sensitivity: 'base' });

/** `string.Compare(v1, v2, InvariantCulture, IgnoreNonSpace | IgnoreCase) == 0`, com o nulo do C#. */
function comparaIgual(v1: string | null, v2: string | null): boolean {
  if (v1 === null || v2 === null) return v1 === v2;
  return COLADOR.compare(v1, v2) === 0;
}

/** `StringComparison.OrdinalIgnoreCase` compares with invariant uppercase without ignoring accents. */
const maiuscula = (v: string): string => v.toUpperCase();

/**
 * Invariant-culture `decimal.TryParse` accepts decimal dots, thousands commas, signs, and surrounding spaces; return null where C# would return false. ponytail: Blip server culture is unknown, so invariant is an assumption. If a real flow expects "1,5" to mean 1.5, change parsing here.
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
export function delegadoUnario(comparison: Comparison): (v: string | null) => boolean {
  switch (comparison) {
    case 'exists':
      return (v) => v !== null && v !== '';
    case 'notExists':
      return (v) => v === null || v === '';
    default:
      throw new ValidationError(`'${comparison}' não é comparação unária.`);
  }
}

/** `ToBinaryDelegate`. */
export function delegadoBinario(
  comparison: Comparison,
): (v1: string | null, v2: string | null) => boolean {
  const numeros = (v1: string | null, v2: string | null): [number, number] | null => {
    const n1 = paraDecimal(v1);
    const n2 = paraDecimal(v2);
    return n1 === null || n2 === null ? null : [n1, n2];
  };
  switch (comparison) {
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
      // ponytail: there is no original two-minute timeout. A flow owner's regex runs
      // against customer text; move it to a worker if catastrophic backtracking appears.
      return (v1, v2) => v1 !== null && v2 !== null && new RegExp(v2).test(v1);
    case 'approximateTo':
      // Allows a 25% difference in the text.
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
      throw new ValidationError(`'${comparison}' não é comparação binária.`);
  }
}

/** `Condition.EvaluateConditionAsync`. */
export async function evaluateConditionBlip(
  condition: ConditionBlip,
  inbound: InboundLazy,
  context: Context,
): Promise<boolean> {
  let value: string | null;
  switch (fonteDe(condition)) {
    case 'input':
      value = inbound.serializedContent;
      break;
    case 'context':
      value = await getVariable(context, condition.variable ?? '');
      break;
    case 'intent':
      // Analysed lazily once per input (P16, `nlp.ts`); a failed analysis reads null, as in Blip.
      value = (await analyzeInbound(inbound, context)).intent?.name ?? null;
      break;
    case 'entity':
      value =
        (await analyzeInbound(inbound, context)).entities.find(
          (e) => e.name?.toLowerCase() === condition.entity?.toLowerCase(),
        )?.value ?? null;
      break;
  }

  const comparison = comparisonOf(condition);
  if (ehUnaria(comparison)) return delegadoUnario(comparison)(value);

  const binaria = delegadoBinario(comparison);
  const values = condition.values ?? [];
  if (operadorDe(condition) === 'and') return values.every((v) => binaria(value, v));
  // The source treats `notEquals` with `or` as different from every value, not merely from some value.
  if (comparison === 'notEquals') return !values.some((v) => comparaIgual(value, v));
  return values.some((v) => binaria(value, v));
}

/** `ConditionsExtensions.EvaluateConditionsAsync`: todas, em ordem, parando na primeira falsa. */
export async function evaluateConditions(
  conditions: readonly ConditionBlip[],
  inbound: InboundLazy,
  context: Context,
): Promise<boolean> {
  for (const condition of conditions) {
    if (!(await evaluateConditionBlip(condition, inbound, context))) return false;
  }
  return true;
}

/**
 * Volume-weighted mean from metrics spec §5: total time divided by total conversations, never a mean of means, so busy days weigh more than quiet days. This matches `weightedAverageOrNull` in blip-dash and the effort measure.
 */

import { resultado, resultEmpty, type ResultadoMetrica } from '../comum/tipos.js';


export function mediaPonderada(partes: readonly ResultadoMetrica[]): ResultadoMetrica {
  let soma = 0;
  let population = 0;
  let excluidas = 0;

  for (const parte of partes) {
    soma += parte.soma;
    population += parte.population;
    excluidas += parte.excluidas;
  }

  if (population === 0) return resultEmpty(excluidas);
  return resultado(soma, population, excluidas);
}

/** Raw pairs of time sum and conversation count. */
export function mediaPonderadaDePares(
  pares: readonly { soma: number; count: number }[],
): number | null {
  let soma = 0;
  let count = 0;
  for (const par of pares) {
    soma += par.soma;
    count += par.count;
  }
  return count > 0 ? soma / count : null;
}

/**
 * Mean of means is the trap this function exposes. Use it only in tests to compare against the weighted mean.
 */
export function mediaDeMedias(values: readonly (number | null)[]): number | null {
  const validos = values.filter((v): v is number => v !== null);
  if (validos.length === 0) return null;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

/** Group by key and apply the metric per group, preserving its denominator. */
export function byDimension<T>(
  itens: readonly T[],
  key: (item: T) => string | null,
  metrica: (grupo: readonly T[]) => ResultadoMetrica,
): Map<string, ResultadoMetrica> {
  const groups = new Map<string, T[]>();
  for (const item of itens) {
    const k = key(item);
    if (k === null) continue;
    const atual = groups.get(k);
    if (atual) atual.push(item);
    else groups.set(k, [item]);
  }

  const saida = new Map<string, ResultadoMetrica>();
  // Sort keys deterministically so reports are stable across runs.
  for (const k of [...groups.keys()].sort()) {
    saida.set(k, metrica(groups.get(k) as T[]));
  }
  return saida;
}

/**
 * Survey response rate from metrics spec §6 must appear beside the mean: a 4.85 score with 22% response is not equivalent to 4.85 with 90%.
 */
export function taxaDeResposta(respostas: number, encerradas: number): number | null {
  return encerradas > 0 ? respostas / encerradas : null;
}

/**
 * Média ponderada por volume — §5 da spec de métricas.
 *
 * Soma dos tempos ÷ soma das conversas. **Nunca média de médias**: dia cheio
 * pesa mais que dia vazio. Mesma construção do `weightedAverageOrNull` do
 * blip-dash e da régua de esforço.
 */

import { resultado, resultEmpty, type ResultadoMetrica } from '../comum/tipos.js';

/** Combina resultados parciais (por dia, por fila, por atendente) em um só. */
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

/** Versão crua: pares (soma de tempo, contagem de conversas). */
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
 * A armadilha que esta função existe para tornar visível: a média das médias.
 * Só deve aparecer em teste, comparada com a ponderada.
 */
export function mediaDeMedias(values: readonly (number | null)[]): number | null {
  const validos = values.filter((v): v is number => v !== null);
  if (validos.length === 0) return null;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

/** Agrupa itens por chave e aplica a métrica em cada grupo, preservando o denominador. */
export function byDimensao<T>(
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
  // Ordem determinística por chave, para o relatório sair igual toda vez.
  for (const k of [...groups.keys()].sort()) {
    saida.set(k, metrica(groups.get(k) as T[]));
  }
  return saida;
}

/**
 * Taxa de resposta de pesquisa — §6: obrigatória na tela ao lado da média,
 * porque 4,85 com 22% de resposta não é a mesma coisa que 4,85 com 90%.
 */
export function taxaDeResposta(respostas: number, encerradas: number): number | null {
  return encerradas > 0 ? respostas / encerradas : null;
}

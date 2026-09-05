/**
 * Média ponderada por volume — §5 da spec de métricas.
 *
 * Soma dos tempos ÷ soma das conversas. **Nunca média de médias**: dia cheio
 * pesa mais que dia vazio. Mesma construção do `weightedAverageOrNull` do
 * blip-dash e da régua de esforço.
 */

import { resultado, resultadoVazio, type ResultadoMetrica } from '../comum/tipos.js';

/** Combina resultados parciais (por dia, por fila, por atendente) em um só. */
export function mediaPonderada(partes: readonly ResultadoMetrica[]): ResultadoMetrica {
  let soma = 0;
  let populacao = 0;
  let excluidas = 0;

  for (const parte of partes) {
    soma += parte.soma;
    populacao += parte.populacao;
    excluidas += parte.excluidas;
  }

  if (populacao === 0) return resultadoVazio(excluidas);
  return resultado(soma, populacao, excluidas);
}

/** Versão crua: pares (soma de tempo, contagem de conversas). */
export function mediaPonderadaDePares(
  pares: readonly { soma: number; contagem: number }[],
): number | null {
  let soma = 0;
  let contagem = 0;
  for (const par of pares) {
    soma += par.soma;
    contagem += par.contagem;
  }
  return contagem > 0 ? soma / contagem : null;
}

/**
 * A armadilha que esta função existe para tornar visível: a média das médias.
 * Só deve aparecer em teste, comparada com a ponderada.
 */
export function mediaDeMedias(valores: readonly (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null);
  if (validos.length === 0) return null;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

/** Agrupa itens por chave e aplica a métrica em cada grupo, preservando o denominador. */
export function porDimensao<T>(
  itens: readonly T[],
  chave: (item: T) => string | null,
  metrica: (grupo: readonly T[]) => ResultadoMetrica,
): Map<string, ResultadoMetrica> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const k = chave(item);
    if (k === null) continue;
    const atual = grupos.get(k);
    if (atual) atual.push(item);
    else grupos.set(k, [item]);
  }

  const saida = new Map<string, ResultadoMetrica>();
  // Ordem determinística por chave, para o relatório sair igual toda vez.
  for (const k of [...grupos.keys()].sort()) {
    saida.set(k, metrica(grupos.get(k) as T[]));
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

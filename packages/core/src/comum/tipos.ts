/**
 * Tipos compartilhados por todas as regras do Pipe.
 *
 * Duração é sempre **inteiro ou fracionário em segundos** — nunca `interval`,
 * nunca milissegundos — para bater com a convenção do modelo de dados
 * (`2026-09-05-modelo-de-dados.md`, §1).
 */

/**
 * Resultado padrão de toda métrica que vira número em tela ou relatório.
 *
 * `populacao` é o denominador efetivamente usado e `excluidas` é quanta coisa
 * ficou de fora do cálculo. Os dois são obrigatórios por decisão de produto
 * (spec de métricas, §2): "métrica que esconde o próprio denominador não entra
 * neste produto".
 *
 * `soma` é redundante com `valor × populacao`, mas fica exposta para a média
 * ponderada de §5 poder somar grupos sem acumular erro de arredondamento de
 * ponto flutuante.
 */
export interface ResultadoMetrica {
  /** Média em segundos, ou `null` quando a população é zero. Nunca `0` por falta de dado. */
  valor: number | null;
  /** Denominador do cálculo. */
  populacao: number;
  /** Itens candidatos que ficaram fora do denominador. */
  excluidas: number;
  /** Soma dos tempos, em segundos. */
  soma: number;
}

/** Constrói um `ResultadoMetrica` a partir da soma e das contagens. */
export function resultado(soma: number, populacao: number, excluidas: number): ResultadoMetrica {
  return {
    valor: populacao > 0 ? soma / populacao : null,
    populacao,
    excluidas,
    soma,
  };
}

/** Resultado vazio — nenhuma conversa entrou no cálculo. */
export function resultadoVazio(excluidas = 0): ResultadoMetrica {
  return { valor: null, populacao: 0, excluidas, soma: 0 };
}

import type { ContagemEncerramento, ResultadoMetrica, ResultadoTempoDeResposta } from '@pipe/core';

/**
 * Relatório de atendimento — §2 e §4 da spec de métricas.
 *
 * Aqui não se calcula nada: busca-se a matéria-prima (conversas encerradas no
 * período e os eventos delas) e chamam-se as funções de
 * `packages/core/src/metricas`. Cada número da tela sai de uma delas, com o
 * `excluidas` que veio junto — é ele que a tela é obrigada a mostrar.
 *
 * População: conversas ENCERRADAS dentro do período (§3, "período fechado").
 * O cronômetro parou; nenhuma conversa aberta entra em nada disto.
 */

export interface BlocoDeTempos {
  naFila: ResultadoMetrica;
  primeiraResposta: ResultadoMetrica;
  esperaTotal: ResultadoMetrica;
  resposta: ResultadoTempoDeResposta;
  atendimento: ResultadoMetrica;
  encerramentos: ContagemEncerramento;
  /** Conversas do recorte — o universo de onde saíram os denominadores acima. */
  conversas: number;
}

export interface LinhaDeQuebra extends BlocoDeTempos {
  chave: string;
}

export interface RelatorioAtendimento {
  geral: BlocoDeTempos;
  porFila: LinhaDeQuebra[];
  porAtendente: LinhaDeQuebra[];
  /**
   * As duas dimensões que o Chatwoot tem e nós não tínhamos: caixa de entrada e
   * rótulo (aqui, etiqueta). Ver `referencias-blip/pesquisa/chatwoot.md`.
   *
   * A de etiqueta é a que mais vale, e a que lá é mais frágil: o relatório
   * deles conta *taggings* em vez de conversas distintas e mistura duas janelas
   * de tempo — as contagens filtram pela data do evento e as médias, pela data
   * de criação da conversa. Aqui as duas populações são a mesma do resto do
   * relatório: conversas ENCERRADAS no período.
   */
  porInbox: LinhaDeQuebra[];
  porEtiqueta: LinhaDeQuebra[];
  /** Conversas encerradas no período que não têm nenhuma etiqueta. */
  semEtiqueta: number;
}

export interface FiltroAtendimento {
  filaId?: string | undefined;
  atendenteId?: string | undefined;
}

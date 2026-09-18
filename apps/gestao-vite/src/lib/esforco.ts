/** Um intervalo em instantes (a `Janela` da api). */
export interface Janela {
  inicio: string;
  fim: string;
}

/**
 * Relatório de esforço por atendente — §4.4 do desenho.
 *
 * A conta inteira é da régua de `packages/core/src/esforco/`: 200 char/min
 * escrito, 1.000 char/min lido, áudio em 1×, e o texto que veio de resposta
 * pronta ou template **fora** do esforço, em coluna separada. Aqui só se busca a
 * matéria-prima e se soma o que o core devolveu.
 */

export interface EsforcoDoAtendente {
  id: string;
  nome: string;
  tickets: number;
  esforcoSeg: number;
  /** Esforço ÷ tickets. Ponderado por construção (§5 da spec de métricas). */
  esforcoPorTicketSeg: number | null;
  sessaoSeg: number;
  ocupacao: number | null;
  charsEscritos: number;
  charsLidos: number;
  audioOuvidoSeg: number;
  audioGravadoSeg: number;
  /** Texto que o atendente **não** digitou: resposta pronta e template. */
  charsDeRespostaPronta: number;
  /** O que esse texto acrescentaria ao esforço se fosse contado como digitação. */
  esforcoRespostaProntaSeg: number;
  audiosSemMetadado: number;
}

export interface RelatorioEsforco {
  janela: Janela;
  atendentes: EsforcoDoAtendente[];
  conversasConsideradas: number;
  /** Conversas encerradas no período que não geraram esforço de nenhum atendente. */
  conversasSemAtendente: number;
}

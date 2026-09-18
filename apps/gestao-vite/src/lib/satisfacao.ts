/**
 * Relatório de satisfação — §6 da spec de métricas.
 *
 * A ESCALA VIAJA COM A NOTA. `resposta_pesquisa` guarda `escala_min` e
 * `escala_max` de propósito, porque um 4 de CSAT (1 a 5) e um 4 de NPS (0 a 10)
 * não significam a mesma coisa e não podem cair no mesmo gráfico. Por isso o
 * agrupamento é por tipo E escala: nota de escalas diferentes nunca entra na
 * mesma média, por construção, e não por disciplina de quem lê a tela.
 *
 * A população é a mesma dos dois lados da taxa de resposta: respostas de
 * conversas encerradas no período, sobre conversas encerradas no período.
 * Numerador e denominador contados sobre universos diferentes dariam uma taxa
 * que não quer dizer nada.
 */

export interface FatiaDeClasse {
  nome: string;
  quantidade: number;
  /** Participação na barra. Divisão de contagens, não é métrica da spec. */
  fracao: number;
}

export interface GrupoSatisfacao {
  /** `csat` ou `nps`. */
  tipo: string;
  escalaMin: number;
  escalaMax: number;
  media: number | null;
  /** Respostas com nota — o "parcial" e o "completo" da Blip somados. */
  respostas: number;
  /** Pesquisas geradas para conversas encerradas no período, respondidas ou não. */
  enviadas: number;
  /** Respostas ÷ conversas encerradas no período. Obrigatória ao lado da média. */
  taxa: number | null;
  classes: FatiaDeClasse[];
}

export interface ComentarioRecente {
  id: string;
  tipo: string;
  nota: number | null;
  escalaMin: number;
  escalaMax: number;
  classe: string | null;
  texto: string;
  em: string | null;
}

export interface RelatorioSatisfacao {
  /** Denominador da taxa de resposta: conversas encerradas no período. */
  encerradas: number;
  grupos: GrupoSatisfacao[];
  comentarios: ComentarioRecente[];
}

/** Teto dos comentários: é uma amostra recente, não a extração da pesquisa. */
export const LIMITE_COMENTARIOS = 20;

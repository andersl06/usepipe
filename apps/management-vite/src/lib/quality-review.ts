import type { ResultadoMetrica } from '@pipe/core';

export const ROTULO_STATE_EVALUATION: Record<string, string> = {
  rascunho: 'Rascunho',
  concluida: 'Concluída',
  contestada: 'Contestada',
  revisada: 'Revisada',
  encerrada: 'Encerrada',
};

export const ROTULO_AVALIADOR: Record<string, string> = {
  ia: 'IA',
  humano: 'Humano',
};

/** O que a IA respondeu num critério de conformidade. */
export const ROTULO_VALUE: Record<string, string> = {
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  nao_se_aplica: 'Não se aplica',
};

export interface EvaluationInLista {
  id: string;
  conversationId: string;
  contact: string | null;
  queue: string | null;
  avaliado: string | null;
  formulario: string;
  notaMaxima: number;
  /** `null` quando a avaliação ainda não fechou nota — e aí ela sai da média. */
  nota: number | null;
  conceito: string | null;
  avaliadorTipo: string;
  confiancaIa: number | null;
  state: string;
  avaliadaEm: string | null;
  /** Categoria e sentimento da classificação da conversa, quando houver. */
  categoria: string | null;
  sentiment: string | null;
}

export interface LinhaByAgent {
  agent: string;
  media: ResultadoMetrica;
  /** Avaliações com nota zero por critério fatal — a média sozinha esconde isto. */
  zeradas: number;
}

export interface QualityReviewPanel {
  evaluations: EvaluationInLista[];
  /** Média geral das notas, com população e descartadas ao lado. */
  media: ResultadoMetrica;
  byAgent: LinhaByAgent[];
  /** Quantas foram da IA e quantas de gente: a nota da IA é sugestão até revisão. */
  byAvaliador: { tipo: string; total: number }[];
  /** Confiança média declarada pelo modelo, de 0 a 1. Só das avaliações da IA. */
  confiancaIa: ResultadoMetrica;
  /** Nota máxima do formulário mais usado no recorte — a escala em que a média é lida. */
  escala: number;
}

export interface QualityReviewFilter {
  agentId?: string | undefined;
  avaliadorTipo?: string | undefined;
}

/* ------------------------------------------------------- a ficha da avaliação */

export interface RespostaDeCriterio {
  criterioId: string;
  criterio: string;
  description: string | null;
  tipo: string;
  fatal: boolean;
  peso: number;
  value: string | null;
  /** Pontos já na escala da nota final: é o que permite dizer "perdeu 12 aqui". */
  pontos: number | null;
  justificativa: string | null;
  /** O trecho citado pela IA, resolvido para o texto da mensagem. */
  evidencia: string | null;
  evidenciaAutor: string | null;
  evidenciaEm: string | null;
}

export interface GrupoDaFicha {
  id: string;
  nome: string;
  peso: number;
  criterios: RespostaDeCriterio[];
}

export interface EvaluationFicha {
  cabecalho: EvaluationInLista;
  groups: GrupoDaFicha[];
  /** Soma dos pontos: a nota ANTES do critério fatal. Mostra o tamanho do estrago. */
  notaAntesDoFatal: number;
  /** Nomes dos critérios fatais reprovados. Vazio quando nenhum zerou a nota. */
  fatalReprovados: string[];
  /** O resumo da classificação da conversa, quando a IA também classificou. */
  resumo: string | null;
  modelClassification: string | null;
}

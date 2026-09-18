import type { ResultadoMetrica } from '@pipe/core';

export const ROTULO_ESTADO_AVALIACAO: Record<string, string> = {
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
export const ROTULO_VALOR: Record<string, string> = {
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  nao_se_aplica: 'Não se aplica',
};

export interface AvaliacaoNaLista {
  id: string;
  conversaId: string;
  contato: string | null;
  fila: string | null;
  avaliado: string | null;
  formulario: string;
  notaMaxima: number;
  /** `null` quando a avaliação ainda não fechou nota — e aí ela sai da média. */
  nota: number | null;
  conceito: string | null;
  avaliadorTipo: string;
  confiancaIa: number | null;
  estado: string;
  avaliadaEm: string | null;
  /** Categoria e sentimento da classificação da conversa, quando houver. */
  categoria: string | null;
  sentimento: string | null;
}

export interface LinhaPorAtendente {
  atendente: string;
  media: ResultadoMetrica;
  /** Avaliações com nota zero por critério fatal — a média sozinha esconde isto. */
  zeradas: number;
}

export interface PainelDeMonitoria {
  avaliacoes: AvaliacaoNaLista[];
  /** Média geral das notas, com população e descartadas ao lado. */
  media: ResultadoMetrica;
  porAtendente: LinhaPorAtendente[];
  /** Quantas foram da IA e quantas de gente: a nota da IA é sugestão até revisão. */
  porAvaliador: { tipo: string; total: number }[];
  /** Confiança média declarada pelo modelo, de 0 a 1. Só das avaliações da IA. */
  confiancaIa: ResultadoMetrica;
  /** Nota máxima do formulário mais usado no recorte — a escala em que a média é lida. */
  escala: number;
}

export interface FiltroDeMonitoria {
  atendenteId?: string | undefined;
  avaliadorTipo?: string | undefined;
}

/* ------------------------------------------------------- a ficha da avaliação */

export interface RespostaDeCriterio {
  criterioId: string;
  criterio: string;
  descricao: string | null;
  tipo: string;
  fatal: boolean;
  peso: number;
  valor: string | null;
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

export interface FichaDeAvaliacao {
  cabecalho: AvaliacaoNaLista;
  grupos: GrupoDaFicha[];
  /** Soma dos pontos: a nota ANTES do critério fatal. Mostra o tamanho do estrago. */
  notaAntesDoFatal: number;
  /** Nomes dos critérios fatais reprovados. Vazio quando nenhum zerou a nota. */
  fataisReprovados: string[];
  /** O resumo da classificação da conversa, quando a IA também classificou. */
  resumo: string | null;
  modeloClassificacao: string | null;
}

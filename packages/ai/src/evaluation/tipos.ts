/**
 * Evaluation form and result mirror `formulario_avaliacao` → `grupo_criterio` → `criterio` and `avaliacao` → `resposta_avaliacao` (§6 of the data model). No database access: data in, result out.
 */

import type { Consumo } from '../consumo/index.js';

export type TipoCriterio = 'conforme' | 'escala' | 'nota';

/** Limits for types other than `conforme`: `escala` reaches 5 and `nota` reaches 10. */
export const TETO_ESCALA = 5;
export const TETO_NOTA = 10;

/** `nao_se_aplica` removes the criterion from the denominator; it is not zero. */
export const VALUES_CONFORME = ['conforme', 'nao_conforme', 'nao_se_aplica'] as const;
export type ValueConforme = (typeof VALUES_CONFORME)[number];

export interface Criterio {
  id: string;
  nome: string;
  description?: string | null;
  peso: number;
  tipo: TipoCriterio;
  /** A fatal criterion marked noncompliant zeroes the entire evaluation score. */
  fatal: boolean;
}

export interface GrupoCriterio {
  id: string;
  nome: string;
  peso: number;
  criterios: readonly Criterio[];
}

export interface Formulario {
  id: string;
  nome: string;
  /** Escala da nota final. `formulario_avaliacao.nota_maxima`, normalmente 100. */
  notaMaxima: number;
  groups: readonly GrupoCriterio[];
}

/** The model's response per criterion, before the score is calculated here. */
export interface RespostaBruta {
  criterioId: string;
  /** `conforme`, `nao_conforme`, `nao_se_aplica`, or the scale number as text. */
  value: string;
  justificativa: string;
  /** Transcript line label (`m7`) supporting the answer. */
  evidencia?: string | null;
}

/** Mirrors `resposta_avaliacao`; `pontos` is calculated here, never by the model. */
export interface RespostaEvaluation {
  criterioId: string;
  value: string;
  pontos: number;
  justificativa: string;
  /** `mensagem.id` resolved from the label. */
  evidenciaMessageId: string | null;
}

export interface ResultEvaluation {
  formularioId: string;
  /** Final score on the form's scale, after applying fatal criteria. */
  nota: number;
  /** Score before fatal criteria, showing their impact. */
  notaAntesDoFatal: number;
  /** Failed fatal criteria; empty when none zeroed the score. */
  fatalReprovados: string[];
  respostas: RespostaEvaluation[];
  /** Overall model-reported confidence, from 0 to 1. */
  confianca: number;
  consumo: Consumo;
  template: string;
  /** `avaliacao@v1` — qual prompt produziu este resultado. */
  prompt: string;
}


export function criteriosDoFormulario(
  formulario: Formulario,
): { grupo: GrupoCriterio; criterio: Criterio }[] {
  return formulario.groups.flatMap((grupo) =>
    grupo.criterios.map((criterio) => ({ grupo, criterio })),
  );
}

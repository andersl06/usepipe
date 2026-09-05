/**
 * Formulário de avaliação e resultado, espelhando `formulario_avaliacao` →
 * `grupo_criterio` → `criterio` e `avaliacao` → `resposta_avaliacao` (§6 do
 * modelo de dados). Sem acesso a banco: entra dado, sai resultado.
 */

import type { Consumo } from '../consumo/index.js';

export type TipoCriterio = 'conforme' | 'escala' | 'nota';

/** Escalas dos tipos que não são `conforme`. `escala` vai a 5, `nota` vai a 10. */
export const TETO_ESCALA = 5;
export const TETO_NOTA = 10;

/** `nao_se_aplica` tira o critério do denominador — não é o mesmo que zero. */
export const VALORES_CONFORME = ['conforme', 'nao_conforme', 'nao_se_aplica'] as const;
export type ValorConforme = (typeof VALORES_CONFORME)[number];

export interface Criterio {
  id: string;
  nome: string;
  descricao?: string | null;
  peso: number;
  tipo: TipoCriterio;
  /** Critério fatal marcado como não conforme zera a nota da avaliação inteira. */
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
  grupos: readonly GrupoCriterio[];
}

/** O que a IA responde por critério, antes de a nota ser calculada aqui. */
export interface RespostaBruta {
  criterioId: string;
  /** `conforme` | `nao_conforme` | `nao_se_aplica`, ou o número da escala como texto. */
  valor: string;
  justificativa: string;
  /** Rótulo da linha da transcrição (`m7`) que sustenta a resposta. */
  evidencia?: string | null;
}

/** Espelha `resposta_avaliacao`. `pontos` é calculado aqui, nunca pelo modelo. */
export interface RespostaAvaliacao {
  criterioId: string;
  valor: string;
  pontos: number;
  justificativa: string;
  /** `mensagem.id` já resolvido a partir do rótulo. */
  evidenciaMensagemId: string | null;
}

export interface ResultadoAvaliacao {
  formularioId: string;
  /** Nota final na escala do formulário, já com o critério fatal aplicado. */
  nota: number;
  /** Nota antes do critério fatal — é o que mostra o tamanho do estrago. */
  notaAntesDoFatal: number;
  /** Critérios fatais reprovados. Vazio quando nenhum zerou a nota. */
  fataisReprovados: string[];
  respostas: RespostaAvaliacao[];
  /** Confiança geral declarada pelo modelo, de 0 a 1. */
  confianca: number;
  consumo: Consumo;
  modelo: string;
  /** `avaliacao@v1` — qual prompt produziu este resultado. */
  prompt: string;
}

/** Percorre os critérios de todos os grupos, na ordem do formulário. */
export function criteriosDoFormulario(
  formulario: Formulario,
): { grupo: GrupoCriterio; criterio: Criterio }[] {
  return formulario.grupos.flatMap((grupo) =>
    grupo.criterios.map((criterio) => ({ grupo, criterio })),
  );
}

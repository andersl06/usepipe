/**
 * AI ticket evaluation takes a transcript and form and returns each criterion's value, points, rationale, and supporting message. Every model result is checked against the form and transcript before acceptance: unknown criterion IDs, nonexistent evidence labels, and noncompliant criteria without evidence fail. This follows the case-sync practice of checking subcategories against the picklist; accepting unchecked model answers there produced blank Cases unnoticed for months.
 */

import { z } from 'zod';

import type { ChamadaEstruturada, Effort } from '../cliente/cliente.js';
import { chamadaPadrao } from '../cliente/cliente.js';
import { FormatIaError } from '../cliente/errors.js';
import { PROMPT_EVALUATION } from '../prompts/evaluation.js';
import { identificador } from '../prompts/tipos.js';
import type { Transcription } from '../transcription/transcription.js';
import { calcularNota, valueFraction } from './nota.js';
import type { Formulario, ResultEvaluation, RespostaBruta } from './tipos.js';
import { criteriosDoFormulario } from './tipos.js';

const EsquemaEvaluation = z.object({
  respostas: z.array(
    z.object({
      criterioId: z.string(),
      valor: z.string(),
      justificativa: z.string(),
      evidencia: z.string().nullable(),
    }),
  ),
  confianca: z.number().min(0).max(1),
});

export type OutputEvaluationIa = z.infer<typeof EsquemaEvaluation>;

export interface OptionsEvaluation {
  formulario: Formulario;
  transcription: Transcription;
  context?: string | null;
  template?: string;
  effort?: Effort;
  /** Test stub when injected; the real call in production. */
  chamar?: ChamadaEstruturada;
}

/** Leaves room for each criterion's rationale and evidence. */
function tetoDeTokens(formulario: Formulario): number {
  const criterios = criteriosDoFormulario(formulario).length;
  return Math.min(32_000, 2_000 + criterios * 400);
}

/**
 * Resolves a cited label (`m12`) to its corresponding `mensagem.id`. A label outside the transcript index is a hallucination and fails the evaluation.
 */
export function resolverEvidencia(
  transcription: Transcription,
  criterioId: string,
  evidencia: string | null | undefined,
): string | null {
  const rotulo = evidencia?.trim();
  if (!rotulo) return null;
  const messageId = transcription.indice[rotulo];
  if (!messageId) {
    throw new FormatIaError(
      `Evidência "${rotulo}" do critério ${criterioId} não existe na transcrição.`,
      evidencia,
    );
  }
  return messageId;
}

export async function avaliarConversation(options: OptionsEvaluation): Promise<ResultEvaluation> {
  const { formulario, transcription } = options;
  const chamar = options.chamar ?? chamadaPadrao;
  const texto = PROMPT_EVALUATION.montar({
    transcription: transcription.texto,
    truncada: transcription.truncada,
    messagesOmitidas: transcription.messagesOmitidas,
    formulario,
    context: options.context,
  });

  const { data, consumo, template } = await chamar({
    sistema: texto.sistema,
    user: texto.user,
    esquema: EsquemaEvaluation,
    feature: 'avaliacao',
    template: options.template,
    effort: options.effort ?? 'medium',
    maxTokens: tetoDeTokens(formulario),
  });

  const byId = new Map(
    criteriosDoFormulario(formulario).map(({ criterio }) => [criterio.id, criterio]),
  );
  const enriquecidas: (RespostaBruta & { evidenciaMessageId: string | null })[] = [];
  const vistos = new Set<string>();

  for (const resposta of data.respostas) {
    const criterio = byId.get(resposta.criterioId);
    if (!criterio) {
      throw new FormatIaError(
        `O modelo respondeu o critério "${resposta.criterioId}", que não existe no formulário "${formulario.nome}".`,
        data,
      );
    }
    if (vistos.has(criterio.id)) {
      throw new FormatIaError(`O critério "${criterio.id}" foi respondido duas vezes.`, data);
    }
    vistos.add(criterio.id);

    const evidenciaMessageId = resolverEvidencia(transcription, criterio.id, resposta.evidencia);
    const fraction = valueFraction(criterio, resposta.valor);
    if (fraction !== null && fraction < 1 && !evidenciaMessageId) {
      throw new FormatIaError(
        `O critério "${criterio.nome}" (${criterio.id}) não saiu conforme e veio sem evidência. ` +
          'Evidência é obrigatória para o atendente poder contestar.',
        data,
      );
    }

    enriquecidas.push({
      criterioId: resposta.criterioId,
      value: resposta.valor,
      justificativa: resposta.justificativa,
      evidencia: resposta.evidencia,
      evidenciaMessageId,
    });
  }

  const calculada = calcularNota(formulario, enriquecidas);

  return {
    formularioId: formulario.id,
    nota: calculada.nota,
    notaAntesDoFatal: calculada.notaAntesDoFatal,
    fatalReprovados: calculada.fatalReprovados,
    respostas: calculada.respostas,
    confianca: data.confianca,
    consumo,
    template,
    prompt: identificador(PROMPT_EVALUATION),
  };
}

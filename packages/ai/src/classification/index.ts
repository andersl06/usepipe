/**
 * Ticket classification derives category, subcategory, intent, and sentiment from a supplied taxonomy. Returned labels are checked against that taxonomy with the normalization learned in case-sync: double spaces and HTML quotes caused blank Cases when labels were compared literally. In case-sync, 84% of cases had more than one defensible answer, and the same agent repeated her own label only 53% of the time. Thus `confianca` controls whether classification is accepted automatically or sent for review.
 */

import { z } from 'zod';

import type { ChamadaEstruturada, Effort } from '../cliente/cliente.js';
import { chamadaPadrao } from '../cliente/cliente.js';
import { FormatIaError } from '../cliente/errors.js';
import type { Consumo } from '../consumo/index.js';
import type { OptionTaxonomy, Taxonomia } from '../prompts/classification.js';
import { PROMPT_CLASSIFICATION, optionKey, prepareOptions } from '../prompts/classification.js';
import { identificador } from '../prompts/tipos.js';
import type { Transcription } from '../transcription/transcription.js';

export const SENTIMENTS = ['positivo', 'neutro', 'negativo'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

/**
 * `desfecho` comes first so the model describes what happened before choosing a label; this improved case-sync accuracy by 4.3 percentage points.
 */
const SchemaClassification = z.object({
  desfecho: z.string().min(1),
  categoria: z.string().min(1),
  subcategoria: z.string().nullable(),
  intencao: z.string().nullable(),
  sentimento: z.enum(SENTIMENTS),
  confianca: z.number().min(0).max(1),
});

export interface OptionsClassification {
  transcription: Transcription;
  taxonomia: Taxonomia;
  maxOptions?: number;
  context?: string | null;
  template?: string;
  effort?: Effort;
  chamar?: ChamadaEstruturada;
}

export interface ResultClassification {
  /** One sentence describing what the customer requested and what the agent did. */
  desfecho: string;
  categoria: string;
  subcategoria: string | null;
  intent: string | null;
  sentiment: Sentiment;
  confianca: number;
  consumo: Consumo;
  template: string;
  prompt: string;
}

/**
 * Normalizes labels for comparison by stripping accents, ignoring case, collapsing spaces, and decoding HTML entities. Each of these caused rework in case-sync.
 */
export function normalizarRotulo(texto: string): string {
  return texto
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


export function matchOption(
  options: readonly OptionTaxonomy[],
  categoria: string,
  subcategoria: string | null,
): OptionTaxonomy | undefined {
  const alvo = normalizarRotulo(
    subcategoria?.trim() ? `${categoria} > ${subcategoria}` : categoria,
  );
  return options.find((o) => normalizarRotulo(optionKey(o)) === alvo);
}

export async function classifyConversation(
  options: OptionsClassification,
): Promise<ResultClassification> {
  const chamar = options.chamar ?? chamadaPadrao;
  const apresentadas = prepareOptions(options.taxonomia, options.maxOptions);
  const texto = PROMPT_CLASSIFICATION.montar({
    transcription: options.transcription.texto,
    truncada: options.transcription.truncada,
    messagesOmitted: options.transcription.messagesOmitted,
    taxonomia: options.taxonomia,
    maxOptions: options.maxOptions,
    context: options.context,
  });

  const { data, consumo, template } = await chamar({
    sistema: texto.sistema,
    user: texto.user,
    esquema: SchemaClassification,
    feature: 'classificacao',
    template: options.template,
    effort: options.effort,
    maxTokens: 2_000,
  });

  const escolhida = matchOption(apresentadas, data.categoria, data.subcategoria);
  if (!escolhida) {
    throw new FormatIaError(
      `"${optionKey({ categoria: data.categoria, subcategoria: data.subcategoria })}" não está entre as ${apresentadas.length} opções apresentadas.`,
      data,
    );
  }

  return {
    desfecho: data.desfecho.trim(),
    // Persist the taxonomy's label, not the model's spelling: it must match UI filters and `insight` aggregation.
    categoria: escolhida.categoria,
    subcategoria: escolhida.subcategoria?.trim() || null,
    intent: data.intencao?.trim() || null,
    sentiment: data.sentimento,
    confianca: data.confianca,
    consumo,
    template,
    prompt: identificador(PROMPT_CLASSIFICATION),
  };
}

/**
 * Classificação de atendimento: categoria, subcategoria, intenção e sentimento a
 * partir de uma taxonomia que vem por parâmetro.
 *
 * O rótulo devolvido é conferido contra a taxonomia apresentada, com a mesma
 * normalização que o case-sync precisou aprender na marra — espaço duplo e aspas
 * em HTML fizeram Cases nascerem em branco porque a comparação era literal.
 *
 * Sobre o teto da tarefa: no case-sync, 84% dos casos tinham mais de uma resposta
 * defensável e a própria atendente repetia o próprio rótulo só 53% das vezes.
 * Por isso `confianca` é parte da resposta, não um detalhe: é ela que decide se a
 * classificação entra sozinha ou vai para revisão.
 */

import { z } from 'zod';

import type { ChamadaEstruturada, Effort } from '../cliente/cliente.js';
import { chamadaPadrao } from '../cliente/cliente.js';
import { FormatIaError } from '../cliente/errors.js';
import type { Consumo } from '../consumo/index.js';
import type { OptionTaxonomia, Taxonomia } from '../prompts/classification.js';
import { PROMPT_CLASSIFICATION, optionKey, prepararOptions } from '../prompts/classification.js';
import { identificador } from '../prompts/tipos.js';
import type { Transcription } from '../transcription/transcription.js';

export const SENTIMENTS = ['positivo', 'neutro', 'negativo'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

/**
 * `desfecho` vem primeiro de propósito: o modelo escreve o que aconteceu antes de
 * escolher o rótulo. Foram +4,3pp de acurácia no case-sync.
 */
const EsquemaClassification = z.object({
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
  /** Uma frase do que o cliente pediu e do que o atendente fez. */
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
 * Normaliza para comparar rótulo: sem acento, sem caixa, espaço colapsado e sem
 * entidade HTML. Cada uma dessas quatro já custou retrabalho no case-sync.
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

/** Acha na taxonomia a opção que o modelo escolheu, ou `undefined`. */
export function matchOption(
  options: readonly OptionTaxonomia[],
  categoria: string,
  subcategoria: string | null,
): OptionTaxonomia | undefined {
  const alvo = normalizarRotulo(
    subcategoria?.trim() ? `${categoria} > ${subcategoria}` : categoria,
  );
  return options.find((o) => normalizarRotulo(optionKey(o)) === alvo);
}

export async function classificarConversation(
  options: OptionsClassification,
): Promise<ResultClassification> {
  const chamar = options.chamar ?? chamadaPadrao;
  const apresentadas = prepararOptions(options.taxonomia, options.maxOptions);
  const texto = PROMPT_CLASSIFICATION.montar({
    transcription: options.transcription.texto,
    truncada: options.transcription.truncada,
    messagesOmitidas: options.transcription.messagesOmitidas,
    taxonomia: options.taxonomia,
    maxOptions: options.maxOptions,
    context: options.context,
  });

  const { data, consumo, template } = await chamar({
    sistema: texto.sistema,
    user: texto.user,
    esquema: EsquemaClassification,
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
    // O rótulo gravado é o **da taxonomia**, não o que o modelo digitou: é ele que
    // vai casar com o filtro da tela e com a agregação de `insight`.
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

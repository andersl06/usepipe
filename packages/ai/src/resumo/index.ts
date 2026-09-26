/**
 * Ticket summary has two outputs for two readers: the agent taking over now and someone reading the lead timeline months later.
 */

import { z } from 'zod';

import type { ChamadaEstruturada, Effort } from '../cliente/cliente.js';
import { chamadaPadrao } from '../cliente/cliente.js';
import type { Consumo } from '../consumo/index.js';
import { PROMPT_RESUMO_ABERTURA, PROMPT_SUMMARY_CLOSURE } from '../prompts/resumo.js';
import type { InboundSummary } from '../prompts/resumo.js';
import type { Prompt } from '../prompts/tipos.js';
import { identificador } from '../prompts/tipos.js';
import type { Transcription } from '../transcription/transcription.js';

const EsquemaResumo = z.object({
  resumo: z.string().min(1),
});

export interface OptionsSummary {
  transcription: Transcription;
  /** Queue, product, campaign, or other context for the conversation. */
  context?: string | null;
  maxPalavras?: number;
  template?: string;
  effort?: Effort;
  chamar?: ChamadaEstruturada;
}

export interface ResultadoResumo {
  resumo: string;
  consumo: Consumo;
  template: string;
  /** `resumo-encerramento@v1` — qual prompt produziu este texto. */
  prompt: string;
}

async function resumirCom(
  prompt: Prompt<InboundSummary>,
  feature: string,
  options: OptionsSummary,
): Promise<ResultadoResumo> {
  const chamar = options.chamar ?? chamadaPadrao;
  const texto = prompt.montar({
    transcription: options.transcription.texto,
    truncada: options.transcription.truncada,
    messagesOmitidas: options.transcription.messagesOmitidas,
    maxPalavras: options.maxPalavras,
    context: options.context,
  });

  const { data, consumo, template } = await chamar({
    sistema: texto.sistema,
    user: texto.user,
    esquema: EsquemaResumo,
    feature,
    template: options.template,
    effort: options.effort,
    maxTokens: 2_000,
  });

  return { resumo: data.resumo.trim(), consumo, template, prompt: identificador(prompt) };
}

/** Prior events for the agent taking over the conversation. */
export function resumirAbertura(options: OptionsSummary): Promise<ResultadoResumo> {
  return resumirCom(PROMPT_RESUMO_ABERTURA, 'resumo_abertura', options);
}

/** Current events for the lead timeline. */
export function resumirClosure(options: OptionsSummary): Promise<ResultadoResumo> {
  return resumirCom(PROMPT_SUMMARY_CLOSURE, 'resumo_encerramento', options);
}

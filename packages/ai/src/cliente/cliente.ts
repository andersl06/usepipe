/**
 * Single entry point to the Anthropic API: schema-validated structured output, measured usage, and retries with increasing delay. No key is embedded: the SDK reads `ANTHROPIC_API_KEY` from the environment. The default model is `claude-sonnet-5`, overridden by `PIPE_IA_MODELO`. `ChamadaEstruturada` is the test seam: public package functions accept an injected call, allowing recorded responses instead of real paid calls.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

import { TEMPLATE_DEFAULT, consumoDe, type Consumo } from '../consumo/index.js';
import { CallIaError, FormatIaError } from './errors.js';

/** Effort levels accepted by the API (`output_config.effort`). */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface PedidoIa<T> {
  /** Persistent task instruction, always loaded from a `prompts/` file. */
  sistema: string;
  /** Current input: transcript, taxonomy, or form. */
  user: string;
  /** Formato exigido da resposta. Fora dele, a chamada falha. */
  esquema: z.ZodType<T>;
  template?: string;
  maxTokens?: number;
  effort?: Effort;
  /** Identifica a chamada em `consumo_ia.funcionalidade`. */
  feature: string;
}

export interface RespostaIa<T> {
  data: T;
  consumo: Consumo;
  /** Modelo que efetivamente respondeu. */
  template: string;
}

/** Model-call signature; injectable to test with a stub. */
export type ChamadaEstruturada = <T>(pedido: PedidoIa<T>) => Promise<RespostaIa<T>>;

/**
 * Low effort by default, based on case-sync measurements: increasing the reasoning budget worsened classification accuracy, while zero effort matched or improved it. Callers needing more can pass `esforco` in the request.
 */
export const EFFORT_DEFAULT: Effort = 'low';

export const MAX_TOKENS_PADRAO = 8000;

/** Configured model: `PIPE_IA_MODELO` when set, otherwise `claude-sonnet-5`. */
export function templateConfigured(): string {
  return process.env['PIPE_IA_MODELO']?.trim() || TEMPLATE_DEFAULT;
}

export interface OptionsRetry {
  /** Total de tentativas, incluindo a primeira. */
  tentativas?: number;
  /** Espera da primeira retentativa, em ms. Dobra a cada rodada. */
  esperaBaseMs?: number;
  /** Injectable so tests do not actually sleep. */
  dormir?: (ms: number) => Promise<void>;
}

const trueSleep = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Retry network failures or rate limits; do not retry our request errors, bad keys, or nonexistent models, because that wastes money and delays diagnosis. Use HTTP status rather than SDK error classes, which may change across versions: 408, 409, 429, and 5xx are retryable.
 */
export const STATUS_QUE_REPETEM = new Set([408, 409, 429]);

export function vaiDeNovo(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof Anthropic.APIError) {
    return (
      typeof error.status === 'number' && (STATUS_QUE_REPETEM.has(error.status) || error.status >= 500)
    );
  }
  return false;
}

/**
 * Exponential backoff with jitter: 500 ms, 1 s, 2 s, and so on, each varied by up to 25%, to avoid resynchronizing conversations closed in the same second.
 */
export function esperaDaTentativa(
  indice: number,
  esperaBaseMs: number,
  sorteio = Math.random,
): number {
  const base = esperaBaseMs * 2 ** indice;
  return Math.round(base * (1 + sorteio() * 0.25));
}

/** Repete `tarefa` enquanto o erro for de rede ou limite de taxa. */
export async function comRetentativa<T>(
  tarefa: () => Promise<T>,
  options: OptionsRetry = {},
): Promise<T> {
  const tentativas = options.tentativas ?? 4;
  const esperaBaseMs = options.esperaBaseMs ?? 500;
  const dormir = options.dormir ?? trueSleep;

  let ultimo: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await tarefa();
    } catch (error) {
      ultimo = error;
      if (!vaiDeNovo(error) || i === tentativas - 1) throw error;
      await dormir(esperaDaTentativa(i, esperaBaseMs));
    }
  }
  throw ultimo;
}

let clienteCompartilhado: Anthropic | undefined;

function cliente(): Anthropic {
  clienteCompartilhado ??= new Anthropic();
  return clienteCompartilhado;
}

/**
 * Real API call. Refusal, truncation at `max_tokens`, and schema-invalid content fail explicitly; none is guessed into a result.
 */
export function createCall(options: OptionsRetry = {}): ChamadaEstruturada {
  return async function chamar<T>(pedido: PedidoIa<T>): Promise<RespostaIa<T>> {
    const template = pedido.template ?? templateConfigured();

    const resposta = await comRetentativa(
      () =>
        cliente().messages.parse({
          model: template,
          max_tokens: pedido.maxTokens ?? MAX_TOKENS_PADRAO,
          system: pedido.sistema,
          messages: [{ role: 'user', content: pedido.user }],
          output_config: {
            effort: pedido.effort ?? EFFORT_DEFAULT,
            format: zodOutputFormat(pedido.esquema as z.ZodType),
          },
        }),
      options,
    );

    if (resposta.stop_reason === 'refusal') {
      throw new CallIaError(
        `O modelo recusou a tarefa "${pedido.feature}": ` +
          `${resposta.stop_details?.category ?? 'sem categoria'}.`,
        resposta.stop_details,
      );
    }
    if (resposta.stop_reason === 'max_tokens') {
      throw new CallIaError(
        `Resposta de "${pedido.feature}" cortada em ${pedido.maxTokens ?? MAX_TOKENS_PADRAO} tokens. ` +
          'Aumente `maxTokens` ou trunque mais a transcrição.',
      );
    }

    const bruto = resposta.parsed_output;
    if (bruto == null) {
      throw new FormatIaError(
        `"${pedido.feature}" devolveu conteúdo fora do formato exigido.`,
        resposta.content,
      );
    }

    const validado = pedido.esquema.safeParse(bruto);
    if (!validado.success) {
      throw new FormatIaError(
        `"${pedido.feature}" não passou na validação: ${validado.error.message}`,
        bruto,
      );
    }

    return {
      data: validado.data,
      template: resposta.model ?? template,
      consumo: consumoDe(template, resposta.usage.input_tokens, resposta.usage.output_tokens),
    };
  };
}

/** Default package call when the caller does not inject one. */
export const chamadaPadrao: ChamadaEstruturada = (pedido) => createCall()(pedido);

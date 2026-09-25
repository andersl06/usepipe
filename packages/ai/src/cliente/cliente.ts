/**
 * Uma única porta para a API da Anthropic: saída estruturada validada por esquema,
 * consumo medido e nova tentativa com espera crescente.
 *
 * Nenhuma chave no código: `ANTHROPIC_API_KEY` sai do ambiente (o SDK resolve
 * sozinho). O modelo padrão é `claude-sonnet-5` e sai de `PIPE_IA_MODELO` quando
 * definido.
 *
 * O tipo `ChamadaEstruturada` é a costura de teste: toda função pública do pacote
 * aceita uma no lugar da real, e é assim que os testes rodam com resposta gravada
 * em vez de gastar chamada de verdade.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

import { TEMPLATE_DEFAULT, consumoDe, type Consumo } from '../consumo/index.js';
import { CallIaError, FormatIaError } from './erros.js';

/** Níveis de esforço aceitos pela API (`output_config.effort`). */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface PedidoIa<T> {
  /** Instrução persistente da tarefa. Vem sempre de um arquivo de `prompts/`. */
  sistema: string;
  /** O material da vez: transcrição, taxonomia, formulário. */
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

/** Assinatura da chamada ao modelo. Injetável para teste com dublê. */
export type ChamadaEstruturada = <T>(pedido: PedidoIa<T>) => Promise<RespostaIa<T>>;

/**
 * Esforço baixo por padrão. Não é economia às cegas: no case-sync, aumentar o
 * orçamento de raciocínio **piorou** a acurácia da classificação, e zero saiu
 * igual ou melhor. Quem precisar de mais passa `esforco` no pedido.
 */
export const EFFORT_DEFAULT: Effort = 'low';

export const MAX_TOKENS_PADRAO = 8000;

/** Modelo em uso: `PIPE_IA_MODELO` quando definido, senão `claude-sonnet-5`. */
export function templateConfigured(): string {
  return process.env['PIPE_IA_MODELO']?.trim() || TEMPLATE_DEFAULT;
}

export interface OptionsRetentativa {
  /** Total de tentativas, incluindo a primeira. */
  tentativas?: number;
  /** Espera da primeira retentativa, em ms. Dobra a cada rodada. */
  esperaBaseMs?: number;
  /** Injetável para o teste não dormir de verdade. */
  dormir?: (ms: number) => Promise<void>;
}

const trueDormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Erro de rede ou limite de taxa: vale tentar de novo. Erro nosso (4xx de
 * requisição malformada, chave errada, modelo inexistente): não — repetir só
 * gasta dinheiro e atrasa o diagnóstico.
 *
 * A decisão é pelo **código HTTP**, não pela classe do erro: 408, 409, 429 e 5xx.
 * Classe é detalhe do SDK e muda de versão para versão; o código não.
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
 * Espera crescente com sorteio: 500ms, 1s, 2s… cada uma com até 25% de variação,
 * para não ressincronizar todas as conversas encerradas no mesmo segundo.
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
  options: OptionsRetentativa = {},
): Promise<T> {
  const tentativas = options.tentativas ?? 4;
  const esperaBaseMs = options.esperaBaseMs ?? 500;
  const dormir = options.dormir ?? trueDormir;

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
 * A chamada de verdade. Falha explicitamente quando o modelo recusa, quando a
 * resposta é cortada por `max_tokens` e quando o conteúdo não passa no esquema —
 * em nenhum desses casos ela adivinha.
 */
export function createCall(options: OptionsRetentativa = {}): ChamadaEstruturada {
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

/** Chamada padrão do pacote, usada quando o chamador não injeta uma. */
export const chamadaPadrao: ChamadaEstruturada = (pedido) => createCall()(pedido);

import { api, ApiError } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/actions';

/**
 * `POST /v1/mensagens-ativas` — the write that was missing to wire up the screen (the rest, `GET .../growth`, already reads real data). Same `Resultado<T>` format as `configuracoes/basicas/gravar.ts`: `ok`/`value` or `ok`/`error` with text ready for the screen's `aviso`.
 */

export interface TriggerDestination {
  contactId?: string;
  telefone?: string;
  nome?: string;
  parametros?: string[];
}

export interface ResultByContact {
  telefone: string | null;
  contactId: string | null;
  enviada: boolean;
  messageId: string | null;
  conversationId: string | null;
  motivo: string | null;
  detalhe: string | null;
}

export interface RespostaDoDisparo {
  enviadas: number;
  recusadas: number;
  data: ResultByContact[];
}

export interface LimitesDeDisparo {
  maxContactsByTrigger: number;
  dailyLimitByContact: number;
}

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

export async function triggerActiveMessages(pedido: {
  channelId: string;
  template_id: string;
  contacts: TriggerDestination[];
  parametros?: string[];
}): Promise<Resultado<RespostaDoDisparo>> {
  try {
    const value = await api.post<RespostaDoDisparo>('/v1/messages-active', pedido);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível enviar a mensagem ativa.') };
  }
}

/** The `erro.mensagem` the `api` puts in the body (`ErroPipe`), or the default text. */
export function motivoDe(error: unknown, padrao: string): string {
  if (error instanceof ApiError) {
    const corpo = error.corpo as { error?: { message?: unknown } } | null;
    const message = corpo?.error?.message;
    if (typeof message === 'string' && message) return message;
  }
  return padrao;
}

/** `MotivoDeRecusa` from `dominio/mensagem-ativa.ts`, in screen-facing Portuguese. */
const ROTULOS_DE_RECUSA: Record<string, string> = {
  numero_invalido: 'Número de telefone inválido',
  ja_em_atendimento: 'Este contato já está em atendimento',
  limite_diario: 'Contato atingiu o limite diário de mensagens ativas',
  contato_duplicado: 'Contato duplicado nesta lista',
};

export function rotuloDeRecusa(motivo: string | null): string {
  if (!motivo) return 'Falha no envio';
  return ROTULOS_DE_RECUSA[motivo] ?? motivo;
}

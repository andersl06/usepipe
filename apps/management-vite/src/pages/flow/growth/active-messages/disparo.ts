import { api, ApiError } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/actions';

/**
 * `POST /v1/mensagens-ativas` — a escrita que faltava ligar na tela (o resto,
 * `GET .../growth`, já lê dado real). Mesmo formato de `Resultado<T>` de
 * `configuracoes/basicas/gravar.ts`: `ok`/`valor` ou `ok`/`erro` em texto pronto
 * para o `aviso` da tela.
 */

export interface DisparoDestination {
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

export async function dispararActiveMessages(pedido: {
  channelId: string;
  template_id: string;
  contacts: DisparoDestination[];
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

/** O `erro.mensagem` que a `api` põe no corpo (`ErroPipe`), ou o texto padrão. */
export function motivoDe(error: unknown, padrao: string): string {
  if (error instanceof ApiError) {
    const corpo = error.corpo as { error?: { message?: unknown } } | null;
    const message = corpo?.error?.message;
    if (typeof message === 'string' && message) return message;
  }
  return padrao;
}

/** `MotivoDeRecusa` de `dominio/mensagem-ativa.ts`, em português de tela. */
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

import { api, ApiError, pedir } from './api';
import { atualizarLeituras } from './acoes';
import type { ChannelOfFlow } from '@pipe/contracts';
import type {
  ChannelInstagramVisivel,
  ChannelMessengerVisivel,
  ChannelWhatsAppVisivel,
  PedidoDePerfil,
  PreferencesRequest,
  PerfilVisivel,
  ChannelPreferences,
} from './canais';

/**
 * As escritas de `/v1/canais/whatsapp` e `/v1/canais/instagram` — mesmo
 * formato de `paginas/fluxo/configuracoes/basicas/gravar.ts`: `Resultado<T>`
 * com `erro` em texto para a tela, e `campo` quando a `api` aponta qual (a
 * tarefa pede: `{erro:{codigo,mensagem,detalhe?:{campo}}}` → mensagem no
 * campo certo).
 */
export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string; campo?: string };

function falha<T>(error: unknown, padrao: string): Resultado<T> {
  if (error instanceof ApiError) {
    const corpo = error.corpo as { error?: { message?: unknown; detalhe?: { campo?: unknown } } } | null;
    const message = corpo?.error?.message;
    const campo = corpo?.error?.detalhe?.campo;
    return {
      ok: false,
      error: typeof message === 'string' && message ? message : padrao,
      ...(typeof campo === 'string' ? { campo } : {}),
    };
  }
  return { ok: false, error: padrao };
}

/* ------------------------------------------------------------- WhatsApp */

export interface ConexaoManualWhatsApp {
  wabaId: string;
  numeroId: string;
  token: string;
  appSecret: string;
  nome?: string;
  /** Conexão feita de dentro do bot: o canal nasce ligado a ele (`fluxo_id`). */
  flowId?: string;
  /** Reconexão: troca a credencial DESTE canal em vez de criar outro. */
  channelId?: string;
}

export interface ChannelConnected<T> {
  channel: T;
  webhookError: string | null;
  webhook: { url: string; verifyToken: string };
}

export async function conectarWhatsappManual(
  data: ConexaoManualWhatsApp,
): Promise<Resultado<ChannelConnected<ChannelWhatsAppVisivel>>> {
  try {
    const resposta = await api.post<
      ChannelWhatsAppVisivel & { webhookError: string | null; webhook: { url: string; verifyToken: string } }
    >('/v1/canais/whatsapp/manual', {
      waba_id: data.wabaId,
      phone_number_id: data.numeroId,
      access_token: data.token,
      app_secret: data.appSecret,
      ...(data.nome ? { nome: data.nome } : {}),
      ...(data.flowId ? { fluxo_id: data.flowId } : {}),
      ...(data.channelId ? { canal_id: data.channelId } : {}),
    });
    atualizarLeituras();
    const { webhookError, webhook, ...channel } = resposta;
    return { ok: true, value: { channel, webhookError, webhook } };
  } catch (error) {
    return falha(error, 'Não foi possível conectar o WhatsApp.');
  }
}

/* -------------------------------------------------------- O canal do bot */

/** "Ativar número": `PUT /v1/gestao/fluxos/:id/canal` — o canal passa a ser deste bot. */
export async function ligarChannelToFlow(flowId: string, channelId: string): Promise<Resultado<ChannelOfFlow>> {
  try {
    const value = await api.put<ChannelOfFlow>(`/v1/gestao/fluxos/${flowId}/canal`, { channelId });
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return falha(error, 'Não foi possível ligar o canal a este bot.');
  }
}

/** "Desconectar canal": `DELETE /v1/gestao/fluxos/:id/canal`. O canal em si continua conectado à Meta. */
export async function flowDesligarChannel(flowId: string, motivo: string): Promise<Resultado<void>> {
  try {
    await pedir<void>(`/v1/gestao/fluxos/${flowId}/canal`, {
      method: 'DELETE',
      body: JSON.stringify({ motivo }),
    });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return falha(error, 'Não foi possível desconectar o canal deste bot.');
  }
}

export async function desconectarWhatsapp(id: string): Promise<Resultado<ChannelWhatsAppVisivel>> {
  try {
    const value = await api.delete<ChannelWhatsAppVisivel>(`/v1/canais/whatsapp/${id}`);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return falha(error, 'Não foi possível desconectar o WhatsApp.');
  }
}

export async function gravarPerfilWhatsapp(
  id: string,
  pedido: PedidoDePerfil,
): Promise<Resultado<PerfilVisivel>> {
  try {
    const value = await api.patch<PerfilVisivel>(`/v1/canais/whatsapp/${id}/perfil`, pedido);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return falha(error, 'Não foi possível gravar o perfil.');
  }
}

export async function savePreferencesWhatsapp(
  id: string,
  pedido: PreferencesRequest,
): Promise<Resultado<ChannelPreferences>> {
  try {
    const value = await api.patch<ChannelPreferences>(`/v1/canais/whatsapp/${id}/preferencias`, pedido);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return falha(error, 'Não foi possível gravar as preferências.');
  }
}

export interface SyncResult {
  criados: number;
  atualizados: number;
  removidos: number;
  ignorados: number;
}

export async function channelSincronizarTemplates(id: string): Promise<Resultado<SyncResult>> {
  try {
    const value = await api.post<SyncResult>(`/v1/canais/whatsapp/${id}/modelos/sincronizar`);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return falha(error, 'Não foi possível sincronizar com a Meta.');
  }
}

export interface TemplateRequest {
  nome: string;
  idioma: string;
  categoria: string;
  cabecalho?: string;
  corpo: string;
  rodape?: string;
  exemplos?: string[];
  exemploDoCabecalho?: string;
}

export async function createTemplateInChannel(
  id: string,
  pedido: TemplateRequest,
): Promise<Resultado<{ id: string; statusMeta: string }>> {
  try {
    const value = await api.post<{ id: string; statusMeta: string }>(
      `/v1/canais/whatsapp/${id}/modelos`,
      pedido,
    );
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return falha(error, 'Não foi possível criar o modelo.');
  }
}

export async function channelExcluirTemplate(id: string, nome: string): Promise<Resultado<{ removidos: number }>> {
  try {
    const value = await api.delete<{ removidos: number }>(
      `/v1/canais/whatsapp/${id}/modelos/${encodeURIComponent(nome)}`,
    );
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return falha(error, 'Não foi possível excluir o modelo.');
  }
}

/* ------------------------------------------------------------- Instagram */

export interface ConexaoManualInstagram {
  token: string;
  appSecret: string;
  nome?: string;
  flowId?: string;
}

export async function conectarInstagramManual(
  data: ConexaoManualInstagram,
): Promise<Resultado<ChannelConnected<ChannelInstagramVisivel>>> {
  try {
    const resposta = await api.post<
      ChannelInstagramVisivel & { webhookError: string | null; webhook: { url: string; verifyToken: string } }
    >('/v1/canais/instagram/manual', {
      access_token: data.token,
      app_secret: data.appSecret,
      ...(data.nome ? { nome: data.nome } : {}),
      ...(data.flowId ? { fluxo_id: data.flowId } : {}),
    });
    atualizarLeituras();
    const { webhookError, webhook, ...channel } = resposta;
    return { ok: true, value: { channel, webhookError, webhook } };
  } catch (error) {
    return falha(error, 'Não foi possível conectar o Instagram.');
  }
}

export async function desconectarInstagram(id: string): Promise<Resultado<ChannelInstagramVisivel>> {
  try {
    const value = await api.delete<ChannelInstagramVisivel>(`/v1/canais/instagram/${id}`);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return falha(error, 'Não foi possível desconectar o Instagram.');
  }
}

export async function conectarMessengerManual(data: { token: string; appSecret: string; nome?: string; flowId?: string }): Promise<Resultado<ChannelConnected<ChannelMessengerVisivel>>> { try { const resposta = await api.post<ChannelMessengerVisivel & { webhookError: string | null; webhook: { url: string; verifyToken: string } }>('/v1/canais/messenger/manual', { access_token: data.token, app_secret: data.appSecret, ...(data.nome ? { nome: data.nome } : {}), ...(data.flowId ? { fluxo_id: data.flowId } : {}) }); atualizarLeituras(); const { webhookError, webhook, ...channel } = resposta; return { ok: true, value: { channel, webhookError, webhook } }; } catch (error) { return falha(error, 'Não foi possível conectar o Messenger.'); } }
export async function desconectarMessenger(id: string): Promise<Resultado<ChannelMessengerVisivel>> { try { const value = await api.delete<ChannelMessengerVisivel>(`/v1/canais/messenger/${id}`); atualizarLeituras(); return { ok: true, value }; } catch (error) { return falha(error, 'Não foi possível desconectar o Messenger.'); } }

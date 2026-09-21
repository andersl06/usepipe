import { api, ErroDaApi } from './api';
import { atualizarLeituras } from './acoes';
import type {
  CanalInstagramVisivel,
  CanalMessengerVisivel,
  CanalWhatsAppVisivel,
  PedidoDePerfil,
  PedidoDePreferencias,
  PerfilVisivel,
  PreferenciasDoCanal,
} from './canais';

/**
 * As escritas de `/v1/canais/whatsapp` e `/v1/canais/instagram` — mesmo
 * formato de `paginas/fluxo/configuracoes/basicas/gravar.ts`: `Resultado<T>`
 * com `erro` em texto para a tela, e `campo` quando a `api` aponta qual (a
 * tarefa pede: `{erro:{codigo,mensagem,detalhe?:{campo}}}` → mensagem no
 * campo certo).
 */
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string; campo?: string };

function falha<T>(erro: unknown, padrao: string): Resultado<T> {
  if (erro instanceof ErroDaApi) {
    const corpo = erro.corpo as { erro?: { mensagem?: unknown; detalhe?: { campo?: unknown } } } | null;
    const mensagem = corpo?.erro?.mensagem;
    const campo = corpo?.erro?.detalhe?.campo;
    return {
      ok: false,
      erro: typeof mensagem === 'string' && mensagem ? mensagem : padrao,
      ...(typeof campo === 'string' ? { campo } : {}),
    };
  }
  return { ok: false, erro: padrao };
}

/* ------------------------------------------------------------- WhatsApp */

export interface ConexaoManualWhatsApp {
  wabaId: string;
  numeroId: string;
  token: string;
  appSecret: string;
  nome?: string;
}

export interface CanalConectado<T> {
  canal: T;
  erroDeWebhook: string | null;
  webhook: { url: string; verifyToken: string };
}

export async function conectarWhatsappManual(
  dados: ConexaoManualWhatsApp,
): Promise<Resultado<CanalConectado<CanalWhatsAppVisivel>>> {
  try {
    const resposta = await api.post<
      CanalWhatsAppVisivel & { erroDeWebhook: string | null; webhook: { url: string; verifyToken: string } }
    >('/v1/canais/whatsapp/manual', {
      waba_id: dados.wabaId,
      phone_number_id: dados.numeroId,
      access_token: dados.token,
      app_secret: dados.appSecret,
      ...(dados.nome ? { nome: dados.nome } : {}),
    });
    atualizarLeituras();
    const { erroDeWebhook, webhook, ...canal } = resposta;
    return { ok: true, valor: { canal, erroDeWebhook, webhook } };
  } catch (erro) {
    return falha(erro, 'Não foi possível conectar o WhatsApp.');
  }
}

export async function desconectarWhatsapp(id: string): Promise<Resultado<CanalWhatsAppVisivel>> {
  try {
    const valor = await api.delete<CanalWhatsAppVisivel>(`/v1/canais/whatsapp/${id}`);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return falha(erro, 'Não foi possível desconectar o WhatsApp.');
  }
}

export async function gravarPerfilWhatsapp(
  id: string,
  pedido: PedidoDePerfil,
): Promise<Resultado<PerfilVisivel>> {
  try {
    const valor = await api.patch<PerfilVisivel>(`/v1/canais/whatsapp/${id}/perfil`, pedido);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return falha(erro, 'Não foi possível gravar o perfil.');
  }
}

export async function gravarPreferenciasWhatsapp(
  id: string,
  pedido: PedidoDePreferencias,
): Promise<Resultado<PreferenciasDoCanal>> {
  try {
    const valor = await api.patch<PreferenciasDoCanal>(`/v1/canais/whatsapp/${id}/preferencias`, pedido);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return falha(erro, 'Não foi possível gravar as preferências.');
  }
}

export interface ResultadoDaSincronizacao {
  criados: number;
  atualizados: number;
  removidos: number;
  ignorados: number;
}

export async function sincronizarModelosDoCanal(id: string): Promise<Resultado<ResultadoDaSincronizacao>> {
  try {
    const valor = await api.post<ResultadoDaSincronizacao>(`/v1/canais/whatsapp/${id}/modelos/sincronizar`);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return falha(erro, 'Não foi possível sincronizar com a Meta.');
  }
}

export interface PedidoDeModelo {
  nome: string;
  idioma: string;
  categoria: string;
  cabecalho?: string;
  corpo: string;
  rodape?: string;
  exemplos?: string[];
  exemploDoCabecalho?: string;
}

export async function criarModeloNoCanal(
  id: string,
  pedido: PedidoDeModelo,
): Promise<Resultado<{ id: string; statusMeta: string }>> {
  try {
    const valor = await api.post<{ id: string; statusMeta: string }>(
      `/v1/canais/whatsapp/${id}/modelos`,
      pedido,
    );
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return falha(erro, 'Não foi possível criar o modelo.');
  }
}

export async function excluirModeloDoCanal(id: string, nome: string): Promise<Resultado<{ removidos: number }>> {
  try {
    const valor = await api.delete<{ removidos: number }>(
      `/v1/canais/whatsapp/${id}/modelos/${encodeURIComponent(nome)}`,
    );
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return falha(erro, 'Não foi possível excluir o modelo.');
  }
}

/* ------------------------------------------------------------- Instagram */

export interface ConexaoManualInstagram {
  token: string;
  appSecret: string;
  nome?: string;
}

export async function conectarInstagramManual(
  dados: ConexaoManualInstagram,
): Promise<Resultado<CanalConectado<CanalInstagramVisivel>>> {
  try {
    const resposta = await api.post<
      CanalInstagramVisivel & { erroDeWebhook: string | null; webhook: { url: string; verifyToken: string } }
    >('/v1/canais/instagram/manual', {
      access_token: dados.token,
      app_secret: dados.appSecret,
      ...(dados.nome ? { nome: dados.nome } : {}),
    });
    atualizarLeituras();
    const { erroDeWebhook, webhook, ...canal } = resposta;
    return { ok: true, valor: { canal, erroDeWebhook, webhook } };
  } catch (erro) {
    return falha(erro, 'Não foi possível conectar o Instagram.');
  }
}

export async function desconectarInstagram(id: string): Promise<Resultado<CanalInstagramVisivel>> {
  try {
    const valor = await api.delete<CanalInstagramVisivel>(`/v1/canais/instagram/${id}`);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return falha(erro, 'Não foi possível desconectar o Instagram.');
  }
}

export async function conectarMessengerManual(dados: { token: string; appSecret: string; nome?: string }): Promise<Resultado<CanalConectado<CanalMessengerVisivel>>> { try { const resposta = await api.post<CanalMessengerVisivel & { erroDeWebhook: string | null; webhook: { url: string; verifyToken: string } }>('/v1/canais/messenger/manual', { access_token: dados.token, app_secret: dados.appSecret, ...(dados.nome ? { nome: dados.nome } : {}) }); atualizarLeituras(); const { erroDeWebhook, webhook, ...canal } = resposta; return { ok: true, valor: { canal, erroDeWebhook, webhook } }; } catch (erro) { return falha(erro, 'Não foi possível conectar o Messenger.'); } }
export async function desconectarMessenger(id: string): Promise<Resultado<CanalMessengerVisivel>> { try { const valor = await api.delete<CanalMessengerVisivel>(`/v1/canais/messenger/${id}`); atualizarLeituras(); return { ok: true, valor }; } catch (erro) { return falha(erro, 'Não foi possível desconectar o Messenger.'); } }

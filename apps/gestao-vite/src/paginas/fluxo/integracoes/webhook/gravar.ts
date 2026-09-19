import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { motivoDe } from '../../configuracoes/basicas/gravar';

/**
 * CRUD de `webhook_saida` — `dominio/gestao/integracoes.ts`. É da CONTA, não
 * do fluxo (ver o comentário lá): a rota é `/v1/gestao/webhooks`, sem `:id`
 * de fluxo, mesmo a tela vivendo sob `fluxo/:id/integracoes/webhook`.
 */
export interface WebhookListado {
  id: string;
  url: string;
  eventos: string[];
  ativo: boolean;
  criadoEm: string;
}

export interface WebhookCriado extends WebhookListado {
  /** Só existe na resposta da criação — o banco guarda o segredo para assinar, a tela não. */
  segredo: string;
}

export interface ResultadoDeTeste {
  ok: boolean;
  status?: number;
  erro?: string;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

export async function criarWebhook(
  url: string,
  eventos: string[],
): Promise<Resultado<WebhookCriado>> {
  try {
    const valor = await api.post<WebhookCriado>('/v1/gestao/webhooks', { url, eventos });
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível criar o webhook.') };
  }
}

export async function editarWebhook(
  id: string,
  pedido: { url?: string; eventos?: string[]; ativo?: boolean },
): Promise<Resultado<WebhookListado>> {
  try {
    const valor = await api.patch<WebhookListado>(`/v1/gestao/webhooks/${id}`, pedido);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível salvar o webhook.') };
  }
}

export async function excluirWebhook(id: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/gestao/webhooks/${id}`);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível excluir o webhook.') };
  }
}

export async function testarWebhook(id: string): Promise<Resultado<ResultadoDeTeste>> {
  try {
    const valor = await api.post<ResultadoDeTeste>(`/v1/gestao/webhooks/${id}/testar`);
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível testar o webhook.') };
  }
}

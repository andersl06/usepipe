import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { motivoDe } from '../../configuracoes/basicas/gravar';

/**
 * CRUD de `webhook_saida` — `dominio/gestao/integracoes.ts`. É da CONTA, não
 * do fluxo (ver o comentário lá): a rota é `/v1/gestao/webhooks`, sem `:id`
 * de fluxo, mesmo a tela vivendo sob `fluxo/:id/integracoes/webhook`.
 *
 * "Configurações de autenticação" e "Cabeçalhos customizados" (migration
 * 0036): `autenticacao.senha`/`autenticacao.clientSecret` só existem no
 * PEDIDO de criação/edição — a resposta nunca os devolve (nem cifrados).
 */
export const TIPOS_AUTHENTICATION = ['nenhuma', 'basica', 'oauth2_client_credentials'] as const;
export type TipoAuthentication = (typeof TIPOS_AUTHENTICATION)[number];

export interface AuthenticationVisivel {
  tipo: TipoAuthentication;
  user: string | null;
  urlAuthorization: string | null;
  clientId: string | null;
}

/** O que a tela ENVIA — os campos de segredo só aqui, nunca na resposta. */
export interface AuthenticationInbound {
  tipo: TipoAuthentication;
  user?: string;
  senha?: string;
  urlAuthorization?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface CabecalhoCustomizado {
  key: string;
  value: string;
}

export interface WebhookListado {
  id: string;
  url: string;
  eventos: string[];
  ativo: boolean;
  criadoEm: string;
  authentication: AuthenticationVisivel;
  cabecalhos: CabecalhoCustomizado[];
}

export interface WebhookCriado extends WebhookListado {
  /** Só existe na resposta da criação — o banco guarda o segredo para assinar, a tela não. */
  secret: string;
}

export interface TestResult {
  ok: boolean;
  status?: number;
  error?: string;
  /** Prévia curta do corpo da resposta — "mostra a resposta (status e corpo curto)". */
  corpo?: string;
}

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

export async function createWebhook(
  url: string,
  eventos: string[],
  authentication?: AuthenticationInbound,
  cabecalhos?: CabecalhoCustomizado[],
): Promise<Resultado<WebhookCriado>> {
  try {
    const value = await api.post<WebhookCriado>('/v1/management/webhooks', {
      url,
      eventos,
      authentication,
      cabecalhos,
    });
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível criar o webhook.') };
  }
}

export async function editarWebhook(
  id: string,
  pedido: {
    url?: string;
    eventos?: string[];
    ativo?: boolean;
    authentication?: AuthenticationInbound;
    cabecalhos?: CabecalhoCustomizado[];
  },
): Promise<Resultado<WebhookListado>> {
  try {
    const value = await api.patch<WebhookListado>(`/v1/management/webhooks/${id}`, pedido);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar o webhook.') };
  }
}

export async function excluirWebhook(id: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/management/webhooks/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir o webhook.') };
  }
}

export async function testarWebhook(id: string): Promise<Resultado<TestResult>> {
  try {
    const value = await api.post<TestResult>(`/v1/management/webhooks/${id}/test`);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível testar o webhook.') };
  }
}

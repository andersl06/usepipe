import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/actions';
import { motivoDe } from '../../settings/basic/gravar';

/**
 * CRUD for `webhook_saida` — `dominio/gestao/integracoes.ts`. It belongs to the ACCOUNT, not the flow (see the comment there): the route is `/v1/gestao/webhooks`, with no flow `:id`, even though the screen lives under `fluxo/:id/integracoes/webhook`.
 *
 * "Configurações de autenticação" and "Cabeçalhos customizados" (migration 0036): `autenticacao.senha`/`autenticacao.clientSecret` only exist in the creation/edit REQUEST — the response never returns them (not even encrypted).
 */
export const TYPES_AUTHENTICATION = ['nenhuma', 'basica', 'oauth2_client_credentials'] as const;
export type TypeAuthentication = (typeof TYPES_AUTHENTICATION)[number];

export interface AuthenticationVisible {
  type: TypeAuthentication;
  user: string | null;
  urlAuthorization: string | null;
  clientId: string | null;
}

/** What the screen SENDS — the secret fields only live here, never in the response. */
export interface AuthenticationInbound {
  tipo: TypeAuthentication;
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
  active: boolean;
  criadoEm: string;
  authentication: AuthenticationVisible;
  cabecalhos: CabecalhoCustomizado[];
}

export interface WebhookCriado extends WebhookListado {
  /** Only exists in the creation response — the database keeps the secret for signing, the screen doesn't. */
  secret: string;
}

export interface TestResult {
  ok: boolean;
  status?: number;
  error?: string;
  /** Short preview of the response body — "shows the response (status and a short body)". */
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
    active?: boolean;
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

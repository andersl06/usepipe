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
export const TIPOS_AUTENTICACAO = ['nenhuma', 'basica', 'oauth2_client_credentials'] as const;
export type TipoAutenticacao = (typeof TIPOS_AUTENTICACAO)[number];

export interface AutenticacaoVisivel {
  tipo: TipoAutenticacao;
  usuario: string | null;
  urlAutorizacao: string | null;
  clientId: string | null;
}

/** O que a tela ENVIA — os campos de segredo só aqui, nunca na resposta. */
export interface AutenticacaoEntrada {
  tipo: TipoAutenticacao;
  usuario?: string;
  senha?: string;
  urlAutorizacao?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface CabecalhoCustomizado {
  chave: string;
  valor: string;
}

export interface WebhookListado {
  id: string;
  url: string;
  eventos: string[];
  ativo: boolean;
  criadoEm: string;
  autenticacao: AutenticacaoVisivel;
  cabecalhos: CabecalhoCustomizado[];
}

export interface WebhookCriado extends WebhookListado {
  /** Só existe na resposta da criação — o banco guarda o segredo para assinar, a tela não. */
  segredo: string;
}

export interface ResultadoDeTeste {
  ok: boolean;
  status?: number;
  erro?: string;
  /** Prévia curta do corpo da resposta — "mostra a resposta (status e corpo curto)". */
  corpo?: string;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

export async function criarWebhook(
  url: string,
  eventos: string[],
  autenticacao?: AutenticacaoEntrada,
  cabecalhos?: CabecalhoCustomizado[],
): Promise<Resultado<WebhookCriado>> {
  try {
    const valor = await api.post<WebhookCriado>('/v1/gestao/webhooks', {
      url,
      eventos,
      autenticacao,
      cabecalhos,
    });
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível criar o webhook.') };
  }
}

export async function editarWebhook(
  id: string,
  pedido: {
    url?: string;
    eventos?: string[];
    ativo?: boolean;
    autenticacao?: AutenticacaoEntrada;
    cabecalhos?: CabecalhoCustomizado[];
  },
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

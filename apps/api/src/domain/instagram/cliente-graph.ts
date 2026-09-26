import { createHash, createHmac } from 'node:crypto';
import { PipeError } from '../../errors.js';
import { modoDaConexao, versaoDaApi } from '../whatsapp/cliente-graph.js';

/**
 * Reconstructed from chatwoot/chatwoot (MIT), app/services/instagram/* (`Instagram::BaseService`, `Instagram::RefreshOauthTokenService`) and `Channel::Instagram#subscribe`/`#unsubscribe`. With no network access to inspect the original, the port follows the Instagram Platform API ("Instagram API with Instagram Login") at `graph.instagram.com`; unverified behavior is marked "verify with a real token". Chatwoot `fetch_instagram_user_details` maps to `buscarConta`, `subscribe`/`unsubscribe` to `assinarWebhook`/`desassinarWebhook`, and `refresh_long_lived_token` to `renovarToken`. As in `../whatsapp/cliente-graph.ts`, raw Meta bodies never enter exceptions, secrets pass through `esconder`, `buscar` is injectable, and `PIPE_WHATSAPP_CONEXAO` selects a deterministic fake. Pipe also adds `conferirSegredoDoApp`: the app belongs to the customer, whose secret signs the webhook. `buscarConta` calls `/me`; `Channel::Instagram#unsubscribe` maps to `desassinarWebhook`, and `RefreshOauthTokenService#refresh_long_lived_token` maps to `renovarToken`.
 */

export const URL_BASE_INSTAGRAM = 'https://graph.instagram.com';

/** Fields delivered to Pipe by the Instagram webhook. */
export const CAMPOS_DO_WEBHOOK_INSTAGRAM = [
  'messages',
  'messaging_postbacks',
  'messaging_seen',
  'message_reactions',
] as const;

/**
 * Use the WhatsApp version, overridable by `INSTAGRAM_API_VERSAO`. Verify with a real token that `graph.instagram.com` supports the same Graph version; the latest WhatsApp version may not be available there.
 */
export function versaoDaApiInstagram(): string {
  return process.env['INSTAGRAM_API_VERSAO'] ?? versaoDaApi();
}

/** `GET /me?fields=user_id,username,name,profile_picture_url`. */
export interface AccountInstagram {
  /** App-scoped user ID. */
  id?: string;
  /** Professional account ID, used as webhook `entry[].id` and `recipient.id`. */
  user_id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
}

export interface TokenRenovado {
  access_token?: string;
  token_type?: string;
  /** Seconds; the long-lived token is valid for 60 days. */
  expires_in?: number;
}

export abstract class ClienteGraphInstagram {
  abstract readonly nome: 'real' | 'duble';
  abstract fetchAccount(): Promise<AccountInstagram>;
  /** Prove that the pasted App Secret belongs to the app that issued the token (`appsecret_proof`). */
  abstract checkSecretOfApp(segredo: string): Promise<boolean>;
  abstract assinarWebhook(igUserId: string): Promise<unknown>;
  abstract desassinarWebhook(igUserId: string): Promise<unknown>;
  abstract renovarToken(): Promise<TokenRenovado>;
}

/**
 * Remove secrets from text that may become an error message. This copies the unexported `esconder` from `../whatsapp/cliente-graph.ts`.
 */
function esconder(texto: string, ...segredos: string[]): string {
  let saida = texto;
  for (const segredo of segredos) {
    if (segredo.length >= 8) saida = saida.split(segredo).join('«segredo»');
  }
  return saida;
}

export class ClienteGraphInstagramReal extends ClienteGraphInstagram {
  readonly nome = 'real' as const;

  constructor(
    private readonly token = '',
    private readonly buscar: typeof fetch = fetch,
  ) {
    super();
  }

  private url(caminho: string, query: Record<string, string> = {}, versionado = true): string {
    const prefix = versionado ? `${URL_BASE_INSTAGRAM}/${versaoDaApiInstagram()}` : URL_BASE_INSTAGRAM;
    const url = new URL(`${prefix}/${caminho}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url.toString();
  }

  /** Verify with a real token that `graph.instagram.com` accepts `Authorization: Bearer`. */
  private cabecalhos(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }

  private async pedir<T>(url: string, init: RequestInit, message: string, ...secrets: string[]): Promise<T> {
    const ocultos = [this.token, ...secrets];
    let resposta: Response;
    try {
      resposta = await this.buscar(url, init);
    } catch (error) {
      throw new PipeError(
        502,
        'meta_unreachable',
        `${message}: ${esconder(String((error as Error)?.message ?? error), ...ocultos)}`,
      );
    }
    const texto = await resposta.text();
    let corpo: unknown = null;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch {
      corpo = null;
    }
    if (!resposta.ok) {
      const error = (corpo as { error?: { code?: number; message?: string } } | null)?.error;
      const detalhe = error?.message ? esconder(error.message, ...ocultos) : `HTTP ${resposta.status}`;
      throw new PipeError(502, 'meta_refused', `${message}: ${detalhe}`, {
        http: resposta.status,
        ...(error?.code === undefined ? {} : { codigo_meta: error.code }),
      });
    }
    return corpo as T;
  }

  fetchAccount(): Promise<AccountInstagram> {
    return this.pedir(
      this.url('me', { fields: 'user_id,username,name,profile_picture_url' }),
      { headers: this.cabecalhos() },
      'A leitura da conta do Instagram falhou',
    );
  }

  /** Verify with a real token that `graph.instagram.com` validates `appsecret_proof` as Facebook Graph does. */
  async checkSecretOfApp(secret: string): Promise<boolean> {
    const prova = createHmac('sha256', secret).update(this.token).digest('hex');
    try {
      await this.pedir(
        this.url('me', { fields: 'user_id', appsecret_proof: prova }),
        { headers: this.cabecalhos() },
        'A conferência do App Secret falhou',
        secret,
        prova,
      );
      return true;
    } catch (erro) {
      if (erro instanceof PipeError && erro.codigo === 'meta_refused') return false;
      throw erro;
    }
  }

  assinarWebhook(igUserId: string): Promise<unknown> {
    return this.pedir(
      this.url(`${igUserId}/subscribed_apps`, { subscribed_fields: CAMPOS_DO_WEBHOOK_INSTAGRAM.join(',') }),
      { method: 'POST', headers: this.cabecalhos() },
      'A assinatura do webhook do Instagram falhou',
    );
  }

  /** Verify with a real token that `DELETE /{ig-user-id}/subscribed_apps` exists on `graph.instagram.com`. */
  desassinarWebhook(igUserId: string): Promise<unknown> {
    return this.pedir(
      this.url(`${igUserId}/subscribed_apps`),
      { method: 'DELETE', headers: this.cabecalhos() },
      'A retirada do webhook do Instagram falhou',
    );
  }

  /**
   * `GET /refresh_access_token?grant_type=ig_refresh_token` has no version in the path and passes the token in the query, as documented. Verify with a real token.
   */
  renovarToken(): Promise<TokenRenovado> {
    return this.pedir(
      this.url('refresh_access_token', { grant_type: 'ig_refresh_token', access_token: this.token }, false),
      {},
      'A renovação do token do Instagram falhou',
    );
  }
}

export interface ChamadaGraphInstagram {
  acao: string;
  igUserId?: string;
}

/**
 * Deterministic fake based on the token: the same token always identifies the same account, proving that one account cannot be added to two tenants. Tokens starting `invalido…` simulate Meta rejecting the token; `expirado…` rejects renewal. A secret starting `bad` belongs to another app.
 */
export class ClienteGraphInstagramDuble extends ClienteGraphInstagram {
  readonly nome = 'duble' as const;
  static readonly chamadas: ChamadaGraphInstagram[] = [];
  private static renewals = 0;

  static reiniciar(): void {
    ClienteGraphInstagramDuble.chamadas.length = 0;
    ClienteGraphInstagramDuble.renewals = 0;
  }

  /** Stable 17-digit professional account ID. */
  static idOfAccount(token: string): string {
    const hash = createHash('sha256').update(token).digest('hex').slice(0, 14);
    return `178${BigInt(`0x${hash}`).toString().padStart(14, '0').slice(0, 14)}`;
  }

  constructor(private readonly token = '') {
    super();
  }

  private recusar(mensagem: string): Promise<never> {
    return Promise.reject(
      new PipeError(502, 'meta_refused', `${mensagem}: Invalid OAuth access token.`, { http: 400, codigo_meta: 190 }),
    );
  }

  fetchAccount(): Promise<AccountInstagram> {
    ClienteGraphInstagramDuble.chamadas.push({ acao: 'buscar_conta' });
    if (!this.token || this.token.startsWith('invalido')) return this.recusar('A leitura da conta do Instagram falhou');
    const userId = ClienteGraphInstagramDuble.idOfAccount(this.token);
    return Promise.resolve({
      id: `app-${userId}`,
      user_id: userId,
      username: `conta_${userId.slice(-6)}`,
      name: 'Conta de Ensaio',
    });
  }

  checkSecretOfApp(segredo: string): Promise<boolean> {
    ClienteGraphInstagramDuble.chamadas.push({ acao: 'conferir_segredo' });
    return Promise.resolve(!segredo.startsWith('bad'));
  }

  assinarWebhook(igUserId: string): Promise<unknown> {
    ClienteGraphInstagramDuble.chamadas.push({ acao: 'assinar', igUserId });
    return Promise.resolve({ success: true });
  }

  desassinarWebhook(igUserId: string): Promise<unknown> {
    ClienteGraphInstagramDuble.chamadas.push({ acao: 'desassinar', igUserId });
    return Promise.resolve({ success: true });
  }

  renovarToken(): Promise<TokenRenovado> {
    ClienteGraphInstagramDuble.chamadas.push({ acao: 'renovar' });
    if (this.token.startsWith('expirado') || this.token.startsWith('invalido')) {
      return this.recusar('A renovação do token do Instagram falhou');
    }
    ClienteGraphInstagramDuble.renewals += 1;
    // The renewed token keeps the original prefix, so the fake derives the same account. After connection, the stored `igUserId` is authoritative.
    return Promise.resolve({
      access_token: `${this.token.split('~')[0]}~r${ClienteGraphInstagramDuble.renewals}`,
      token_type: 'bearer',
      expires_in: 60 * 24 * 3600,
    });
  }
}

type FabricaDeCliente = (token?: string) => ClienteGraphInstagram;
let fabrica: FabricaDeCliente | null = null;

export function clienteGraphInstagram(token?: string): ClienteGraphInstagram {
  fabrica ??=
    modoDaConexao() === 'real'
      ? (t) => new ClienteGraphInstagramReal(t)
      : (t) => new ClienteGraphInstagramDuble(t);
  return fabrica(token);
}

/** Replace the factory at runtime for tests. */
export function definirFabricaGraphInstagram(nova: FabricaDeCliente | null): void {
  fabrica = nova;
}

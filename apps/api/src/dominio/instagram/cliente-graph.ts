import { createHash, createHmac } from 'node:crypto';
import { ErroPipe } from '../../erros.js';
import { modoDaConexao, versaoDaApi } from '../whatsapp/cliente-graph.js';

/**
 * Reconstruído a partir de chatwoot/chatwoot (MIT), app/services/instagram/*
 * (`Instagram::BaseService`, `Instagram::RefreshOauthTokenService`) e do
 * `Channel::Instagram#subscribe`/`#unsubscribe`. Sem rede para ler o original: o
 * porte segue a Instagram Platform API ("Instagram API with Instagram Login"),
 * `graph.instagram.com`, e o que não deu para confirmar está marcado com
 * "conferir com token real".
 *
 * | Chatwoot                                    | aqui                   |
 * |---------------------------------------------|------------------------|
 * | `fetch_instagram_user_details` (`/me`)      | `buscarConta`          |
 * | `Channel::Instagram#subscribe`              | `assinarWebhook`       |
 * | `Channel::Instagram#unsubscribe`            | `desassinarWebhook`    |
 * | `RefreshOauthTokenService#refresh_long_lived_token` | `renovarToken` |
 *
 * Acréscimos do Pipe, os mesmos do cliente do WhatsApp (`../whatsapp/cliente-graph.ts`):
 * corpo cru da Meta nunca entra na exceção e todo segredo passa por `esconder`;
 * `buscar` injetável; dublê determinístico escolhido por `PIPE_WHATSAPP_CONEXAO`.
 * E um que o Chatwoot não tem: `conferirSegredoDoApp`, porque aqui o app é o do
 * CLIENTE e é o segredo dele que assina o webhook.
 */

export const URL_BASE_INSTAGRAM = 'https://graph.instagram.com';

/** Os campos que o webhook do Instagram entrega para a Pipe. */
export const CAMPOS_DO_WEBHOOK_INSTAGRAM = [
  'messages',
  'messaging_postbacks',
  'messaging_seen',
  'message_reactions',
] as const;

/**
 * A mesma versão do WhatsApp, sobreponível por `INSTAGRAM_API_VERSAO`.
 * Conferir com token real: o `graph.instagram.com` segue a numeração do Graph,
 * mas não há garantia de que a versão mais nova do WhatsApp já exista lá.
 */
export function versaoDaApiInstagram(): string {
  return process.env['INSTAGRAM_API_VERSAO'] ?? versaoDaApi();
}

/** `GET /me?fields=user_id,username,name,profile_picture_url`. */
export interface ContaInstagram {
  /** O id "app-scoped" do usuário. */
  id?: string;
  /** O id da conta profissional: é o `entry[].id` e o `recipient.id` do webhook. */
  user_id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
}

export interface TokenRenovado {
  access_token?: string;
  token_type?: string;
  /** Segundos. O token de longa duração vale 60 dias. */
  expires_in?: number;
}

export abstract class ClienteGraphInstagram {
  abstract readonly nome: 'real' | 'duble';
  abstract buscarConta(): Promise<ContaInstagram>;
  /** Prova que o App Secret colado é do app que gerou o token (`appsecret_proof`). */
  abstract conferirSegredoDoApp(segredo: string): Promise<boolean>;
  abstract assinarWebhook(igUserId: string): Promise<unknown>;
  abstract desassinarWebhook(igUserId: string): Promise<unknown>;
  abstract renovarToken(): Promise<TokenRenovado>;
}

/**
 * Tira segredo de texto que vai virar mensagem de erro. Cópia do `esconder` de
 * `../whatsapp/cliente-graph.ts`, que não é exportado lá.
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

  private url(caminho: string, consulta: Record<string, string> = {}, versionado = true): string {
    const prefixo = versionado ? `${URL_BASE_INSTAGRAM}/${versaoDaApiInstagram()}` : URL_BASE_INSTAGRAM;
    const url = new URL(`${prefixo}/${caminho}`);
    for (const [chave, valor] of Object.entries(consulta)) url.searchParams.set(chave, valor);
    return url.toString();
  }

  /** Conferir com token real: o `graph.instagram.com` aceita o token em `Authorization: Bearer`. */
  private cabecalhos(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }

  private async pedir<T>(url: string, init: RequestInit, mensagem: string, ...segredos: string[]): Promise<T> {
    const ocultos = [this.token, ...segredos];
    let resposta: Response;
    try {
      resposta = await this.buscar(url, init);
    } catch (erro) {
      throw new ErroPipe(
        502,
        'meta_inacessivel',
        `${mensagem}: ${esconder(String((erro as Error)?.message ?? erro), ...ocultos)}`,
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
      const erro = (corpo as { error?: { code?: number; message?: string } } | null)?.error;
      const detalhe = erro?.message ? esconder(erro.message, ...ocultos) : `HTTP ${resposta.status}`;
      throw new ErroPipe(502, 'meta_recusou', `${mensagem}: ${detalhe}`, {
        http: resposta.status,
        ...(erro?.code === undefined ? {} : { codigo_meta: erro.code }),
      });
    }
    return corpo as T;
  }

  buscarConta(): Promise<ContaInstagram> {
    return this.pedir(
      this.url('me', { fields: 'user_id,username,name,profile_picture_url' }),
      { headers: this.cabecalhos() },
      'A leitura da conta do Instagram falhou',
    );
  }

  /** Conferir com token real: que o `graph.instagram.com` confere `appsecret_proof` como o Graph do Facebook. */
  async conferirSegredoDoApp(segredo: string): Promise<boolean> {
    const prova = createHmac('sha256', segredo).update(this.token).digest('hex');
    try {
      await this.pedir(
        this.url('me', { fields: 'user_id', appsecret_proof: prova }),
        { headers: this.cabecalhos() },
        'A conferência do App Secret falhou',
        segredo,
        prova,
      );
      return true;
    } catch (erro) {
      if (erro instanceof ErroPipe && erro.codigo === 'meta_recusou') return false;
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

  /** Conferir com token real: o `DELETE /{ig-user-id}/subscribed_apps` existe no `graph.instagram.com`. */
  desassinarWebhook(igUserId: string): Promise<unknown> {
    return this.pedir(
      this.url(`${igUserId}/subscribed_apps`),
      { method: 'DELETE', headers: this.cabecalhos() },
      'A retirada do webhook do Instagram falhou',
    );
  }

  /**
   * `GET /refresh_access_token?grant_type=ig_refresh_token` — sem versão no caminho e
   * com o token na consulta, como a documentação mostra. Conferir com token real.
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
 * O dublê. Determinístico a partir do token: o mesmo token dá sempre a mesma conta,
 * e é isso que prova que a mesma conta não entra em dois clientes.
 *
 * Tokens que exercitam os caminhos de erro: `invalido…` (a Meta recusa o token) e
 * `expirado…` (recusa a renovação). Segredo que começa com `bad` é de outro app.
 */
export class ClienteGraphInstagramDuble extends ClienteGraphInstagram {
  readonly nome = 'duble' as const;
  static readonly chamadas: ChamadaGraphInstagram[] = [];
  private static renovacoes = 0;

  static reiniciar(): void {
    ClienteGraphInstagramDuble.chamadas.length = 0;
    ClienteGraphInstagramDuble.renovacoes = 0;
  }

  /** Dezessete dígitos estáveis, no formato do id de conta profissional. */
  static idDaConta(token: string): string {
    const hash = createHash('sha256').update(token).digest('hex').slice(0, 14);
    return `178${BigInt(`0x${hash}`).toString().padStart(14, '0').slice(0, 14)}`;
  }

  constructor(private readonly token = '') {
    super();
  }

  private recusar(mensagem: string): Promise<never> {
    return Promise.reject(
      new ErroPipe(502, 'meta_recusou', `${mensagem}: Invalid OAuth access token.`, { http: 400, codigo_meta: 190 }),
    );
  }

  buscarConta(): Promise<ContaInstagram> {
    ClienteGraphInstagramDuble.chamadas.push({ acao: 'buscar_conta' });
    if (!this.token || this.token.startsWith('invalido')) return this.recusar('A leitura da conta do Instagram falhou');
    const userId = ClienteGraphInstagramDuble.idDaConta(this.token);
    return Promise.resolve({
      id: `app-${userId}`,
      user_id: userId,
      username: `conta_${userId.slice(-6)}`,
      name: 'Conta de Ensaio',
    });
  }

  conferirSegredoDoApp(segredo: string): Promise<boolean> {
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
    ClienteGraphInstagramDuble.renovacoes += 1;
    // O token renovado mantém o prefixo do original: a conta do dublê sai do token,
    // mas o canal já guardou o `igUserId` — é ele que vale depois de conectar.
    return Promise.resolve({
      access_token: `${this.token.split('~')[0]}~r${ClienteGraphInstagramDuble.renovacoes}`,
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

/** Troca a fábrica em tempo de execução. Existe para o teste. */
export function definirFabricaGraphInstagram(nova: FabricaDeCliente | null): void {
  fabrica = nova;
}

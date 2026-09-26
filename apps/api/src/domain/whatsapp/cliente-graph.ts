import { createHash, createHmac } from 'node:crypto';
import { PipeError } from '../../errors.js';

/**
 * Ported from chatwoot/chatwoot (MIT), app/services/whatsapp/facebook_api_client.rb. This Graph client serves embedded signup, manual setup, number health, and teardown with the original endpoints, payloads, and order; methods `trocarCodigoPorToken`, `buscarTodosOsNumeros`, `buscarModelos`, `buscarPermissoes`, `buscarNumero`, `registrarNumero`, `descadastrarNumero`, `numeroVerificado`, `assinarWebhookDoNumero`, `assinarAppNaWaba`, `sobrescreverCallbackDoNumero`, `limparCallbackDoNumero`, `desassinarAppDaWaba`, and `pedir` correspond to the Chatwoot operations. Pipe never includes raw response bodies in exceptions: Meta may echo submitted credentials, so only scrubbed error message and code are logged through `esconder`. `buscar` is injectable for network-free tests. `ClienteGraphDuble` enables the full connection path before Meta approves the app; `PIPE_WHATSAPP_CONEXAO=real` uses Graph and other values use the fake. The default API version is v26.0 (Graph changelog, 2026-09-11), versus Chatwoot v22.0; Pipe's former v21.0 expires 2027-01-21. Method mapping in order: `exchange_code_for_token`→`trocarCodigoPorToken`; `fetch_all_phone_numbers`→`buscarTodosOsNumeros`; `fetch_message_templates`→`buscarModelos`; `fetch_permissions`→`buscarPermissoes`; `fetch_phone_number`→`buscarNumero`; `register_phone_number`→`registrarNumero`; `deregister_phone_number`→`descadastrarNumero`; `phone_number_verified?`→`numeroVerificado`; `subscribe_phone_number_webhook`→`assinarWebhookDoNumero`; `subscribe_app_to_waba`→`assinarAppNaWaba`; `override_phone_number_callback`→`sobrescreverCallbackDoNumero`; `clear_phone_number_callback_override`→`limparCallbackDoNumero`; `unsubscribe_app_from_waba`→`desassinarAppDaWaba`; `handle_response`→`pedir`. Chatwoot exposed `"#{error_message}: #{response.body}"`; Pipe logs only scrubbed `error.message`. `PIPE_WHATSAPP_CONEXAO` selects `real` or the fake; Chatwoot uses `v22.0`.
 */

export const URL_BASE = 'https://graph.facebook.com';

/** Resend the original `WEBHOOK_DEFAULT_FIELDS` on every subscription so Meta does not reset them to defaults. */
export const CAMPOS_PADRAO_DO_WEBHOOK = ['messages', 'smb_message_echoes'] as const;

/** `GlobalConfigService.load('WHATSAPP_API_VERSION', …)` do original, com o nome do Pipe. */
export function versaoDaApi(): string {
  return process.env['WHATSAPP_API_VERSAO'] ?? 'v26.0';
}

export function modoDaConexao(): 'real' | 'duble' {
  return process.env['PIPE_WHATSAPP_CONEXAO'] === 'real' ? 'real' : 'duble';
}

export interface NumeroDaWaba {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  code_verification_status?: string;
  status?: string;
}

export interface PermissionOfToken {
  permission?: string;
  status?: string;
}

/** Os campos de `whatsapp_business_profile`, com os nomes da Meta. */
export interface PerfilDoNumero {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
}

export type PerfilParaGravar = Omit<PerfilDoNumero, 'profile_picture_url'> & {
  profile_picture_handle?: string;
};

export const CAMPOS_DO_PERFIL = 'about,address,description,email,profile_picture_url,websites,vertical';

/**
 * Template component accepted and returned by Meta (`HEADER`, `BODY`, `FOOTER`, `BUTTONS`). The last two fields apply only to AUTHENTICATION templates. Meta supplies their text: `BODY.add_security_recommendation` adds "não compartilhe este código", and `FOOTER.code_expiration_minutes` (1–90) adds "este código expira em N minutos"; see `montarModelo` in `modelos.ts`.
 */
export interface ComponentOfTemplate {
  type: string;
  format?: string;
  text?: string;
  example?: Record<string, unknown>;
  buttons?: unknown[];
  add_security_recommendation?: boolean;
  code_expiration_minutes?: number;
}

export interface TemplateOfMeta {
  id?: string;
  name: string;
  language: string;
  status?: string;
  category?: string;
  components?: ComponentOfTemplate[];
}

export interface NewTemplateOfMeta {
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  components: ComponentOfTemplate[];
}

export abstract class ClienteGraph {
  abstract readonly nome: 'real' | 'duble';

  abstract exchangeCodeByToken(codigo: string): Promise<{ access_token?: string }>;
  abstract buscarTodosOsNumeros(wabaId: string): Promise<NumeroDaWaba[]>;
  abstract buscarModelos(wabaId: string): Promise<unknown>;
  abstract fetchPermissions(): Promise<{ data?: PermissionOfToken[] }>;
  abstract buscarNumero(
    id: string,
    campos?: string,
    versao?: string,
  ): Promise<Record<string, unknown>>;
  abstract registrarNumero(numeroId: string, pin: string): Promise<unknown>;
  abstract descadastrarNumero(numeroId: string): Promise<unknown>;
  abstract assinarAppNaWaba(wabaId: string, campos?: readonly string[]): Promise<unknown>;
  abstract sobrescreverCallbackDoNumero(
    numeroId: string,
    url: string,
    verifyToken: string,
  ): Promise<unknown>;
  abstract limparCallbackDoNumero(numeroId: string): Promise<unknown>;
  abstract desassinarAppDaWaba(wabaId: string): Promise<unknown>;

  /*
   * Pipe additions for manual setup and phone profile, which Chatwoot does not edit: Cloud API `GET /app`, `GET|POST /{phone}/whatsapp_business_profile`, and Resumable Upload API `POST /{app}/uploads` plus `POST /{upload}`.
   */

  /** `GET /app` identifies the token-owning app, which belongs to the customer in manual setup. */
  abstract buscarAppDoToken(): Promise<{ id?: string; name?: string }>;
  /**
   * Prove the pasted `appSecret` belongs to the token-owning app: Meta validates `appsecret_proof`, an HMAC-SHA256 of the token using that secret.
   */
  abstract checkSecretOfApp(numeroId: string, secret: string): Promise<boolean>;
  abstract lerPerfil(numeroId: string): Promise<PerfilDoNumero>;
  abstract gravarPerfil(numeroId: string, perfil: PerfilParaGravar): Promise<unknown>;
  /**
   * Upload through the Resumable Upload API and return handle `h`, used by `profile_picture_handle` and template `example.header_handle`. The name predates support for non-photo files; `tipo` is MIME for any media.
   */
  abstract upPhoto(appId: string, bytes: Buffer, tipo: string): Promise<string>;
  /** Fetch all pages of `GET /{waba}/message_templates`. */
  abstract listarModelos(wabaId: string): Promise<TemplateOfMeta[]>;
  /** Submit `POST /{waba}/message_templates` for Meta review. */
  abstract createTemplate(wabaId: string, template: NewTemplateOfMeta): Promise<{ id?: string; status?: string }>;
  /** `DELETE /{waba}/message_templates?name=`: some em TODOS os idiomas desse nome. */
  abstract deleteTemplate(wabaId: string, nome: string): Promise<unknown>;

  /** `phone_number_verified?`: a connected number is registered even if its verification code expired. */
  async numeroVerificado(numeroId: string): Promise<boolean> {
    const data = await this.buscarNumero(numeroId, 'status,code_verification_status');
    return data['status'] === 'CONNECTED' || data['code_verification_status'] === 'VERIFIED';
  }

  /**
   * `subscribe_phone_number_webhook` must subscribe the app to the WABA before any override, as Meta requires (chatwoot#13097). The per-number override wins over the WABA callback, allowing two numbers in one WABA to use different URLs.
   */
  async assinarWebhookDoNumero(
    wabaId: string,
    numeroId: string,
    url: string,
    verifyToken: string,
    campos?: readonly string[],
  ): Promise<unknown> {
    await this.assinarAppNaWaba(wabaId, campos ?? CAMPOS_PADRAO_DO_WEBHOOK);
    return this.sobrescreverCallbackDoNumero(numeroId, url, verifyToken);
  }
}

/** Strip secrets from text that may become an error message; Pipe addition. */
function esconder(texto: string, ...secrets: string[]): string {
  let saida = texto;
  for (const segredo of secrets) {
    if (segredo.length >= 8) saida = saida.split(segredo).join('«segredo»');
  }
  return saida;
}

function credentialsOfApp(): { id: string; secret: string } {
  const id = process.env['WHATSAPP_APP_ID'] ?? '';
  const secret = process.env['WHATSAPP_APP_SECRET'] ?? '';
  if (!id || !secret) {
    // Pipe rejects missing variables before calling Meta. The original sends an empty string and receives a less specific Meta error.
    throw new PipeError(
      500,
      'app_without_credential',
      'Faltam WHATSAPP_APP_ID e WHATSAPP_APP_SECRET: sem elas não há como trocar o código do cadastro embutido.',
    );
  }
  return { id, secret };
}

type PageOfNumbers = {
  data?: NumeroDaWaba[];
  paging?: { next?: string; cursors?: { after?: string } };
};

export class ClienteGraphReal extends ClienteGraph {
  readonly nome = 'real' as const;

  constructor(
    private readonly token = '',
    private readonly buscar: typeof fetch = fetch,
  ) {
    super();
  }

  private url(caminho: string, query: Record<string, string> = {}, versao = versaoDaApi()): string {
    const url = new URL(`${URL_BASE}/${versao}/${caminho}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url.toString();
  }

  private cabecalhos(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }

  /** `handle_response`: a refusal throws with the step's message; success returns JSON. */
  private async pedir<T>(
    url: string,
    init: RequestInit,
    message: string,
    ...segredos: string[]
  ): Promise<T> {
    const ocultos = [this.token, process.env['WHATSAPP_APP_SECRET'] ?? '', ...segredos];
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

  exchangeCodeByToken(codigo: string): Promise<{ access_token?: string }> {
    const app = credentialsOfApp();
    return this.pedir(
      this.url('oauth/access_token', {
        client_id: app.id,
        client_secret: app.secret,
        code: codigo,
      }),
      {},
      'A troca do token falhou',
      codigo,
    );
  }

  /** Paginate because a WABA can contain more numbers than one Graph page. */
  async buscarTodosOsNumeros(wabaId: string): Promise<NumeroDaWaba[]> {
    const numeros: NumeroDaWaba[] = [];
    let depois: string | undefined;
    do {
      const page: PageOfNumbers | null = await this.pedir<PageOfNumbers | null>(
        this.url(`${wabaId}/phone_numbers`, depois ? { after: depois } : {}),
        { headers: this.cabecalhos() },
        'A busca dos números da WABA falhou',
      );
      numeros.push(...(page?.data ?? []));
      depois = page?.paging?.next ? page.paging.cursors?.after : undefined;
    } while (depois);
    return numeros;
  }

  buscarModelos(wabaId: string): Promise<unknown> {
    return this.pedir(
      this.url(`${wabaId}/message_templates`, { limit: '1' }),
      { headers: this.cabecalhos() },
      'A busca dos modelos de mensagem da WABA falhou',
    );
  }

  fetchPermissions(): Promise<{ data?: PermissionOfToken[] }> {
    return this.pedir(
      this.url('me/permissions'),
      { headers: this.cabecalhos() },
      'A busca das permissões do token falhou',
    );
  }

  buscarNumero(id: string, campos?: string, versao?: string): Promise<Record<string, unknown>> {
    return this.pedir(
      this.url(id, campos ? { fields: campos } : {}, versao),
      { headers: this.cabecalhos() },
      'A busca do número falhou',
    );
  }

  registrarNumero(numeroId: string, pin: string): Promise<unknown> {
    return this.pedir(
      this.url(`${numeroId}/register`),
      {
        method: 'POST',
        headers: this.cabecalhos(),
        body: JSON.stringify({ messaging_product: 'whatsapp', pin: String(pin) }),
      },
      'O registro do número falhou',
      pin,
    );
  }

  /** Release the number from this app so the customer can move it to another provider. */
  descadastrarNumero(numeroId: string): Promise<unknown> {
    return this.pedir(
      this.url(`${numeroId}/deregister`),
      { method: 'POST', headers: this.cabecalhos() },
      'O descadastro do número falhou',
    );
  }

  assinarAppNaWaba(
    wabaId: string,
    campos: readonly string[] = CAMPOS_PADRAO_DO_WEBHOOK,
  ): Promise<unknown> {
    return this.pedir(
      this.url(`${wabaId}/subscribed_apps`),
      {
        method: 'POST',
        headers: this.cabecalhos(),
        body: JSON.stringify({ subscribed_fields: campos }),
      },
      'A assinatura do app na WABA falhou',
    );
  }

  sobrescreverCallbackDoNumero(numeroId: string, url: string, verifyToken: string): Promise<unknown> {
    return this.pedir(
      this.url(numeroId),
      {
        method: 'POST',
        headers: this.cabecalhos(),
        body: JSON.stringify({
          webhook_configuration: { override_callback_uri: url, verify_token: verifyToken },
        }),
      },
      'A troca do callback do número falhou',
      verifyToken,
    );
  }

  limparCallbackDoNumero(numeroId: string): Promise<unknown> {
    return this.pedir(
      this.url(numeroId),
      {
        method: 'POST',
        headers: this.cabecalhos(),
        body: JSON.stringify({ webhook_configuration: { override_callback_uri: '' } }),
      },
      'A limpeza do callback do número falhou',
    );
  }

  /** Unsubscribe the app from the whole WABA only when its last channel leaves. */
  desassinarAppDaWaba(wabaId: string): Promise<unknown> {
    return this.pedir(
      this.url(`${wabaId}/subscribed_apps`),
      { method: 'DELETE', headers: this.cabecalhos() },
      'A retirada do app da WABA falhou',
    );
  }

  buscarAppDoToken(): Promise<{ id?: string; name?: string }> {
    return this.pedir(this.url('app'), { headers: this.cabecalhos() }, 'A busca do aplicativo do token falhou');
  }

  async checkSecretOfApp(numeroId: string, segredo: string): Promise<boolean> {
    const prova = createHmac('sha256', segredo).update(this.token).digest('hex');
    try {
      await this.pedir(
        this.url(numeroId, { fields: 'id', appsecret_proof: prova }),
        { headers: this.cabecalhos() },
        'A conferência do App Secret falhou',
        segredo,
        prova,
      );
      return true;
    } catch (erro) {
      // Only a Meta refusal means the secret is wrong; a network outage is different.
      if (erro instanceof PipeError && erro.codigo === 'meta_refused') return false;
      throw erro;
    }
  }

  async lerPerfil(numeroId: string): Promise<PerfilDoNumero> {
    const corpo = await this.pedir<{ data?: PerfilDoNumero[] } | null>(
      this.url(`${numeroId}/whatsapp_business_profile`, { fields: CAMPOS_DO_PERFIL }),
      { headers: this.cabecalhos() },
      'A leitura do perfil do número falhou',
    );
    return corpo?.data?.[0] ?? {};
  }

  gravarPerfil(numeroId: string, perfil: PerfilParaGravar): Promise<unknown> {
    return this.pedir(
      this.url(`${numeroId}/whatsapp_business_profile`),
      {
        method: 'POST',
        headers: this.cabecalhos(),
        body: JSON.stringify({ messaging_product: 'whatsapp', ...perfil }),
      },
      'A gravação do perfil do número falhou',
    );
  }

  /**
   * Resumable Upload API takes two calls: open a session on the app and send all bytes with `file_offset: 0`. The session ID includes `?sig=…`; append it to the URL without encoding or the signature will fail.
   */
  async upPhoto(appId: string, bytes: Buffer, tipo: string): Promise<string> {
    const session = await this.pedir<{ id?: string }>(
      this.url(`${appId}/uploads`, { file_length: String(bytes.length), file_type: tipo }),
      { method: 'POST', headers: this.cabecalhos() },
      'A abertura do envio da foto falhou',
    );
    if (!session?.id) throw new PipeError(502, 'meta_refused', 'A Meta não abriu a sessão de envio da foto.');
    const enviado = await this.pedir<{ h?: string }>(
      `${URL_BASE}/${versaoDaApi()}/${session.id}`,
      {
        method: 'POST',
        headers: { authorization: `OAuth ${this.token}`, file_offset: '0' },
        body: new Uint8Array(bytes),
      },
      'O envio da foto falhou',
    );
    if (!enviado?.h) throw new PipeError(502, 'meta_refused', 'A Meta não devolveu o identificador da foto.');
    return enviado.h;
  }

  async listarModelos(wabaId: string): Promise<TemplateOfMeta[]> {
    const modelos: TemplateOfMeta[] = [];
    let depois: string | undefined;
    do {
      const query: Record<string, string> = { fields: 'id,name,language,status,category,components', limit: '100' };
      if (depois) query['after'] = depois;
      const pagina: { data?: TemplateOfMeta[]; paging?: { next?: string; cursors?: { after?: string } } } | null =
        await this.pedir(
          this.url(`${wabaId}/message_templates`, query),
          { headers: this.cabecalhos() },
          'A busca dos modelos de mensagem da WABA falhou',
        );
      modelos.push(...(pagina?.data ?? []));
      depois = pagina?.paging?.next ? pagina.paging.cursors?.after : undefined;
    } while (depois);
    return modelos;
  }

  createTemplate(wabaId: string, modelo: NewTemplateOfMeta): Promise<{ id?: string; status?: string }> {
    return this.pedir(
      this.url(`${wabaId}/message_templates`),
      { method: 'POST', headers: this.cabecalhos(), body: JSON.stringify(modelo) },
      'A criação do modelo de mensagem falhou',
    );
  }

  deleteTemplate(wabaId: string, nome: string): Promise<unknown> {
    return this.pedir(
      this.url(`${wabaId}/message_templates`, { name: nome }),
      { method: 'DELETE', headers: this.cabecalhos() },
      'A exclusão do modelo de mensagem falhou',
    );
  }
}

/** What the fake recorded, deliberately without tokens because tests and logs consume it. */
export interface ChamadaGraph {
  acao: string;
  wabaId?: string;
  numeroId?: string;
  url?: string;
  pin?: string;
  campos?: readonly string[];
}

/**
 * Pipe's Graph fake replaces Chatwoot's WebMock. It deterministically maps each code to a token and each token to a number, enabling full VPS connection tests and proving a number cannot join two tenants. Prefixes exercise failures without an approved app: `invalido…` makes Meta refuse exchange, `sem-token…` returns no `access_token`, and `sem-permissao…` denies WABA access.
 */
export class ClienteGraphDuble extends ClienteGraph {
  readonly nome = 'duble' as const;

  /** Shared across instances: each call has its own token but one recorded call list. */
  static readonly chamadas: ChamadaGraph[] = [];

  static reiniciar(): void {
    ClienteGraphDuble.chamadas.length = 0;
    ClienteGraphDuble.perfis.clear();
    ClienteGraphDuble.modelos.clear();
  }

  /** Stable eleven-digit value derived from arbitrary text. */
  static sufixo(seed: string): string {
    const hash = createHash('sha256').update(seed).digest('hex').slice(0, 12);
    return BigInt(`0x${hash}`).toString().padStart(11, '0').slice(0, 11);
  }

  constructor(private readonly token = '') {
    super();
  }

  private registrar(chamada: ChamadaGraph): void {
    ClienteGraphDuble.chamadas.push(chamada);
  }

  private withoutPermission(): boolean {
    return this.token.includes('sem-permissao');
  }

  private numeroDoToken(): string {
    return this.token.slice(this.token.lastIndexOf('-') + 1);
  }

  exchangeCodeByToken(codigo: string): Promise<{ access_token?: string }> {
    this.registrar({ acao: 'trocar_codigo' });
    if (!codigo || codigo.startsWith('invalido')) {
      return Promise.reject(
        new PipeError(
          502,
          'meta_refused',
          'A troca do token falhou: código de cadastro inválido ou expirado.',
          { http: 400, codigo_meta: 100 },
        ),
      );
    }
    if (codigo.startsWith('sem-token')) return Promise.resolve({});
    const marca = codigo.startsWith('sem-permissao') ? 'sem-permissao-' : '';
    return Promise.resolve({
      access_token: `duble-token-${marca}${ClienteGraphDuble.sufixo(codigo)}`,
    });
  }

  buscarTodosOsNumeros(wabaId: string): Promise<NumeroDaWaba[]> {
    this.registrar({ acao: 'buscar_numeros', wabaId });
    if (this.withoutPermission()) {
      return Promise.reject(
        new PipeError(502, 'meta_refused', 'A busca dos números da WABA falhou: (#200) Permissions error', {
          http: 403,
          codigo_meta: 200,
        }),
      );
    }
    const id = this.numeroDoToken();
    return Promise.resolve([
      {
        id,
        display_phone_number: `+55 ${id}`,
        verified_name: 'Empresa de Ensaio',
        code_verification_status: 'VERIFIED',
      },
    ]);
  }

  buscarModelos(wabaId: string): Promise<unknown> {
    this.registrar({ acao: 'buscar_modelos', wabaId });
    if (this.withoutPermission()) {
      return Promise.reject(
        new PipeError(502, 'meta_refused', 'A busca dos modelos de mensagem da WABA falhou: (#200) Permissions error'),
      );
    }
    return Promise.resolve({ data: [] });
  }

  fetchPermissions(): Promise<{ data?: PermissionOfToken[] }> {
    this.registrar({ acao: 'buscar_permissoes' });
    return Promise.resolve({
      data: this.withoutPermission()
        ? []
        : [
            { permission: 'whatsapp_business_messaging', status: 'granted' },
            { permission: 'whatsapp_business_management', status: 'granted' },
          ],
    });
  }

  buscarNumero(id: string): Promise<Record<string, unknown>> {
    this.registrar({ acao: 'buscar_numero', numeroId: id });
    if (id.startsWith('waba')) return Promise.resolve({ id, name: 'Empresa de Ensaio' });
    return Promise.resolve({
      id,
      display_phone_number: `+55 ${id}`,
      verified_name: 'Empresa de Ensaio',
      quality_rating: 'GREEN',
      whatsapp_business_manager_messaging_limit: 'TIER_1K',
      status: 'CONNECTED',
      code_verification_status: 'VERIFIED',
      platform_type: 'CLOUD_API',
      throughput: { level: 'STANDARD' },
      is_on_biz_app: false,
    });
  }

  registrarNumero(numeroId: string, pin: string): Promise<unknown> {
    this.registrar({ acao: 'registrar', numeroId, pin });
    return Promise.resolve({ success: true });
  }

  descadastrarNumero(numeroId: string): Promise<unknown> {
    this.registrar({ acao: 'descadastrar', numeroId });
    return Promise.resolve({ success: true });
  }

  assinarAppNaWaba(wabaId: string, campos: readonly string[] = CAMPOS_PADRAO_DO_WEBHOOK): Promise<unknown> {
    this.registrar({ acao: 'assinar', wabaId, campos });
    return Promise.resolve({ success: true });
  }

  sobrescreverCallbackDoNumero(numeroId: string, url: string): Promise<unknown> {
    this.registrar({ acao: 'override', numeroId, url });
    return Promise.resolve({ success: true });
  }

  limparCallbackDoNumero(numeroId: string): Promise<unknown> {
    this.registrar({ acao: 'limpar_override', numeroId });
    return Promise.resolve({ success: true });
  }

  desassinarAppDaWaba(wabaId: string): Promise<unknown> {
    this.registrar({ acao: 'desassinar', wabaId });
    return Promise.resolve({ success: true });
  }

  /** Per-number profile shared across instances, like the call log. */
  static readonly perfis = new Map<string, PerfilDoNumero>();

  buscarAppDoToken(): Promise<{ id?: string; name?: string }> {
    this.registrar({ acao: 'buscar_app' });
    return Promise.resolve({ id: `app-${ClienteGraphDuble.sufixo(this.token)}`, name: 'App de Ensaio' });
  }

  /** A valid hexadecimal secret starting with `bad` belongs to another app. */
  checkSecretOfApp(numeroId: string, segredo: string): Promise<boolean> {
    this.registrar({ acao: 'conferir_segredo', numeroId });
    return Promise.resolve(!segredo.startsWith('bad'));
  }

  lerPerfil(numeroId: string): Promise<PerfilDoNumero> {
    this.registrar({ acao: 'ler_perfil', numeroId });
    return Promise.resolve({ ...(ClienteGraphDuble.perfis.get(numeroId) ?? {}) });
  }

  gravarPerfil(numeroId: string, perfil: PerfilParaGravar): Promise<unknown> {
    this.registrar({ acao: 'gravar_perfil', numeroId });
    const { profile_picture_handle: foto, ...resto } = perfil;
    const atual = ClienteGraphDuble.perfis.get(numeroId) ?? {};
    ClienteGraphDuble.perfis.set(numeroId, {
      ...atual,
      ...resto,
      ...(foto ? { profile_picture_url: `https://duble.invalid/foto/${foto}` } : {}),
    });
    return Promise.resolve({ success: true });
  }

  upPhoto(appId: string, bytes: Buffer): Promise<string> {
    this.registrar({ acao: 'subir_foto' });
    return Promise.resolve(`${appId}-${ClienteGraphDuble.sufixo(bytes.toString('base64'))}`);
  }

  /** Templates are keyed by WABA; new templates start as `PENDING`, as in Meta. */
  static readonly modelos = new Map<string, TemplateOfMeta[]>();

  listarModelos(wabaId: string): Promise<TemplateOfMeta[]> {
    this.registrar({ acao: 'listar_modelos', wabaId });
    return Promise.resolve((ClienteGraphDuble.modelos.get(wabaId) ?? []).map((m) => ({ ...m })));
  }

  createTemplate(wabaId: string, modelo: NewTemplateOfMeta): Promise<{ id?: string; status?: string }> {
    this.registrar({ acao: 'criar_modelo', wabaId });
    const lista = ClienteGraphDuble.modelos.get(wabaId) ?? [];
    if (lista.some((m) => m.name === modelo.name && m.language === modelo.language)) {
      return Promise.reject(
        new PipeError(502, 'meta_refused', 'A criação do modelo de mensagem falhou: já existe conteúdo neste idioma.', {
          http: 400,
          codigo_meta: 100,
        }),
      );
    }
    const id = ClienteGraphDuble.sufixo(`${wabaId}-${modelo.name}-${modelo.language}`);
    lista.push({ id, ...modelo, status: 'PENDING' });
    ClienteGraphDuble.modelos.set(wabaId, lista);
    return Promise.resolve({ id, status: 'PENDING' });
  }

  deleteTemplate(wabaId: string, nome: string): Promise<unknown> {
    this.registrar({ acao: 'excluir_modelo', wabaId });
    const lista = ClienteGraphDuble.modelos.get(wabaId) ?? [];
    ClienteGraphDuble.modelos.set(
      wabaId,
      lista.filter((m) => m.name !== nome),
    );
    return Promise.resolve({ success: true });
  }
}

type FabricaDeCliente = (token?: string) => ClienteGraph;

let fabrica: FabricaDeCliente | null = null;

/** Chatwoot `Whatsapp::FacebookApiClient.new(access_token)` uses the fake outside production. */
export function clienteGraph(token?: string): ClienteGraph {
  fabrica ??=
    modoDaConexao() === 'real'
      ? (t) => new ClienteGraphReal(t)
      : (t) => new ClienteGraphDuble(t);
  return fabrica(token);
}

/** Replace the factory at runtime for tests. */
export function definirFabricaGraph(nova: FabricaDeCliente | null): void {
  fabrica = nova;
}

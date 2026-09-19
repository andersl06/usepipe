import { createHash, createHmac } from 'node:crypto';
import { ErroPipe } from '../../erros.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/facebook_api_client.rb
 *
 * O cliente do Graph que o cadastro embutido, a configuração manual, a saúde do
 * número e a desmontagem usam. Mesmos endpoints, mesmos corpos e mesma ordem do
 * original — o nome dos métodos é que foi para o português:
 *
 * | Chatwoot                               | aqui                           |
 * |----------------------------------------|--------------------------------|
 * | `exchange_code_for_token`              | `trocarCodigoPorToken`         |
 * | `fetch_all_phone_numbers`              | `buscarTodosOsNumeros`         |
 * | `fetch_message_templates`              | `buscarModelos`                |
 * | `fetch_permissions`                    | `buscarPermissoes`             |
 * | `fetch_phone_number`                   | `buscarNumero`                 |
 * | `register_phone_number`                | `registrarNumero`              |
 * | `deregister_phone_number`              | `descadastrarNumero`           |
 * | `phone_number_verified?`               | `numeroVerificado`             |
 * | `subscribe_phone_number_webhook`       | `assinarWebhookDoNumero`       |
 * | `subscribe_app_to_waba`                | `assinarAppNaWaba`             |
 * | `override_phone_number_callback`       | `sobrescreverCallbackDoNumero` |
 * | `clear_phone_number_callback_override` | `limparCallbackDoNumero`       |
 * | `unsubscribe_app_from_waba`            | `desassinarAppDaWaba`          |
 * | `handle_response`                      | `pedir`                        |
 *
 * Acréscimos do Pipe, que o original não tem:
 *
 * - **O corpo cru da resposta não entra na exceção.** O original levanta
 *   `"#{error_message}: #{response.body}"`; aqui só entram o `error.message` da
 *   Meta e o código, e passados por `esconder`. A Meta às vezes ecoa o que
 *   recebeu, e token de cliente em mensagem de erro é credencial indo para o log.
 * - **`buscar` injetável**, para o teste exercitar o cliente real sem rede.
 * - **O dublê** (`ClienteGraphDuble`). Não temos aplicativo aprovado na Meta, e
 *   sem dublê o caminho "conectar → receber" não roda antes de ela liberar. A
 *   escolha é por `PIPE_WHATSAPP_CONEXAO`: `real` fala com o Graph, qualquer outro
 *   valor usa o dublê.
 * - **A versão padrão é a v26.0**, a mais nova do changelog oficial do Graph em
 *   11/09/2026 (o original usa `v22.0`). A v21.0 que o Pipe usava vale só até
 *   21/01/2027.
 */

export const URL_BASE = 'https://graph.facebook.com';

/** `WEBHOOK_DEFAULT_FIELDS` do original: reenviados em toda assinatura para a Meta não voltar ao padrão. */
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

export interface PermissaoDoToken {
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

/** Um componente de template como a Meta devolve e recebe (`HEADER`, `BODY`, `FOOTER`, `BUTTONS`). */
export interface ComponenteDoModelo {
  type: string;
  format?: string;
  text?: string;
  example?: Record<string, unknown>;
  buttons?: unknown[];
}

export interface ModeloDaMeta {
  id?: string;
  name: string;
  language: string;
  status?: string;
  category?: string;
  components?: ComponenteDoModelo[];
}

export interface NovoModeloDaMeta {
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  components: ComponenteDoModelo[];
}

export abstract class ClienteGraph {
  abstract readonly nome: 'real' | 'duble';

  abstract trocarCodigoPorToken(codigo: string): Promise<{ access_token?: string }>;
  abstract buscarTodosOsNumeros(wabaId: string): Promise<NumeroDaWaba[]>;
  abstract buscarModelos(wabaId: string): Promise<unknown>;
  abstract buscarPermissoes(): Promise<{ data?: PermissaoDoToken[] }>;
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
   * Acréscimos do Pipe para a configuração MANUAL e o perfil do número — o
   * Chatwoot não edita perfil. Endpoints da Cloud API:
   * `GET /app`, `GET|POST /{phone}/whatsapp_business_profile` e a
   * Resumable Upload API (`POST /{app}/uploads` + `POST /{upload}`).
   */

  /** `GET /app`: o aplicativo dono do token — na configuração manual, o do CLIENTE. */
  abstract buscarAppDoToken(): Promise<{ id?: string; name?: string }>;
  /**
   * Prova que o `appSecret` colado é o do app dono do token: a Meta confere o
   * `appsecret_proof` (HMAC-SHA256 do token com o segredo) sempre que ele vem.
   */
  abstract conferirSegredoDoApp(numeroId: string, segredo: string): Promise<boolean>;
  abstract lerPerfil(numeroId: string): Promise<PerfilDoNumero>;
  abstract gravarPerfil(numeroId: string, perfil: PerfilParaGravar): Promise<unknown>;
  /** Sobe a imagem e devolve o `h` que `profile_picture_handle` espera. */
  abstract subirFoto(appId: string, bytes: Buffer, tipo: string): Promise<string>;
  /** `GET /{waba}/message_templates`, todas as páginas. */
  abstract listarModelos(wabaId: string): Promise<ModeloDaMeta[]>;
  /** `POST /{waba}/message_templates`: manda para análise da Meta. */
  abstract criarModelo(wabaId: string, modelo: NovoModeloDaMeta): Promise<{ id?: string; status?: string }>;
  /** `DELETE /{waba}/message_templates?name=`: some em TODOS os idiomas desse nome. */
  abstract excluirModelo(wabaId: string, nome: string): Promise<unknown>;

  /** `phone_number_verified?`: conectado já está registrado, mesmo com o código de verificação vencido. */
  async numeroVerificado(numeroId: string): Promise<boolean> {
    const dados = await this.buscarNumero(numeroId, 'status,code_verification_status');
    return dados['status'] === 'CONNECTED' || dados['code_verification_status'] === 'VERIFIED';
  }

  /**
   * `subscribe_phone_number_webhook`: o app na WABA primeiro — a Meta exige isso
   * antes de qualquer override (chatwoot#13097). O override por NÚMERO ganha do
   * da WABA, e é o que deixa dois números da mesma WABA irem para URLs diferentes.
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

/** Tira segredo de texto que vai virar mensagem de erro. Acréscimo do Pipe. */
function esconder(texto: string, ...segredos: string[]): string {
  let saida = texto;
  for (const segredo of segredos) {
    if (segredo.length >= 8) saida = saida.split(segredo).join('«segredo»');
  }
  return saida;
}

function credenciaisDoApp(): { id: string; segredo: string } {
  const id = process.env['WHATSAPP_APP_ID'] ?? '';
  const segredo = process.env['WHATSAPP_APP_SECRET'] ?? '';
  if (!id || !segredo) {
    // Acréscimo do Pipe: o original manda string vazia e deixa a Meta recusar,
    // o que vira um erro dela sem dizer qual variável falta.
    throw new ErroPipe(
      500,
      'app_sem_credencial',
      'Faltam WHATSAPP_APP_ID e WHATSAPP_APP_SECRET: sem elas não há como trocar o código do cadastro embutido.',
    );
  }
  return { id, segredo };
}

type PaginaDeNumeros = {
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

  private url(caminho: string, consulta: Record<string, string> = {}, versao = versaoDaApi()): string {
    const url = new URL(`${URL_BASE}/${versao}/${caminho}`);
    for (const [chave, valor] of Object.entries(consulta)) url.searchParams.set(chave, valor);
    return url.toString();
  }

  private cabecalhos(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }

  /** `handle_response`: recusa vira exceção com a mensagem do passo; sucesso devolve o JSON. */
  private async pedir<T>(
    url: string,
    init: RequestInit,
    mensagem: string,
    ...segredos: string[]
  ): Promise<T> {
    const ocultos = [this.token, process.env['WHATSAPP_APP_SECRET'] ?? '', ...segredos];
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

  trocarCodigoPorToken(codigo: string): Promise<{ access_token?: string }> {
    const app = credenciaisDoApp();
    return this.pedir(
      this.url('oauth/access_token', {
        client_id: app.id,
        client_secret: app.segredo,
        code: codigo,
      }),
      {},
      'A troca do token falhou',
      codigo,
    );
  }

  /** Paginado: uma WABA pode ter mais números que uma página do Graph. */
  async buscarTodosOsNumeros(wabaId: string): Promise<NumeroDaWaba[]> {
    const numeros: NumeroDaWaba[] = [];
    let depois: string | undefined;
    do {
      const pagina: PaginaDeNumeros | null = await this.pedir<PaginaDeNumeros | null>(
        this.url(`${wabaId}/phone_numbers`, depois ? { after: depois } : {}),
        { headers: this.cabecalhos() },
        'A busca dos números da WABA falhou',
      );
      numeros.push(...(pagina?.data ?? []));
      depois = pagina?.paging?.next ? pagina.paging.cursors?.after : undefined;
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

  buscarPermissoes(): Promise<{ data?: PermissaoDoToken[] }> {
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

  /** Solta o número deste app, para o cliente poder levá-lo a outro provedor. */
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

  /** Tira a assinatura do app da WABA inteira — só quando o último canal dela sai. */
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

  async conferirSegredoDoApp(numeroId: string, segredo: string): Promise<boolean> {
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
      // Só a recusa da Meta quer dizer "segredo errado"; rede fora é outro problema.
      if (erro instanceof ErroPipe && erro.codigo === 'meta_recusou') return false;
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
   * Resumable Upload API em duas chamadas: abre a sessão no app e manda os bytes
   * de uma vez (`file_offset: 0`). O id da sessão já vem com `?sig=…` — vai
   * colado na URL, sem codificar, senão a assinatura dela deixa de bater.
   */
  async subirFoto(appId: string, bytes: Buffer, tipo: string): Promise<string> {
    const sessao = await this.pedir<{ id?: string }>(
      this.url(`${appId}/uploads`, { file_length: String(bytes.length), file_type: tipo }),
      { method: 'POST', headers: this.cabecalhos() },
      'A abertura do envio da foto falhou',
    );
    if (!sessao?.id) throw new ErroPipe(502, 'meta_recusou', 'A Meta não abriu a sessão de envio da foto.');
    const enviado = await this.pedir<{ h?: string }>(
      `${URL_BASE}/${versaoDaApi()}/${sessao.id}`,
      {
        method: 'POST',
        headers: { authorization: `OAuth ${this.token}`, file_offset: '0' },
        body: new Uint8Array(bytes),
      },
      'O envio da foto falhou',
    );
    if (!enviado?.h) throw new ErroPipe(502, 'meta_recusou', 'A Meta não devolveu o identificador da foto.');
    return enviado.h;
  }

  async listarModelos(wabaId: string): Promise<ModeloDaMeta[]> {
    const modelos: ModeloDaMeta[] = [];
    let depois: string | undefined;
    do {
      const consulta: Record<string, string> = { fields: 'id,name,language,status,category,components', limit: '100' };
      if (depois) consulta['after'] = depois;
      const pagina: { data?: ModeloDaMeta[]; paging?: { next?: string; cursors?: { after?: string } } } | null =
        await this.pedir(
          this.url(`${wabaId}/message_templates`, consulta),
          { headers: this.cabecalhos() },
          'A busca dos modelos de mensagem da WABA falhou',
        );
      modelos.push(...(pagina?.data ?? []));
      depois = pagina?.paging?.next ? pagina.paging.cursors?.after : undefined;
    } while (depois);
    return modelos;
  }

  criarModelo(wabaId: string, modelo: NovoModeloDaMeta): Promise<{ id?: string; status?: string }> {
    return this.pedir(
      this.url(`${wabaId}/message_templates`),
      { method: 'POST', headers: this.cabecalhos(), body: JSON.stringify(modelo) },
      'A criação do modelo de mensagem falhou',
    );
  }

  excluirModelo(wabaId: string, nome: string): Promise<unknown> {
    return this.pedir(
      this.url(`${wabaId}/message_templates`, { name: nome }),
      { method: 'DELETE', headers: this.cabecalhos() },
      'A exclusão do modelo de mensagem falhou',
    );
  }
}

/** O que o dublê registrou. Sem token nenhum, de propósito: isto vai para o teste e para o log. */
export interface ChamadaGraph {
  acao: string;
  wabaId?: string;
  numeroId?: string;
  url?: string;
  pin?: string;
  campos?: readonly string[];
}

/**
 * O dublê do Graph. Acréscimo do Pipe — o original testa com WebMock.
 *
 * Determinístico a partir do código: o mesmo código sempre dá o mesmo token, e o
 * token sempre dá o mesmo número. É o que permite exercitar na VPS o caminho
 * inteiro e provar, de quebra, que o mesmo número não entra em dois clientes.
 *
 * Prefixos de código que exercitam os caminhos de erro sem aplicativo aprovado:
 * `invalido…` (a Meta recusa a troca), `sem-token…` (a troca volta sem
 * `access_token`) e `sem-permissao…` (o token não alcança a WABA).
 */
export class ClienteGraphDuble extends ClienteGraph {
  readonly nome = 'duble' as const;

  /** Compartilhado entre instâncias: cada chamada nasce com um token, o registro é um só. */
  static readonly chamadas: ChamadaGraph[] = [];

  static reiniciar(): void {
    ClienteGraphDuble.chamadas.length = 0;
    ClienteGraphDuble.perfis.clear();
    ClienteGraphDuble.modelos.clear();
  }

  /** Onze dígitos estáveis a partir de um texto qualquer. */
  static sufixo(semente: string): string {
    const hash = createHash('sha256').update(semente).digest('hex').slice(0, 12);
    return BigInt(`0x${hash}`).toString().padStart(11, '0').slice(0, 11);
  }

  constructor(private readonly token = '') {
    super();
  }

  private registrar(chamada: ChamadaGraph): void {
    ClienteGraphDuble.chamadas.push(chamada);
  }

  private semPermissao(): boolean {
    return this.token.includes('sem-permissao');
  }

  private numeroDoToken(): string {
    return this.token.slice(this.token.lastIndexOf('-') + 1);
  }

  trocarCodigoPorToken(codigo: string): Promise<{ access_token?: string }> {
    this.registrar({ acao: 'trocar_codigo' });
    if (!codigo || codigo.startsWith('invalido')) {
      return Promise.reject(
        new ErroPipe(
          502,
          'meta_recusou',
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
    if (this.semPermissao()) {
      return Promise.reject(
        new ErroPipe(502, 'meta_recusou', 'A busca dos números da WABA falhou: (#200) Permissions error', {
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
    if (this.semPermissao()) {
      return Promise.reject(
        new ErroPipe(502, 'meta_recusou', 'A busca dos modelos de mensagem da WABA falhou: (#200) Permissions error'),
      );
    }
    return Promise.resolve({ data: [] });
  }

  buscarPermissoes(): Promise<{ data?: PermissaoDoToken[] }> {
    this.registrar({ acao: 'buscar_permissoes' });
    return Promise.resolve({
      data: this.semPermissao()
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

  /** Perfil por número, compartilhado entre instâncias como o registro de chamadas. */
  static readonly perfis = new Map<string, PerfilDoNumero>();

  buscarAppDoToken(): Promise<{ id?: string; name?: string }> {
    this.registrar({ acao: 'buscar_app' });
    return Promise.resolve({ id: `app-${ClienteGraphDuble.sufixo(this.token)}`, name: 'App de Ensaio' });
  }

  /** Segredo que começa com `bad` (hexadecimal válido) é o segredo de outro app. */
  conferirSegredoDoApp(numeroId: string, segredo: string): Promise<boolean> {
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

  subirFoto(appId: string, bytes: Buffer): Promise<string> {
    this.registrar({ acao: 'subir_foto' });
    return Promise.resolve(`${appId}-${ClienteGraphDuble.sufixo(bytes.toString('base64'))}`);
  }

  /** Modelos por WABA. O que é criado nasce `PENDING`, como na Meta. */
  static readonly modelos = new Map<string, ModeloDaMeta[]>();

  listarModelos(wabaId: string): Promise<ModeloDaMeta[]> {
    this.registrar({ acao: 'listar_modelos', wabaId });
    return Promise.resolve((ClienteGraphDuble.modelos.get(wabaId) ?? []).map((m) => ({ ...m })));
  }

  criarModelo(wabaId: string, modelo: NovoModeloDaMeta): Promise<{ id?: string; status?: string }> {
    this.registrar({ acao: 'criar_modelo', wabaId });
    const lista = ClienteGraphDuble.modelos.get(wabaId) ?? [];
    if (lista.some((m) => m.name === modelo.name && m.language === modelo.language)) {
      return Promise.reject(
        new ErroPipe(502, 'meta_recusou', 'A criação do modelo de mensagem falhou: já existe conteúdo neste idioma.', {
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

  excluirModelo(wabaId: string, nome: string): Promise<unknown> {
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

/** `Whatsapp::FacebookApiClient.new(access_token)`, com o dublê no lugar quando não é produção. */
export function clienteGraph(token?: string): ClienteGraph {
  fabrica ??=
    modoDaConexao() === 'real'
      ? (t) => new ClienteGraphReal(t)
      : (t) => new ClienteGraphDuble(t);
  return fabrica(token);
}

/** Troca a fábrica em tempo de execução. Existe para o teste. */
export function definirFabricaGraph(nova: FabricaDeCliente | null): void {
  fabrica = nova;
}

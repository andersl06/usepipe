import { createHash } from 'node:crypto';
import { ErroPipe } from '../erros.js';

/**
 * O adaptador de **conexão** com a Meta — irmão do adaptador de **entrega** que
 * mora em `apps/workers/src/whatsapp/`.
 *
 * São dois porque respondem a perguntas diferentes: entrega fala com a Cloud API
 * pelo número já ligado; conexão fala com o Graph para ligar o número. E os dois
 * têm dublê pelo mesmo motivo — **não temos aplicativo aprovado**, e sem dublê o
 * caminho "entrar → conectar → receber" não pode ser exercitado na VPS antes de a
 * Meta liberar.
 *
 * A escolha é por `PIPE_WHATSAPP_CONEXAO`: `real` fala com o Graph, qualquer outro
 * valor (ou nenhum) usa o dublê. O padrão é o dublê, de propósito, como no
 * `clienteWhatsApp()`.
 *
 * O que este arquivo NUNCA faz: pôr o token do cliente em mensagem de erro ou em
 * log. Token da Meta em texto de exceção é vazamento — a exceção sobe pelo filtro,
 * vira linha de log e fica no disco de quem opera. Ver `esconder()`.
 *
 * Fonte da precedência de webhook e dos campos de override:
 * `docs/specs/2026-09-07-webhook-por-cliente.md`.
 */

/**
 * O que o app assina no WABA do cliente.
 *
 * `messages` é o que aceita override e vai para a rota por canal; os outros três
 * **não aceitam** e caem na rota guarda-chuva, misturando clientes. Assinar mesmo
 * assim é o que faz template rejeitado e queda de qualidade deixarem de ser
 * surpresa no dia do disparo (§7 da spec).
 */
export const CAMPOS_ASSINADOS = [
  'messages',
  'message_template_status_update',
  'phone_number_quality_update',
  'account_update',
] as const;

/** A Meta descontinua versão antiga com aviso curto; por isso é configuração. */
export function versaoDaApi(): string {
  return process.env['WHATSAPP_API_VERSAO'] ?? 'v21.0';
}

export interface ContaDoCliente {
  /** O WhatsApp Business Account do cliente. Vai para `canal.waba_id`. */
  wabaId: string;
  /** O `phone_number_id`, que é o que a Meta manda no payload. Vai para `canal.numero_id`. */
  numeroId: string;
  /** O número em si, para a tela mostrar. */
  numero: string;
  nomeExibicao: string;
}

export interface EstadoDoNumero {
  numero: string;
  nomeExibicao: string;
  /** `GREEN`, `YELLOW`, `RED` — o que a Meta chama de `quality_rating`. */
  qualidade: string | null;
  /** `TIER_1K`, `TIER_10K`, … — quantas conversas iniciadas por dia o número pode abrir. */
  limite: string | null;
  verificado: boolean;
}

export interface ClienteMeta {
  readonly nome: 'real' | 'duble';
  /** Troca o código do cadastro embutido pelo token permanente do cliente. */
  trocarCodigo(codigo: string): Promise<string>;
  /** Descobre a que WABA e a que número aquele token dá acesso. */
  descobrirConta(token: string): Promise<ContaDoCliente>;
  /** Assina `CAMPOS_ASSINADOS` no WABA do cliente. */
  assinarCampos(wabaId: string, token: string): Promise<void>;
  /** Aponta o webhook DAQUELE número para a rota por canal. */
  definirOverride(numeroId: string, token: string, url: string, verifyToken: string): Promise<void>;
  /** Devolve o número para a URL do aplicativo. Apagar é mandar `override_callback_uri` vazio. */
  apagarOverride(numeroId: string, token: string): Promise<void>;
  lerNumero(numeroId: string, token: string): Promise<EstadoDoNumero>;
}

/**
 * Tira o token de qualquer texto que vá virar mensagem de erro.
 *
 * A Meta às vezes ecoa o que recebeu, e um `input_token` de volta numa mensagem de
 * erro é a credencial do cliente indo para o log. Barato demais para não fazer.
 */
function esconder(texto: string, ...segredos: string[]): string {
  let saida = texto;
  for (const segredo of segredos) {
    if (segredo.length >= 8) saida = saida.split(segredo).join('«segredo»');
  }
  return saida;
}

export class ClienteMetaReal implements ClienteMeta {
  readonly nome = 'real' as const;

  /** `buscar` é injetável para o teste não sair para a rede — como `trocarCodigo` do Google. */
  constructor(private readonly buscar: typeof fetch = fetch) {}

  private base(): string {
    return `https://graph.facebook.com/${versaoDaApi()}`;
  }

  private credenciaisDoApp(): { id: string; segredo: string } {
    const id = process.env['WHATSAPP_APP_ID'] ?? '';
    const segredo = process.env['WHATSAPP_APP_SECRET'] ?? '';
    if (!id || !segredo) {
      throw new ErroPipe(
        500,
        'app_sem_credencial',
        'Faltam WHATSAPP_APP_ID e WHATSAPP_APP_SECRET: sem elas não há como trocar o código do cadastro embutido.',
      );
    }
    return { id, segredo };
  }

  /**
   * Uma chamada ao Graph, com o erro traduzido.
   *
   * O corpo cru da resposta NÃO entra na exceção: só `error.code` e
   * `error.message`, e ainda assim passados por `esconder`.
   */
  private async pedir<T>(
    url: string,
    init: RequestInit,
    ...segredos: string[]
  ): Promise<T> {
    let resposta: Response;
    try {
      resposta = await this.buscar(url, init);
    } catch (erro) {
      throw new ErroPipe(
        502,
        'meta_inacessivel',
        `Não foi possível falar com a Meta: ${esconder(String((erro as Error).message ?? erro), ...segredos)}`,
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
      const detalhe = erro?.message ? esconder(erro.message, ...segredos) : `HTTP ${resposta.status}`;
      throw new ErroPipe(502, 'meta_recusou', `A Meta recusou: ${detalhe}`, {
        http: resposta.status,
        ...(erro?.code === undefined ? {} : { codigo_meta: erro.code }),
      });
    }
    return corpo as T;
  }

  async trocarCodigo(codigo: string): Promise<string> {
    const app = this.credenciaisDoApp();
    // POST, e não GET com query: o `client_secret` não tem por que aparecer em URL.
    const corpo = await this.pedir<{ access_token?: string }>(
      `${this.base()}/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: app.id,
          client_secret: app.segredo,
          code: codigo,
        }),
      },
      app.segredo,
      codigo,
    );
    if (!corpo.access_token) {
      throw new ErroPipe(502, 'meta_sem_token', 'A troca do código voltou sem `access_token`.');
    }
    return corpo.access_token;
  }

  /**
   * De onde sai o WABA: `debug_token` devolve os `granular_scopes`, e o
   * `target_ids` de `whatsapp_business_management` é a lista de WABAs que aquele
   * token alcança. Com o WABA, `/{waba}/phone_numbers` dá o número.
   *
   * ponytail: pega o PRIMEIRO WABA e o PRIMEIRO número. Cliente com dois números
   * conecta o primeiro; o segundo vira outro canal quando a tela souber escolher.
   */
  async descobrirConta(token: string): Promise<ContaDoCliente> {
    const app = this.credenciaisDoApp();
    const debug = await this.pedir<{
      data?: { granular_scopes?: { scope?: string; target_ids?: string[] }[] };
    }>(
      `${this.base()}/debug_token?input_token=${encodeURIComponent(token)}`,
      { headers: { authorization: `Bearer ${app.id}|${app.segredo}` } },
      token,
      app.segredo,
    );

    const escopos = debug.data?.granular_scopes ?? [];
    const wabaId = escopos.find((e) => e.scope === 'whatsapp_business_management')?.target_ids?.[0];
    if (!wabaId) {
      throw new ErroPipe(
        502,
        'sem_waba',
        'O token do cliente não dá acesso a nenhuma conta do WhatsApp Business. ' +
          'Confira se o cadastro embutido foi concluído até o fim.',
      );
    }

    const numeros = await this.pedir<{
      data?: { id?: string; display_phone_number?: string; verified_name?: string }[];
    }>(
      `${this.base()}/${wabaId}/phone_numbers`,
      { headers: { authorization: `Bearer ${token}` } },
      token,
    );

    const primeiro = numeros.data?.[0];
    if (!primeiro?.id) {
      throw new ErroPipe(
        502,
        'sem_numero',
        'A conta do WhatsApp Business do cliente não tem número nenhum ligado.',
      );
    }
    return {
      wabaId,
      numeroId: primeiro.id,
      numero: primeiro.display_phone_number ?? '',
      nomeExibicao: primeiro.verified_name ?? '',
    };
  }

  async assinarCampos(wabaId: string, token: string): Promise<void> {
    await this.pedir(
      `${this.base()}/${wabaId}/subscribed_apps`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ subscribed_fields: CAMPOS_ASSINADOS.join(',') }),
      },
      token,
    );
  }

  async definirOverride(
    numeroId: string,
    token: string,
    url: string,
    verifyToken: string,
  ): Promise<void> {
    await this.pedir(
      `${this.base()}/${numeroId}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ override_callback_uri: url, verify_token: verifyToken }),
      },
      token,
      verifyToken,
    );
  }

  async apagarOverride(numeroId: string, token: string): Promise<void> {
    await this.pedir(
      `${this.base()}/${numeroId}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        // Vazio é como se apaga o override de número (§1 da spec).
        body: new URLSearchParams({ override_callback_uri: '' }),
      },
      token,
    );
  }

  async lerNumero(numeroId: string, token: string): Promise<EstadoDoNumero> {
    const campos = [
      'display_phone_number',
      'verified_name',
      'quality_rating',
      'messaging_limit_tier',
      'code_verification_status',
    ].join(',');
    const corpo = await this.pedir<{
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      messaging_limit_tier?: string;
      code_verification_status?: string;
    }>(
      `${this.base()}/${numeroId}?fields=${campos}`,
      { headers: { authorization: `Bearer ${token}` } },
      token,
    );
    return {
      numero: corpo.display_phone_number ?? '',
      nomeExibicao: corpo.verified_name ?? '',
      qualidade: corpo.quality_rating ?? null,
      limite: corpo.messaging_limit_tier ?? null,
      verificado: corpo.code_verification_status === 'VERIFIED',
    };
  }
}

/** O que o dublê registrou. Sem token nenhum, de propósito: isto vai para o teste e para o log. */
export interface ChamadaDublada {
  acao: 'trocar_codigo' | 'descobrir' | 'assinar' | 'override' | 'apagar_override' | 'ler_numero';
  wabaId?: string;
  numeroId?: string;
  url?: string;
}

/**
 * O dublê da conexão.
 *
 * Determinístico a partir do código: o mesmo código sempre devolve o mesmo
 * `numero_id`. Isso não é enfeite — é o que permite ao dono exercitar na VPS o
 * caminho inteiro e, de quebra, provar que reconectar o mesmo número não cria um
 * canal duplicado.
 *
 * Código vazio ou começando por `invalido` é recusado, para que o caminho de erro
 * também tenha como ser exercitado sem app aprovado.
 */
export class ClienteMetaDuble implements ClienteMeta {
  readonly nome = 'duble' as const;
  readonly chamadas: ChamadaDublada[] = [];

  reiniciar(): void {
    this.chamadas.length = 0;
  }

  private static sufixo(semente: string): string {
    const hash = createHash('sha256').update(semente).digest('hex').slice(0, 12);
    return BigInt(`0x${hash}`).toString().padStart(11, '0').slice(0, 11);
  }

  trocarCodigo(codigo: string): Promise<string> {
    this.chamadas.push({ acao: 'trocar_codigo' });
    if (!codigo || codigo.startsWith('invalido')) {
      return Promise.reject(
        new ErroPipe(502, 'meta_recusou', 'A Meta recusou: código de cadastro inválido ou expirado.'),
      );
    }
    return Promise.resolve(`duble-token-${ClienteMetaDuble.sufixo(codigo)}`);
  }

  descobrirConta(token: string): Promise<ContaDoCliente> {
    const sufixo = token.slice(token.lastIndexOf('-') + 1);
    this.chamadas.push({ acao: 'descobrir', numeroId: sufixo });
    return Promise.resolve({
      wabaId: `waba-duble-${sufixo.slice(0, 6)}`,
      numeroId: sufixo,
      numero: `55${sufixo}`,
      nomeExibicao: 'Empresa de Ensaio',
    });
  }

  assinarCampos(wabaId: string, _token: string): Promise<void> {
    this.chamadas.push({ acao: 'assinar', wabaId });
    return Promise.resolve();
  }

  definirOverride(
    numeroId: string,
    _token: string,
    url: string,
    _verifyToken: string,
  ): Promise<void> {
    this.chamadas.push({ acao: 'override', numeroId, url });
    return Promise.resolve();
  }

  apagarOverride(numeroId: string, _token: string): Promise<void> {
    this.chamadas.push({ acao: 'apagar_override', numeroId });
    return Promise.resolve();
  }

  lerNumero(numeroId: string, _token: string): Promise<EstadoDoNumero> {
    this.chamadas.push({ acao: 'ler_numero', numeroId });
    return Promise.resolve({
      numero: `55${numeroId}`,
      nomeExibicao: 'Empresa de Ensaio',
      qualidade: 'GREEN',
      limite: 'TIER_1K',
      verificado: true,
    });
  }
}

export const dubleMeta = new ClienteMetaDuble();

let escolhido: ClienteMeta | null = null;

export function clienteMeta(): ClienteMeta {
  escolhido ??=
    process.env['PIPE_WHATSAPP_CONEXAO'] === 'real' ? new ClienteMetaReal() : dubleMeta;
  return escolhido;
}

/** Troca o cliente em tempo de execução. Existe para teste e para o modo de ensaio. */
export function definirClienteMeta(cliente: ClienteMeta | null): void {
  escolhido = cliente;
}

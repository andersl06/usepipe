import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { cifrar, diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import { keyApi, user, webhookSaida } from '@pipe/db/schema';
import { TYPES_AUTHENTICATION_WEBHOOK } from '@pipe/db/schema';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';
import { hashOfSecret } from '../../authentication.js';
import { keyring } from '../../database.js';
import {
  CABECALHOS_RESERVADOS,
  EVENTOS,
  headerOfAuthorization,
  cabecalhosDeSaida,
  decryptSecretOfWebhook,
} from '../../webhooks-saida.js';
import type {
  CabecalhoCustomizado,
  EventoWebhook,
  TypeAuthenticationWebhook,
} from '../../webhooks-saida.js';
import { chamarComMtls } from '../mtls.js';
import { EDIT_FLOW } from './cycle-of-lifetime-of-flow.js';

/**
 * Replace three mocked flow Integration screens. 'Chaves de acesso' (`configuracoes/keys`) may scope existing account `chave_api` to ONE flow via `chave_api.fluxo_id` (migration 0032); its `pipe_<prefixo>_<segredo>` token remains the same credential as `autenticacao.ts`. 'Informações de conexão' (`configuracoes/api`) reads flow ID, active key and API endpoint, and writes the two 'Conectar usando HTTP' URLs as `webhook_saida` resources by event set. 'Webhook' (`integracoes/webhook`) adds CRUD and test to existing delivery in `webhooks-saida.ts`. Keys require `chave_api.gerenciar`; webhook/connection writes require new `automacao.integracao.gerenciar` (migration 0032); connection reads use `EDITAR_FLUXO`.
 */

export const MANAGE_KEY = 'chave_api.gerenciar';
export const MANAGE_INTEGRATION = 'automacao.integracao.gerenciar';

const ator = (usuarioId: string): Ator => ({ type: 'usuario', id: usuarioId });

async function flowExists(tx: TransactionPipe, tenantId: string, fluxoId: string): Promise<void> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo
     where tenant_id = ${tenantId} and id = ${fluxoId}::uuid and estado <> 'arquivado'
     limit 1
  `);
  if (!rows[0]) throw PipeError.naoEncontrado('fluxo');
}

/* --------------------------------------------------------- Chaves do fluxo */

/**
 * `MAX_TOKENS = 3` na origem (`referencias-blip/pesquisa/blip-configuracoes-api-e-chaves.md`,
 * espelhado em `apps/management-vite/.../configuracoes/regras.ts`). Conferido aqui
 * também: a regra do front não segura quem chama a `api` direto.
 */
export const LIMITE_DE_CHAVES = 3;

/**
 * Default scopes for a flow key. Scope says WHAT; `fluxo_id` says WHERE. `conferirFluxoDaChave` in `autenticacao.ts` puts `fluxoId` in the key session and permits only routes for THAT flow. Non-flow routes return 403 `chave_de_fluxo`; routes for another flow return `chave_de_outro_fluxo`.
 */
const SCOPES_OF_KEY_OF_FLOW = [
  'conversas:ler',
  'conversas:escrever',
  'mensagens:ler',
  'mensagens:escrever',
  'contatos:ler',
] as const;

export interface KeyOfFlow {
  id: string;
  name: string;
  prefix: string;
  escopos: string[];
  criadaEm: string;
  ultimoUsoEm: string | null;
  revokedAt: string | null;
  requisitante: string | null;
}

export interface KeyOfFlowCreated extends KeyOfFlow {
  /** `pipe_<prefixo>_<segredo>` appears only here; the database stores its hash alone. */
  token: string;
}

type LineKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[] | null;
  criadoEm: Date;
  ultimoUsoEm: Date | null;
  revokedAt: Date | null;
  requisitante?: string | null;
};

function asKey(linha: LineKey): KeyOfFlow {
  return {
    id: linha.id,
    name: linha.name,
    prefix: linha.prefix,
    escopos: linha.scopes ?? [],
    criadaEm: linha.criadoEm.toISOString(),
    ultimoUsoEm: linha.ultimoUsoEm?.toISOString() ?? null,
    revokedAt: linha.revokedAt?.toISOString() ?? null,
    requisitante: linha.requisitante ?? null,
  };
}

const COLUMNS_KEY = {
  id: keyApi.id,
  name: keyApi.nome,
  prefix: keyApi.prefix,
  scopes: keyApi.scopes,
  criadoEm: keyApi.criadoEm,
  ultimoUsoEm: keyApi.ultimoUsoEm,
  revokedAt: keyApi.revogadaEm,
};

const COLUMNS_KEY_LIST = { ...COLUMNS_KEY, requisitante: user.nome };

/** As chaves DESTE fluxo — nunca as de conta (`fluxo_id is null`). */
export async function listKeysOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<KeyOfFlow[]> {
  await requirePermission(tx, usuarioId, MANAGE_KEY);
  await flowExists(tx, tenantId, fluxoId);
  const linhas = await tx
    .select(COLUMNS_KEY_LIST)
    .from(keyApi)
    .leftJoin(user, eq(keyApi.createdBy, user.id))
    .where(
      and(
        eq(keyApi.tenantId, tenantId),
        eq(keyApi.flowId, fluxoId),
        isNull(keyApi.revogadaEm),
      ),
    )
    .orderBy(desc(keyApi.criadoEm));
  return linhas.map(asKey);
}

/** `createKey()` rejects a missing name or reached limit; otherwise it generates and stores the key. */
export async function createKeyOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  nome: string,
): Promise<KeyOfFlowCreated> {
  await requirePermission(tx, usuarioId, MANAGE_KEY);
  await flowExists(tx, tenantId, fluxoId);

  const nomeAparado = nome.trim();
  if (!nomeAparado) {
    throw PipeError.request('name_missing', 'Adicione um nome para identificar a chave.');
  }
  if (nomeAparado.length > 100) {
    throw PipeError.request('name_large', 'O nome da chave pode ter até 100 caracteres.');
  }

  const { rows: count } = await tx.execute<{ n: string }>(sql`
    select count(*)::text as n from chave_api
     where tenant_id = ${tenantId}
       and fluxo_id = ${fluxoId}::uuid
       and revogada_em is null
  `);
  if (Number(count[0]?.n ?? 0) >= LIMITE_DE_CHAVES) {
    throw PipeError.request('limit_of_keys', `Limite de ${LIMITE_DE_CHAVES} chaves atingido`);
  }

  const prefix = randomBytes(6).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const [criada] = await tx
    .insert(keyApi)
    .values({
      tenantId,
      flowId: fluxoId,
      nome: nomeAparado,
      prefix,
      hash: hashOfSecret(secret),
      scopes: [...SCOPES_OF_KEY_OF_FLOW],
      createdBy: usuarioId,
    })
    .returning(COLUMNS_KEY);
  if (!criada) throw new Error('não criou a chave de API');

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'chave_api',
    objetoId: criada.id,
    depois: { nome: nomeAparado, fluxoId, prefix },
  });

  return { ...asKey(criada), token: `pipe_${prefix}_${secret}` };
}

/** `deleteKey()`: revoga (`revogada_em`), nunca apaga a linha — o mesmo motivo do log de uso. */
export async function revokeKeyOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  keyId: string,
): Promise<void> {
  await requirePermission(tx, usuarioId, MANAGE_KEY);
  await flowExists(tx, tenantId, fluxoId);

  const [atual] = await tx
    .select({ id: keyApi.id, revogadaEm: keyApi.revogadaEm })
    .from(keyApi)
    .where(
      and(eq(keyApi.tenantId, tenantId), eq(keyApi.flowId, fluxoId), eq(keyApi.id, keyId)),
    )
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('chave de API');
  if (atual.revogadaEm) return; // já revogada: idempotente, nada novo para o log.

  const agora = new Date();
  await tx
    .update(keyApi)
    .set({ revogadaEm: agora })
    .where(and(eq(keyApi.tenantId, tenantId), eq(keyApi.id, keyId)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'desativou',
    objetoTipo: 'chave_api',
    objetoId: keyId,
    antes: { revogadaEm: null },
    depois: { revogadaEm: agora.toISOString() },
  });
}

/* -------------------------------------------------------------- SSRF/URL */

/**
 * The source 'Conectar usando HTTP' card says 'Nos dois casos, use um protocolo seguro (HTTPS)'. Pipe also treats the user-chosen destination URL as an SSRF boundary because `api` will call it. `ponytail` validates protocol and literal IP/hostname but does NOT resolve DNS. A public hostname resolving to a private IP (rebinding) can pass; covering that requires checking the resolved IP at DELIVERY, not at save time, and is not implemented.
 */
export function confirmarUrlSegura(url: string): void {
  let analisada: URL;
  try {
    analisada = new URL(url);
  } catch {
    throw PipeError.request('url_invalid', 'Informe uma URL válida.');
  }
  if (analisada.protocol !== 'https:') {
    throw PipeError.request('url_needs_https', 'A URL precisa usar HTTPS.');
  }
  // `URL.hostname` keeps the brackets of an IPv6 literal (`[::1]`) and already normalizes IPv4
  // spellings (`0x7f.1`, `2130706433` → `127.0.0.1`) and IPv6 compression.
  const host = analisada.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') {
    throw PipeError.request('url_forbidden', 'A URL não pode apontar para localhost.');
  }
  if (ipPrivado(host)) {
    throw PipeError.request(
      'url_forbidden',
      'A URL não pode apontar para um endereço de rede privada.',
    );
  }
}

/** `host` without brackets: an IPv4 literal, an IPv6 literal, or a DNS name (never private here). */
function ipPrivado(host: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) return ipv4Privado(v4.slice(1, 5).map(Number));
  if (!host.includes(':')) return false;
  const h = hextetos(host);
  // Unparseable IPv6 literal: refuse rather than guess.
  if (!h) return true;
  const embutido = (i: number) => [h[i]! >> 8, h[i]! & 0xff, h[i + 1]! >> 8, h[i + 1]! & 0xff];
  const zeros = (ate: number) => h.slice(0, ate).every((x) => x === 0);
  if (zeros(8) || (zeros(7) && h[7] === 1)) return true; // :: e ::1
  if (zeros(5) && h[5] === 0xffff) return ipv4Privado(embutido(6)); // ::ffff:a.b.c.d (IPv4 mapeado)
  if (zeros(6)) return ipv4Privado(embutido(6)); // ::a.b.c.d (IPv4 compatível, obsoleto)
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return ipv4Privado(embutido(6)); // NAT64 64:ff9b::/96
  if (h[0] === 0x2002) return ipv4Privado(embutido(1)); // 6to4 2002::/16
  if ((h[0]! & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((h[0]! & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((h[0]! & 0xff00) === 0xff00) return true; // multicast ff00::/8
  return false;
}

function ipv4Privado([a, b]: number[]): boolean {
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 172 && b! >= 16 && b! <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b! >= 64 && b! <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark 198.18.0.0/15
  return a! >= 224; // multicast e reservados
}

/** An IPv6 literal as its 8 hextets (with a trailing dotted IPv4, if any), or null. */
function hextetos(host: string): number[] | null {
  let texto = host.split('%')[0]!;
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(texto);
  if (v4) {
    const [a, b, c, d] = v4.slice(1, 5).map(Number) as [number, number, number, number];
    texto = `${texto.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const partes = texto.split('::');
  if (partes.length > 2) return null;
  const lista = (s: string | undefined) => (s ? s.split(':') : []);
  const cabeca = lista(partes[0]);
  const cauda = lista(partes[1]);
  const faltam = 8 - cabeca.length - cauda.length;
  if (partes.length === 1 ? faltam !== 0 : faltam < 1) return null;
  const todos = [...cabeca, ...Array<string>(partes.length === 2 ? faltam : 0).fill('0'), ...cauda];
  if (!todos.every((x) => /^[0-9a-f]{1,4}$/.test(x))) return null;
  return todos.map((x) => parseInt(x, 16));
}

/* --------------------------------------------------------- Webhook_saida */

/**
 * `webhook_saida` belongs to the ACCOUNT, not the flow (`apis.md` §5.5). The source nests the webhook screen under a bot, but Pipe retains tenant-wide delivery: `emitir()` notifies ALL active subscribers to an event rather than duplicating storage per flow.
 */
/**
 * Support source 'Configurações de autenticação' switch and OAuth 2.0 `client_credentials`, plus task-requested Basic auth. Return nonsecret `usuario`, `urlAutorizacao`, and `clientId`; encrypt `senha` and `clientSecret` at rest and NEVER return them here or in audit. Decrypt only for delivery or test.
 */
export interface AuthenticationWebhookVisible {
  type: TypeAuthenticationWebhook;
  user: string | null;
  urlAuthorization: string | null;
  clientId: string | null;
}

export interface WebhookDeSaida {
  id: string;
  url: string;
  eventos: string[];
  active: boolean;
  criadoEm: string;
  authentication: AuthenticationWebhookVisible;
  cabecalhos: CabecalhoCustomizado[];
}

export interface WebhookDeSaidaCriado extends WebhookDeSaida {
  /**
   * Show the signing secret only on creation. `webhook_saida.segredo` stores it in plaintext for signing, but the screen never returns it again.
   */
  secret: string;
}

type LinhaWebhook = {
  id: string;
  url: string;
  eventos: string[] | null;
  active: boolean;
  criadoEm: Date;
  typeAuthentication: string;
  authenticationUser: string | null;
  oauth2UrlAuthorization: string | null;
  oauth2ClientId: string | null;
  /** The driver parses `jsonb`, but the column type is lost in this `select`. */
  cabecalhos: unknown;
};

function comoWebhook(linha: LinhaWebhook): WebhookDeSaida {
  return {
    id: linha.id,
    url: linha.url,
    eventos: linha.eventos ?? [],
    active: linha.active,
    criadoEm: linha.criadoEm.toISOString(),
    authentication: {
      type: linha.typeAuthentication as TypeAuthenticationWebhook,
      user: linha.authenticationUser,
      urlAuthorization: linha.oauth2UrlAuthorization,
      clientId: linha.oauth2ClientId,
    },
    cabecalhos: (linha.cabecalhos as CabecalhoCustomizado[] | null) ?? [],
  };
}

/** Never include `autenticacaoSenha` or `oauth2ClientSecret`; only private `webhookVivo` reads them. */
const COLUNAS_WEBHOOK = {
  id: webhookSaida.id,
  url: webhookSaida.url,
  eventos: webhookSaida.eventos,
  active: webhookSaida.ativo,
  criadoEm: webhookSaida.criadoEm,
  typeAuthentication: webhookSaida.typeAuthentication,
  authenticationUser: webhookSaida.authenticationUser,
  oauth2UrlAuthorization: webhookSaida.oauth2UrlAuthorization,
  oauth2ClientId: webhookSaida.oauth2ClientId,
  cabecalhos: webhookSaida.cabecalhos,
};

function eventosConferidos(eventos: unknown): EventoWebhook[] {
  if (!Array.isArray(eventos) || eventos.length === 0) {
    throw PipeError.request('events_missing', 'Selecione ao menos um evento.');
  }
  const unicos = [...new Set(eventos)];
  for (const evento of unicos) {
    if (!(EVENTOS as readonly string[]).includes(String(evento))) {
      throw PipeError.request('event_invalid', `Evento desconhecido: "${String(evento)}".`);
    }
  }
  return unicos as EventoWebhook[];
}

/** Source '+ Adicionar cabeçalho' accepts Key/Value pairs without duplicates or headers reserved for the signature. */
const LIMITE_CABECALHOS = 20;

function cabecalhosConferidos(value: unknown): CabecalhoCustomizado[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw PipeError.request('headers_invalid', 'Cabeçalhos customizados inválidos.');
  }
  if (value.length > LIMITE_CABECALHOS) {
    throw PipeError.request(
      'headers_in_limit',
      `Limite de ${LIMITE_CABECALHOS} cabeçalhos customizados.`,
    );
  }
  const vistos = new Set<string>();
  const conferidos: CabecalhoCustomizado[] = [];
  for (const item of value) {
    const bruto = item as Record<string, unknown>;
    const key = typeof bruto?.['chave'] === 'string' ? bruto['chave'].trim() : '';
    const valueOfHeader = typeof bruto?.['valor'] === 'string' ? bruto['valor'] : '';
    if (!key || key.length > 200 || valueOfHeader.length > 2000) {
      throw PipeError.request(
        'header_invalid',
        'Cada cabeçalho precisa de uma chave (até 200 caracteres) e um valor (até 2000).',
      );
    }
    const keyNormal = key.toLowerCase();
    if ((CABECALHOS_RESERVADOS as readonly string[]).includes(keyNormal)) {
      throw PipeError.request(
        'header_reserved',
        `O cabeçalho "${key}" é reservado pela assinatura do webhook.`,
      );
    }
    if (vistos.has(keyNormal)) {
      throw PipeError.request(
        'header_repeated',
        `O cabeçalho "${key}" foi informado mais de uma vez.`,
      );
    }
    vistos.add(keyNormal);
    conferidos.push({ key, value: valueOfHeader });
  }
  return conferidos;
}

/**
 * Authentication defaults to `nenhuma` when absent, matching the database. Editing REPLACES the whole configuration, as with `eventos`: switching between OAuth 2.0 and Basic requires resubmitting credentials, since the form never saw the old encrypted password.
 */
export interface AuthenticationWebhookInbound {
  type: TypeAuthenticationWebhook;
  user?: string;
  senha?: string;
  urlAutorizacao?: string;
  clientId?: string;
  clientSecret?: string;
}

function authenticationChecked(valor: unknown): AuthenticationWebhookInbound {
  const bruto = (valor ?? { tipo: 'nenhuma' }) as Record<string, unknown>;
  const tipo = String(bruto['tipo'] ?? '');
  if (!(TYPES_AUTHENTICATION_WEBHOOK as readonly string[]).includes(tipo)) {
    throw PipeError.request('authentication_invalid', 'Tipo de autenticação desconhecido.');
  }

  if (tipo === 'basica') {
    const user = typeof bruto['usuario'] === 'string' ? bruto['usuario'].trim() : '';
    const senha = typeof bruto['senha'] === 'string' ? bruto['senha'] : '';
    if (!user || !senha) {
      throw PipeError.request(
        'authentication_incomplete',
        'Informe usuário e senha da autenticação básica.',
      );
    }
    return { type: 'basica', user, senha };
  }

  if (tipo === 'oauth2_client_credentials') {
    const urlAuthorization =
      typeof bruto['urlAutorizacao'] === 'string' ? bruto['urlAutorizacao'] : '';
    const clientId = typeof bruto['clientId'] === 'string' ? bruto['clientId'].trim() : '';
    const clientSecret = typeof bruto['clientSecret'] === 'string' ? bruto['clientSecret'] : '';
    if (!urlAuthorization || !clientId || !clientSecret) {
      throw PipeError.request(
        'authentication_incomplete',
        'Informe URL de autorização, Client ID e Client Secret do OAuth 2.0.',
      );
    }
    confirmarUrlSegura(urlAuthorization);
    return { type: 'oauth2_client_credentials', urlAutorizacao: urlAuthorization, clientId, clientSecret };
  }

  return { type: 'nenhuma' };
}

/** Columns written on save; both secrets leave this function encrypted. */
function columnsOfAuthentication(authentication: AuthenticationWebhookInbound) {
  return {
    typeAuthentication: authentication.type,
    authenticationUser: authentication.type === 'basica' ? authentication.user! : null,
    authenticationPassword:
      authentication.type === 'basica' ? cifrar(authentication.senha!, keyring()) : null,
    oauth2UrlAuthorization:
      authentication.type === 'oauth2_client_credentials' ? authentication.urlAutorizacao! : null,
    oauth2ClientId:
      authentication.type === 'oauth2_client_credentials' ? authentication.clientId! : null,
    oauth2ClientSecret:
      authentication.type === 'oauth2_client_credentials'
        ? cifrar(authentication.clientSecret!, keyring())
        : null,
  };
}

/** O que entra no log de auditoria — nunca `senha`/`clientSecret`, nem cifrados. */
function authenticationForAudit(
  autenticacao: AuthenticationWebhookInbound,
): AuthenticationWebhookVisible {
  return {
    type: autenticacao.type,
    user: autenticacao.type === 'basica' ? (autenticacao.user ?? null) : null,
    urlAuthorization:
      autenticacao.type === 'oauth2_client_credentials'
        ? (autenticacao.urlAutorizacao ?? null)
        : null,
    clientId:
      autenticacao.type === 'oauth2_client_credentials' ? (autenticacao.clientId ?? null) : null,
  };
}

export async function listarWebhooks(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
): Promise<WebhookDeSaida[]> {
  await requirePermission(tx, usuarioId, MANAGE_INTEGRATION);
  const linhas = await tx
    .select(COLUNAS_WEBHOOK)
    .from(webhookSaida)
    .where(eq(webhookSaida.tenantId, tenantId))
    .orderBy(desc(webhookSaida.criadoEm));
  return linhas.map(comoWebhook);
}

export interface PedidoDeWebhook {
  url: string;
  eventos: string[];
  /** `undefined` = "nenhuma" (o default da coluna). Validado por `autenticacaoConferida`. */
  autenticacao?: unknown;
  /** `undefined` means no headers; `cabecalhosConferidos` validates them. */
  cabecalhos?: unknown;
}

export async function createWebhook(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  pedido: PedidoDeWebhook,
): Promise<WebhookDeSaidaCriado> {
  await requirePermission(tx, usuarioId, MANAGE_INTEGRATION);
  confirmarUrlSegura(pedido.url);
  const eventos = eventosConferidos(pedido.eventos);
  const authentication = authenticationChecked(pedido.autenticacao);
  const cabecalhos = cabecalhosConferidos(pedido.cabecalhos);
  const segredo = randomBytes(32).toString('hex');

  const [criado] = await tx
    .insert(webhookSaida)
    .values({
      tenantId,
      url: pedido.url,
      eventos,
      secret: segredo,
      ativo: true,
      cabecalhos,
      ...columnsOfAuthentication(authentication),
    })
    .returning(COLUNAS_WEBHOOK);
  if (!criado) throw new Error('não criou o webhook');

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'webhook_saida',
    objetoId: criado.id,
    depois: {
      url: pedido.url,
      eventos,
      ativo: true,
      autenticacao: authenticationForAudit(authentication),
      cabecalhos,
    },
  });

  return { ...comoWebhook(criado), secret: segredo };
}

/** Load a complete row including secrets only for delivery, `testarWebhook`, editing or deletion. */
async function webhookVivo(
  tx: TransactionPipe,
  tenantId: string,
  id: string,
): Promise<
  WebhookDeSaida & {
    secret: string;
    authenticationPassword: string | null;
    oauth2ClientSecret: string | null;
  }
> {
  const [atual] = await tx
    .select({
      ...COLUNAS_WEBHOOK,
      secret: webhookSaida.secret,
      authenticationPassword: webhookSaida.authenticationPassword,
      oauth2ClientSecret: webhookSaida.oauth2ClientSecret,
    })
    .from(webhookSaida)
    .where(and(eq(webhookSaida.tenantId, tenantId), eq(webhookSaida.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('webhook');
  return {
    ...comoWebhook(atual),
    secret: atual.secret,
    authenticationPassword: atual.authenticationPassword,
    oauth2ClientSecret: atual.oauth2ClientSecret,
  };
}

export interface RequestOfEditOfWebhook {
  url?: string;
  eventos?: string[];
  active?: boolean;
  /** Replace all authentication fields like `eventos`; see `autenticacaoConferida`. */
  autenticacao?: unknown;
  cabecalhos?: unknown;
}

/** `PATCH` changes supplied URL, events, active state, authentication and headers. Activation and deactivation have their own `Acao`. */
export async function editarWebhook(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfWebhook,
): Promise<WebhookDeSaida> {
  await requirePermission(tx, usuarioId, MANAGE_INTEGRATION);
  const atual = await webhookVivo(tx, tenantId, id);

  const antes = {
    url: atual.url,
    eventos: atual.eventos,
    ativo: atual.active,
    autenticacao: atual.authentication,
    cabecalhos: atual.cabecalhos,
  };
  const depois = { ...antes };
  if (pedido.url !== undefined) {
    confirmarUrlSegura(pedido.url);
    depois.url = pedido.url;
  }
  if (pedido.eventos !== undefined) depois.eventos = eventosConferidos(pedido.eventos);
  if (pedido.active !== undefined) depois.ativo = pedido.active;

  let authenticationInbound: AuthenticationWebhookInbound | undefined;
  if (pedido.autenticacao !== undefined) {
    authenticationInbound = authenticationChecked(pedido.autenticacao);
    depois.autenticacao = authenticationForAudit(authenticationInbound);
  }
  if (pedido.cabecalhos !== undefined) depois.cabecalhos = cabecalhosConferidos(pedido.cabecalhos);

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  const colunasParaGravar = {
    url: depois.url,
    eventos: depois.eventos,
    ativo: depois.ativo,
    cabecalhos: depois.cabecalhos,
    ...(authenticationInbound ? columnsOfAuthentication(authenticationInbound) : {}),
  };

  const [gravado] = await tx
    .update(webhookSaida)
    .set(colunasParaGravar)
    .where(and(eq(webhookSaida.tenantId, tenantId), eq(webhookSaida.id, id)))
    .returning(COLUNAS_WEBHOOK);
  if (!gravado) throw PipeError.naoEncontrado('webhook');

  const soAtivo = Object.keys(mudanca.depois).length === 1 && 'ativo' in mudanca.depois;
  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: soAtivo ? (depois.ativo ? 'ativou' : 'desativou') : 'alterou',
    objetoTipo: 'webhook_saida',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return comoWebhook(gravado);
}

/** Real `DELETE`: `entrega_webhook.webhook_id` is `ON DELETE CASCADE`, with no history to protect. */
export async function excluirWebhook(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  await requirePermission(tx, usuarioId, MANAGE_INTEGRATION);
  const atual = await webhookVivo(tx, tenantId, id);

  await tx
    .delete(webhookSaida)
    .where(and(eq(webhookSaida.tenantId, tenantId), eq(webhookSaida.id, id)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'webhook_saida',
    objetoId: id,
    antes: {
      url: atual.url,
      eventos: atual.eventos,
      ativo: atual.active,
      autenticacao: atual.authentication,
      cabecalhos: atual.cabecalhos,
    },
  });
}

export interface ResultOfTest {
  ok: boolean;
  status?: number;
  error?: string;
  /** Os primeiros caracteres da resposta — "mostra a resposta (status e corpo curto)". */
  body?: string;
}

/** Truncate test-response previews; never show or log the complete body. */
const LIMIT_BODY_OF_TEST = 300;

/**
 * The 'Testar' button sends an immediate POST outside `webhooks-saida.ts` queue: a human click is not a business event, creates no `entrega_webhook` row, and failure must not retry. Use the SAME authentication and custom headers as real delivery (`cabecalhosDeSaida`/`cabecalhoDeAutorizacao`), and the SAME host mTLS certificate via `chamarComMtls`.
 */
export async function testarWebhook(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
): Promise<ResultOfTest> {
  await requirePermission(tx, usuarioId, MANAGE_INTEGRATION);
  const webhook = await webhookVivo(tx, tenantId, id);

  const corpo = JSON.stringify({
    event: 'webhook.teste',
    delivery_id: randomBytes(16).toString('hex'),
    tenant_id: tenantId,
    occurred_at: new Date().toISOString(),
    data: { mensagem: 'Evento de teste disparado pela tela de Integrações.' },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));

  try {
    const cabecalhos = cabecalhosDeSaida({
      secret: webhook.secret,
      timestamp,
      body: corpo,
      deliveryId: randomBytes(16).toString('hex'),
      customizados: webhook.cabecalhos,
    });
    const authorization = await headerOfAuthorization({
      type: webhook.authentication.type,
      user: webhook.authentication.user,
      senha: decryptSecretOfWebhook(webhook.authenticationPassword),
      oauth2UrlAuthorization: webhook.authentication.urlAuthorization,
      oauth2ClientId: webhook.authentication.clientId,
      oauth2ClientSecret: decryptSecretOfWebhook(webhook.oauth2ClientSecret),
    });
    if (authorization) cabecalhos['authorization'] = authorization;

    const resposta = await chamarComMtls(tenantId, webhook.url, {
      metodo: 'POST',
      headers: cabecalhos,
      body: corpo,
      timeoutMs: 5_000,
    });
    const corpoDaResposta = await resposta
      .texto()
      .catch(() => '')
      .then((texto) => texto.slice(0, LIMIT_BODY_OF_TEST));
    return resposta.ok
      ? { ok: true, status: resposta.status, body: corpoDaResposta }
      : {
          ok: false,
          status: resposta.status,
          error: `HTTP ${resposta.status}`,
          body: corpoDaResposta,
        };
  } catch (falha) {
    return { ok: false, error: (falha as Error).message };
  }
}



/**
 * 'Informações de conexão' stores two event sets as separate `webhook_saida` rows, the same Integration resource addressed by event set rather than ID.
 */
const EVENTS_MESSAGES: readonly EventoWebhook[] = ['mensagem.criada'];
const EVENTS_NOTIFICATIONS: readonly EventoWebhook[] = [
  'conversa.criada',
  'conversa.estado_alterado',
  'conversa.atribuida',
  'conversa.encerrada',
];

export interface ConnectionOfFlow {
  flowId: string;
  endpoint: string;
  /** O prefixo da chave ativa mais recente do fluxo — nunca o segredo. */
  keyPrefix: string | null;
  urlMessages: string | null;
  urlNotifications: string | null;
}

/**
 * Build an array literal manually: Drizzle's `sql` template FLATTENS JS arrays into parameters; a one-element array becomes scalar and `= $1::text[]` fails with 'malformed array literal'. This matches `igualEmLista` in `controladores/conversas.ts`. Values here come only from closed catalogs `EVENTOS_MENSAGENS` and `EVENTOS_NOTIFICACOES`, so there is no customer input to escape.
 */
function literalDeArray(values: readonly string[]): string {
  return `{${values.join(',')}}`;
}

async function urlDoWebhookPara(
  tx: TransactionPipe,
  tenantId: string,
  eventos: readonly string[],
): Promise<string | null> {
  const { rows } = await tx.execute<{ url: string }>(sql`
    select url from webhook_saida
     where tenant_id = ${tenantId} and eventos = ${literalDeArray(eventos)}::text[]
     order by criado_em desc
     limit 1
  `);
  return rows[0]?.url ?? null;
}

async function montarConexao(
  tx: TransactionPipe,
  tenantId: string,
  fluxoId: string,
): Promise<ConnectionOfFlow> {
  const [key] = await tx
    .select({ prefixo: keyApi.prefix })
    .from(keyApi)
    .where(
      and(
        eq(keyApi.tenantId, tenantId),
        eq(keyApi.flowId, fluxoId),
        isNull(keyApi.revogadaEm),
      ),
    )
    .orderBy(desc(keyApi.criadoEm))
    .limit(1);

  return {
    flowId: fluxoId,
    endpoint: `${(process.env['PIPE_URL_API_PUBLICA'] ?? 'https://api.pipe.app').replace(/\/$/, '')}/v1`,
    keyPrefix: key?.prefixo ?? null,
    urlMessages: await urlDoWebhookPara(tx, tenantId, EVENTS_MESSAGES),
    urlNotifications: await urlDoWebhookPara(tx, tenantId, EVENTS_NOTIFICATIONS),
  };
}

/** Read 'Informações de conexão' with flow-edit permission. */
export async function loadConnectionOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<ConnectionOfFlow> {
  await requirePermission(tx, usuarioId, EDIT_FLOW);
  await flowExists(tx, tenantId, fluxoId);
  return montarConexao(tx, tenantId, fluxoId);
}

export interface PedidoDeConexao {
  /** `undefined` leaves the value unchanged; `null` or `''` deletes that event set's webhook. */
  urlMensagens?: string | null;
  urlNotificacoes?: string | null;
}

async function upsertWebhookDeConexao(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  eventos: readonly EventoWebhook[],
  url: string | null | undefined,
): Promise<void> {
  if (url === undefined) return;

  const { rows } = await tx.execute<{ id: string; url: string }>(sql`
    select id, url from webhook_saida
     where tenant_id = ${tenantId} and eventos = ${literalDeArray(eventos)}::text[]
     limit 1
  `);
  const existente = rows[0];

  if (!url) {
    if (existente) await deleteWebhookWithoutPermission(tx, tenantId, usuarioId, existente.id);
    return;
  }
  confirmarUrlSegura(url);

  if (!existente) {
    await createWebhookWithoutPermission(tx, tenantId, usuarioId, { url, eventos: [...eventos] });
    return;
  }
  if (existente.url === url) return;
  await editWebhookWithoutPermission(tx, tenantId, usuarioId, existente.id, { url });
}

/**
 * The three helpers call `criarWebhook`/`editarWebhook`/`excluirWebhook` without another permission check: `salvarConexaoDoFluxo` already checked `GERENCIAR_INTEGRACAO` in the same transaction; checking twice adds queries without changing authorization.
 */
async function createWebhookWithoutPermission(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  pedido: PedidoDeWebhook,
): Promise<void> {
  const segredo = randomBytes(32).toString('hex');
  const [criado] = await tx
    .insert(webhookSaida)
    .values({ tenantId, url: pedido.url, eventos: pedido.eventos, secret: segredo, ativo: true })
    .returning({ id: webhookSaida.id });
  if (!criado) throw new Error('não criou o webhook de conexão');
  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'webhook_saida',
    objetoId: criado.id,
    depois: { url: pedido.url, eventos: pedido.eventos, ativo: true },
  });
}

async function editWebhookWithoutPermission(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
  pedido: { url: string },
): Promise<void> {
  const [antes] = await tx
    .select({ url: webhookSaida.url })
    .from(webhookSaida)
    .where(and(eq(webhookSaida.tenantId, tenantId), eq(webhookSaida.id, id)));
  await tx
    .update(webhookSaida)
    .set({ url: pedido.url })
    .where(and(eq(webhookSaida.tenantId, tenantId), eq(webhookSaida.id, id)));
  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'webhook_saida',
    objetoId: id,
    antes: { url: antes?.url ?? null },
    depois: { url: pedido.url },
  });
}

async function deleteWebhookWithoutPermission(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const [atual] = await tx
    .select(COLUNAS_WEBHOOK)
    .from(webhookSaida)
    .where(and(eq(webhookSaida.tenantId, tenantId), eq(webhookSaida.id, id)));
  await tx
    .delete(webhookSaida)
    .where(and(eq(webhookSaida.tenantId, tenantId), eq(webhookSaida.id, id)));
  if (!atual) return;
  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'webhook_saida',
    objetoId: id,
    antes: { url: atual.url, eventos: atual.eventos, ativo: atual.active },
  });
}

/** Write 'Informações de conexão' with its own integration permission. */
export async function saveConnectionOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  userId: string,
  flowId: string,
  pedido: PedidoDeConexao,
): Promise<ConnectionOfFlow> {
  await requirePermission(tx, userId, MANAGE_INTEGRATION);
  await flowExists(tx, tenantId, flowId);

  await upsertWebhookDeConexao(tx, tenantId, userId, EVENTS_MESSAGES, pedido.urlMensagens);
  await upsertWebhookDeConexao(
    tx,
    tenantId,
    userId,
    EVENTS_NOTIFICATIONS,
    pedido.urlNotificacoes,
  );

  return montarConexao(tx, tenantId, flowId);
}

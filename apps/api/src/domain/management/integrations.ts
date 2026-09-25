import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { cifrar, diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import { keyApi, user, webhookSaida } from '@pipe/db/schema';
import { TYPES_AUTHENTICATION_WEBHOOK } from '@pipe/db/schema';
import { PipeError } from '../../errors.js';
import { exigirPermission } from '../../session.js';
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
import { EDITAR_FLOW } from './cycle-of-lifetime-of-flow.js';

/**
 * As três telas de Integrações do fluxo que só mostravam mock:
 *
 * - "Chaves de acesso" (`configuracoes/keys`): a `chave_api` sempre foi da
 *   CONTA; aqui ela pode ser de UM fluxo (`chave_api.fluxo_id`, migração
 *   0032). O formato do token é o mesmo de `autenticacao.ts`
 *   (`pipe_<prefixo>_<segredo>`) — é a MESMA credencial, só que a tela nasce
 *   com o fluxo já marcado.
 * - "Informações de conexão" (`configuracoes/api`): leitura real (id do
 *   fluxo, a chave ativa dele, o endpoint da `api`) e a única escrita que a
 *   origem faz ali — as duas URLs do cartão "Conectar usando HTTP" —, que
 *   aqui é o mesmo recurso do item de baixo: um `webhook_saida` por conjunto
 *   de eventos.
 * - "Webhook" (`integracoes/webhook`): CRUD de `webhook_saida` — a entrega já
 *   existe (`webhooks-saida.ts`); faltava criar, listar, editar, excluir e
 *   testar.
 *
 * Permissão: `chave_api.gerenciar` para chave (já existia, cobre "Emitir e
 * revogar chave de API"); `automacao.integracao.gerenciar` para o que grava
 * webhook/conexão (novo, migração 0032); leitura da conexão usa a mesma
 * permissão de editar fluxo (`EDITAR_FLUXO`) — é uma tela de configuração
 * do fluxo como as outras.
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
 * Os escopos que uma chave de fluxo nasce com. O escopo diz "o quê"; o
 * `fluxo_id` diz "onde": o guarda de chave (`conferirFluxoDaChave`, em
 * `autenticacao.ts`) carrega o `fluxoId` na sessão da chave e só a deixa agir
 * nas rotas DAQUELE fluxo — em rota que não é por fluxo ela é recusada (403
 * `chave_de_fluxo`), em rota de outro fluxo idem (`chave_de_outro_fluxo`).
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
  /** `pipe_<prefixo>_<segredo>` — aparece só aqui. O banco guarda só o hash. */
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
  nome: keyApi.nome,
  prefixo: keyApi.prefix,
  escopos: keyApi.scopes,
  criadoEm: keyApi.criadoEm,
  ultimoUsoEm: keyApi.ultimoUsoEm,
  revogadaEm: keyApi.revogadaEm,
};

const COLUMNS_KEY_LIST = { ...COLUMNS_KEY, requisitante: user.nome };

/** As chaves DESTE fluxo — nunca as de conta (`fluxo_id is null`). */
export async function listKeysOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<KeyOfFlow[]> {
  await exigirPermission(tx, usuarioId, MANAGE_KEY);
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

/** `createKey()`: sem nome é recusa, no limite é recusa, senão gera e grava. */
export async function createKeyOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  nome: string,
): Promise<KeyOfFlowCreated> {
  await exigirPermission(tx, usuarioId, MANAGE_KEY);
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
      fluxoId,
      nome: nomeAparado,
      prefix,
      hash: hashOfSecret(secret),
      escopos: [...SCOPES_OF_KEY_OF_FLOW],
      criadaPor: usuarioId,
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
export async function revogarKeyOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  keyId: string,
): Promise<void> {
  await exigirPermission(tx, usuarioId, MANAGE_KEY);
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
 * "Nos dois casos, use um protocolo seguro (HTTPS)" (origem, cartão
 * "Conectar usando HTTP") — e a régua do Pipe soma o que a Blip nunca
 * precisou de propósito: quem chama a `api` também escolhe a URL de destino,
 * então a URL é fronteira de SSRF, não só de formulário.
 *
 * ponytail: confere protocolo e literal de IP/hostname; NÃO resolve DNS. Um
 * hostname público que resolve para IP privado (rebinding) passa — cobrir
 * isso pede checar o IP na hora da ENTREGA, não da gravação, e ninguém pediu.
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
  const host = analisada.hostname.toLowerCase();
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

function ipPrivado(host: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (host === '::1' || host === '::') return true;
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  return false;
}

/* --------------------------------------------------------- Webhook_saida */

/**
 * Não são "do fluxo": `webhook_saida` sempre foi da CONTA (`apis.md` §5.5),
 * e a tela `integracoes/webhook` fica sob a casca de um fluxo só porque é lá
 * que o portal a desenha (a origem também é por bot; o Pipe decidiu não
 * duplicar a tabela por fluxo — a régua de webhook de saída já é
 * tenant-wide, `emitir()` avisa TODOS os assinantes ativos de um evento).
 */
/**
 * "Configurações de autenticação" da origem (switch + OAuth 2.0
 * `client_credentials`), mais Básica — a origem não mostra, a tarefa pede.
 * `usuario`/`urlAutorizacao`/`clientId` não são segredo e voltam na leitura;
 * `senha`/`clientSecret` são cifrados em repouso e NUNCA voltam (nem aqui,
 * nem em auditoria) — só entram na entrega/teste, decifrados na hora.
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
  /** Aparece só na criação — o banco guarda o segredo cifrado^Wem claro para
   *  assinar (`webhook_saida.segredo`), mas a TELA nunca volta a mostrá-lo. */
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
  /** `jsonb`: o driver já devolve parseado, mas o tipo da coluna some no `select`. */
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

/** Nunca inclui `autenticacaoSenha`/`oauth2ClientSecret` — só `webhookVivo` (privado) lê os dois. */
const COLUNAS_WEBHOOK = {
  id: webhookSaida.id,
  url: webhookSaida.url,
  eventos: webhookSaida.eventos,
  ativo: webhookSaida.ativo,
  criadoEm: webhookSaida.criadoEm,
  tipoAutenticacao: webhookSaida.typeAuthentication,
  autenticacaoUsuario: webhookSaida.authenticationUser,
  oauth2UrlAutorizacao: webhookSaida.oauth2UrlAuthorization,
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

/** `+ Adicionar cabeçalho` da origem: Chave/Valor, sem repetir e sem os reservados da assinatura. */
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
 * "Configurações de autenticação": nasce `nenhuma` quando o pedido não traz
 * nada (mesmo default da coluna). Editar SEMPRE substitui por inteiro — como
 * `eventos` — então trocar de OAuth 2.0 para Básica (ou vice-versa) pede as
 * credenciais de novo; não dá para só trocar o tipo e manter a senha antiga
 * cifrada de um jeito que o formulário nunca viu em claro.
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

/** As colunas que a gravação seta — os dois segredos saem cifrados daqui. */
function columnsOfAuthentication(authentication: AuthenticationWebhookInbound) {
  return {
    tipoAutenticacao: authentication.type,
    autenticacaoUsuario: authentication.type === 'basica' ? authentication.user! : null,
    autenticacaoSenha:
      authentication.type === 'basica' ? cifrar(authentication.senha!, keyring()) : null,
    oauth2UrlAutorizacao:
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
function authenticationForAuditoria(
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
  await exigirPermission(tx, usuarioId, MANAGE_INTEGRATION);
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
  /** `undefined` = sem cabeçalhos. Validado por `cabecalhosConferidos`. */
  cabecalhos?: unknown;
}

export async function createWebhook(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  pedido: PedidoDeWebhook,
): Promise<WebhookDeSaidaCriado> {
  await exigirPermission(tx, usuarioId, MANAGE_INTEGRATION);
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
      segredo,
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
      autenticacao: authenticationForAuditoria(authentication),
      cabecalhos,
    },
  });

  return { ...comoWebhook(criado), secret: segredo };
}

/** Linha completa, com os segredos — só para entrega/teste (`testarWebhook`) e edição/exclusão. */
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
      segredo: webhookSaida.secret,
      autenticacaoSenha: webhookSaida.authenticationPassword,
      oauth2ClientSecret: webhookSaida.oauth2ClientSecret,
    })
    .from(webhookSaida)
    .where(and(eq(webhookSaida.tenantId, tenantId), eq(webhookSaida.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('webhook');
  return {
    ...comoWebhook(atual),
    segredo: atual.segredo,
    authenticationPassword: atual.autenticacaoSenha,
    oauth2ClientSecret: atual.oauth2ClientSecret,
  };
}

export interface RequestOfEditOfWebhook {
  url?: string;
  eventos?: string[];
  active?: boolean;
  /** Substitui por inteiro, como `eventos` — ver o comentário de `autenticacaoConferida`. */
  autenticacao?: unknown;
  cabecalhos?: unknown;
}

/** `PATCH`: url/eventos/ativo/autenticacao/cabecalhos — só o que veio. Ativar/desativar vira `Acao` própria. */
export async function editarWebhook(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfWebhook,
): Promise<WebhookDeSaida> {
  await exigirPermission(tx, usuarioId, MANAGE_INTEGRATION);
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
    depois.autenticacao = authenticationForAuditoria(authenticationInbound);
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

/** `DELETE` de verdade: `entrega_webhook.webhook_id` é `ON DELETE CASCADE`, sem histórico a proteger. */
export async function excluirWebhook(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  await exigirPermission(tx, usuarioId, MANAGE_INTEGRATION);
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
  corpo?: string;
}

/** Corta a prévia do corpo da resposta do teste — nunca a resposta inteira no log/tela. */
const LIMIT_BODY_OF_TEST = 300;

/**
 * O botão "Testar": um POST imediato, fora da fila de `webhooks-saida.ts` —
 * é um clique de gente, não um fato de negócio, e não deixa rastro em
 * `entrega_webhook` (não é evento real, e falhar aqui não deve gerar retry).
 * Usa a MESMA autenticação e os MESMOS cabeçalhos customizados da entrega de
 * verdade (`cabecalhosDeSaida`/`cabecalhoDeAutorizacao`, `webhooks-saida.ts`)
 * — e o MESMO certificado mTLS, se o host tiver um (`chamarComMtls`).
 */
export async function testarWebhook(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
): Promise<ResultOfTest> {
  await exigirPermission(tx, usuarioId, MANAGE_INTEGRATION);
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
      ? { ok: true, status: resposta.status, corpo: corpoDaResposta }
      : {
          ok: false,
          status: resposta.status,
          error: `HTTP ${resposta.status}`,
          corpo: corpoDaResposta,
        };
  } catch (falha) {
    return { ok: false, error: (falha as Error).message };
  }
}

/* --------------------------------------------------- Conexão do fluxo (API) */

/**
 * Os dois eventos-conjunto que a "Informações de conexão" grava, cada um seu
 * próprio `webhook_saida` — o mesmo recurso do item de Integrações, só que
 * criado/lido pelo conjunto de eventos em vez do id.
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
 * Literal de array montado à mão: o template do `sql` do drizzle ACHATA um
 * array em parâmetros soltos (um `array de 1` vira parâmetro escalar, e
 * `= $1::text[]` quebra com "malformed array literal") — o mesmo motivo de
 * `igualEmLista` em `controladores/conversas.ts`. Os eventos aqui são sempre
 * os nossos próprios (`EVENTOS_MENSAGENS`/`EVENTOS_NOTIFICACOES`, catálogo
 * fechado), então não há entrada de cliente para escapar.
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
    endpoint: `${(process.env['PIPE_API_URL_PUBLICA'] ?? 'https://api.pipe.app').replace(/\/$/, '')}/v1`,
    keyPrefix: key?.prefixo ?? null,
    urlMessages: await urlDoWebhookPara(tx, tenantId, EVENTS_MESSAGES),
    urlNotifications: await urlDoWebhookPara(tx, tenantId, EVENTS_NOTIFICATIONS),
  };
}

/** Leitura de "Informações de conexão" — mesma permissão de editar o fluxo. */
export async function loadConnectionOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<ConnectionOfFlow> {
  await exigirPermission(tx, usuarioId, EDITAR_FLOW);
  await flowExists(tx, tenantId, fluxoId);
  return montarConexao(tx, tenantId, fluxoId);
}

export interface PedidoDeConexao {
  /** `undefined` não mexe; `null` ou `""` apaga (exclui o webhook daquele conjunto). */
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
  await editarWebhookWithoutPermission(tx, tenantId, usuarioId, existente.id, { url });
}

/**
 * As três de baixo repetem `criarWebhook`/`editarWebhook`/`excluirWebhook`
 * SEM checar permissão de novo — `salvarConexaoDoFluxo` já checou a dela
 * (`GERENCIAR_INTEGRACAO`), e checar duas vezes na mesma transação não muda
 * o resultado, só o número de consultas.
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
    .values({ tenantId, url: pedido.url, eventos: pedido.eventos, segredo, ativo: true })
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

async function editarWebhookWithoutPermission(
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
    antes: { url: atual.url, eventos: atual.eventos, ativo: atual.ativo },
  });
}

/** Escrita de "Informações de conexão" — permissão própria de integração. */
export async function saveConnectionOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  userId: string,
  flowId: string,
  pedido: PedidoDeConexao,
): Promise<ConnectionOfFlow> {
  await exigirPermission(tx, userId, MANAGE_INTEGRATION);
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

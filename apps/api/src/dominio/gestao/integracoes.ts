import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { cifrar, diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe } from '@pipe/db';
import { chaveApi, webhookSaida } from '@pipe/db/schema';
import { TIPOS_AUTENTICACAO_WEBHOOK } from '@pipe/db/schema';
import { ErroPipe } from '../../erros.js';
import { exigirPermissao } from '../../sessao.js';
import { hashDoSegredo } from '../../autenticacao.js';
import { chaveiro } from '../../banco.js';
import {
  CABECALHOS_RESERVADOS,
  EVENTOS,
  cabecalhoDeAutorizacao,
  cabecalhosDeSaida,
  decifrarSegredoDeWebhook,
} from '../../webhooks-saida.js';
import type { CabecalhoCustomizado, EventoWebhook, TipoAutenticacaoWebhook } from '../../webhooks-saida.js';
import { EDITAR_FLUXO } from './ciclo-de-vida-do-fluxo.js';

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

export const GERENCIAR_CHAVE = 'chave_api.gerenciar';
export const GERENCIAR_INTEGRACAO = 'automacao.integracao.gerenciar';

const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

async function fluxoExiste(tx: TransacaoPipe, tenantId: string, fluxoId: string): Promise<void> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo
     where tenant_id = ${tenantId} and id = ${fluxoId}::uuid and estado <> 'arquivado'
     limit 1
  `);
  if (!rows[0]) throw ErroPipe.naoEncontrado('fluxo');
}

/* --------------------------------------------------------- Chaves do fluxo */

/**
 * `MAX_TOKENS = 3` na origem (`docs/pesquisa/blip-configuracoes-api-e-chaves.md`,
 * espelhado em `apps/gestao-vite/.../configuracoes/regras.ts`). Conferido aqui
 * também: a regra do front não segura quem chama a `api` direto.
 */
export const LIMITE_DE_CHAVES = 3;

/**
 * Os escopos que uma chave de fluxo nasce com. `escopos` não sabe de fluxo — o
 * Bearer autentica o TENANT inteiro (`autenticacao.ts`); `fluxo_id` aqui é só
 * rótulo de dono para a tela, não uma cerca de dados.
 *
 * ponytail: restringir de verdade por fluxo pediria o guarda de escopo saber
 * de `fluxo_id` também — não pedido aqui, e nenhuma rota hoje filtra por
 * fluxo no corpo da chave.
 */
const ESCOPOS_DA_CHAVE_DO_FLUXO = [
  'conversas:ler',
  'conversas:escrever',
  'mensagens:ler',
  'mensagens:escrever',
  'contatos:ler',
] as const;

export interface ChaveDeFluxo {
  id: string;
  nome: string;
  prefixo: string;
  escopos: string[];
  criadaEm: string;
  ultimoUsoEm: string | null;
  revogadaEm: string | null;
}

export interface ChaveDeFluxoCriada extends ChaveDeFluxo {
  /** `pipe_<prefixo>_<segredo>` — aparece só aqui. O banco guarda só o hash. */
  token: string;
}

type LinhaChave = {
  id: string;
  nome: string;
  prefixo: string;
  escopos: string[] | null;
  criadoEm: Date;
  ultimoUsoEm: Date | null;
  revogadaEm: Date | null;
};

function comoChave(linha: LinhaChave): ChaveDeFluxo {
  return {
    id: linha.id,
    nome: linha.nome,
    prefixo: linha.prefixo,
    escopos: linha.escopos ?? [],
    criadaEm: linha.criadoEm.toISOString(),
    ultimoUsoEm: linha.ultimoUsoEm?.toISOString() ?? null,
    revogadaEm: linha.revogadaEm?.toISOString() ?? null,
  };
}

const COLUNAS_CHAVE = {
  id: chaveApi.id,
  nome: chaveApi.nome,
  prefixo: chaveApi.prefixo,
  escopos: chaveApi.escopos,
  criadoEm: chaveApi.criadoEm,
  ultimoUsoEm: chaveApi.ultimoUsoEm,
  revogadaEm: chaveApi.revogadaEm,
};

/** As chaves DESTE fluxo — nunca as de conta (`fluxo_id is null`). */
export async function listarChavesDoFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<ChaveDeFluxo[]> {
  await exigirPermissao(tx, usuarioId, GERENCIAR_CHAVE);
  await fluxoExiste(tx, tenantId, fluxoId);
  const linhas = await tx
    .select(COLUNAS_CHAVE)
    .from(chaveApi)
    .where(and(eq(chaveApi.tenantId, tenantId), eq(chaveApi.fluxoId, fluxoId)))
    .orderBy(desc(chaveApi.criadoEm));
  return linhas.map(comoChave);
}

/** `createKey()`: sem nome é recusa, no limite é recusa, senão gera e grava. */
export async function criarChaveDoFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  nome: string,
): Promise<ChaveDeFluxoCriada> {
  await exigirPermissao(tx, usuarioId, GERENCIAR_CHAVE);
  await fluxoExiste(tx, tenantId, fluxoId);

  const nomeAparado = nome.trim();
  if (!nomeAparado) {
    throw ErroPipe.requisicao('nome_ausente', 'Adicione um nome para identificar a chave.');
  }
  if (nomeAparado.length > 100) {
    throw ErroPipe.requisicao('nome_grande', 'O nome da chave pode ter até 100 caracteres.');
  }

  const { rows: contagem } = await tx.execute<{ n: string }>(sql`
    select count(*)::text as n from chave_api
     where tenant_id = ${tenantId} and fluxo_id = ${fluxoId}::uuid
  `);
  if (Number(contagem[0]?.n ?? 0) >= LIMITE_DE_CHAVES) {
    throw ErroPipe.requisicao(
      'limite_de_chaves',
      `Limite de ${LIMITE_DE_CHAVES} chaves atingido`,
    );
  }

  const prefixo = randomBytes(6).toString('hex');
  const segredo = randomBytes(24).toString('hex');
  const [criada] = await tx
    .insert(chaveApi)
    .values({
      tenantId,
      fluxoId,
      nome: nomeAparado,
      prefixo,
      hash: hashDoSegredo(segredo),
      escopos: [...ESCOPOS_DA_CHAVE_DO_FLUXO],
      criadaPor: usuarioId,
    })
    .returning(COLUNAS_CHAVE);
  if (!criada) throw new Error('não criou a chave de API');

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'chave_api',
    objetoId: criada.id,
    depois: { nome: nomeAparado, fluxoId, prefixo },
  });

  return { ...comoChave(criada), token: `pipe_${prefixo}_${segredo}` };
}

/** `deleteKey()`: revoga (`revogada_em`), nunca apaga a linha — o mesmo motivo do log de uso. */
export async function revogarChaveDoFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  chaveId: string,
): Promise<void> {
  await exigirPermissao(tx, usuarioId, GERENCIAR_CHAVE);
  await fluxoExiste(tx, tenantId, fluxoId);

  const [atual] = await tx
    .select({ id: chaveApi.id, revogadaEm: chaveApi.revogadaEm })
    .from(chaveApi)
    .where(
      and(eq(chaveApi.tenantId, tenantId), eq(chaveApi.fluxoId, fluxoId), eq(chaveApi.id, chaveId)),
    )
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('chave de API');
  if (atual.revogadaEm) return; // já revogada: idempotente, nada novo para o log.

  const agora = new Date();
  await tx
    .update(chaveApi)
    .set({ revogadaEm: agora })
    .where(and(eq(chaveApi.tenantId, tenantId), eq(chaveApi.id, chaveId)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'desativou',
    objetoTipo: 'chave_api',
    objetoId: chaveId,
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
    throw ErroPipe.requisicao('url_invalida', 'Informe uma URL válida.');
  }
  if (analisada.protocol !== 'https:') {
    throw ErroPipe.requisicao('url_precisa_https', 'A URL precisa usar HTTPS.');
  }
  const host = analisada.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') {
    throw ErroPipe.requisicao('url_proibida', 'A URL não pode apontar para localhost.');
  }
  if (ipPrivado(host)) {
    throw ErroPipe.requisicao(
      'url_proibida',
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
export interface AutenticacaoWebhookVisivel {
  tipo: TipoAutenticacaoWebhook;
  usuario: string | null;
  urlAutorizacao: string | null;
  clientId: string | null;
}

export interface WebhookDeSaida {
  id: string;
  url: string;
  eventos: string[];
  ativo: boolean;
  criadoEm: string;
  autenticacao: AutenticacaoWebhookVisivel;
  cabecalhos: CabecalhoCustomizado[];
}

export interface WebhookDeSaidaCriado extends WebhookDeSaida {
  /** Aparece só na criação — o banco guarda o segredo cifrado^Wem claro para
   *  assinar (`webhook_saida.segredo`), mas a TELA nunca volta a mostrá-lo. */
  segredo: string;
}

type LinhaWebhook = {
  id: string;
  url: string;
  eventos: string[] | null;
  ativo: boolean;
  criadoEm: Date;
  tipoAutenticacao: string;
  autenticacaoUsuario: string | null;
  oauth2UrlAutorizacao: string | null;
  oauth2ClientId: string | null;
  /** `jsonb`: o driver já devolve parseado, mas o tipo da coluna some no `select`. */
  cabecalhos: unknown;
};

function comoWebhook(linha: LinhaWebhook): WebhookDeSaida {
  return {
    id: linha.id,
    url: linha.url,
    eventos: linha.eventos ?? [],
    ativo: linha.ativo,
    criadoEm: linha.criadoEm.toISOString(),
    autenticacao: {
      tipo: linha.tipoAutenticacao as TipoAutenticacaoWebhook,
      usuario: linha.autenticacaoUsuario,
      urlAutorizacao: linha.oauth2UrlAutorizacao,
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
  tipoAutenticacao: webhookSaida.tipoAutenticacao,
  autenticacaoUsuario: webhookSaida.autenticacaoUsuario,
  oauth2UrlAutorizacao: webhookSaida.oauth2UrlAutorizacao,
  oauth2ClientId: webhookSaida.oauth2ClientId,
  cabecalhos: webhookSaida.cabecalhos,
};

function eventosConferidos(eventos: unknown): EventoWebhook[] {
  if (!Array.isArray(eventos) || eventos.length === 0) {
    throw ErroPipe.requisicao('eventos_ausentes', 'Selecione ao menos um evento.');
  }
  const unicos = [...new Set(eventos)];
  for (const evento of unicos) {
    if (!(EVENTOS as readonly string[]).includes(String(evento))) {
      throw ErroPipe.requisicao('evento_invalido', `Evento desconhecido: "${String(evento)}".`);
    }
  }
  return unicos as EventoWebhook[];
}

/** `+ Adicionar cabeçalho` da origem: Chave/Valor, sem repetir e sem os reservados da assinatura. */
const LIMITE_CABECALHOS = 20;

function cabecalhosConferidos(valor: unknown): CabecalhoCustomizado[] {
  if (valor === undefined) return [];
  if (!Array.isArray(valor)) {
    throw ErroPipe.requisicao('cabecalhos_invalidos', 'Cabeçalhos customizados inválidos.');
  }
  if (valor.length > LIMITE_CABECALHOS) {
    throw ErroPipe.requisicao(
      'cabecalhos_no_limite',
      `Limite de ${LIMITE_CABECALHOS} cabeçalhos customizados.`,
    );
  }
  const vistos = new Set<string>();
  const conferidos: CabecalhoCustomizado[] = [];
  for (const item of valor) {
    const bruto = item as Record<string, unknown>;
    const chave = typeof bruto?.['chave'] === 'string' ? bruto['chave'].trim() : '';
    const valorDoCabecalho = typeof bruto?.['valor'] === 'string' ? bruto['valor'] : '';
    if (!chave || chave.length > 200 || valorDoCabecalho.length > 2000) {
      throw ErroPipe.requisicao(
        'cabecalho_invalido',
        'Cada cabeçalho precisa de uma chave (até 200 caracteres) e um valor (até 2000).',
      );
    }
    const chaveNormal = chave.toLowerCase();
    if ((CABECALHOS_RESERVADOS as readonly string[]).includes(chaveNormal)) {
      throw ErroPipe.requisicao(
        'cabecalho_reservado',
        `O cabeçalho "${chave}" é reservado pela assinatura do webhook.`,
      );
    }
    if (vistos.has(chaveNormal)) {
      throw ErroPipe.requisicao(
        'cabecalho_repetido',
        `O cabeçalho "${chave}" foi informado mais de uma vez.`,
      );
    }
    vistos.add(chaveNormal);
    conferidos.push({ chave, valor: valorDoCabecalho });
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
export interface AutenticacaoWebhookEntrada {
  tipo: TipoAutenticacaoWebhook;
  usuario?: string;
  senha?: string;
  urlAutorizacao?: string;
  clientId?: string;
  clientSecret?: string;
}

function autenticacaoConferida(valor: unknown): AutenticacaoWebhookEntrada {
  const bruto = (valor ?? { tipo: 'nenhuma' }) as Record<string, unknown>;
  const tipo = String(bruto['tipo'] ?? '');
  if (!(TIPOS_AUTENTICACAO_WEBHOOK as readonly string[]).includes(tipo)) {
    throw ErroPipe.requisicao('autenticacao_invalida', 'Tipo de autenticação desconhecido.');
  }

  if (tipo === 'basica') {
    const usuario = typeof bruto['usuario'] === 'string' ? bruto['usuario'].trim() : '';
    const senha = typeof bruto['senha'] === 'string' ? bruto['senha'] : '';
    if (!usuario || !senha) {
      throw ErroPipe.requisicao(
        'autenticacao_incompleta',
        'Informe usuário e senha da autenticação básica.',
      );
    }
    return { tipo: 'basica', usuario, senha };
  }

  if (tipo === 'oauth2_client_credentials') {
    const urlAutorizacao = typeof bruto['urlAutorizacao'] === 'string' ? bruto['urlAutorizacao'] : '';
    const clientId = typeof bruto['clientId'] === 'string' ? bruto['clientId'].trim() : '';
    const clientSecret = typeof bruto['clientSecret'] === 'string' ? bruto['clientSecret'] : '';
    if (!urlAutorizacao || !clientId || !clientSecret) {
      throw ErroPipe.requisicao(
        'autenticacao_incompleta',
        'Informe URL de autorização, Client ID e Client Secret do OAuth 2.0.',
      );
    }
    confirmarUrlSegura(urlAutorizacao);
    return { tipo: 'oauth2_client_credentials', urlAutorizacao, clientId, clientSecret };
  }

  return { tipo: 'nenhuma' };
}

/** As colunas que a gravação seta — os dois segredos saem cifrados daqui. */
function colunasDeAutenticacao(autenticacao: AutenticacaoWebhookEntrada) {
  return {
    tipoAutenticacao: autenticacao.tipo,
    autenticacaoUsuario: autenticacao.tipo === 'basica' ? autenticacao.usuario! : null,
    autenticacaoSenha:
      autenticacao.tipo === 'basica' ? cifrar(autenticacao.senha!, chaveiro()) : null,
    oauth2UrlAutorizacao:
      autenticacao.tipo === 'oauth2_client_credentials' ? autenticacao.urlAutorizacao! : null,
    oauth2ClientId: autenticacao.tipo === 'oauth2_client_credentials' ? autenticacao.clientId! : null,
    oauth2ClientSecret:
      autenticacao.tipo === 'oauth2_client_credentials'
        ? cifrar(autenticacao.clientSecret!, chaveiro())
        : null,
  };
}

/** O que entra no log de auditoria — nunca `senha`/`clientSecret`, nem cifrados. */
function autenticacaoParaAuditoria(autenticacao: AutenticacaoWebhookEntrada): AutenticacaoWebhookVisivel {
  return {
    tipo: autenticacao.tipo,
    usuario: autenticacao.tipo === 'basica' ? (autenticacao.usuario ?? null) : null,
    urlAutorizacao:
      autenticacao.tipo === 'oauth2_client_credentials' ? (autenticacao.urlAutorizacao ?? null) : null,
    clientId: autenticacao.tipo === 'oauth2_client_credentials' ? (autenticacao.clientId ?? null) : null,
  };
}

export async function listarWebhooks(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
): Promise<WebhookDeSaida[]> {
  await exigirPermissao(tx, usuarioId, GERENCIAR_INTEGRACAO);
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

export async function criarWebhook(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  pedido: PedidoDeWebhook,
): Promise<WebhookDeSaidaCriado> {
  await exigirPermissao(tx, usuarioId, GERENCIAR_INTEGRACAO);
  confirmarUrlSegura(pedido.url);
  const eventos = eventosConferidos(pedido.eventos);
  const autenticacao = autenticacaoConferida(pedido.autenticacao);
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
      ...colunasDeAutenticacao(autenticacao),
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
      autenticacao: autenticacaoParaAuditoria(autenticacao),
      cabecalhos,
    },
  });

  return { ...comoWebhook(criado), segredo };
}

/** Linha completa, com os segredos — só para entrega/teste (`testarWebhook`) e edição/exclusão. */
async function webhookVivo(
  tx: TransacaoPipe,
  tenantId: string,
  id: string,
): Promise<
  WebhookDeSaida & { segredo: string; autenticacaoSenha: string | null; oauth2ClientSecret: string | null }
> {
  const [atual] = await tx
    .select({
      ...COLUNAS_WEBHOOK,
      segredo: webhookSaida.segredo,
      autenticacaoSenha: webhookSaida.autenticacaoSenha,
      oauth2ClientSecret: webhookSaida.oauth2ClientSecret,
    })
    .from(webhookSaida)
    .where(and(eq(webhookSaida.tenantId, tenantId), eq(webhookSaida.id, id)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('webhook');
  return {
    ...comoWebhook(atual),
    segredo: atual.segredo,
    autenticacaoSenha: atual.autenticacaoSenha,
    oauth2ClientSecret: atual.oauth2ClientSecret,
  };
}

export interface PedidoDeEdicaoDeWebhook {
  url?: string;
  eventos?: string[];
  ativo?: boolean;
  /** Substitui por inteiro, como `eventos` — ver o comentário de `autenticacaoConferida`. */
  autenticacao?: unknown;
  cabecalhos?: unknown;
}

/** `PATCH`: url/eventos/ativo/autenticacao/cabecalhos — só o que veio. Ativar/desativar vira `Acao` própria. */
export async function editarWebhook(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicaoDeWebhook,
): Promise<WebhookDeSaida> {
  await exigirPermissao(tx, usuarioId, GERENCIAR_INTEGRACAO);
  const atual = await webhookVivo(tx, tenantId, id);

  const antes = {
    url: atual.url,
    eventos: atual.eventos,
    ativo: atual.ativo,
    autenticacao: atual.autenticacao,
    cabecalhos: atual.cabecalhos,
  };
  const depois = { ...antes };
  if (pedido.url !== undefined) {
    confirmarUrlSegura(pedido.url);
    depois.url = pedido.url;
  }
  if (pedido.eventos !== undefined) depois.eventos = eventosConferidos(pedido.eventos);
  if (pedido.ativo !== undefined) depois.ativo = pedido.ativo;

  let autenticacaoEntrada: AutenticacaoWebhookEntrada | undefined;
  if (pedido.autenticacao !== undefined) {
    autenticacaoEntrada = autenticacaoConferida(pedido.autenticacao);
    depois.autenticacao = autenticacaoParaAuditoria(autenticacaoEntrada);
  }
  if (pedido.cabecalhos !== undefined) depois.cabecalhos = cabecalhosConferidos(pedido.cabecalhos);

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  const colunasParaGravar = {
    url: depois.url,
    eventos: depois.eventos,
    ativo: depois.ativo,
    cabecalhos: depois.cabecalhos,
    ...(autenticacaoEntrada ? colunasDeAutenticacao(autenticacaoEntrada) : {}),
  };

  const [gravado] = await tx
    .update(webhookSaida)
    .set(colunasParaGravar)
    .where(and(eq(webhookSaida.tenantId, tenantId), eq(webhookSaida.id, id)))
    .returning(COLUNAS_WEBHOOK);
  if (!gravado) throw ErroPipe.naoEncontrado('webhook');

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
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  await exigirPermissao(tx, usuarioId, GERENCIAR_INTEGRACAO);
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
      ativo: atual.ativo,
      autenticacao: atual.autenticacao,
      cabecalhos: atual.cabecalhos,
    },
  });
}

export interface ResultadoDoTeste {
  ok: boolean;
  status?: number;
  erro?: string;
  /** Os primeiros caracteres da resposta — "mostra a resposta (status e corpo curto)". */
  corpo?: string;
}

/** Corta a prévia do corpo da resposta do teste — nunca a resposta inteira no log/tela. */
const LIMITE_CORPO_DO_TESTE = 300;

/**
 * O botão "Testar": um POST imediato, fora da fila de `webhooks-saida.ts` —
 * é um clique de gente, não um fato de negócio, e não deixa rastro em
 * `entrega_webhook` (não é evento real, e falhar aqui não deve gerar retry).
 * Usa a MESMA autenticação e os MESMOS cabeçalhos customizados da entrega de
 * verdade (`cabecalhosDeSaida`/`cabecalhoDeAutorizacao`, `webhooks-saida.ts`).
 */
export async function testarWebhook(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
): Promise<ResultadoDoTeste> {
  await exigirPermissao(tx, usuarioId, GERENCIAR_INTEGRACAO);
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
      segredo: webhook.segredo,
      timestamp,
      corpo,
      deliveryId: randomBytes(16).toString('hex'),
      customizados: webhook.cabecalhos,
    });
    const autorizacao = await cabecalhoDeAutorizacao({
      tipo: webhook.autenticacao.tipo,
      usuario: webhook.autenticacao.usuario,
      senha: decifrarSegredoDeWebhook(webhook.autenticacaoSenha),
      oauth2UrlAutorizacao: webhook.autenticacao.urlAutorizacao,
      oauth2ClientId: webhook.autenticacao.clientId,
      oauth2ClientSecret: decifrarSegredoDeWebhook(webhook.oauth2ClientSecret),
    });
    if (autorizacao) cabecalhos['authorization'] = autorizacao;

    const resposta = await fetch(webhook.url, {
      method: 'POST',
      headers: cabecalhos,
      body: corpo,
      signal: AbortSignal.timeout(5_000),
    });
    const corpoDaResposta = await resposta
      .text()
      .catch(() => '')
      .then((texto) => texto.slice(0, LIMITE_CORPO_DO_TESTE));
    return resposta.ok
      ? { ok: true, status: resposta.status, corpo: corpoDaResposta }
      : { ok: false, status: resposta.status, erro: `HTTP ${resposta.status}`, corpo: corpoDaResposta };
  } catch (falha) {
    return { ok: false, erro: (falha as Error).message };
  }
}

/* --------------------------------------------------- Conexão do fluxo (API) */

/**
 * Os dois eventos-conjunto que a "Informações de conexão" grava, cada um seu
 * próprio `webhook_saida` — o mesmo recurso do item de Integrações, só que
 * criado/lido pelo conjunto de eventos em vez do id.
 */
const EVENTOS_MENSAGENS: readonly EventoWebhook[] = ['mensagem.criada'];
const EVENTOS_NOTIFICACOES: readonly EventoWebhook[] = [
  'conversa.criada',
  'conversa.estado_alterado',
  'conversa.atribuida',
  'conversa.encerrada',
];

export interface ConexaoDoFluxo {
  fluxoId: string;
  endpoint: string;
  /** O prefixo da chave ativa mais recente do fluxo — nunca o segredo. */
  chavePrefixo: string | null;
  urlMensagens: string | null;
  urlNotificacoes: string | null;
}

/**
 * Literal de array montado à mão: o template do `sql` do drizzle ACHATA um
 * array em parâmetros soltos (um `array de 1` vira parâmetro escalar, e
 * `= $1::text[]` quebra com "malformed array literal") — o mesmo motivo de
 * `igualEmLista` em `controladores/conversas.ts`. Os eventos aqui são sempre
 * os nossos próprios (`EVENTOS_MENSAGENS`/`EVENTOS_NOTIFICACOES`, catálogo
 * fechado), então não há entrada de cliente para escapar.
 */
function literalDeArray(valores: readonly string[]): string {
  return `{${valores.join(',')}}`;
}

async function urlDoWebhookPara(
  tx: TransacaoPipe,
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
  tx: TransacaoPipe,
  tenantId: string,
  fluxoId: string,
): Promise<ConexaoDoFluxo> {
  const [chave] = await tx
    .select({ prefixo: chaveApi.prefixo })
    .from(chaveApi)
    .where(
      and(
        eq(chaveApi.tenantId, tenantId),
        eq(chaveApi.fluxoId, fluxoId),
        isNull(chaveApi.revogadaEm),
      ),
    )
    .orderBy(desc(chaveApi.criadoEm))
    .limit(1);

  return {
    fluxoId,
    endpoint: `${(process.env['PIPE_API_URL_PUBLICA'] ?? 'https://api.pipe.app').replace(/\/$/, '')}/v1`,
    chavePrefixo: chave?.prefixo ?? null,
    urlMensagens: await urlDoWebhookPara(tx, tenantId, EVENTOS_MENSAGENS),
    urlNotificacoes: await urlDoWebhookPara(tx, tenantId, EVENTOS_NOTIFICACOES),
  };
}

/** Leitura de "Informações de conexão" — mesma permissão de editar o fluxo. */
export async function carregarConexaoDoFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<ConexaoDoFluxo> {
  await exigirPermissao(tx, usuarioId, EDITAR_FLUXO);
  await fluxoExiste(tx, tenantId, fluxoId);
  return montarConexao(tx, tenantId, fluxoId);
}

export interface PedidoDeConexao {
  /** `undefined` não mexe; `null` ou `""` apaga (exclui o webhook daquele conjunto). */
  urlMensagens?: string | null;
  urlNotificacoes?: string | null;
}

async function upsertWebhookDeConexao(
  tx: TransacaoPipe,
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
    if (existente) await excluirWebhookSemPermissao(tx, tenantId, usuarioId, existente.id);
    return;
  }
  confirmarUrlSegura(url);

  if (!existente) {
    await criarWebhookSemPermissao(tx, tenantId, usuarioId, { url, eventos: [...eventos] });
    return;
  }
  if (existente.url === url) return;
  await editarWebhookSemPermissao(tx, tenantId, usuarioId, existente.id, { url });
}

/**
 * As três de baixo repetem `criarWebhook`/`editarWebhook`/`excluirWebhook`
 * SEM checar permissão de novo — `salvarConexaoDoFluxo` já checou a dela
 * (`GERENCIAR_INTEGRACAO`), e checar duas vezes na mesma transação não muda
 * o resultado, só o número de consultas.
 */
async function criarWebhookSemPermissao(
  tx: TransacaoPipe,
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

async function editarWebhookSemPermissao(
  tx: TransacaoPipe,
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

async function excluirWebhookSemPermissao(
  tx: TransacaoPipe,
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
export async function salvarConexaoDoFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  pedido: PedidoDeConexao,
): Promise<ConexaoDoFluxo> {
  await exigirPermissao(tx, usuarioId, GERENCIAR_INTEGRACAO);
  await fluxoExiste(tx, tenantId, fluxoId);

  await upsertWebhookDeConexao(tx, tenantId, usuarioId, EVENTOS_MENSAGENS, pedido.urlMensagens);
  await upsertWebhookDeConexao(
    tx,
    tenantId,
    usuarioId,
    EVENTOS_NOTIFICACOES,
    pedido.urlNotificacoes,
  );

  return montarConexao(tx, tenantId, fluxoId);
}

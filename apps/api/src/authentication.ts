import { createHash, timingSafeEqual } from 'node:crypto';
import { applyDecorators, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import type { Request } from 'express';
import { databaseOwner } from './database.js';
import { PipeError } from './errors.js';
import { KEY_ANY_CREDENTIAL, KEY_SESSION, temBearer } from './session.js';
import type { RequestWithSession } from './session.js';

/**
 * Autenticação por `chave_api`, no formato recomendado em `apis.md` §5.2:
 * `Authorization: Bearer <token>`, token **opaco** (não JWT auto-contido) para poder
 * ser revogado na hora, e `tenant_id` resolvido no servidor — nunca vindo do cliente,
 * nem em payload, nem em header.
 *
 * O token é `pipe_<prefixo>_<segredo>`. O banco guarda o `prefixo` em claro (é o que
 * a tela mostra para o cliente reconhecer a chave) e o `sha256` do segredo. Achar a
 * chave pelo prefixo é a única consulta que roda antes de haver tenant em vigor.
 */

export const CATALOG_SCOPES = [
  'conversas:ler',
  'conversas:escrever',
  'mensagens:ler',
  'mensagens:escrever',
  'contatos:ler',
  'contatos:escrever',
  'filas:ler',
  'atendentes:ler',
  'webhooks:escrever',
] as const;

export type Scope = (typeof CATALOG_SCOPES)[number];

export interface ContextOfKey {
  tenantId: string;
  keyId: string;
  escopos: string[];
  /**
   * O fluxo dono da chave (`chave_api.fluxo_id`, migração 0032), ou `null` na
   * chave de CONTA. É a cerca que `conferirFluxoDaChave` aplica: chave de fluxo
   * só age no fluxo dela.
   */
  flowId: string | null;
}

/** A requisição autenticada carrega o contexto; o controlador nunca lê header. */
export type RequestAuthenticated = Request & { context?: ContextOfKey };

export const KEY_SCOPES = 'pipe:escopos';

/** Marca o escopo exigido por rota. Sem a marca, a rota é pública (webhook). */
export const Scopes = (...scopes: Scope[]) => SetMetadata(KEY_SCOPES, scopes);

/**
 * A rota serve aos dois clientes: integração por chave de API **ou** gente logada no
 * navegador. Quem se apresentou manda — ver `CHAVE_QUALQUER_CREDENCIAL` em `sessao.ts`.
 *
 * Existe porque `POST /v1/conversas/:id/mensagens` é a MESMA operação nos dois casos, e
 * duplicá-la numa rota `/v1/desk/...` seria duas implementações da regra de janela de
 * 24 horas, de outbox e de evento — ou seja, duas para divergir.
 */
export const KeyOrSession = (...escopos: Scope[]) =>
  applyDecorators(
    SetMetadata(KEY_SCOPES, escopos),
    SetMetadata(KEY_SESSION, true),
    SetMetadata(KEY_ANY_CREDENTIAL, true),
  );

/**
 * Quem está pedindo: uma integração ou uma pessoa.
 *
 * O `tenantId` sai da credencial nos dois casos, nunca do corpo nem da URL. O
 * `usuarioId` só existe quando é gente — chave de API não tem dono, e mensagem
 * enviada por integração é do sistema.
 */
export interface Ator {
  tenantId: string;
  userId: string | null;
  /** `true` quando veio de navegador. É o que liga as regras de atendente. */
  viaSession: boolean;
}

export function atorDe(requisicao: RequestAuthenticated & RequestWithSession): Ator {
  if (requisicao.context) {
    return { tenantId: requisicao.context.tenantId, userId: null, viaSession: false };
  }
  if (requisicao.session) {
    return {
      tenantId: requisicao.session.tenantId,
      userId: requisicao.session.userId,
      viaSession: true,
    };
  }
  throw PipeError.naoAutorizado();
}

export function contextOf(request: RequestAuthenticated): ContextOfKey {
  if (!request.context) throw PipeError.naoAutorizado();
  return request.context;
}

type LineKey = {
  id: string;
  tenant_id: string;
  flowId: string | null;
  hash: string;
  scopes: string[] | null;
  expirada: boolean;
  revogada: boolean;
};

/**
 * O fluxo que a ROTA nomeia, quando nomeia um: o parâmetro `:fluxoId`, ou o
 * `:id` (ou outro nome) logo depois de `/fluxos/` — `/v1/gestao/fluxos/:id/...`.
 *
 * Lê o PADRÃO da rota (`req.route.path`), não a URL: é o padrão que diz qual
 * segmento é o fluxo. Ler a URL casaria `/v1/conversas/<uuid>` por acidente se
 * alguém um dia nomeasse uma conversa com o id de um fluxo.
 */
export function flowOfRoute(requisicao: Request): string | null {
  const parametros = (requisicao.params ?? {}) as Record<string, string | undefined>;
  if (parametros['flowId']) return parametros['flowId'];
  const padrao = (requisicao.route as { path?: string } | undefined)?.path ?? '';
  const nome = /\/flows\/:(\w+)(?=\/|$)/.exec(padrao)?.[1];
  return nome ? (parametros[nome] ?? null) : null;
}

/**
 * A cerca da chave de fluxo. Chave de conta (`fluxoId` nulo) passa sempre —
 * é o tenant inteiro, como sempre foi.
 *
 * Chave de fluxo:
 * - rota POR FLUXO (`/…/fluxos/:id/…`): só o fluxo dela; outro fluxo é 403,
 *   e o 403 diz o porquê — não é 404, porque o fluxo existe e a chave é válida,
 *   o que falta é alcance.
 * - rota que NÃO é por fluxo (`/v1/conversas`, `/v1/contatos`, …): RECUSADA.
 *   Decisão Pipe: entre "recusar" e "limitar ao que pertence ao fluxo", vale a
 *   mais restritiva. Conversa não tem `fluxo_id` — pertence a um fluxo só por
 *   tabela (inbox → canal = `fluxo.canal_id`), e filtrar por essa tabela em
 *   cada rota de conversa/contato/anexo/etiqueta seria uma cerca de dados
 *   espalhada em oito lugares, fácil de esquecer na nona. Recusar é uma
 *   linha, aqui, e nenhuma rota de hoje aceita chave E é por fluxo — quando
 *   uma for aberta a chave, a regra de cima já vale sem mexer em nada.
 */
export function checkFlowOfKey(
  key: Pick<ContextOfKey, 'flowId'>,
  flowInRoute: string | null,
): void {
  if (!key.flowId) return;
  if (flowInRoute === null) {
    throw new PipeError(
      403,
      'key_of_flow',
      'Esta chave é de um fluxo e só vale nas rotas desse fluxo (/v1/management/flows/:id/…).',
      { fluxoId: key.flowId },
    );
  }
  if (flowInRoute.toLowerCase() !== key.flowId.toLowerCase()) {
    throw new PipeError(
      403,
      'key_of_other_flow',
      'Esta chave pertence a outro fluxo e não pode agir neste.',
      { fluxoId: key.flowId },
    );
  }
}

export class ApiKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const exigidos = this.reflector.getAllAndOverride<Scope[] | undefined>(KEY_SCOPES, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Rota sem `@Escopos` é pública de propósito: o webhook da Meta se autentica
    // pela assinatura `X-Hub-Signature-256`, não por chave nossa.
    if (!exigidos || exigidos.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestAuthenticated>();

    // Rota que aceita as duas credenciais e NÃO recebeu Bearer: quem confere é o
    // guarda da sessão. Ver `CHAVE_QUALQUER_CREDENCIAL` em `sessao.ts`.
    const qualquer = this.reflector.getAllAndOverride<boolean | undefined>(
      KEY_ANY_CREDENTIAL,
      [context.getHandler(), context.getClass()],
    );
    if (qualquer && !temBearer(request)) return true;

    const key = await autenticar(request.header('authorization'));
    request.context = key;

    const permitido = exigidos.every(
      (scope) => key.escopos.includes('*') || key.escopos.includes(scope),
    );
    if (!permitido) {
      const faltando = exigidos.find(
        (escopo) => !key.escopos.includes('*') && !key.escopos.includes(escopo),
      );
      throw PipeError.withoutScope(faltando ?? exigidos[0] ?? 'desconhecido');
    }

    // Depois do escopo: "o que" a chave pode fazer é conferido antes de "onde".
    // O guarda roda já dentro da rota casada, então `params` e `route.path` existem.
    checkFlowOfKey(key, flowOfRoute(request));
    return true;
  }
}

export async function autenticar(cabecalho: string | undefined): Promise<ContextOfKey> {
  const token = (cabecalho ?? '').replace(/^Bearer\s+/i, '').trim();
  const partes = token.split('_');
  if (partes.length !== 3 || partes[0] !== 'pipe' || !partes[1] || !partes[2]) {
    throw PipeError.naoAutorizado();
  }
  const [, prefix, secret] = partes;

  const { rows } = await databaseOwner().execute<LineKey>(sql`
    select id, tenant_id, fluxo_id, hash, escopos,
           (expira_em is not null and expira_em <= now()) as expirada,
           (revogada_em is not null) as revogada
      from chave_api
     where prefixo = ${prefix}
     limit 1
  `);
  const linha = rows[0];
  if (!linha) throw PipeError.naoAutorizado();
  if (!equalInTimeConstante(hashOfSecret(secret), linha.hash)) throw PipeError.naoAutorizado();
  if (linha.revogada) throw PipeError.naoAutorizado('Chave revogada.');
  if (linha.expirada) throw PipeError.naoAutorizado('Chave expirada.');

  // Marcar o uso não pode derrubar a requisição: é dado de auditoria, não de rota.
  void databaseOwner()
    .execute(sql`update chave_api set ultimo_uso_em = now() where id = ${linha.id}`)
    .catch(() => undefined);

  return {
    tenantId: linha.tenant_id,
    keyId: linha.id,
    escopos: linha.scopes ?? [],
    flowId: linha.flowId,
  };
}

export function hashOfSecret(segredo: string): string {
  return createHash('sha256').update(segredo).digest('hex');
}

/** Comparação sem vazar, pelo tempo de resposta, quantos caracteres bateram. */
function equalInTimeConstante(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

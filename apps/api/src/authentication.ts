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
 * API key authentication through `chave_api` follows `apis.md` §5.2: `Authorization: Bearer <token>`. The token is opaque rather than a self-contained JWT so it can be revoked immediately. Resolve `tenant_id` on the server; never accept it from a client payload or header. Tokens have the form `pipe_<prefixo>_<segredo>`. The database stores `prefixo` in clear text so the client can recognize the key, and stores the secret's `sha256` hash. Looking up the key by prefix is the only query performed before a tenant is established.
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
   * The flow owning this key (`chave_api.fluxo_id`, migration 0032), or `null` for an account key. `conferirFluxoDaChave` enforces that a flow key acts only on its own flow.
   */
  flowId: string | null;
}

/** The authenticated request carries the context; controllers never read the header. */
export type RequestAuthenticated = Request & { context?: ContextOfKey };

export const KEY_SCOPES = 'pipe:escopos';

/** Marks the scope required by a route. Without the marker, the route is public (for example, the webhook). */
export const Scopes = (...scopes: Scope[]) => SetMetadata(KEY_SCOPES, scopes);

/**
 * This route serves both API key integrations and people signed in through a browser. The presented credential takes precedence; see `CHAVE_QUALQUER_CREDENCIAL` in `sessao.ts`. `POST /v1/conversas/:id/mensagens` is the same operation for both. Duplicating it under `/v1/desk/...` would duplicate the 24-hour window, outbox and event rules and let the implementations diverge.
 */
export const KeyOrSession = (...escopos: Scope[]) =>
  applyDecorators(
    SetMetadata(KEY_SCOPES, escopos),
    SetMetadata(KEY_SESSION, true),
    SetMetadata(KEY_ANY_CREDENTIAL, true),
  );

/**
 * The caller may be an integration or a person. In both cases `tenantId` comes from the credential, never from the body or URL. Only a person has `usuarioId`: API keys have no owner, and integration messages are attributed to the system.
 */
export interface Ator {
  tenantId: string;
  userId: string | null;
  /** `true` for a browser session; enables the attendant rules. */
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
  fluxo_id: string | null;
  hash: string;
  escopos: string[] | null;
  expirada: boolean;
  revogada: boolean;
};

/**
 * When a route names a flow, use its `:fluxoId` parameter or `:id` (or another parameter name) immediately after `/fluxos/`, as in `/v1/gestao/fluxos/:id/...`. Inspect the route pattern (`req.route.path`), not the URL: the pattern identifies which segment represents the flow. Looking at the URL could accidentally match `/v1/conversas/<uuid>` if a conversation ID ever equaled a flow ID.
 */
export function flowOfRoute(requisicao: Request): string | null {
  const parametros = (requisicao.params ?? {}) as Record<string, string | undefined>;
  if (parametros['flowId']) return parametros['flowId'];
  const padrao = (requisicao.route as { path?: string } | undefined)?.path ?? '';
  const nome = /\/flows\/:(\w+)(?=\/|$)/.exec(padrao)?.[1];
  return nome ? (parametros[nome] ?? null) : null;
}

/**
 * Account keys (`fluxoId` is null) cover the whole tenant. A flow key may access only its own flow on a flow route (`/…/fluxos/:id/…`); another flow returns 403 because the key and flow exist but the key lacks reach. Reject a flow key on routes without a flow (`/v1/conversas`, `/v1/contatos`, etc.). Pipe chose rejection over filtering related records: a conversation has no `fluxo_id` and belongs to a flow only through the inbox and channel (`fluxo.canal_id`). Repeating that data boundary across conversation, contact, attachment and tag routes would be easy to miss in a new route. The single guard enforces it. No current route both accepts a key and names a flow; when one does, this rule already applies.
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
    // An unmarked `@Escopos` route is deliberately public: the Meta webhook authenticates
    // with `X-Hub-Signature-256`, not with our API key.
    if (!exigidos || exigidos.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestAuthenticated>();

    // On a route that accepts either credential, if no Bearer token was supplied,
    // the session guard checks the request. See `CHAVE_QUALQUER_CREDENCIAL` in `sessao.ts`.
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

    // Check the key's scope before checking its flow: first what it may do, then where.
    // The guard runs after route matching, so `params` and `route.path` are available.
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
  if (!equalInTimeConstant(hashOfSecret(secret), linha.hash)) throw PipeError.naoAutorizado();
  if (linha.revogada) throw PipeError.naoAutorizado('Chave revogada.');
  if (linha.expirada) throw PipeError.naoAutorizado('Chave expirada.');

  // Failure to record last use must not fail the request: this is audit data, not route data.
  void databaseOwner()
    .execute(sql`update chave_api set ultimo_uso_em = now() where id = ${linha.id}`)
    .catch(() => undefined);

  return {
    tenantId: linha.tenant_id,
    keyId: linha.id,
    escopos: linha.escopos ?? [],
    flowId: linha.fluxo_id,
  };
}

export function hashOfSecret(segredo: string): string {
  return createHash('sha256').update(segredo).digest('hex');
}

/** Compare without revealing through response timing how many characters matched. */
function equalInTimeConstant(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

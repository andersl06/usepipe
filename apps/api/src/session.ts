import { SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import type { Request } from 'express';
import { hashDoToken, readTenantHostConfig, resolveSession } from '@pipe/authentication';
import type { SessionActive } from '@pipe/authentication';
import type { TransactionPipe } from '@pipe/db';
import { databaseOwner } from './database.js';
import { PipeError } from './errors.js';
import { resolveRequestTenantSlug } from './request-tenant.js';

/**
 * Browser session authentication complements API-key authentication in `autenticacao.ts`. Controllers read neither headers nor cookies and derive `tenant_id` server-side. Integrations use `Authorization: Bearer pipe_...`; people use browser cookie `pipe_sessao`. Routes declare `@Escopos(...)` or `@ComSessao()`; unmarked routes such as webhooks and `/saude` are intentionally public. Parse the cookie directly with semicolon splitting instead of adding `cookie-parser`. The cookie parser is a semicolon `split`.
 */

export const KEY_SESSION = 'pipe:sessao';
export const SESSION_COOKIE_NAME = 'pipe_session';

export function sessionCookie(header: string): string {
  return `${SESSION_COOKIE_NAME}${header.slice(header.indexOf('='))}`;
}

/** Mark a route as requiring a browser session. */
export const WithSession = () => SetMetadata(KEY_SESSION, true);

/**
 * Mark a route as accepting API key OR session. Without this mark, both global guards would independently require credentials when `@Escopos(...)` and `@ComSessao()` appear together. With it, `Authorization: Bearer pipe_…` selects the key guard and skips the session guard; without Bearer, the session guard checks the cookie; without either, return 401. Bearer deliberately wins over a cookie so an integration tested from a logged-in Desk browser is still treated as integration. The composed decorator stays with `@Escopos` in `autenticacao.ts`; only the shared marker lives here to avoid an import cycle.
 */
export const KEY_ANY_CREDENTIAL = 'pipe:qualquer-credencial';

/** Check for request `Authorization: Bearer` to choose between the two credentials. */
export function temBearer(request: Request): boolean {
  return /^Bearer\s+\S/i.test(request.header('authorization') ?? '');
}

export type RequestWithSession = Request & { session?: SessionActive };

export function sessionOf(requisicao: RequestWithSession): SessionActive {
  if (!requisicao.session) throw recusa();
  return requisicao.session;
}

/**
 * Missing, unknown, expired, and revoked sessions return the same response so an attacker cannot learn which guess was partly correct.
 */
function recusa(): PipeError {
  return PipeError.naoAutorizado('Sessão ausente ou expirada.');
}

export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  return lerCookies(cabecalho, nome)[0];
}

/**
 * Read every cookie value with this name in arrival order. Different cookie scopes can produce duplicate names after a `Domain` change; the first may be stale. Reading only it could silently log out people who still carry the old cookie.
 */
export function lerCookies(cabecalho: string | undefined, nome: string): string[] {
  if (!cabecalho) return [];
  const achados: string[] = [];
  for (const parte of cabecalho.split(';')) {
    const igual = parte.indexOf('=');
    if (igual < 0) continue;
    if (parte.slice(0, igual).trim() !== nome) continue;
    achados.push(decodeURIComponent(parte.slice(igual + 1).trim()));
  }
  return achados;
}

export function tokenOfSession(requisicao: Request): string | undefined {
  return lerCookie(requisicao.header('cookie'), SESSION_COOKIE_NAME);
}

/**
 * Check a person's permission inside `noTenant` before writing. A separate guard before `pipe.tenant_id` is set would need an owner-role lookup duplicating what the transaction can answer. Effective permission is `COALESCE` of that person's `usuario_permissao` override (migration 0046) and the union of their roles, as in `GET /v1/eu`. A per-person row explicitly grants or denies the capability; without one, roles decide. One query combines both. SQL `coalesce` combines the override and role result.
 */
export async function requirePermission(
  tx: TransactionPipe,
  userId: string,
  codigo: string,
): Promise<void> {
  const { rows } = await tx.execute<{ tem: boolean }>(sql`
    select coalesce(
      (select uperm.concedida
         from usuario_permissao uperm
        where uperm.usuario_id = ${userId}::uuid
          and uperm.permissao_codigo = ${codigo}),
      exists (
        select 1
          from usuario_papel up
          join papel_permissao pp on pp.papel_id = up.papel_id
         where up.usuario_id = ${userId}::uuid and pp.permissao_codigo = ${codigo}
      )
    ) as tem
  `);
  if (!rows[0]?.tem) throw PipeError.withoutPermission(codigo);
}

export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const exige = this.reflector.getAllAndOverride<boolean | undefined>(KEY_SESSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!exige) return true;

    const request = context.switchToHttp().getRequest<RequestWithSession>();

    // When a dual-credential route receives Bearer, its API-key guard handles authentication; the session guard yields.
    // da chave. Ver `CHAVE_QUALQUER_CREDENCIAL`.
    const qualquer = this.reflector.getAllAndOverride<boolean | undefined>(
      KEY_ANY_CREDENTIAL,
      [context.getHandler(), context.getClass()],
    );
    if (qualquer && temBearer(request)) return true;

    const token = tokenOfSession(request);
    if (!token) throw recusa();

    // Look up the unique indexed hash; plaintext tokens never reach the database.
    const session = await resolveSession(databaseOwner(), hashDoToken(token));
    if (!session) throw recusa();

    const requestedSlug = resolveRequestTenantSlug({ host: request.headers.host, origin: request.headers.origin }, readTenantHostConfig());
    if (requestedSlug && requestedSlug !== session.tenantSlug) {
      throw new PipeError(403, 'tenant_mismatch', 'Você não tem acesso a esta conta.');
    }

    request.session = session;
    return true;
  }
}

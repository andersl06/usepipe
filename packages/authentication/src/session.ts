import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { parseTenantHost } from '@pipe/contracts';
import type { TenantHostConfig } from '@pipe/contracts';

/**
 * Pipe sessions put the token in a browser cookie and store only its **hash** in the database. As with API keys, a database reader cannot impersonate a user.
 *
 * Look up BY HASH through a unique index rather than fetching by session ID and comparing later. This keeps the query to one row and avoids a find-then-compare path with timing leakage.
 */

/**
 * Eight hours is the honest revocation ceiling without SCIM: someone who leaves a tenant organization loses access at the next revalidation, not at the exact departure time.
 */
export const DURATION_DEFAULT_MS = 8 * 60 * 60 * 1000;

export const NOME_DO_COOKIE = 'pipe_sessao';

export interface TokenOfSession {
  /** Goes in the cookie; never stored. */
  token: string;
  /** Goes in the database; never leaves it. */
  hash: string;
  expiraEm: Date;
}

export function createToken(durationMs = DURATION_DEFAULT_MS, agora = new Date()): TokenOfSession {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashDoToken(token),
    expiraEm: new Date(agora.getTime() + durationMs),
  };
}

/**
 * Plain SHA-256 without a slow derivation is deliberate: this token has 256 bits of generated entropy, unlike a human password. Slow derivation protects against dictionaries, and no practical dictionary reaches this space.
 */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokensEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export interface OptionsOfCookie {
  /**
   * The parent domain with a leading dot: `.pipe.com.br`.
   *
   * It lets a cookie from `api.pipe.com.br` reach `gestao.pipe.com.br`, `app.pipe.com.br`, and `crm.pipe.com.br`. Each app has its own URL; without a parent domain each would need a separate login.
   *
   * The alternative, `SameSite=None` with credentialed CORS, is worse: `None` sends the cookie on requests from ANY site, whereas `Lax` blocks that. Subdomains of one parent are same-site.
   *
   * Leave this undefined in development: `localhost` does not accept a cookie domain, and different ports are already the same origin for this purpose.
   */
  domain?: string | undefined;
  /** Disable only on `http://localhost`, where HTTPS is unavailable. */
  seguro?: boolean;
}

/**
 * The session cookie and its important attributes.
 *
 * `HttpOnly` keeps scripts from reading the token; without it, XSS becomes session theft. `SameSite=Lax` permits Google's top-level return navigation while blocking third-party requests.
 */
export function cookieOfSession(
  token: string,
  expiraEm: Date,
  options: OptionsOfCookie = {},
): string {
  return montarCookie(token, options, `Expires=${expiraEm.toUTCString()}`);
}


export function cookieDeSaida(opcoes: OptionsOfCookie = {}): string {
  return montarCookie('', opcoes, 'Max-Age=0');
}

function montarCookie(value: string, opcoes: OptionsOfCookie, prazo: string): string {
  const partes = [`${NOME_DO_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', prazo];
  // Does `Domain` need to precede `Secure`? No; attribute order is free. It only
  // appears when configured: `Domain=localhost` invalidates the cookie in several
  // browsers, causing login to appear to do nothing.
  if (opcoes.domain) partes.push(`Domain=${opcoes.domain}`);
  if (opcoes.seguro ?? true) partes.push('Secure');
  return partes.join('; ');
}

/**
 * Origins allowed to call the API with credentials.
 *
 * A closed list comes from the environment. Never use `*`: browsers reject credentialed wildcard CORS, and allowing it would let any website send authenticated requests for a signed-in user.
 */
export type AllowedOrigins = { fixed: string[]; tenant: TenantHostConfig | null };

export function readTenantHostConfig(env: NodeJS.ProcessEnv = process.env): TenantHostConfig | null {
  const baseDomain = (env['PIPE_DOMINIO_CONTAS'] ?? '').trim().toLowerCase();
  if (!baseDomain) return null;
  return {
    baseDomain,
    publicPort: (env['PIPE_PORTA_PUBLICA'] ?? '').trim(),
    secure: env['PIPE_COOKIE_SEGURO'] !== 'false',
  };
}

export function origensPermitidas(env: NodeJS.ProcessEnv = process.env): AllowedOrigins {
  const cru = env['PIPE_ORIGENS'] ?? '';
  return { fixed: cru
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter((o) => Boolean(o) && !o.includes('*')),
    tenant: readTenantHostConfig(env),
  };
}

export function origemPermitida(origem: string | undefined | null, permitidas: AllowedOrigins): boolean {
  if (!origem) return false;
  try {
    const url = new URL(origem);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (permitidas.fixed.includes(url.origin)) return true;
    const config = permitidas.tenant;
    return Boolean(config && url.protocol === (config.secure ? 'https:' : 'http:') && parseTenantHost(url.host, config));
  } catch {
    return false;
  }
}

export interface SessionActive {
  id: string;
  tenantId: string;
  tenantSlug: string;
  userId: string;
  expiraEm: Date;
  origem: string;
}


export function estaValida(
  session: { expiraEm: Date; encerradaEm: Date | null },
  agora = new Date(),
): boolean {
  if (session.encerradaEm) return false;
  return session.expiraEm.getTime() > agora.getTime();
}

import { readTenantHostConfig } from '@pipe/authentication';
import { buildLoginUrl } from '@pipe/contracts';

/** Reject a deployment where the session cookie or OAuth callback escapes the tenant base. */
export function assertTenantDomainConfig(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn,
): void {
  const domain = (env['PIPE_DOMINIO_CONTAS'] ?? '').trim();
  if (!domain) return;
  if (!(domain === 'localhost' || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) || domain.startsWith('desk.')) {
    throw new Error('PIPE_DOMINIO_CONTAS must be a valid base domain');
  }
  if (env['PIPE_COOKIE_DOMINIO'] !== (domain === 'localhost' ? '' : `.${domain}`)) {
    throw new Error('PIPE_COOKIE_DOMINIO must match PIPE_DOMINIO_CONTAS with a leading dot');
  }
  const config = readTenantHostConfig(env)!;
  const expected = `${buildLoginUrl(config).replace(/\/$/, '')}/v1/auth/google/callback`;
  if (env['GOOGLE_URL_RETORNO'] !== expected) {
    const message = `GOOGLE_URL_RETORNO must be ${expected}`;
    if (env['NODE_ENV'] === 'production' || env['GOOGLE_CLIENTE_ID']) throw new Error(message);
    warn(message);
  }
}

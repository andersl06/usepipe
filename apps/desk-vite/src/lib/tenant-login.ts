import { buildLoginUrl, deriveBaseDomain, parseTenantHost } from '@pipe/contracts';
import type { TenantHostConfig } from '@pipe/contracts';

export function tenantLoginUrl(location: Pick<Location, 'hostname' | 'host' | 'protocol' | 'port' | 'href'>, dev = false): string | null {
  const baseDomain = deriveBaseDomain(location.hostname, import.meta.env['VITE_PIPE_DOMINIO_CONTAS']);
  if (!baseDomain) return null;
  const config: TenantHostConfig = { baseDomain, publicPort: location.port, secure: location.protocol === 'https:' };
  if (parseTenantHost(location.host, config)?.app !== 'desk') return null;
  return buildLoginUrl({ ...config, publicPort: dev && baseDomain === 'lvh.me' ? '3110' : config.publicPort }, location.href);
}

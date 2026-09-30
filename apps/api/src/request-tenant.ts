import { isLoginHost, parseTenantHost } from '@pipe/contracts';
import type { TenantHostConfig } from '@pipe/contracts';

/** Only the original Host header is considered; proxy forwarded headers are not authority. */
export function resolveRequestTenantSlug(
  headers: { host?: string | undefined; origin?: string | undefined },
  config: TenantHostConfig | null,
): string | null {
  if (!config) return null;
  const host = headers.host ?? '';
  const tenant = parseTenantHost(host, config);
  if (tenant) return tenant.slug;
  if (isLoginHost(host, config)) return null;
  if (!/^api\./i.test(host) || !isLoginHost(host.replace(/^api\./i, 'login.'), config)) return null;
  if (!headers.origin) return null;
  try {
    const origin = new URL(headers.origin);
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return null;
    if (origin.protocol !== (config.secure ? 'https:' : 'http:')) return null;
    return parseTenantHost(origin.host, config)?.slug ?? null;
  } catch {
    return null;
  }
}

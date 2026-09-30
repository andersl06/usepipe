import {
  buildLoginUrl, buildTenantOrigin, deriveBaseDomain, isLoginHost,
  isReservedSubdomain, isValidTenantSlug, parseReturnTo, parseTenantHost,
} from '@pipe/contracts';
import type { TenantHostConfig } from '@pipe/contracts';

export type BrowserLocation = Pick<Location, 'protocol' | 'hostname' | 'port' | 'href'>;
export type HostMode = 'login' | 'tenant' | 'reserved' | 'off';
const devPorts = { management: '3110', desk: '3210' } as const;

export function tenantConfig(location: BrowserLocation): TenantHostConfig | null {
  const baseDomain = deriveBaseDomain(location.hostname);
  if (!baseDomain) return null;
  return { baseDomain, publicPort: location.port, secure: location.protocol === 'https:' };
}

function hostWithPort(location: BrowserLocation): string {
  return `${location.hostname}${location.port ? `:${location.port}` : ''}`;
}

export function isReservedHost(hostname: string): boolean {
  const base = deriveBaseDomain(hostname);
  if (!base) return false;
  return isReservedSubdomain(hostname.slice(0, -(base.length + 1))) && !hostname.startsWith('login.');
}

export function hostMode(location: BrowserLocation): HostMode {
  const config = tenantConfig(location);
  if (!config) return 'off';
  if (isLoginHost(hostWithPort(location), config)) return 'login';
  if (isReservedHost(location.hostname)) return 'reserved';
  return parseTenantHost(hostWithPort(location), config)?.app === 'application' ? 'tenant' : 'reserved';
}

export function buildDeskUrl(location: BrowserLocation, slug: string, dev = false): string | null {
  if (!isValidTenantSlug(slug)) return null;
  if (!tenantConfig(location)) return dev && location.hostname === 'localhost' ? `http://localhost:${devPorts.desk}/` : null;
  const config = tenantConfig(location)!;
  const host = parseTenantHost(hostWithPort(location), config);
  if (host?.slug !== slug || host.app !== 'application') return null;
  const deskConfig = { ...config, publicPort: dev && config.baseDomain === 'lvh.me' ? devPorts.desk : config.publicPort };
  const url = `${buildTenantOrigin(slug, 'desk', deskConfig)}/`;
  return parseTenantHost(new URL(url).host, deskConfig)?.slug === slug ? url : null;
}

export function centralLoginRedirect(location: BrowserLocation, dev = false): string | null {
  const config = tenantConfig(location);
  if (!config || !parseTenantHost(hostWithPort(location), config)) return null;
  const loginConfig = { ...config, publicPort: dev && config.baseDomain === 'lvh.me' ? devPorts.management : config.publicPort };
  return buildLoginUrl(loginConfig, location.href);
}

export function loggedInDestination(location: BrowserLocation, slug: string, returnTo: string | null, dev = false): string | null {
  const config = tenantConfig(location);
  if (!config || !isValidTenantSlug(slug)) return null;
  const home = `${buildTenantOrigin(slug, 'application', config)}/application`;
  const target = returnTo ? (parseReturnTo(returnTo, config)
    ?? (dev && config.baseDomain === 'lvh.me'
      ? parseReturnTo(returnTo, { ...config, publicPort: devPorts.desk }) : null)) : null;
  if (!target) return home;
  return target.slug === slug ? target.url : `${home}?deniedTenant=${encodeURIComponent(target.slug)}`;
}

export function readDeniedTenantNotice(search: string): string | null {
  const slug = new URLSearchParams(search).get('deniedTenant');
  return slug && isValidTenantSlug(slug) ? slug : null;
}

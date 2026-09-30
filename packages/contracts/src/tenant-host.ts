/** Browser-safe tenant address rules. A base domain must never start with `desk.`. */
export const RESERVED_SUBDOMAINS = [
  'www', 'api', 'login', 'portal', 'app', 'admin', 'desk', 'crm',
  'gestao', 'metricas', 'arquivos', 'mail', 'status', 'static',
  'assets', 'cdn', 'docs', 'help', 'suporte', 'traefik',
] as const;

export const TENANT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type TenantApp = 'application' | 'desk';
export type TenantHostConfig = {
  baseDomain: string;
  publicPort: string;
  secure: boolean;
};

export function isReservedSubdomain(label: string): boolean {
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(label.toLowerCase());
}

export function isValidTenantSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 63 && TENANT_SLUG_PATTERN.test(slug) && !isReservedSubdomain(slug);
}

function splitHost(rawHost: string, config: TenantHostConfig): string | null {
  if (!rawHost || /[^a-zA-Z0-9.:-]/.test(rawHost) || rawHost.includes('..')) return null;
  const normalized = rawHost.toLowerCase().replace(/\.$/, '');
  const match = /^([^:]+)(?::([0-9]+))?$/.exec(normalized);
  if (!match) return null;
  const [, hostname, port] = match;
  if (!hostname || hostname.startsWith('.') || hostname.endsWith('.')) return null;
  if (config.publicPort) {
    if (port !== config.publicPort) return null;
  } else if (port && port !== (config.secure ? '443' : '80')) {
    return null;
  }
  return hostname;
}

function validBase(config: TenantHostConfig): boolean {
  return Boolean(config.baseDomain && config.baseDomain === config.baseDomain.toLowerCase()
    && !config.baseDomain.startsWith('.') && !config.baseDomain.endsWith('.')
    && !config.baseDomain.startsWith('desk.') && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(config.baseDomain));
}

export function parseTenantHost(host: string, config: TenantHostConfig): { slug: string; app: TenantApp } | null {
  if (!validBase(config)) return null;
  const hostname = splitHost(host, config);
  if (!hostname) return null;
  const deskSuffix = `.desk.${config.baseDomain}`;
  if (hostname.endsWith(deskSuffix)) {
    const slug = hostname.slice(0, -deskSuffix.length);
    return isValidTenantSlug(slug) ? { slug, app: 'desk' } : null;
  }
  const appSuffix = `.${config.baseDomain}`;
  if (hostname.endsWith(appSuffix)) {
    const slug = hostname.slice(0, -appSuffix.length);
    return isValidTenantSlug(slug) ? { slug, app: 'application' } : null;
  }
  return null;
}

export function buildTenantOrigin(slug: string, app: TenantApp, config: TenantHostConfig): string {
  if (!isValidTenantSlug(slug) || !validBase(config) || (app !== 'application' && app !== 'desk')) {
    throw new Error('Invalid tenant origin');
  }
  return `${config.secure ? 'https' : 'http'}://${slug}${app === 'desk' ? '.desk' : ''}.${config.baseDomain}${config.publicPort ? `:${config.publicPort}` : ''}`;
}

export function isLoginHost(host: string, config: TenantHostConfig): boolean {
  return validBase(config) && splitHost(host, config) === `login.${config.baseDomain}`;
}

/** This infers the base from a known tenant/login hostname; callers must not use it for authorization. */
export function deriveBaseDomain(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return null;
  const labels = host.split('.');
  if (labels.length < 3 || labels.some((label) => !label)) return null;
  const skip = labels[1] === 'desk' ? 2 : 1;
  return labels.length - skip >= 2 ? labels.slice(skip).join('.') : null;
}

export function buildLoginUrl(config: TenantHostConfig, returnTo?: string): string {
  if (!validBase(config)) throw new Error('Invalid login domain');
  const origin = `${config.secure ? 'https' : 'http'}://login.${config.baseDomain}${config.publicPort ? `:${config.publicPort}` : ''}/`;
  return returnTo ? `${origin}?returnTo=${encodeURIComponent(returnTo)}` : origin;
}

export function parseReturnTo(value: string, config: TenantHostConfig): { slug: string; app: TenantApp; url: string } | null {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== (config.secure ? 'https:' : 'http:') || url.username || url.password) return null;
    const tenant = parseTenantHost(url.host, config);
    return tenant ? { ...tenant, url: url.href } : null;
  } catch {
    return null;
  }
}

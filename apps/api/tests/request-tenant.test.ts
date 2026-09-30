import { describe, expect, it } from 'vitest';
import { resolveRequestTenantSlug } from '../src/request-tenant.js';

const config = { baseDomain: 'pipe.test', publicPort: '', secure: true };

describe('request tenant signal', () => {
  it('reads the original Host, ignoring forwarded host', () => {
    expect(resolveRequestTenantSlug({ host: 'alfa.pipe.test', origin: 'https://beta.pipe.test', ...{ 'x-forwarded-host': 'beta.pipe.test' } }, config)).toBe('alfa');
  });

  it('uses Origin only for the fixed API host', () => {
    expect(resolveRequestTenantSlug({ host: 'api.pipe.test', origin: 'https://beta.pipe.test' }, config)).toBe('beta');
    expect(resolveRequestTenantSlug({ host: 'api.pipe.test', origin: 'https://beta.pipe.test.evil.example' }, config)).toBeNull();
    expect(resolveRequestTenantSlug({ host: 'api.pipe.test' }, config)).toBeNull();
    expect(resolveRequestTenantSlug({ host: 'login.pipe.test', origin: 'https://beta.pipe.test' }, config)).toBeNull();
  });

  it('does nothing while tenant domains are disabled', () => {
    expect(resolveRequestTenantSlug({ host: 'beta.pipe.test' }, null)).toBeNull();
  });
});

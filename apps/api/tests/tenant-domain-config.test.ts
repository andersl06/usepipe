import { describe, expect, it, vi } from 'vitest';
import { assertTenantDomainConfig } from '../src/tenant-domain-config.js';

const valid = {
  PIPE_DOMINIO_CONTAS: 'pipe.test',
  PIPE_COOKIE_DOMINIO: '.pipe.test',
  GOOGLE_URL_RETORNO: 'https://login.pipe.test/v1/auth/google/callback',
} as NodeJS.ProcessEnv;

describe('tenant domain startup configuration', () => {
  it('accepts the matching cookie and login callback', () => {
    expect(() => assertTenantDomainConfig(valid)).not.toThrow();
    expect(() => assertTenantDomainConfig({})).not.toThrow();
  });

  it('rejects a missing or unrelated cookie domain', () => {
    for (const cookie of ['', 'pipe.test', '.other.test']) {
      expect(() => assertTenantDomainConfig({ ...valid, PIPE_COOKIE_DOMINIO: cookie })).toThrow('PIPE_COOKIE_DOMINIO');
    }
  });

  it('requires the login callback in production or with Google credentials', () => {
    const wrong = { ...valid, GOOGLE_URL_RETORNO: 'https://api.pipe.test/v1/auth/google/callback' };
    expect(() => assertTenantDomainConfig({ ...wrong, NODE_ENV: 'production' })).toThrow('GOOGLE_URL_RETORNO');
    expect(() => assertTenantDomainConfig({ ...wrong, GOOGLE_CLIENTE_ID: 'configured' })).toThrow('GOOGLE_URL_RETORNO');
    const warn = vi.fn();
    expect(() => assertTenantDomainConfig(wrong, warn)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('accepts host-only cookies for the local *.localhost mode', () => {
    const warn = vi.fn();
    expect(() => assertTenantDomainConfig({
      PIPE_DOMINIO_CONTAS: 'localhost', PIPE_COOKIE_DOMINIO: '', PIPE_PORTA_PUBLICA: '3110',
      PIPE_COOKIE_SEGURO: 'false', GOOGLE_URL_RETORNO: 'http://localhost:3010/v1/auth/google/callback',
    }, warn)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });
});

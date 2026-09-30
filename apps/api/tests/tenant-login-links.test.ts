import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { cookieDeSaida, cookieOfSession, createChallenge } from '@pipe/authentication';
import { urlOfInvitation } from '../src/domain/convites.js';
import { cookieDoDesafio, optionsOfCookie, redirectToCentralLogin, urlOfError } from '../src/controllers/login.js';
import { asLogin, provisionCustomer } from '../src/provision.js';
import type { ClienteProvisionado } from '../src/provision.js';
import { ssoCallbackUrl } from '../src/domain/sso.js';

const previous = {
  domain: process.env['PIPE_DOMINIO_CONTAS'],
  port: process.env['PIPE_PORTA_PUBLICA'],
  secure: process.env['PIPE_COOKIE_SEGURO'],
  cookieDomain: process.env['PIPE_COOKIE_DOMINIO'],
};

afterEach(() => {
  if (previous.domain === undefined) delete process.env['PIPE_DOMINIO_CONTAS'];
  else process.env['PIPE_DOMINIO_CONTAS'] = previous.domain;
  if (previous.port === undefined) delete process.env['PIPE_PORTA_PUBLICA'];
  else process.env['PIPE_PORTA_PUBLICA'] = previous.port;
  if (previous.secure === undefined) delete process.env['PIPE_COOKIE_SEGURO'];
  else process.env['PIPE_COOKIE_SEGURO'] = previous.secure;
  if (previous.cookieDomain === undefined) delete process.env['PIPE_COOKIE_DOMINIO'];
  else process.env['PIPE_COOKIE_DOMINIO'] = previous.cookieDomain;
});

describe('central login links and reserved slugs', () => {
  it('builds invitations and SSO callback on the login host', () => {
    process.env['PIPE_DOMINIO_CONTAS'] = 'pipe.test';
    delete process.env['PIPE_PORTA_PUBLICA'];
    delete process.env['PIPE_COOKIE_SEGURO'];
    expect(urlOfInvitation('token')).toBe('https://login.pipe.test/invite/token');
    expect(ssoCallbackUrl()).toBe('https://login.pipe.test/v1/auth/sso/callback');
  });

  it('keeps the challenge host-only and shares the session cookie across tenant apps', () => {
    process.env['PIPE_DOMINIO_CONTAS'] = 'pipe.test';
    process.env['PIPE_COOKIE_DOMINIO'] = '.pipe.test';
    process.env['PIPE_COOKIE_SEGURO'] = 'true';
    const challenge = cookieDoDesafio(createChallenge('/application'));
    expect(challenge).toContain('Path=/v1/auth');
    expect(challenge).toContain('HttpOnly');
    expect(challenge).toContain('SameSite=Lax');
    expect(challenge).toContain('Secure');
    expect(challenge).not.toContain('Domain=');
    const session = cookieOfSession('token', new Date(), optionsOfCookie());
    expect(session).toContain('Domain=.pipe.test');
    expect(session).toContain('Path=/');
    expect(cookieDeSaida(optionsOfCookie())).toContain('Domain=.pipe.test');
  });

  it('redirects sign-in and failures through the login host', () => {
    process.env['PIPE_DOMINIO_CONTAS'] = 'pipe.test';
    const redirect = vi.fn();
    const request = { headers: { host: 'alpha.pipe.test' }, query: {
      returnTo: 'https://alpha.pipe.test/application',
    } } as unknown as Request;
    expect(redirectToCentralLogin(request, { redirect } as unknown as Response)).toBe(true);
    expect(redirect).toHaveBeenCalledWith(302, 'https://login.pipe.test/?returnTo=https%3A%2F%2Falpha.pipe.test%2Fapplication');
    expect(urlOfError('falha_no_provedor')).toContain('https://login.pipe.test/login?error=');
  });

  it('rejects system hostnames before accessing the database', async () => {
    for (const slug of ['api', 'login', 'portal', 'www', 'crm', 'desk']) {
      await expect(provisionCustomer({ name: 'Test', slug, plan: 'essencial', admin: 'a@pipe.test' }))
        .rejects.toMatchObject({ codigo: 'reserved_slug' });
    }
  });

  it('shows tenant and login addresses in provisioning output', () => {
    process.env['PIPE_DOMINIO_CONTAS'] = 'pipe.test';
    delete process.env['PIPE_PORTA_PUBLICA'];
    delete process.env['PIPE_COOKIE_SEGURO'];
    const client = {
      tenantId: 'tenant', slug: 'acme', plan: 'essencial', adminId: 'admin',
      adminEmail: 'a@pipe.test', papeis: 0, permissions: 0, queues: 0,
      motivosDePausa: 0, domain: null,
    } as ClienteProvisionado;
    const output = asLogin(client);
    expect(output).toContain('https://acme.pipe.test/application');
    expect(output).toContain('https://acme.desk.pipe.test/');
    expect(output).toContain('https://login.pipe.test/');
  });
});

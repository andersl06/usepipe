import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Database integration suite: write now, run only when the owner permits local DB setup.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_EMAIL_MODO'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_DOMINIO_CONTAS'] = 'pipe.test';
process.env['PIPE_COOKIE_DOMINIO'] = '.pipe.test';
process.env['PIPE_COOKIE_SEGURO'] = 'true';
process.env['GOOGLE_URL_RETORNO'] = 'https://login.pipe.test/v1/auth/google/callback';
process.env['PIPE_ORIGENS'] = 'https://crm.pipe.test';

const { upApi } = await import('../src/servidor.js');
const { createInvitation } = await import('../src/domain/convites.js');
const { SESSION_COOKIE_NAME } = await import('../src/session.js');
const { montarCenario } = await import('./ajuda.js');

type Scenario = Awaited<ReturnType<typeof montarCenario>>;
type Api = Awaited<ReturnType<typeof upApi>>;
let alpha: Scenario;
let beta: Scenario;
let api: Api;
let alphaSlug: string;
let betaSlug: string;
let alphaEmail: string;
let betaEmail: string;

beforeAll(async () => {
  const a = `alfa-${randomUUID().slice(0, 8)}`;
  const b = `beta-${randomUUID().slice(0, 8)}`;
  alpha = await montarCenario(a);
  beta = await montarCenario(b);
  alphaSlug = `e2e-${a}`;
  betaSlug = `e2e-${b}`;
  alphaEmail = `ana-${a}@e2e.pipe.app`;
  betaEmail = `ana-${b}@e2e.pipe.app`;
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await beta?.encerrar();
  await alpha?.encerrar();
});

function request(path: string, host: string, cookie?: string, options: RequestInit = {}) {
  return fetch(`${api.url}${path}`, {
    ...options, redirect: 'manual',
    headers: { host, ...(cookie ? { cookie } : {}), ...options.headers },
  });
}

async function signIn(email: string, returnTo?: string) {
  const params = new URLSearchParams({ email });
  if (returnTo) params.set('returnTo', returnTo);
  const response = await request(`/v1/auth/dev?${params}`, 'login.pipe.test');
  expect(response.status).toBe(302);
  const cookie = response.headers.get('set-cookie') ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  expect(cookie).toMatch(/Domain=\.pipe\.test/i);
  return { cookie: cookie.split(';')[0]!, location: response.headers.get('location') };
}

describe('two-tenant login, use, host switch and sign-out', () => {
  it('keeps every credential scoped across HTTP, WebSocket and invitations', async () => {
    const ownManagement = `${alphaSlug}.pipe.test`;
    const ownDesk = `${alphaSlug}.desk.pipe.test`;
    const otherManagement = `${betaSlug}.pipe.test`;
    const otherDesk = `${betaSlug}.desk.pipe.test`;
    const ownHome = `https://${ownManagement}/application`;

    // a: central sign-in and the shared parent-domain session.
    expect((await request('/v1/eu', ownManagement)).status).toBe(401);
    const signedIn = await signIn(alphaEmail, ownHome);
    expect(signedIn.location).toBe(ownHome);

    // b: the same user reaches both of their own front-end hosts.
    for (const host of [ownManagement, ownDesk]) {
      const response = await request('/v1/eu', host, signedIn.cookie);
      expect(response.status).toBe(200);
      const body = await response.json() as { user: { id: string }; tenant: { slug: string } };
      expect(body.user.id).toBe(alpha.agentId);
      expect(body.tenant.slug).toBe(alphaSlug);
    }

    // c: changing either host cannot borrow the other tenant's data.
    for (const host of [otherManagement, otherDesk]) {
      const response = await request('/v1/eu', host, signedIn.cookie);
      expect(response.status).toBe(403);
      const body = await response.text();
      expect(body).toContain('tenant_mismatch');
      expect(body).not.toContain(betaSlug);
      expect(body).not.toContain(alphaEmail);
    }

    // d: reject a write before a tenant query or mutation can run.
    const count = async () => Number((await beta.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from convite where tenant_id = ${beta.tenantId}::uuid
    `)).rows[0]?.n ?? '0');
    const before = await count();
    const write = await request('/v1/convites', otherManagement, signedIn.cookie, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'intruso@exemplo.test', role: 'member' }),
    });
    expect(write.status).toBe(403);
    expect(await count()).toBe(before);

    // e: the WebSocket upgrade enforces the same host boundary.
    const wsUrl = `${api.url.replace('http://', 'ws://')}/v1/eventos`;
    const wrong = new WebSocket(wsUrl, { headers: {
      host: otherDesk, origin: `https://${otherDesk}`, cookie: signedIn.cookie,
    } });
    const error = await new Promise<Error>((resolve) => wrong.once('error', resolve));
    expect(error.message).toContain('403');
    const own = new WebSocket(wsUrl, { headers: {
      host: ownDesk, origin: `https://${ownDesk}`, cookie: signedIn.cookie,
    } });
    await new Promise<void>((resolve, reject) => { own.once('open', resolve); own.once('error', reject); });
    own.close();

    // f: invitations use central login and acceptance remains in the right tenant.
    const invite = await createInvitation(alpha.tenantId, {
      email: 'convidado-alfa@exemplo.test', role: 'member', criadoPor: alpha.agentId,
    });
    expect(invite.url).toBe(`https://login.pipe.test/invite/${invite.token}`);
    const accepted = await request(`/v1/convites/${invite.token}/aceitar`, 'login.pipe.test', undefined, { method: 'POST' });
    expect(accepted.status).toBe(200);
    expect((await signIn('convidado-alfa@exemplo.test')).location).toBe(ownHome);

    // g: a returnTo pointing at alfa cannot send a beta session into alfa.
    const betaSession = await signIn(betaEmail, ownHome);
    expect(betaSession.location).toBe(`https://${otherManagement}/application?deniedTenant=${alphaSlug}`);
    expect((await request('/v1/eu', ownManagement, betaSession.cookie)).status).toBe(403);
    const betaMe = await request('/v1/eu', 'login.pipe.test', betaSession.cookie);
    expect(betaMe.status).toBe(200);
    expect(((await betaMe.json()) as { tenant: { slug: string } }).tenant.slug).toBe(betaSlug);

    // h: logout clears the shared cookie and invalidates the old session token.
    const logout = await request('/v1/auth/sair', ownDesk, signedIn.cookie, { method: 'POST' });
    expect(logout.status).toBe(204);
    expect(logout.headers.get('set-cookie')).toMatch(/Domain=\.pipe\.test/i);
    expect((await request('/v1/eu', ownManagement, signedIn.cookie)).status).toBe(401);
  }, 180_000);
});

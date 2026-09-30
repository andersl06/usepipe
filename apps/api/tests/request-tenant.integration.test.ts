import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestWithHost, setTenantHostEnv } from './tenant-host-helper.js';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
setTenantHostEnv({ secure: false, origins: 'http://crm.pipe.test' });

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { destinationForTenant } = await import('../src/controllers/login.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type Api = Awaited<ReturnType<typeof upApi>>;
let alpha: Cenario;
let beta: Cenario;
let api: Api;
let token: string;
let alphaSlug: string;
let betaSlug: string;

beforeAll(async () => {
  const a = randomUUID().slice(0, 8);
  const b = randomUUID().slice(0, 8);
  alpha = await montarCenario(a);
  beta = await montarCenario(b);
  alphaSlug = `e2e-${a}`;
  betaSlug = `e2e-${b}`;
  const issued = createToken();
  token = issued.token;
  await alpha.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${alpha.tenantId}, ${alpha.agentId}, ${issued.hash}, ${issued.expiraEm}, 'google')
  `);
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await beta?.encerrar();
  await alpha?.encerrar();
});

async function get(path: string, host: string, credential: 'session' | 'key' | 'none', origin?: string) {
  const headers: Record<string, string> = {};
  if (origin) headers['origin'] = origin;
  if (credential === 'session') headers['cookie'] = `${SESSION_COOKIE_NAME}=${token}`;
  if (credential === 'key') headers['authorization'] = `Bearer ${alpha.token}`;
  return requestWithHost(`${api.url}${path}`, host, { headers });
}

describe('tenant host against authenticated credential', () => {
  it('returns to the authenticated tenant and records only a denied slug', async () => {
    const own = `http://${alphaSlug}.pipe.test/application/x`;
    expect(await destinationForTenant(alpha.tenantId, own)).toBe(own);
    expect(await destinationForTenant(alpha.tenantId, `http://${betaSlug}.pipe.test/`))
      .toBe(`http://${alphaSlug}.pipe.test/application?deniedTenant=${betaSlug}`);
    expect(await destinationForTenant(alpha.tenantId, 'https://evil.example/'))
      .toBe(`http://${alphaSlug}.pipe.test/application`);
  });
  it('accepts the own application and desk hosts', async () => {
    expect((await get('/v1/eu', `${alphaSlug}.pipe.test`, 'session')).status).toBe(200);
    expect((await get('/v1/eu', `${alphaSlug}.desk.pipe.test`, 'session')).status).toBe(200);
  });

  it('returns the same 403 for another and nonexistent tenant', async () => {
    const other = await get('/v1/eu', `${betaSlug}.pipe.test`, 'session');
    const missing = await get('/v1/eu', 'nonexistent.pipe.test', 'session');
    expect(other.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(await other.text()).toBe(await missing.text());
  });

  it('uses Origin on the API host and leaves the login host session-only', async () => {
    expect((await get('/v1/eu', 'api.pipe.test', 'session', `http://${betaSlug}.pipe.test`)).status).toBe(403);
    expect((await get('/v1/eu', 'api.pipe.test', 'session')).status).toBe(200);
    expect((await get('/v1/eu', 'login.pipe.test', 'session')).status).toBe(200);
    expect((await get('/v1/eu', `${betaSlug}.pipe.test`, 'none')).status).toBe(401);
  });

  it('checks API keys in their guard too', async () => {
    expect((await get('/v1/queues', `${betaSlug}.pipe.test`, 'key')).status).toBe(403);
    expect((await get('/v1/queues', 'api.pipe.test', 'key')).status).toBe(200);
  });
});

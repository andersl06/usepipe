import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { loadFlowFunctions } = await import('../src/domain/management/flow-functions.js');
const { runFlowScript } = await import('../src/domain/script-sandbox.js');
const { montarCenario } = await import('./ajuda.js');

type Scenario = Awaited<ReturnType<typeof montarCenario>>;
type Body = Record<string, any>;
let scenario: Scenario;
let api: Awaited<ReturnType<typeof upApi>>;
let allowedCookie: string;
let deniedCookie: string;
let otherCookie: string;

async function userWithPermission(cenario: Scenario, permission?: string): Promise<string> {
  const mark = randomUUID().slice(0, 8);
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email) values (${cenario.tenantId}, ${`Função ${mark}`}, ${`func-${mark}@e2e.pipe.app`}) returning id
  `);
  if (!permission) return users[0]!.id;
  const { rows: roles } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo) values (${cenario.tenantId}, ${`Papel ${mark}`}, 'atendimento') returning id
  `);
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id) values (${cenario.tenantId}, ${users[0]!.id}, ${roles[0]!.id})
  `);
  await cenario.dono.execute(sql`
    insert into papel_permissao (tenant_id, papel_id, permissao_codigo) values (${cenario.tenantId}, ${roles[0]!.id}, ${permission})
  `);
  return users[0]!.id;
}

async function cookie(cenario: Scenario, userId: string): Promise<string> {
  const token = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem) values (${cenario.tenantId}, ${userId}, ${token.hash}, ${token.expiraEm}, 'google')
  `);
  return `${SESSION_COOKIE_NAME}=${token.token}`;
}

async function request(method: string, path: string, body?: unknown, cookieValue?: string): Promise<{ status: number; body: Body }> {
  const response = await fetch(`${api.url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookieValue ? { cookie: cookieValue } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Body : {} };
}

const definition = {
  name: 'greet',
  description: 'Saudação',
  parameters: ['name'],
  code: 'function greet(name) { return { text: "Olá " + name }; }',
};

beforeAll(async () => {
  scenario = await montarCenario(`functions-${Date.now()}`);
  api = await upApi(0);
  allowedCookie = await cookie(scenario, await userWithPermission(scenario, 'automacao.fluxo.editar'));
  deniedCookie = await cookie(scenario, await userWithPermission(scenario));
  const other = await montarCenario(`functions-other-${Date.now()}`);
  otherCookie = await cookie(other, await userWithPermission(other, 'automacao.fluxo.editar'));
  // Keep the second tenant alive through the test and clean it in afterAll.
  (scenario as Scenario & { other?: Scenario }).other = other;
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await scenario?.encerrar();
  await (scenario as Scenario & { other?: Scenario })?.other?.encerrar();
});

describe('flow function library', () => {
  it('requires a session and the builder permission', async () => {
    expect((await request('GET', '/v1/management/flow-functions')).status).toBe(401);
    expect((await request('GET', '/v1/management/flow-functions', undefined, deniedCookie)).status).toBe(403);
  });

  it('creates, lists, updates with a version, and rejects duplicates', async () => {
    const created = await request('POST', '/v1/management/flow-functions', definition, allowedCookie);
    expect(created.status).toBe(201);
    expect(created.body['version']).toBe(1);
    const duplicate = await request('POST', '/v1/management/flow-functions', definition, allowedCookie);
    expect(duplicate.status).toBe(409);
    const listed = await request('GET', '/v1/management/flow-functions?search=sauda', undefined, allowedCookie);
    expect(listed.status).toBe(200);
    expect((listed.body as unknown as Body[])).toHaveLength(1);
    const updated = await request('PUT', `/v1/management/flow-functions/${created.body['id']}`, { ...definition, code: 'function greet(name) { return "Oi " + name; }' }, allowedCookie);
    expect(updated.status).toBe(200);
    expect(updated.body['version']).toBe(2);
  });

  it('does not reveal a function to another tenant and runs it through the sandbox', async () => {
    const listed = await request('GET', '/v1/management/flow-functions', undefined, otherCookie);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([]);
    const { rows } = await scenario.dono.execute<{ id: string; fluxo_id: string | null }>(sql`select id, fluxo_id from funcao_do_fluxo where nome = 'greet' limit 1`);
    const loaded = await noTenant(scenario.tenantId, (tx) => loadFlowFunctions(tx, rows[0]!.fluxo_id ?? scenario.channelId));
    const functionRow = [...loaded.values()][0]!;
    const result = await runFlowScript({ version: 2, source: functionRow.code, functionName: functionRow.name, args: ['Ana'], timeoutMs: 10_000, localTimeZone: false });
    expect(result).toBe('Oi Ana');
  });
});

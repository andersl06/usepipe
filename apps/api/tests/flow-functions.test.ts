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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const loaded = await noTenant(scenario.tenantId, (tx) => loadFlowFunctions(tx));
    const functionRow = [...loaded.values()].find((fn) => fn.name === 'greet')!;
    const result = await runFlowScript({ version: 2, source: functionRow.code, functionName: functionRow.name, args: ['Ana'], timeoutMs: 10_000, localTimeZone: false });
    expect(result).toBe('Oi Ana');
  });
});

/** P10 / D-57: one library per account, referenced by UUID, with the flows that use each function. */
describe('tenant function library', () => {
  const BLIP_ID = randomUUID();

  async function flowWithDraft(name: string, content: { block?: unknown; global?: unknown; state?: string; archived?: boolean }): Promise<string> {
    const shortName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 6)}`;
    const { rows: flows } = await scenario.dono.execute<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, tipo, estado, short_name)
      values (${scenario.tenantId}, ${name}, 'fluxo', ${content.archived ? 'arquivado' : 'rascunho'}, ${shortName}) returning id
    `);
    const { rows: versions } = await scenario.dono.execute<{ id: string }>(sql`
      insert into fluxo_versao (tenant_id, fluxo_id, versao, estado, global)
      values (${scenario.tenantId}, ${flows[0]!.id}, 1, ${content.state ?? 'rascunho'}, ${JSON.stringify(content.global ?? {})}::jsonb) returning id
    `);
    await scenario.dono.execute(sql`
      insert into bloco (tenant_id, versao_id, codigo, nome, tipo, conteudo)
      values (${scenario.tenantId}, ${versions[0]!.id}, 'b1', 'Início', 'mensagem', ${JSON.stringify(content.block ?? {})}::jsonb)
    `);
    return flows[0]!.id;
  }

  it('keeps a Blip function UUID on create and rejects a bad or repeated one', async () => {
    const created = await request('POST', '/v1/management/flow-functions', {
      id: BLIP_ID.toUpperCase(), name: 'validarOpcao', parameters: ['entrada'], code: 'function validarOpcao(entrada) { return entrada === "1"; }',
    }, allowedCookie);
    expect(created.status).toBe(201);
    expect(created.body['id']).toBe(BLIP_ID);
    expect((await request('POST', '/v1/management/flow-functions', { ...definition, name: 'outra', id: 'nao-e-uuid' }, allowedCookie)).status).toBe(400);
    const repeated = await request('POST', '/v1/management/flow-functions', { ...definition, name: 'outra', id: BLIP_ID }, allowedCookie);
    expect(repeated.status).toBe(409);
  });

  it('loads the whole tenant library for any flow', async () => {
    const one = await flowWithDraft('Um', {});
    const other = await flowWithDraft('Outro', {});
    const forOne = await noTenant(scenario.tenantId, (tx) => loadFlowFunctions(tx, one));
    const forOther = await noTenant(scenario.tenantId, (tx) => loadFlowFunctions(tx, other));
    expect([...forOne.keys()].sort()).toEqual([...forOther.keys()].sort());
    expect(forOne.get(BLIP_ID)?.name).toBe('validarOpcao');
    expect([...forOne.values()].map((fn) => fn.name)).toContain('greet');
  });

  it('lists the flows that use a function by id or by name, skipping archived ones', async () => {
    const byId = await flowWithDraft('Atendimento', {
      block: { $enteringCustomActions: [{ type: 'ExecuteBlipFunction', settings: { source: BLIP_ID, inputVariables: ['input.content'], outputVariable: 'ok' } }] },
    });
    const byName = await flowWithDraft('Cobrança', {
      state: 'publicada',
      global: { enteringCustomActions: [{ type: 'ExecuteScriptV2', settings: { source: 'function run(x) {\n  return validarOpcao(x);\n}', function: 'run' } }] },
    });
    await flowWithDraft('Arquivado', { archived: true, block: { $enteringCustomActions: [{ type: 'ExecuteBlipFunction', settings: { source: BLIP_ID } }] } });
    await flowWithDraft('Sem uso', { block: { $enteringCustomActions: [{ type: 'ExecuteScriptV2', settings: { source: 'function run() { return x.validarOpcao(1); }' } }] } });

    const usage = await request('GET', `/v1/management/flow-functions/${BLIP_ID}/usage`, undefined, allowedCookie);
    expect(usage.status).toBe(200);
    const flows = usage.body as unknown as { flowId: string; flowName: string; shortName: string }[];
    expect(flows.map((f) => f.flowId).sort()).toEqual([byId, byName].sort());
    expect(flows.map((f) => f.flowName).sort()).toEqual(['Atendimento', 'Cobrança']);

    expect((await request('GET', `/v1/management/flow-functions/${BLIP_ID}/usage`, undefined, otherCookie)).status).toBe(404);
    expect((await request('GET', `/v1/management/flow-functions/${BLIP_ID}/usage`, undefined, deniedCookie)).status).toBe(403);
  });

  it('rejects a second function with the same name anywhere in the tenant', async () => {
    const duplicate = await request('POST', '/v1/management/flow-functions', { ...definition, name: 'validarOpcao' }, allowedCookie);
    expect(duplicate.status).toBe(409);
  });
});

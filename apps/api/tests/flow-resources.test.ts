import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { loadFlowResources } = await import('../src/domain/management/flow-resources.js');
const { montarCenario } = await import('./ajuda.js');

/**
 * `GET/POST/PUT/DELETE /v1/management/flows/:id/resources` (`dominio/gestao/flow-resources.ts`),
 * the store the builder's `{{resource.<name>}}` reads through the engine's `resource` provider
 * (`@pipe/core/flow/context.ts`). Permission mirrors `configuration-of-flow.test.ts`: the flow
 * resource `resources` maps to the account permission `automacao.fluxo.editar`
 * (`team-of-flow.ts`'s `EQUIVALENT_IN_ACCOUNT`).
 */

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let sessionEditor: string;
let sessionWithoutAuthority: string;
let sessionOfOtherTenant: string;

async function pessoaCom(cenario: Cenario, permissions: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const userId = users[0]!.id;
  if (permissions.length === 0) return userId;
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  for (const codigo of permissions) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papeis[0]!.id}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${userId}, ${papeis[0]!.id})
  `);
  return userId;
}

async function openSession(cenario: Cenario, userId: string): Promise<string> {
  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

async function newFlow(cenario: Cenario): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, short_name)
    values (${cenario.tenantId}, ${`fluxo ${marca}`}, 'fluxo', 'rascunho', ${`fluxo-${marca}`})
    returning id
  `);
  return rows[0]!.id;
}

async function chamar(
  session: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/management/flows/${caminho}`, {
    method: metodo,
    headers: comCookie(session),
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} };
}

beforeAll(async () => {
  a = await montarCenario(`fr-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`fr-${randomUUID().slice(0, 8)}`);

  const editor = await pessoaCom(a, ['automacao.fluxo.editar']);
  const semPoder = await pessoaCom(a, []);
  const editorDoB = await pessoaCom(b, ['automacao.fluxo.editar']);

  api = await upApi(0);
  sessionEditor = await openSession(a, editor);
  sessionWithoutAuthority = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, editorDoB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('GET/POST/PUT/DELETE /v1/management/flows/:id/resources', () => {
  it('starts empty and creates a text/plain resource', async () => {
    const id = await newFlow(a);
    const empty = await chamar(sessionEditor, 'GET', `${id}/resources`);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);

    const created = await chamar(sessionEditor, 'POST', `${id}/resources`, {
      name: 'TimeZoneAttendance',
      type: 'text/plain',
      value: 'America/Sao_Paulo',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'TimeZoneAttendance', type: 'text/plain', value: 'America/Sao_Paulo' });

    const listed = await chamar(sessionEditor, 'GET', `${id}/resources`);
    expect(listed.body).toHaveLength(1);
  });

  it('accepts an application/json resource and validates the value is JSON', async () => {
    const id = await newFlow(a);
    const invalid = await chamar(sessionEditor, 'POST', `${id}/resources`, {
      name: 'objectResources',
      type: 'application/json',
      value: '{not json}',
    });
    expect(invalid.status).toBe(400);

    const valid = await chamar(sessionEditor, 'POST', `${id}/resources`, {
      name: 'objectResources',
      type: 'application/json',
      value: '{"foo":"bar"}',
    });
    expect(valid.status).toBe(201);
  });

  it('rejects a name the engine could never parse back (hyphen, space, emoji)', async () => {
    const id = await newFlow(a);
    for (const name of ['my-resource', 'my resource', 'chave🙂']) {
      const result = await chamar(sessionEditor, 'POST', `${id}/resources`, {
        name, type: 'text/plain', value: 'x',
      });
      expect(result.status).toBe(400);
    }
  });

  it('rejects a duplicate name in the same flow and updates/deletes by id', async () => {
    const id = await newFlow(a);
    const created = await chamar(sessionEditor, 'POST', `${id}/resources`, {
      name: 'simpleResources', type: 'text/plain', value: 'v1',
    });
    expect(created.status).toBe(201);

    const duplicate = await chamar(sessionEditor, 'POST', `${id}/resources`, {
      name: 'simpleResources', type: 'text/plain', value: 'v2',
    });
    expect(duplicate.status).toBe(409);

    const resourceId = created.body['id'] as string;
    const updated = await chamar(sessionEditor, 'PUT', `${id}/resources/${resourceId}`, {
      name: 'simpleResources', type: 'text/plain', value: 'v3',
    });
    expect(updated.status).toBe(200);
    expect(updated.body['value']).toBe('v3');

    const deleted = await chamar(sessionEditor, 'DELETE', `${id}/resources/${resourceId}`);
    expect(deleted.status).toBe(204);
    const afterDelete = await chamar(sessionEditor, 'GET', `${id}/resources`);
    expect(afterDelete.body).toEqual([]);
  });

  it('requires the account/flow permission and never reveals another tenant\'s flow', async () => {
    const id = await newFlow(a);
    const denied = await chamar(sessionWithoutAuthority, 'POST', `${id}/resources`, {
      name: 'x', type: 'text/plain', value: 'y',
    });
    expect(denied.status).toBe(403);

    const outroTenant = await chamar(sessionOfOtherTenant, 'GET', `${id}/resources`);
    expect(outroTenant.status).toBe(404);
  });

  it('feeds the engine\'s Context.resources map through loadFlowResources', async () => {
    const id = await newFlow(a);
    await chamar(sessionEditor, 'POST', `${id}/resources`, {
      name: 'createMenuFunction', type: 'text/plain', value: 'function run(){return 1;}',
    });
    const loaded = await noTenant(a.tenantId, (tx) => loadFlowResources(tx, id));
    expect(loaded).toEqual({ createMenuFunction: 'function run(){return 1;}' });
  });
});

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 41).toString('base64')}`;

const { createToken } = await import('@pipe/authentication');
const { keyringOfEnvironment } = await import('@pipe/db');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { loadFlowSecret, openHttpRequest, sealHttpRequest } = await import(
  '../src/domain/management/flow-secrets.js'
);
const { montarCenario } = await import('./ajuda.js');

/**
 * P11 — Builder "Variáveis sensíveis": `GET/POST/PUT/DELETE /v1/management/flows/:id/secrets`
 * (`domain/management/flow-secrets.ts`, migration 0055). Worth proving: the value is write-only
 * (no response or list carries it), it is stored as a keyring envelope and never in plaintext
 * (neither in `variavel_secreta_do_fluxo` nor in `log_auditoria`), the flow permission and tenant
 * isolation hold, `loadFlowSecret` decrypts for the engine, and in the Builder test run a secret
 * reads empty outside an HTTP action and never appears in the debug output. Every value is invented.
 */

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

const TOKEN = 'tokinvented7781secret';

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

async function pedir(
  session: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<{ status: number; body: Corpo; text: string }> {
  const resposta = await fetch(`${api.url}/v1/management/flows/${caminho}`, {
    method: metodo,
    headers: { cookie: `${NOME_DO_COOKIE}=${session}`, 'content-type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const text = await resposta.text();
  return { status: resposta.status, body: text ? (JSON.parse(text) as Corpo) : {}, text };
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

async function storedRows(flowId: string): Promise<{ nome: string; valor_cifrado: string }[]> {
  const { rows } = await a.dono.execute<{ nome: string; valor_cifrado: string }>(sql`
    select nome, valor_cifrado from variavel_secreta_do_fluxo where fluxo_id = ${flowId}::uuid order by nome
  `);
  return rows;
}

beforeAll(async () => {
  a = await montarCenario(`fs-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`fs-${randomUUID().slice(0, 8)}`);
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

describe('GET/POST/PUT/DELETE /v1/management/flows/:id/secrets', () => {
  it('creates a secret without ever returning its value, and stores only a keyring envelope', async () => {
    const id = await newFlow(a);
    const empty = await pedir(sessionEditor, 'GET', `${id}/secrets`);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);

    const created = await pedir(sessionEditor, 'POST', `${id}/secrets`, { name: 'apiToken', value: TOKEN });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'apiToken', flowId: id });
    expect(created.body['value']).toBeUndefined();
    expect(created.text).not.toContain(TOKEN);

    const listed = await pedir(sessionEditor, 'GET', `${id}/secrets`);
    expect(listed.body).toHaveLength(1);
    expect(listed.text).not.toContain(TOKEN);
    expect(listed.text).not.toContain('pipev1');

    const rows = await storedRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.valor_cifrado.startsWith('pipev1.')).toBe(true);
    expect(rows[0]!.valor_cifrado).not.toContain(TOKEN);

    const { rows: audit } = await a.dono.execute<{ depois: unknown }>(sql`
      select depois from log_auditoria
       where objeto_tipo = 'variavel_secreta_do_fluxo' and objeto_id = ${created.body['id'] as string}::uuid
    `);
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain(TOKEN);
  });

  it('feeds the engine through loadFlowSecret (decrypted) and returns null for an unknown name', async () => {
    const id = await newFlow(a);
    await pedir(sessionEditor, 'POST', `${id}/secrets`, { name: 'clientSecret', value: 'invented-client-secret' });
    const value = await noTenant(a.tenantId, (tx) => loadFlowSecret(tx, id, 'clientSecret'));
    expect(value).toBe('invented-client-secret');
    const missing = await noTenant(a.tenantId, (tx) => loadFlowSecret(tx, id, 'nope'));
    expect(missing).toBeNull();
  });

  it('validates name and value, rejects a duplicate name, and updates name + value together', async () => {
    const id = await newFlow(a);
    for (const name of ['my-token', 'my token', 'chave🙂', '']) {
      const bad = await pedir(sessionEditor, 'POST', `${id}/secrets`, { name, value: 'x-invented' });
      expect(bad.status).toBe(400);
    }
    const noValue = await pedir(sessionEditor, 'POST', `${id}/secrets`, { name: 'semValor', value: '  ' });
    expect(noValue.status).toBe(400);

    const created = await pedir(sessionEditor, 'POST', `${id}/secrets`, { name: 'token', value: 'v1-invented' });
    expect(created.status).toBe(201);
    const duplicate = await pedir(sessionEditor, 'POST', `${id}/secrets`, { name: 'token', value: 'v2-invented' });
    expect(duplicate.status).toBe(409);

    const secretId = created.body['id'] as string;
    const before = (await storedRows(id))[0]!.valor_cifrado;
    const updated = await pedir(sessionEditor, 'PUT', `${id}/secrets/${secretId}`, {
      name: 'tokenNovo',
      value: 'v3-invented',
    });
    expect(updated.status).toBe(200);
    expect(updated.body['name']).toBe('tokenNovo');
    expect(updated.text).not.toContain('v3-invented');
    const after = (await storedRows(id))[0]!;
    expect(after.nome).toBe('tokenNovo');
    expect(after.valor_cifrado).not.toBe(before);
    expect(await noTenant(a.tenantId, (tx) => loadFlowSecret(tx, id, 'tokenNovo'))).toBe('v3-invented');

    const withoutValue = await pedir(sessionEditor, 'PUT', `${id}/secrets/${secretId}`, { name: 'tokenNovo' });
    expect(withoutValue.status).toBe(400);

    const deleted = await pedir(sessionEditor, 'DELETE', `${id}/secrets/${secretId}`);
    expect(deleted.status).toBe(204);
    expect(await storedRows(id)).toEqual([]);
  });

  it('requires the flow permission and never reveals another tenant\'s flow', async () => {
    const id = await newFlow(a);
    const denied = await pedir(sessionWithoutAuthority, 'POST', `${id}/secrets`, { name: 'x', value: 'y-invented' });
    expect(denied.status).toBe(403);
    const deniedList = await pedir(sessionWithoutAuthority, 'GET', `${id}/secrets`);
    expect(deniedList.status).toBe(403);
    const otherTenant = await pedir(sessionOfOtherTenant, 'GET', `${id}/secrets`);
    expect(otherTenant.status).toBe(404);
  });
});

describe('secret in the Builder test run', () => {
  it('reads empty outside an HTTP action and never appears in the test run output', async () => {
    const { status, body } = await fetch(`${api.url}/v1/management/flows`, {
      method: 'POST',
      headers: { cookie: `${NOME_DO_COOKIE}=${sessionEditor}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        recados: {
          tamanho: 'recado: tamanho',
          comecoInvalido: 'recado: começo',
          nomeEmUso: 'recado: em uso',
          withoutPermission: 'recado: sem permissão',
        },
        name: `segredos ${randomUUID().slice(0, 8)}`,
        type: 'fluxo',
      }),
    }).then(async (r) => ({ status: r.status, body: (await r.json()) as Corpo }));
    expect(status).toBe(200);
    const id = body['id'] as string;

    await pedir(sessionEditor, 'POST', `${id}/secrets`, { name: 'apiToken', value: TOKEN });
    const saved = await pedir(sessionEditor, 'PUT', `${id}/builder`, {
      flow: {
        inicio: {
          id: 'inicio',
          root: true,
          $title: 'Início',
          $position: { top: '40px', left: '40px' },
          $contentActions: [
            {
              action: {
                type: 'SendMessage',
                settings: { type: 'text/plain', content: 'segredo=[{{secret.apiToken}}]' },
              },
            },
            { input: { bypass: false } },
          ],
          $conditionOutputs: [],
          $enteringCustomActions: [],
          $leavingCustomActions: [],
          $defaultOutput: { stateId: 'inicio' },
        },
      },
      globals: {
        $enteringCustomActions: [
          {
            type: 'ProcessHttp',
            continueOnError: true,
            settings: {
              method: 'GET',
              // `.invalid` never resolves: the network error must not leak the secret.
              uri: 'https://{{secret.apiToken}}.invalid/v1?key={{secret.apiToken}}',
              headers: { Authorization: 'Bearer {{secret.apiToken}}' },
              responseStatusVariable: 'httpStatus',
              responseBodyVariable: 'httpBody',
            },
          },
          {
            type: 'SetVariable',
            settings: { variable: 'copia', value: '{{secret.apiToken}}' },
          },
        ],
      },
    });
    expect(saved.status).toBe(200);

    const run = await pedir(sessionEditor, 'POST', `${id}/builder/test-runs`, { input: 'oi' });
    expect(run.status).toBe(200);
    expect(run.text).not.toContain(TOKEN);
    const variables = run.body['debug']['variables'] as Record<string, string>;
    expect(variables['copia']).toBe('');
    expect(variables['httpStatus']).toMatch(/^50[34]$/);
    const texts = JSON.stringify(run.body['messages']);
    expect(texts).not.toContain(TOKEN);
  });
});

describe('suspended ProcessHttp storage', () => {
  it('encrypts a request that carries a secret and leaves the others as they are', () => {
    const chaves = () => keyringOfEnvironment();
    const plain = { metodo: 'GET' as const, url: 'https://api.example.test/', cabecalhos: {}, timeoutMs: 1000 };
    expect(sealHttpRequest(plain, chaves)).toEqual(plain);

    const sensitive = {
      ...plain,
      cabecalhos: { Authorization: `Bearer ${TOKEN}` },
      sensivel: true,
    };
    const sealed = sealHttpRequest(sensitive, chaves);
    expect(JSON.stringify(sealed)).not.toContain(TOKEN);
    expect(openHttpRequest(sealed, chaves)).toEqual(sensitive);
    expect(openHttpRequest(plain, chaves)).toEqual(plain);
  });
});

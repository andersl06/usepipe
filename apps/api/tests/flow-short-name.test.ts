import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// // The mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * D-52: name collision moves from `nome` to `nomeCurto(nome)` between live flows, and
 * `GET /v1/management/flows/short-name/:shortName` resolves a flow the same way `GET :id` does,
 * scoped to the session's tenant and to live flows only.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let sessionEditor: string;
let sessionAdmin: string;
let sessionWithoutAuthority: string;
let sessionOfOtherTenant: string;

const RECADOS = {
  tamanho: 'recado: tamanho',
  comecoInvalido: 'recado: começo',
  nomeEmUso: 'recado: em uso',
  withoutPermission: 'recado: sem permissão',
};

async function pessoaCom(cenario: Cenario, permissions: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const userId = users[0]!.id;
  if (permissions.length === 0) return userId;

  for (const codigo of permissions) {
    await cenario.dono.execute(sql`
      insert into permissao (codigo, descricao, grupo)
      values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
    `);
  }
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  const roleId = papeis[0]!.id;
  for (const codigo of permissions) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${roleId}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${userId}, ${roleId})
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

type ResponseOfCreation = { id?: string; error?: string };

async function create(
  session: string,
  corpo: Record<string, unknown>,
): Promise<{ status: number; body: ResponseOfCreation }> {
  const resposta = await fetch(`${api.url}/v1/management/flows`, {
    method: 'POST',
    headers: comCookie(session),
    body: JSON.stringify({ recados: RECADOS, type: 'fluxo', ...corpo }),
  });
  return { status: resposta.status, body: (await resposta.json()) as ResponseOfCreation };
}

async function criado(nome: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { status, body } = await create(sessionEditor, { name: nome, ...extra });
  expect(status).toBe(200);
  expect(body.error).toBeUndefined();
  return body.id!;
}

async function editar(sessao: string, id: string, corpo: Record<string, unknown>) {
  const resposta = await fetch(`${api.url}/v1/management/flows/${id}`, {
    method: 'PATCH',
    headers: comCookie(sessao),
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function excluir(sessao: string, id: string): Promise<Response> {
  return fetch(`${api.url}/v1/management/flows/${id}`, {
    method: 'DELETE',
    headers: comCookie(sessao),
  });
}

async function byId(sessao: string, id: string) {
  const resposta = await fetch(`${api.url}/v1/management/flows/${id}`, {
    headers: comCookie(sessao),
  });
  return { status: resposta.status, body: (await resposta.json()) as Record<string, unknown> };
}

async function byShortName(sessao: string, shortName: string) {
  const resposta = await fetch(
    `${api.url}/v1/management/flows/short-name/${encodeURIComponent(shortName)}`,
    { headers: comCookie(sessao) },
  );
  return { status: resposta.status, body: (await resposta.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  a = await montarCenario(`fsn-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`fsn-${randomUUID().slice(0, 8)}`);

  const editor = await pessoaCom(a, ['automacao.fluxo.editar']);
  const admin = await pessoaCom(a, ['automacao.fluxo.editar', 'automacao.fluxo.excluir']);
  const semPoder = await pessoaCom(a, []);
  const adminDoB = await pessoaCom(b, ['automacao.fluxo.editar', 'automacao.fluxo.excluir']);

  api = await upApi(0);
  sessionEditor = await openSession(a, editor);
  sessionAdmin = await openSession(a, admin);
  sessionWithoutAuthority = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, adminDoB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('POST /v1/management/flows — collision by nomeCurto', () => {
  it('rejects a name whose nomeCurto collides with a live flow, even when the exact name differs', async () => {
    const marca = randomUUID().slice(0, 6);
    await criado(`Meu Bot ${marca}`);

    const colidiu = await create(sessionEditor, { name: `meu-bot ${marca}` });
    expect(colidiu.body).toEqual({ error: RECADOS.nomeEmUso });
  });

  it('allows a name whose nomeCurto matches an ARCHIVED flow', async () => {
    const marca = randomUUID().slice(0, 6);
    const id = await criado(`Velho Bot ${marca}`);
    expect((await excluir(sessionAdmin, id)).status).toBe(204);

    const criadoDeNovo = await create(sessionEditor, { name: `velho-bot ${marca}` });
    expect(criadoDeNovo.status).toBe(200);
    expect(criadoDeNovo.body.error).toBeUndefined();
  });
});

describe('PATCH /v1/management/flows/:id — collision by nomeCurto', () => {
  it('rejects a rename whose nomeCurto collides with another live flow', async () => {
    const marca = randomUUID().slice(0, 6);
    const id = await criado(`Um ${marca}`);
    await criado(`dois-${marca}`);

    const emUso = await editar(sessionEditor, id, { name: `Dois ${marca}` });
    expect(emUso.status).toBe(409);
    expect((emUso.corpo['error'] as { code: string }).code).toBe('name_in_use');
  });

  it('allows renaming to a case variant of its own name, updating shortName', async () => {
    const marca = randomUUID().slice(0, 6);
    const id = await criado(`minusculo ${marca}`);

    const renomeado = await editar(sessionEditor, id, { name: `MINUSCULO ${marca}` });
    expect(renomeado.status).toBe(200);
    expect(renomeado.corpo['shortName']).toBe(`minusculo-${marca}`);
  });
});

describe('GET /v1/management/flows/short-name/:shortName', () => {
  it('returns the same body as GET :id for a live flow in the session tenant', async () => {
    const marca = randomUUID().slice(0, 6);
    const id = await criado(`Resolvivel ${marca}`);

    const porId = await byId(sessionEditor, id);
    expect(porId.status).toBe(200);

    const porShortName = await byShortName(sessionEditor, `resolvivel-${marca}`);
    expect(porShortName.status).toBe(200);
    expect(porShortName.body).toEqual(porId.body);
  });

  it('returns 404 for a shortName belonging to another tenant', async () => {
    const marca = randomUUID().slice(0, 6);
    await criado(`SoDoTenantA ${marca}`);

    const deOutroTenant = await byShortName(sessionOfOtherTenant, `sodotenanta-${marca}`);
    expect(deOutroTenant.status).toBe(404);
  });

  it('returns 404 for an archived flow, even though its shortName once resolved', async () => {
    const marca = randomUUID().slice(0, 6);
    const id = await criado(`Arquivavel ${marca}`);
    expect((await excluir(sessionAdmin, id)).status).toBe(204);

    const resposta = await byShortName(sessionEditor, `arquivavel-${marca}`);
    expect(resposta.status).toBe(404);
  });

  it('returns 404 for a nonexistent shortName, including one shaped like a UUID', async () => {
    const inexistente = await byShortName(sessionEditor, `nao-existe-${randomUUID().slice(0, 6)}`);
    expect(inexistente.status).toBe(404);

    const pareceUuid = await byShortName(sessionEditor, randomUUID());
    expect(pareceUuid.status).toBe(404);
  });

  it('gives the same response :id gives today to a user without any flow permission', async () => {
    const marca = randomUUID().slice(0, 6);
    const id = await criado(`Sem Poder ${marca}`);

    const porId = await byId(sessionWithoutAuthority, id);
    const porShortName = await byShortName(sessionWithoutAuthority, `sem-poder-${marca}`);
    expect(porShortName.status).toBe(porId.status);
    expect(porShortName.body).toEqual(porId.body);
  });
});

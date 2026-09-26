import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// // The mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, createToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * `PATCH /v1/contatos/:id` (`controladores/catalogo.ts`, `ControladorContatos.editar`) — the "Edit" of `fluxo/contatos/detalhe/editar.tsx`. Session, `contato.editar` permission, phone in E.164 validated and unique per tenant, `atributos` merged (never replaced wholesale).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let sessionEditor: string;
let sessionWithoutPoder: string;
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
  return { cookie: `pipe_session=${token}`, 'content-type': 'application/json' };
}

async function newContact(
  cenario: Cenario,
  extra: { name?: string; email?: string; phone?: string; atributos?: Record<string, unknown> } = {},
): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, email, telefone_e164, atributos)
    values (
      ${cenario.tenantId}, ${extra.nome ?? `Contato ${randomUUID().slice(0, 8)}`},
      ${extra.email ?? null}, ${extra.telefone ?? null},
      ${JSON.stringify(extra.atributos ?? {})}::jsonb
    )
    returning id
  `);
  return rows[0]!.id;
}

async function editar(
  session: string,
  id: string,
  corpo: Record<string, unknown>,
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/contacts/${id}`, {
    method: 'PATCH',
    headers: comCookie(session),
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function lineOfContact(id: string) {
  const { rows } = await a.dono.execute<{
    name: string | null;
    email: string | null;
    phoneE164: string | null;
    document: string | null;
    atributos: Record<string, unknown>;
  }>(sql`
    select nome, email, telefone_e164, documento, atributos from contato where id = ${id}::uuid
  `);
  return rows[0];
}

async function auditoriaDe(id: string) {
  const { rows } = await a.dono.execute<{ acao: string; antes: unknown; depois: unknown }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = 'contato' and objeto_id = ${id}::uuid
     order by em asc, id asc
  `);
  return rows;
}

beforeAll(async () => {
  a = await montarCenario(`ct-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`ct-${randomUUID().slice(0, 8)}`);

  const editorPessoa = await pessoaCom(a, ['contato.editar']);
  const semPoder = await pessoaCom(a, []);
  const editorDoB = await pessoaCom(b, ['contato.editar']);

  api = await upApi(0);
  sessionEditor = await openSession(a, editorPessoa);
  sessionWithoutPoder = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, editorDoB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('PATCH /v1/contacts/:id', () => {
  it('edita nome, e-mail e telefone, e registra só o que mudou', async () => {
    const id = await newContact(a, { nome: 'Ana', telefone: '+5511900000001' });
    const { status, corpo } = await editar(sessionEditor, id, {
      nome: 'Ana Ribeiro',
      email: 'ana@exemplo.com',
    });
    expect(status).toBe(200);
    expect(corpo['nome']).toBe('Ana Ribeiro');
    expect(corpo['email']).toBe('ana@exemplo.com');
    expect(corpo['telefone_e164']).toBe('+5511900000001');

    const log = await auditoriaDe(id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      acao: 'alterou',
      antes: { nome: 'Ana', email: null },
      depois: { nome: 'Ana Ribeiro', email: 'ana@exemplo.com' },
    });
  });

  it('null apaga o campo; campo ausente não mexe', async () => {
    const id = await newContact(a, { nome: 'Bia', email: 'bia@exemplo.com' });
    const { status, corpo } = await editar(sessionEditor, id, { email: null });
    expect(status).toBe(200);
    expect(corpo['email']).toBeNull();
    expect(corpo['nome']).toBe('Bia');
  });

  it('recusa telefone fora do E.164', async () => {
    const id = await newContact(a);
    const { status, corpo } = await editar(sessionEditor, id, { telefone_e164: '011987654321' });
    expect(status).toBe(400);
    expect(corpo).toMatchObject({ erro: { codigo: 'contato_telefone_invalido' } });
  });

  it('Reject malformed contact email addresses', async () => {
    const id = await newContact(a);
    const { status, corpo } = await editar(sessionEditor, id, { email: 'não é um email' });
    expect(status).toBe(400);
    expect(corpo).toMatchObject({ erro: { codigo: 'contato_email_invalido' } });
  });

  it('Reject a phone number already used by another contact in the tenant', async () => {
    await newContact(a, { telefone: '+5511900000002' });
    const id = await newContact(a, { telefone: '+5511900000003' });
    const { status, corpo } = await editar(sessionEditor, id, { telefone_e164: '+5511900000002' });
    expect(status).toBe(409);
    expect(corpo).toMatchObject({ erro: { codigo: 'contato_telefone_em_uso' } });

    // // The same phone the contact already has isn't a conflict with itself.
    const semMudanca = await editar(sessionEditor, id, { telefone_e164: '+5511900000003' });
    expect(semMudanca.status).toBe(200);
  });

  it('Merge supplied contact attributes while preserving unspecified attributes', async () => {
    const id = await newContact(a, { atributos: { city: 'Fortaleza', origem: 'importação' } });
    const { status } = await editar(sessionEditor, id, { atributos: { gender: 'female' } });
    expect(status).toBe(200);

    const linha = await lineOfContact(id);
    expect(linha?.atributos).toEqual({ city: 'Fortaleza', origem: 'importação', gender: 'female' });
  });

  it('Return 403 without `contato.editar` and 404 for cross-tenant or malformed IDs', async () => {
    const id = await newContact(a);
    const semPoder = await editar(sessionWithoutPoder, id, { nome: 'X' });
    expect(semPoder.status).toBe(403);

    const outroTenant = await editar(sessionOfOtherTenant, id, { nome: 'X' });
    expect(outroTenant.status).toBe(404);

    const malformado = await editar(sessionEditor, 'nao-e-uuid', { nome: 'X' });
    expect(malformado.status).toBe(404);
  });

  it('Return 401 for Desk actions without a session', async () => {
    const id = await newContact(a);
    const resposta = await fetch(`${api.url}/v1/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(resposta.status).toBe(401);
  });
});

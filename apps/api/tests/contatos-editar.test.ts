import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * `PATCH /v1/contatos/:id` (`controladores/catalogo.ts`,
 * `ControladorContatos.editar`) — o "Editar" de
 * `fluxo/contatos/detalhe/editar.tsx`. Sessão, permissão `contato.editar`,
 * telefone em E.164 validado e único no tenant, `atributos` mesclado (nunca
 * substituído por inteiro).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let sessaoEditor: string;
let sessaoSemPoder: string;
let sessaoDoOutroTenant: string;

async function pessoaCom(cenario: Cenario, permissoes: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: usuarios } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const usuarioId = usuarios[0]!.id;
  if (permissoes.length === 0) return usuarioId;
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  for (const codigo of permissoes) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papeis[0]!.id}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${usuarioId}, ${papeis[0]!.id})
  `);
  return usuarioId;
}

async function abrirSessao(cenario: Cenario, usuarioId: string): Promise<string> {
  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${usuarioId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

async function novoContato(
  cenario: Cenario,
  extra: { nome?: string; email?: string; telefone?: string; atributos?: Record<string, unknown> } = {},
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
  sessao: string,
  id: string,
  corpo: Record<string, unknown>,
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/contatos/${id}`, {
    method: 'PATCH',
    headers: comCookie(sessao),
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function linhaDoContato(id: string) {
  const { rows } = await a.dono.execute<{
    nome: string | null;
    email: string | null;
    telefone_e164: string | null;
    documento: string | null;
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

  api = await subirApi(0);
  sessaoEditor = await abrirSessao(a, editorPessoa);
  sessaoSemPoder = await abrirSessao(a, semPoder);
  sessaoDoOutroTenant = await abrirSessao(b, editorDoB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('PATCH /v1/contatos/:id', () => {
  it('edita nome, e-mail e telefone, e registra só o que mudou', async () => {
    const id = await novoContato(a, { nome: 'Ana', telefone: '+5511900000001' });
    const { status, corpo } = await editar(sessaoEditor, id, {
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
    const id = await novoContato(a, { nome: 'Bia', email: 'bia@exemplo.com' });
    const { status, corpo } = await editar(sessaoEditor, id, { email: null });
    expect(status).toBe(200);
    expect(corpo['email']).toBeNull();
    expect(corpo['nome']).toBe('Bia');
  });

  it('recusa telefone fora do E.164', async () => {
    const id = await novoContato(a);
    const { status, corpo } = await editar(sessaoEditor, id, { telefone_e164: '011987654321' });
    expect(status).toBe(400);
    expect(corpo).toMatchObject({ erro: { codigo: 'contato_telefone_invalido' } });
  });

  it('recusa e-mail sem formato de e-mail', async () => {
    const id = await novoContato(a);
    const { status, corpo } = await editar(sessaoEditor, id, { email: 'não é um email' });
    expect(status).toBe(400);
    expect(corpo).toMatchObject({ erro: { codigo: 'contato_email_invalido' } });
  });

  it('telefone único no tenant: recusa repetir o de outro contato', async () => {
    await novoContato(a, { telefone: '+5511900000002' });
    const id = await novoContato(a, { telefone: '+5511900000003' });
    const { status, corpo } = await editar(sessaoEditor, id, { telefone_e164: '+5511900000002' });
    expect(status).toBe(409);
    expect(corpo).toMatchObject({ erro: { codigo: 'contato_telefone_em_uso' } });

    // O mesmo telefone que o contato já tem não é conflito consigo mesmo.
    const semMudanca = await editar(sessaoEditor, id, { telefone_e164: '+5511900000003' });
    expect(semMudanca.status).toBe(200);
  });

  it('atributos é mescla: só as chaves enviadas mudam, as extras do contato continuam', async () => {
    const id = await novoContato(a, { atributos: { city: 'Fortaleza', origem: 'importação' } });
    const { status } = await editar(sessaoEditor, id, { atributos: { gender: 'female' } });
    expect(status).toBe(200);

    const linha = await linhaDoContato(id);
    expect(linha?.atributos).toEqual({ city: 'Fortaleza', origem: 'importação', gender: 'female' });
  });

  it('sem contato.editar é 403; contato de outro tenant e uuid malformado são 404', async () => {
    const id = await novoContato(a);
    const semPoder = await editar(sessaoSemPoder, id, { nome: 'X' });
    expect(semPoder.status).toBe(403);

    const outroTenant = await editar(sessaoDoOutroTenant, id, { nome: 'X' });
    expect(outroTenant.status).toBe(404);

    const malformado = await editar(sessaoEditor, 'nao-e-uuid', { nome: 'X' });
    expect(malformado.status).toBe(404);
  });

  it('sem sessão é 401', async () => {
    const id = await novoContato(a);
    const resposta = await fetch(`${api.url}/v1/contatos/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'X' }),
    });
    expect(resposta.status).toBe(401);
  });
});

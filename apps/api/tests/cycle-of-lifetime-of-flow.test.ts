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
 * The contact's (flow/router) lifecycle: `POST`, `PATCH /:id` and `DELETE /:id` on `/v1/gestao/fluxos`.
 *
 * What's worth proving is what the screens' source decides and what Pipe decided on top of it: the name by the creation wizard's rules (2 to 30, starts with a letter, sanitized), the description by the "Edit Flow" DOM (2 to 160, optional), the photo by its BYTES, the delete permission for admins only (`automacao.fluxo.excluir`), and the deletion that ARCHIVES instead of erasing — the flow disappears from the grid, the name becomes free, and the published version stays in the database for the history of the conversations that went through it.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Who creates and edits, but doesn't delete — their `member`. */
let sessionEditor: string;
/** Who also deletes — their `admin`. */
let sessionAdmin: string;
/** People from tenant A with no permission at all on the flow. */
let sessionWithoutAuthority: string;
/** Admin of tenant B: proves the tenant comes from the session, never from the URL. */
let sessionOfOtherTenant: string;

const RECADOS = {
  tamanho: 'recado: tamanho',
  comecoInvalido: 'recado: começo',
  nomeEmUso: 'recado: em uso',
  semPermissao: 'recado: sem permissão',
};

/** A new user on the tenant, with a role carrying these permissions. */
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

/** Writes a live session for the person and returns the cookie's token. */
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

/** A "fake" PNG that's a real PNG to whoever reads the bytes: the signature and nothing else. */
const PNG = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]).toString('base64')}`;

/** PNG label, text bytes: the type lies. */
const NOT_IMAGE = `data:image/png;base64,${Buffer.from('isto não é uma imagem').toString(
  'base64',
)}`;

type LineOfFlow = {
  nome: string;
  tipo: string;
  estado: string;
  short_name: string | null;
  description: string | null;
  imageUrl: string | null;
  tenant_id: string;
}

async function lineOfFlow(id: string): Promise<LineOfFlow | undefined> {
  const { rows } = await a.dono.execute<LineOfFlow>(sql`
    select nome, tipo, estado, short_name, descricao, imagem_url, tenant_id
      from fluxo where id = ${id}::uuid
  `);
  return rows[0];
}

async function auditoriaDe(id: string) {
  const { rows } = await a.dono.execute<{
    acao: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
  }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = 'fluxo' and objeto_id = ${id}::uuid
     order by em asc, id asc
  `);
  return rows;
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

/** Creates and returns the id, or fails the test — for scenarios that need a ready flow. */
async function criado(nome: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { status, body } = await create(sessionEditor, { nome, ...extra });
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

beforeAll(async () => {
  a = await montarCenario(`fx-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`fx-${randomUUID().slice(0, 8)}`);

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

describe('POST /v1/management/flows', () => {
  it('Create a draft flow with a name-derived shortName and audit the creation', async () => {
    const nome = `Atendimento ${randomUUID().slice(0, 6)}`;
    const { status, body } = await create(sessionEditor, { nome });
    expect(status).toBe(200);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

    const linha = await lineOfFlow(body.id!);
    expect(linha).toMatchObject({
      nome,
      tipo: 'fluxo',
      estado: 'rascunho',
      short_name: nome.toLowerCase().replace(/\s+/g, '-'),
      descricao: null,
      imagem_url: null,
      tenant_id: a.tenantId,
    });

    const log = await auditoriaDe(body.id!);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { nome, tipo: 'fluxo' } });
  });

  it('Create a router through the flow form with a different type', async () => {
    const id = await criado(`Roteador ${randomUUID().slice(0, 6)}`, { tipo: 'roteador' });
    expect((await lineOfFlow(id))?.tipo).toBe('roteador');
  });

  it('saneia o nome como a origem faz a cada tecla, e o shortName sai do nome limpo', async () => {
    const marca = randomUUID().slice(0, 6);
    const id = await criado(`  Fluxo Padrão #${marca}!  `);
    const linha = await lineOfFlow(id);
    expect(linha?.nome).toBe(`Fluxo Padrão ${marca}`);
    expect(linha?.short_name).toBe(`fluxo-padrão-${marca}`);
  });

  it('recusa nome curto, nome que não começa com letra e nome repetido — com a frase da tela', async () => {
    const nome = `Repetido ${randomUUID().slice(0, 6)}`;
    await criado(nome);

    const curto = await create(sessionEditor, { nome: 'A' });
    expect(curto.status).toBe(200);
    expect(curto.body).toEqual({ erro: RECADOS.tamanho });

    const longo = await create(sessionEditor, { nome: 'A'.repeat(31) });
    expect(longo.body).toEqual({ erro: RECADOS.tamanho });

    const numero = await create(sessionEditor, { nome: '1 Fluxo' });
    expect(numero.body).toEqual({ erro: RECADOS.comecoInvalido });

    const repetido = await create(sessionEditor, { nome });
    expect(repetido.body).toEqual({ erro: RECADOS.nomeEmUso });

    const { rows } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from fluxo
       where tenant_id = ${a.tenantId}::uuid and nome = ${nome}
    `);
    expect(rows[0]?.n).toBe('1');
  });

  it('Reject flow creation without `automacao.fluxo.editar` using the screen message and save nothing', async () => {
    const nome = `Proibido ${randomUUID().slice(0, 6)}`;
    const { status, body } = await create(sessionWithoutAuthority, { nome });
    expect(status).toBe(200);
    expect(body).toEqual({ erro: RECADOS.semPermissao });
    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from fluxo where nome = ${nome}`,
    );
    expect(rows[0]?.n).toBe('0');
  });

  it('Return 401 without a session and 400 for missing required fields', async () => {
    const withoutSession = await fetch(`${api.url}/v1/management/flows`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Qualquer', type: 'fluxo', recados: RECADOS }),
    });
    expect(withoutSession.status).toBe(401);

    const semRecados = await fetch(`${api.url}/v1/management/flows`, {
      method: 'POST',
      headers: comCookie(sessionEditor),
      body: JSON.stringify({ name: 'Qualquer', type: 'fluxo' }),
    });
    expect(semRecados.status).toBe(400);
    const corpo = (await semRecados.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe('messages_missing');
  });

  it('Detect flow images from bytes and ignore mislabeled nonimages', async () => {
    const comFoto = await criado(`Com foto ${randomUUID().slice(0, 6)}`, { imagem: PNG });
    expect((await lineOfFlow(comFoto))?.imageUrl).toBe(PNG);

    const semFoto = await criado(`Sem foto ${randomUUID().slice(0, 6)}`, { imagem: NOT_IMAGE });
    expect((await lineOfFlow(semFoto))?.imageUrl).toBeNull();
  });
});

describe('PATCH /v1/management/flows/:id', () => {
  it('Edit a flow\'s name and description, recompute shortName, and audit only changes', async () => {
    const marca = randomUUID().slice(0, 6);
    const id = await criado(`Antes ${marca}`);

    const { status, corpo } = await editar(sessionEditor, id, {
      nome: `Depois ${marca}`,
      descricao: '  Atende o suporte de primeiro nível.  ',
    });
    expect(status).toBe(200);
    expect(corpo).toEqual({
      id,
      nome: `Depois ${marca}`,
      descricao: 'Atende o suporte de primeiro nível.',
      imagemUrl: null,
      shortName: `depois-${marca}`,
    });

    const linha = await lineOfFlow(id);
    expect(linha?.nome).toBe(`Depois ${marca}`);
    expect(linha?.description).toBe('Atende o suporte de primeiro nível.');
    expect(linha?.short_name).toBe(`depois-${marca}`);

    const log = await auditoriaDe(id);
    expect(log).toHaveLength(2);
    expect(log[1]).toMatchObject({
      acao: 'alterou',
      antes: { nome: `Antes ${marca}`, descricao: null, shortName: `antes-${marca}` },
      depois: {
        nome: `Depois ${marca}`,
        descricao: 'Atende o suporte de primeiro nível.',
        shortName: `depois-${marca}`,
      },
    });
    // // The photo didn't change, so it's not in the record.
    expect(log[1]?.depois).not.toHaveProperty('imagemUrl');
  });

  it('campo ausente não mexe; nada mudado não grava nem registra', async () => {
    const id = await criado(`Quieto ${randomUUID().slice(0, 6)}`);
    await editar(sessionEditor, id, { descricao: 'Uma descrição' });

    const soNome = await editar(sessionEditor, id, { nome: (await lineOfFlow(id))!.nome });
    expect(soNome.status).toBe(200);
    expect(soNome.corpo['descricao']).toBe('Uma descrição');

    const empty = await editar(sessionEditor, id, {});
    expect(empty.status).toBe(200);
    // // created plus the description; the empty PATCH and the no-change PATCH don't go in.
    expect(await auditoriaDe(id)).toHaveLength(2);
  });

  it('Store empty descriptions as null and reject lengths of one or over 160 characters', async () => {
    const id = await criado(`Descrito ${randomUUID().slice(0, 6)}`);
    await editar(sessionEditor, id, { descricao: 'Tem descrição' });

    const apagada = await editar(sessionEditor, id, { descricao: '' });
    expect(apagada.status).toBe(200);
    expect(apagada.corpo['descricao']).toBeNull();
    expect((await lineOfFlow(id))?.description).toBeNull();

    for (const invalida of ['x', 'a'.repeat(161)]) {
      const { status, corpo } = await editar(sessionEditor, id, { descricao: invalida });
      expect(status).toBe(400);
      expect((corpo['erro'] as { code: string }).code).toBe('description_size');
    }
    const noLimite = await editar(sessionEditor, id, { descricao: 'a'.repeat(160) });
    expect(noLimite.status).toBe(200);
  });

  it('Apply creation name rules on edit and reject duplicate live-flow names', async () => {
    const marca = randomUUID().slice(0, 6);
    const id = await criado(`Um ${marca}`);
    const outro = await criado(`Dois ${marca}`);

    const curto = await editar(sessionEditor, id, { nome: 'A' });
    expect(curto.status).toBe(400);
    expect((curto.corpo['erro'] as { code: string }).code).toBe('name_size');

    const numero = await editar(sessionEditor, id, { nome: '9 vidas' });
    expect(numero.status).toBe(400);
    expect((numero.corpo['erro'] as { code: string }).code).toBe('name_start');

    const emUso = await editar(sessionEditor, id, { nome: `Dois ${marca}` });
    expect(emUso.status).toBe(409);
    expect((emUso.corpo['erro'] as { code: string }).code).toBe('name_in_use');

    // // Its own name isn't a conflict with itself.
    const mesmo = await editar(sessionEditor, id, { nome: `Um ${marca}` });
    expect(mesmo.status).toBe(200);

    // Arquivado, o outro libera o nome.
    expect((await excluir(sessionAdmin, outro)).status).toBe(204);
    const liberado = await editar(sessionEditor, id, { nome: `Dois ${marca}` });
    expect(liberado.status).toBe(200);
  });

  it('Remove images with `null`, replace them with `data:`, and reject nonimages', async () => {
    const id = await criado(`Retrato ${randomUUID().slice(0, 6)}`, { imagem: PNG });

    const tirada = await editar(sessionEditor, id, { imagem: null });
    expect(tirada.status).toBe(200);
    expect(tirada.corpo['imagemUrl']).toBeNull();

    const posta = await editar(sessionEditor, id, { imagem: PNG });
    expect(posta.status).toBe(200);
    expect(posta.corpo['imagemUrl']).toBe(PNG);

    const falsa = await editar(sessionEditor, id, { imagem: NOT_IMAGE });
    expect(falsa.status).toBe(400);
    expect((falsa.corpo['erro'] as { code: string }).code).toBe('image_invalid');
    expect((await lineOfFlow(id))?.imageUrl).toBe(PNG);
  });

  it('Return 403 without permission and 404 for invalid or cross-tenant flow IDs', async () => {
    const id = await criado(`Guardado ${randomUUID().slice(0, 6)}`);

    const semPoder = await editar(sessionWithoutAuthority, id, { nome: 'Invasor' });
    expect(semPoder.status).toBe(403);
    expect((semPoder.corpo['erro'] as { code: string }).code).toBe('without_permission');

    const outroTenant = await editar(sessionOfOtherTenant, id, { nome: 'Vizinho' });
    expect(outroTenant.status).toBe(404);

    const malformado = await editar(sessionEditor, 'nao-e-uuid', { nome: 'Tanto faz' });
    expect(malformado.status).toBe(404);

    expect((await lineOfFlow(id))?.nome).toContain('Guardado');
  });
});

describe('DELETE /v1/management/flows/:id', () => {
  it('Require `automacao.fluxo.excluir` to archive a flow even when the user can edit', async () => {
    const id = await criado(`Protegido ${randomUUID().slice(0, 6)}`);

    const editor = await excluir(sessionEditor, id);
    expect(editor.status).toBe(403);
    const corpo = (await editor.json()) as {
      error: { code: string; detalhe: { permission: string } };
    };
    expect(corpo.error.code).toBe('without_permission');
    expect(corpo.error.detalhe.permission).toBe('automacao.fluxo.excluir');
    expect((await lineOfFlow(id))?.estado).toBe('rascunho');

    expect((await excluir(sessionOfOtherTenant, id)).status).toBe(404);
    expect((await lineOfFlow(id))?.estado).toBe('rascunho');
  });

  it('Archive flows without deleting versions and free their names for reuse', async () => {
    const nome = `Efemero ${randomUUID().slice(0, 6)}`;
    const id = await criado(nome);
    await a.dono.execute(sql`
      insert into fluxo_versao (tenant_id, fluxo_id, versao, estado)
      values (${a.tenantId}, ${id}::uuid, 1, 'rascunho')
    `);

    const resposta = await excluir(sessionAdmin, id);
    expect(resposta.status).toBe(204);

    const linha = await lineOfFlow(id);
    expect(linha?.estado).toBe('arquivado');
    expect(linha?.nome).toBe(nome);

    const { rows: versions } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from fluxo_versao where fluxo_id = ${id}::uuid`,
    );
    expect(versions[0]?.n).toBe('1');

    const grade = await fetch(`${api.url}/v1/management/flows?busca=${encodeURIComponent(nome)}`, {
      headers: comCookie(sessionAdmin),
    });
    const { flows } = (await grade.json()) as { flows: { id: string }[] };
    expect(flows.map((f) => f.id)).not.toContain(id);

    const log = await auditoriaDe(id);
    expect(log.at(-1)).toMatchObject({
      acao: 'excluiu',
      antes: { nome, estado: 'rascunho' },
      depois: { estado: 'arquivado' },
    });

    // // Deleted means "doesn't exist": deleting again and editing both return 404.
    expect((await excluir(sessionAdmin, id)).status).toBe(404);
    expect((await editar(sessionEditor, id, { nome: 'Ressuscitado' })).status).toBe(404);

    // // And the name became free again for a new contact.
    const novo = await create(sessionEditor, { nome });
    expect(novo.body.error).toBeUndefined();
    expect(novo.body.id).not.toBe(id);
  });

  it('Return 401 without a session', async () => {
    const resposta = await fetch(`${api.url}/v1/management/flows/${randomUUID()}`, {
      method: 'DELETE',
    });
    expect(resposta.status).toBe(401);
  });
});

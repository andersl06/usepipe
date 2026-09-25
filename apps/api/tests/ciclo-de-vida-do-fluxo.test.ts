import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, createTokencriarTokencreateToken } = await import('@pipe/autenticacao');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * O ciclo de vida do contato (fluxo/roteador): `POST`, `PATCH /:id` e
 * `DELETE /:id` em `/v1/gestao/fluxos`.
 *
 * O que vale a pena provar é o que a origem das telas decide e o que o Pipe
 * decidiu por cima dela: o nome pelas regras do assistente de criação (2 a 30,
 * começa com letra, saneado), a descrição pelo DOM de "Editar Fluxo" (2 a 160,
 * opcional), a foto pelos BYTES, a permissão de excluir só do admin
 * (`automacao.fluxo.excluir`), e a exclusão que ARQUIVA em vez de apagar — o
 * fluxo some da grade, o nome fica livre, e a versão publicada continua no
 * banco para o histórico das conversas que passaram por ela.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Quem cria e edita, mas não exclui — o `member` deles. */
let sessionEditor: string;
/** Quem também exclui — o `admin` deles. */
let sessionAdmin: string;
/** Gente do tenant A sem permissão nenhuma sobre fluxo. */
let sessionWithoutPoder: string;
/** Admin do tenant B: prova que o tenant vem da sessão, nunca da URL. */
let sessionOfOtherTenant: string;

const RECADOS = {
  tamanho: 'recado: tamanho',
  comecoInvalido: 'recado: começo',
  nomeEmUso: 'recado: em uso',
  semPermissao: 'recado: sem permissão',
};

/** Um usuário novo no tenant, com um papel que carrega estas permissões. */
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

/** Grava uma sessão viva para a pessoa e devolve o token do cookie. */
async function openSession(cenario: Cenario, userId: string): Promise<string> {
  const novo = createTokencriarTokencreateToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

/** Um PNG "de mentira" que é PNG de verdade para quem lê os bytes: a assinatura e mais nada. */
const PNG = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]).toString('base64')}`;

/** Rótulo de PNG, bytes de texto: o tipo mente. */
const NOT_IMAGE = `data:image/png;base64,${Buffer.from('isto não é uma imagem').toString(
  'base64',
)}`;

type LineOfFlow = {
  nome: string;
  tipo: string;
  state: string;
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
): Promise<{ status: number; corpo: ResponseOfCreation }> {
  const resposta = await fetch(`${api.url}/v1/gestao/fluxos`, {
    method: 'POST',
    headers: comCookie(session),
    body: JSON.stringify({ recados: RECADOS, tipo: 'fluxo', ...corpo }),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as ResponseOfCreation };
}

/** Cria e devolve o id, ou falha o teste — para os cenários que precisam de um fluxo pronto. */
async function criado(nome: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { status, corpo } = await create(sessionEditor, { nome, ...extra });
  expect(status).toBe(200);
  expect(corpo.error).toBeUndefined();
  return corpo.id!;
}

async function editar(sessao: string, id: string, corpo: Record<string, unknown>) {
  const resposta = await fetch(`${api.url}/v1/gestao/fluxos/${id}`, {
    method: 'PATCH',
    headers: comCookie(sessao),
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function excluir(sessao: string, id: string): Promise<Response> {
  return fetch(`${api.url}/v1/gestao/fluxos/${id}`, {
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
  sessionWithoutPoder = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, adminDoB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('POST /v1/gestao/fluxos', () => {
  it('cria o fluxo em rascunho, com o shortName derivado do nome, e registra no log', async () => {
    const nome = `Atendimento ${randomUUID().slice(0, 6)}`;
    const { status, corpo } = await create(sessionEditor, { nome });
    expect(status).toBe(200);
    expect(corpo.id).toMatch(/^[0-9a-f-]{36}$/);

    const linha = await lineOfFlow(corpo.id!);
    expect(linha).toMatchObject({
      nome,
      tipo: 'fluxo',
      estado: 'rascunho',
      short_name: nome.toLowerCase().replace(/\s+/g, '-'),
      descricao: null,
      imagem_url: null,
      tenant_id: a.tenantId,
    });

    const log = await auditoriaDe(corpo.id!);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { nome, tipo: 'fluxo' } });
  });

  it('roteador é o mesmo contato com outro tipo', async () => {
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
    expect(curto.corpo).toEqual({ erro: RECADOS.tamanho });

    const longo = await create(sessionEditor, { nome: 'A'.repeat(31) });
    expect(longo.corpo).toEqual({ erro: RECADOS.tamanho });

    const numero = await create(sessionEditor, { nome: '1 Fluxo' });
    expect(numero.corpo).toEqual({ erro: RECADOS.comecoInvalido });

    const repetido = await create(sessionEditor, { nome });
    expect(repetido.corpo).toEqual({ erro: RECADOS.nomeEmUso });

    const { rows } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from fluxo
       where tenant_id = ${a.tenantId}::uuid and nome = ${nome}
    `);
    expect(rows[0]?.n).toBe('1');
  });

  it('sem automacao.fluxo.editar, a recusa é a frase da tela — e nada é gravado', async () => {
    const nome = `Proibido ${randomUUID().slice(0, 6)}`;
    const { status, corpo } = await create(sessionWithoutPoder, { nome });
    expect(status).toBe(200);
    expect(corpo).toEqual({ erro: RECADOS.semPermissao });
    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from fluxo where nome = ${nome}`,
    );
    expect(rows[0]?.n).toBe('0');
  });

  it('sem sessão, 401; sem os recados da tela, 400', async () => {
    const withoutSession = await fetch(`${api.url}/v1/gestao/fluxos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Qualquer', tipo: 'fluxo', recados: RECADOS }),
    });
    expect(withoutSession.status).toBe(401);

    const semRecados = await fetch(`${api.url}/v1/gestao/fluxos`, {
      method: 'POST',
      headers: comCookie(sessionEditor),
      body: JSON.stringify({ nome: 'Qualquer', tipo: 'fluxo' }),
    });
    expect(semRecados.status).toBe(400);
    const corpo = (await semRecados.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('recados_ausentes');
  });

  it('a foto é lida pelos bytes: PNG entra, rótulo mentindo é engolido e o fluxo nasce sem foto', async () => {
    const comFoto = await criado(`Com foto ${randomUUID().slice(0, 6)}`, { imagem: PNG });
    expect((await lineOfFlow(comFoto))?.imageUrl).toBe(PNG);

    const semFoto = await criado(`Sem foto ${randomUUID().slice(0, 6)}`, { imagem: NOT_IMAGE });
    expect((await lineOfFlow(semFoto))?.imageUrl).toBeNull();
  });
});

describe('PATCH /v1/gestao/fluxos/:id', () => {
  it('edita nome e descrição, refaz o shortName e registra só o que mudou', async () => {
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
    // A foto não mudou, então não está no registro.
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
    // criou + a descrição; o PATCH vazio e o PATCH sem mudança não entram.
    expect(await auditoriaDe(id)).toHaveLength(2);
  });

  it('descrição: vazia vira nula; 1 caractere ou mais de 160 é 400', async () => {
    const id = await criado(`Descrito ${randomUUID().slice(0, 6)}`);
    await editar(sessionEditor, id, { descricao: 'Tem descrição' });

    const apagada = await editar(sessionEditor, id, { descricao: '' });
    expect(apagada.status).toBe(200);
    expect(apagada.corpo['descricao']).toBeNull();
    expect((await lineOfFlow(id))?.description).toBeNull();

    for (const invalida of ['x', 'a'.repeat(161)]) {
      const { status, corpo } = await editar(sessionEditor, id, { descricao: invalida });
      expect(status).toBe(400);
      expect((corpo['erro'] as { codigo: string }).codigo).toBe('descricao_tamanho');
    }
    const noLimite = await editar(sessionEditor, id, { descricao: 'a'.repeat(160) });
    expect(noLimite.status).toBe(200);
  });

  it('nome: as mesmas regras da criação, e o nome de outro fluxo VIVO é conflito', async () => {
    const marca = randomUUID().slice(0, 6);
    const id = await criado(`Um ${marca}`);
    const outro = await criado(`Dois ${marca}`);

    const curto = await editar(sessionEditor, id, { nome: 'A' });
    expect(curto.status).toBe(400);
    expect((curto.corpo['erro'] as { codigo: string }).codigo).toBe('nome_tamanho');

    const numero = await editar(sessionEditor, id, { nome: '9 vidas' });
    expect(numero.status).toBe(400);
    expect((numero.corpo['erro'] as { codigo: string }).codigo).toBe('nome_comeco');

    const emUso = await editar(sessionEditor, id, { nome: `Dois ${marca}` });
    expect(emUso.status).toBe(409);
    expect((emUso.corpo['erro'] as { codigo: string }).codigo).toBe('nome_em_uso');

    // O próprio nome não é conflito consigo mesmo.
    const mesmo = await editar(sessionEditor, id, { nome: `Um ${marca}` });
    expect(mesmo.status).toBe(200);

    // Arquivado, o outro libera o nome.
    expect((await excluir(sessionAdmin, outro)).status).toBe(204);
    const liberado = await editar(sessionEditor, id, { nome: `Dois ${marca}` });
    expect(liberado.status).toBe(200);
  });

  it('imagem: `null` tira, `data:` troca, e o que não é imagem é 400', async () => {
    const id = await criado(`Retrato ${randomUUID().slice(0, 6)}`, { imagem: PNG });

    const tirada = await editar(sessionEditor, id, { imagem: null });
    expect(tirada.status).toBe(200);
    expect(tirada.corpo['imagemUrl']).toBeNull();

    const posta = await editar(sessionEditor, id, { imagem: PNG });
    expect(posta.status).toBe(200);
    expect(posta.corpo['imagemUrl']).toBe(PNG);

    const falsa = await editar(sessionEditor, id, { imagem: NOT_IMAGE });
    expect(falsa.status).toBe(400);
    expect((falsa.corpo['erro'] as { codigo: string }).codigo).toBe('imagem_invalida');
    expect((await lineOfFlow(id))?.imageUrl).toBe(PNG);
  });

  it('sem permissão é 403; de outro tenant é 404; id malformado é 404', async () => {
    const id = await criado(`Guardado ${randomUUID().slice(0, 6)}`);

    const semPoder = await editar(sessionWithoutPoder, id, { nome: 'Invasor' });
    expect(semPoder.status).toBe(403);
    expect((semPoder.corpo['erro'] as { codigo: string }).codigo).toBe('sem_permissao');

    const outroTenant = await editar(sessionOfOtherTenant, id, { nome: 'Vizinho' });
    expect(outroTenant.status).toBe(404);

    const malformado = await editar(sessionEditor, 'nao-e-uuid', { nome: 'Tanto faz' });
    expect(malformado.status).toBe(404);

    expect((await lineOfFlow(id))?.nome).toContain('Guardado');
  });
});

describe('DELETE /v1/gestao/fluxos/:id', () => {
  it('só quem tem automacao.fluxo.excluir exclui — editar não basta', async () => {
    const id = await criado(`Protegido ${randomUUID().slice(0, 6)}`);

    const editor = await excluir(sessionEditor, id);
    expect(editor.status).toBe(403);
    const corpo = (await editor.json()) as {
      erro: { codigo: string; detalhe: { permission: string } };
    };
    expect(corpo.erro.codigo).toBe('sem_permissao');
    expect(corpo.erro.detalhe.permission).toBe('automacao.fluxo.excluir');
    expect((await lineOfFlow(id))?.state).toBe('rascunho');

    expect((await excluir(sessionOfOtherTenant, id)).status).toBe(404);
    expect((await lineOfFlow(id))?.state).toBe('rascunho');
  });

  it('arquiva em vez de apagar: some da grade, o nome fica livre, a versão fica para o histórico', async () => {
    const nome = `Efemero ${randomUUID().slice(0, 6)}`;
    const id = await criado(nome);
    await a.dono.execute(sql`
      insert into fluxo_versao (tenant_id, fluxo_id, versao, estado)
      values (${a.tenantId}, ${id}::uuid, 1, 'rascunho')
    `);

    const resposta = await excluir(sessionAdmin, id);
    expect(resposta.status).toBe(204);

    const linha = await lineOfFlow(id);
    expect(linha?.state).toBe('arquivado');
    expect(linha?.nome).toBe(nome);

    const { rows: versions } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from fluxo_versao where fluxo_id = ${id}::uuid`,
    );
    expect(versions[0]?.n).toBe('1');

    const grade = await fetch(`${api.url}/v1/gestao/fluxos?busca=${encodeURIComponent(nome)}`, {
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

    // Excluído é "não existe": excluir de novo e editar dão 404.
    expect((await excluir(sessionAdmin, id)).status).toBe(404);
    expect((await editar(sessionEditor, id, { nome: 'Ressuscitado' })).status).toBe(404);

    // E o nome voltou a estar livre para um contato novo.
    const novo = await create(sessionEditor, { nome });
    expect(novo.corpo.error).toBeUndefined();
    expect(novo.corpo.id).not.toBe(id);
  });

  it('sem sessão, 401', async () => {
    const resposta = await fetch(`${api.url}/v1/gestao/fluxos/${randomUUID()}`, {
      method: 'DELETE',
    });
    expect(resposta.status).toBe(401);
  });
});

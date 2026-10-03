import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode must be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 5).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { encontrarPalavrasProibidas, normalizarTermo } = await import(
  '../src/domain/management/palavras-proibidas.js'
);
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Forbidden words — registration (`/v1/gestao/configuracoes/palavras-proibidas`) and the send-time rejection (`POST /v1/conversas/:id/mensagens`). Same pattern as `cadastros-atendimento.test.ts`: two tenants, cookie session, happy path, rejections, cross-tenant, permission. The send part follows `envio-sessao.test.ts`: the scenario's agent replies in a conversation that is theirs, and what is proved is that a message containing a listed term does NOT reach the outbox. The comparison ruler is the one in `blip-desk-regras-tecnicas.md` §3.4: a phrase is a substring of the text, a standalone word is a substring of the token, all accent- and case-insensitive (the source's intent, not its bug).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Has `tenant.configurar` — the General Settings permission, reused here. */
let sessionManager: string;
/** People from tenant A with no permission at all. */
let sessionWithoutAuthority: string;
/** A valid session, but from another tenant — proves the tenant comes from the session, never from the URL. */
let sessionOfOtherTenant: string;
/** Scenario A's agent, who is the one replying. */
let sessionAgentA: string;
let sessionAgentB: string;
let contactA: string;
let contactB: string;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

async function pedir(
  metodo: string,
  caminho: string,
  session: string,
  corpo?: Record<string, unknown>,
): Promise<{ status: number; body: Corpo }> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: comCookie(session),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? JSON.parse(texto) : undefined };
}

async function createContact(cenario: Cenario): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente do Teste', '+5511955554444')
    returning id
  `);
  return rows[0]!.id;
}

/** An open conversation, with its 24h window still open, assigned to the scenario's agent. */
async function newConversation(cenario: Cenario, contactId: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado,
      janela_expira_em, ultima_mensagem_em, ultima_mensagem_de
    ) values (
      ${cenario.tenantId}, ${cenario.inboxId}, ${contactId}, ${cenario.queueId},
      ${cenario.agentId}, 'Assigned', now() + interval '20 hours', now(), 'contato'
    )
    returning id
  `);
  return rows[0]!.id;
}

async function countMessages(cenario: Cenario, conversationId: string): Promise<number> {
  const { rows } = await cenario.dono.execute<{ n: number }>(sql`
    select count(*)::int as n from mensagem where conversa_id = ${conversationId}::uuid
  `);
  return rows[0]?.n ?? 0;
}

const CAMINHO = '/v1/management/settings/words-forbidden';

async function createWord(sessao: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', CAMINHO, sessao, { term: `termo-${randomUUID().slice(0, 8)}`, ...corpo });
}

beforeAll(async () => {
  a = await montarCenario(`pp-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`pp-${randomUUID().slice(0, 8)}`);

  const gestor = await pessoaCom(a, ['tenant.configurar']);
  const semPoder = await pessoaCom(a, []);
  const gestorDoB = await pessoaCom(b, ['tenant.configurar']);

  api = await upApi(0);
  sessionManager = await openSession(a, gestor);
  sessionWithoutAuthority = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, gestorDoB);
  sessionAgentA = await openSession(a, a.agentId);
  sessionAgentB = await openSession(b, b.agentId);
  contactA = await createContact(a);
  contactB = await createContact(b);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

async function auditoriaDe(id: string) {
  const { rows } = await a.dono.execute<{
    acao: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
  }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = 'palavra_proibida' and objeto_id = ${id}::uuid
     order by em asc, id asc
  `);
  return rows;
}

/*
 * =========================================================================
 * The comparison ruler, without a database
 * =========================================================================
 */

describe('encontrarPalavrasProibidas — a régua de §3.4', () => {
  it('normaliza sem acento e sem caixa, colapsando espaços', () => {
    expect(normalizarTermo('  Açúcar   Mascavo ')).toBe('acucar mascavo');
  });

  it('palavra solta é substring do token; frase é substring do texto', () => {
    expect(encontrarPalavrasProibidas('Você é um IDIÓTA mesmo', ['idiota'])).toEqual(['idiota']);
    // `exactMatch = false` (the source's default): the term blocks any token that contains it.
    expect(encontrarPalavrasProibidas('seus idiotas!', ['idiota'])).toEqual(['idiota']);
    // The phrase matches even with different case and spacing.
    expect(encontrarPalavrasProibidas('Mandei um  Boleto  FALSO ontem', ['boleto falso'])).toEqual([
      'boleto falso',
    ]);
    expect(encontrarPalavrasProibidas('Olá, tudo bem?', ['idiota', 'boleto falso'])).toEqual([]);
  });

  it('se uma frase bate, devolve só as frases — a 2ª passada nem roda', () => {
    expect(
      encontrarPalavrasProibidas('boleto falso, seu idiota', ['idiota', 'boleto falso']),
    ).toEqual(['boleto falso']);
  });

  it('Split banned-word matches at punctuation and hyphens', () => {
    expect(encontrarPalavrasProibidas('idiota!', ['idiota'])).toEqual(['idiota']);
    expect(encontrarPalavrasProibidas('bem-vindo', ['vindo'])).toEqual(['vindo']);
    expect(encontrarPalavrasProibidas('ok', ['idiota'])).toEqual([]);
  });
});

/* =========================================================================
 * CRUD
 * ========================================================================= */

describe(`POST ${CAMINHO}`, () => {
  it('cria (201), registra no log e aparece na lista', async () => {
    const termo = `Golpe ${randomUUID().slice(0, 6)}`;
    const { status, body } = await createWord(sessionManager, { term: termo });
    expect(status).toBe(201);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

    const log = await auditoriaDe(body.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { termo, ativo: true } });

    const lista = await pedir('GET', CAMINHO, sessionManager);
    expect(lista.status).toBe(200);
    expect((lista.body as { id: string; term: string }[]).some((p) => p.id === body.id)).toBe(true);
  });

  it('Reject empty banned terms and accent- or case-insensitive duplicates', async () => {
    const empty = await createWord(sessionManager, { term: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('term_required');

    const marca = randomUUID().slice(0, 6);
    expect((await createWord(sessionManager, { term: `Açúcar ${marca}` })).status).toBe(201);
    const repetido = await createWord(sessionManager, { term: `ACUCAR ${marca}` });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.code).toBe('term_in_use');
  });

  it('Return 403 without `tenant.configurar` and 401 without a session', async () => {
    const semPoder = await createWord(sessionWithoutAuthority);
    expect(semPoder.status).toBe(403);
    expect(semPoder.body.error.code).toBe('without_permission');
    expect(semPoder.body.error.detalhe.permission).toBe('tenant.configurar');

    const withoutSession = await fetch(`${api.url}${CAMINHO}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ term: 'qualquer' }),
    });
    expect(withoutSession.status).toBe(401);
  });

  it('a lista de um tenant não aparece para o outro', async () => {
    const { body: criada } = await createWord(sessionManager);
    const doOutro = await pedir('GET', CAMINHO, sessionOfOtherTenant);
    expect(doOutro.status).toBe(200);
    expect((doOutro.body as { id: string }[]).some((p) => p.id === criada.id)).toBe(false);
  });
});

describe(`PATCH ${CAMINHO}/:id`, () => {
  it('edita o termo e desativa, registrando só o que mudou', async () => {
    const { body: criada } = await createWord(sessionManager);
    const novoTermo = `Fraude ${randomUUID().slice(0, 6)}`;
    const { status, body } = await pedir('PATCH', `${CAMINHO}/${criada.id}`, sessionManager, {
      term: novoTermo,
      active: false,
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: criada.id, term: novoTermo, active: false });

    const log = await auditoriaDe(criada.id);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou', depois: { termo: novoTermo, ativo: false } });
  });

  it('nada mudado não grava nem registra', async () => {
    const { body: criada } = await createWord(sessionManager);
    const antes = await auditoriaDe(criada.id);
    const vazio = await pedir('PATCH', `${CAMINHO}/${criada.id}`, sessionManager, {});
    expect(vazio.status).toBe(200);
    expect(await auditoriaDe(criada.id)).toHaveLength(antes.length);
  });

  it('renomear para um termo que já existe é 409', async () => {
    const { body: first } = await createWord(sessionManager);
    const { body: segunda } = await createWord(sessionManager);
    const lista = await pedir('GET', CAMINHO, sessionManager);
    const termOfFirst = (lista.body as { id: string; term: string }[]).find(
      (p) => p.id === first.id,
    )!.term;
    const repetido = await pedir('PATCH', `${CAMINHO}/${segunda.id}`, sessionManager, {
      term: termOfFirst.toUpperCase(),
    });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.code).toBe('term_in_use');
  });

  it('sem tenant.configurar é 403; de outro tenant é 404; id malformado é 404', async () => {
    const { body: criada } = await createWord(sessionManager);

    const semPoder = await pedir('PATCH', `${CAMINHO}/${criada.id}`, sessionWithoutAuthority, { active: false });
    expect(semPoder.status).toBe(403);

    const outroTenant = await pedir('PATCH', `${CAMINHO}/${criada.id}`, sessionOfOtherTenant, {
      active: false,
    });
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', `${CAMINHO}/nao-e-uuid`, sessionManager, { active: false });
    expect(malformado.status).toBe(404);
  });
});

describe(`DELETE ${CAMINHO}/:id`, () => {
  it('Delete and audit banned terms, returning 404 for invalid or cross-tenant IDs', async () => {
    const { body: criada } = await createWord(sessionManager);

    const outroTenant = await fetch(`${api.url}${CAMINHO}/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionOfOtherTenant),
    });
    expect(outroTenant.status).toBe(404);

    const malformado = await fetch(`${api.url}${CAMINHO}/nao-e-uuid`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(malformado.status).toBe(404);

    const semPoder = await fetch(`${api.url}${CAMINHO}/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionWithoutAuthority),
    });
    expect(semPoder.status).toBe(403);

    const excluida = await fetch(`${api.url}${CAMINHO}/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(excluida.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from palavra_proibida where id = ${criada.id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
    expect((await auditoriaDe(criada.id)).at(-1)).toMatchObject({ acao: 'excluiu' });

    const outraVez = await fetch(`${api.url}${CAMINHO}/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(outraVez.status).toBe(404);
  });
});

/* =========================================================================
 * A recusa no envio
 * ========================================================================= */

describe('POST /v1/conversations/:id/messages — a lista barra o envio do atendente', () => {
  it('recusa (400) com a palavra encontrada, e nada é gravado; sem acento e sem caixa; palavra desativada não barra; outro tenant não é afetado', async () => {
    const marca = randomUUID().slice(0, 6);
    const palavra = `idiota${marca}`;
    const frase = `boleto falso ${marca}`;
    const { body: criadaPalavra } = await createWord(sessionManager, { term: palavra });
    expect((await createWord(sessionManager, { term: frase })).status).toBe(201);

    // A standalone word, with different accent and case, inside a token that CONTAINS it.
    const conversationA = await newConversation(a, contactA);
    const recusada = await pedir('POST', `/v1/conversations/${conversationA}/messages`, sessionAgentA, {
      texto: `Vocês são uns IDIÓTA${marca}s!`,
    });
    expect(recusada.status).toBe(400);
    expect(recusada.body.error.code).toBe('word_forbidden');
    expect(recusada.body.error.message).toContain(`"${palavra}"`);
    expect(recusada.body.error.detalhe.palavras).toEqual([palavra]);
    // Neither the message nor the outbox was written: the rejection happens BEFORE writing.
    expect(await countMessages(a, conversationA)).toBe(0);

    // Phrase: a substring of the whole text, with extra spaces and different case.
    const recusadaFrase = await pedir('POST', `/v1/conversations/${conversationA}/messages`, sessionAgentA, {
      texto: `Mandei o Boleto   FALSO ${marca} ontem`,
    });
    expect(recusadaFrase.status).toBe(400);
    expect(recusadaFrase.body.error.detalhe.palavras).toEqual([frase]);

    // Texto limpo passa.
    const limpa = await pedir('POST', `/v1/conversations/${conversationA}/messages`, sessionAgentA, {
      texto: 'Olá, tudo bem? Segue o boleto.',
    });
    expect(limpa.status).toBe(201);
    expect(await countMessages(a, conversationA)).toBe(1);

    // Once disabled, the word stops blocking — and the cache was invalidated by the PATCH.
    const desativada = await pedir('PATCH', `${CAMINHO}/${criadaPalavra.id}`, sessionManager, {
      active: false,
    });
    expect(desativada.status).toBe(200);
    const liberada = await pedir('POST', `/v1/conversations/${conversationA}/messages`, sessionAgentA, {
      texto: `Vocês são uns ${palavra}s!`,
    });
    expect(liberada.status).toBe(201);

    // Reativada, volta a barrar.
    await pedir('PATCH', `${CAMINHO}/${criadaPalavra.id}`, sessionManager, { active: true });
    const deNovo = await pedir('POST', `/v1/conversations/${conversationA}/messages`, sessionAgentA, {
      texto: `${palavra}`,
    });
    expect(deNovo.status).toBe(400);

    // The list belongs to tenant A: an agent from tenant B sends the same word without being blocked.
    const conversationB = await newConversation(b, contactB);
    const doB = await pedir('POST', `/v1/conversations/${conversationB}/messages`, sessionAgentB, {
      texto: `${palavra} e ${frase}`,
    });
    expect(doB.status).toBe(201);
    expect(await countMessages(b, conversationB)).toBe(1);
  });

  it('Filter attachment captions while allowing system messages from API keys', async () => {
    const marca = randomUUID().slice(0, 6);
    const palavra = `golpe${marca}`;
    expect((await createWord(sessionManager, { term: palavra })).status).toBe(201);

    const conversaA = await newConversation(a, contactA);
    // An API key with no `atendente_id`: it is a system message — the source's filter
    // belongs to the Desk, and the bot/integration does not go through it.
    const doSistema = await fetch(`${api.url}/v1/conversations/${conversaA}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ texto: `isso é ${palavra}` }),
    });
    expect(doSistema.status).toBe(201);

    // A mesma chave assinando por um atendente cai no filtro.
    const byAgent = await fetch(`${api.url}/v1/conversations/${conversaA}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ texto: `isso é ${palavra}`, agentId: a.agentId }),
    });
    expect(byAgent.status).toBe(400);
    expect(((await byAgent.json()) as { error: { code: string } }).error.code).toBe(
      'word_forbidden',
    );
  });
});

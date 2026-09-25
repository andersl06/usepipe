import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, createTokencriarTokencreateToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Etiquetar conversa ABERTA e etiquetar CONTATO — `controladores/etiquetas.ts`,
 * `dominio/etiquetas.ts` (auditoria do Desk, itens 16 e 17).
 *
 * Até aqui a única forma de marcar tag numa conversa era encerrando
 * (`POST /encerrar`), e `contato_etiqueta` não tinha rota nenhuma. As três
 * rotas novas: o catálogo (`GET /v1/etiquetas?escopo=`), a conversa
 * (`POST`/`DELETE /v1/conversas/:id/etiquetas`, permissão `conversa.etiquetar`
 * e tem de ser o dono) e o contato (`GET`/`POST`/`DELETE
 * /v1/contatos/:id/etiquetas`, permissão `contato.editar`). O escopo da
 * etiqueta é conferido no servidor e cada gesto grava auditoria.
 */

let a: Cenario;
let api: ApiNoAr;
let agentId: string;
let sessionAgent: string;
let sessionWithoutPoder: string;
let colegaId: string;
let sessionColleague: string;
let labelConversation: string;
let labelContact: string;
let etiquetaAmbos: string;

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
  const novo = createTokencriarTokencreateToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiresAt}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

function withKey(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

async function chamar(
  metodo: 'GET' | 'POST' | 'DELETE',
  caminho: string,
  cabecalhos: Record<string, string>,
  corpo?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function createLabel(scope: 'conversa' | 'contato' | 'ambos'): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into etiqueta (tenant_id, nome, escopo)
    values (${a.tenantId}, ${`${scope}-${randomUUID().slice(0, 6)}`}, ${scope}) returning id
  `);
  return rows[0]!.id;
}

async function createContact(): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${a.tenantId}, 'Cliente de teste') returning id
  `);
  return rows[0]!.id;
}

async function createConversation(
  dono: string | null,
  state: 'atribuida' | 'em_atendimento' | 'encerrada' = 'atribuida',
): Promise<{ conversationId: string; contactId: string }> {
  const contactId = await createContact();
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, atribuida_em)
    values (${a.tenantId}, ${a.inboxId}::uuid, ${contactId}::uuid, ${a.queueId}::uuid, ${dono},
            ${state}, now())
    returning id
  `);
  return { conversationId: rows[0]!.id, contactId };
}

async function labelsOfConversation(conversationId: string): Promise<string[]> {
  const { rows } = await a.dono.execute<{ etiqueta_id: string }>(
    sql`select etiqueta_id from conversa_etiqueta where conversa_id = ${conversationId}::uuid`,
  );
  return rows.map((r) => r.etiqueta_id);
}

async function auditoriaDe(objetoTipo: string, objetoId: string) {
  const { rows } = await a.dono.execute<{ acao: string; antes: unknown; depois: unknown }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = ${objetoTipo} and objeto_id = ${objetoId}::uuid
     order by em asc, id asc
  `);
  return rows;
}

beforeAll(async () => {
  a = await montarCenario(`etiquetas-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  agentId = await pessoaCom(a, ['conversa.etiquetar', 'contato.editar']);
  sessionAgent = await openSession(a, agentId);
  sessionWithoutPoder = await openSession(a, await pessoaCom(a, []));
  colegaId = await pessoaCom(a, ['conversa.etiquetar']);
  sessionColleague = await openSession(a, colegaId);
  labelConversation = await createLabel('conversation');
  labelContact = await createLabel('contato');
  etiquetaAmbos = await createLabel('ambos');
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
});

describe('GET /v1/etiquetas — o catálogo do tenant', () => {
  it('List all labels without a filter and only matching labels with `?scope=`', async () => {
    const todas = await chamar('GET', '/v1/etiquetas', comCookie(sessionAgent));
    expect(todas.status).toBe(200);
    const ids = (todas.corpo['etiquetas'] as { id: string }[]).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining([labelConversation, labelContact, etiquetaAmbos]));

    const ofContact = await chamar('GET', '/v1/etiquetas?escopo=contato', comCookie(sessionAgent));
    const idsContact = (ofContact.corpo['etiquetas'] as { id: string }[]).map((e) => e.id);
    expect(idsContact).toContain(labelContact);
    expect(idsContact).toContain(etiquetaAmbos);
    expect(idsContact).not.toContain(labelConversation);
  });

  it('Return 400 for an unknown scope and 401 without a session', async () => {
    const invalido = await chamar('GET', '/v1/etiquetas?escopo=fila', comCookie(sessionAgent));
    expect(invalido.status).toBe(400);
    const withoutSession = await chamar('GET', '/v1/etiquetas', { 'content-type': 'application/json' });
    expect(withoutSession.status).toBe(401);
  });
});

describe('POST/DELETE /v1/conversations/:id/etiquetas — a conversa aberta', () => {
  it('aplica, é idempotente, remove, e cada gesto grava auditoria', async () => {
    const { conversationId } = await createConversation(agentId);

    const aplicada = await chamar(
      'POST',
      `/v1/conversations/${conversationId}/labels`,
      comCookie(sessionAgent),
      { etiqueta_id: labelConversation },
    );
    expect(aplicada.status).toBe(201);
    expect(aplicada.corpo).toMatchObject({ etiqueta_id: labelConversation, aplicada: true });
    expect(await labelsOfConversation(conversationId)).toEqual([labelConversation]);

    // A conversa continua ABERTA: etiquetar não é encerrar.
    const { rows } = await a.dono.execute<{ state: string }>(
      sql`select estado from conversa where id = ${conversationId}::uuid`,
    );
    expect(rows[0]?.state).toBe('atribuida');

    const deNovo = await chamar(
      'POST',
      `/v1/conversations/${conversationId}/labels`,
      comCookie(sessionAgent),
      { etiqueta_id: labelConversation },
    );
    expect(deNovo.status).toBe(201);
    expect(deNovo.corpo['aplicada']).toBe(false);

    const removida = await chamar(
      'DELETE',
      `/v1/conversations/${conversationId}/labels/${labelConversation}`,
      comCookie(sessionAgent),
    );
    expect(removida.status).toBe(200);
    expect(removida.corpo).toEqual({ removida: true });
    expect(await labelsOfConversation(conversationId)).toEqual([]);

    const semNada = await chamar(
      'DELETE',
      `/v1/conversations/${conversationId}/labels/${labelConversation}`,
      comCookie(sessionAgent),
    );
    expect(semNada.corpo).toEqual({ removida: false });

    // Um `criou` e um `excluiu` — o no-op não grava linha.
    const log = await auditoriaDe('conversa_etiqueta', conversationId);
    expect(log.map((l) => l.acao)).toEqual(['criou', 'excluiu']);
    expect(log[0]?.depois).toMatchObject({ etiqueta_id: labelConversation });
    expect(log[1]?.antes).toMatchObject({ etiqueta_id: labelConversation });
  });

  it('a etiqueta aplicada aparece em GET /v1/desk/conversations/:id e pré-marca o encerramento', async () => {
    const { conversationId } = await createConversation(agentId);
    await chamar('POST', `/v1/conversations/${conversationId}/labels`, comCookie(sessionAgent), {
      etiqueta_id: etiquetaAmbos,
    });
    const tela = await chamar('GET', `/v1/desk/conversations/${conversationId}`, comCookie(sessionAgent));
    const aberta = tela.corpo['aberta'] as { labelsOfConversation: { id: string }[] };
    expect(aberta.labelsOfConversation.map((e) => e.id)).toEqual([etiquetaAmbos]);
  });

  it('Require `etiqueta_id` and reject contact-only labels on conversations', async () => {
    const { conversationId } = await createConversation(agentId);
    const semId = await chamar(
      'POST',
      `/v1/conversations/${conversationId}/labels`,
      comCookie(sessionAgent),
      {},
    );
    expect(semId.status).toBe(400);

    const scopeWrong = await chamar(
      'POST',
      `/v1/conversations/${conversationId}/labels`,
      comCookie(sessionAgent),
      { etiqueta_id: labelContact },
    );
    expect(scopeWrong.status).toBe(400);
    expect((scopeWrong.corpo['erro'] as { code: string }).codigo).toBe('label_of_other_scope');

    const inexistente = await chamar(
      'POST',
      `/v1/conversations/${conversationId}/labels`,
      comCookie(sessionAgent),
      { etiqueta_id: randomUUID() },
    );
    expect(inexistente.status).toBe(404);
  });

  it('Return 403 without `conversa.etiquetar` or for another agent\'s conversation, and 409 for a closed conversation', async () => {
    const { conversationId } = await createConversation(agentId);
    const semPoder = await chamar(
      'POST',
      `/v1/conversations/${conversationId}/labels`,
      comCookie(sessionWithoutPoder),
      { etiqueta_id: labelConversation },
    );
    expect(semPoder.status).toBe(403);
    expect((semPoder.corpo['erro'] as { code: string }).codigo).toBe('without_permission');

    const deOutro = await chamar(
      'POST',
      `/v1/conversations/${conversationId}/labels`,
      comCookie(sessionColleague),
      { etiqueta_id: labelConversation },
    );
    expect(deOutro.status).toBe(403);
    expect((deOutro.corpo['erro'] as { code: string }).codigo).toBe('conversation_of_other_agent');

    const { conversationId: encerrada } = await createConversation(agentId, 'encerrada');
    const fechada = await chamar(
      'POST',
      `/v1/conversations/${encerrada}/labels`,
      comCookie(sessionAgent),
      { etiqueta_id: labelConversation },
    );
    expect(fechada.status).toBe(409);
    expect(await labelsOfConversation(conversationId)).toEqual([]);
  });

  it('Allow API keys with `conversas:escrever` to label any conversation and return 403 without that scope', async () => {
    const { conversationId } = await createConversation(colegaId);
    const byKey = await chamar(
      'POST',
      `/v1/conversations/${conversationId}/labels`,
      withKey(a.token),
      { etiqueta_id: labelConversation },
    );
    expect(byKey.status).toBe(201);
    expect(await labelsOfConversation(conversationId)).toEqual([labelConversation]);

    const withoutScope = await chamar(
      'POST',
      `/v1/conversations/${conversationId}/labels`,
      withKey(a.tokenWithoutScope),
      { etiqueta_id: labelConversation },
    );
    expect(withoutScope.status).toBe(403);
  });
});

describe('GET/POST/DELETE /v1/contacts/:id/etiquetas — o contato', () => {
  it('Apply, list, remove, and audit contact labels with `contato.editar`', async () => {
    const contactId = await createContact();

    const aplicada = await chamar(
      'POST',
      `/v1/contacts/${contactId}/labels`,
      comCookie(sessionAgent),
      { etiqueta_id: labelContact },
    );
    expect(aplicada.status).toBe(201);
    expect(aplicada.corpo).toMatchObject({ etiqueta_id: labelContact, aplicada: true });

    const lista = await chamar('GET', `/v1/contacts/${contactId}/labels`, comCookie(sessionAgent));
    expect(lista.status).toBe(200);
    expect((lista.corpo['etiquetas'] as { id: string }[]).map((e) => e.id)).toEqual([labelContact]);

    const removida = await chamar(
      'DELETE',
      `/v1/contacts/${contactId}/labels/${labelContact}`,
      comCookie(sessionAgent),
    );
    expect(removida.corpo).toEqual({ removida: true });

    const log = await auditoriaDe('contato_etiqueta', contactId);
    expect(log.map((l) => l.acao)).toEqual(['criou', 'excluiu']);
  });

  it('Include contact labels in the conversation screen response (`labelsOfContact`)', async () => {
    const { conversationId, contactId } = await createConversation(agentId);
    await chamar('POST', `/v1/contacts/${contactId}/labels`, comCookie(sessionAgent), {
      etiqueta_id: etiquetaAmbos,
    });
    const tela = await chamar('GET', `/v1/desk/conversations/${conversationId}`, comCookie(sessionAgent));
    const aberta = tela.corpo['aberta'] as {
      labelsOfConversation: { id: string }[];
      labelsOfContact: { id: string }[];
    };
    expect(aberta.labelsOfContact.map((e) => e.id)).toEqual([etiquetaAmbos]);
    // Não vaza para a conversa: são escopos diferentes.
    expect(aberta.etiquetasDaConversa).toEqual([]);
  });

  it('Return 403 without `contato.editar` even with `conversa.etiquetar`, and 400 for a label with the wrong scope', async () => {
    const contatoId = await createContact();
    const semPoder = await chamar(
      'POST',
      `/v1/contacts/${contatoId}/labels`,
      comCookie(sessionColleague),
      { etiqueta_id: labelContact },
    );
    expect(semPoder.status).toBe(403);

    const escopoErrado = await chamar(
      'POST',
      `/v1/contacts/${contatoId}/labels`,
      comCookie(sessionAgent),
      { etiqueta_id: labelConversation },
    );
    expect(escopoErrado.status).toBe(400);
    expect((escopoErrado.corpo['erro'] as { code: string }).codigo).toBe('label_of_other_scope');

    const inexistente = await chamar(
      'POST',
      `/v1/contacts/${randomUUID()}/labels`,
      comCookie(sessionAgent),
      { etiqueta_id: labelContact },
    );
    expect(inexistente.status).toBe(404);
  });

  it('Allow API keys with `contatos:escrever` to apply labels and `contatos:ler` to list them; reject missing scopes', async () => {
    const contatoId = await createContact();
    const aplicada = await chamar('POST', `/v1/contacts/${contatoId}/labels`, withKey(a.token), {
      etiqueta_id: etiquetaAmbos,
    });
    expect(aplicada.status).toBe(201);
    const lista = await chamar('GET', `/v1/contacts/${contatoId}/labels`, withKey(a.token));
    expect((lista.corpo['etiquetas'] as { id: string }[]).map((e) => e.id)).toEqual([etiquetaAmbos]);

    const semEscopo = await chamar('GET', `/v1/contacts/${contatoId}/labels`, withKey(a.tokenWithoutScope));
    expect(semEscopo.status).toBe(403);
  });
});

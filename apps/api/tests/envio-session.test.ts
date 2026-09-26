import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 5).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Replying from the Desk must DELIVER. The defect these tests lock down: the Desk wrote `mensagem` with `estado_entrega='enviada'` without inserting into `outbox_mensagem`. The agent saw the ✓ and the customer received nothing. The fix made the screen use the SAME route as the integration, and what these tests prove is that the route accepts both credentials without loosening any rule.
 */

let cenario: Cenario;
let api: ApiNoAr;
let cookieOfAgent: string;
let otherAgentId: string;
let contactId: string;

beforeAll(async () => {
  cenario = await montarCenario(`envio-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);

  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.agentId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookieOfAgent = novo.token;

  const { rows: outro } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Bruno Colega', ${`bruno-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  otherAgentId = outro[0]!.id;

  const { rows: c } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente do Teste', '+5511955554444')
    returning id
  `);
  contactId = c[0]!.id;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
});

/** An open conversation, with its 24h window still open, assigned to whoever the test asks for. */
async function newConversation(agentId: string | null): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado,
      janela_expira_em, ultima_mensagem_em, ultima_mensagem_de
    ) values (
      ${cenario.tenantId}, ${cenario.inboxId}, ${contactId}, ${cenario.queueId},
      ${agentId}, ${agentId ? 'atribuida' : 'na_fila'},
      now() + interval '20 hours', now(), 'contato'
    )
    returning id
  `);
  return rows[0]!.id;
}

function enviar(
  conversaId: string,
  corpo: Record<string, unknown>,
  credencial: { cookie?: string; token?: string },
): Promise<Response> {
  const cabecalhos: Record<string, string> = { 'content-type': 'application/json' };
  if (credencial.cookie) cabecalhos['cookie'] = `${NOME_DO_COOKIE}=${credencial.cookie}`;
  if (credencial.token) cabecalhos['authorization'] = `Bearer ${credencial.token}`;
  return fetch(`${api.url}/v1/conversations/${conversaId}/messages`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  });
}

async function contarOutbox(conversaId: string): Promise<number> {
  const { rows } = await cenario.dono.execute<{ n: number }>(sql`
    select count(*)::int as n
      from outbox_mensagem o
      join mensagem m on m.id = o.mensagem_id
     where m.conversa_id = ${conversaId}::uuid
  `);
  return rows[0]?.n ?? 0;
}

describe('Send Desk replies with a session cookie', () => {
  it('Create a pending message and outbox row for a Desk reply', async () => {
    const conversationId = await newConversation(cenario.agentId);

    const resposta = await enviar(conversationId, { texto: 'Boa tarde!' }, { cookie: cookieOfAgent });

    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as { id: string; stateDelivery: string };
    // `pendente`, not `enviada`: only Meta's confirmation advances the state.
    expect(corpo.stateDelivery).toBe('pendente');
    expect(await contarOutbox(conversationId)).toBe(1);
  });

  it('Attribute the message to the user identified by the cookie', async () => {
    const conversaId = await newConversation(cenario.agentId);

    await enviar(conversaId, { texto: 'Oi' }, { cookie: cookieOfAgent });

    const { rows } = await cenario.dono.execute<{ autor_tipo: string; authorId: string }>(sql`
      select autor_tipo, autor_id from mensagem where conversa_id = ${conversaId}::uuid limit 1
    `);
    expect(rows[0]?.autor_tipo).toBe('atendente');
    expect(rows[0]?.authorId).toBe(cenario.agentId);
  });

  it('Ignore agent IDs in the request body so users cannot impersonate colleagues (`atendente_id`)', async () => {
    const conversaId = await newConversation(cenario.agentId);

    const resposta = await enviar(
      conversaId,
      { texto: 'Tentando me passar por outro', atendente_id: otherAgentId },
      { cookie: cookieOfAgent },
    );

    expect(resposta.status).toBe(201);
    const { rows } = await cenario.dono.execute<{ authorId: string }>(sql`
      select autor_id from mensagem where conversa_id = ${conversaId}::uuid limit 1
    `);
    expect(rows[0]?.authorId).toBe(cenario.agentId);
    expect(rows[0]?.authorId).not.toBe(otherAgentId);
  });

  it('Record `mensagem_saida` and `primeira_resposta` events for management reports', async () => {
    const conversaId = await newConversation(cenario.agentId);

    await enviar(conversaId, { texto: 'Primeira resposta' }, { cookie: cookieOfAgent });

    const { rows } = await cenario.dono.execute<{ type: string }>(sql`
      select tipo from evento_atendimento where conversa_id = ${conversaId}::uuid order by tipo
    `);
    const tipos = rows.map((r) => r.type);
    expect(tipos).toContain('mensagem_saida');
    expect(tipos).toContain('primeira_resposta');
  });

  it('Reject a Desk reply to another agent\'s conversation', async () => {
    const conversaId = await newConversation(otherAgentId);

    const resposta = await enviar(conversaId, { texto: 'Não é minha' }, { cookie: cookieOfAgent });

    expect(resposta.status).toBe(403);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe('conversation_of_other_agent');
    // And nothing went to the delivery queue.
    expect(await contarOutbox(conversaId)).toBe(0);
  });

  it('Reject sending from an unassigned conversation still in the queue', async () => {
    const conversaId = await newConversation(null);

    const resposta = await enviar(conversaId, { texto: 'Ninguém pegou' }, { cookie: cookieOfAgent });

    expect(resposta.status).toBe(403);
    expect(await contarOutbox(conversaId)).toBe(0);
  });

  it('Return 401 without a session cookie or API key', async () => {
    const conversaId = await newConversation(cenario.agentId);
    const resposta = await enviar(conversaId, { texto: 'anônimo' }, {});
    expect(resposta.status).toBe(401);
  });

  it('cookie forjado, 401', async () => {
    const conversaId = await newConversation(cenario.agentId);
    const resposta = await enviar(conversaId, { texto: 'forjado' }, { cookie: createToken().token });
    expect(resposta.status).toBe(401);
  });
});

describe('Retry failed message sends', () => {
  /** A failed message, with its outbox row also in failure — the real state. */
  async function messageFails(conversationId: string): Promise<string> {
    const { rows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into mensagem (tenant_id, conversa_id, direcao, autor_tipo, autor_id, tipo,
                            conteudo, estado_entrega, erro_codigo, erro_texto)
      values (${cenario.tenantId}, ${conversationId}::uuid, 'saida', 'atendente',
              ${cenario.agentId}, 'texto', 'oi', 'falhou', '131026', 'sem sessão')
      returning id
    `);
    const id = rows[0]!.id;
    await cenario.dono.execute(sql`
      insert into outbox_mensagem (tenant_id, mensagem_id, estado, tentativas,
                                   proxima_tentativa_em, ultimo_erro)
      values (${cenario.tenantId}, ${id}::uuid, 'falhou', 5, now() + interval '1 hour', 'erro')
    `);
    return id;
  }

  function reenviar(conversaId: string, messageId: string): Promise<Response> {
    return fetch(`${api.url}/v1/conversations/${conversaId}/messages/${messageId}/resend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookieOfAgent}` },
    });
  }

  it('devolve a linha do OUTBOX para pendente — sem isso nada era reentregue', async () => {
    const conversaId = await newConversation(cenario.agentId);
    const messageId = await messageFails(conversaId);

    const resposta = await reenviar(conversaId, messageId);

    expect(resposta.status).toBe(201);
    const { rows } = await cenario.dono.execute<{
      state: string;
      tentativas: number;
      proxima_tentativa_em: Date | null;
    }>(sql`
      select estado, tentativas, proxima_tentativa_em from outbox_mensagem
       where mensagem_id = ${messageId}::uuid
    `);
    // This is exactly what the screen used to fail to do: it touched only `mensagem`, and the
    // worker reivindica pelo estado do OUTBOX.
    expect(rows[0]!.state).toBe('pendente');
    // Backoff reset to zero: clicking means the person said the cause was resolved.
    expect(rows[0]!.tentativas).toBe(0);
    expect(rows[0]!.proxima_tentativa_em).toBeNull();
  });

  it('Clear the message error on retry without marking it delivered', async () => {
    const conversaId = await newConversation(cenario.agentId);
    const mensagemId = await messageFails(conversaId);

    await reenviar(conversaId, mensagemId);

    const { rows } = await cenario.dono.execute<{
      stateDelivery: string;
      errorCode: string | null;
      entregueAt: Date | null;
    }>(sql`
      select estado_entrega, erro_codigo, entregue_em from mensagem where id = ${mensagemId}::uuid
    `);
    expect(rows[0]!.stateDelivery).toBe('pendente');
    expect(rows[0]!.errorCode).toBeNull();
    // `entregue_em` is the time Meta confirmed. Setting it here would fabricate evidence.
    expect(rows[0]!.entregueAt).toBeNull();
  });

  it('Recreate an outbox row for an old message that never had one', async () => {
    // The signature of the old defect: the screen wrote the message and enqueued nothing.
    const conversaId = await newConversation(cenario.agentId);
    const { rows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into mensagem (tenant_id, conversa_id, direcao, autor_tipo, autor_id, tipo,
                            conteudo, estado_entrega)
      values (${cenario.tenantId}, ${conversaId}::uuid, 'saida', 'atendente',
              ${cenario.agentId}, 'texto', 'órfã', 'falhou')
      returning id
    `);
    const mensagemId = rows[0]!.id;

    expect((await reenviar(conversaId, mensagemId)).status).toBe(201);

    const { rows: outbox } = await cenario.dono.execute<{ state: string }>(
      sql`select estado from outbox_mensagem where mensagem_id = ${mensagemId}::uuid`,
    );
    expect(outbox[0]?.state).toBe('pendente');
  });

  it('Reject retries for messages that are not failed', async () => {
    const conversaId = await newConversation(cenario.agentId);
    const { rows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into mensagem (tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo,
                            estado_entrega)
      values (${cenario.tenantId}, ${conversaId}::uuid, 'saida', 'sistema', 'texto', 'ok',
              'entregue')
      returning id
    `);
    const resposta = await reenviar(conversaId, rows[0]!.id);
    expect(resposta.status).toBe(409);
    expect(((await resposta.json()) as { error: { code: string } }).error.code).toBe(
      'message_not_failed',
    );
  });
});

describe('resposta pronta carimbada no mesmo insert', () => {
  it('Store `resposta_pronta_id` with the message', async () => {
    const conversaId = await newConversation(cenario.agentId);
    const { rows: r } = await cenario.dono.execute<{ id: string }>(sql`
      insert into resposta_pronta (tenant_id, escopo, atalho, titulo, corpo)
      values (${cenario.tenantId}, 'empresa', '/ola', 'Saudação', 'Olá!')
      returning id
    `);
    const respostaProntaId = r[0]!.id;

    await enviar(
      conversaId,
      { texto: 'Olá!', resposta_pronta_id: respostaProntaId },
      { cookie: cookieOfAgent },
    );

    const { rows } = await cenario.dono.execute<{ resposta_pronta_id: string | null }>(
      sql`select resposta_pronta_id from mensagem where conversa_id = ${conversaId}::uuid limit 1`,
    );
    // Previously this came from a SECOND write after sending, and it vanished whenever
    // aquela escrita falhava.
    expect(rows[0]!.resposta_pronta_id).toBe(respostaProntaId);
  });
});

describe('Preserve API-key behavior on the same send route', () => {
  it('Keep API-key sends and request-body agent IDs working (`atendente_id`)', async () => {
    const conversaId = await newConversation(otherAgentId);

    // An API key is NOT an agent: the "conversation assigned to you" rule does not apply,
    // because an integration has no owner. That is why this request succeeds where the cookie was rejected.
    const resposta = await enviar(
      conversaId,
      { texto: 'Da integração', atendente_id: otherAgentId },
      { token: cenario.token },
    );

    expect(resposta.status).toBe(201);
    expect(await contarOutbox(conversaId)).toBe(1);
    const { rows } = await cenario.dono.execute<{ authorId: string }>(sql`
      select autor_id from mensagem where conversa_id = ${conversaId}::uuid limit 1
    `);
    expect(rows[0]?.authorId).toBe(otherAgentId);
  });

  it('Return 403 without the message write scope (`mensagens:escrever`)', async () => {
    const conversaId = await newConversation(cenario.agentId);
    const resposta = await enviar(conversaId, { texto: 'x' }, { token: cenario.tokenWithoutScope });
    expect(resposta.status).toBe(403);
  });

  it('Bearer inválido não cai no caminho do cookie', async () => {
    // The trap in a route that accepts two credentials: if the wrong Bearer token were
    // ignorado, bastaria mandar lixo no header para ser tratado como visitante — e,
    // accepted alongside a valid cookie, it would impersonate the person. A Bearer token, once present, must be verified.
    const conversaId = await newConversation(cenario.agentId);
    const resposta = await fetch(`${api.url}/v1/conversations/${conversaId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer pipe_lixo_lixo',
        cookie: `${NOME_DO_COOKIE}=${cookieOfAgent}`,
      },
      body: JSON.stringify({ texto: 'x' }),
    });
    expect(resposta.status).toBe(401);
  });
});

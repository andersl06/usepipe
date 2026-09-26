import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 17).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Transfer: closes the conversation and opens another one at the destination. This is not a state transition — it is decided in `packages/core/src/conversa/maquina.ts` ("Transfer is not a transition: it closes the conversation … and opens another at the destination"), which is Blip's rule. These tests lock down the consequences that hurt if forgotten: the inherited 24h window, the closing event with `encerrada_por = transferencia`, and the `atribuicao` row that stitches the two together.
 */

let cenario: Cenario;
let api: ApiNoAr;
let cookie: string;
let contactId: string;
let otherAgentId: string;
let otherQueueId: string;

beforeAll(async () => {
  cenario = await montarCenario(`transf-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);

  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.agentId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookie = novo.token;

  const { rows: c } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente Transf', '+5511933332222') returning id
  `);
  contactId = c[0]!.id;

  const { rows: u } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Davi Destino', ${`davi-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  otherAgentId = u[0]!.id;

  const { rows: f } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fila (tenant_id, nome) values (${cenario.tenantId}, ${`Financeiro ${randomUUID().slice(0, 6)}`})
    returning id
  `);
  otherQueueId = f[0]!.id;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
});

async function newConversation(
  agentId: string | null = cenario.agentId,
  state = 'em_atendimento',
): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, prioridade,
      janela_expira_em, ultima_mensagem_em, ultima_mensagem_de, atribuida_em,
      primeira_resposta_em, em_espera_desde
    ) values (
      ${cenario.tenantId}, ${cenario.inboxId}, ${contactId}, ${cenario.queueId},
      ${agentId}, ${state}, 'alta',
      now() + interval '20 hours', now() - interval '5 minutes', 'contato',
      now() - interval '10 minutes', now() - interval '8 minutes',
      ${state === 'em_espera' ? sql`now() - interval '30 seconds'` : null}
    ) returning id
  `);
  return rows[0]!.id;
}

function transferir(conversationId: string, corpo: Record<string, unknown>): Promise<Response> {
  return fetch(`${api.url}/v1/conversations/${conversationId}/transfer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
    body: JSON.stringify(corpo),
  });
}

async function conversation(id: string) {
  const { rows } = await cenario.dono.execute<{
    state: string;
    queueId: string | null;
    agentId: string | null;
    priority: string;
    encerrada_em: Date | null;
    reasonClosure: string | null;
    windowExpiresAt: Date | null;
    firstResponseAt: Date | null;
    lastMessageOf: string | null;
  }>(sql`
    select estado, fila_id, atendente_id, prioridade, encerrada_em, motivo_encerramento,
           janela_expira_em, primeira_resposta_em, ultima_mensagem_de
      from conversa where id = ${id}::uuid
  `);
  return rows[0]!;
}

async function eventosDe(id: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ type: string }>(
    sql`select tipo from evento_atendimento where conversa_id = ${id}::uuid order by em, tipo`,
  );
  return rows.map((r) => r.type);
}

describe('Transfer a conversation to a queue', () => {
  it('Close the old conversation and open one in the destination queue', async () => {
    const antiga = await newConversation();

    const resposta = await transferir(antiga, { para_fila_id: otherQueueId, motivo: 'Setor errado' });

    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as { ofConversationId: string; forConversationId: string; state: string };
    expect(corpo.ofConversationId).toBe(antiga);
    expect(corpo.state).toBe('na_fila');

    expect((await conversation(antiga)).state).toBe('encerrada');
    const nova = await conversation(corpo.forConversationId);
    expect(nova.state).toBe('na_fila');
    expect(nova.queueId).toBe(otherQueueId);
    expect(nova.agentId).toBeNull();
  });

  it('Mark the old conversation with `encerrada_por = transfer`', async () => {
    const antiga = await newConversation();
    await transferir(antiga, { para_fila_id: otherQueueId });

    expect((await conversation(antiga)).reasonClosure).toBe('Transferida');
    const { rows } = await cenario.dono.execute<{ data: Record<string, string> }>(sql`
      select dados from evento_atendimento
       where conversa_id = ${antiga}::uuid and tipo = 'encerrada' limit 1
    `);
    // This is what separates, in the report, a conversation that ENDED from one that just changed hands.
    expect(rows[0]?.data['encerrada_por']).toBe('transferencia');
  });

  it('Carry the 24-hour messaging window into the transferred conversation', async () => {
    const antiga = await newConversation();
    const antes = await conversation(antiga);

    const r = await transferir(antiga, { para_fila_id: otherQueueId });
    const { forConversationId } = (await r.json()) as { forConversationId: string };

    const nova = await conversation(forConversationId);
    expect(nova.windowExpiresAt).not.toBeNull();
    expect(new Date(nova.windowExpiresAt!).getTime()).toBe(
      new Date(antes.windowExpiresAt!).getTime(),
    );
    // And the last message too, otherwise automatic closure would treat the new one as newborn.
    expect(nova.lastMessageOf).toBe('contato');
  });

  it('Carry priority but not first-response time into the new conversation', async () => {
    const antiga = await newConversation();

    const r = await transferir(antiga, { para_fila_id: otherQueueId });
    const { forConversationId } = (await r.json()) as { forConversationId: string };
    const nova = await conversation(forConversationId);

    expect(nova.priority).toBe('alta');
    // The receiving agent's TMR measures the receiving agent — the cost of Blip's model.
    expect(nova.firstResponseAt).toBeNull();
  });

  it('Link the old and new conversations through an `assignment` row', async () => {
    const antiga = await newConversation();
    await transferir(antiga, { para_fila_id: otherQueueId, motivo: 'Setor errado' });

    const { rows } = await cenario.dono.execute<{
      ofQueueId: string;
      forQueueId: string;
      ofUserId: string | null;
      reason: string | null;
      byUserId: string;
    }>(sql`select * from atribuicao where conversa_id = ${antiga}::uuid`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.forQueueId).toBe(otherQueueId);
    expect(rows[0]!.ofQueueId).toBe(cenario.queueId);
    expect(rows[0]!.ofUserId).toBe(cenario.agentId);
    expect(rows[0]!.reason).toBe('Setor errado');
    expect(rows[0]!.byUserId).toBe(cenario.agentId);
  });

  it('Record `criada` and `transferida_fila` on a queue transfer', async () => {
    const antiga = await newConversation();
    const r = await transferir(antiga, { para_fila_id: otherQueueId });
    const { forConversationId } = (await r.json()) as { forConversationId: string };

    const eventos = await eventosDe(forConversationId);
    expect(eventos).toContain('criada');
    expect(eventos).toContain('transferida_fila');
  });
});

describe('Transfer a conversation to an agent', () => {
  it('Assign the new conversation immediately and record `atribuida`', async () => {
    const antiga = await newConversation();

    const r = await transferir(antiga, { para_atendente_id: otherAgentId });
    const corpo = (await r.json()) as { forConversationId: string; state: string };

    expect(corpo.state).toBe('atribuida');
    const nova = await conversation(corpo.forConversationId);
    expect(nova.agentId).toBe(otherAgentId);
    expect(await eventosDe(corpo.forConversationId)).toContain('atribuida');
  });

  it('fecha a espera em aberto antes de transferir', async () => {
    const antiga = await newConversation(cenario.agentId, 'em_espera');

    await transferir(antiga, { para_atendente_id: otherAgentId });

    expect(await eventosDe(antiga)).toContain('espera_encerrada');
    const { rows } = await cenario.dono.execute<{ pausadoSeg: number }>(
      sql`select pausado_seg from conversa where id = ${antiga}::uuid`,
    );
    expect(rows[0]!.pausadoSeg).toBeGreaterThan(0);
  });
});

describe('recusas', () => {
  it('Require exactly one transfer destination', async () => {
    const antiga = await newConversation();
    expect((await transferir(antiga, {})).status).toBe(400);
    expect(
      (await transferir(antiga, { para_fila_id: otherQueueId, para_atendente_id: otherAgentId }))
        .status,
    ).toBe(400);
  });

  it('Reject transfer to the current destination', async () => {
    const antiga = await newConversation();
    const resposta = await transferir(antiga, { para_atendente_id: cenario.agentId });
    expect(resposta.status).toBe(409);
  });

  it('Reject missing destination queues and agents', async () => {
    const antiga = await newConversation();
    expect((await transferir(antiga, { para_fila_id: randomUUID() })).status).toBe(404);
    expect((await transferir(antiga, { para_atendente_id: randomUUID() })).status).toBe(404);
  });

  it('Reject transfer of an already closed conversation', async () => {
    const antiga = await newConversation();
    await transferir(antiga, { para_fila_id: otherQueueId });
    expect((await transferir(antiga, { para_fila_id: cenario.queueId })).status).toBe(409);
  });

  it('Require `conversa.transferir` to transfer another agent\'s conversation', async () => {
    // This is the difference between an agent and a supervisor: transferring your own conversation does not require
    // the permission; transferring someone else's does.
    const deOutro = await newConversation(otherAgentId);
    const resposta = await transferir(deOutro, { para_fila_id: otherQueueId });
    expect(resposta.status).toBe(403);
    expect((await conversation(deOutro)).state).toBe('em_atendimento');
  });

  it('Allow a permitted supervisor to transfer another agent\'s conversation', async () => {
    const { rows: p } = await cenario.dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome) values (${cenario.tenantId}, ${`Supervisor ${randomUUID().slice(0, 6)}`})
      returning id
    `);
    const roleId = p[0]!.id;
    // `conversa.transferir` already comes from the seed data (`packages/db/src/semente.ts`): the
    // permission is a global catalog entry, not tenant-specific data.
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${roleId}, 'conversa.transferir') on conflict do nothing
    `);
    await cenario.dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id)
      values (${cenario.tenantId}, ${cenario.agentId}, ${roleId}) on conflict do nothing
    `);

    const deOutro = await newConversation(otherAgentId);
    const resposta = await transferir(deOutro, { para_fila_id: otherQueueId });

    expect(resposta.status).toBe(201);
    expect((await conversation(deOutro)).state).toBe('encerrada');
  });
});

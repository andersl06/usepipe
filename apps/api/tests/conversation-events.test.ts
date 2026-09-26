import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 11).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Closing and pausing have to record `evento_atendimento`.
 *
 * The bug these tests lock down: the Desk used to write directly to the `conversa` table and record no event at all. TMR, SLA and effort were blind to everything the agent did — Management showed a wrong number that looked right.
 *
 * Metrics come from `evento_atendimento`, which is immutable (data model §4); the conversation's state is a cache. That's why the assertion is always on the event, never on the column.
 */

let cenario: Cenario;
let api: ApiNoAr;
let cookie: string;
let etiquetaId: string;
let contactId: string;
let otherAgentId: string;

beforeAll(async () => {
  cenario = await montarCenario(`eventos-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);

  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.agentId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookie = novo.token;

  const { rows: e } = await cenario.dono.execute<{ id: string }>(sql`
    insert into etiqueta (tenant_id, nome, obrigatoria_no_encerramento)
    values (${cenario.tenantId}, 'Resolvido', true) returning id
  `);
  etiquetaId = e[0]!.id;

  const { rows: c } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente Eventos', '+5511944443333')
    returning id
  `);
  contactId = c[0]!.id;

  const { rows: o } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Carla Colega', ${`carla-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  otherAgentId = o[0]!.id;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
});

async function newConversation(
  state: string,
  agentId: string | null = cenario.agentId,
): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado,
      em_espera_desde, janela_expira_em
    ) values (
      ${cenario.tenantId}, ${cenario.inboxId}, ${contactId}, ${cenario.queueId},
      ${agentId}, ${state},
      ${state === 'em_espera' ? sql`now() - interval '30 seconds'` : null},
      now() + interval '20 hours'
    )
    returning id
  `);
  return rows[0]!.id;
}

function chamar(caminho: string, corpo?: unknown): Promise<Response> {
  return fetch(`${api.url}${caminho}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
    body: JSON.stringify(corpo ?? {}),
  });
}

async function eventosDe(conversationId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ type: string }>(sql`
    select tipo as type from evento_atendimento where conversa_id = ${conversationId}::uuid order by em, tipo
  `);
  return rows.map((r) => r.type);
}

describe('Close conversations and record their events', () => {
  it('Record the `encerrada` event so reports recognize conversation closure', async () => {
    const id = await newConversation('em_atendimento');

    const resposta = await chamar(`/v1/conversations/${id}/close`, { etiqueta_id: etiquetaId });

    expect(resposta.status).toBe(201);
    expect(await eventosDe(id)).toContain('encerrada');
  });

  it('Record who closed a conversation and which label was used in its event', async () => {
    const id = await newConversation('em_atendimento');

    await chamar(`/v1/conversations/${id}/close`, { etiqueta_id: etiquetaId });

    const { rows } = await cenario.dono.execute<{ userId: string; data: Record<string, string> }>(sql`
      select usuario_id as "userId", dados as data from evento_atendimento
       where conversa_id = ${id}::uuid and tipo = 'encerrada' limit 1
    `);
    expect(rows[0]?.userId).toBe(cenario.agentId);
    expect(rows[0]?.data['encerrada_por']).toBe('atendente');
    expect(rows[0]?.data['etiqueta']).toBe('Resolvido');
  });

  it('Record all selected labels and retain the first as the legacy event reason', async () => {
    const id = await newConversation('em_atendimento');
    const { rows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into etiqueta (tenant_id, nome) values (${cenario.tenantId}, 'Dúvida') returning id
    `);
    const resposta = await chamar(`/v1/conversations/${id}/close`, {
      etiqueta_ids: [etiquetaId, rows[0]!.id],
    });
    expect(resposta.status).toBe(201);
    const { rows: associadas } = await cenario.dono.execute<{ name: string }>(sql`
      select e.nome as name from conversa_etiqueta ce join etiqueta e on e.id = ce.etiqueta_id
       where ce.conversa_id = ${id}::uuid order by e.nome
    `);
    expect(associadas.map((etiqueta) => etiqueta.name)).toEqual(['Dúvida', 'Resolvido']);
  });

  it('Require a label when closing a conversation to preserve its reason', async () => {
    const id = await newConversation('em_atendimento');
    const resposta = await chamar(`/v1/conversations/${id}/close`, {});
    expect(resposta.status).toBe(400);
    expect(await eventosDe(id)).toHaveLength(0);
  });

  it('End an active wait before closing a conversation so paused time counts toward effort', async () => {
    const id = await newConversation('em_espera');

    await chamar(`/v1/conversations/${id}/close`, { etiqueta_id: etiquetaId });

    const eventos = await eventosDe(id);
    expect(eventos).toContain('espera_encerrada');
    expect(eventos).toContain('encerrada');
    const { rows } = await cenario.dono.execute<{ pausadoSeg: number }>(
      sql`select pausado_seg as "pausadoSeg" from conversa where id = ${id}::uuid`,
    );
    expect(rows[0]!.pausadoSeg).toBeGreaterThan(0);
  });

  it('Reject closing a conversation that is already closed', async () => {
    const id = await newConversation('encerrada');
    const resposta = await chamar(`/v1/conversations/${id}/close`, { etiqueta_id: etiquetaId });
    expect(resposta.status).toBe(409);
  });

  it('Reject closure of another agent\'s conversation', async () => {
    const id = await newConversation('em_atendimento', otherAgentId);
    const resposta = await chamar(`/v1/conversations/${id}/close`, { etiqueta_id: etiquetaId });
    expect(resposta.status).toBe(403);
    expect(await eventosDe(id)).toHaveLength(0);
  });

  it('Allow a supervisor to close another agent\'s conversation', async () => {
    const { rows: p } = await cenario.dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome) values (${cenario.tenantId}, ${`Supervisor ${randomUUID().slice(0, 6)}`})
      returning id
    `);
    const roleId = p[0]!.id;
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${roleId}, 'conversa.encerrar') on conflict do nothing
    `);
    await cenario.dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id)
      values (${cenario.tenantId}, ${cenario.agentId}, ${roleId}) on conflict do nothing
    `);

    const id = await newConversation('em_atendimento', otherAgentId);
    expect((await chamar(`/v1/conversations/${id}/close`, { etiqueta_id: etiquetaId })).status).toBe(201);
    expect(await eventosDe(id)).toContain('encerrada');
  });
});

describe('espera', () => {
  it('Record `espera_iniciada` when a conversation enters the waiting state', async () => {
    const id = await newConversation('em_atendimento');

    const resposta = await chamar(`/v1/conversations/${id}/wait`);

    expect(resposta.status).toBe(201);
    expect(((await resposta.json()) as { estado: string }).estado).toBe('em_espera');
    expect(await eventosDe(id)).toContain('espera_iniciada');
  });

  it('sair da espera grava `espera_encerrada` com os segundos pausados', async () => {
    const id = await newConversation('em_espera');

    const resposta = await chamar(`/v1/conversations/${id}/wait`);
    const corpo = (await resposta.json()) as { estado: string; pausado_seg: number };

    expect(corpo.estado).toBe('em_atendimento');
    // // The conversation was born with `em_espera_desde` 30 seconds ago.
    expect(corpo.pausado_seg).toBeGreaterThanOrEqual(29);
    const { rows } = await cenario.dono.execute<{ data: Record<string, number> }>(sql`
      select dados as data from evento_atendimento
       where conversa_id = ${id}::uuid and tipo = 'espera_encerrada' limit 1
    `);
    expect(rows[0]?.data['pausado_seg']).toBeGreaterThanOrEqual(29);
  });

  it('Record both wait transitions and accumulated waiting time on the conversation', async () => {
    const id = await newConversation('em_atendimento');

    await chamar(`/v1/conversations/${id}/wait`);
    await chamar(`/v1/conversations/${id}/wait`);

    const eventos = await eventosDe(id);
    expect(eventos.filter((t) => t === 'espera_iniciada')).toHaveLength(1);
    expect(eventos.filter((t) => t === 'espera_encerrada')).toHaveLength(1);
  });

  it('Reject closure of another agent\'s conversation', async () => {
    const id = await newConversation('em_atendimento', otherAgentId);
    const resposta = await chamar(`/v1/conversations/${id}/wait`);
    expect(resposta.status).toBe(403);
    expect(await eventosDe(id)).toHaveLength(0);
  });
});

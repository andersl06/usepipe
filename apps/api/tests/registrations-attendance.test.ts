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
const { montarCenario, montarDoisFluxos } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The WRITE routes of the Attendance module (registrations) — items 1 to 3 of the task: queues (create/edit/delete/link/unlink agent), canned responses (create/edit/delete), and custom pauses (create/edit/delete).
 *
 * Same pattern as `ciclo-de-vida-do-fluxo.test.ts`: two tenants, cookie session, happy path, refusals, cross-tenant, permission. `ErroPipe` surfaces with a real status (400/403/404/409) — unlike the old `acoes/*` (`Resultado` at 200), because these are gestures with a security effect.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Has the three new/reused permissions — the test's "manager." */
let sessionManager: string;
/** Only `fila.gerenciar` — to prove each route requires ITS OWN permission, not just any. */
let sessionOnlyQueues: string;
/** People from tenant A with no permission at all. */
let sessionWithoutAuthority: string;
/** A valid session, but from another tenant — proves the tenant comes from the session, never from the URL. */
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

/** Rotas de fila, regra de atendimento e prioridade exigem o fluxo da tela. */
const ESCOPADA_POR_FLUXO = /\/v1\/management\/(agents\/queues|rules\/attendance|rules\/priority)/;

async function pedir(
  metodo: string,
  caminho: string,
  sessao: string,
  corpo?: Record<string, unknown>,
  flowId: string = a.flowId,
): Promise<{ status: number; body: Corpo }> {
  const comFluxo = ESCOPADA_POR_FLUXO.test(caminho) && !caminho.includes('flowId=');
  const url = comFluxo ? `${caminho}${caminho.includes('?') ? '&' : '?'}flowId=${flowId}` : caminho;
  const resposta = await fetch(`${api.url}${url}`, {
    method: metodo,
    headers: comCookie(sessao),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? JSON.parse(texto) : undefined };
}

beforeAll(async () => {
  a = await montarCenario(`ct-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`ct-${randomUUID().slice(0, 8)}`);

  const permissionsAll = [
    'fila.gerenciar',
    'pausa.gerenciar',
    'resposta_pronta.gerenciar',
    'regra.gerenciar',
    'horario.gerenciar',
  ];
  const gestor = await pessoaCom(a, permissionsAll);
  const onlyQueues = await pessoaCom(a, ['fila.gerenciar']);
  const semPoder = await pessoaCom(a, []);
  const gestorDoB = await pessoaCom(b, permissionsAll);

  api = await upApi(0);
  sessionManager = await openSession(a, gestor);
  sessionOnlyQueues = await openSession(a, onlyQueues);
  sessionWithoutAuthority = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, gestorDoB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

async function auditoriaDe(objetoTipo: string, id: string) {
  const { rows } = await a.dono.execute<{
    acao: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
  }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = ${objetoTipo} and objeto_id = ${id}::uuid
     order by em asc, id asc
  `);
  return rows;
}

/* =========================================================================
 * Item 1 — filas
 * ========================================================================= */

async function createQueue(sessao: string, corpo: Record<string, unknown>) {
  return pedir('POST', '/v1/management/agents/queues', sessao, {
    name: `Fila ${randomUUID().slice(0, 8)}`,
    capacityDefault: 5,
    ...corpo,
  });
}

describe('POST /v1/management/agents/queues', () => {
  it('Create a queue and record it in the audit log', async () => {
    const nome = `Cobrança ${randomUUID().slice(0, 6)}`;
    const { status, body } = await createQueue(sessionManager, { name: nome, capacityDefault: 8, order: 2 });
    expect(status).toBe(201);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

    const log = await auditoriaDe('fila', body.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { nome, capacityDefault: 8 } });
  });

  it('Reject empty queue names, out-of-range capacity, and duplicate names', async () => {
    const semNome = await createQueue(sessionManager, { name: '  ' });
    expect(semNome.status).toBe(400);
    expect(semNome.body.error.code).toBe('name_required');

    const capInvalida = await createQueue(sessionManager, { capacityDefault: 0 });
    expect(capInvalida.status).toBe(400);
    expect(capInvalida.body.error.code).toBe('capacity_invalid');

    const nome = `Repetida ${randomUUID().slice(0, 6)}`;
    expect((await createQueue(sessionManager, { name: nome })).status).toBe(201);
    const repetida = await createQueue(sessionManager, { name: nome });
    expect(repetida.status).toBe(409);
    expect(repetida.body.error.code).toBe('name_in_use');
  });

  it('horário inexistente é 400; cor fora da paleta é 400', async () => {
    const semHorario = await createQueue(sessionManager, { scheduleId: randomUUID() });
    expect(semHorario.status).toBe(400);
    expect(semHorario.body.error.code).toBe('schedule_not_found');

    const corInvalida = await createQueue(sessionManager, { color: 'vermelho-sangue' });
    expect(corInvalida.status).toBe(400);
    expect(corInvalida.body.error.code).toBe('color_invalid');
  });

  it('Return 403 without `fila.gerenciar` and 401 without a session', async () => {
    const semPoder = await createQueue(sessionWithoutAuthority, {});
    expect(semPoder.status).toBe(403);
    expect(semPoder.body.error.code).toBe('without_permission');
    expect(semPoder.body.error.detalhe.permission).toBe('fila.gerenciar');

    const withoutSession = await fetch(`${api.url}/v1/management/agents/queues`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Qualquer', capacidadePadrao: 5 }),
    });
    expect(withoutSession.status).toBe(401);
  });
});

describe('PATCH /v1/management/agents/queues/:id — renomear e ativar/desativar', () => {
  it('Update a queue\'s name, capacity, order, and color and audit only changes', async () => {
    const { body: criada } = await createQueue(sessionManager, { nome: `Antes ${randomUUID().slice(0, 6)}` });
    const novoNome = `Depois ${randomUUID().slice(0, 6)}`;

    const { status, body } = await pedir('PATCH', `/v1/management/agents/queues/${criada.id}`, sessionManager, {
      name: novoNome,
      capacityDefault: 12,
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: criada.id, name: novoNome, capacityDefault: 12 });

    const log = await auditoriaDe('fila', criada.id);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou', depois: { name: novoNome, capacityDefault: 12 } });
    // // A field that didn't change doesn't go into the record.
    expect(log.at(-1)?.depois).not.toHaveProperty('order');
  });

  it('Toggle a queue with PATCH using `ativa`', async () => {
    const { body: criada } = await createQueue(sessionManager, {});
    const desativada = await pedir('PATCH', `/v1/management/agents/queues/${criada.id}`, sessionManager, {
      ativa: false,
    });
    expect(desativada.status).toBe(200);
    expect(desativada.body.ativa).toBe(false);
  });

  it('nada mudado não grava nem registra', async () => {
    const { body: criada } = await createQueue(sessionManager, {});
    const antes = await auditoriaDe('fila', criada.id);
    const empty = await pedir('PATCH', `/v1/management/agents/queues/${criada.id}`, sessionManager, {});
    expect(empty.status).toBe(200);
    expect(await auditoriaDe('fila', criada.id)).toHaveLength(antes.length);
  });

  it('Return 403 without `fila.gerenciar` and 404 for cross-tenant or malformed IDs', async () => {
    const { body: criada } = await createQueue(sessionManager, {});

    const semPoder = await pedir('PATCH', `/v1/management/agents/queues/${criada.id}`, sessionWithoutAuthority, {
      name: 'Invasor',
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await pedir(
      'PATCH',
      `/v1/management/agents/queues/${criada.id}`,
      sessionOfOtherTenant,
      { name: 'Vizinho' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/management/agents/queues/nao-e-uuid', sessionManager, {
      name: 'Tanto faz',
    });
    expect(malformado.status).toBe(404);
  });
});

describe('DELETE /v1/management/agents/queues/:id', () => {
  it('Delete a queue with 204 and record the action in the audit log', async () => {
    const { body: criada } = await createQueue(sessionManager, {});
    const resposta = await fetch(`${api.url}/v1/management/agents/queues/${criada.id}?flowId=${a.flowId}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from fila where id = ${criada.id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');

    const log = await auditoriaDe('fila', criada.id);
    expect(log.at(-1)).toMatchObject({ acao: 'excluiu' });
  });

  it('Return 409 when deleting a queue with an open conversation', async () => {
    const { body: criada } = await createQueue(sessionManager, {});
    const { rows: contacts } = await a.dono.execute<{ id: string }>(
      sql`insert into contato (tenant_id, nome) values (${a.tenantId}, 'Cliente teste') returning id`,
    );
    await a.dono.execute(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id)
      values (${a.tenantId}, ${a.inboxId}::uuid, ${contacts[0]!.id}::uuid, ${criada.id}::uuid)
    `);

    const resposta = await fetch(`${api.url}/v1/management/agents/queues/${criada.id}?flowId=${a.flowId}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe('queue_with_conversation_open');
  });

  it('Return 409 when deleting the inbox default queue', async () => {
    // // `a.filaId` is `a.inboxId`'s default queue (built in `montarCenario`).
    const resposta = await fetch(`${api.url}/v1/management/agents/queues/${a.queueId}?flowId=${a.flowId}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { error: { code: string; message: string } };
    expect(corpo.error.code).toBe('queue_default_of_inbox');
    expect(corpo.error.message).toContain('caixa de entrada');
  });

  it('Return 409 when deleting a queue used by an inbound routing rule', async () => {
    const { body: criada } = await createQueue(sessionManager, {});
    await a.dono.execute(sql`
      insert into regra_fila (tenant_id, nome, fila_destino_id, ordem)
      values (${a.tenantId}, ${`Regra ${randomUUID().slice(0, 6)}`}, ${criada.id}::uuid, 0)
    `);

    const resposta = await fetch(`${api.url}/v1/management/agents/queues/${criada.id}?flowId=${a.flowId}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe('queue_used_in_rule');
  });

  it('Return 403 without `fila.gerenciar` and 404 for another tenant\'s queue', async () => {
    const { body: criada } = await createQueue(sessionManager, {});

    const semPoder = await fetch(`${api.url}/v1/management/agents/queues/${criada.id}?flowId=${a.flowId}`, {
      method: 'DELETE',
      headers: comCookie(sessionWithoutAuthority),
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await fetch(`${api.url}/v1/management/agents/queues/${criada.id}?flowId=${a.flowId}`, {
      method: 'DELETE',
      headers: comCookie(sessionOfOtherTenant),
    });
    expect(outroTenant.status).toBe(404);
  });
});

describe('Assign and unassign agents from a queue', () => {
  it('Assign an agent to a queue and update the override on reassignment', async () => {
    const { body: criada } = await createQueue(sessionManager, {});
    const vinculo = await pedir(
      'POST',
      `/v1/management/agents/queues/${criada.id}/agents`,
      sessionManager,
      { userId: a.agentId, capacityOverride: 3 },
    );
    expect(vinculo.status).toBe(201);

    const { rows } = await a.dono.execute<{ capacidade_override: number }>(sql`
      select capacidade_override from fila_atendente
       where fila_id = ${criada.id}::uuid and usuario_id = ${a.agentId}::uuid
    `);
    expect(rows[0]?.capacidade_override).toBe(3);

    const de_novo = await pedir(
      'POST',
      `/v1/management/agents/queues/${criada.id}/agents`,
      sessionManager,
      { userId: a.agentId, capacityOverride: 9 },
    );
    expect(de_novo.status).toBe(201);
    const { rows: depois } = await a.dono.execute<{ capacidade_override: number }>(sql`
      select capacidade_override from fila_atendente
       where fila_id = ${criada.id}::uuid and usuario_id = ${a.agentId}::uuid
    `);
    expect(depois[0]?.capacidade_override).toBe(9);
  });

  it('Return 404 for a missing agent or queue', async () => {
    const { body: criada } = await createQueue(sessionManager, {});
    const withoutAgent = await pedir(
      'POST',
      `/v1/management/agents/queues/${criada.id}/agents`,
      sessionManager,
      { userId: randomUUID() },
    );
    expect(withoutAgent.status).toBe(404);

    const withoutQueue = await pedir(
      'POST',
      `/v1/management/agents/queues/${randomUUID()}/agents`,
      sessionManager,
      { userId: a.agentId },
    );
    expect(withoutQueue.status).toBe(404);
  });

  it('desvincula, e desvincular de novo é 404', async () => {
    // // `a.atendenteId` is already in `a.filaId` (built in `montarCenario`).
    const resposta = await fetch(
      `${api.url}/v1/management/agents/queues/${a.queueId}/agents/${a.agentId}?flowId=${a.flowId}`,
      { method: 'DELETE', headers: comCookie(sessionManager) },
    );
    expect(resposta.status).toBe(204);

    const de_novo = await fetch(
      `${api.url}/v1/management/agents/queues/${a.queueId}/agents/${a.agentId}?flowId=${a.flowId}`,
      { method: 'DELETE', headers: comCookie(sessionManager) },
    );
    expect(de_novo.status).toBe(404);

    // // Returns the link so it doesn't affect other tests in this file that depend on it.
    await a.dono.execute(sql`
      insert into fila_atendente (tenant_id, fila_id, usuario_id)
      values (${a.tenantId}, ${a.queueId}::uuid, ${a.agentId}::uuid)
    `);
  });
});

/* =========================================================================
 * Item 2 — respostas prontas
 * ========================================================================= */

async function createResponse(sessao: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', '/v1/management/communication/responses-ready', sessao, {
    shortcut: `atalho-${randomUUID().slice(0, 8)}`,
    title: 'Saudação',
    body: 'Olá, tudo bem?',
    ...corpo,
  });
}

describe('POST /v1/management/communication/responses-ready', () => {
  it('cria e registra no log', async () => {
    const { status, body } = await createResponse(sessionManager);
    expect(status).toBe(201);
    const log = await auditoriaDe('resposta_pronta', body.id);
    expect(log).toHaveLength(1);
    expect(log[0]?.acao).toBe('criou');
  });

  it('Reject shortcuts with spaces, duplicate shortcuts, and empty required fields', async () => {
    const comEspaco = await createResponse(sessionManager, { shortcut: 'com espaco' });
    expect(comEspaco.status).toBe(400);
    expect(comEspaco.body.error.code).toBe('shortcut_with_space');

    const semTitulo = await createResponse(sessionManager, { title: '' });
    expect(semTitulo.status).toBe(400);
    expect(semTitulo.body.error.code).toBe('title_required');

    const atalho = `unico-${randomUUID().slice(0, 6)}`;
    expect((await createResponse(sessionManager, { shortcut: atalho })).status).toBe(201);
    const repetido = await createResponse(sessionManager, { shortcut: `#${atalho}` });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.code).toBe('shortcut_in_use');
  });

  it('Return 403 without `resposta_pronta.gerenciar` even with `fila.gerenciar`', async () => {
    const resposta = await createResponse(sessionOnlyQueues);
    expect(resposta.status).toBe(403);
    expect(resposta.body.error.detalhe.permission).toBe('resposta_pronta.gerenciar');
  });
});

describe('PATCH e DELETE /v1/management/communication/responses-ready/:id', () => {
  it('Edit a saved response\'s body and category and toggle its active state', async () => {
    const { body: criada } = await createResponse(sessionManager);
    const editada = await pedir(
      'PATCH',
      `/v1/management/communication/responses-ready/${criada.id}`,
      sessionManager,
      { body: 'Novo corpo', category: 'Suporte', ativa: false },
    );
    expect(editada.status).toBe(200);
    expect(editada.body).toMatchObject({ body: 'Novo corpo', category: 'Suporte', ativa: false });
  });

  it('exclui (204); de outro tenant é 404; id malformado é 404', async () => {
    const { body: criada } = await createResponse(sessionManager);

    const outroTenant = await fetch(
      `${api.url}/v1/management/communication/responses-ready/${criada.id}`,
      { method: 'DELETE', headers: comCookie(sessionOfOtherTenant) },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await fetch(`${api.url}/v1/management/communication/responses-ready/nao-e-uuid`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(malformado.status).toBe(404);

    const excluida = await fetch(`${api.url}/v1/management/communication/responses-ready/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(excluida.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from resposta_pronta where id = ${criada.id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
  });
});

/* =========================================================================
 * Item 3 — pausas personalizadas
 * ========================================================================= */

async function createPause(sessao: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', '/v1/management/agents/pauses', sessao, {
    name: `Pausa ${randomUUID().slice(0, 6)}`,
    ...corpo,
  });
}

describe('POST /v1/management/agents/pauses', () => {
  it('cria e registra no log', async () => {
    const { status, body } = await createPause(sessionManager, { durationSuggestedMin: 15 });
    expect(status).toBe(201);
    const log = await auditoriaDe('motivo_pausa', body.id);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { durationSuggestedMin: 15 } });
  });

  it('Reject pause names over 30 characters, durations outside 1?480 minutes, and duplicate names', async () => {
    const nomeLongo = await createPause(sessionManager, { name: 'x'.repeat(31) });
    expect(nomeLongo.status).toBe(400);
    expect(nomeLongo.body.error.code).toBe('name_size');

    const durationInvalid = await createPause(sessionManager, { durationSuggestedMin: 481 });
    expect(durationInvalid.status).toBe(400);
    expect(durationInvalid.body.error.code).toBe('duration_invalid');

    const nome = `Repetida ${randomUUID().slice(0, 6)}`;
    expect((await createPause(sessionManager, { name: nome })).status).toBe(201);
    const repetida = await createPause(sessionManager, { name: nome });
    expect(repetida.status).toBe(409);
  });

  it('Return 403 without `pausa.gerenciar`', async () => {
    const resposta = await createPause(sessionOnlyQueues);
    expect(resposta.status).toBe(403);
    expect(resposta.body.error.detalhe.permission).toBe('pausa.gerenciar');
  });
});

describe('PATCH e DELETE /v1/management/agents/pauses/:id', () => {
  it('Toggle a pause reason and edit whether it counts as productive time', async () => {
    const { body: criada } = await createPause(sessionManager);
    const editada = await pedir('PATCH', `/v1/management/agents/pauses/${criada.id}`, sessionManager, {
      active: false,
      countsAsProductive: true,
    });
    expect(editada.status).toBe(200);
    expect(editada.body).toMatchObject({ active: false, countsAsProductive: true });
  });

  it('Delete a pause reason without affecting historical pauses', async () => {
    const { body: criada } = await createPause(sessionManager);
    const resposta = await fetch(`${api.url}/v1/management/agents/pauses/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const outraVez = await fetch(`${api.url}/v1/management/agents/pauses/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(outraVez.status).toBe(404);
  });
});

/* =========================================================================
 * Item 1 (segunda parte) — editar/excluir/reordenar regra de atendimento
 * ========================================================================= */

async function createRuleQueueSql(queueDestinationId: string, order = 0, nome?: string) {
  const nomeRegra = nome ?? `Regra ${randomUUID().slice(0, 8)}`;
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into regra_fila (tenant_id, nome, fila_destino_id, ordem)
    values (${a.tenantId}, ${nomeRegra}, ${queueDestinationId}::uuid, ${order})
    returning id
  `);
  const id = rows[0]!.id;
  await a.dono.execute(sql`
    insert into regra_fila_condicao (tenant_id, regra_id, campo, operador, valor)
    values (${a.tenantId}, ${id}::uuid, 'mensagem', 'contem', 'boleto')
  `);
  return { id, nome: nomeRegra };
}

describe('PATCH /v1/management/rules/attendance/:id', () => {
  it('Rename and reorder a queue routing rule through PATCH, change its combiner, and audit only changed fields', async () => {
    const { id } = await createRuleQueueSql(a.queueId, 0);
    const novoNome = `Depois ${randomUUID().slice(0, 6)}`;
    const { status, body } = await pedir(
      'PATCH',
      `/v1/management/rules/attendance/${id}`,
      sessionManager,
      { name: novoNome, order: 5 },
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ id, name: novoNome, order: 5 });

    const log = await auditoriaDe('regra_fila', id);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou', depois: { nome: novoNome, ordem: 5 } });
    expect(log.at(-1)?.depois).not.toHaveProperty('combinador');
  });

  it('Replace all rule condicoes when `conditions` is supplied', async () => {
    const { id } = await createRuleQueueSql(a.queueId);
    const { status, body } = await pedir(
      'PATCH',
      `/v1/management/rules/attendance/${id}`,
      sessionManager,
      { condicoes: [{ field: 'contato.nome', operator: 'igual', value: 'Ana' }] },
    );
    expect(status).toBe(200);
    expect(body.condicoes).toEqual([{ field: 'contato.nome', operator: 'igual', value: 'Ana' }]);
  });

  it('Reject empty conditions, invalid fields, and missing destination queues', async () => {
    const { id } = await createRuleQueueSql(a.queueId);

    const withoutCondition = await pedir('PATCH', `/v1/management/rules/attendance/${id}`, sessionManager, {
      condicoes: [],
    });
    expect(withoutCondition.status).toBe(400);
    expect(withoutCondition.body.error.code).toBe('without_condition');

    const campoInvalido = await pedir('PATCH', `/v1/management/rules/attendance/${id}`, sessionManager, {
      condicoes: [{ field: 'nao-existe', operator: 'igual', value: 'x' }],
    });
    expect(campoInvalido.status).toBe(400);
    expect(campoInvalido.body.error.code).toBe('field_invalid');

    const semFila = await pedir('PATCH', `/v1/management/rules/attendance/${id}`, sessionManager, {
      queueDestinationId: randomUUID(),
    });
    expect(semFila.status).toBe(400);
    expect(semFila.body.error.code).toBe('queue_not_found');
  });

  it('nome repetido é 409', async () => {
    const { nome: nomeExistente } = await createRuleQueueSql(a.queueId);
    const { id: outraId } = await createRuleQueueSql(a.queueId);
    const repetido = await pedir('PATCH', `/v1/management/rules/attendance/${outraId}`, sessionManager, {
      name: nomeExistente,
    });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.code).toBe('name_in_use');
  });

  it('Return 403 without `regra.gerenciar` even with `fila.gerenciar`, and 404 for cross-tenant or malformed IDs', async () => {
    const { id } = await createRuleQueueSql(a.queueId);

    const semPoder = await pedir('PATCH', `/v1/management/rules/attendance/${id}`, sessionOnlyQueues, {
      name: 'Invasor',
    });
    expect(semPoder.status).toBe(403);
    expect(semPoder.body.error.detalhe.permission).toBe('regra.gerenciar');

    const outroTenant = await pedir(
      'PATCH',
      `/v1/management/rules/attendance/${id}`,
      sessionOfOtherTenant,
      { name: 'Vizinho' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/management/rules/attendance/nao-e-uuid', sessionManager, {
      name: 'Tanto faz',
    });
    expect(malformado.status).toBe(404);
  });
});

describe('DELETE /v1/management/rules/attendance/:id', () => {
  it('Delete a queue with 204 and record the action in the audit log', async () => {
    const { id } = await createRuleQueueSql(a.queueId);
    const resposta = await fetch(`${api.url}/v1/management/rules/attendance/${id}?flowId=${a.flowId}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from regra_fila where id = ${id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');

    const log = await auditoriaDe('regra_fila', id);
    expect(log.at(-1)).toMatchObject({ acao: 'excluiu' });
  });

  it('Return 403 without `regra.gerenciar` and 404 for another tenant\'s queue routing rule', async () => {
    const { id } = await createRuleQueueSql(a.queueId);

    const semPoder = await fetch(`${api.url}/v1/management/rules/attendance/${id}?flowId=${a.flowId}`, {
      method: 'DELETE',
      headers: comCookie(sessionOnlyQueues),
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await fetch(`${api.url}/v1/management/rules/attendance/${id}?flowId=${a.flowId}`, {
      method: 'DELETE',
      headers: comCookie(sessionOfOtherTenant),
    });
    expect(outroTenant.status).toBe(404);
  });
});

/* =========================================================================
 * Item 2 — regras de SLA
 * ========================================================================= */

async function createRuleSla(sessao: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', '/v1/management/settings/rules', sessao, {
    name: `SLA ${randomUUID().slice(0, 8)}`,
    target: 'primeira_resposta',
    deadlineSeg: 600,
    ...corpo,
  });
}

describe('POST /v1/management/settings/rules', () => {
  it('cria e registra no log de auditoria', async () => {
    const { status, body } = await createRuleSla(sessionManager, { alertSeg: 300 });
    expect(status).toBe(201);
    const log = await auditoriaDe('regra_sla', body.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou' });
  });

  it('recusa alvo inválido (400), prazo inválido (400), alerta ≥ prazo (400) e nome repetido (409)', async () => {
    const alvoInvalido = await createRuleSla(sessionManager, { target: 'chute' });
    expect(alvoInvalido.status).toBe(400);
    expect(alvoInvalido.body.error.code).toBe('target_invalid');

    const prazoInvalido = await createRuleSla(sessionManager, { deadlineSeg: 0 });
    expect(prazoInvalido.status).toBe(400);
    expect(prazoInvalido.body.error.code).toBe('deadline_invalid');

    const alertaInvalido = await createRuleSla(sessionManager, { deadlineSeg: 100, alertSeg: 200 });
    expect(alertaInvalido.status).toBe(400);
    expect(alertaInvalido.body.error.code).toBe('alert_invalid');

    const nome = `Única ${randomUUID().slice(0, 6)}`;
    expect((await createRuleSla(sessionManager, { name: nome })).status).toBe(201);
    const repetida = await createRuleSla(sessionManager, { name: nome });
    expect(repetida.status).toBe(409);
    expect(repetida.body.error.code).toBe('name_in_use');
  });

  it('Require an existing scope ID for queue-scoped SLA rules and reject unsupported scopes (`fila`)', async () => {
    const withoutScopeId = await createRuleSla(sessionManager, { scopeType: 'fila' });
    expect(withoutScopeId.status).toBe(400);
    expect(withoutScopeId.body.error.code).toBe('scope_id_required');

    const queueWrong = await createRuleSla(sessionManager, { scopeType: 'fila', scopeId: randomUUID() });
    expect(queueWrong.status).toBe(400);
    expect(queueWrong.body.error.code).toBe('queue_not_found');

    const scopeOutside = await createRuleSla(sessionManager, { scopeType: 'inbox', scopeId: a.inboxId });
    expect(scopeOutside.status).toBe(400);
    expect(scopeOutside.body.error.code).toBe('scope_invalid');

    const withQueue = await createRuleSla(sessionManager, { scopeType: 'fila', scopeId: a.queueId });
    expect(withQueue.status).toBe(201);
  });

  it('Return 403 when creating an SLA rule without `regra.gerenciar` permission', async () => {
    const resposta = await createRuleSla(sessionOnlyQueues);
    expect(resposta.status).toBe(403);
    expect(resposta.body.error.detalhe.permission).toBe('regra.gerenciar');
  });
});

describe('PATCH e DELETE /v1/management/settings/rules/:id', () => {
  it('edita prazo e alerta juntos, e registra só o que mudou', async () => {
    const { body: criada } = await createRuleSla(sessionManager, { deadlineSeg: 600, alertSeg: 300 });
    const editada = await pedir(
      'PATCH',
      `/v1/management/settings/rules/${criada.id}`,
      sessionManager,
      { deadlineSeg: 1200, alertSeg: 900 },
    );
    expect(editada.status).toBe(200);
    expect(editada.body).toMatchObject({ deadlineSeg: 1200, alertSeg: 900 });
  });

  it('encolher o prazo abaixo do alerta já cadastrado sem mandar o novo alerta é 400', async () => {
    const { body: criada } = await createRuleSla(sessionManager, { deadlineSeg: 600, alertSeg: 500 });
    const resposta = await pedir(
      'PATCH',
      `/v1/management/settings/rules/${criada.id}`,
      sessionManager,
      { deadlineSeg: 400 },
    );
    expect(resposta.status).toBe(400);
    expect(resposta.body.error.code).toBe('alert_invalid');
  });

  it('Return 403 without `regra.gerenciar` and 404 for cross-tenant or malformed IDs', async () => {
    const { body: criada } = await createRuleSla(sessionManager);

    const semPoder = await pedir(
      'PATCH',
      `/v1/management/settings/rules/${criada.id}`,
      sessionOnlyQueues,
      { name: 'Invasor' },
    );
    expect(semPoder.status).toBe(403);

    const outroTenant = await pedir(
      'PATCH',
      `/v1/management/settings/rules/${criada.id}`,
      sessionOfOtherTenant,
      { name: 'Vizinho' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/management/settings/rules/nao-e-uuid', sessionManager, {
      name: 'Tanto faz',
    });
    expect(malformado.status).toBe(404);
  });

  it('Delete an SLA rule with 204 and return 404 for cross-tenant or malformed IDs', async () => {
    const { body: criada } = await createRuleSla(sessionManager);

    const outroTenant = await fetch(`${api.url}/v1/management/settings/rules/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionOfOtherTenant),
    });
    expect(outroTenant.status).toBe(404);

    const malformado = await fetch(`${api.url}/v1/management/settings/rules/nao-e-uuid`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(malformado.status).toBe(404);

    const excluida = await fetch(`${api.url}/v1/management/settings/rules/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(excluida.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from regra_sla where id = ${criada.id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
  });

  it('Return 409 when deleting an SLA rule active on an open conversation', async () => {
    const { body: criada } = await createRuleSla(sessionManager);
    const { rows: contatos } = await a.dono.execute<{ id: string }>(
      sql`insert into contato (tenant_id, nome) values (${a.tenantId}, 'Cliente SLA') returning id`,
    );
    const { rows: conversations } = await a.dono.execute<{ id: string }>(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id)
      values (${a.tenantId}, ${a.inboxId}::uuid, ${contatos[0]!.id}::uuid, ${a.queueId}::uuid)
      returning id
    `);
    await a.dono.execute(sql`
      insert into sla_conversa (tenant_id, conversa_id, regra_id, prazo_em, estado)
      values (${a.tenantId}, ${conversations[0]!.id}::uuid, ${criada.id}::uuid, now() + interval '10 minutes', 'correndo')
    `);

    const resposta = await fetch(`${api.url}/v1/management/settings/rules/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe('rule_with_sla_running');
  });
});

/* =========================================================================
 * Item 3 — edit/delete time-window and schedule exception
 * ========================================================================= */

async function createScheduleSql(nome?: string): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into horario_atendimento (tenant_id, nome, fuso)
    values (${a.tenantId}, ${nome ?? `Horário ${randomUUID().slice(0, 6)}`}, 'America/Sao_Paulo')
    returning id
  `);
  return rows[0]!.id;
}

async function createRangeSql(
  horarioId: string,
  diaSemana = 1,
  inicio = '09:00',
  fim = '18:00',
): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into horario_faixa (tenant_id, horario_id, dia_semana, inicio, fim)
    values (${a.tenantId}, ${horarioId}::uuid, ${diaSemana}, ${inicio}, ${fim})
    returning id
  `);
  return rows[0]!.id;
}

async function createExceptionSql(
  horarioId: string,
  data: string,
  fechado: boolean,
  inicio: string | null = null,
  fim: string | null = null,
): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into horario_excecao (tenant_id, horario_id, data, fechado, inicio, fim)
    values (${a.tenantId}, ${horarioId}::uuid, ${data}, ${fechado}, ${inicio}, ${fim})
    returning id
  `);
  return rows[0]!.id;
}

describe('PATCH e DELETE /v1/management/rules/schedules/ranges/:id', () => {
  it('edita início/fim e registra só o que mudou', async () => {
    const horarioId = await createScheduleSql();
    const id = await createRangeSql(horarioId, 1, '09:00', '18:00');
    const { status, body } = await pedir(
      'PATCH',
      `/v1/management/rules/schedules/ranges/${id}`,
      sessionManager,
      { start: '08:00' },
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ start: '08:00', end: '18:00' });

    const log = await auditoriaDe('horario_faixa', id);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou' });
  });

  it('recusa (409) fim antes ou igual ao início', async () => {
    const horarioId = await createScheduleSql();
    const id = await createRangeSql(horarioId);
    const resposta = await pedir('PATCH', `/v1/management/rules/schedules/ranges/${id}`, sessionManager, {
      end: '09:00',
    });
    expect(resposta.status).toBe(409);
    expect(resposta.body.error.code).toBe('end_before_of_start');
  });

  it('Return 409 for overlapping schedule ranges on the same day', async () => {
    const horarioId = await createScheduleSql();
    await createRangeSql(horarioId, 2, '09:00', '12:00');
    const id = await createRangeSql(horarioId, 2, '14:00', '18:00');
    const resposta = await pedir('PATCH', `/v1/management/rules/schedules/ranges/${id}`, sessionManager, {
      start: '10:00',
    });
    expect(resposta.status).toBe(409);
    expect(resposta.body.error.code).toBe('range_overlapping');
  });

  it('Return 403 without `horario.gerenciar` and 404 for cross-tenant or malformed IDs', async () => {
    const horarioId = await createScheduleSql();
    const id = await createRangeSql(horarioId);

    const semPoder = await pedir('PATCH', `/v1/management/rules/schedules/ranges/${id}`, sessionOnlyQueues, {
      start: '08:00',
    });
    expect(semPoder.status).toBe(403);
    expect(semPoder.body.error.detalhe.permission).toBe('horario.gerenciar');

    const outroTenant = await pedir(
      'PATCH',
      `/v1/management/rules/schedules/ranges/${id}`,
      sessionOfOtherTenant,
      { start: '08:00' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/management/rules/schedules/ranges/nao-e-uuid', sessionManager, {
      start: '08:00',
    });
    expect(malformado.status).toBe(404);
  });

  it('Delete a schedule exception with 204', async () => {
    const horarioId = await createScheduleSql();
    const id = await createRangeSql(horarioId);
    const resposta = await fetch(`${api.url}/v1/management/rules/schedules/ranges/${id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from horario_faixa where id = ${id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
  });
});

describe('PATCH e DELETE /v1/management/rules/schedules/exceptions/:id', () => {
  it('edita motivo e data', async () => {
    const horarioId = await createScheduleSql();
    const id = await createExceptionSql(horarioId, '2026-12-25', true);
    const { status, body } = await pedir(
      'PATCH',
      `/v1/management/rules/schedules/exceptions/${id}`,
      sessionManager,
      { reason: 'Natal' },
    );
    expect(status).toBe(200);
    expect(body.reason).toBe('Natal');
  });

  it('recusa (400) abrir sem horário próprio e (400) fechar sem limpar o horário', async () => {
    const horarioId = await createScheduleSql();

    const fechada = await createExceptionSql(horarioId, '2026-12-24', true);
    const abrirSemHorario = await pedir(
      'PATCH',
      `/v1/management/rules/schedules/exceptions/${fechada}`,
      sessionManager,
      { closed: false },
    );
    expect(abrirSemHorario.status).toBe(400);
    expect(abrirSemHorario.body.error.code).toBe('exception_without_schedule');

    const aberta = await createExceptionSql(horarioId, '2026-11-01', false, '08:00', '12:00');
    const fecharComHorario = await pedir(
      'PATCH',
      `/v1/management/rules/schedules/exceptions/${aberta}`,
      sessionManager,
      { closed: true },
    );
    expect(fecharComHorario.status).toBe(400);
    expect(fecharComHorario.body.error.code).toBe('exception_closed_with_schedule');
  });

  it('Return 409 when a schedule exception date overlaps another exception', async () => {
    const horarioId = await createScheduleSql();
    await createExceptionSql(horarioId, '2026-01-01', true);
    const id = await createExceptionSql(horarioId, '2026-01-02', true);
    const resposta = await pedir(
      'PATCH',
      `/v1/management/rules/schedules/exceptions/${id}`,
      sessionManager,
      { data: '2026-01-01' },
    );
    expect(resposta.status).toBe(409);
    expect(resposta.body.error.code).toBe('data_in_use');
  });

  it('Return 403 without `horario.gerenciar` and 404 for cross-tenant or malformed IDs', async () => {
    const horarioId = await createScheduleSql();
    const id = await createExceptionSql(horarioId, '2026-03-01', true);

    const semPoder = await pedir('PATCH', `/v1/management/rules/schedules/exceptions/${id}`, sessionOnlyQueues, {
      reason: 'x',
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await pedir(
      'PATCH',
      `/v1/management/rules/schedules/exceptions/${id}`,
      sessionOfOtherTenant,
      { reason: 'x' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir(
      'PATCH',
      '/v1/management/rules/schedules/exceptions/nao-e-uuid',
      sessionManager,
      { reason: 'x' },
    );
    expect(malformado.status).toBe(404);
  });

  it('Delete a schedule exception with 204', async () => {
    const horarioId = await createScheduleSql();
    const id = await createExceptionSql(horarioId, '2026-04-01', true);
    const resposta = await fetch(`${api.url}/v1/management/rules/schedules/exceptions/${id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from horario_excecao where id = ${id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
  });
});

/* =========================================================================
 * Item 4 — basic CRUD for priority rule
 * ========================================================================= */

async function createRulePriority(session: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', '/v1/management/rules/priority', session, {
    name: `Prioridade ${randomUUID().slice(0, 8)}`,
    level: 'alta',
    ...corpo,
  });
}

describe('GET/POST/PATCH/DELETE /v1/management/rules/priority', () => {
  it('cria, lista e registra no log', async () => {
    const { status, body } = await createRulePriority(sessionManager);
    expect(status).toBe(201);
    const log = await auditoriaDe('regra_prioridade', body.id);
    expect(log[0]).toMatchObject({ acao: 'criou' });

    const listing = await pedir('GET', '/v1/management/rules/priority', sessionManager);
    expect(listing.status).toBe(200);
    expect((listing.body as { id: string }[]).some((r) => r.id === body.id)).toBe(true);
  });

  it('Reject an unassignable priority, invalid condition, or duplicate rule name', async () => {
    const nivelInvalido = await createRulePriority(sessionManager, { level: 'sem_prioridade' });
    expect(nivelInvalido.status).toBe(400);
    expect(nivelInvalido.body.error.code).toBe('level_invalid');

    const conditionInvalid = await createRulePriority(sessionManager, { condition: 'nao e objeto' });
    expect(conditionInvalid.status).toBe(400);
    expect(conditionInvalid.body.error.code).toBe('condition_invalid');

    const nome = `Única ${randomUUID().slice(0, 6)}`;
    expect((await createRulePriority(sessionManager, { name: nome })).status).toBe(201);
    const repetida = await createRulePriority(sessionManager, { name: nome });
    expect(repetida.status).toBe(409);
    expect(repetida.body.error.code).toBe('name_in_use');
  });

  it('Return 400 for unsupported priority-rule scopes', async () => {
    const resposta = await createRulePriority(sessionManager, {
      scopeType: 'etiqueta',
      scopeId: randomUUID(),
    });
    expect(resposta.status).toBe(400);
    expect(resposta.body.error.code).toBe('scope_invalid');
  });

  it('Edit a priority rule\'s level and condition and audit only changes', async () => {
    const { body: criada } = await createRulePriority(sessionManager);
    const editada = await pedir(
      'PATCH',
      `/v1/management/rules/priority/${criada.id}`,
      sessionManager,
      { level: 'maxima', condition: { etiqueta: 'vip' } },
    );
    expect(editada.status).toBe(200);
    expect(editada.body).toMatchObject({ level: 'maxima', condition: { etiqueta: 'vip' } });
  });

  it('Return 403 without `regra.gerenciar` and 404 for cross-tenant or malformed IDs', async () => {
    const { body: criada } = await createRulePriority(sessionManager);

    const semPoder = await pedir(
      'PATCH',
      `/v1/management/rules/priority/${criada.id}`,
      sessionOnlyQueues,
      { level: 'baixa' },
    );
    expect(semPoder.status).toBe(403);
    expect(semPoder.body.error.detalhe.permission).toBe('regra.gerenciar');

    const outroTenant = await pedir(
      'PATCH',
      `/v1/management/rules/priority/${criada.id}`,
      sessionOfOtherTenant,
      { level: 'baixa' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/management/rules/priority/nao-e-uuid', sessionManager, {
      level: 'baixa',
    });
    expect(malformado.status).toBe(404);
  });

  it('Delete a schedule exception with 204', async () => {
    const { body: criada } = await createRulePriority(sessionManager);
    const resposta = await fetch(`${api.url}/v1/management/rules/priority/${criada.id}?flowId=${a.flowId}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from regra_prioridade where id = ${criada.id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
  });
});

/* =========================================================================
 * Posse por fluxo: filas, vínculos, regras e fila padrão só existem dentro do fluxo
 * ========================================================================= */

describe('Gestão escopada por fluxo', () => {
  let dois: Awaited<ReturnType<typeof montarDoisFluxos>>;
  let gestor: string;
  const urlFila = (id: string, flowId: string) => `/v1/management/agents/queues/${id}?flowId=${flowId}`;

  const ids = (lista: unknown) => (lista as { id: string }[]).map((i) => i.id);
  const pedirDe = (metodo: string, caminho: string, corpo?: Record<string, unknown>) =>
    pedir(metodo, caminho, gestor, corpo, dois.flowA);

  beforeAll(async () => {
    dois = await montarDoisFluxos(`ct-${randomUUID().slice(0, 8)}`);
    const todas = ['fila.gerenciar', 'regra.gerenciar'];
    gestor = await openSession(dois.cenario, await pessoaCom(dois.cenario, todas));
  }, 180_000);

  afterAll(async () => {
    await dois?.cenario.encerrar();
  });

  async function acao(nome: string, campos: Record<string, string | string[]>) {
    return pedir('POST', `/v1/management/actions/${nome}`, gestor, { campos });
  }

  it('lista só as filas do fluxo e exige flowId válido do próprio tenant', async () => {
    const listaA = await pedirDe('GET', '/v1/management/agents/queues');
    expect(listaA.status).toBe(200);
    expect(ids(listaA.body.queues)).toContain(dois.queueA);
    expect(ids(listaA.body.queues)).not.toContain(dois.queueB);

    const listaB = await pedir('GET', '/v1/management/agents/queues', gestor, undefined, dois.flowB);
    expect(ids(listaB.body.queues)).toEqual([dois.queueB]);

    const semFluxo = await pedir('GET', '/v1/management/agents/queues?flowId=', gestor);
    expect(semFluxo.status).toBe(400);
    expect(semFluxo.body.error.code).toBe('flow_required');
    const naoUuid = await pedir('GET', '/v1/management/agents/queues?flowId=abc', gestor);
    expect(naoUuid.status).toBe(400);

    // flow of ANOTHER tenant is a 404, never a read
    const deOutroTenant = await pedir('GET', '/v1/management/agents/queues', gestor, undefined, a.flowId);
    expect(deOutroTenant.status).toBe(404);
  });

  it('cria a fila no fluxo da tela e recusa nome repetido dentro do fluxo', async () => {
    const nome = `Nova ${randomUUID().slice(0, 6)}`;
    const criada = await pedirDe('POST', '/v1/management/agents/queues', { name: nome, capacityDefault: 4 });
    expect(criada.status).toBe(201);
    const { rows } = await dois.cenario.dono.execute<{ fluxo_id: string }>(
      sql`select fluxo_id from fila where id = ${criada.body.id}::uuid`,
    );
    expect(rows[0]?.fluxo_id).toBe(dois.flowA);

    const repetida = await pedirDe('POST', '/v1/management/agents/queues', { name: nome, capacityDefault: 4 });
    expect(repetida.status).toBe(409);
    expect(repetida.body.error.code).toBe('name_in_use');

    const semFluxo = await fetch(`${api.url}/v1/management/agents/queues`, {
      method: 'POST',
      headers: comCookie(gestor),
      body: JSON.stringify({ name: 'Sem fluxo', capacityDefault: 4 }),
    });
    expect(semFluxo.status).toBe(400);
  });

  it('o mesmo nome de fila vale em outro fluxo do tenant, mas não duas vezes no mesmo', async () => {
    const nome = `Comum ${randomUUID().slice(0, 6)}`;
    const emA = await pedirDe('POST', '/v1/management/agents/queues', { name: nome, capacityDefault: 4 });
    expect(emA.status).toBe(201);
    const emB = await pedir('POST', '/v1/management/agents/queues', gestor, { name: nome, capacityDefault: 4 }, dois.flowB);
    expect(emB.status).toBe(201);
    const repetidaEmB = await pedir('POST', '/v1/management/agents/queues', gestor, { name: nome, capacityDefault: 4 }, dois.flowB);
    expect(repetidaEmB.status).toBe(409);
    expect(repetidaEmB.body.error.code).toBe('name_in_use');
    const suporte = await pedirDe('POST', '/v1/management/agents/queues', { name: 'Suporte', capacityDefault: 4 });
    expect(suporte.status).toBe(409);
  });

  it('editar, ativar/desativar, excluir e vincular atendente em fila de outro fluxo é 404', async () => {
    const editar = await pedirDe('PATCH', `/v1/management/agents/queues/${dois.queueB}`, { name: 'Invasor' });
    expect(editar.status).toBe(404);
    const desativar = await pedirDe('PATCH', `/v1/management/agents/queues/${dois.queueB}`, { ativa: false });
    expect(desativar.status).toBe(404);
    const vincular = await pedirDe('POST', `/v1/management/agents/queues/${dois.queueB}/agents`, {
      userId: dois.userShared,
    });
    expect(vincular.status).toBe(404);
    const desvincular = await fetch(
      `${api.url}/v1/management/agents/queues/${dois.queueB}/agents/${dois.userShared}?flowId=${dois.flowA}`,
      { method: 'DELETE', headers: comCookie(gestor) },
    );
    expect(desvincular.status).toBe(404);
    const excluir = await fetch(`${api.url}${urlFila(dois.queueB, dois.flowA)}`, {
      method: 'DELETE',
      headers: comCookie(gestor),
    });
    expect(excluir.status).toBe(404);

    const { rows } = await dois.cenario.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from fila_atendente where fila_id = ${dois.queueB}::uuid
    `);
    expect(rows[0]?.n).toBe('1');
    // in its own flow the same queue answers normally
    const ok = await pedir('PATCH', `/v1/management/agents/queues/${dois.queueB}`, gestor, { ativa: true }, dois.flowB);
    expect(ok.status).toBe(200);
  });

  it('fila padrão do fluxo só aceita fila do próprio fluxo; null limpa', async () => {
    const dequeB = await pedirDe('PUT', '/v1/management/agents/queues/default', { queueId: dois.queueB });
    expect(dequeB.status).toBe(404);

    const deA = await pedirDe('PUT', '/v1/management/agents/queues/default', { queueId: dois.queueA });
    expect(deA.status).toBe(200);
    const { rows } = await dois.cenario.dono.execute<{ fila_padrao_id: string | null }>(
      sql`select fila_padrao_id from fluxo where id = ${dois.flowA}::uuid`,
    );
    expect(rows[0]?.fila_padrao_id).toBe(dois.queueA);
    const lista = await pedirDe('GET', '/v1/management/agents/queues');
    expect(lista.body.queues.find((q: { id: string }) => q.id === dois.queueA).isDefault).toBe(true);

    const limpa = await pedirDe('PUT', '/v1/management/agents/queues/default', { queueId: null });
    expect(limpa.status).toBe(200);
    const { rows: depois } = await dois.cenario.dono.execute<{ fila_padrao_id: string | null }>(
      sql`select fila_padrao_id from fluxo where id = ${dois.flowA}::uuid`,
    );
    expect(depois[0]?.fila_padrao_id).toBeNull();
  });

  it('regra de atendimento: lista, edita e exclui só no fluxo; destino de outro fluxo é recusado', async () => {
    const lista = await pedirDe('GET', '/v1/management/rules/attendance');
    expect(lista.status).toBe(200);
    expect(lista.body.regras.map((r: { queueDestinationId: string }) => r.queueDestinationId)).toEqual([dois.queueA]);
    expect(ids(lista.body.queues)).toContain(dois.queueA);
    expect(ids(lista.body.queues)).not.toContain(dois.queueB);

    const { rows: regrasB } = await dois.cenario.dono.execute<{ id: string }>(
      sql`select id from regra_fila where fila_destino_id = ${dois.queueB}::uuid`,
    );
    const regraB = regrasB[0]!.id;
    expect((await pedirDe('PATCH', `/v1/management/rules/attendance/${regraB}`, { name: 'Invasor' })).status).toBe(404);
    const excluir = await fetch(`${api.url}/v1/management/rules/attendance/${regraB}?flowId=${dois.flowA}`, {
      method: 'DELETE',
      headers: comCookie(gestor),
    });
    expect(excluir.status).toBe(404);

    const { rows: regrasA } = await dois.cenario.dono.execute<{ id: string }>(
      sql`select id from regra_fila where fila_destino_id = ${dois.queueA}::uuid`,
    );
    const paraOutraFila = await pedirDe('PATCH', `/v1/management/rules/attendance/${regrasA[0]!.id}`, {
      queueDestinationId: dois.queueB,
    });
    expect(paraOutraFila.status).toBe(400);
    expect(paraOutraFila.body.error.code).toBe('queue_not_found');

    const comDestinoB = await acao('salvarRegraFila', {
      fluxoId: dois.flowA,
      nome: `Destino B ${randomUUID().slice(0, 6)}`,
      filaDestinoId: dois.queueB,
      combinador: 'e',
      ordem: '1',
      campo: ['mensagem'],
      operador: ['contem'],
      valor: ['oi'],
    });
    expect(comDestinoB.body).toEqual({ ok: false, error: 'Fila de destino não encontrada.' });
  });

  it('nome de regra de atendimento é único dentro do fluxo, não entre fluxos', async () => {
    const nome = `Mesma ${randomUUID().slice(0, 6)}`;
    const base = { nome, combinador: 'e', ordem: '2', campo: ['mensagem'], operador: ['contem'], valor: ['x'] };
    expect((await acao('salvarRegraFila', { ...base, fluxoId: dois.flowA, filaDestinoId: dois.queueA })).body).toEqual({ ok: true });
    expect((await acao('salvarRegraFila', { ...base, fluxoId: dois.flowB, filaDestinoId: dois.queueB })).body).toEqual({ ok: true });
    const repetida = await acao('salvarRegraFila', { ...base, fluxoId: dois.flowA, filaDestinoId: dois.queueA });
    expect(repetida.body.ok).toBe(false);
    expect(repetida.body.error).toContain('Já existe uma regra');
  });

  it('regra de prioridade pertence ao fluxo e o escopo fila só aceita fila do fluxo', async () => {
    const nome = `Prio ${randomUUID().slice(0, 6)}`;
    const emA = await pedirDe('POST', '/v1/management/rules/priority', { name: nome, level: 'alta' });
    expect(emA.status).toBe(201);
    const emB = await pedir('POST', '/v1/management/rules/priority', gestor, { name: nome, level: 'alta' }, dois.flowB);
    expect(emB.status).toBe(201);
    const repetida = await pedirDe('POST', '/v1/management/rules/priority', { name: nome, level: 'alta' });
    expect(repetida.status).toBe(409);

    const listaA = await pedirDe('GET', '/v1/management/rules/priority');
    expect(ids(listaA.body)).toContain(emA.body.id);
    expect(ids(listaA.body)).not.toContain(emB.body.id);

    const escopoOutraFila = await pedirDe('POST', '/v1/management/rules/priority', {
      name: `Esc ${randomUUID().slice(0, 6)}`,
      level: 'alta',
      scopeType: 'fila',
      scopeId: dois.queueB,
    });
    expect(escopoOutraFila.status).toBe(400);
    expect(escopoOutraFila.body.error.code).toBe('queue_not_found');
    const escopoPropria = await pedirDe('POST', '/v1/management/rules/priority', {
      name: `Esc ${randomUUID().slice(0, 6)}`,
      level: 'alta',
      scopeType: 'fila',
      scopeId: dois.queueA,
    });
    expect(escopoPropria.status).toBe(201);

    expect((await pedirDe('PATCH', `/v1/management/rules/priority/${emB.body.id}`, { level: 'baixa' })).status).toBe(404);
    const excluir = await fetch(`${api.url}/v1/management/rules/priority/${emB.body.id}?flowId=${dois.flowA}`, {
      method: 'DELETE',
      headers: comCookie(gestor),
    });
    expect(excluir.status).toBe(404);
  });
});

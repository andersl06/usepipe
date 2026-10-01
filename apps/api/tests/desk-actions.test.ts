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
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * `POST /v1/desk/acoes/:acao` (`controladores/desk.ts`, `dominio/desk/acoes.ts`).
 *
 * No test existed for this entire controller — not the reads, not the five actions (`definirStatus`, `cairPorInatividade`, `salvarNotaInterna`, `atender`, `transferirEmMassa`). This file covers the actions: they WRITE, `atendenteId`/`tenantId` always come from the SESSION (never from the body), and the list of accepted names is CLOSED.
 */

let a: Cenario;
let sessionAgent: string;
let colegaId: string;

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

let api: ApiNoAr;

async function acao(
  session: string | null,
  nome: string,
  campos: Record<string, string | string[]> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/desk/actions/${nome}`, {
    method: 'POST',
    headers: session ? comCookie(session) : { 'content-type': 'application/json' },
    body: JSON.stringify({ campos }),
  });
  return { status: resposta.status, body: (await resposta.json()) as Record<string, unknown> };
}

async function statusDe(
  usuarioId: string,
): Promise<{ state: string; since: Date | string } | undefined> {
  const { rows } = await a.dono.execute<{ state: string; since: Date | string }>(
    sql`select estado as state, desde as since from status_atendente where usuario_id = ${usuarioId}::uuid`,
  );
  return rows[0];
}

async function pausaAbertaDe(usuarioId: string) {
  const { rows } = await a.dono.execute<{ id: string; motivo_id: string | null }>(sql`
    select id, motivo_id from pausa
     where usuario_id = ${usuarioId}::uuid and encerrada_em is null
  `);
  return rows[0] ?? null;
}

async function createReasonOfPause(nome = `Motivo ${randomUUID().slice(0, 6)}`): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(
    sql`insert into motivo_pausa (tenant_id, nome) values (${a.tenantId}, ${nome}) returning id`,
  );
  return rows[0]!.id;
}

async function createContact(): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${a.tenantId}, 'Cliente de teste') returning id
  `);
  return rows[0]!.id;
}

async function createConversationInQueue(queueId: string | null = a.queueId): Promise<string> {
  const contatoId = await createContact();
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, criada_em)
    values (${a.tenantId}, ${a.inboxId}::uuid, ${contatoId}::uuid, ${queueId}, 'na_fila', now())
    returning id
  `);
  return rows[0]!.id;
}

async function createConversationAssigned(agentId: string): Promise<string> {
  const contactId = await createContact();
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, atribuida_em)
    values (${a.tenantId}, ${a.inboxId}::uuid, ${contactId}::uuid, ${a.queueId}::uuid, ${agentId}::uuid,
            'atribuida', now())
    returning id
  `);
  return rows[0]!.id;
}

beforeAll(async () => {
  a = await montarCenario(`desk-acoes-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  sessionAgent = await openSession(a, a.agentId);

  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${a.tenantId}, 'Colega de Teste', ${`colega-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  colegaId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
});

describe('POST /v1/desk/actions/:action — lista fechada e sessão obrigatória', () => {
  it('nome fora do mapa é 404', async () => {
    const { status } = await acao(sessionAgent, 'naoExiste');
    expect(status).toBe(404);
  });

  it('Return 401 for Desk actions without a session', async () => {
    const { status } = await acao(null, 'definirStatus', { state: 'online' });
    expect(status).toBe(401);
  });
});

describe('definirStatus', () => {
  it('Reject an unknown agent status', async () => {
    const { status, body } = await acao(sessionAgent, 'definirStatus', { state: 'sonolento' });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: false, error: 'Estado desconhecido.' });
  });

  it('pausa sem motivo é recusada; não muda o status atual', async () => {
    await acao(sessionAgent, 'definirStatus', { state: 'online' });
    const { body } = await acao(sessionAgent, 'definirStatus', { state: 'pausa' });
    expect(body).toMatchObject({ ok: false, error: 'Escolha o motivo da pausa.' });
    expect((await statusDe(a.agentId))?.state).toBe('online');
  });

  it('Record a reasoned pausa as an agent state and an open `pause` row', async () => {
    const motivoId = await createReasonOfPause();
    const { body } = await acao(sessionAgent, 'definirStatus', { state: 'pausa', motivoId });
    expect(body).toMatchObject({ ok: true });
    expect((await statusDe(a.agentId))?.state).toBe('pausa');
    expect((await pausaAbertaDe(a.agentId))?.motivo_id).toBe(motivoId);
  });

  it('Close the previous pause when an agent returns online so reports do not double-count time', async () => {
    const motivoId = await createReasonOfPause();
    await acao(sessionAgent, 'definirStatus', { state: 'pausa', motivoId });
    expect(await pausaAbertaDe(a.agentId)).not.toBeNull();

    await acao(sessionAgent, 'definirStatus', { state: 'online' });
    expect((await statusDe(a.agentId))?.state).toBe('online');
    expect(await pausaAbertaDe(a.agentId)).toBeNull();
  });

  it('invisível e offline também são aceitos', async () => {
    const invisivel = await acao(sessionAgent, 'definirStatus', { state: 'invisivel' });
    expect(invisivel.body).toMatchObject({ ok: true });
    expect((await statusDe(a.agentId))?.state).toBe('invisivel');

    const offline = await acao(sessionAgent, 'definirStatus', { state: 'offline' });
    expect(offline.body).toMatchObject({ ok: true });
    expect((await statusDe(a.agentId))?.state).toBe('offline');

    // // Returns the scenario to online — other tests in this file depend on it.
    await acao(sessionAgent, 'definirStatus', { state: 'online' });
  });
});

describe('Set an inactive agent offline and close any open pause', () => {
  it('Move an inactive agent offline and close its open pause', async () => {
    const motivoId = await createReasonOfPause();
    await acao(sessionAgent, 'definirStatus', { state: 'pausa', motivoId });

    const { body } = await acao(sessionAgent, 'cairPorInatividade');
    expect(body).toMatchObject({ ok: true });
    expect((await statusDe(a.agentId))?.state).toBe('offline');
    expect(await pausaAbertaDe(a.agentId)).toBeNull();

    // // Returns the scenario to online.
    await acao(sessionAgent, 'definirStatus', { state: 'online' });
  });

  it('é um no-op se já está offline: não reescreve `desde`', async () => {
    await acao(sessionAgent, 'cairPorInatividade');
    const antes = await statusDe(a.agentId);

    await new Promise((r) => setTimeout(r, 10));
    await acao(sessionAgent, 'cairPorInatividade');
    const depois = await statusDe(a.agentId);
    expect(new Date(depois!.since).getTime()).toBe(new Date(antes!.since).getTime());

    await acao(sessionAgent, 'definirStatus', { state: 'online' });
  });
});

describe('salvarNotaInterna', () => {
  it('Save an internal note attributed to the session agent', async () => {
    const conversationId = await createConversationAssigned(a.agentId);
    const { body } = await acao(sessionAgent, 'salvarNotaInterna', {
      conversationId,
      texto: '  Cliente pediu retorno amanhã.  ',
    });
    expect(body).toMatchObject({ ok: true });

    const { rows } = await a.dono.execute<{ body: string; userId: string }>(sql`
      select corpo as body, usuario_id as "userId" from nota_interna where conversa_id = ${conversationId}::uuid
    `);
    expect(rows[0]?.body).toBe('Cliente pediu retorno amanhã.');
    expect(rows[0]?.userId).toBe(a.agentId);
  });

  it('Reject an internal note without conversationId or text', async () => {
    const withoutConversation = await acao(sessionAgent, 'salvarNotaInterna', { texto: 'oi' });
    expect(withoutConversation.body).toMatchObject({ ok: false, error: 'Conversa não informada.' });

    const conversaId = await createConversationAssigned(a.agentId);
    const semTexto = await acao(sessionAgent, 'salvarNotaInterna', { conversationId: conversaId, texto: '   ' });
    expect(semTexto.body).toMatchObject({
      ok: false,
      error: 'Escreva alguma coisa antes de enviar.',
    });
  });
});

describe('atender', () => {
  it('recusa quem não está online', async () => {
    await acao(sessionAgent, 'definirStatus', { state: 'invisivel' });
    const { body } = await acao(sessionAgent, 'atender');
    expect(body).toMatchObject({ ok: false, error: 'Fique online para atender.' });
    await acao(sessionAgent, 'definirStatus', { state: 'online' });
  });

  it('Reject a queue pull when no conversations are waiting', async () => {
    // Esvazia qualquer sobra de outro teste: consome a fila antes de checar o vazio.
    for (;;) {
      const { body } = await acao(sessionAgent, 'atender');
      if (body['ok'] !== true) {
        expect(body).toMatchObject({ ok: false, error: 'Não há clientes aguardando.' });
        break;
      }
    }
  });

  it('Assign the oldest waiting conversation to the agent and record the event', async () => {
    const conversaId = await createConversationInQueue();
    const { body } = await acao(sessionAgent, 'atender');
    expect(body).toMatchObject({ ok: true, conversaId });

    const { rows: conversations } = await a.dono.execute<{ state: string; agentId: string }>(
      sql`select estado, atendente_id from conversa where id = ${conversaId}::uuid`,
    );
    expect(conversations[0]).toMatchObject({ estado: 'atribuida', atendente_id: a.agentId });

    const { rows: assignments } = await a.dono.execute<{ reason: string }>(
      sql`select motivo as "reason" from atribuicao where conversa_id = ${conversaId}::uuid`,
    );
    expect(assignments[0]?.reason).toBe('assumida_pelo_atendente');

    const { rows: eventos } = await a.dono.execute<{ type: string }>(
      sql`select tipo as "type" from evento_atendimento where conversa_id = ${conversaId}::uuid`,
    );
    expect(eventos.map((e) => e.type)).toContain('atribuida');
  });

  it('Do not pull conversations from a queue the agent has not joined', async () => {
    const { rows: otherQueue } = await a.dono.execute<{ id: string }>(
      sql`insert into fila (tenant_id, fluxo_id, nome) values (${a.tenantId}, ${a.flowId}, ${`Outra ${randomUUID().slice(0, 6)}`}) returning id`,
    );
    await createConversationInQueue(otherQueue[0]!.id);

    const { body } = await acao(sessionAgent, 'atender');
    expect(body).toMatchObject({ ok: false, error: 'Não há clientes aguardando.' });
  });
});

describe('Enforce the agent\'s available-slot limit when pulling from a queue', () => {
  /** Zera o atendente: encerra o que ele tem e fixa o limite da fila em `limite`. */
  async function zerarComLimite(limite: number): Promise<void> {
    await a.dono.execute(sql`
      update conversa set estado = 'encerrada', encerrada_em = now()
       where atendente_id = ${a.agentId}::uuid and estado <> 'encerrada'
    `);
    await a.dono.execute(sql`
      update fila_atendente set capacidade_override = ${limite}
       where usuario_id = ${a.agentId}::uuid and fila_id = ${a.queueId}::uuid
    `);
  }

  async function activeOfAgent(): Promise<number> {
    const { rows } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from conversa
       where atendente_id = ${a.agentId}::uuid and estado <> 'encerrada'
    `);
    return Number(rows[0]?.n ?? 0);
  }

  it('Reject a second queue pull when the agent reaches the limit while leaving others queued', async () => {
    await zerarComLimite(1);
    await createConversationInQueue();
    await createConversationInQueue();

    const first = await acao(sessionAgent, 'atender');
    expect(first.body['ok']).toBe(true);

    const segunda = await acao(sessionAgent, 'atender');
    expect(segunda.body['ok']).toBe(false);
    expect(String(segunda.body['error'])).toContain('limite de atendimentos simultâneos');
    expect(String(segunda.body['error'])).toContain('(1 em andamento)');
    expect(await activeOfAgent()).toBe(1);
  });

  it('liberar uma vaga (encerrar) volta a deixar puxar', async () => {
    await a.dono.execute(sql`
      update conversa set estado = 'encerrada', encerrada_em = now()
       where atendente_id = ${a.agentId}::uuid and estado <> 'encerrada'
    `);
    const { body } = await acao(sessionAgent, 'atender');
    expect(body['ok']).toBe(true);
    expect(await activeOfAgent()).toBe(1);
  });

  it('a corrida: duas puxadas simultâneas com uma vaga só não furam o limite', async () => {
    await zerarComLimite(1);
    await createConversationInQueue();
    await createConversationInQueue();

    const [r1, r2] = await Promise.all([
      acao(sessionAgent, 'atender'),
      acao(sessionAgent, 'atender'),
    ]);
    const oks = [r1, r2].filter((r) => r.body['ok'] === true);
    const recusas = [r1, r2].filter((r) => r.body['ok'] === false);
    expect(oks).toHaveLength(1);
    expect(recusas).toHaveLength(1);
    expect(String(recusas[0]!.body['error'])).toContain('limite de atendimentos simultâneos');
    expect(await activeOfAgent()).toBe(1);
  });

  it('Allow multiple pulls up to queue capacity and report an empty queue afterward', async () => {
    await zerarComLimite(3);
    await a.dono.execute(sql`
      update conversa set estado = 'encerrada', encerrada_em = now()
       where estado = 'na_fila' and fila_id = ${a.queueId}::uuid
    `);
    await createConversationInQueue();
    await createConversationInQueue();
    expect((await acao(sessionAgent, 'atender')).body['ok']).toBe(true);
    expect((await acao(sessionAgent, 'atender')).body['ok']).toBe(true);
    const vazia = await acao(sessionAgent, 'atender');
    expect(vazia.body).toMatchObject({ ok: false, error: 'Não há clientes aguardando.' });

    // // Returns the scenario: no override and no conversation stuck on the agent.
    await a.dono.execute(sql`
      update fila_atendente set capacidade_override = null
       where usuario_id = ${a.agentId}::uuid and fila_id = ${a.queueId}::uuid
    `);
  });
});

describe('Pin conversations and mark them unread per agent', () => {
  async function taggingOf(conversationId: string) {
    const { rows } = await a.dono.execute<{
      fixada_em: Date | string | null;
      nao_lida_em: Date | string | null;
    }>(sql`
      select fixada_em, nao_lida_em from marcacao_conversa
       where usuario_id = ${a.agentId}::uuid and conversa_id = ${conversationId}::uuid
    `);
    return rows[0] ?? null;
  }

  async function queueOfDesk(): Promise<{ id: string; fixadaEm: string | null; naoLidaEm: string | null }[]> {
    const resposta = await fetch(`${api.url}/v1/desk/queue`, { headers: comCookie(sessionAgent) });
    const corpo = (await resposta.json()) as {
      conversations: { id: string; fixadaEm: string | null; naoLidaEm: string | null }[];
    };
    return corpo.conversations;
  }

  it('Pin a conversation with `fixadaAt`, keep the timestamp on repeat, and remove it on unpin', async () => {
    const conversaId = await createConversationAssigned(a.agentId);
    const fixada = await acao(sessionAgent, 'fixar', { conversaId, fixada: 'true' });
    expect(fixada.body).toMatchObject({ ok: true, fixada: true });
    const primeira = await taggingOf(conversaId);
    expect(primeira?.fixada_em).not.toBeNull();

    await new Promise((r) => setTimeout(r, 10));
    await acao(sessionAgent, 'fixar', { conversaId, fixada: 'true' });
    expect(new Date((await taggingOf(conversaId))!.fixada_em!).getTime()).toBe(
      new Date(primeira!.fixada_em!).getTime(),
    );

    const inQueue = (await queueOfDesk()).find((c) => c.id === conversaId);
    expect(inQueue?.fixadaEm).not.toBeNull();
    expect(inQueue?.naoLidaEm).toBeNull();

    const desafixada = await acao(sessionAgent, 'fixar', { conversaId, fixada: 'false' });
    expect(desafixada.body).toMatchObject({ ok: true, fixada: false });
    expect(await taggingOf(conversaId)).toBeNull();
  });

  it('Mark a conversation unread and read without losing its pin state', async () => {
    const conversaId = await createConversationAssigned(a.agentId);
    await acao(sessionAgent, 'fixar', { conversaId, fixada: 'true' });
    const naoLida = await acao(sessionAgent, 'marcarNaoLida', { conversaId, naoLida: 'true' });
    expect(naoLida.body).toMatchObject({ ok: true, naoLida: true });
    const ambas = await taggingOf(conversaId);
    expect(ambas?.fixada_em).not.toBeNull();
    expect(ambas?.nao_lida_em).not.toBeNull();
    expect((await queueOfDesk()).find((c) => c.id === conversaId)?.naoLidaEm).not.toBeNull();

    await acao(sessionAgent, 'marcarNaoLida', { conversaId, naoLida: 'false' });
    const soFixada = await taggingOf(conversaId);
    expect(soFixada?.fixada_em).not.toBeNull();
    expect(soFixada?.nao_lida_em).toBeNull();

    await acao(sessionAgent, 'fixar', { conversaId, fixada: 'false' });
    expect(await taggingOf(conversaId)).toBeNull();
  });

  it('Reject pinning without a value, for another agent\'s conversation, or after closure', async () => {
    const minha = await createConversationAssigned(a.agentId);
    const withoutValue = await acao(sessionAgent, 'fixar', { conversaId: minha });
    expect(withoutValue.body).toMatchObject({ ok: false });

    const doColega = await createConversationAssigned(colegaId);
    const alheia = await acao(sessionAgent, 'fixar', { conversaId: doColega, fixada: 'true' });
    expect(alheia.body).toMatchObject({ ok: false, error: 'Esta conversa não está com você.' });
    expect(await taggingOf(doColega)).toBeNull();

    await a.dono.execute(
      sql`update conversa set estado = 'encerrada', encerrada_em = now() where id = ${minha}::uuid`,
    );
    const fechada = await acao(sessionAgent, 'marcarNaoLida', { conversaId: minha, naoLida: 'true' });
    expect(fechada.body).toMatchObject({ ok: false, error: 'A conversa já foi encerrada.' });

    const inexistente = await acao(sessionAgent, 'fixar', { conversaId: randomUUID(), fixada: 'true' });
    expect(inexistente.body).toMatchObject({ ok: false, error: 'Conversa não encontrada.' });
  });

  it('o teto de 50 fixadas da origem', async () => {
    const outras: string[] = [];
    for (let i = 0; i < 50; i += 1) outras.push(await createConversationAssigned(a.agentId));
    for (const id of outras) {
      await a.dono.execute(sql`
        insert into marcacao_conversa (tenant_id, usuario_id, conversa_id, fixada_em)
        values (${a.tenantId}, ${a.agentId}::uuid, ${id}::uuid, now())
      `);
    }
    const aMais = await createConversationAssigned(a.agentId);
    const recusa = await acao(sessionAgent, 'fixar', { conversaId: aMais, fixada: 'true' });
    expect(recusa.body).toMatchObject({
      ok: false,
      error: 'Você já tem 50 conversas fixadas. Desafixe uma para fixar outra.',
    });
    // // Re-fixing one of the 50 doesn't hit the ceiling.
    const refixa = await acao(sessionAgent, 'fixar', { conversaId: outras[0]!, fixada: 'true' });
    expect(refixa.body).toMatchObject({ ok: true });

    await a.dono.execute(
      sql`delete from marcacao_conversa where usuario_id = ${a.agentId}::uuid`,
    );
  });
});

describe('Transfer selected conversations in bulk', () => {
  it('Reject a bulk transfer without selected conversations or a destination', async () => {
    const semConversa = await acao(sessionAgent, 'transferirEmMassa', { paraAtendenteId: colegaId });
    expect(semConversa.body).toMatchObject({
      ok: false,
      error: 'Selecione ao menos um atendimento.',
    });

    const conversaId = await createConversationAssigned(a.agentId);
    const withoutDestination = await acao(sessionAgent, 'transferirEmMassa', { conversaId: [conversaId] });
    expect(withoutDestination.body).toMatchObject({
      ok: false,
      error: 'Escolha a fila ou o atendente de destino.',
    });
  });

  it('Transfer multiple assigned conversations to another agent', async () => {
    const c1 = await createConversationAssigned(a.agentId);
    const c2 = await createConversationAssigned(a.agentId);

    const { body } = await acao(sessionAgent, 'transferirEmMassa', {
      conversaId: [c1, c2],
      paraAtendenteId: colegaId,
    });
    expect(body).toMatchObject({ ok: true, transferidas: 2 });

    const { rows } = await a.dono.execute<{ id: string; state: string }>(sql`
      select id, estado as state from conversa where id in (${c1}::uuid, ${c2}::uuid)
    `);
    expect(rows.every((r) => r.state === 'encerrada')).toBe(true);

    const { rows: novas } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from conversa
       where atendente_id = ${colegaId}::uuid and estado = 'atribuida'
    `);
    expect(Number(novas[0]?.n)).toBeGreaterThanOrEqual(2);
  });

  it('Continue a bulk transfer past a missing conversation and return the first error', async () => {
    const c1 = await createConversationAssigned(a.agentId);
    const { body } = await acao(sessionAgent, 'transferirEmMassa', {
      conversaId: [c1, randomUUID()],
      paraAtendenteId: colegaId,
    });
    expect(body['ok']).toBe(true);
    expect(body['transferidas']).toBe(1);
    expect(typeof body['error']).toBe('string');
  });
});

describe('Filas por fluxo', () => {
  let outraFila: string;
  let outroFluxo: string;

  beforeAll(async () => {
    const { rows: fl } = await a.dono.execute<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, short_name)
      values (${a.tenantId}, 'Outro fluxo', ${`outro${randomUUID().slice(0, 6)}`}) returning id
    `);
    outroFluxo = fl[0]!.id;
    const { rows: fi } = await a.dono.execute<{ id: string }>(sql`
      insert into fila (tenant_id, fluxo_id, nome)
      values (${a.tenantId}, ${outroFluxo}, ${`Outra ${randomUUID().slice(0, 6)}`}) returning id
    `);
    outraFila = fi[0]!.id;
  });

  const filas = async (query = '') => {
    const r = await fetch(`${api.url}/v1/desk/queues${query}`, { headers: comCookie(sessionAgent) });
    return (await r.json()) as { queues: { id: string; flowId: string; flowName: string }[] };
  };

  it('lista só as filas do fluxo da conversa aberta', async () => {
    const conversaId = await createConversationAssigned(a.agentId);
    const ids = (await filas(`?conversationId=${conversaId}`)).queues.map((q) => q.id);
    expect(ids).toContain(a.queueId);
    expect(ids).not.toContain(outraFila);
  });

  it('sem conversa lista todas, cada uma com seu fluxo', async () => {
    const { queues } = await filas();
    expect(queues.find((q) => q.id === outraFila)).toMatchObject({ flowId: outroFluxo, flowName: 'Outro fluxo' });
    expect(queues.some((q) => q.id === a.queueId)).toBe(true);
  });

  it('transferência em massa: a conversa do fluxo entra, a de outro fluxo falha sem abortar', async () => {
    const { rows: q } = await a.dono.execute<{ id: string }>(sql`
      insert into fila (tenant_id, fluxo_id, nome)
      values (${a.tenantId}, ${a.flowId}, ${`Destino ${randomUUID().slice(0, 6)}`}) returning id
    `);
    const doFluxo = await createConversationAssigned(a.agentId);
    const contatoId = await createContact();
    const { rows: c } = await a.dono.execute<{ id: string }>(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, atribuida_em)
      values (${a.tenantId}, ${a.inboxId}::uuid, ${contatoId}::uuid, ${outraFila}::uuid, ${a.agentId}::uuid, 'atribuida', now())
      returning id
    `);
    const { body } = await acao(sessionAgent, 'transferirEmMassa', {
      conversaId: [c[0]!.id, doFluxo],
      paraFilaId: q[0]!.id,
    });
    expect(body).toMatchObject({ ok: true, transferidas: 1 });
    expect(typeof body['error']).toBe('string');
  });
});

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { matchCommand } = await import('@pipe/core');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { transferConversation } = await import('../src/domain/conversation.js');
const { DESK_READ_COMMANDS } = await import('../src/domain/desk-commands.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * One way into a queue (`enterQueue`): the attendance rules (`regra_fila`) edited in the Builder
 * and in Cadastros really choose the queue of a bot handoff and of a conversation without a bot;
 * a Desk transfer to a queue gets the same events and distribution; and the bot's closure records
 * who closed, so Blip's `ClosedClient`/`ClosedClientInactivity` are reachable.
 */

let api: Awaited<ReturnType<typeof upApi>>;
let cenario: Cenario;
let financeiroId: string;
let ruleId: string;

beforeAll(async () => {
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  cenario = await montarCenario(`fila-regra-${randomUUID().slice(0, 8)}`);
  const { rows: fila } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fila (tenant_id, fluxo_id, nome) values (${cenario.tenantId}, ${cenario.flowId}, 'Financeiro') returning id
  `);
  financeiroId = fila[0]!.id;
  const { rows: regra } = await cenario.dono.execute<{ id: string }>(sql`
    insert into regra_fila (tenant_id, nome, ordem, combinador, fila_destino_id, ativa)
    values (${cenario.tenantId}, 'Boleto', 0, 'e', ${financeiroId}, true) returning id
  `);
  ruleId = regra[0]!.id;
  await cenario.dono.execute(sql`
    insert into regra_fila_condicao (tenant_id, regra_id, campo, operador, valor)
    values (${cenario.tenantId}, ${ruleId}, 'mensagem', 'contem', 'boleto')
  `);
}, 180_000);

afterEach(async () => {
  await cenario?.encerrar();
});

async function publicar(outputActions: unknown[]): Promise<void> {
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Transbordo',
      channelId: cenario.channelId,
      json: { id: 'transbordo', states: [{ id: 'raiz', root: true, input: {}, outputActions, outputs: [] }] },
      publicar: true,
    }),
  );
  expect(r.errorOfValidation).toBeNull();
  // D-04: a fila precisa ser do fluxo que transborda
  await cenario.dono.execute(
    sql`update fila set fluxo_id = ${r.flowId} where id in (${cenario.queueId}, ${financeiroId})`,
  );
}

async function falar(de: string, texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(de, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

type Conversa = { id: string; fila_id: string | null; atendente_id: string | null; estado: string };

async function conversaDe(telefone: string): Promise<Conversa> {
  const { rows } = await cenario.dono.execute<Conversa>(sql`
    select c.id, c.fila_id, c.atendente_id, c.estado
      from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
     order by c.criada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function eventos(conversaId: string): Promise<{ tipo: string; fila_id: string | null; dados: Record<string, unknown> }[]> {
  const { rows } = await cenario.dono.execute<{ tipo: string; fila_id: string | null; dados: Record<string, unknown> }>(sql`
    select tipo, fila_id, dados from evento_atendimento where conversa_id = ${conversaId}::uuid order by em, tipo
  `);
  return rows;
}

/** A second agent, online, serving only Financeiro. */
async function agenteNoFinanceiro(): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Fábio Financeiro', ${`fabio-${randomUUID().slice(0, 8)}@e2e.pipe.app`}) returning id
  `);
  const id = rows[0]!.id;
  await cenario.dono.execute(sql`
    insert into fila_atendente (tenant_id, fila_id, usuario_id) values (${cenario.tenantId}, ${financeiroId}, ${id})
  `);
  await cenario.dono.execute(sql`
    insert into status_atendente (usuario_id, tenant_id, estado, desde) values (${id}, ${cenario.tenantId}, 'online', now())
  `);
  return id;
}

describe('attendance rules route the bot handoff', () => {
  it('sends a matching conversation to the rule queue and the rest to the inbox default', async () => {
    await publicar([{ type: 'ForwardToDesk', settings: {} }]);

    await falar('5511944440001', 'Quero a segunda via do BOLETO');
    const casou = await conversaDe('5511944440001');
    expect(casou.fila_id).toBe(financeiroId);
    const entrada = (await eventos(casou.id)).find((e) => e.tipo === 'enfileirada');
    expect(entrada).toMatchObject({ fila_id: financeiroId, dados: { origem: 'fluxo', regra_fila_id: ruleId } });

    await falar('5511944440002', 'oi');
    expect((await conversaDe('5511944440002')).fila_id).toBe(cenario.queueId);
  });

  it('keeps an explicit ForwardToDesk queue over the rules', async () => {
    await publicar([{ type: 'ForwardToDesk', settings: { filaId: cenario.queueId } }]);
    await falar('5511944440003', 'boleto');
    expect((await conversaDe('5511944440003')).fila_id).toBe(cenario.queueId);
  });

  it('an edited rule changes the destination on the next handoff', async () => {
    await publicar([{ type: 'ForwardToDesk', settings: {} }]);
    await cenario.dono.execute(sql`update regra_fila set ativa = false where id = ${ruleId}::uuid`);
    await falar('5511944440004', 'boleto');
    expect((await conversaDe('5511944440004')).fila_id).toBe(cenario.queueId);
  });
});

describe('one entry path for inbound and Desk transfer', () => {
  it('routes a conversation without a bot by the rules, with events and distribution', async () => {
    const fabio = await agenteNoFinanceiro();
    await falar('5511944440005', 'boleto atrasado');
    const conversa = await conversaDe('5511944440005');
    expect(conversa).toMatchObject({ fila_id: financeiroId, atendente_id: fabio, estado: 'atribuida' });
    expect((await eventos(conversa.id)).map((e) => e.tipo)).toEqual(expect.arrayContaining(['criada', 'enfileirada', 'atribuida']));
  });

  it('distributes a Desk transfer to a queue like any other entry', async () => {
    const fabio = await agenteNoFinanceiro();
    const { rows: contato } = await cenario.dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome, telefone_e164) values (${cenario.tenantId}, 'Cliente', '+5511944440006') returning id
    `);
    const { rows: conversa } = await cenario.dono.execute<{ id: string }>(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, atribuida_em)
      values (${cenario.tenantId}, ${cenario.inboxId}, ${contato[0]!.id}, ${cenario.queueId}, ${cenario.agentId}, 'em_atendimento', now())
      returning id
    `);

    const feito = await transferConversation(
      { tenantId: cenario.tenantId, agentId: cenario.agentId, requireAssignment: false },
      { conversationId: conversa[0]!.id, forQueueId: financeiroId },
    );

    expect(feito.state).toBe('atribuida');
    const { rows: nova } = await cenario.dono.execute<{ fila_id: string; atendente_id: string }>(sql`
      select fila_id, atendente_id from conversa where id = ${feito.forConversationId}::uuid
    `);
    expect(nova[0]).toEqual({ fila_id: financeiroId, atendente_id: fabio });
    expect((await eventos(feito.forConversationId)).map((e) => e.tipo)).toEqual(
      expect.arrayContaining(['criada', 'transferida_fila', 'atribuida']),
    );
  });
});

describe('who closed', () => {
  async function statusDoTicket(conversaId: string): Promise<string> {
    const read = DESK_READ_COMMANDS['desk.tickets.get']!;
    const command = matchCommand({ to: 'postmaster@desk.msging.net', method: 'get', uri: `/ticket/${conversaId}` })!;
    const r = (await noTenant(cenario.tenantId, (tx) => read(tx, cenario.tenantId, command))) as { resource: { status: string } };
    return r.resource.status;
  }

  it('a bot closure is ClosedClient', async () => {
    await publicar([{ type: 'SendCommand', settings: { uri: '/tickets/atual/status', resource: { status: 'encerrada' } } }]);
    await falar('5511944440007', 'tchau');
    const conversa = await conversaDe('5511944440007');
    expect(conversa.estado).toBe('encerrada');
    expect(await statusDoTicket(conversa.id)).toBe('ClosedClient');
  });

  it('a bot closure for inactivity is ClosedClientInactivity', async () => {
    await publicar([
      { type: 'SendCommand', settings: { uri: '/tickets/atual/status', resource: { status: 'encerrada', closedBy: 'inatividade' } } },
    ]);
    await falar('5511944440008', 'oi');
    const conversa = await conversaDe('5511944440008');
    expect(conversa.estado).toBe('encerrada');
    expect(await statusDoTicket(conversa.id)).toBe('ClosedClientInactivity');
  });
});

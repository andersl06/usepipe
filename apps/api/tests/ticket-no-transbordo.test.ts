import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { adotarFilas, assinar, montarCenario, payloadOfMessage, respostasDoBot, sessaoDoBot } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * The ticket (`conversa`) is born at the handoff: until then the talk with the bot lives in
 * `execucao_fluxo` and in messages linked to the execution. A channel without a flow still opens
 * the ticket at entry.
 */

let api: Awaited<ReturnType<typeof upApi>>;
let cenario: Cenario;

beforeAll(async () => {
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  cenario = await montarCenario(`ticket-${randomUUID().slice(0, 8)}`);
}, 180_000);

afterEach(async () => {
  await cenario?.encerrar();
});

const say = (content: string) => ({ type: 'SendMessage', settings: { type: 'text/plain', content } });
const command = (uri: string, resource: unknown) => ({ type: 'SendCommand', settings: { uri, resource } });

/** First message: the bot greets and waits; the second message runs `aoReceber`. */
async function publicar(aoReceber: unknown[], opcoes: { adotarFilas?: boolean } = {}): Promise<void> {
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Ticket no transbordo',
      channelId: cenario.channelId,
      json: {
        id: 'ticket-no-transbordo',
        states: [
          { id: 'raiz', root: true, input: {}, outputActions: [say('Olá! Qual é o seu pedido?')], outputs: [{ stateId: 'pedido' }] },
          { id: 'pedido', input: {}, outputActions: aoReceber, outputs: [] },
        ],
      },
      publicar: true,
    }),
  );
  expect(r.errorOfValidation).toBeNull();
  if (opcoes.adotarFilas !== false) await adotarFilas(cenario, r.flowId);
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

type Ticket = { id: string; estado: string; prioridade: string; fila_id: string | null; atendente_id: string | null };

async function ticketsDe(telefone: string): Promise<Ticket[]> {
  const { rows } = await cenario.dono.execute<Ticket>(sql`
    select c.id, c.estado, c.prioridade, c.fila_id, c.atendente_id
      from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
     order by c.criada_em
  `);
  return rows;
}

async function eventos(conversaId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ tipo: string }>(
    sql`select tipo from evento_atendimento where conversa_id = ${conversaId}::uuid order by em, tipo`,
  );
  return rows.map((r) => r.tipo);
}

describe('bot conversation without a ticket', () => {
  it('keeps the entry and the bot replies in the execution, with no conversa row', async () => {
    await publicar([say('Anotado.')]);
    await falar('5511966660001', 'oi');

    expect(await ticketsDe('5511966660001')).toEqual([]);
    const sessao = await sessaoDoBot(cenario, '5511966660001');
    expect(sessao.conversa_id).toBeNull();
    const { rows } = await cenario.dono.execute<{ direcao: string; conversa_id: string | null; execucao_id: string | null }>(sql`
      select direcao, conversa_id, execucao_id from mensagem where tenant_id = ${cenario.tenantId}::uuid order by criada_em
    `);
    expect(rows.map((m) => m.direcao)).toEqual(['entrada', 'saida']);
    expect(rows.every((m) => m.conversa_id === null && m.execucao_id === sessao.id)).toBe(true);
    expect(await respostasDoBot(cenario, sessao.id)).toEqual(['Olá! Qual é o seu pedido?']);

    const { rows: outbox } = await cenario.dono.execute<{ n: number }>(sql`
      select count(*)::int as n from outbox_mensagem o join mensagem m on m.id = o.mensagem_id where m.execucao_id = ${sessao.id}::uuid
    `);
    expect(outbox[0]!.n).toBe(1);
  });

  it('continues the same execution on the next message', async () => {
    await publicar([say('Anotado.')]);
    await falar('5511966660002', 'oi');
    const primeira = await sessaoDoBot(cenario, '5511966660002');
    await falar('5511966660002', 'pedido 10');
    const segunda = await sessaoDoBot(cenario, '5511966660002');
    expect(segunda.id).toBe(primeira.id);
    expect(await respostasDoBot(cenario, segunda.id)).toEqual(['Olá! Qual é o seu pedido?', 'Anotado.']);
    expect(await ticketsDe('5511966660002')).toEqual([]);
  });

  it('opens the ticket at entry on a channel without a flow', async () => {
    await falar('5511966660003', 'oi');
    const tickets = await ticketsDe('5511966660003');
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.estado).toMatch(/^(Waiting|Assigned)$/);
    expect(await eventos(tickets[0]!.id)).toEqual(expect.arrayContaining(['criada', 'enfileirada']));
  });

  it('sends the message to the open ticket and keeps the bot silent while a person owns it', async () => {
    await publicar([say('Anotado.')]);
    await falar('5511966660004', 'oi');
    const sessao = await sessaoDoBot(cenario, '5511966660004');
    const { rows: contato } = await cenario.dono.execute<{ contato_id: string }>(sql`
      select contato_id from execucao_fluxo where id = ${sessao.id}::uuid
    `);
    const { rows: tk } = await cenario.dono.execute<{ id: string }>(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado)
      values (${cenario.tenantId}::uuid, ${cenario.inboxId}::uuid, ${contato[0]!.contato_id}::uuid,
              ${cenario.queueId}::uuid, ${cenario.agentId}::uuid, 'Assigned') returning id
    `);
    await cenario.dono.execute(sql`update execucao_fluxo set conversa_id = ${tk[0]!.id}::uuid where id = ${sessao.id}::uuid`);

    await falar('5511966660004', 'alô?');
    expect(await ticketsDe('5511966660004')).toHaveLength(1);
    expect(await respostasDoBot(cenario, sessao.id)).toEqual(['Olá! Qual é o seu pedido?']);
    const { rows } = await cenario.dono.execute<{ conversa_id: string | null }>(sql`
      select conversa_id from mensagem where tenant_id = ${cenario.tenantId}::uuid and conteudo = 'alô?'
    `);
    expect(rows[0]!.conversa_id).toBe(tk[0]!.id);
  });
});

describe('the handoff creates the ticket', () => {
  it('creates exactly one ticket in the queue, adopts the bot history and stamps the events at the handoff', async () => {
    await publicar([{ type: 'ForwardToDesk', settings: {} }]);
    await falar('5511966660010', 'oi');
    expect(await ticketsDe('5511966660010')).toEqual([]);
    const antes = new Date();
    await falar('5511966660010', 'quero atendimento');

    const tickets = await ticketsDe('5511966660010');
    expect(tickets).toHaveLength(1);
    const ticket = tickets[0]!;
    expect(ticket.fila_id).toBe(cenario.queueId);
    expect(ticket.estado).toMatch(/^(Waiting|Assigned)$/);

    const sessao = await sessaoDoBot(cenario, '5511966660010');
    expect(sessao.conversa_id).toBe(ticket.id);
    const { rows: msgs } = await cenario.dono.execute<{ conversa_id: string | null }>(sql`
      select conversa_id from mensagem where execucao_id = ${sessao.id}::uuid
    `);
    expect(msgs.length).toBeGreaterThanOrEqual(3);
    expect(msgs.every((m) => m.conversa_id === ticket.id)).toBe(true);

    expect(await eventos(ticket.id)).toEqual(expect.arrayContaining(['criada', 'enfileirada']));
    const { rows: criada } = await cenario.dono.execute<{ em: Date }>(sql`
      select em from evento_atendimento where conversa_id = ${ticket.id}::uuid and tipo = 'criada'
    `);
    expect(new Date(criada[0]!.em).getTime()).toBeGreaterThanOrEqual(antes.getTime() - 1000);

    const { rows: notas } = await cenario.dono.execute<{ corpo: string }>(sql`
      select corpo from nota_interna where conversa_id = ${ticket.id}::uuid
    `);
    expect(notas).toHaveLength(1);
    const { rows: janela } = await cenario.dono.execute<{ janela_expira_em: Date | null }>(sql`
      select janela_expira_em from conversa where id = ${ticket.id}::uuid
    `);
    expect(janela[0]!.janela_expira_em).not.toBeNull();
  });

  it('applies the priority and the tags the bot set before the handoff', async () => {
    await publicar([
      command('/tickets/atual/priority', { priority: 'alta' }),
      command('/tickets/atual/change-tags', { tags: ['vip'] }),
      { type: 'ForwardToDesk', settings: {} },
    ]);
    await falar('5511966660011', 'oi');
    await falar('5511966660011', 'preciso de ajuda');

    const tickets = await ticketsDe('5511966660011');
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.prioridade).toBe('alta');
    const { rows } = await cenario.dono.execute<{ nome: string }>(sql`
      select e.nome from conversa_etiqueta ce join etiqueta e on e.id = ce.etiqueta_id where ce.conversa_id = ${tickets[0]!.id}::uuid
    `);
    expect(rows.map((r) => r.nome)).toEqual(['vip']);
    const { rows: nota } = await cenario.dono.execute<{ corpo: string }>(sql`
      select corpo from nota_interna where conversa_id = ${tickets[0]!.id}::uuid
    `);
    expect(nota[0]!.corpo).not.toContain('pipe.ticket');
  });

  it('reads no ticket and refuses to close one before the handoff', async () => {
    await publicar([command('/tickets/atual/status', { status: 'ClosedClient' })]);
    await falar('5511966660012', 'oi');
    await falar('5511966660012', 'tchau');

    // Closing without a ticket fails the action; the failure handoff opens a ticket that stays open.
    const tickets = await ticketsDe('5511966660012');
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.estado).not.toBe('ClosedClient');
  });

  it('never loses the contact when no queue is possible: the ticket waits without a queue', async () => {
    await publicar([{ type: 'ForwardToDesk', settings: {} }], { adotarFilas: false });
    await falar('5511966660013', 'oi');
    await falar('5511966660013', 'ajuda');

    const tickets = await ticketsDe('5511966660013');
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.estado).toBe('Waiting');
    expect(tickets[0]!.fila_id).toBeNull();
  });

  it('a second handoff with the ticket already open does not create another one', async () => {
    await publicar([
      { type: 'ForwardToDesk', settings: {} },
      command('/tickets/atual/transfer', { queueId: cenario.queueId }),
    ]);
    await falar('5511966660014', 'oi');
    await falar('5511966660014', 'ajuda');
    expect(await ticketsDe('5511966660014')).toHaveLength(1);
  });

  it('returns to the bot after the ticket is closed, without creating a conversation', async () => {
    await publicar([{ type: 'ForwardToDesk', settings: {} }]);
    await falar('5511966660015', 'oi');
    await falar('5511966660015', 'ajuda');
    const [ticket] = await ticketsDe('5511966660015');
    await cenario.dono.execute(sql`
      update conversa set estado = 'ClosedAttendant', encerrada_em = now() where id = ${ticket!.id}::uuid
    `);

    await falar('5511966660015', 'voltei');
    const depois = await ticketsDe('5511966660015');
    expect(depois).toHaveLength(1);
    const sessao = await sessaoDoBot(cenario, '5511966660015');
    expect(sessao.conversa_id).toBeNull();
    expect((await respostasDoBot(cenario, sessao.id)).length).toBeGreaterThan(0);
  });
});

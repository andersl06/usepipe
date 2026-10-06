import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { listContactsOfFlow, loadDetailContactOfFlow } = await import('../src/domain/management-flow.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/** Contacts of a router service come from its executions; a service with its own channel keeps the channel path. */

const SERVICE = {
  states: [{ id: 'inicio', root: true, input: {}, outputs: [] }],
};

let a: Cenario;
let serviceA: string;
let serviceB: string;
let withTicket: string;
let botOnly: string;
let ofChannel: string;

async function publish(nome: string): Promise<string> {
  const r = await noTenant(a.tenantId, (tx) =>
    importFlowOfBlip(tx, { tenantId: a.tenantId, name: nome, channelId: null, json: SERVICE, publicar: true }),
  );
  expect(r.errorOfValidation).toBeNull();
  return r.flowId;
}

async function newContact(nome: string): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${a.tenantId}, ${nome}) returning id
  `);
  return rows[0]!.id;
}

async function execute(flowId: string, contactId: string): Promise<void> {
  await a.dono.execute(sql`
    insert into execucao_fluxo (tenant_id, fluxo_versao_id, contato_id, inbox_id, estado)
    select ${a.tenantId}::uuid, v.id, ${contactId}::uuid, ${a.inboxId}::uuid, 'aguardando'
      from fluxo_versao v where v.fluxo_id = ${flowId}::uuid and v.tenant_id = ${a.tenantId}::uuid limit 1
  `);
}

beforeAll(async () => {
  a = await montarCenario(`rc-${randomUUID().slice(0, 8)}`);
  serviceA = await publish('Servico A');
  serviceB = await publish('Servico B');
  withTicket = await newContact('Atendida por B');
  botOnly = await newContact('So conversou com o bot');
  ofChannel = await newContact('Do canal proprio');
  await a.dono.execute(sql`
    insert into contato_identidade (tenant_id, contato_id, canal_tipo, identificador)
    values (${a.tenantId}, ${ofChannel}, 'whatsapp_cloud', '5511900000009'),
           (${a.tenantId}, ${ofChannel}, 'whatsapp_cloud', '5511900000001')
  `);
  await a.dono.execute(sql`
    insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal)
    values (${a.tenantId}, ${a.flowId}, ${serviceB}, 'servico-b', true)
  `);
  await execute(serviceB, withTicket);
  await execute(serviceB, botOnly);
  await a.dono.execute(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, estado)
    values (${a.tenantId}, ${a.inboxId}, ${withTicket}, 'Open')
  `);
  await a.dono.execute(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, estado)
    values (${a.tenantId}, ${a.inboxId}, ${ofChannel}, 'Open')
  `);
}, 180_000);

afterAll(async () => {
  await a?.encerrar();
});

const lista = (flowId: string) =>
  noTenant(a.tenantId, (tx) => listContactsOfFlow(tx, a.tenantId, flowId));

describe('contacts of a router service', () => {
  it('lists the contacts of the service executions and not those of another service', async () => {
    const idsB = (await lista(serviceB)).map((c) => c.id);
    expect(idsB).toContain(withTicket);
    expect(idsB).not.toContain(ofChannel);
    expect(await lista(serviceA)).toEqual([]);
  });

  it('lists a contact that only talked to the bot (no ticket)', async () => {
    const item = (await lista(serviceB)).find((c) => c.id === botOnly);
    expect(item).toMatchObject({ conversas: 0 });
    expect(item?.ultimaConversa).not.toBeNull();
  });

  it('counts the tickets of the contact in the inbox of the execution', async () => {
    const item = (await lista(serviceB)).find((c) => c.id === withTicket);
    expect(item).toMatchObject({ conversas: 1 });
  });

  it('keeps listing the contacts of the flow own channel', async () => {
    const ids = (await lista(a.flowId)).map((c) => c.id);
    expect(ids).toContain(ofChannel);
    expect(ids).toContain(withTicket);
    expect(ids).not.toContain(botOnly);
  });

  it('opens the detail only for contacts the service serves', async () => {
    const detail = (flowId: string, contactId: string) =>
      noTenant(a.tenantId, (tx) => loadDetailContactOfFlow(tx, a.tenantId, flowId, contactId));
    expect((await detail(serviceB, botOnly))?.pessoa.id).toBe(botOnly);
    expect((await detail(serviceB, withTicket))?.conversations).toHaveLength(1);
    expect(await detail(serviceA, botOnly)).toBeNull();
    expect(await detail(serviceB, ofChannel)).toBeNull();
  });

  it('labels a router row with the smallest stored channel identity as <digits>@wa.gw.msging.net', async () => {
    const item = (await lista(a.flowId)).find((c) => c.id === ofChannel);
    expect(item?.identidade).toBe('5511900000001@wa.gw.msging.net');
  });

  it('labels a service flow row with the tunnel identity', async () => {
    const item = (await lista(serviceB)).find((c) => c.id === withTicket);
    expect(item?.identidade).toBe(`${withTicket}@tunnel.msging.net`);
  });
});

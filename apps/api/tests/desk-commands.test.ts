import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { matchCommand } from '@pipe/core';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { DESK_READ_COMMANDS } = await import('../src/domain/desk-commands.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type Item = {
  [field: string]: unknown;
  id: string;
  name: string;
  agentsOnline: number;
  identity: string;
  teams: string[];
  storageDate: string;
  sequentialId: number;
};
type Response = { status: string; type?: string; resource: { itemType: string; items: Item[] }; reason?: { code: number } };

let a: Cenario;
let b: Cenario;

beforeEach(async () => {
  a = await montarCenario(`desk-cmd-a-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`desk-cmd-b-${randomUUID().slice(0, 8)}`);
}, 180_000);

afterEach(async () => {
  await a?.encerrar();
  await b?.encerrar();
});

/** Runs a Desk read the way a bot sends it (`to` desk), inside the tenant's RLS transaction. */
function desk(c: Cenario, uri: string): Promise<Response> {
  const command = matchCommand({ to: 'postmaster@desk.msging.net', method: 'get', uri });
  if (!command) throw new Error(`sem rota: ${uri}`);
  const handler = DESK_READ_COMMANDS[command.route];
  if (!handler) throw new Error(`sem handler: ${command.route}`);
  return noTenant(c.tenantId, (tx) => handler(tx, c.tenantId, command)) as Promise<Response>;
}

async function conversa(c: Cenario, contatoId: string, estado: string, criadaEm: string): Promise<string> {
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, criada_em, encerrada_em)
    values (${c.tenantId}, ${c.inboxId}, ${contatoId}, ${c.queueId}, ${estado}, ${criadaEm}::timestamptz,
            ${estado === 'ClosedClient' ? sql`${criadaEm}::timestamptz + interval '1 hour'` : sql`null`})
    returning id
  `);
  return rows[0]!.id;
}

async function contato(c: Cenario, telefone: string): Promise<string> {
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164) values (${c.tenantId}, 'Bia', ${`+${telefone}`}) returning id
  `);
  await c.dono.execute(sql`
    insert into contato_identidade (tenant_id, contato_id, canal_tipo, identificador)
    values (${c.tenantId}, ${rows[0]!.id}, 'whatsapp_cloud', ${telefone})
  `);
  return rows[0]!.id;
}

describe('Desk read commands', () => {
  it('get /teams and /teams/agents-online list active queues with online agents, per tenant', async () => {
    await a.dono.execute(sql`insert into fila (tenant_id, fluxo_id, nome) values (${a.tenantId}, ${a.flowId}, 'Vendas')`);
    await a.dono.execute(sql`insert into fila (tenant_id, fluxo_id, nome, ativa) values (${a.tenantId}, ${a.flowId}, 'Antiga', false)`);
    for (const uri of ['/teams', '/teams/agents-online']) {
      const r = await desk(a, uri);
      expect(r.status).toBe('success');
      expect(r.type).toBe('application/vnd.lime.collection+json');
      expect(r.resource.itemType).toBe('application/vnd.iris.desk.team+json');
      const items = r.resource.items as Array<{ name: string; agentsOnline: number }>;
      expect(items).toHaveLength(2);
      expect(items.find((t) => t.name.startsWith('Suporte desk-cmd-a-'))?.agentsOnline).toBe(1);
      expect(items.find((t) => t.name === 'Vendas')?.agentsOnline).toBe(0);
    }
  });

  it('agentsOnline drops when the agent pauses', async () => {
    await a.dono.execute(sql`update status_atendente set estado = 'Pause' where usuario_id = ${a.agentId}::uuid`);
    const r = await desk(a, '/teams/agents-online');
    expect(r.resource.items.map((t: { agentsOnline: number }) => t.agentsOnline)).toEqual([0]);
  });

  it('get /attendants lists queue members in Blip identity format', async () => {
    const r = await desk(a, '/attendants');
    expect(r.resource.itemType).toBe('application/vnd.iris.desk.attendant+json');
    expect(r.resource.items).toHaveLength(1);
    const agent = r.resource.items[0]!;
    expect(agent.identity).toMatch(/^ana-desk-cmd-a-.+%40e2e\.pipe\.app@blip\.ai$/);
    expect(agent).toMatchObject({ fullName: 'Ana Ribeiro', status: 'Online', ticketsInService: 0 });
    expect(agent.teams).toHaveLength(1);
  });

  it('get /tickets?$filter=customerIdentity lists open tickets, newest first; $closed=true adds closed ones', async () => {
    const cliente = await contato(a, '5511911110001');
    const fechada = await conversa(a, cliente, 'ClosedClient', '2026-09-01T10:00:00Z');
    const aberta = await conversa(a, cliente, 'Waiting', '2026-09-02T10:00:00Z');
    await conversa(a, await contato(a, '5511911110002'), 'Waiting', '2026-09-03T10:00:00Z');

    const abertas = await desk(a, `/tickets?$filter=customerIdentity%20eq%20'${cliente}'`);
    expect(abertas.resource.itemType).toBe('application/vnd.iris.ticket+json');
    expect(abertas.resource.items).toHaveLength(1);
    expect(abertas.resource.items[0]).toMatchObject({ id: aberta, customerIdentity: cliente, status: 'Waiting', closed: false });
    expect(abertas.resource.items[0]!.storageDate).toBe('2026-09-02T10:00:00.000Z');
    expect(abertas.resource.items[0]).not.toHaveProperty('openDate');

    const todas = await desk(a, `/tickets?$filter=(customerIdentity%20eq%20'${cliente}')&$closed=true`);
    expect(todas.resource.items.map((t: { id: string }) => t.id)).toEqual([aberta, fechada]);
    expect(todas.resource.items[1]).toMatchObject({ status: 'ClosedClient', closed: true });
    expect(todas.resource.items[0]!.sequentialId).toBeGreaterThan(todas.resource.items[1]!.sequentialId);

    // The channel identity Blip flows use resolves to the same contact.
    const porCanal = await desk(a, `/tickets?$filter=customerIdentity%20eq%20'5511911110001@wa.gw.msging.net'`);
    expect(porCanal.resource.items.map((t: { id: string }) => t.id)).toEqual([aberta]);

    const esperando = await desk(a, `/tickets?$filter=status%20eq%20'waiting'`);
    expect(esperando.resource.items).toHaveLength(2);
  });

  it('D-15: a contact talking to the bot without a handoff has no ticket; after the handoff it has exactly one', async () => {
    const cliente = await contato(a, '5511911110009');
    const { rows: versoes } = await a.dono.execute<{ id: string }>(sql`
      insert into fluxo_versao (tenant_id, fluxo_id, versao, estado) values (${a.tenantId}, ${a.flowId}, 1, 'publicada') returning id
    `);
    await a.dono.execute(sql`
      insert into execucao_fluxo (tenant_id, fluxo_versao_id, contato_id, inbox_id, estado)
      values (${a.tenantId}, ${versoes[0]!.id}, ${cliente}, ${a.inboxId}, 'aguardando')
    `);
    const filtro = `/tickets?$filter=customerIdentity%20eq%20'${cliente}'`;
    expect((await desk(a, filtro)).resource.items).toHaveLength(0);
    expect((await desk(a, `/tickets?$filter=status%20eq%20'waiting'`)).resource.items).toHaveLength(0);

    const ticket = await conversa(a, cliente, 'Waiting', '2026-09-04T10:00:00Z');
    expect((await desk(a, filtro)).resource.items.map((t) => t.id)).toEqual([ticket]);
    expect((await desk(a, `/tickets?$filter=status%20eq%20'waiting'`)).resource.items).toHaveLength(1);
  });

  it('get /ticket/{id} and /tickets/{id} return one ticket; another tenant gets resource-not-found', async () => {
    const cliente = await contato(a, '5511911110003');
    const id = await conversa(a, cliente, 'Open', '2026-09-02T10:00:00Z');
    for (const uri of [`/ticket/${id}`, `/tickets/${id}`]) {
      const r = await desk(a, uri);
      expect(r).toMatchObject({ status: 'success', type: 'application/vnd.iris.ticket+json', resource: { id, status: 'Open' } });
    }
    expect(await desk(b, `/ticket/${id}`)).toMatchObject({ status: 'failure', reason: { code: 67 } });
    expect(await desk(a, '/ticket/nao-existe')).toMatchObject({ status: 'failure', reason: { code: 67 } });
  });

  it('sequentialId is the stored ticket number and a transfer child carries parentSequentialId', async () => {
    const cliente = await contato(a, '5511911110004');
    const origem = await conversa(a, cliente, 'Transferred', '2026-09-02T10:00:00Z');
    const filho = await conversa(a, cliente, 'Open', '2026-09-02T11:00:00Z');
    await a.dono.execute(sql`update conversa set conversa_pai_id = ${origem}::uuid where id = ${filho}::uuid`);
    const { rows } = await a.dono.execute<{ id: string; n: number }>(
      sql`select id, numero_sequencial::int as n from conversa where id in (${origem}::uuid, ${filho}::uuid)`,
    );
    const n = (id: string): number => rows.find((r) => r.id === id)!.n;
    expect((await desk(a, `/ticket/${origem}`)).resource).toMatchObject({ status: 'Transferred', sequentialId: n(origem) });
    expect((await desk(a, `/ticket/${filho}`)).resource).toMatchObject({ status: 'Open', sequentialId: n(filho), parentSequentialId: n(origem) });
  });

  it('an unsupported $filter fails loudly', async () => {
    await expect(desk(a, `/tickets?$filter=storageDate%20gt%20'2026-01-01'`)).rejects.toThrow('não é suportado no Pipe');
  });
});

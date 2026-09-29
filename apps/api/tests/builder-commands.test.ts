import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { matchCommand, type CommandRequest } from '@pipe/core';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { executeCommand } = await import('../src/domain/engine-services.js');
const { redirectInRouter } = await import('../src/domain/router.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type Response = {
  method: string;
  status: string;
  type?: string;
  resource?: unknown;
  reason?: { code: number };
};

/**
 * P5 commands that need tenant data (`builder-commands.ts`): `get /flow-id?shortname=` and
 * `get /configuration/caller`, through the same `executeCommand` production and the Builder test
 * run use, plus Master-State's redirect by the service flow's short name.
 */

let a: Cenario;
let b: Cenario;

beforeEach(async () => {
  a = await montarCenario(`builder-cmd-a-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`builder-cmd-b-${randomUUID().slice(0, 8)}`);
}, 180_000);

afterEach(async () => {
  await a?.encerrar();
  await b?.encerrar();
});

async function newFlow(c: Cenario, tipo: 'fluxo' | 'roteador', shortName: string, estado = 'publicado'): Promise<string> {
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, short_name)
    values (${c.tenantId}, ${`${tipo} ${shortName}`}, ${tipo}, ${estado}, ${shortName})
    returning id
  `);
  return rows[0]!.id;
}

async function service(c: Cenario, routerId: string, serviceId: string, nome: string, principal: boolean): Promise<void> {
  await c.dono.execute(sql`
    insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal, persistente)
    values (${c.tenantId}, ${routerId}, ${serviceId}, ${nome}, ${principal}, ${!principal})
  `);
}

const noTickets = new Proxy({}, {
  get: () => () => {
    throw new Error('ticket effect not expected');
  },
}) as Parameters<typeof executeCommand>[4];

/** Runs a command the way a bot sends it, inside the tenant's RLS transaction. */
function run(c: Cenario, to: string, uri: string, flowId: string): Promise<Response> {
  const command = matchCommand({ to, method: 'get', uri });
  if (!command) throw new Error(`sem rota: ${uri}`);
  const request: CommandRequest = { uri, method: 'GET', resource: null, command, flowId };
  return noTenant(c.tenantId, (tx) => executeCommand(tx, c.tenantId, request, true, noTickets)) as Promise<Response>;
}

const BUILDER = 'postmaster@builder.msging.net';
const CORE = 'postmaster@msging.net';

describe('get /flow-id', () => {
  it('resolves a short name to the live flow of this tenant only', async () => {
    const caller = await newFlow(a, 'fluxo', 'chamador');
    const vendas = await newFlow(a, 'fluxo', 'vendas');
    await newFlow(a, 'fluxo', 'antigo', 'arquivado');
    const outroTenant = await newFlow(b, 'fluxo', 'so-do-b');

    expect(await run(a, BUILDER, '/flow-id?shortname=vendas', caller)).toEqual({
      method: 'get',
      status: 'success',
      type: 'text/plain',
      resource: vendas,
    });
    expect((await run(a, BUILDER, '/flow-id?shortname=VENDAS', caller)).resource).toBe(vendas);
    expect(await run(a, BUILDER, '/flow-id?shortname=antigo', caller)).toMatchObject({ status: 'failure', reason: { code: 67 } });
    expect(await run(a, BUILDER, '/flow-id?shortname=so-do-b', caller)).toMatchObject({ status: 'failure', reason: { code: 67 } });
    expect(await run(a, BUILDER, '/flow-id?shortname=', caller)).toMatchObject({ status: 'failure', reason: { code: 67 } });
    expect(await run(b, BUILDER, '/flow-id?shortname=so-do-b', caller)).toMatchObject({ resource: outroTenant });
  });
});

describe('get /configuration/caller', () => {
  it("lists the router's services as `settings.children` for a service flow", async () => {
    const router = await newFlow(a, 'roteador', 'roteador');
    const main = await newFlow(a, 'fluxo', 'sub-main');
    const faq = await newFlow(a, 'fluxo', 'sub-faq');
    await service(a, router, main, 'Main', true);
    await service(a, router, faq, 'PreFaq', false);

    const r = await run(a, CORE, '/configuration/caller', faq);
    expect(r).toMatchObject({ method: 'get', status: 'success', type: 'application/vnd.lime.collection+json' });
    const items = (r.resource as { items: { name: string; value: string; caller: string }[] }).items;
    const application = items.find((item) => item.name === 'Application')!;
    expect(application.caller).toBe('roteador@msging.net');
    const children = (JSON.parse(application.value) as { settings: { children: { service: string; shortName: string }[] } }).settings.children;
    expect(children.map(({ service, shortName }) => ({ service, shortName }))).toEqual([
      { service: 'Main', shortName: 'sub-main' },
      { service: 'PreFaq', shortName: 'sub-faq' },
    ]);

    // The export's chain: the script maps service → short name, then `/flow-id` finds the flow.
    const names = Object.fromEntries(children.map((child) => [child.service, child.shortName]));
    expect((await run(a, BUILDER, `/flow-id?shortname=${names['PreFaq']}`, faq)).resource).toBe(faq);
  });

  it('answers a standalone flow without children and refuses a flow of another tenant', async () => {
    const solo = await newFlow(a, 'fluxo', 'sozinho');
    const r = await run(a, CORE, '/configuration/caller', solo);
    const value = JSON.parse((r.resource as { items: { value: string }[] }).items[0]!.value) as { identifier: string; settings: Record<string, unknown> };
    expect(value.identifier).toBe('sozinho');
    expect(value.settings['children']).toBeUndefined();

    const deB = await newFlow(b, 'fluxo', 'do-b');
    expect(await run(a, CORE, '/configuration/caller', deB)).toMatchObject({ status: 'failure', reason: { code: 67 } });
  });
});

describe('Master-State redirect by short name', () => {
  it('moves the contact to the service whose flow has that short name', async () => {
    const router = await newFlow(a, 'roteador', 'roteador-ms');
    const main = await newFlow(a, 'fluxo', 'ms-main');
    const vendas = await newFlow(a, 'fluxo', 'ms-vendas');
    await service(a, router, main, 'Main', true);
    await service(a, router, vendas, 'Vendas', false);
    const { rows } = await a.dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome) values (${a.tenantId}, 'Rui') returning id
    `);
    const contactId = rows[0]!.id;
    const position = async (): Promise<string | undefined> => {
      const { rows: p } = await a.dono.execute<{ servico_id: string }>(sql`
        select servico_id from posicao_no_roteador where roteador_id = ${router}::uuid and contato_id = ${contactId}::uuid
      `);
      return p[0]?.servico_id;
    };

    await noTenant(a.tenantId, (tx) => redirectInRouter(tx, { tenantId: a.tenantId, routerId: router, contactId, service: 'ms-vendas' }));
    expect(await position()).toBe(vendas);
    await noTenant(a.tenantId, (tx) => redirectInRouter(tx, { tenantId: a.tenantId, routerId: router, contactId, service: 'Main' }));
    expect(await position()).toBe(main);
    await expect(
      noTenant(a.tenantId, (tx) => redirectInRouter(tx, { tenantId: a.tenantId, routerId: router, contactId, service: 'nao-existe' })),
    ).rejects.toThrow("O serviço 'nao-existe' não existe neste roteador.");
  });
});

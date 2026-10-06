import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { loadLogOfMessages } = await import('../src/domain/management-analytics.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

const FUSO = 'America/Sao_Paulo';
const SERVICE = { states: [{ id: 'inicio', root: true, input: {}, outputs: [] }] };

let a: Cenario;
let channelB: string;
let inboxB: string;
let inboxC: string;
let serviceA: string;
let serviceB: string;

async function publish(nome: string): Promise<string> {
  const r = await noTenant(a.tenantId, (tx) =>
    importFlowOfBlip(tx, { tenantId: a.tenantId, name: nome, channelId: null, json: SERVICE, publicar: true }),
  );
  expect(r.errorOfValidation).toBeNull();
  return r.flowId;
}

async function seed(query: ReturnType<typeof sql>): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(query);
  return rows[0]!.id;
}

async function channelWithInbox(nome: string): Promise<{ channel: string; inbox: string }> {
  const channel = await seed(sql`
    insert into canal (tenant_id, tipo, nome, config) values (${a.tenantId}, 'whatsapp_cloud', ${nome}, '{}'::jsonb) returning id
  `);
  const inbox = await seed(sql`
    insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
    values (${a.tenantId}, ${channel}, ${nome}, ${a.queueId}) returning id
  `);
  return { channel, inbox };
}

async function conversationIn(inbox: string, contactName: string): Promise<string> {
  const contact = await seed(sql`insert into contato (tenant_id, nome) values (${a.tenantId}, ${contactName}) returning id`);
  return seed(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, estado) values (${a.tenantId}, ${inbox}, ${contact}, 'Open') returning id
  `);
}

async function message(conversationId: string, direction: string, type: string, content: string, at: string) {
  await a.dono.execute(sql`
    insert into mensagem (tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, criada_em)
    values (${a.tenantId}, ${conversationId}, ${direction}, ${direction === 'entrada' ? 'contato' : 'bot'}, ${type}, ${content}, ${at}::timestamptz)
  `);
}

async function serviceMessage(flowId: string, inbox: string, content: string) {
  const contact = await seed(sql`insert into contato (tenant_id, nome) values (${a.tenantId}, ${`c-${content}`}) returning id`);
  const execution = await seed(sql`
    insert into execucao_fluxo (tenant_id, fluxo_versao_id, contato_id, inbox_id, estado)
    select ${a.tenantId}::uuid, v.id, ${contact}::uuid, ${inbox}::uuid, 'aguardando'
      from fluxo_versao v where v.fluxo_id = ${flowId}::uuid and v.tenant_id = ${a.tenantId}::uuid limit 1
    returning id
  `);
  await a.dono.execute(sql`
    insert into mensagem (tenant_id, execucao_id, direcao, autor_tipo, tipo, conteudo, criada_em)
    values (${a.tenantId}, ${execution}, 'saida', 'bot', 'texto', ${content}, '2026-10-03T15:00:00Z')
  `);
}

beforeAll(async () => {
  a = await montarCenario(`lg-${randomUUID().slice(0, 8)}`);
  await a.dono.execute(sql`select pipe_criar_particao_mes('mensagem', '2026-10-01'::date)`);
  await a.dono.execute(sql`update fluxo set tipo = 'roteador' where id = ${a.flowId}`);
  ({ channel: channelB, inbox: inboxB } = await channelWithInbox('Canal B'));
  ({ inbox: inboxC } = await channelWithInbox('Canal C'));
  await a.dono.execute(sql`
    insert into roteador_canal (tenant_id, roteador_id, canal_id) values (${a.tenantId}, ${a.flowId}, ${channelB})
  `);

  const convA = await conversationIn(a.inboxId, 'Cliente A');
  const convB = await conversationIn(inboxB, 'Cliente B');
  const convC = await conversationIn(inboxC, 'Cliente C');
  await message(convA, 'entrada', 'texto', 'ola abc mundo', '2026-10-03T15:00:00Z');
  await message(convA, 'saida', 'texto', 'resposta 500 itens', '2026-10-03T16:00:00Z');
  await message(convA, 'entrada', 'imagem', 'foto 50% desconto', '2026-10-02T15:00:00Z');
  await message(convA, 'entrada', 'texto', 'tarde da noite', '2026-10-04T02:30:00Z'); // 2026-10-03 23:30 local
  await message(convA, 'entrada', 'texto', 'ja no dia seguinte', '2026-10-04T03:30:00Z'); // 2026-10-04 00:30 local
  await message(convA, 'entrada', 'texto', 'snake_case literal', '2026-10-03T17:00:00Z');
  await message(convA, 'entrada', 'texto', 'snakeXcase curinga', '2026-10-03T17:30:00Z');
  await message(convB, 'entrada', 'texto', 'msg do canal B', '2026-10-03T15:00:00Z');
  await message(convC, 'entrada', 'texto', 'msg do canal C', '2026-10-03T15:00:00Z');

  serviceA = await publish('Servico A');
  serviceB = await publish('Servico B');
  await a.dono.execute(sql`
    insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal, persistente)
    values (${a.tenantId}, ${a.flowId}, ${serviceA}, 'servico-a', true, false), (${a.tenantId}, ${a.flowId}, ${serviceB}, 'servico-b', false, true)
  `);
  await serviceMessage(serviceA, a.inboxId, 'bot do servico A');
  await serviceMessage(serviceB, a.inboxId, 'bot do servico B');
}, 180_000);

afterAll(async () => {
  await a?.encerrar();
});

const log = async (flowId: string, filter: Record<string, string> = {}) =>
  (await noTenant(a.tenantId, (tx) => loadLogOfMessages(tx, a.tenantId, flowId, FUSO, filter, null, 50))).data.map(
    (row) => row.content,
  );

describe('log of messages', () => {
  it('search matches content only', async () => {
    expect(await log(a.flowId, { search: 'abc' })).toEqual(['ola abc mundo']);
  });

  it('search treats % literally', async () => {
    expect(await log(a.flowId, { search: '50%' })).toEqual(['foto 50% desconto']);
  });

  it('search treats _ literally', async () => {
    expect(await log(a.flowId, { search: 'snake_case' })).toEqual(['snake_case literal']);
  });

  it('bounds by tenant time zone days', async () => {
    const content = await log(a.flowId, { de: '2026-10-03', ate: '2026-10-03', type: 'texto', direction: 'entrada' });
    expect(content).toContain('tarde da noite');
    expect(content).not.toContain('ja no dia seguinte');
    expect(content).not.toContain('foto 50% desconto');
  });

  it('direction and type narrow the list and intersect', async () => {
    expect(await log(a.flowId, { direction: 'saida' })).toContain('resposta 500 itens');
    expect(await log(a.flowId, { direction: 'entrada', search: 'resposta' })).toEqual([]);
    expect(await log(a.flowId, { type: 'imagem' })).toEqual(['foto 50% desconto']);
    expect(await log(a.flowId, { type: 'imagem', direction: 'saida' })).toEqual([]);
    expect(await log(a.flowId, { search: 'ola', de: '2026-10-03', direction: 'entrada', type: 'texto' })).toEqual([
      'ola abc mundo',
    ]);
  });

  it('a router lists its own and extra channels, not another channel', async () => {
    const content = await log(a.flowId, { search: 'msg do canal' });
    expect(content).toEqual(['msg do canal B']);
    expect(await log(a.flowId, { search: 'ola' })).toEqual(['ola abc mundo']);
  });

  it('a router service flow lists its own executions only', async () => {
    expect(await log(serviceA)).toEqual(['bot do servico A']);
    expect(await log(serviceB)).toEqual(['bot do servico B']);
  });
});

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { montarCenario } = await import('./ajuda.js');
const { noTenant } = await import('../src/database.js');
const { chooseQueue } = await import('../src/domain/queue-entry.js');
const { createQueue, editQueue, deleteQueue, QUEUE_MANAGE } = await import('../src/domain/management/registrations.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * Queue choice and queue guards against what the Builder stores: default queue fallback inside the flow,
 * and refusals when blocks or rules still point at the queue.
 */
let a: Cenario;
let b: Cenario;
let manager: string;

beforeAll(async () => {
  a = await montarCenario(`qb-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`qb-${randomUUID().slice(0, 8)}`);
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email) values (${a.tenantId}::uuid, 'Gerente', ${`g-${randomUUID().slice(0, 6)}@e2e.pipe.app`}) returning id
  `);
  manager = rows[0]!.id;
  await a.dono.execute(sql`insert into permissao (codigo, descricao, grupo) values (${QUEUE_MANAGE}, ${QUEUE_MANAGE}, 'teste') on conflict (codigo) do nothing`);
  await a.dono.execute(sql`insert into usuario_permissao (tenant_id, usuario_id, permissao_codigo, concedida) values (${a.tenantId}::uuid, ${manager}::uuid, ${QUEUE_MANAGE}, true)`);
}, 180_000);

afterAll(async () => {
  await a?.encerrar();
  await b?.encerrar();
});

const choose = (c: Cenario, flowId: string) =>
  noTenant(c.tenantId, (tx) =>
    chooseQueue(tx, c.tenantId, { flowId, queueId: null, defaultQueueId: null, message: 'oi', contact: null }),
  );

async function newFlow(c: Cenario): Promise<string> {
  const s = randomUUID().slice(0, 8);
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, short_name) values (${c.tenantId}::uuid, ${`Fluxo ${s}`}, ${`f${s}`}) returning id
  `);
  return rows[0]!.id;
}

async function newQueue(c: Cenario, flowId: string, nome: string, order: number, ativa = true): Promise<string> {
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into fila (tenant_id, fluxo_id, nome, ordem, ativa) values (${c.tenantId}::uuid, ${flowId}::uuid, ${nome}, ${order}, ${ativa}) returning id
  `);
  return rows[0]!.id;
}

const defaultOf = async (flowId: string) =>
  (await a.dono.execute<{ id: string | null }>(sql`select fila_padrao_id as id from fluxo where id = ${flowId}::uuid`)).rows[0]!.id;

async function blockWith(c: Cenario, flowId: string, conteudo: unknown, estado = 'publicada'): Promise<void> {
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into fluxo_versao (tenant_id, fluxo_id, versao, estado)
    values (${c.tenantId}::uuid, ${flowId}::uuid, (select coalesce(max(versao), 0) + 1 from fluxo_versao where fluxo_id = ${flowId}::uuid), ${estado})
    returning id
  `);
  await c.dono.execute(sql`
    insert into bloco (tenant_id, versao_id, codigo, nome, tipo, conteudo)
    values (${c.tenantId}::uuid, ${rows[0]!.id}::uuid, 'b1', 'Fala com humano', 'transferencia', ${JSON.stringify(conteudo)}::jsonb)
  `);
}

const asA = <T>(fn: Parameters<typeof noTenant<T>>[1]) => noTenant(a.tenantId, fn);

describe('fila padrão em tempo de execução', () => {
  it('sem regra, sem teams e sem padrão: cai na primeira fila ativa do fluxo (ordem, depois nome)', async () => {
    const flow = await newFlow(a);
    await newQueue(a, flow, 'Zeta', 1);
    const alfa = await newQueue(a, flow, 'Alfa', 1);
    await newQueue(a, flow, 'Inativa', 0, false);
    expect((await choose(a, flow)).queueId).toBe(alfa);
  });

  it('padrão inativo é ignorado; padrão de outro fluxo também', async () => {
    const flow = await newFlow(a);
    const other = await newFlow(a);
    const inactive = await newQueue(a, flow, 'Velha', 0, false);
    const active = await newQueue(a, flow, 'Nova', 5);
    const alien = await newQueue(a, other, 'Alheia', 0);
    await a.dono.execute(sql`update fluxo set fila_padrao_id = ${inactive}::uuid where id = ${flow}::uuid`);
    expect((await choose(a, flow)).queueId).toBe(active);
    await a.dono.execute(sql`update fluxo set fila_padrao_id = ${alien}::uuid where id = ${flow}::uuid`);
    const got = await choose(a, flow);
    expect(got.queueId).toBe(active);
    expect(got.queueId).not.toBe(alien);
  });

  it('padrão ativo do fluxo vence a primeira fila', async () => {
    const flow = await newFlow(a);
    await newQueue(a, flow, 'Primeira', 0);
    const chosen = await newQueue(a, flow, 'Escolhida', 9);
    await a.dono.execute(sql`update fluxo set fila_padrao_id = ${chosen}::uuid where id = ${flow}::uuid`);
    expect((await choose(a, flow)).queueId).toBe(chosen);
  });

  it('fluxo sem fila ativa não escolhe nada, nem fila de outro tenant', async () => {
    const flow = await newFlow(a);
    await newQueue(a, flow, 'Off', 0, false);
    await newQueue(b, b.flowId, 'DoB', 0);
    expect((await choose(a, flow)).queueId).toBeNull();
    expect((await choose(a, b.flowId)).queueId).toBeNull();
  });
});

describe('proteções de fila contra o Builder e as regras', () => {
  it('a primeira fila criada vira a padrão; a segunda não mexe', async () => {
    const flow = await newFlow(a);
    const first = await asA((tx) => createQueue(tx, a.tenantId, flow, manager, { name: 'Um', capacityDefault: 5 } as never));
    expect(await defaultOf(flow)).toBe(first.id);
    await asA((tx) => createQueue(tx, a.tenantId, flow, manager, { name: 'Dois', capacityDefault: 5 } as never));
    expect(await defaultOf(flow)).toBe(first.id);
  });

  it('desativar a padrão passa a padrão para outra ativa; sem outra, recusa', async () => {
    const flow = await newFlow(a);
    const first = await asA((tx) => createQueue(tx, a.tenantId, flow, manager, { name: 'Um', capacityDefault: 5 } as never));
    await expect(asA((tx) => editQueue(tx, a.tenantId, flow, manager, first.id, { ativa: false } as never))).rejects.toMatchObject({ status: 409, codigo: 'queue_default_of_flow' });
    const second = await asA((tx) => createQueue(tx, a.tenantId, flow, manager, { name: 'Dois', capacityDefault: 5 } as never));
    await asA((tx) => editQueue(tx, a.tenantId, flow, manager, first.id, { ativa: false } as never));
    expect(await defaultOf(flow)).toBe(second.id);
  });

  it('excluir a padrão com outra ativa recusa; depois de desativar, exclui', async () => {
    const flow = await newFlow(a);
    const first = await asA((tx) => createQueue(tx, a.tenantId, flow, manager, { name: 'Um', capacityDefault: 5 } as never));
    await asA((tx) => createQueue(tx, a.tenantId, flow, manager, { name: 'Dois', capacityDefault: 5 } as never));
    await expect(asA((tx) => deleteQueue(tx, a.tenantId, flow, manager, first.id))).rejects.toMatchObject({ status: 409, codigo: 'queue_default_of_flow' });
    await asA((tx) => editQueue(tx, a.tenantId, flow, manager, first.id, { ativa: false } as never));
    await asA((tx) => deleteQueue(tx, a.tenantId, flow, manager, first.id));
  });

  it('excluir recusa fila usada por bloco (id e nome) e lista o bloco', async () => {
    const flow = await newFlow(a);
    await newQueue(a, flow, 'Padrão', 0);
    const byId = await newQueue(a, flow, 'PorId', 1);
    const byName = await newQueue(a, flow, 'PorNome', 2);
    await blockWith(a, flow, { settings: { filaId: byId } });
    await blockWith(a, flow, { $contentActions: [{ action: { settings: { extras: { teams: 'pornome' } } } }] }, 'rascunho');
    await expect(asA((tx) => deleteQueue(tx, a.tenantId, flow, manager, byId))).rejects.toMatchObject({
      status: 409,
      codigo: 'queue_used_in_blocks',
      message: expect.stringContaining('Fala com humano'),
    });
    await expect(asA((tx) => deleteQueue(tx, a.tenantId, flow, manager, byName))).rejects.toMatchObject({ codigo: 'queue_used_in_blocks' });
  });

  it('renomear recusa quando bloco usa o nome antigo em team; renomear livre funciona', async () => {
    const flow = await newFlow(a);
    const used = await newQueue(a, flow, 'Vendas', 0);
    const free = await newQueue(a, flow, 'Livre', 1);
    await blockWith(a, flow, { resource: { team: 'Vendas' } });
    await expect(asA((tx) => editQueue(tx, a.tenantId, flow, manager, used, { name: 'Comercial' } as never))).rejects.toMatchObject({ status: 409, codigo: 'queue_name_in_blocks' });
    await asA((tx) => editQueue(tx, a.tenantId, flow, manager, free, { name: 'Livre 2' } as never));
  });

  it('excluir recusa fila escopo de regra de SLA ou prioridade', async () => {
    const flow = await newFlow(a);
    await newQueue(a, flow, 'Padrão', 0);
    const scoped = await newQueue(a, flow, 'Escopo', 1);
    await a.dono.execute(sql`
      insert into regra_sla (tenant_id, nome, alvo, prazo_seg, escopo_tipo, escopo_id)
      values (${a.tenantId}::uuid, 'SLA da fila', 'primeira_resposta', 60, 'fila', ${scoped}::uuid)
    `);
    await expect(asA((tx) => deleteQueue(tx, a.tenantId, flow, manager, scoped))).rejects.toMatchObject({ status: 409, codigo: 'queue_used_in_scoped_rule' });
  });

  it('isolamento de tenant: fila e blocos de outro tenant não valem', async () => {
    const flow = await newFlow(a);
    const own = await newQueue(a, flow, 'Minha', 0);
    const other = await newQueue(b, b.flowId, 'Alheia', 0);
    await blockWith(b, b.flowId, { settings: { filaId: own } });
    await expect(asA((tx) => deleteQueue(tx, a.tenantId, b.flowId, manager, other))).rejects.toMatchObject({ status: 404 });
    // the other tenant's block naming this id does not hold the queue
    await asA((tx) => deleteQueue(tx, a.tenantId, flow, manager, own));
  });
});

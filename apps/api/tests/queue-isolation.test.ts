import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { chooseQueue, enterQueue, flowOfConversation } = await import('../src/domain/queue-entry.js');
const { montarDoisFluxos } = await import('./ajuda.js');

type Dois = Awaited<ReturnType<typeof montarDoisFluxos>>;

/**
 * Two flows in one tenant with conflicting "Boleto" rules and a shared agent: nothing that chooses a
 * queue (rules, `teams`, explicit, default, priority) may cross from one flow to the other.
 */
let f: Dois;
let tenantId: string;

beforeEach(async () => {
  f = await montarDoisFluxos(`iso-${randomUUID().slice(0, 8)}`);
  tenantId = f.cenario.tenantId;
}, 180_000);

afterEach(async () => {
  await f?.cenario.encerrar();
});

const contact = (extras: Record<string, unknown> = {}) => ({ nome: 'Cli', email: null, telefone: null, atributos: extras });
const input = (flowId: string | null, over: Record<string, unknown> = {}) => ({
  flowId,
  queueId: null,
  defaultQueueId: null,
  message: 'preciso do boleto',
  contact: contact(),
  ...over,
});
const choose = (flowId: string | null, over: Record<string, unknown> = {}) =>
  noTenant(tenantId, (tx) => chooseQueue(tx, tenantId, input(flowId, over) as Parameters<typeof chooseQueue>[2]));

async function conversa(): Promise<string> {
  const c = f.cenario;
  const { rows: ct } = await c.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${tenantId}, 'Cli') returning id
  `);
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, estado)
    values (${tenantId}, ${c.inboxId}, ${ct[0]!.id}, 'com_bot') returning id
  `);
  return rows[0]!.id;
}

describe('funil de entrada em fila com escopo de fluxo', () => {
  it('a regra Boleto do fluxo B escolhe a fila de B', async () => {
    const r = await choose(f.flowB);
    expect(r.queueId).toBe(f.queueB);
    expect(r.ruleId).not.toBeNull();
    expect((await choose(f.flowA)).queueId).toBe(f.queueA);
  });

  it('teams com o nome da fila de A não resolve no fluxo B', async () => {
    const { rows } = await f.cenario.dono.execute<{ nome: string }>(sql`select nome from fila where id = ${f.queueA}`);
    const r = await choose(f.flowB, { message: 'oi', contact: contact({ teams: rows[0]!.nome }) });
    expect(r.queueId).toBeNull();
    await f.cenario.dono.execute(sql`update fluxo set fila_padrao_id = ${f.queueB} where id = ${f.flowB}`);
    expect((await choose(f.flowB, { message: 'oi', contact: contact({ teams: rows[0]!.nome }) })).queueId).toBe(f.queueB);
  });

  it('destino explícito de outro fluxo é rejeitado com fila_de_outro_fluxo', async () => {
    await expect(choose(f.flowB, { queueId: f.queueA })).rejects.toMatchObject({ codigo: 'fila_de_outro_fluxo' });
    expect((await choose(f.flowB, { queueId: f.queueB })).queueId).toBe(f.queueB);
  });

  it('a fila padrão da inbox de outro fluxo é ignorada; a do fluxo vale', async () => {
    const semRegra = { message: 'oi' };
    expect((await choose(f.flowB, { ...semRegra, defaultQueueId: f.queueA })).queueId).toBeNull();
    expect((await choose(f.flowB, { ...semRegra, defaultQueueId: f.queueB })).queueId).toBe(f.queueB);
    await f.cenario.dono.execute(sql`update fluxo set fila_padrao_id = ${f.queueB} where id = ${f.flowB}`);
    expect((await choose(f.flowB, { ...semRegra, defaultQueueId: f.queueA })).queueId).toBe(f.queueB);
  });

  it('sem fluxo: nenhuma fila, e destino explícito é rejeitado', async () => {
    expect((await choose(null)).queueId).toBeNull();
    await expect(choose(null, { queueId: f.queueA })).rejects.toMatchObject({ codigo: 'fila_de_outro_fluxo' });
  });

  it('regra de prioridade do fluxo A não altera conversa que entra pelo fluxo B', async () => {
    await f.cenario.dono.execute(sql`
      insert into regra_prioridade (tenant_id, nome, nivel, fluxo_id) values (${tenantId}, 'Urgente A', 'alta', ${f.flowA})
    `);
    const prioridade = async (flowId: string) => {
      const id = await conversa();
      await noTenant(tenantId, (tx) =>
        enterQueue(tx, { tenantId, conversationId: id, flowId, queueId: null, defaultQueueId: null, message: 'boleto', at: new Date(), origin: 'entrada' }),
      );
      const { rows } = await f.cenario.dono.execute<{ prioridade: string }>(sql`select prioridade from conversa where id = ${id}`);
      return rows[0]!.prioridade;
    };
    expect(await prioridade(f.flowB)).toBe('sem_prioridade');
    expect(await prioridade(f.flowA)).toBe('alta');
  });

  it('flowOfConversation: fila, depois execução, depois canal, senão null', async () => {
    const flowOf = (id: string) => noTenant(tenantId, (tx) => flowOfConversation(tx, tenantId, id));
    const id = await conversa();
    // canal: o fluxo A está ligado ao canal da inbox (o B não tem canal)
    expect(await flowOf(id)).toBe(f.flowA);
    await f.cenario.dono.execute(sql`update conversa set fila_id = ${f.queueB} where id = ${id}`);
    expect(await flowOf(id)).toBe(f.flowB);
    await f.cenario.dono.execute(sql`update conversa set fila_id = null where id = ${id}`);
    await f.cenario.dono.execute(sql`update fluxo set estado = 'arquivado' where id = ${f.flowA}`);
    expect(await flowOf(id)).toBeNull();
  });
});

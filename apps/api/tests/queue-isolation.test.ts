import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { chooseQueue, enterQueue, flowOfConversation } = await import('../src/domain/queue-entry.js');
const { matchCommand } = await import('@pipe/core');
const { upApi } = await import('../src/servidor.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { executeCommand } = await import('../src/domain/engine-services.js');
const { assinar, montarDoisFluxos, payloadOfMessage } = await import('./ajuda.js');
const { transferConversation } = await import('../src/domain/conversation.js');

type Dois = Awaited<ReturnType<typeof montarDoisFluxos>>;

/**
 * Two flows in one tenant with conflicting "Boleto" rules and a shared agent: nothing that chooses a
 * queue (rules, `teams`, explicit, default, priority) may cross from one flow to the other.
 */
let f: Dois;
let tenantId: string;
let api: Awaited<ReturnType<typeof upApi>>;

beforeAll(async () => {
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  f = await montarDoisFluxos(`iso-${randomUUID().slice(0, 8)}`);
  tenantId = f.cenario.tenantId;
}, 180_000);

afterEach(async () => {
  await f?.cenario.encerrar();
});

const contact = (extras: Record<string, unknown> = {}) => ({ name: 'Cli', email: null, phone: null, extras });
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
    values (${tenantId}, ${c.inboxId}, ${ct[0]!.id}, 'na_fila') returning id
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
    await f.cenario.dono.execute(sql`update fila set nome = 'So A' where id = ${f.queueA}`);
    const rows = [{ nome: 'So A' }];
    const r = await choose(f.flowB, { message: 'oi', contact: contact({ teams: rows[0]!.nome }) });
    // the name of A's queue does not resolve; B's own first active queue takes over
    expect(r.queueId).toBe(f.queueB);
    await f.cenario.dono.execute(sql`update fluxo set fila_padrao_id = ${f.queueB} where id = ${f.flowB}`);
    expect((await choose(f.flowB, { message: 'oi', contact: contact({ teams: rows[0]!.nome }) })).queueId).toBe(f.queueB);
  });

  it('destino explícito de outro fluxo é rejeitado com fila_de_outro_fluxo', async () => {
    await expect(choose(f.flowB, { queueId: f.queueA })).rejects.toMatchObject({ codigo: 'fila_de_outro_fluxo' });
    expect((await choose(f.flowB, { queueId: f.queueB })).queueId).toBe(f.queueB);
  });

  it('a fila padrão da inbox de outro fluxo é ignorada; a do fluxo vale', async () => {
    const semRegra = { message: 'oi' };
    expect((await choose(f.flowB, { ...semRegra, defaultQueueId: f.queueA })).queueId).toBe(f.queueB);
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

/** Publishes a bot on the channel whose single handoff is `action`, and moves the given queues into it. */
async function publicarNoFluxoB(action: unknown, filasDoFluxo: string[]): Promise<string> {
  const r = await noTenant(tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId,
      name: 'Transbordo B',
      channelId: f.cenario.channelId,
      json: { id: 'transbordo-b', states: [{ id: 'raiz', root: true, input: {}, outputActions: [action], outputs: [] }] },
      publicar: true,
    }),
  );
  expect(r.errorOfValidation).toBeNull();
  await f.cenario.dono.execute(
    sql`update fila set fluxo_id = ${r.flowId} where id in (${sql.join(filasDoFluxo.map((q) => sql`${q}::uuid`), sql`, `)})`,
  );
  return r.flowId;
}

async function falar(de: string, texto: string): Promise<{ fila_id: string | null }> {
  const corpo = JSON.stringify(payloadOfMessage(de, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${f.cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
  const { rows } = await f.cenario.dono.execute<{ fila_id: string | null }>(sql`
    select c.fila_id from contato ct left join conversa c on c.contato_id = ct.id
     where ct.tenant_id = ${tenantId}::uuid and ct.telefone_e164 = ${`+${de}`} order by c.criada_em desc nulls last limit 1
  `);
  // D-15: sem ticket antes do transbordo, uma ação que falha deixa o contato com o bot (fila nula)
  return { fila_id: rows[0]?.fila_id ?? null };
}

describe('ponta a ponta com dois fluxos', () => {
  it('transbordo do fluxo B com a regra Boleto de A e de B cai na fila de B', async () => {
    await publicarNoFluxoB({ type: 'ForwardToDesk', settings: {} }, [f.queueB]);
    expect((await falar('5511933330001', 'quero o boleto')).fila_id).toBe(f.queueB);
  });

  it('ForwardToDesk com filaId de outro fluxo não deixa a conversa na fila de A', async () => {
    await publicarNoFluxoB({ type: 'ForwardToDesk', settings: { filaId: f.queueA } }, [f.queueB]);
    expect((await falar('5511933330002', 'oi')).fila_id).not.toBe(f.queueA);
  });

  it('/transfer do engine com fila de outro fluxo é recusado como fila inexistente', async () => {
    const run = (queueId: string) => {
      const uri = '/tickets/atual/transfer';
      const command = matchCommand({ method: 'set', uri });
      if (!command) throw new Error('sem rota');
      const transfers: string[] = [];
      const tickets = { transfer: async (_tx: unknown, q: string) => void transfers.push(q) } as Parameters<typeof executeCommand>[4];
      return noTenant(tenantId, (tx) =>
        executeCommand(tx, tenantId, { uri, method: 'SET', resource: { queueId }, command }, true, tickets, undefined, undefined, f.flowB),
      ).then(() => transfers);
    };
    await expect(run(f.queueA)).rejects.toThrow('não existe neste Pipe');
    expect(await run(f.queueB)).toEqual([f.queueB]);
  });
});

describe('filas com o mesmo nome em fluxos diferentes', () => {
  it('as duas filas se chamam Suporte e o nome só é único dentro do fluxo', async () => {
    const { rows } = await f.cenario.dono.execute<{ nome: string }>(sql`select nome from fila where id in (${f.queueA}, ${f.queueB})`);
    expect(rows.map((r) => r.nome)).toEqual(['Suporte', 'Suporte']);
    await expect(
      f.cenario.dono.execute(sql`insert into fila (tenant_id, fluxo_id, nome) values (${tenantId}, ${f.flowA}, 'Suporte')`),
    ).rejects.toThrow();
  });

  it('teams "Suporte" resolve para a fila do próprio fluxo', async () => {
    const semRegra = { message: 'oi', contact: contact({ teams: 'Suporte' }) };
    expect((await choose(f.flowA, semRegra)).queueId).toBe(f.queueA);
    expect((await choose(f.flowB, semRegra)).queueId).toBe(f.queueB);
  });

  it('transferência de ticket de A para o "Suporte" de B é recusada com fila_de_outro_fluxo', async () => {
    const c = f.cenario;
    const { rows: ct } = await c.dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome) values (${tenantId}, 'Cli') returning id
    `);
    const { rows } = await c.dono.execute<{ id: string }>(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, atribuida_em)
      values (${tenantId}, ${c.inboxId}, ${ct[0]!.id}, ${f.queueA}, ${f.userShared}, 'em_atendimento', now()) returning id
    `);
    await expect(
      transferConversation(
        { tenantId, agentId: f.userShared, requireAssignment: false },
        { conversationId: rows[0]!.id, forQueueId: f.queueB },
      ),
    ).rejects.toMatchObject({ codigo: 'fila_de_outro_fluxo' });
  });
});

const igual = (value: string) => [{ source: 'input', comparison: 'equals', values: [value] }];
const redirecionar = (service: string) => ({ type: 'Redirect', settings: { address: service } });
const DESK = { states: [{ id: 'raiz', root: true, input: {}, outputActions: [{ type: 'ForwardToDesk', settings: {} }], outputs: [] }] };
const MENU = {
  states: [
    {
      id: 'inicio',
      root: true,
      input: {},
      outputs: [
        { order: 0, stateId: 'ir-a', conditions: igual('a') },
        { order: 1, stateId: 'ir-b', conditions: igual('b') },
        { order: 2, stateId: 'inicio' },
      ],
    },
    { id: 'ir-a', inputActions: [redirecionar('Servico A')], input: {}, outputs: [{ stateId: 'inicio' }] },
    { id: 'ir-b', inputActions: [redirecionar('Servico B')], input: {}, outputs: [{ stateId: 'inicio' }] },
  ],
};

describe('D-07 roteador', () => {
  beforeEach(async () => {
    const publicar = async (nome: string, json: unknown) => {
      const r = await noTenant(tenantId, (tx) => importFlowOfBlip(tx, { tenantId, name: nome, channelId: null, json, publicar: true }));
      expect(r.errorOfValidation).toBeNull();
      return r.flowId;
    };
    const principal = await publicar('Principal', MENU);
    const servicoA = await publicar('Servico A', DESK);
    const servicoB = await publicar('Servico B', DESK);
    const dono = f.cenario.dono;
    // o roteador toma o canal; os fluxos de montarDoisFluxos ficam sem uso
    await dono.execute(sql`update fluxo set canal_id = null where tenant_id = ${tenantId}::uuid and canal_id is not null`);
    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, tipo, estado, canal_id, short_name)
      values (${tenantId}, 'roteador', 'roteador', 'rascunho', ${f.cenario.channelId}, ${`rot-${randomUUID().slice(0, 8)}`}) returning id
    `);
    await dono.execute(sql`
      insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal, persistente, expiracao_min) values
        (${tenantId}, ${rows[0]!.id}, ${principal}, 'Principal', true, false, null),
        (${tenantId}, ${rows[0]!.id}, ${servicoA}, 'Servico A', false, true, null),
        (${tenantId}, ${rows[0]!.id}, ${servicoB}, 'Servico B', false, true, null)
    `);
    await dono.execute(sql`update fila set fluxo_id = ${servicoA} where id = ${f.queueA}`);
    await dono.execute(sql`update fila set fluxo_id = ${servicoB} where id = ${f.queueB}`);
    await dono.execute(sql`update fluxo set fila_padrao_id = ${f.queueB} where id = ${servicoB}`);
  }, 60_000);

  async function pelo(servico: 'a' | 'b', de: string, texto: string): Promise<{ fila_id: string | null; atendente_id: string | null }> {
    await falar(de, 'oi');
    await falar(de, servico);
    await falar(de, texto);
    const { rows } = await f.cenario.dono.execute<{ fila_id: string | null; atendente_id: string | null }>(sql`
      select c.fila_id, c.atendente_id from contato ct join conversa c on c.contato_id = ct.id
       where ct.tenant_id = ${tenantId}::uuid and ct.telefone_e164 = ${`+${de}`} order by c.criada_em desc limit 1
    `);
    expect(rows[0]).toBeDefined();
    return rows[0]!;
  }

  it('a mensagem boleto cai na fila do serviço que atende o contato', async () => {
    expect((await pelo('b', '5511933340001', 'boleto')).fila_id).toBe(f.queueB);
    expect((await pelo('a', '5511933340002', 'boleto')).fila_id).toBe(f.queueA);
  });

  it('o usuário compartilhado recebe o ticket das duas filas', async () => {
    const b = await pelo('b', '5511933340003', 'boleto');
    const a = await pelo('a', '5511933340004', 'boleto');
    expect([a.atendente_id, b.atendente_id]).toEqual([f.userShared, f.userShared]);
  });

  it('sem regra casada, o serviço B usa a fila padrão do fluxo B mesmo com a inbox apontando para A', async () => {
    const { rows } = await f.cenario.dono.execute<{ fila_padrao_id: string }>(sql`select fila_padrao_id from inbox where id = ${f.cenario.inboxId}`);
    expect(rows[0]!.fila_padrao_id).toBe(f.queueA);
    expect((await pelo('b', '5511933340005', 'bom dia')).fila_id).toBe(f.queueB);
  });
});

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode must be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { dubleWhatsApp, processarOutbox } = await import('@pipe/workers');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { closeConversation } = await import('../src/domain/conversation.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The end-to-end bot, with the WhatsApp double and the queue running in-process: message comes in → the bot replies through the outbox → the customer chooses → transfer → conversation queued with its context → a human takes it → closes it → the next message returns to the flow at the block the ticket points to. The flow is the core's SYNTHETIC fixture, in the format of Blip's Builder editor, imported through the same path a customer flow would use.
 */

const FIXTURE: unknown = JSON.parse(
  readFileSync(
    new URL('../../../packages/core/src/flow/fixtures/editor-sintetico.json', import.meta.url),
    'utf8',
  ),
);

const ANA = '5511911110001';
const BIA = '5511911110002';
const CAIO = '5511911110003';
const DAVI = '5511911110004';

let cenario: Cenario;
let api: ApiNoAr;

async function publicar(json: unknown): Promise<void> {
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Atendimento',
      channelId: cenario.channelId,
      json,
      publicar: true,
    }),
  );
  expect(r.errorOfValidation).toBeNull();
  expect(r.report.naoSuportado).toBeDefined();
}

beforeAll(async () => {
  cenario = await montarCenario(`fluxo-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  dubleWhatsApp.reiniciar();
  // With no one online: the transferred conversation must stay IN THE QUEUE for the test to observe.
  await cenario.dono.execute(
    sql`update status_atendente set estado = 'offline' where usuario_id = ${cenario.agentId}::uuid`,
  );
  await publicar(FIXTURE);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

async function falar(de: string, texto: string, id?: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(de, texto, id ? { id } : {}));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

type Conversation = { id: string; estado: string; fila_id: string | null; atendente_id: string | null };

async function conversationOpen(telefone: string): Promise<Conversation> {
  const { rows } = await cenario.dono.execute<Conversation>(sql`
    select c.id, c.estado, c.fila_id, c.atendente_id
      from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
       and c.estado <> 'encerrada'
     order by c.criada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function doBot(conversationId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ conteudo: string }>(sql`
    select conteudo from mensagem
     where conversa_id = ${conversationId}::uuid and autor_tipo = 'bot'
     order by criada_em
  `);
  return rows.map((r) => r.conteudo);
}

async function eventos(conversaId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ tipo: string }>(
    sql`select tipo from evento_atendimento where conversa_id = ${conversaId}::uuid order by em`,
  );
  return rows.map((r) => r.tipo);
}

describe('bot com o dublê do WhatsApp', () => {
  it('Queue a bot reply in the outbox without assigning the conversation to a queue', async () => {
    await falar(ANA, 'oi');
    const conversation = await conversationOpen(ANA);
    expect(conversation.fila_id).toBeNull();
    expect(conversation.atendente_id).toBeNull();
    expect(await doBot(conversation.id)).toEqual(['Olá! Qual é o seu nome?']);

    // Time spent with the bot is not queue time: neither `criada` nor `enfileirada` has happened yet.
    const tipos = await eventos(conversation.id);
    expect(tipos).not.toContain('criada');
    expect(tipos).not.toContain('enfileirada');

    const antes = dubleWhatsApp.chamadas.length;
    const resultados = await processarOutbox();
    expect(resultados.some((r) => r.state === 'enviada')).toBe(true);
    expect(
      dubleWhatsApp.chamadas.slice(antes).some((c) => c.para === ANA && c.tipo === 'texto'),
    ).toBe(true);
    const { rows } = await cenario.dono.execute<{ estado_entrega: string }>(sql`
      select estado_entrega from mensagem where conversa_id = ${conversation.id}::uuid and autor_tipo = 'bot'
    `);
    expect(rows.map((r) => r.estado_entrega)).toEqual(['enviada']);
  });

  it('Use a customer reply as a variable in the bot menu', async () => {
    await falar(ANA, 'Ana');
    const conversa = await conversationOpen(ANA);
    expect((await doBot(conversa.id)).at(-1)).toBe(
      'Prazer, Ana. Como posso ajudar?\n1. Financeiro\n2. Suporte',
    );

    // The menu is structured in `dados`, and with 2 options the worker sends it as buttons
    // (quick reply is enabled by default). The numbered text remains the content that gets recorded.
    const { rows } = await cenario.dono.execute<{ dados: unknown }>(sql`
      select dados from mensagem where conversa_id = ${conversa.id}::uuid and autor_tipo = 'bot'
       order by criada_em desc limit 1
    `);
    expect(rows[0]?.dados).toEqual({
      pergunta: { texto: 'Prazer, Ana. Como posso ajudar?', opcoes: ['Financeiro', 'Suporte'] },
    });
    const antes = dubleWhatsApp.chamadas.length;
    await processarOutbox();
    expect(dubleWhatsApp.chamadas.slice(antes).filter((c) => c.para === ANA).map((c) => c.tipo)).toEqual([
      'interativo',
    ]);
  });

  it('Transfer a selected conversation into a queue with its collected context', async () => {
    await falar(ANA, '2');
    const conversa = await conversationOpen(ANA);
    expect(conversa.fila_id).toBe(cenario.queueId);
    expect(conversa.estado).toBe('na_fila');
    expect(conversa.atendente_id).toBeNull();

    const { rows: notas } = await cenario.dono.execute<{ corpo: string }>(
      sql`select corpo from nota_interna where conversa_id = ${conversa.id}::uuid`,
    );
    expect(notas).toHaveLength(1);
    expect(notas[0]!.corpo).toContain('- nome: Ana');
    expect(notas[0]!.corpo).toContain('- opcao: 2');

    const { rows: executions } = await cenario.dono.execute<{
      estado: string;
      codigo: string | null;
      contexto: Record<string, string>;
    }>(sql`
      select e.estado, b.codigo, e.contexto from execucao_fluxo e
        left join bloco b on b.id = e.bloco_atual_id
       where e.conversa_id = ${conversa.id}::uuid
    `);
    expect(executions[0]).toMatchObject({ estado: 'concluida', codigo: 'desk:suporte' });
    expect(executions[0]!.contexto['nome']).toBe('Ana');

    const tipos = await eventos(conversa.id);
    expect(tipos).toContain('criada');
    expect(tipos).toContain('enfileirada');
  });

  it('Keep the bot silent while a human ticket waits in a queue or has an agent', async () => {
    const conversa = await conversationOpen(ANA);
    const respostas = (await doBot(conversa.id)).length;

    await falar(ANA, 'alô?');
    expect(await doBot(conversa.id)).toHaveLength(respostas);

    await cenario.dono.execute(
      sql`update status_atendente set estado = 'online' where usuario_id = ${cenario.agentId}::uuid`,
    );
    await falar(ANA, 'tem alguém aí?');
    const atribuida = await conversationOpen(ANA);
    expect(atribuida.id).toBe(conversa.id);
    expect(atribuida.atendente_id).toBe(cenario.agentId);
    expect(await doBot(conversa.id)).toHaveLength(respostas);
  });

  it('Resume the flow at the block selected by human ticket closure', async () => {
    const conversa = await conversationOpen(ANA);
    const { rows: etiquetas } = await cenario.dono.execute<{ id: string }>(sql`
      insert into etiqueta (tenant_id, nome) values (${cenario.tenantId}::uuid, ${`Resolvido ${randomUUID().slice(0, 6)}`})
      returning id
    `);
    await closeConversation(
      { tenantId: cenario.tenantId, agentId: cenario.agentId, requireAssignment: true },
      { conversationId: conversa.id, etiquetaIds: [etiquetas[0]!.id] },
    );

    await falar(ANA, 'oi de novo');
    const nova = await conversationOpen(ANA);
    expect(nova.id).not.toBe(conversa.id);
    expect(nova.fila_id).toBeNull();
    expect(await doBot(nova.id)).toEqual([
      'Seu atendimento foi encerrado. Posso ajudar em algo mais?',
    ]);

    // The context belongs to the contact: the new conversation knows the name.
    const { rows } = await cenario.dono.execute<{
      contexto: Record<string, string>;
      code: string;
    }>(sql`
      select e.contexto, b.codigo from execucao_fluxo e join bloco b on b.id = e.bloco_atual_id
       where e.conversa_id = ${nova.id}::uuid
    `);
    expect(rows[0]!.contexto['nome']).toBe('Ana');
    expect(rows[0]!.codigo).toBe('pos-atendimento');
  });

  it('Do not duplicate bot replies when the same message is redelivered', async () => {
    const id = `wamid.REPETIDA.${randomUUID()}`;
    await falar(BIA, 'oi', id);
    await falar(BIA, 'oi', id);
    const conversa = await conversationOpen(BIA);
    expect(await doBot(conversa.id)).toEqual(['Olá! Qual é o seu nome?']);
    const { rows } = await cenario.dono.execute<{ total: string }>(
      sql`select count(*)::text as total from execucao_passo where entrada->>'id_provedor' = ${id}`,
    );
    expect(Number(rows[0]!.total)).toBe(1);
  });

  it('Stop bot replies when a human agent takes over mid-flow', async () => {
    await falar(CAIO, 'oi');
    const conversa = await conversationOpen(CAIO);
    await cenario.dono.execute(sql`
      update conversa set atendente_id = ${cenario.agentId}::uuid, fila_id = ${cenario.queueId}::uuid,
                          estado = 'atribuida'
       where id = ${conversa.id}::uuid
    `);
    await falar(CAIO, 'Caio');
    expect(await doBot(conversa.id)).toEqual(['Olá! Qual é o seu nome?']);
  });

  it('Send a failed flow to a queue so the customer still gets help', async () => {
    const comScript = JSON.parse(JSON.stringify(FIXTURE)) as {
      flow: Record<string, { $enteringCustomActions: unknown[] }>;
    };
    comScript.flow['boas-vindas']!.$enteringCustomActions.push({
      type: 'ExecuteScript',
      settings: { function: 'run', source: 'function run() { return 1; }', outputVariable: 'x' },
      conditions: [],
    });
    await publicar(comScript);

    await falar(DAVI, 'oi');
    const conversa = await conversationOpen(DAVI);
    expect(conversa.fila_id).toBe(cenario.queueId);
    const { rows } = await cenario.dono.execute<{ state: string }>(
      sql`select estado from execucao_fluxo where conversa_id = ${conversa.id}::uuid`,
    );
    expect(rows[0]!.estado).toBe('falhou');
    const { rows: notas } = await cenario.dono.execute<{ body: string }>(
      sql`select corpo from nota_interna where conversa_id = ${conversa.id}::uuid`,
    );
    expect(notas[0]!.corpo).toContain('o fluxo falhou');
    expect(notas[0]!.corpo).toContain('ExecuteScript');
  });
});

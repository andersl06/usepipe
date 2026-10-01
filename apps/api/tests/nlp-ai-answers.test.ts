import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 41).toString('base64')}`;

const { createToken } = await import('@pipe/authentication');
const { cifrar } = await import('@pipe/db');
const { SESSION_COOKIE_NAME } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { keyring, noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { adotarFilas, assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

/**
 * P16: NLP (intents/entities, `input.contentAssistant.*`) and AI Answers (`ProcessAnswers`,
 * `aiAnswers.*`) over the flow's AI model (`modelo_ia_do_fluxo`, migration 0080), in production
 * (WhatsApp webhook) and in the Builder test run. The provider is a local OpenAI-compatible stub
 * (`PIPE_OPENAI_BASE_URL`, no network, invented key). Worth proving: intent conditions route with the
 * provider's classification, entities need no provider, the key reaches only the provider's
 * `authorization` header, and without a key production reads no intent while the test run uses the
 * lexical stand-ins.
 */

const PHONE = '5511933330016';
const KEY = 'sk-INVENTED-nlp-key-1616';

function drawing(): { flow: Record<string, unknown>; globals: Record<string, unknown> } {
  const card = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
    id,
    $title: id,
    $position: { top: '0px', left: '0px' },
    $contentActions: [
      { action: { type: 'SendMessage', settings: { type: 'text/plain', content } } },
      { input: { bypass: false } },
    ],
    $conditionOutputs: [],
    $enteringCustomActions: [],
    $leavingCustomActions: [],
    $defaultOutput: { stateId: 'inicio' },
    ...extra,
  });
  return {
    flow: {
      inicio: {
        id: 'inicio', root: true, $title: 'Início', $position: { top: '0px', left: '0px' },
        $contentActions: [{ input: { bypass: false } }],
        $conditionOutputs: [
          { stateId: 'pedido', conditions: [{ source: 'intent', comparison: 'equals', values: ['rastrear_pedido'] }] },
          { stateId: 'produto', conditions: [{ source: 'entity', entity: 'produto', comparison: 'exists', values: [] }] },
          { stateId: 'duvidas', conditions: [{ source: 'input', comparison: 'equals', values: ['dúvidas'] }] },
        ],
        $enteringCustomActions: [], $leavingCustomActions: [],
        $defaultOutput: { stateId: 'naoEntendi' },
      },
      pedido: card('pedido', 'Intenção {{input.intent.name}}: {{input.contentAssistant.result}}'),
      produto: card('produto', 'Produto: {{input.entity.produto.value}}'),
      naoEntendi: card('naoEntendi', 'Não entendi'),
      duvidas: {
        id: 'duvidas', $title: 'AI Answers', $position: { top: '0px', left: '0px' },
        $contentActions: [{ input: { bypass: false } }],
        $enteringCustomActions: [],
        $leavingCustomActions: [{
          type: 'ProcessAnswers',
          $title: 'Process answers action',
          settings: { UserInput: '{{input.content}}', ContactId: '{{contact.identity}}', AssistantId: 'assistente-trocas' },
          conditions: [],
        }],
        $conditionOutputs: [
          { stateId: 'resposta', conditions: [{ source: 'context', variable: 'aiAnswers.statusCode', comparison: 'equals', values: ['200'] }] },
        ],
        $defaultOutput: { stateId: 'naoEntendi' },
      },
      resposta: card('resposta', '{{aiAnswers.response}}'),
    },
    globals: {},
  };
}

/** Invented AI model. */
const MODEL = {
  settings: { provider: 'openai', model: 'gpt-4.1', apiKeySecret: null },
  intents: [
    { id: 'i-pedido', name: 'rastrear_pedido', examples: ['onde está meu pedido', 'rastrear meu pedido'], answers: ['Vou verificar.'] },
  ],
  entities: [
    { id: 'e-produto', name: 'produto', values: [{ name: 'caneta', synonyms: ['esferográfica'] }, { name: 'caderno', synonyms: [] }] },
  ],
  contents: [
    { id: 'c-rastreio', name: 'Rastreio', combinations: [{ intent: 'rastrear_pedido', entities: [] }], result: 'Acesse a área de pedidos.' },
  ],
  assistants: [
    {
      id: 'assistente-trocas', name: 'Assistente de trocas', invalidAnswer: 'Não sei responder isso.',
      knowledge: [{ question: 'Qual o prazo de troca?', answer: 'Trocas em até 7 dias corridos.' }],
    },
  ],
};

// --- Local OpenAI-compatible stub ---

type Seen = { authorization: string | undefined; body: Record<string, unknown> };
let provider: Server;
const seen: Seen[] = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => ok(data));
  });
}

function answer(body: Record<string, unknown>): Record<string, unknown> {
  const messages = body['messages'] as { role: string; content: string | null }[];
  const system = messages[0]?.content ?? '';
  const said = messages.at(-1)?.content ?? '';
  const content = system.startsWith('You classify')
    ? JSON.stringify({ intents: /pedido|encomenda/i.test(said) ? [{ name: 'rastrear_pedido', score: 0.93 }] : [] })
    : system.includes('Trocas em até 7 dias corridos.')
      ? 'Você pode trocar em até 7 dias corridos.'
      : 'Não sei responder isso.';
  return { model: 'gpt-4.1', choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
}

let cenario: Awaited<ReturnType<typeof montarCenario>>;
let api: Awaited<ReturnType<typeof upApi>>;

beforeAll(async () => {
  provider = createServer(async (req, res) => {
    const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    seen.push({ authorization: req.headers['authorization'], body });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(answer(body)));
  });
  await new Promise<void>((ok) => provider.listen(0, '127.0.0.1', ok));
  process.env['PIPE_OPENAI_BASE_URL'] = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await new Promise((ok) => provider?.close(ok));
  delete process.env['PIPE_OPENAI_BASE_URL'];
});

beforeEach(() => {
  seen.length = 0;
});

describe('NLP and AI Answers in production (P16)', () => {
  beforeEach(async () => {
    cenario = await montarCenario(`nlp-${randomUUID().slice(0, 8)}`);
  }, 180_000);

  afterAll(async () => {
    await cenario?.encerrar();
  });

  async function importFlow(): Promise<string> {
    const result = await noTenant(cenario.tenantId, (tx) => importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: `NLP ${randomUUID().slice(0, 6)}`,
      channelId: cenario.channelId,
      json: drawing(),
      publicar: true,
    }));
    expect(result.errorOfValidation).toBeNull();
    await adotarFilas(cenario, result.flowId);
    expect(result.report.naoSuportado).toEqual({});
    await cenario.dono.execute(sql`
      insert into modelo_ia_do_fluxo (tenant_id, fluxo_id, configuracao, intencoes, entidades, conteudos, assistentes)
      values (${cenario.tenantId}::uuid, ${result.flowId}::uuid, ${JSON.stringify(MODEL.settings)}::jsonb,
              ${JSON.stringify(MODEL.intents)}::jsonb, ${JSON.stringify(MODEL.entities)}::jsonb,
              ${JSON.stringify(MODEL.contents)}::jsonb, ${JSON.stringify(MODEL.assistants)}::jsonb)
    `);
    return result.flowId;
  }

  async function storeKey(flowId: string): Promise<void> {
    await cenario.dono.execute(sql`
      insert into variavel_secreta_do_fluxo (tenant_id, fluxo_id, nome, valor_cifrado)
      values (${cenario.tenantId}::uuid, ${flowId}::uuid, 'OPENAI_API_KEY', ${cifrar(KEY, keyring())})
    `);
  }

  async function falar(texto: string): Promise<void> {
    const corpo = JSON.stringify(payloadOfMessage(PHONE, texto));
    const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
      body: corpo,
    });
    expect(resposta.status).toBe(200);
  }

  async function botMessages(): Promise<string[]> {
    const { rows } = await cenario.dono.execute<{ conteudo: string }>(sql`
      select conteudo from mensagem where tenant_id = ${cenario.tenantId}::uuid and autor_tipo = 'bot' order by criada_em, id
    `);
    return rows.map((r) => r.conteudo);
  }

  it('routes by intent and entity, fills the content assistant, answers with AI Answers and never stores the key', async () => {
    const flowId = await importFlow();
    await storeKey(flowId);

    // Each answer card waits for one input ('ok') before going back to the menu.
    await falar('cadê minha encomenda?');
    await falar('ok');
    await falar('quero uma esferográfica azul');
    await falar('ok');
    await falar('dúvidas');
    await falar('qual o prazo para trocar?');
    expect(await botMessages()).toEqual([
      'Intenção rastrear_pedido: Acesse a área de pedidos.',
      'Produto: caneta',
      'Você pode trocar em até 7 dias corridos.',
    ]);

    expect(seen.map((s) => s.authorization)).toEqual(Array(seen.length).fill(`Bearer ${KEY}`));
    // One classification per menu input (the intent condition is tested first) and one answer;
    // the entity needed no call, and the card inputs ('ok') read no intent.
    expect(seen).toHaveLength(4);
    expect(seen[0]!.body).toMatchObject({ model: 'gpt-4.1' });

    const { rows: executions } = await cenario.dono.execute<{ contexto: unknown }>(sql`
      select contexto from execucao_fluxo where tenant_id = ${cenario.tenantId}::uuid
    `);
    const { rows: steps } = await cenario.dono.execute<{ entrada: unknown; saida: unknown }>(sql`
      select entrada, saida from execucao_passo where tenant_id = ${cenario.tenantId}::uuid
    `);
    expect(JSON.stringify([executions, steps])).not.toContain(KEY);
  });

  it('without the key reads no intent (as Blip when analysis fails) but still finds entities', async () => {
    await importFlow();
    await falar('onde está meu pedido?');
    await falar('ok');
    await falar('um caderno');
    await falar('ok');
    await falar('dúvidas');
    await falar('qual o prazo de troca?');
    // AI Answers without a key reports status 500, so the block takes its default exit.
    expect(await botMessages()).toEqual(['Não entendi', 'Produto: caderno', 'Não entendi']);
    expect(seen).toHaveLength(0);
  });
});

describe('NLP and AI Answers in the Builder test run (P16)', () => {
  let session: string;

  beforeAll(async () => {
    cenario = await montarCenario(`nlp-teste-${randomUUID().slice(0, 8)}`);
    const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email)
      values (${cenario.tenantId}, 'Editora', ${`editora-${randomUUID().slice(0, 8)}@e2e.pipe.app`}) returning id
    `);
    await cenario.dono.execute(sql`
      insert into permissao (codigo, descricao, grupo) values ('automacao.fluxo.editar', 'editar', 'teste')
      on conflict (codigo) do nothing
    `);
    const { rows: roles } = await cenario.dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome, escopo) values (${cenario.tenantId}, 'editor', 'atendimento') returning id
    `);
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${roles[0]!.id}, 'automacao.fluxo.editar')
    `);
    await cenario.dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id) values (${cenario.tenantId}, ${users[0]!.id}, ${roles[0]!.id})
    `);
    const token = createToken();
    await cenario.dono.execute(sql`
      insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
      values (${cenario.tenantId}, ${users[0]!.id}, ${token.hash}, ${token.expiraEm}, 'google')
    `);
    session = token.token;
  }, 180_000);

  afterAll(async () => {
    await cenario?.encerrar();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function pedir(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; body: Record<string, any> }> {
    const resposta = await fetch(`${api.url}${caminho}`, {
      method: metodo,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session}`, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await resposta.text();
    return { status: resposta.status, body: texto ? JSON.parse(texto) : {} };
  }

  async function newFlow(): Promise<string> {
    const { body } = await pedir('POST', '/v1/management/flows', {
      recados: { tamanho: 't', comecoInvalido: 'c', nomeEmUso: 'u', withoutPermission: 'p' },
      name: `NLP teste ${randomUUID().slice(0, 6)}`,
      type: 'fluxo',
    });
    const id = body['id'] as string;
    expect((await pedir('PUT', `/v1/management/flows/${id}/builder`, drawing())).status).toBe(200);
    const saved = await pedir('PUT', `/v1/management/flows/${id}/ai-model`, MODEL);
    expect(saved.status).toBe(200);
    return id;
  }

  const send = (id: string, input: string) => pedir('POST', `/v1/management/flows/${id}/builder/test-runs`, { input });

  it('saves and reads the AI model through the API, validating it', async () => {
    const id = await newFlow();
    const read = await pedir('GET', `/v1/management/flows/${id}/ai-model`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ flowId: id, intents: [{ name: 'rastrear_pedido' }], assistants: [{ id: 'assistente-trocas' }] });
    const invalid = await pedir('PUT', `/v1/management/flows/${id}/ai-model`, {
      ...MODEL,
      contents: [{ name: 'X', combinations: [{ intent: 'inexistente', entities: [] }], result: 'r' }],
    });
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(invalid.body)).toContain('inexistente');
  });

  it('without a key uses the lexical stand-ins and never calls the provider', async () => {
    const id = await newFlow();
    const first = await send(id, 'onde está meu pedido');
    expect(first.body['debug']['error']).toBeUndefined();
    expect(JSON.stringify(first.body['messages'])).toContain('Intenção rastrear_pedido: Acesse a área de pedidos.');
    await send(id, 'x');
    await send(id, 'dúvidas');
    const answered = await send(id, 'qual o prazo de troca?');
    expect(JSON.stringify(answered.body['messages'])).toContain('[Simulação] Trocas em até 7 dias corridos.');
    expect(seen).toHaveLength(0);
  });

  it('with the flow key classifies and answers through the provider, as in production', async () => {
    const id = await newFlow();
    expect((await pedir('POST', `/v1/management/flows/${id}/secrets`, { name: 'OPENAI_API_KEY', value: KEY })).status).toBe(201);
    const first = await send(id, 'cadê minha encomenda?');
    expect(JSON.stringify(first.body['messages'])).toContain('Intenção rastrear_pedido');
    await send(id, 'x');
    await send(id, 'dúvidas');
    const answered = await send(id, 'qual o prazo para trocar?');
    expect(JSON.stringify(answered.body['messages'])).toContain('Você pode trocar em até 7 dias corridos.');
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.authorization === `Bearer ${KEY}`)).toBe(true);
    expect(JSON.stringify(answered.body)).not.toContain(KEY);
  });
});

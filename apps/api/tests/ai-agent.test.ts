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
 * P14 (D-58): the AI agent block in production (WhatsApp webhook) and in the Builder test run, with
 * the provider stubbed by a local OpenAI-compatible server (`PIPE_OPENAI_BASE_URL`, no network,
 * invented key). Worth proving: the key comes from the flow's secret and reaches only the provider's
 * `authorization` header (never the context, `execucao_passo`, a message or the test-run response);
 * tools (local actions) run and their result goes back to the model; a handoff takes the block's
 * named exit; without a key production takes the Error exit while the test run answers with a stub.
 */

const PHONE = '5511933330077';
const KEY = 'sk-INVENTED-agent-key-4242';
const AGENT = 'ai-agent:5a4b3c2d';

function agentDrawing(): { flow: Record<string, unknown>; globals: Record<string, unknown> } {
  const status = (value: string) => ({
    source: 'context', variable: 'agent_forwardToAgentState_status', comparison: 'equals', values: [value],
  });
  const card = (id: string, content: string) => ({
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
  });
  return {
    flow: {
      inicio: {
        id: 'inicio', root: true, $title: 'Início', $position: { top: '0px', left: '0px' },
        $contentActions: [{ input: { bypass: false } }],
        $conditionOutputs: [], $enteringCustomActions: [], $leavingCustomActions: [],
        $defaultOutput: { stateId: AGENT },
      },
      [AGENT]: {
        id: AGENT,
        $title: 'Agente',
        $position: { top: '200px', left: '0px' },
        $enteringCustomActions: [{
          type: 'ForwardToAgent',
          settings: {
            model: { provider: 'openai', model: 'gpt-4.1', maxTokens: 300, temperature: 0.2 },
            prompt: [{ role: 'system', content: 'Colete o pedido.' }, { role: 'short-term-memory', config: { length: 20 } }],
            handoffs: [{ name: 'pedido_ok', description: 'Pedido confirmado', parameters: {} }],
            output: { forward: { enabled: true }, variable: { enabled: false, name: '' } },
          },
        }],
        $contentActions: [{ input: { bypass: false, conditions: [status('Success')] } }],
        $conditionOutputs: [
          { stateId: 'erro', conditions: [status('Error')] },
          {
            stateId: 'final',
            conditions: [
              { source: 'context', variable: 'input.content@content.type', comparison: 'equals', values: ['application/vnd.iris.aiplatform.handoff+json'] },
              { source: 'context', variable: 'input.content@content.value.name', comparison: 'equals', values: ['pedido_ok'] },
            ],
          },
        ],
        $leavingCustomActions: [],
        $afterStateChangedActions: [{ type: 'LeavingFromAgent', settings: {} }],
        $localCustomActions: [{
          $title: 'anotar_pedido',
          $description: 'Anota o item pedido',
          $inputSchema: { type: 'object', properties: { item: { type: 'string' } } },
          type: 'SetVariable',
          settings: { variable: 'pedido', value: '{{aiagent.parameters@item}}' },
        }],
        $defaultOutput: { stateId: AGENT },
      },
      final: card('final', 'Pedido: {{pedido}}'),
      erro: card('erro', 'Erro do agente: {{aiagent.errorCode}}'),
    },
    globals: {},
  };
}

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

/** The model: asks for the order, notes it with the tool, then hands off when the customer says "sim". */
function answer(body: Record<string, unknown>): Record<string, unknown> {
  const messages = body['messages'] as { role: string; content: string | null }[];
  const last = messages.at(-1)!;
  const message =
    last.role === 'tool'
      ? { content: 'Anotado. Confirma?' }
      : last.content === 'sim'
        ? { content: null, tool_calls: [{ id: 'h1', type: 'function', function: { name: 'handoff_pedido_ok', arguments: '{}' } }] }
        : last.content?.startsWith('quero ')
          ? { content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'anotar_pedido', arguments: JSON.stringify({ item: last.content.slice(6) }) } }] }
          : { content: 'O que você deseja?' };
  return { model: 'gpt-4.1', choices: [{ finish_reason: 'stop', message }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
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

async function importAgentFlow(): Promise<string> {
  const result = await noTenant(cenario.tenantId, (tx) => importFlowOfBlip(tx, {
    tenantId: cenario.tenantId,
    name: `Agente ${randomUUID().slice(0, 6)}`,
    channelId: cenario.channelId,
    json: agentDrawing(),
    publicar: true,
  }));
  expect(result.errorOfValidation).toBeNull();
  await adotarFilas(cenario, result.flowId);
  expect(result.report.naoSuportado).toEqual({});
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

describe('AI agent in production (P14)', () => {
  beforeEach(async () => {
    cenario = await montarCenario(`agente-${randomUUID().slice(0, 8)}`);
  }, 180_000);

  it('talks, runs a tool, hands off through the named exit, and never stores the key', async () => {
    const flowId = await importAgentFlow();
    await storeKey(flowId);

    await falar('oi');
    await falar('quero pizza');
    await falar('sim');
    expect(await botMessages()).toEqual(['O que você deseja?', 'Anotado. Confirma?', 'Pedido: pizza']);

    expect(seen.map((s) => s.authorization)).toEqual(Array(seen.length).fill(`Bearer ${KEY}`));
    expect(seen[0]!.body).toMatchObject({ model: 'gpt-4.1', max_completion_tokens: 300, temperature: 0.2 });
    // The second input's call carries the memory of the first turn.
    const second = seen[1]!.body['messages'] as { role: string; content: string | null }[];
    expect(second.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);

    const { rows: executions } = await cenario.dono.execute<{ contexto: unknown }>(sql`
      select contexto from execucao_fluxo where tenant_id = ${cenario.tenantId}::uuid
    `);
    const { rows: steps } = await cenario.dono.execute<{ entrada: unknown; saida: unknown }>(sql`
      select entrada, saida from execucao_passo where tenant_id = ${cenario.tenantId}::uuid
    `);
    expect(JSON.stringify([executions, steps])).not.toContain(KEY);
    expect(JSON.stringify(executions)).toContain('"pedido":"pizza"');
  });

  it('without the key the block takes its Error exit', async () => {
    await importAgentFlow();
    await falar('oi');
    expect(await botMessages()).toEqual(['Erro do agente: model_error']);
    expect(seen).toHaveLength(0);
  });
});

describe('AI agent in the Builder test run (P14)', () => {
  let session: string;

  beforeAll(async () => {
    cenario = await montarCenario(`agente-teste-${randomUUID().slice(0, 8)}`);
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
      name: `Agente teste ${randomUUID().slice(0, 6)}`,
      type: 'fluxo',
    });
    const id = body['id'] as string;
    expect((await pedir('PUT', `/v1/management/flows/${id}/builder`, agentDrawing())).status).toBe(200);
    return id;
  }

  const send = (id: string, input: string) => pedir('POST', `/v1/management/flows/${id}/builder/test-runs`, { input });

  it('without a key answers with the stub, and /handoff tests the exits', async () => {
    const id = await newFlow();
    const first = await send(id, 'oi');
    expect(first.body['debug']['error']).toBeUndefined();
    expect(JSON.stringify(first.body['messages'])).toContain('[Simulação]');
    const out = await send(id, '/handoff pedido_ok');
    expect(JSON.stringify(out.body['messages'])).toContain('Pedido: ');
    expect(seen).toHaveLength(0);
  });

  it('with the flow key behaves as production and never returns the key', async () => {
    const id = await newFlow();
    const created = await pedir('POST', `/v1/management/flows/${id}/secrets`, { name: 'OPENAI_API_KEY', value: KEY });
    expect(created.status).toBe(201);
    await send(id, 'oi');
    await send(id, 'quero suco');
    const last = await send(id, 'sim');
    expect(JSON.stringify(last.body['messages'])).toContain('Pedido: suco');
    expect(last.body['debug']['variables']['pedido']).toBe('suco');
    expect(seen.every((s) => s.authorization === `Bearer ${KEY}`)).toBe(true);
    expect(JSON.stringify(last.body)).not.toContain(KEY);
  });
});

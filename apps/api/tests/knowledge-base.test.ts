import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 43).toString('base64')}`;

const { createToken } = await import('@pipe/authentication');
const { cifrar } = await import('@pipe/db');
const { EMBEDDING_DIMENSIONS } = await import('@pipe/ai/embeddings');
const { SESSION_COOKIE_NAME } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { keyring, noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { knowledgeService } = await import('../src/domain/knowledge/search.js');
const { adotarFilas, assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

/**
 * P15 (plan 02-55): the tenant's knowledge bases and the AI agent's MCP servers, against the real
 * database, with every provider stubbed (no network, invented keys):
 * - management API: bases and text ingestion into passages, edits, deletes, permission;
 * - search: lexical without a key; semantic with a key (a local bag-of-words "embedding" stands in
 *   for OpenAI), passages embedded lazily and cached; base/tag filters;
 * - production over the WhatsApp webhook: an agent with a `KnowledgeBaseConsult` tool and an MCP
 *   server (the MCP server is an in-process `fetch` stub, its token a flow secret);
 * - Builder test run: `ProcessContentAssistant` with no key answers from the lexical search and takes
 *   the no-match exit when nothing is found.
 */

const PHONE = '5511933330155';
const OPENAI_KEY = 'sk-INVENTED-knowledge-key-5151';
const MCP_TOKEN = 'mcp-INVENTED-token-5151';
const MCP_URL = 'https://mcp.exemplo.test/mcp';
const AGENT = 'ai-agent:9c8b7a6d';

// --- A deterministic stand-in for embeddings: hashed bag of words, so shared words mean similarity ---

function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
}

function fakeVector(text: string): number[] {
  const v: number[] = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const w of words(text)) {
    let h = 7;
    for (const ch of w) h = (h * 31 + ch.codePointAt(0)!) % EMBEDDING_DIMENSIONS;
    v[h] = (v[h] ?? 0) + 1;
  }
  if (!v.some((n) => n > 0)) v[0] = 1;
  return v;
}

// --- Local OpenAI-compatible stub: chat completions + embeddings ---

type Seen = { path: string; authorization: string | undefined; body: Record<string, unknown> };
const seen: Seen[] = [];
let provider: Server;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => ok(data));
  });
}

/** The agent: searches the knowledge base, then asks the MCP server, then answers with both. */
function chat(body: Record<string, unknown>): Record<string, unknown> {
  const messages = body['messages'] as { role: string; content: string | null }[];
  const tools = messages.filter((m) => m.role === 'tool');
  const call = (id: string, name: string, args: Record<string, unknown>) => ({
    content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
  });
  const message =
    tools.length === 0
      ? call('k1', 'Base_de_ajuda', { query: 'prazo de troca' })
      : tools.length === 1
        ? call('m1', 'consultar_pedido', { numero: '42' })
        : {
            content: `Base: ${(JSON.parse(tools[0]!.content!) as { passages: { text: string }[] }).passages[0]?.text ?? '-'} | MCP: ${tools[1]!.content}`,
          };
  return { model: 'gpt-4.1', choices: [{ finish_reason: 'stop', message }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
}

// --- In-process MCP server stub (the API's MCP client uses the global fetch) ---

const mcpSeen: { method: string; authorization: string | undefined }[] = [];
const realFetch = globalThis.fetch;

async function mcpFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(MCP_URL)) return realFetch(input, init);
  const body = JSON.parse(String(init?.body)) as { id?: number; method: string; params?: Record<string, unknown> };
  const headers = init?.headers as Record<string, string>;
  mcpSeen.push({ method: body.method, authorization: headers['Authorization'] });
  if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
  const result =
    body.method === 'initialize'
      ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'pedidos' } }
      : body.method === 'tools/list'
        ? { tools: [{ name: 'consultar_pedido', description: 'Consulta um pedido', inputSchema: { type: 'object', properties: { numero: { type: 'string' } } } }] }
        : { content: [{ type: 'text', text: `Pedido ${String((body.params?.['arguments'] as { numero?: string })?.numero)}: entregue` }] };
  return Response.json({ jsonrpc: '2.0', id: body.id, result }, { headers: { 'mcp-session-id': 'sessao-e2e' } });
}

// --- Scenario ---

let cenario: Awaited<ReturnType<typeof montarCenario>>;
let api: Awaited<ReturnType<typeof upApi>>;
let session: string;
let sessionWithoutPermission: string;

async function sessionFor(withPermission: boolean): Promise<string> {
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Pessoa', ${`kb-${randomUUID().slice(0, 8)}@e2e.pipe.app`}) returning id
  `);
  if (withPermission) {
    await cenario.dono.execute(sql`
      insert into permissao (codigo, descricao, grupo) values ('automacao.fluxo.editar', 'editar', 'teste')
      on conflict (codigo) do nothing
    `);
    const { rows: roles } = await cenario.dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome, escopo) values (${cenario.tenantId}, ${`editor-${randomUUID().slice(0, 4)}`}, 'atendimento') returning id
    `);
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo) values (${cenario.tenantId}, ${roles[0]!.id}, 'automacao.fluxo.editar')
    `);
    await cenario.dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id) values (${cenario.tenantId}, ${users[0]!.id}, ${roles[0]!.id})
    `);
  }
  const token = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${users[0]!.id}, ${token.hash}, ${token.expiraEm}, 'google')
  `);
  return token.token;
}

beforeAll(async () => {
  provider = createServer(async (req, res) => {
    const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    seen.push({ path: req.url ?? '', authorization: req.headers['authorization'], body });
    res.setHeader('content-type', 'application/json');
    if (req.url?.endsWith('/embeddings')) {
      const inputs = body['input'] as string[];
      res.end(JSON.stringify({ model: 'text-embedding-3-small', data: inputs.map((t, index) => ({ index, embedding: fakeVector(t) })), usage: { prompt_tokens: 1 } }));
      return;
    }
    res.end(JSON.stringify(chat(body)));
  });
  await new Promise<void>((ok) => provider.listen(0, '127.0.0.1', ok));
  process.env['PIPE_OPENAI_BASE_URL'] = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;
  vi.stubGlobal('fetch', mcpFetch);
  api = await upApi(0);
  cenario = await montarCenario(`conhecimento-${randomUUID().slice(0, 8)}`);
  session = await sessionFor(true);
  sessionWithoutPermission = await sessionFor(false);
}, 180_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await api?.fechar();
  await new Promise((ok) => provider?.close(ok));
  await cenario?.encerrar();
  delete process.env['PIPE_OPENAI_BASE_URL'];
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pedir(metodo: string, caminho: string, corpo?: unknown, cookie = session): Promise<{ status: number; body: any }> {
  const resposta = await realFetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? JSON.parse(texto) : {} };
}

const TROCAS = 'O prazo de troca é de 30 dias corridos após a entrega.\n\nA troca exige a nota fiscal do pedido.';
const FRETE = 'O frete é grátis para compras acima de 200 reais em todo o Brasil.';
const SENHAS = 'Nunca compartilhe a senha do sistema interno com clientes.';

let helpBase: string;
let internalBase: string;

describe('knowledge bases (management API)', () => {
  it('creates bases and ingests text documents into passages', async () => {
    const created = await pedir('POST', '/v1/management/knowledge-bases', { name: 'Ajuda ao cliente' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Ajuda ao cliente', active: true, documents: 0 });
    helpBase = created.body.id;
    internalBase = (await pedir('POST', '/v1/management/knowledge-bases', { name: 'Interna' })).body.id;

    const doc = await pedir('POST', `/v1/management/knowledge-bases/${helpBase}/documents`, { title: 'Política de trocas', body: TROCAS, tags: ['Trocas'] });
    expect(doc.status).toBe(201);
    expect(doc.body).toMatchObject({ title: 'Política de trocas', tags: ['trocas'], version: 1, passages: 1, embedded: 0 });
    expect((await pedir('POST', `/v1/management/knowledge-bases/${helpBase}/documents`, { title: 'Frete', body: FRETE, tags: 'frete' })).status).toBe(201);
    expect((await pedir('POST', `/v1/management/knowledge-bases/${internalBase}/documents`, { title: 'Senhas', body: SENHAS })).status).toBe(201);

    const list = await pedir('GET', `/v1/management/knowledge-bases/${helpBase}/documents`);
    expect(list.body.map((d: { title: string }) => d.title)).toEqual(['Frete', 'Política de trocas']);
    const detail = await pedir('GET', `/v1/management/knowledge-bases/${helpBase}/documents/${doc.body.id}`);
    expect(detail.body.body).toBe(TROCAS);
    const bases = await pedir('GET', '/v1/management/knowledge-bases');
    expect(bases.body.find((b: { id: string }) => b.id === helpBase)).toMatchObject({ documents: 2 });
  });

  it('validates input, replaces passages on a new body and deletes', async () => {
    expect((await pedir('POST', '/v1/management/knowledge-bases', { name: '  ' })).status).toBe(400);
    expect((await pedir('POST', `/v1/management/knowledge-bases/${helpBase}/documents`, { title: 'Vazio', body: '' })).status).toBe(400);
    expect((await pedir('GET', `/v1/management/knowledge-bases/${randomUUID()}/documents`)).status).toBe(404);
    expect((await pedir('GET', '/v1/management/knowledge-bases', undefined, sessionWithoutPermission)).status).toBe(403);

    const temp = await pedir('POST', `/v1/management/knowledge-bases/${helpBase}/documents`, { title: 'Temporário', body: 'Texto antigo.' });
    const edited = await pedir('PATCH', `/v1/management/knowledge-bases/${helpBase}/documents/${temp.body.id}`, { body: 'Texto novo.\n\nSegundo parágrafo novo.' });
    expect(edited.body).toMatchObject({ version: 2, passages: 1 });
    const { rows } = await cenario.dono.execute<{ texto: string }>(sql`select texto from trecho_conhecimento where documento_id = ${temp.body.id}::uuid`);
    expect(rows.map((r) => r.texto)).toEqual(['Texto novo.\n\nSegundo parágrafo novo.']);
    expect((await pedir('DELETE', `/v1/management/knowledge-bases/${helpBase}/documents/${temp.body.id}`)).status).toBe(204);
    const other = await pedir('POST', '/v1/management/knowledge-bases', { name: 'Descartável' });
    expect((await pedir('DELETE', `/v1/management/knowledge-bases/${other.body.id}`)).status).toBe(204);
    const { rows: audit } = await cenario.dono.execute<{ n: number }>(sql`
      select count(*)::int as n from log_auditoria where tenant_id = ${cenario.tenantId}::uuid and objeto_tipo in ('base_conhecimento', 'documento_conhecimento')
    `);
    expect(audit[0]!.n).toBeGreaterThanOrEqual(8);
  });
});

describe('knowledge search', () => {
  const request = (query: string, extra: Record<string, unknown> = {}) => ({
    query, topK: 3, minimumScore: 0, bases: [] as string[], documents: [] as string[], tags: [] as string[], apiKeySecret: null, ...extra,
  });
  const service = (key: string | null) => {
    const embedCalls: number[] = [];
    const svc = knowledgeService({
      tenantId: cenario.tenantId,
      isolate: (fn) => noTenant(cenario.tenantId, fn),
      loadSecret: async (name) => (name === 'OPENAI_API_KEY' ? key : null),
      embed: async (inputs) => {
        embedCalls.push(inputs.length);
        return { model: 'text-embedding-3-small', vectors: inputs.map(fakeVector) };
      },
    });
    return { svc, embedCalls };
  };

  it('without a key searches the full text and scores by the words found', async () => {
    const { svc, embedCalls } = service(null);
    const result = await svc.searchKnowledge(request('prazo troca'));
    expect(result.mode).toBe('lexical');
    expect(result.passages[0]).toMatchObject({ documentTitle: 'Política de trocas', baseName: 'Ajuda ao cliente', score: 1 });
    expect((await svc.searchKnowledge(request('frete senha', { bases: [internalBase] }))).passages.map((p) => p.documentTitle)).toEqual(['Senhas']);
    expect((await svc.searchKnowledge(request('frete troca', { tags: ['frete'] }))).passages.map((p) => p.documentTitle)).toEqual(['Frete']);
    // Unknown (e.g. Blip) catalog ids fall back to every base of the tenant.
    expect((await svc.searchKnowledge(request('senha', { bases: ['catalogo-da-blip'] }))).passages).toHaveLength(1);
    expect((await svc.searchKnowledge(request('astronauta'))).passages).toEqual([]);
    expect(embedCalls).toEqual([]);
    const answer = await svc.respondWithKnowledge({ text: 'prazo troca', minimumConfidence: 0.8 });
    expect(answer).toEqual({ answer: TROCAS, confidence: 1 });
  });

  it('with a key embeds the passages lazily once and ranks by similarity', async () => {
    const { svc, embedCalls } = service(OPENAI_KEY);
    const first = await svc.searchKnowledge(request('qual o prazo para troca do pedido'));
    expect(first.mode).toBe('semantic');
    expect(first.passages[0]!.documentTitle).toBe('Política de trocas');
    expect(first.passages[0]!.score).toBeGreaterThan(first.passages[1]?.score ?? 0);
    expect(embedCalls).toEqual([4]); // the query plus the 3 passages of the tenant
    const { rows } = await cenario.dono.execute<{ n: number }>(sql`
      select count(*)::int as n from trecho_conhecimento
       where tenant_id = ${cenario.tenantId}::uuid and embedding is not null and modelo_embedding = 'text-embedding-3-small'
    `);
    expect(rows[0]!.n).toBe(3);
    await svc.searchKnowledge(request('frete grátis'));
    expect(embedCalls).toEqual([4, 1]); // nothing left to embed: only the query
    // Two of the Frete passage's nine words: cosine ≈ 0.47; the other passages share none.
    const filtered = await svc.searchKnowledge(request('frete grátis', { minimumScore: 0.3 }));
    expect(filtered.passages.map((p) => p.documentTitle)).toEqual(['Frete']);
  });
});

function agentDrawing(): { flow: Record<string, unknown>; globals: Record<string, unknown> } {
  const status = (value: string) => ({ source: 'context', variable: 'agent_forwardToAgentState_status', comparison: 'equals', values: [value] });
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
            model: { provider: 'openai', model: 'gpt-4.1', maxTokens: 300 },
            prompt: [{ role: 'system', content: 'Responda com a base.' }],
            handoffs: [],
            output: { forward: { enabled: true }, variable: { enabled: false, name: '' } },
            tools: {
              'grounding-mcp': { code: 'grounding-mcp', mcp: 'https://grounding.exemplo.test/mcp', transport: 'streamable-http', headers: {} },
              'custom:pedidos': { code: 'pedidos', mcp: MCP_URL, transport: 'streamable-http', headers: {}, secretHeaders: { Authorization: 'MCP_TOKEN' } },
            },
          },
        }],
        $contentActions: [{ input: { bypass: false, conditions: [status('Success')] } }],
        $conditionOutputs: [],
        $leavingCustomActions: [],
        $afterStateChangedActions: [{ type: 'LeavingFromAgent', settings: {} }],
        $localCustomActions: [{
          $title: 'Base de ajuda',
          $description: 'Busca as políticas da loja',
          type: 'KnowledgeBaseConsult',
          settings: { top_k: 2, catalogs: [helpBase] },
        }],
        $defaultOutput: { stateId: AGENT },
      },
    },
    globals: {},
  };
}

describe('AI agent with knowledge and MCP in production (P15)', () => {
  it('searches the base, calls the MCP tool with the secret header and answers, never storing the secrets', async () => {
    seen.length = 0;
    mcpSeen.length = 0;
    const result = await noTenant(cenario.tenantId, (tx) => importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: `Agente KB ${randomUUID().slice(0, 6)}`,
      channelId: cenario.channelId,
      json: agentDrawing(),
      publicar: true,
    }));
    expect(result.errorOfValidation).toBeNull();
    await adotarFilas(cenario, result.flowId);
    expect(result.report.naoSuportado).toEqual({});
    for (const [name, value] of [['OPENAI_API_KEY', OPENAI_KEY], ['MCP_TOKEN', MCP_TOKEN]] as const) {
      await cenario.dono.execute(sql`
        insert into variavel_secreta_do_fluxo (tenant_id, fluxo_id, nome, valor_cifrado)
        values (${cenario.tenantId}::uuid, ${result.flowId}::uuid, ${name}, ${cifrar(value, keyring())})
      `);
    }

    const corpo = JSON.stringify(payloadOfMessage(PHONE, 'posso trocar o pedido 42?'));
    const resposta = await realFetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
      body: corpo,
    });
    expect(resposta.status).toBe(200);

    const { rows: messages } = await cenario.dono.execute<{ conteudo: string }>(sql`
      select conteudo from mensagem where tenant_id = ${cenario.tenantId}::uuid and autor_tipo = 'bot' order by criada_em, id
    `);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.conteudo).toContain('30 dias');
    expect(messages[0]!.conteudo).toContain('MCP: Pedido 42: entregue');

    const chats = seen.filter((s) => s.path.endsWith('/chat/completions'));
    const tools = (chats[0]!.body['tools'] as { function: { name: string } }[]).map((t) => t.function.name);
    expect(tools).toEqual(['Base_de_ajuda', 'consultar_pedido']);
    expect(seen.filter((s) => s.path.endsWith('/embeddings')).length).toBeGreaterThanOrEqual(1);
    expect(seen.every((s) => s.authorization === `Bearer ${OPENAI_KEY}`)).toBe(true);
    expect(mcpSeen.map((m) => m.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
    expect(mcpSeen.every((m) => m.authorization === MCP_TOKEN)).toBe(true);

    const { rows: executions } = await cenario.dono.execute<{ contexto: unknown }>(sql`
      select contexto from execucao_fluxo where tenant_id = ${cenario.tenantId}::uuid
    `);
    const { rows: steps } = await cenario.dono.execute<{ entrada: unknown; saida: unknown }>(sql`
      select entrada, saida from execucao_passo where tenant_id = ${cenario.tenantId}::uuid
    `);
    const stored = JSON.stringify([executions, steps, messages]);
    expect(stored).not.toContain(OPENAI_KEY);
    expect(stored).not.toContain(MCP_TOKEN);
  });
});

describe('ProcessContentAssistant in the Builder test run (P15)', () => {
  function assistantDrawing(): { flow: Record<string, unknown>; globals: Record<string, unknown> } {
    const card = (id: string, content: string) => ({
      id, $title: id, $position: { top: '0px', left: '0px' },
      // Back to the start without waiting, so the next test-run input is a new question.
      $contentActions: [{ action: { type: 'SendMessage', settings: { type: 'text/plain', content } } }, { input: { bypass: true } }],
      $conditionOutputs: [], $enteringCustomActions: [], $leavingCustomActions: [],
      $defaultOutput: { stateId: 'inicio' },
    });
    return {
      flow: {
        inicio: {
          id: 'inicio', root: true, $title: 'Início', $position: { top: '0px', left: '0px' },
          $contentActions: [{ input: { bypass: false } }],
          $enteringCustomActions: [],
          $leavingCustomActions: [{
            type: 'ProcessContentAssistant',
            settings: { text: '{{input.content}}', score: 0.5, outputVariable: 'resposta' },
          }],
          $conditionOutputs: [{ stateId: 'achou', conditions: [{ source: 'context', variable: 'resposta', comparison: 'exists', values: [] }] }],
          $defaultOutput: { stateId: 'nao_achou' },
        },
        achou: card('achou', 'Achei: {{resposta}}'),
        nao_achou: card('nao_achou', 'Não encontrei.'),
      },
      globals: {},
    };
  }

  it('answers from the base without a key and takes the no-match exit otherwise', async () => {
    seen.length = 0;
    const { body } = await pedir('POST', '/v1/management/flows', {
      recados: { tamanho: 't', comecoInvalido: 'c', nomeEmUso: 'u', withoutPermission: 'p' },
      name: `Assistente ${randomUUID().slice(0, 6)}`,
      type: 'fluxo',
    });
    const id = body['id'] as string;
    expect((await pedir('PUT', `/v1/management/flows/${id}/builder`, assistantDrawing())).status).toBe(200);
    const found = await pedir('POST', `/v1/management/flows/${id}/builder/test-runs`, { input: 'frete grátis acima de 200?' });
    expect(found.body['debug']['error']).toBeUndefined();
    expect(JSON.stringify(found.body['messages'])).toContain('Achei: O frete é grátis');
    const missing = await pedir('POST', `/v1/management/flows/${id}/builder/test-runs`, { input: 'astronauta' });
    expect(JSON.stringify(missing.body['messages'])).toContain('Não encontrei.');
    expect(seen).toHaveLength(0);
  });
});

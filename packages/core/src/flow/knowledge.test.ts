import { describe, expect, it } from 'vitest';
import { VARIABLE_OF_AGENT_FORWARDING, type AgentModelRequest, type AgentModelResponse } from './ai-agent.js';
import { createInbound, type Context, type OutputMessage } from './context.js';
import { converterDoEditor, importReport, type ExportDoEditor } from './editor.js';
import {
  GROUNDING_MCP_CODE,
  knowledgeConsultSettings,
  knowledgeResultJson,
  mcpServersOf,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResult,
  type McpServer,
} from './knowledge.js';
import { processInbound } from './manager.js';
import type { FlowBlip } from './modelos.js';

const AGENT = 'ai-agent:7a6b5c4d';
const BASE = '11111111-2222-4333-8444-555555555555';

const passage = (text: string, score: number) => ({
  id: `t-${score}`, text, score, documentId: 'd-1', documentTitle: 'Política de trocas', baseId: BASE, baseName: 'Ajuda',
});

describe('settings', () => {
  it('reads Blip grounding setup (catalogs/documents as ids or objects) with Pipe limits', () => {
    expect(knowledgeConsultSettings({
      top_k: 99, catalogs: [BASE, { id: 'outro' }, BASE], documents: [{ id: 'doc-1', catalog_id: BASE, status: 'active' }],
    })).toEqual({
      topK: 20, bases: [BASE, 'outro'], documents: ['doc-1'], tags: [], minimumScore: 0, apiKeySecret: null, query: null, outputVariable: null,
    });
    expect(knowledgeConsultSettings(null).topK).toBe(5);
    expect(knowledgeConsultSettings({ tags: 'Frete, TROCA ,' }).tags).toEqual(['frete', 'troca']);
    expect(() => knowledgeConsultSettings({ minimumScore: 70 })).toThrow('entre 0 e 1');
  });

  it('lists the MCP servers of the agent settings without Blip grounding', () => {
    expect(mcpServersOf({
      [GROUNDING_MCP_CODE]: { code: GROUNDING_MCP_CODE, mcp: 'https://grounding.exemplo.test/mcp' },
      'custom:1': {
        code: 'pedidos', mcp: 'https://mcp.exemplo.test/mcp', transport: 'streamable-http',
        headers: { 'X-Contato': 'ana', vazio: 1 }, secretHeaders: { Authorization: 'MCP_TOKEN' },
      },
      velho: { mcp: 'https://sse.exemplo.test/sse', transport: 'sse' },
      quebrado: { code: 'sem-url' },
    })).toEqual([
      { code: 'pedidos', url: 'https://mcp.exemplo.test/mcp', transport: 'streamable-http', headers: { 'X-Contato': 'ana' }, secretHeaders: { Authorization: 'MCP_TOKEN' } },
      { code: 'velho', url: 'https://sse.exemplo.test/sse', transport: 'sse', headers: {}, secretHeaders: {} },
    ]);
    expect(mcpServersOf(undefined)).toEqual([]);
  });

  it('drops the weakest passages until the JSON fits', () => {
    const result: KnowledgeSearchResult = { mode: 'semantic', passages: [passage('a'.repeat(300), 0.9), passage('b'.repeat(300), 0.8)] };
    expect(JSON.parse(knowledgeResultJson(result)).passages).toHaveLength(2);
    expect(JSON.parse(knowledgeResultJson(result, 500)).passages).toHaveLength(1);
  });
});

function plainContext(services: Partial<Context['services']>, text = 'como faço uma troca?'): Context {
  return {
    user: 'contato-1',
    flow: { id: 'fluxo-1', states: [{ id: 'raiz', root: true, input: {}, outputActions: [], outputs: [] }] },
    inbound: createInbound({ id: 'entrada-1', tipo: 'text/plain', conteudo: text }),
    variables: {},
    inboundContext: new Map(),
    services: { send: async () => {}, forwardForAttendance: async () => ({ id: 't' }), registerEvent: async () => {}, ...services },
  };
}

describe('flow actions', () => {
  it('KnowledgeBaseConsult searches the input and writes the passages, or removes the variable on no match', async () => {
    const requests: KnowledgeSearchRequest[] = [];
    let found = true;
    const c = plainContext({
      searchKnowledge: async (request) => {
        requests.push(request);
        return { mode: 'lexical', passages: found ? [passage('Trocas em até 30 dias.', 0.67)] : [] };
      },
    });
    c.flow.states[0]!.outputActions = [{ type: 'KnowledgeBaseConsult', settings: { top_k: 3, catalogs: [BASE], outputVariable: 'trechos' } }];
    await processInbound(c);
    expect(requests[0]).toEqual({ query: 'como faço uma troca?', topK: 3, minimumScore: 0, bases: [BASE], documents: [], tags: [], apiKeySecret: null });
    expect(JSON.parse(c.variables['trechos']!)).toEqual({
      mode: 'lexical', passages: [{ text: 'Trocas em até 30 dias.', score: 0.67, document: 'Política de trocas', documentId: 'd-1', base: 'Ajuda' }],
    });
    found = false;
    await processInbound(c);
    expect(c.variables['trechos']).toBeUndefined();
  });

  it('ProcessContentAssistant removes its variable when nothing matches and passes the key secret name', async () => {
    const seen: unknown[] = [];
    const c = plainContext({
      respondWithKnowledge: async (request) => {
        seen.push(request);
        return { answer: null, confidence: 0.2 };
      },
    });
    c.variables['resposta'] = 'antiga';
    c.flow.states[0]!.outputActions = [{ type: 'ProcessContentAssistant', settings: {
      text: 'Frete grátis?', score: 0.5, outputVariable: 'resposta', apiKeySecret: 'CHAVE_EMBEDDINGS',
    } }];
    await processInbound(c);
    expect(seen).toEqual([{ text: 'Frete grátis?', minimumConfidence: 0.5, tags: undefined, apiKeySecret: 'CHAVE_EMBEDDINGS' }]);
    expect(c.variables['resposta']).toBeUndefined();
  });
});

/** Invented agent block with a knowledge tool and one MCP server (no Blip content copied). */
function agentFlow(): ExportDoEditor {
  const statusIs = (value: string) => ({ source: 'context', variable: VARIABLE_OF_AGENT_FORWARDING, comparison: 'equals', values: [value] });
  return {
    flow: {
      inicio: { id: 'inicio', root: true, $contentActions: [{ input: { bypass: false } }], $conditionOutputs: [], $defaultOutput: { stateId: AGENT } },
      [AGENT]: {
        id: AGENT,
        $enteringCustomActions: [{
          type: 'ForwardToAgent',
          settings: {
            model: { provider: 'openai', model: 'gpt-4.1', apiKeySecret: 'CHAVE_OPENAI' },
            prompt: [{ role: 'system', content: 'Responda com a base.' }],
            tools: {
              [GROUNDING_MCP_CODE]: { code: GROUNDING_MCP_CODE, mcp: 'https://grounding.exemplo.test/mcp' },
              'custom:1': { code: 'pedidos', mcp: 'https://mcp.exemplo.test/mcp', headers: { 'X-Contato': '{{contact.name}}' }, secretHeaders: { Authorization: 'MCP_TOKEN' } },
              'custom:2': { code: 'fora', mcp: 'https://fora.exemplo.test/mcp' },
            },
          },
        }],
        $contentActions: [{ input: { bypass: false, conditions: [statusIs('Success')] } }],
        $conditionOutputs: [{ stateId: 'inicio', conditions: [statusIs('Error')] }],
        $defaultOutput: { stateId: AGENT },
        $localCustomActions: [{
          $id: 'kb-1', $title: 'Base de ajuda', $description: 'Busca nas políticas da loja',
          type: 'KnowledgeBaseConsult', settings: { top_k: 2, catalogs: [BASE] },
        }],
        $afterStateChangedActions: [{ type: 'LeavingFromAgent', settings: {} }],
      },
    },
  };
}

describe('AI agent with knowledge and MCP tools (stubbed services)', () => {
  it('offers the knowledge search and the MCP tools, runs them and returns their results to the model', async () => {
    const flow: FlowBlip = converterDoEditor(agentFlow(), 'fluxo-kb');
    const requests: AgentModelRequest[] = [];
    const searches: KnowledgeSearchRequest[] = [];
    const listed: McpServer[] = [];
    const called: { server: string; name: string; args: Record<string, unknown> }[] = [];
    const sent: OutputMessage[] = [];
    const script = (call: number): AgentModelResponse => {
      if (call === 1) return { text: null, toolCalls: [{ id: 'k1', name: 'Base_de_ajuda', arguments: { query: 'prazo de troca' } }], stopReason: 'tool_use', model: 'gpt-4.1' };
      if (call === 2) return { text: null, toolCalls: [{ id: 'm1', name: 'consultar_pedido', arguments: { numero: '42' } }], stopReason: 'tool_use', model: 'gpt-4.1' };
      return { text: 'Seu pedido 42 pode ser trocado em 30 dias.', toolCalls: [], stopReason: 'end', model: 'gpt-4.1' };
    };
    const c: Context = {
      user: 'contato-1',
      flow,
      inbound: createInbound({ id: 'm-1', tipo: 'text/plain', conteudo: 'posso trocar o pedido 42?' }),
      variables: {},
      inboundContext: new Map(),
      contact: { name: 'Ana' },
      services: {
        send: async (m) => { sent.push(m); },
        forwardForAttendance: async () => ({ id: 't' }),
        registerEvent: async () => {},
        callAgentModel: async (request) => {
          requests.push(JSON.parse(JSON.stringify(request)) as AgentModelRequest);
          return script(requests.length);
        },
        searchKnowledge: async (request) => {
          searches.push(request);
          return { mode: 'semantic', passages: [passage('Trocas em até 30 dias.', 0.91)] };
        },
        listMcpTools: async (server) => {
          listed.push(server);
          if (server.code === 'fora') throw new Error('servidor fora do ar');
          return [{ name: 'consultar_pedido', description: 'Consulta um pedido', inputSchema: { type: 'object', properties: { numero: { type: 'string' } } } }];
        },
        callMcpTool: async (server, name, args) => {
          called.push({ server: server.code, name, args });
          return { content: 'Pedido 42: entregue em 01/09', isError: false };
        },
      },
    };
    await processInbound(c);

    expect(requests[0]!.tools.map((t) => t.name)).toEqual(['Base_de_ajuda', 'consultar_pedido']);
    expect(requests[0]!.tools[0]).toMatchObject({ description: 'Busca nas políticas da loja', inputSchema: { required: ['query'] } });
    // Blip's grounding server is skipped; the server that cannot be listed only loses its tools.
    expect(listed.map((s) => s.code)).toEqual(['pedidos', 'fora']);
    expect(listed[0]).toMatchObject({ headers: { 'X-Contato': 'Ana' }, secretHeaders: { Authorization: 'MCP_TOKEN' } });
    // An OpenAI agent's key secret also serves the embeddings.
    expect(searches).toEqual([{ query: 'prazo de troca', topK: 2, minimumScore: 0, bases: [BASE], documents: [], tags: [], apiKeySecret: 'CHAVE_OPENAI' }]);
    const knowledgeResult = requests[1]!.messages.at(-1) as { role: string; content: string };
    expect(JSON.parse(knowledgeResult.content)).toEqual({
      status: 'ok', mode: 'semantic',
      passages: [{ text: 'Trocas em até 30 dias.', score: 0.91, document: 'Política de trocas', documentId: 'd-1', base: 'Ajuda' }],
    });
    expect(called).toEqual([{ server: 'pedidos', name: 'consultar_pedido', args: { numero: '42' } }]);
    expect(requests[2]!.messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'm1', content: 'Pedido 42: entregue em 01/09' });
    expect(sent.map((m) => m.conteudo)).toEqual(['Seu pedido 42 pode ser trocado em 30 dias.']);
    expect(c.variables[VARIABLE_OF_AGENT_FORWARDING]).toBe('Success');
  });

  it('a failing search or MCP call goes back to the model as a tool error', async () => {
    const flow = converterDoEditor(agentFlow(), 'fluxo-kb2');
    const requests: AgentModelRequest[] = [];
    const c: Context = {
      user: 'contato-1',
      flow,
      inbound: createInbound({ id: 'm-1', tipo: 'text/plain', conteudo: 'oi' }),
      variables: {},
      inboundContext: new Map(),
      services: {
        send: async () => {},
        forwardForAttendance: async () => ({ id: 't' }),
        registerEvent: async () => {},
        callAgentModel: async (request) => {
          requests.push(JSON.parse(JSON.stringify(request)) as AgentModelRequest);
          if (requests.length === 1) {
            return { text: null, toolCalls: [
              { id: 'k1', name: 'Base_de_ajuda', arguments: {} },
              { id: 'm1', name: 'consultar_pedido', arguments: {} },
            ], stopReason: 'tool_use', model: 'gpt-4.1' };
          }
          return { text: 'Não consegui consultar.', toolCalls: [], stopReason: 'end', model: 'gpt-4.1' };
        },
        searchKnowledge: async () => { throw new Error('banco indisponível'); },
        listMcpTools: async () => [{ name: 'consultar_pedido', description: '', inputSchema: { type: 'object' } }],
        callMcpTool: async () => { throw new Error('401 do servidor MCP'); },
      },
    };
    await processInbound(c);
    const tools = requests[1]!.messages.filter((m) => m.role === 'tool') as { content: string; isError?: boolean }[];
    expect(tools.map((t) => t.isError)).toEqual([true, true]);
    expect(tools[0]!.content).toContain('banco indisponível');
    expect(tools[1]!.content).toContain('401 do servidor MCP');
    expect(c.variables[VARIABLE_OF_AGENT_FORWARDING]).toBe('Success');
  });

  it('the import report counts KnowledgeBaseConsult in an agent block as supported', () => {
    const r = importReport(converterDoEditor(agentFlow(), 'f'));
    expect(r.naoSuportado).toEqual({});
    expect(r.actions).toMatchObject({ ForwardToAgent: 1, KnowledgeBaseConsult: 1 });
  });
});

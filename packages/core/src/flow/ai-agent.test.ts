import { describe, expect, it } from 'vitest';
import {
  AGENT_HANDOFF_TYPE,
  VARIABLE_OF_AGENT_FORWARDING,
  agentMemoryKey,
  agentProvider,
  agentSettings,
  agentToolbox,
  trimAgentMemory,
  type AgentMessage,
  type AgentModelRequest,
  type AgentModelResponse,
} from './ai-agent.js';
import { AI_AGENT_VARIABLES_KEY, createInbound, getVariable, type Context, type OutputMessage } from './context.js';
import { converterDoEditor, importReport, type ExportDoEditor } from './editor.js';
import { processInbound } from './manager.js';
import type { FlowBlip } from './modelos.js';

const AGENT = 'ai-agent:0f1e2d3c';
const statusIs = (value: string) => ({
  source: 'context',
  variable: VARIABLE_OF_AGENT_FORWARDING,
  comparison: 'equals',
  values: [value],
});

/** Invented agent block in the Builder editor format (no Blip content copied). */
function editorFlow(overrides: Record<string, unknown> = {}): ExportDoEditor {
  return {
    flow: {
      inicio: {
        id: 'inicio',
        root: true,
        $contentActions: [{ input: { bypass: false } }],
        $conditionOutputs: [],
        $defaultOutput: { stateId: AGENT },
      },
      [AGENT]: {
        id: AGENT,
        $title: 'Agente de cadastro',
        $enteringCustomActions: [
          {
            type: 'ForwardToAgent',
            settings: {
              model: { provider: 'openai', model: 'gpt-4.1', maxTokens: 500, temperature: 0.3 },
              prompt: [
                { role: 'system', content: 'Você coleta o e-mail de {{contact.name}}.' },
                { role: 'short-term-memory', config: { length: 10 } },
              ],
              handoffs: [
                { name: 'dados_coletados', description: 'O e-mail foi confirmado', parameters: { email: 'E-mail confirmado' } },
              ],
              output: { forward: { enabled: true }, variable: { enabled: true, name: 'respostaAgente' } },
              ...overrides,
            },
          },
        ],
        $contentActions: [{ input: { bypass: false, conditions: [statusIs('Success')] } }],
        $conditionOutputs: [
          { stateId: 'erro', conditions: [statusIs('Error')] },
          {
            stateId: 'final',
            conditions: [
              { source: 'context', variable: 'input.content@content.type', comparison: 'equals', values: [AGENT_HANDOFF_TYPE] },
              { source: 'context', variable: 'input.content@content.value.name', comparison: 'equals', values: ['dados_coletados'] },
            ],
          },
        ],
        $defaultOutput: { stateId: AGENT },
        $localCustomActions: [
          {
            $id: 'acao-1',
            $title: 'salvar e-mail',
            $description: 'Guarda o e-mail informado pelo cliente',
            $inputSchema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
            type: 'SetVariable',
            settings: { variable: 'email', value: '{{aiagent.parameters@email}}' },
          },
        ],
        $afterStateChangedActions: [{ type: 'LeavingFromAgent', settings: {} }],
      },
      final: {
        id: 'final',
        $contentActions: [
          { action: { type: 'SendMessage', settings: { type: 'text/plain', content: 'Fim: {{email}} / {{aiagent.parameters@email}}' } } },
          { input: { bypass: false } },
        ],
        $defaultOutput: { stateId: 'inicio' },
      },
      erro: {
        id: 'erro',
        $contentActions: [
          { action: { type: 'SendMessage', settings: { type: 'text/plain', content: 'Falhou: {{aiagent.errorCode}}' } } },
          { input: { bypass: false } },
        ],
        $defaultOutput: { stateId: 'inicio' },
      },
    },
  };
}

type Script = (request: AgentModelRequest, call: number) => AgentModelResponse;

function harness(flow: FlowBlip, script: Script | null) {
  const sent: OutputMessage[] = [];
  const requests: AgentModelRequest[] = [];
  const variables: Record<string, string> = {};
  const run = async (text: string, id = `m-${requests.length}-${sent.length}`): Promise<Context> => {
    const c: Context = {
      user: 'contato-1',
      flow,
      inbound: createInbound({ id, tipo: 'text/plain', conteudo: text }),
      variables,
      inboundContext: new Map(),
      contact: { name: 'Ana' },
      services: {
        send: async (m) => { sent.push(m); },
        forwardForAttendance: async () => ({ id: 't' }),
        registerEvent: async () => {},
        ...(script
          ? {
              callAgentModel: async (request: AgentModelRequest) => {
                // Deep copy: the engine keeps appending to the same memory array.
                requests.push(JSON.parse(JSON.stringify(request)) as AgentModelRequest);
                return script(request, requests.length);
              },
            }
          : {}),
      },
    };
    await processInbound(c);
    return c;
  };
  return { sent, requests, variables, run };
}

const reply = (text: string | null, toolCalls: AgentModelResponse['toolCalls'] = []): AgentModelResponse => ({
  text, toolCalls, stopReason: toolCalls.length ? 'tool_use' : 'end', model: 'gpt-4.1',
});

describe('agent settings', () => {
  it('reads provider, model, limits, prompt, memory and output from the Builder settings', () => {
    const s = agentSettings({
      model: { provider: 'blip', model: 'gpt-5-mini', maxTokens: 999_999, temperature: 0.7, apiKeySecret: 'minha_chave' },
      prompt: [{ role: 'system', content: 'A' }, { role: 'system', content: 'B' }, { role: 'short-term-memory', config: { length: 500 } }],
      output: { forward: { enabled: false }, variable: { enabled: true, name: 'saida' } },
    });
    expect(s).toMatchObject({
      provider: 'openai', model: 'gpt-5-mini', maxTokens: 8192, temperature: 0.7, apiKeySecret: 'minha_chave',
      system: 'A\n\nB', memoryLength: 100, forward: false, outputVariable: 'saida',
    });
    expect(agentSettings(null)).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5', maxTokens: 1024, memoryLength: 0, forward: true });
    expect(agentProvider('anthropic', 'gpt-4.1')).toBe('anthropic');
    expect(agentProvider(undefined, 'claude-opus-5')).toBe('anthropic');
    expect(agentProvider(undefined, 'o4-mini')).toBe('openai');
  });

  it('builds tools from local actions and handoffs with provider-safe unique names', () => {
    const flow = converterDoEditor(editorFlow(), 'f');
    const state = flow.states.find((s) => s.id === AGENT)!;
    const box = agentToolbox(state, agentSettings(state.inputActions![0]!.settings as Record<string, unknown>));
    expect(box.tools.map((t) => t.name)).toEqual(['salvar_e-mail', 'handoff_dados_coletados']);
    expect(box.tools[0]).toMatchObject({
      description: 'Guarda o e-mail informado pelo cliente',
      inputSchema: { type: 'object', required: ['email'] },
    });
    expect(box.tools[1]!.inputSchema).toEqual({
      type: 'object', properties: { email: { type: 'string', description: 'E-mail confirmado' } },
    });
  });

  it('trims memory to whole turns within the limit', () => {
    const m: AgentMessage[] = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 't', arguments: {} }] },
      { role: 'tool', toolCallId: 'a', name: 't', content: 'ok' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: '2' },
      { role: 'assistant', content: 'r2' },
    ];
    expect(trimAgentMemory(m, 4)).toEqual(m.slice(4));
    expect(trimAgentMemory(m, 10)).toEqual(m);
  });
});

describe('ForwardToAgent in the engine (stubbed provider)', () => {
  it('answers, waits in the block, keeps memory, runs a tool and hands off through the named exit', async () => {
    const flow = converterDoEditor(editorFlow(), 'fluxo-agente');
    const h = harness(flow, (_request, call) => {
      if (call === 1) return reply('Olá Ana! Qual é o seu e-mail?');
      if (call === 2) return reply(null, [{ id: 'c1', name: 'salvar_e-mail', arguments: { email: 'ana@exemplo.test' } }]);
      if (call === 3) return reply('Confirma ana@exemplo.test?');
      return reply('Perfeito.', [{ id: 'c2', name: 'handoff_dados_coletados', arguments: { email: 'ana@exemplo.test' } }]);
    });

    // The root consumes the first message and the agent answers it right away.
    await h.run('quero me cadastrar');
    expect(h.sent.map((m) => m.conteudo)).toEqual(['Olá Ana! Qual é o seu e-mail?']);
    expect(h.variables[`stateId@fluxo-agente`]).toBe(AGENT);
    expect(h.variables[VARIABLE_OF_AGENT_FORWARDING]).toBe('Success');
    expect(h.requests[0]).toMatchObject({
      provider: 'openai', model: 'gpt-4.1', maxTokens: 500, temperature: 0.3, apiKeySecret: null,
      system: 'Você coleta o e-mail de Ana.',
      messages: [{ role: 'user', content: 'quero me cadastrar' }],
    });

    await h.run('ana@exemplo.test');
    expect(h.variables['email']).toBe('ana@exemplo.test');
    // Call 3 sees the memory: previous turn, the tool call and its result.
    const third = h.requests[2]!;
    expect(third.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'tool']);
    expect(JSON.parse((third.messages[4] as { content: string }).content)).toEqual({
      status: 'ok', variables: { email: 'ana@exemplo.test' },
    });
    expect(h.variables['respostaAgente']).toBe('Confirma ana@exemplo.test?');

    const c = await h.run('sim');
    expect(h.sent.map((m) => m.conteudo)).toEqual([
      'Olá Ana! Qual é o seu e-mail?',
      'Confirma ana@exemplo.test?',
      'Perfeito.',
      'Fim: ana@exemplo.test / ana@exemplo.test',
    ]);
    expect(h.variables['stateId@fluxo-agente']).toBe('final');
    // LeavingFromAgent dropped the conversation and the status; aiagent.* stays readable.
    expect(h.variables[agentMemoryKey(AGENT)]).toBeUndefined();
    expect(h.variables[VARIABLE_OF_AGENT_FORWARDING]).toBeUndefined();
    await expect(getVariable(c, 'aiagent.name')).resolves.toBe('dados_coletados');
    await expect(getVariable(c, 'aiagent.agentResponse')).resolves.toBe('["Perfeito."]');
    await expect(getVariable(c, 'aiAgent.redirect')).resolves.toBe('handoff');
    await expect(getVariable(c, 'aiagent.message@content')).resolves.toBe('Perfeito.');
    await expect(getVariable(c, 'aiagent.toolCall_id')).resolves.toBe('c2');
    await expect(getVariable(c, 'aiagent.userMessage')).resolves.toBe('sim');
    expect(h.variables[AI_AGENT_VARIABLES_KEY]).toBeDefined();
  });

  it('a provider failure takes the Error exit with aiagent.errorCode, never throwing', async () => {
    const flow = converterDoEditor(editorFlow(), 'f2');
    const h = harness(flow, () => { throw new Error('401 chave inválida'); });
    await h.run('olá');
    expect(h.sent.map((m) => m.conteudo)).toEqual(['Falhou: model_error']);
    expect(h.variables['stateId@f2']).toBe('erro');
  });

  it('without an agent service the block fails to its Error exit', async () => {
    const flow = converterDoEditor(editorFlow(), 'f3');
    const h = harness(flow, null);
    await h.run('olá');
    expect(h.sent.map((m) => m.conteudo)).toEqual(['Falhou: unavailable']);
  });

  it('a failing tool returns the error to the model instead of failing the block', async () => {
    const flow = converterDoEditor(editorFlow(), 'f4');
    const state = flow.states.find((s) => s.id === AGENT)!;
    state.localCustomActions = [{ ...state.localCustomActions![0]!, type: 'Redirect', settings: {} }];
    const h = harness(flow, (_r, call) =>
      call === 1 ? reply(null, [{ id: 'x', name: 'salvar_e-mail', arguments: {} }]) : reply('Não consegui.'),
    );
    await h.run('salve');
    const tool = h.requests[1]!.messages.at(-1) as Extract<AgentMessage, { role: 'tool' }>;
    expect(tool).toMatchObject({ role: 'tool', toolCallId: 'x', isError: true });
    expect(h.sent.map((m) => m.conteudo)).toEqual(['Não consegui.']);
    expect(h.variables['stateId@f4']).toBe(AGENT);
  });

  it('stops a tool loop after the call limit', async () => {
    const flow = converterDoEditor(editorFlow(), 'f5');
    const h = harness(flow, () => reply(null, [{ id: 'y', name: 'salvar_e-mail', arguments: { email: 'a@b.c' } }]));
    await h.run('loop');
    expect(h.requests).toHaveLength(6);
    expect(h.sent.map((m) => m.conteudo)).toEqual(['Falhou: too_many_tool_calls']);
  });

  it('without short-term memory each input is sent alone', async () => {
    const flow = converterDoEditor(editorFlow({ prompt: [{ role: 'system', content: 'S' }] }), 'f6');
    const h = harness(flow, () => reply('ok'));
    await h.run('um');
    await h.run('dois');
    expect(h.requests[1]!.messages).toEqual([{ role: 'user', content: 'dois' }]);
    expect(h.variables[agentMemoryKey(AGENT)]).toBeUndefined();
  });
});

describe('import report', () => {
  it('counts the agent block and its tools as supported', () => {
    const r = importReport(converterDoEditor(editorFlow(), 'f'));
    expect(r.naoSuportado).toEqual({});
    expect(r.semEfeito).toEqual({});
    expect(r.actions).toMatchObject({ ForwardToAgent: 1, LeavingFromAgent: 1, SetVariable: 1 });
  });
});

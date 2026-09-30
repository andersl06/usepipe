import { describe, expect, it } from 'vitest';
import type { AgentModelRequest } from '@pipe/core';
import { agentModelService, stubAgentModel } from '../src/domain/agent-model.js';

/**
 * P14: the API side of the agent's model call, without database or network. The key comes from the
 * flow secret the block names (or the provider default), goes only to the provider call, and never
 * appears in an error.
 */

const KEY = 'sk-INVENTED-unit-7777';

function request(overrides: Partial<AgentModelRequest> = {}): AgentModelRequest {
  return {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    system: '',
    messages: [{ role: 'user', content: 'oi' }],
    tools: [{ name: 'handoff_fim', description: '', inputSchema: { type: 'object', properties: {} } }],
    maxTokens: 100,
    temperature: null,
    apiKeySecret: null,
    ...overrides,
  };
}

describe('agentModelService', () => {
  it('reads the provider default secret and passes the key only to the provider call', async () => {
    const asked: string[] = [];
    const keys: string[] = [];
    const service = agentModelService({
      loadSecret: async (name) => { asked.push(name); return KEY; },
      stubWhenNoKey: false,
      call: async (_request, options) => {
        keys.push(options.apiKey);
        return { text: 'ok', toolCalls: [], stopReason: 'end', model: 'm' };
      },
    });
    await service(request());
    await service(request({ provider: 'openai', model: 'gpt-4.1' }));
    await service(request({ apiKeySecret: 'chave_do_cliente' }));
    expect(asked).toEqual(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'chave_do_cliente']);
    expect(keys).toEqual([KEY, KEY, KEY]);
  });

  it('masks the key in provider errors', async () => {
    const service = agentModelService({
      loadSecret: async () => KEY,
      stubWhenNoKey: false,
      call: async () => { throw new Error(`401: chave ${KEY} inválida`); },
    });
    const error: unknown = await service(request()).catch((e: unknown) => e);
    expect((error as Error).message).toBe('401: chave ******** inválida');
  });

  it('without a key: production fails, the test run answers with the stub', async () => {
    const production = agentModelService({ loadSecret: async () => null, stubWhenNoKey: false });
    await expect(production(request())).rejects.toThrow("A variável sensível 'ANTHROPIC_API_KEY'");
    const testRun = agentModelService({ loadSecret: async () => '  ', stubWhenNoKey: true });
    const reply = await testRun(request());
    expect(reply.text).toContain('[Simulação]');
    expect(reply.toolCalls).toEqual([]);
  });

  it('the stub calls a handoff on /handoff <name>', () => {
    const reply = stubAgentModel(request({ messages: [{ role: 'user', content: '/handoff FIM' }] }));
    expect(reply.toolCalls.map((c) => c.name)).toEqual(['handoff_fim']);
    expect(stubAgentModel(request({ messages: [{ role: 'user', content: '/handoff outro' }] })).toolCalls).toEqual([]);
  });
});

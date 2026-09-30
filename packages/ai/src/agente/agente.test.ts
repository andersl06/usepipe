import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import {
  AgentProviderError,
  anthropicAcceptsTemperature,
  callAgentModel,
  openAiAcceptsTemperature,
  type AgentModelRequest,
} from './agente.js';

const KEY = 'chave-de-teste-inventada';

function request(overrides: Partial<AgentModelRequest> = {}): AgentModelRequest {
  return {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    system: 'Seja breve.',
    maxTokens: 500,
    temperature: 0.7,
    tools: [{ name: 'salvar', description: 'Salva', inputSchema: { type: 'object', properties: { x: { type: 'string' } } } }],
    messages: [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'vou salvar', toolCalls: [{ id: 't1', name: 'salvar', arguments: { x: '1' } }] },
      { role: 'tool', toolCallId: 't1', name: 'salvar', content: '{"status":"ok"}' },
      { role: 'user', content: 'e agora?' },
    ],
    ...overrides,
  };
}

describe('Anthropic', () => {
  it('maps messages, tools and limits, and reads text and tool calls back', async () => {
    const bodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const response = await callAgentModel(request(), {
      apiKey: KEY,
      anthropic: {
        create: async (body) => {
          bodies.push(body);
          return {
            id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
            content: [
              { type: 'thinking', thinking: '', signature: 'sig' },
              { type: 'text', text: 'Pronto.', citations: null },
              { type: 'tool_use', id: 't2', name: 'salvar', input: { x: '2' } },
            ],
            stop_reason: 'tool_use', stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
          } as unknown as Anthropic.Message;
        },
      },
    });
    const body = bodies[0]!;
    expect(body).toMatchObject({ model: 'claude-sonnet-5', max_tokens: 4096, system: 'Seja breve.', output_config: { effort: 'low' } });
    expect(body).not.toHaveProperty('temperature');
    expect(body.tools).toEqual([{ name: 'salvar', description: 'Salva', input_schema: { type: 'object', properties: { x: { type: 'string' } } } }]);
    expect(body.messages).toEqual([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: [{ type: 'text', text: 'vou salvar' }, { type: 'tool_use', id: 't1', name: 'salvar', input: { x: '1' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"status":"ok"}' }] },
      { role: 'user', content: 'e agora?' },
    ]);
    expect(response).toMatchObject({
      text: 'Pronto.',
      toolCalls: [{ id: 't2', name: 'salvar', arguments: { x: '2' } }],
      stopReason: 'tool_use',
      usage: { inputTokens: 10, outputTokens: 5 },
      raw: { provider: 'anthropic', model: 'claude-sonnet-5' },
    });
  });

  it('replays its own raw blocks to the same model and sends temperature only where accepted', async () => {
    const bodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const raw = [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'a' }];
    await callAgentModel(
      request({
        model: 'claude-haiku-4-5',
        messages: [
          { role: 'user', content: 'oi' },
          { role: 'assistant', content: 'a', raw: { provider: 'anthropic', model: 'claude-haiku-4-5', content: raw } },
          { role: 'user', content: 'de novo' },
        ],
      }),
      {
        apiKey: KEY,
        anthropic: {
          create: async (body) => {
            bodies.push(body);
            return { content: [], stop_reason: 'end_turn', model: 'claude-haiku-4-5', usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Message;
          },
        },
      },
    );
    expect(bodies[0]).toMatchObject({ temperature: 0.7, max_tokens: 500 });
    expect(bodies[0]).not.toHaveProperty('output_config');
    expect(bodies[0]!.messages[1]).toEqual({ role: 'assistant', content: raw });
    expect(anthropicAcceptsTemperature('claude-opus-4-6')).toBe(true);
    expect(anthropicAcceptsTemperature('claude-opus-4-7')).toBe(false);
    expect(anthropicAcceptsTemperature('claude-sonnet-5-5')).toBe(false);
  });
});

describe('OpenAI', () => {
  it('posts Chat Completions with the key only in the header and reads tool calls back', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        model: 'gpt-4.1',
        choices: [{
          finish_reason: 'tool_calls',
          message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'salvar', arguments: '{"x":"3"}' } }] },
        }],
        usage: { prompt_tokens: 7, completion_tokens: 3 },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const response = await callAgentModel(request({ provider: 'openai', model: 'gpt-4.1' }), { apiKey: KEY, fetch: fakeFetch });
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect((calls[0]!.init.headers as Record<string, string>)['authorization']).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(body).toMatchObject({ model: 'gpt-4.1', max_completion_tokens: 500, temperature: 0.7 });
    expect(body['messages']).toEqual([
      { role: 'system', content: 'Seja breve.' },
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'vou salvar', tool_calls: [{ id: 't1', type: 'function', function: { name: 'salvar', arguments: '{"x":"1"}' } }] },
      { role: 'tool', tool_call_id: 't1', content: '{"status":"ok"}' },
      { role: 'user', content: 'e agora?' },
    ]);
    expect(body['tools']).toEqual([{ type: 'function', function: { name: 'salvar', description: 'Salva', parameters: { type: 'object', properties: { x: { type: 'string' } } } } }]);
    expect(response).toEqual({
      text: null,
      toolCalls: [{ id: 'c1', name: 'salvar', arguments: { x: '3' } }],
      stopReason: 'tool_use',
      model: 'gpt-4.1',
      usage: { inputTokens: 7, outputTokens: 3 },
    });
    expect(openAiAcceptsTemperature('gpt-5-mini')).toBe(false);
  });

  it('turns an HTTP error into AgentProviderError without the key', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 })) as unknown as typeof fetch;
    const error = await callAgentModel(request({ provider: 'openai', model: 'gpt-4.1' }), { apiKey: KEY, fetch: fakeFetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentProviderError);
    expect((error as AgentProviderError).status).toBe(401);
    expect((error as Error).message).not.toContain(KEY);
  });

  it('refuses an empty key before any network call', async () => {
    await expect(callAgentModel(request(), { apiKey: ' ' })).rejects.toThrow('A chave do provedor de IA está vazia.');
  });
});

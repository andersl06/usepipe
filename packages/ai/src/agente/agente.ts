/**
 * One model call of the flow's AI agent block (P14), on the provider the block chose (D-58):
 * Anthropic through the official SDK already in this package, OpenAI through its Chat Completions
 * REST endpoint with `fetch` (no new package). The loop, tools and memory live in `@pipe/core`
 * (`ai-agent.ts`); this module only translates one request/response per provider.
 *
 * The key is an argument, never read from the environment here: the `api` decrypts the flow's secret
 * right before the call. Errors never quote it (no request headers are echoed).
 *
 * The types below mirror `@pipe/core`'s `AgentModelRequest`/`AgentModelResponse` structurally;
 * core is pure and cannot import this package.
 */

import Anthropic from '@anthropic-ai/sdk';

export type AgentProvider = 'anthropic' | 'openai';

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentRawContent {
  provider: AgentProvider;
  model: string;
  content: unknown;
}

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AgentToolCall[]; raw?: AgentRawContent }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentModelRequest {
  provider: AgentProvider;
  model: string;
  system: string;
  messages: AgentMessage[];
  tools: AgentTool[];
  maxTokens: number;
  temperature: number | null;
}

export interface AgentModelResponse {
  text: string | null;
  toolCalls: AgentToolCall[];
  stopReason: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
  raw?: AgentRawContent;
}

/** The subset of the Anthropic client this module uses; tests inject a stub. */
export interface AnthropicMessages {
  create(
    body: Anthropic.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<Anthropic.Message>;
}

export interface AgentCallOptions {
  apiKey: string;
  signal?: AbortSignal;
  /** Anthropic: replaces `new Anthropic({ apiKey }).messages`. */
  anthropic?: AnthropicMessages;
  /** OpenAI: replaces the global `fetch`. */
  fetch?: typeof fetch;
  /** OpenAI base URL, `https://api.openai.com/v1` by default. */
  openAiBaseUrl?: string;
}

export class AgentProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AgentProviderError';
  }
}

export async function callAgentModel(
  request: AgentModelRequest,
  options: AgentCallOptions,
): Promise<AgentModelResponse> {
  if (!options.apiKey.trim()) throw new AgentProviderError('A chave do provedor de IA está vazia.');
  return request.provider === 'openai' ? callOpenAi(request, options) : callAnthropic(request, options);
}

// --- Anthropic ---

/**
 * Models whose sampling parameters still accept `temperature`; the Claude 5 generation rejects it
 * (400), so a Blip-style temperature is dropped there.
 */
export function anthropicAcceptsTemperature(model: string): boolean {
  return /^claude-(3|haiku-4|sonnet-4|opus-4-[0-6](?!\d))/.test(model);
}

/** Claude 5 generation: thinking is on by default, so leave room for it and ask for low effort. */
const thinkingModel = (model: string): boolean => /^claude-(opus|sonnet|fable|mythos)-5/.test(model);
const MIN_TOKENS_WITH_THINKING = 4_096;

function anthropicMessages(request: AgentModelRequest): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let toolResults: Anthropic.ToolResultBlockParam[] = [];
  const flushTools = (): void => {
    if (toolResults.length) out.push({ role: 'user', content: toolResults });
    toolResults = [];
  };
  for (const m of request.messages) {
    if (m.role === 'tool') {
      toolResults.push({
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: m.content,
        ...(m.isError ? { is_error: true } : {}),
      });
      continue;
    }
    flushTools();
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
      continue;
    }
    // The same provider and model get their own blocks back unchanged (thinking included).
    if (m.raw && m.raw.provider === 'anthropic' && m.raw.model === request.model && Array.isArray(m.raw.content)) {
      out.push({ role: 'assistant', content: m.raw.content as Anthropic.ContentBlockParam[] });
      continue;
    }
    const content: Anthropic.ContentBlockParam[] = [];
    if (m.content.trim()) content.push({ type: 'text', text: m.content });
    for (const call of m.toolCalls ?? []) {
      content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments });
    }
    if (content.length) out.push({ role: 'assistant', content });
  }
  flushTools();
  return out;
}

const ANTHROPIC_STOP: Record<string, string> = { end_turn: 'end', stop_sequence: 'end', tool_use: 'tool_use' };

async function callAnthropic(request: AgentModelRequest, options: AgentCallOptions): Promise<AgentModelResponse> {
  const messages = options.anthropic ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 2 }).messages;
  const thinking = thinkingModel(request.model);
  let response: Anthropic.Message;
  try {
    response = await messages.create(
      {
        model: request.model,
        max_tokens: thinking ? Math.max(request.maxTokens, MIN_TOKENS_WITH_THINKING) : request.maxTokens,
        ...(request.system ? { system: request.system } : {}),
        messages: anthropicMessages(request),
        ...(request.tools.length
          ? {
              tools: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
              })),
            }
          : {}),
        ...(request.temperature !== null && anthropicAcceptsTemperature(request.model)
          ? { temperature: request.temperature }
          : {}),
        // A chat turn: low effort answers faster and costs less (same default as the rest of @pipe/ai).
        ...(thinking ? { output_config: { effort: 'low' as const } } : {}),
      },
      options.signal ? { signal: options.signal } : {},
    );
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new AgentProviderError(`Anthropic respondeu ${error.status ?? 'sem status'}: ${error.message}`, error.status);
    }
    throw error;
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  const toolCalls = response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, arguments: (b.input ?? {}) as Record<string, unknown> }));
  const stop = response.stop_reason ?? 'end';
  return {
    text: text || null,
    toolCalls,
    stopReason: ANTHROPIC_STOP[stop] ?? stop,
    model: response.model ?? request.model,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    raw: { provider: 'anthropic', model: request.model, content: response.content },
  };
}

// --- OpenAI (Chat Completions over fetch) ---

/** Reasoning models (o-series, gpt-5) reject a custom temperature. */
export function openAiAcceptsTemperature(model: string): boolean {
  return /^gpt-(4|3\.5)/.test(model);
}

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

function openAiMessages(request: AgentModelRequest): unknown[] {
  const out: unknown[] = [];
  if (request.system) out.push({ role: 'system', content: request.system });
  for (const m of request.messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    else {
      const calls: OpenAiToolCall[] = (m.toolCalls ?? []).map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
      }));
      if (!m.content.trim() && calls.length === 0) continue;
      out.push({ role: 'assistant', content: m.content.trim() ? m.content : null, ...(calls.length ? { tool_calls: calls } : {}) });
    }
  }
  return out;
}

const OPENAI_STOP: Record<string, string> = {
  stop: 'end',
  tool_calls: 'tool_use',
  function_call: 'tool_use',
  length: 'max_tokens',
  content_filter: 'refusal',
};

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function callOpenAi(request: AgentModelRequest, options: AgentCallOptions): Promise<AgentModelResponse> {
  const doFetch = options.fetch ?? fetch;
  const base = (options.openAiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const body = {
    model: request.model,
    messages: openAiMessages(request),
    max_completion_tokens: request.maxTokens,
    ...(request.tools.length
      ? {
          tools: request.tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
        }
      : {}),
    ...(request.temperature !== null && openAiAcceptsTemperature(request.model) ? { temperature: request.temperature } : {}),
  };
  const response = await doFetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify(body),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = payload?.['error'] as { message?: unknown } | undefined;
    const detail = typeof error?.message === 'string' ? error.message : response.statusText;
    throw new AgentProviderError(`OpenAI respondeu ${response.status}: ${detail}`, response.status);
  }
  const choice = (payload?.['choices'] as { message?: Record<string, unknown>; finish_reason?: string }[] | undefined)?.[0];
  const message = choice?.message ?? {};
  if (typeof message['refusal'] === 'string' && message['refusal']) {
    return { text: null, toolCalls: [], stopReason: 'refusal', model: request.model };
  }
  const calls = (Array.isArray(message['tool_calls']) ? message['tool_calls'] : []) as OpenAiToolCall[];
  const usage = payload?.['usage'] as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  const finish = choice?.finish_reason ?? 'stop';
  const text = typeof message['content'] === 'string' ? message['content'].trim() : '';
  return {
    text: text || null,
    toolCalls: calls
      .filter((c) => c?.type === 'function' && c.function)
      .map((c) => ({ id: c.id, name: c.function.name, arguments: parseArguments(c.function.arguments) })),
    stopReason: OPENAI_STOP[finish] ?? finish,
    model: typeof payload?.['model'] === 'string' ? payload['model'] : request.model,
    ...(usage ? { usage: { inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 } } : {}),
  };
}

/**
 * Blip "Agente de IA" block (P14): `ForwardToAgent` on entering, `LeavingFromAgent` after the
 * block is left. Blip's server actions are not in the SDK; the behaviour follows the editor block
 * the Builder bundle creates (format only, D-33):
 *
 * - block id `ai-agent:<uuid>`; `$enteringCustomActions` = `ForwardToAgent` with
 *   `settings.{model{provider,model,maxTokens,temperature}, prompt[], handoffs[], output, tools}`;
 *   `$afterStateChangedActions` = `LeavingFromAgent`;
 * - the input waits only while `agent_forwardToAgentState_status` is `Success`;
 * - exits: status `Error` → fallback; a handoff exit tests `input.content@content.type` equal to
 *   `application/vnd.iris.aiplatform.handoff+json` and `input.content@content.value.name` equal to
 *   the handoff name; the default exit returns to the block itself;
 * - tools are the block's `$localCustomActions` (`$title` = tool name, `$description`,
 *   `$inputSchema`), run through the engine's own action runner.
 *
 * In Blip the conversation goes to an external AI platform, which answers the customer and later
 * sends the handoff document back as a new input. Pipe has no such platform: `ForwardToAgent` runs
 * one agent turn over the current input (model call → tools → model …) through
 * `ServicosDoMotor.callAgentModel`, which the `api` implements for Anthropic and OpenAI (D-58). A
 * handoff replaces the current input with the handoff document and sets the status to `Handoff`
 * (a Pipe-only value), so the block does not wait and its handoff exit is taken in the same input.
 *
 * Provider keys never pass through here: `apiKeySecret` is only the NAME of a flow secret (P11),
 * resolved by the `api` next to the provider call.
 */

import type { AcaoDoMotor, Settings } from './actions.js';
import {
  AI_AGENT_VARIABLES_KEY,
  KEY_OF_STATE_CURRENT,
  contextGetVariable,
  createInbound,
  deleteVariable,
  setVariable,
  timeSpanSeconds,
  type Context,
} from './context.js';
import type { Acao, State } from './modelos.js';

// --- Provider-neutral model contract (the `api` maps it to each provider) ---

export type AgentProvider = 'anthropic' | 'openai';

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Opaque provider content of an assistant turn; the engine only stores it in the memory. */
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
  /** JSON Schema of the arguments; always `type: 'object'`. */
  inputSchema: Record<string, unknown>;
}

export interface AgentModelRequest {
  provider: AgentProvider;
  model: string;
  system: string;
  messages: AgentMessage[];
  tools: AgentTool[];
  maxTokens: number;
  /** Null = the provider default (recent Anthropic models reject a custom temperature). */
  temperature: number | null;
  /** Name of the flow secret holding the provider key; null = the provider's default name. */
  apiKeySecret: string | null;
}

export interface AgentModelResponse {
  text: string | null;
  toolCalls: AgentToolCall[];
  /** Provider stop reason, normalised: `end`, `tool_use`, `max_tokens`, `refusal` or other text. */
  stopReason: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
  /** The provider's own content, replayed unchanged to the same provider and model (thinking blocks). */
  raw?: AgentRawContent;
}

// --- Blip vocabulary ---

export const FORWARD_TO_AGENT = 'ForwardToAgent';
export const LEAVING_FROM_AGENT = 'LeavingFromAgent';
/** Variable the editor's agent block tests on its input and on its fallback exit. */
export const VARIABLE_OF_AGENT_FORWARDING = 'agent_forwardToAgentState_status';
export const AGENT_HANDOFF_TYPE = 'application/vnd.iris.aiplatform.handoff+json';
/** Pipe-only status: a handoff was chosen in this input, so the block must not wait. */
export const AGENT_STATUS_HANDOFF = 'Handoff';

/** Default model per provider when the block names none (`@pipe/ai` pins the Anthropic one). */
export const DEFAULT_AGENT_MODELS: Readonly<Record<AgentProvider, string>> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4.1',
};
/** Flow secret read for the key when the block names none. */
export const DEFAULT_AGENT_KEY_SECRETS: Readonly<Record<AgentProvider, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export const AGENT_LIMITS = {
  /** Model calls in one agent turn (each tool round is one more call). */
  maxModelCalls: 6,
  maxTokens: 8_192,
  defaultMaxTokens: 1_024,
  /** Messages kept in the short-term memory; Blip's editor default is 50. */
  maxMemoryMessages: 100,
  defaultMemoryMessages: 50,
  /** Serialized memory size per agent block and contact. */
  maxMemoryBytes: 32_768,
  /** A tool result returned to the model. */
  maxToolResultBytes: 4_096,
} as const;

/** Local actions that cannot be tools (Blip filters the agent and the knowledge consult). */
const NOT_TOOLS = new Set([FORWARD_TO_AGENT, LEAVING_FROM_AGENT, 'KnowledgeBaseConsult']);

export interface AgentHandoff {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentSettings {
  provider: AgentProvider;
  model: string;
  maxTokens: number;
  temperature: number | null;
  apiKeySecret: string | null;
  system: string;
  memoryLength: number;
  handoffs: AgentHandoff[];
  forward: boolean;
  outputVariable: string | null;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Provider from the setting, else from the model name, else Anthropic (Blip's `blip` included). */
export function agentProvider(provider: unknown, model: string | null): AgentProvider {
  const p = text(provider)?.toLowerCase();
  if (p === 'anthropic' || p === 'openai') return p;
  const m = model?.toLowerCase() ?? '';
  if (/^(gpt|o\d|chatgpt)/.test(m)) return 'openai';
  return 'anthropic';
}

/** Read `ForwardToAgent.settings` as the Builder writes them, with Pipe's limits. */
export function agentSettings(settings: Settings): AgentSettings {
  const s = settings ?? {};
  const model = obj(s['model']) ?? {};
  const modelName = text(model['model']);
  const provider = agentProvider(model['provider'], modelName);
  const maxTokens = Number(model['maxTokens']);
  const temperature = model['temperature'];
  const prompt = Array.isArray(s['prompt']) ? s['prompt'] : [];
  const system = prompt
    .map(obj)
    .filter((p): p is Record<string, unknown> => !!p && (p['role'] === 'system' || p['role'] === 'instructions'))
    .map((p) => text(p['content']))
    .filter((c): c is string => !!c)
    .join('\n\n');
  const memory = prompt.map(obj).find((p) => p?.['role'] === 'short-term-memory');
  const memoryLength = Number(obj(memory?.['config'])?.['length']);
  const handoffs = (Array.isArray(s['handoffs']) ? s['handoffs'] : [])
    .map(obj)
    .filter((h): h is Record<string, unknown> => !!h && !!text(h['name']))
    .map((h) => ({
      name: text(h['name'])!,
      description: text(h['description']) ?? '',
      parameters: obj(h['parameters']) ?? {},
    }));
  const output = obj(s['output']) ?? {};
  const forward = obj(output['forward']);
  const variable = obj(output['variable']);
  return {
    provider,
    model: modelName ?? DEFAULT_AGENT_MODELS[provider],
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0
      ? Math.min(Math.floor(maxTokens), AGENT_LIMITS.maxTokens)
      : AGENT_LIMITS.defaultMaxTokens,
    temperature: typeof temperature === 'number' && Number.isFinite(temperature) ? temperature : null,
    apiKeySecret: text(model['apiKeySecret']),
    system,
    memoryLength: !memory
      ? 0
      : Number.isFinite(memoryLength) && memoryLength > 0
        ? Math.min(Math.floor(memoryLength), AGENT_LIMITS.maxMemoryMessages)
        : AGENT_LIMITS.defaultMemoryMessages,
    handoffs,
    forward: forward ? forward['enabled'] !== false : true,
    outputVariable: variable?.['enabled'] === true ? text(variable['name']) : null,
  };
}

/** Tool names both providers accept: `^[a-zA-Z0-9_-]{1,64}$`. */
export function toolName(raw: string, taken: Set<string>): string {
  const base = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'ferramenta';
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base.slice(0, 60)}_${i}`;
  taken.add(name);
  return name;
}

/** A handoff's `parameters`: a JSON Schema object as is, or a map of name → description. */
function handoffSchema(parameters: Record<string, unknown>): Record<string, unknown> {
  if (parameters['type'] === 'object') return parameters;
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    const description = typeof value === 'string' ? value : text(obj(value)?.['description']) ?? '';
    properties[key] = { type: 'string', ...(description ? { description } : {}) };
  }
  return { type: 'object', properties };
}

function actionSchema(action: Acao): Record<string, unknown> {
  const schema = obj((action as unknown as Record<string, unknown>)['$inputSchema']);
  return schema && schema['type'] === 'object' ? schema : { type: 'object', properties: {} };
}

export interface AgentToolbox {
  tools: AgentTool[];
  /** Tool name → the local action it runs. */
  actions: Map<string, Acao>;
  /** Tool name → handoff. */
  handoffs: Map<string, AgentHandoff>;
}

/** The tools the model sees: the block's local actions, then one tool per handoff. */
export function agentToolbox(state: State | null | undefined, settings: AgentSettings): AgentToolbox {
  const taken = new Set<string>();
  const box: AgentToolbox = { tools: [], actions: new Map(), handoffs: new Map() };
  for (const action of state?.localCustomActions ?? []) {
    if (NOT_TOOLS.has(action.type)) continue;
    const raw = action as unknown as Record<string, unknown>;
    const title = text(raw['$title']) ?? action.type;
    const name = toolName(title, taken);
    box.actions.set(name, action);
    box.tools.push({
      name,
      description: text(raw['$description']) ?? `Executa a ação '${title}' do fluxo.`,
      inputSchema: actionSchema(action),
    });
  }
  for (const handoff of settings.handoffs) {
    const name = toolName(`handoff_${handoff.name}`, taken);
    box.handoffs.set(name, handoff);
    box.tools.push({
      name,
      description:
        `${handoff.description ? `${handoff.description}. ` : ''}` +
        'Chame esta ferramenta para encerrar a conversa com o agente e seguir o fluxo por esta saída.',
      inputSchema: handoffSchema(handoff.parameters),
    });
  }
  return box;
}

// --- `aiagent.*` variables and memory ---

/**
 * Fields Blip lists for the `aiagent` source (Builder variable library); Pipe fills the ones it has
 * (`skill_*`/`task_*` belong to Blip's AI platform and stay empty).
 */
export interface AgentVariables {
  /** "Lista de respostas geradas pela IA": JSON array of the texts of the last turn. */
  agentResponse?: string;
  /** "Código do erro que causou o redirecionamento". */
  errorCode?: string;
  /** "O envelope de mensagem enviado pela IA": `{type, content}` of its last message (or the error). */
  message?: string;
  /** "Nome da action cadastrada": the tool or handoff the model called. */
  name?: string;
  /** The arguments of that call, as JSON. */
  parameters?: string;
  /** "Indica o tipo de redirecionamento": `handoff` or `error`. */
  redirect?: string;
  toolCall_id?: string;
  userMessage?: string;
  userMessage_id?: string;
}

function readAgentVariables(context: Context): AgentVariables {
  try {
    return (obj(JSON.parse(context.variables[AI_AGENT_VARIABLES_KEY] ?? '{}')) ?? {}) as AgentVariables;
  } catch {
    return {};
  }
}

function writeAgentVariables(context: Context, patch: AgentVariables): void {
  const next = { ...readAgentVariables(context), ...patch };
  for (const [k, v] of Object.entries(next)) if (v === undefined) delete (next as Record<string, unknown>)[k];
  setVariable(context, AI_AGENT_VARIABLES_KEY, JSON.stringify(next));
}

export const agentMemoryKey = (stateId: string): string => `#aiagent-memory@${stateId}`;

const stateExpirationOf = (context: Context): number | undefined =>
  timeSpanSeconds(context.flow.configuration?.['builder:stateExpiration']) || undefined;

export function loadAgentMemory(context: Context, stateId: string): AgentMessage[] {
  const raw = contextGetVariable(context, agentMemoryKey(stateId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AgentMessage[]) : [];
  } catch {
    return [];
  }
}

/**
 * Keep the last `length` messages, cut at a plain user message so a tool result never starts
 * the memory without its call, and within `maxMemoryBytes`.
 */
export function trimAgentMemory(messages: AgentMessage[], length: number): AgentMessage[] {
  let kept = messages.slice(-length);
  const startsClean = (list: AgentMessage[]): AgentMessage[] => {
    const i = list.findIndex((m) => m.role === 'user');
    return i < 0 ? [] : list.slice(i);
  };
  kept = startsClean(kept);
  while (kept.length > 0 && JSON.stringify(kept).length > AGENT_LIMITS.maxMemoryBytes) {
    kept = startsClean(kept.slice(1));
  }
  return kept;
}

function saveAgentMemory(context: Context, stateId: string, messages: AgentMessage[], length: number): void {
  if (length <= 0) return;
  const kept = trimAgentMemory(messages, length);
  if (kept.length === 0) deleteVariable(context, agentMemoryKey(stateId));
  else setVariable(context, agentMemoryKey(stateId), JSON.stringify(kept), stateExpirationOf(context));
}

// --- The actions ---

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function currentState(context: Context): State | null {
  const id = context.inboundContext.get(KEY_OF_STATE_CURRENT);
  return context.flow.states.find((s) => s.id === id) ?? null;
}

/** The customer's input as the model reads it: text as is, any other document as JSON. */
function userText(context: Context): string {
  return context.inbound.serializedContent.trim();
}

/** Context variables a tool changed, for the model to read back (engine keys left out). */
function changedVariables(before: Record<string, string>, after: Record<string, string>): Record<string, string | null> {
  const changed: Record<string, string | null> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key.startsWith('#') || key.includes('@')) continue;
    if (before[key] !== after[key]) changed[key] = after[key] ?? null;
  }
  return changed;
}

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}…` : s);

function handOff(context: Context, handoff: AgentHandoff, args: Record<string, unknown>): void {
  const original = context.inbound.message;
  context.inbound = createInbound({
    id: `${original.id}:handoff`,
    tipo: AGENT_HANDOFF_TYPE,
    conteudo: { content: { type: AGENT_HANDOFF_TYPE, value: { name: handoff.name, parameters: args } } },
    ...(original.de ? { de: original.de } : {}),
    ...(original.para ? { para: original.para } : {}),
  });
  writeAgentVariables(context, {
    name: handoff.name,
    redirect: 'handoff',
    parameters: JSON.stringify(args),
  });
  setVariable(context, VARIABLE_OF_AGENT_FORWARDING, AGENT_STATUS_HANDOFF);
}

const envelope = (content: string): string => JSON.stringify({ type: 'text/plain', content });

function fail(context: Context, errorCode: string, message: string): void {
  writeAgentVariables(context, { errorCode, redirect: 'error', message: envelope(message) });
  setVariable(context, VARIABLE_OF_AGENT_FORWARDING, 'Error');
}

/** The texts of this turn: `aiagent.agentResponse`/`message` and the block's output variable. */
function recordAnswers(context: Context, answers: string[], outputVariable: string | null): void {
  writeAgentVariables(context, {
    agentResponse: JSON.stringify(answers),
    ...(answers.length ? { message: envelope(answers.at(-1)!) } : {}),
  });
  if (outputVariable) setVariable(context, outputVariable, answers.join('\n\n'));
}

/**
 * `ForwardToAgent`: one agent turn over the current input. Failures never throw: like
 * `ForwardToDesk`, they become the status `Error` (the block's fallback exit) plus
 * `aiagent.errorCode`/`aiagent.message`.
 */
export const forwardToAgent: AcaoDoMotor = {
  tipo: FORWARD_TO_AGENT,
  async executar(context, settings, prazo) {
    // The handoff document that already chose an exit is not a customer message: without a
    // matching exit the block falls back to itself and simply waits for the next input.
    if (context.inbound.message.tipo === AGENT_HANDOFF_TYPE) {
      setVariable(context, VARIABLE_OF_AGENT_FORWARDING, 'Success');
      return;
    }
    const state = currentState(context);
    const stateId = state?.id ?? 'agente';
    const config = agentSettings(settings);
    const box = agentToolbox(state, config);
    const memory = config.memoryLength > 0 ? loadAgentMemory(context, stateId) : [];
    const input = userText(context);
    writeAgentVariables(context, {
      userMessage: input,
      userMessage_id: context.inbound.message.id,
      errorCode: undefined,
      message: undefined,
      name: undefined,
      parameters: undefined,
      redirect: undefined,
      toolCall_id: undefined,
    });
    if (input) memory.push({ role: 'user', content: input });
    if (memory.length === 0) memory.push({ role: 'user', content: '(início da conversa)' });

    if (!context.services.callAgentModel) {
      fail(context, 'unavailable', 'O agente de IA não está disponível neste fluxo.');
      return;
    }

    const answers: string[] = [];
    try {
      for (let call = 0; ; call++) {
        if (call >= AGENT_LIMITS.maxModelCalls) {
          fail(context, 'too_many_tool_calls', `O agente passou de ${AGENT_LIMITS.maxModelCalls} chamadas ao modelo nesta mensagem.`);
          saveAgentMemory(context, stateId, memory, config.memoryLength);
          return;
        }
        const response = await context.services.callAgentModel(
          {
            provider: config.provider,
            model: config.model,
            system: config.system,
            messages: memory,
            tools: box.tools,
            maxTokens: config.maxTokens,
            temperature: config.temperature,
            apiKeySecret: config.apiKeySecret,
          },
          prazo?.signal,
        );
        prazo?.signal.throwIfAborted();
        if (response.stopReason === 'refusal') {
          fail(context, 'refusal', 'O modelo recusou responder a esta mensagem.');
          return;
        }
        const said = response.text?.trim() ?? '';
        memory.push({
          role: 'assistant',
          content: said,
          ...(response.toolCalls.length ? { toolCalls: response.toolCalls } : {}),
          ...(response.raw ? { raw: response.raw } : {}),
        });
        if (said) {
          answers.push(said);
          if (config.forward) await context.services.send({ tipo: 'text/plain', conteudo: said }, prazo?.signal);
        }
        if (response.toolCalls.length === 0) break;

        const handoffCall = response.toolCalls.find((c) => box.handoffs.has(c.name));
        if (handoffCall) {
          // The memory ends with a call nobody answered; it restarts clean on the next visit.
          deleteVariable(context, agentMemoryKey(stateId));
          recordAnswers(context, answers, config.outputVariable);
          writeAgentVariables(context, { toolCall_id: handoffCall.id });
          handOff(context, box.handoffs.get(handoffCall.name)!, handoffCall.arguments);
          return;
        }
        // Tool results go back in one message per call, in call order.
        for (const toolCall of response.toolCalls) {
          memory.push(await runTool(context, box, toolCall, prazo?.runActions));
        }
      }
    } catch (error) {
      if (prazo?.signal.aborted) throw error;
      fail(context, 'model_error', messageOf(error));
      return;
    }

    saveAgentMemory(context, stateId, memory, config.memoryLength);
    recordAnswers(context, answers, config.outputVariable);
    setVariable(context, VARIABLE_OF_AGENT_FORWARDING, 'Success');
  },
};

async function runTool(
  context: Context,
  box: AgentToolbox,
  toolCall: AgentToolCall,
  runActions: ((actions: readonly Acao[]) => Promise<void>) | undefined,
): Promise<AgentMessage> {
  const reply = (content: string, isError?: boolean): AgentMessage => ({
    role: 'tool',
    toolCallId: toolCall.id,
    name: toolCall.name,
    content: clip(content, AGENT_LIMITS.maxToolResultBytes),
    ...(isError ? { isError: true } : {}),
  });
  const action = box.actions.get(toolCall.name);
  if (!action) return reply(`A ferramenta '${toolCall.name}' não existe.`, true);
  if (!runActions) return reply('As ferramentas não estão disponíveis neste fluxo.', true);
  writeAgentVariables(context, {
    name: toolCall.name,
    toolCall_id: toolCall.id,
    parameters: JSON.stringify(toolCall.arguments ?? {}),
  });
  const before = { ...context.variables };
  try {
    // Conditions, substitution, secrets masking and the time limit: the engine's own runner.
    await runActions([{ ...action, continueOnError: false }]);
  } catch (error) {
    return reply(JSON.stringify({ status: 'error', message: messageOf(error) }), true);
  }
  return reply(JSON.stringify({ status: 'ok', variables: changedVariables(before, context.variables) }));
}

/**
 * `LeavingFromAgent`: the customer left the agent block. The conversation memory of that block
 * and its status are dropped, so the next visit starts a new conversation (Blip closes the agent
 * session). `aiagent.*` stays readable by the following blocks.
 */
export const leavingFromAgent: AcaoDoMotor = {
  tipo: LEAVING_FROM_AGENT,
  async executar(context) {
    const stateId = context.inboundContext.get(KEY_OF_STATE_CURRENT);
    if (typeof stateId === 'string') deleteVariable(context, agentMemoryKey(stateId));
    deleteVariable(context, VARIABLE_OF_AGENT_FORWARDING);
  },
};

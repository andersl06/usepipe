import {
  AGENT_HANDOFF_TYPE,
  AGENT_LIMITS,
  DEFAULT_AGENT_KEY_SECRETS,
  DEFAULT_AGENT_MODELS,
  FORWARD_TO_AGENT,
  LEAVING_FROM_AGENT,
  VARIABLE_OF_AGENT_FORWARDING,
  agentProvider,
} from '@pipe/core';
import type { AgentProvider } from '@pipe/core';
import type { AcaoDoEditor, Block, Mapa, Position, SaidaDoEditor } from './model';
import {
  ID_DO_FALLBACK,
  LIMITE_DE_SAIDAS,
  MESSAGES,
  PREFIX_OF_AI_AGENT,
  esqueleto,
  gerarId,
  newInbound,
} from './model';
import { actionErrors, novaAcao } from './actions-of-block';

/**
 * The "Agente de IA" block in the Builder (P14-UI, D-58). The engine and API came in 02-53
 * (`packages/core/src/flow/ai-agent.ts`); this module is the screen's pure logic over the block,
 * so `node --test` can import it:
 *
 * - the factory, in the shape Blip's editor gives the block (format only, D-33): id
 *   `ai-agent:<uuid>`, entering `ForwardToAgent` with the agent settings, input that waits while
 *   `agent_forwardToAgentState_status == Success`, `LeavingFromAgent` after the block is left,
 *   the exception output (`Error` → fallback), and the default output back to the block itself;
 * - read/write helpers for the settings the engine reads (`agentSettings` in core): provider and
 *   model per block (Anthropic or OpenAI), max tokens, temperature, the flow secret holding the
 *   key, the instructions, the short-term memory, forward and output variable;
 * - handoffs: each one lives in `settings.handoffs[]` AND as a named output of the block (content
 *   type `application/vnd.iris.aiplatform.handoff+json` and `content.value.name == <name>`), so
 *   adding/renaming/removing one keeps both in step, as Blip's editor does;
 * - tools: the block's `$localCustomActions`, each with `$title` (the tool name), `$description`
 *   and `$inputSchema`;
 * - the validation that paints the block red.
 *
 * Blip writes prompt entries with `type` (newer blocks) or `role` (older ones); the engine reads
 * `role`. The Builder writes both keys on what it creates and reads either.
 */

export const TITLE_OF_AI_AGENT = 'Novo Agente';
export const AGENT_MEMORY_DEFAULT = AGENT_LIMITS.defaultMemoryMessages;
/** Blip's default for a new agent (`getDefaultConfiguration`). */
export const AGENT_MAX_TOKENS_DEFAULT = 2048;
export const AGENT_TEMPERATURE_DEFAULT = 0.7;

export const PROVIDER_LABELS: Readonly<Record<AgentProvider, string>> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

/** Suggestions for the model field; any other model name can be typed. */
export const MODEL_SUGGESTIONS: Readonly<Record<AgentProvider, readonly string[]>> = {
  anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5', 'claude-sonnet-4-5'],
  openai: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-5', 'gpt-5-mini', 'o4-mini'],
};

/** Condition paths of a handoff output (Blip's agent outputs). */
export const HANDOFF_TYPE_VARIABLE = 'input.content@content.type';
export const HANDOFF_NAME_VARIABLE = 'input.content@content.value.name';

export const AGENT_MESSAGES = {
  instrucoesVazias: 'Instruções para o agente: campo obrigatório.',
  modeloVazio: 'Modelo: campo obrigatório.',
  maxTokens: `Max tokens: use um número inteiro entre 1 e ${AGENT_LIMITS.maxTokens}.`,
  temperatura: (max: number) => `Temperatura: use um número entre 0 e ${max}.`,
  memoria: `Quantidade de mensagens: use um número inteiro entre 1 e ${AGENT_LIMITS.maxMemoryMessages}.`,
  variavelVazia: 'Salvar resposta em variável: informe o nome da variável.',
  variavelInvalida: 'O nome da variável de resposta só pode ter letras, números, "_" e pontos.',
  handoffCurto: 'O nome precisa ter 3 caracteres ou mais',
  handoffInvalido: "Somente caracteres alfanuméricos minúsculos e '_' são permitidos",
  handoffRepetido: 'Nome de condição de saída já está em uso',
  handoffSemDescricao: (nome: string) => `Direcionamento '${nome}': descreva quando o agente deve usá-lo.`,
  handoffSemSaida: (nome: string) => `Direcionamento '${nome}': escolha o bloco de destino.`,
  ferramentaCurta: 'O nome da ação deve ter no mínimo 3 caracteres',
  ferramentaInvalida:
    "Somente caracteres alfanuméricos minúsculos, '-' e '_' são permitidos. Exemplo: minha_acao_1",
  ferramentaRepetida: 'Já existe uma ação com este nome para este agente',
  ferramentaSemDescricao: (nome: string) => `Ferramenta '${nome}': descreva quando o agente deve executá-la.`,
  schemaInvalido: 'O JSON inserido contém erros de sintaxe ou atributos incompletos',
  schemaNaoObjeto: 'O schema precisa ser um JSON Schema com "type": "object".',
} as const;

/* ----------------------------------------------------------------- types */

type Settings = Record<string, unknown>;

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

export const isAiAgentBlock = (block: Block): boolean => block.id.startsWith(PREFIX_OF_AI_AGENT);

/** Does the flow (or any subflow drawing given) have an agent block? */
export function hasAiAgent(...maps: readonly Mapa[]): boolean {
  return maps.some((mapa) => Object.values(mapa).some(isAiAgentBlock));
}

/** A prompt entry's kind: Blip's newer `type`, or the older `role` the engine reads. */
export const promptKind = (entry: Record<string, unknown>): string =>
  typeof entry['type'] === 'string' ? entry['type'] : typeof entry['role'] === 'string' ? entry['role'] : '';

const isInstruction = (entry: Record<string, unknown>): boolean =>
  ['system', 'instructions'].includes(promptKind(entry));
const isMemory = (entry: Record<string, unknown>): boolean => promptKind(entry) === 'short-term-memory';

/* ------------------------------------------------------------ the block */

/** Blip's default settings for a new agent, with Pipe's provider/model (D-58). */
export function defaultAgentSettings(provider: AgentProvider = 'anthropic'): Settings {
  return {
    model: {
      provider,
      model: DEFAULT_AGENT_MODELS[provider],
      maxTokens: AGENT_MAX_TOKENS_DEFAULT,
      temperature: AGENT_TEMPERATURE_DEFAULT,
    },
    prompt: [
      { role: 'system', type: 'system', content: '', promptId: gerarId() },
      {
        role: 'short-term-memory',
        type: 'short-term-memory',
        config: { length: AGENT_MEMORY_DEFAULT },
        promptId: gerarId(),
      },
    ],
    handoffs: [],
    output: { forward: { enabled: true, outputVariable: null, handoffName: null } },
    tools: {},
  };
}

/** The exception output: status `Error` → fallback (Blip's `$isAgentDefaultOutput`). */
function errorOutput(mapa: Mapa, id: string): SaidaDoEditor {
  return {
    $id: id,
    $isAgentOutput: true,
    $isAgentCustomOutput: false,
    $isAgentDefaultOutput: true,
    conditions: [
      { source: 'context', variable: VARIABLE_OF_AGENT_FORWARDING, comparison: 'equals', values: ['Error'] },
    ],
    ...(mapa[ID_DO_FALLBACK] ? { stateId: ID_DO_FALLBACK, typeOfStateId: 'state' } : {}),
    $invalid: false,
  };
}

/** "Agente de IA" from the NOVO BLOCO menu (Blip's `createAiAgentState`, shape only). */
export function newAiAgentBlock(mapa: Mapa, position: Position, id = gerarId()): Block {
  const codigo = `${PREFIX_OF_AI_AGENT}${id}`;
  const inbound = newInbound(`${id}-entrada`);
  inbound.input!.conditions = [
    { source: 'context', variable: VARIABLE_OF_AGENT_FORWARDING, comparison: 'equals', values: ['Success'] },
  ];
  return {
    ...esqueleto(codigo, TITLE_OF_AI_AGENT, position),
    $contentActions: [inbound],
    $enteringCustomActions: [
      { $id: `${id}-forward`, type: FORWARD_TO_AGENT, settings: defaultAgentSettings(), conditions: [] },
    ],
    $afterStateChangedActions: [
      { $id: `${id}-leaving`, type: LEAVING_FROM_AGENT, settings: {}, conditions: [] },
    ],
    $localCustomActions: [],
    $conditionOutputs: [errorOutput(mapa, `${id}-erro`)],
    // While the agent talks, the next message comes back to this same block.
    $defaultOutput: { stateId: codigo, typeOfStateId: 'state', $invalid: false },
  };
}

/** The entering `ForwardToAgent` action's settings (empty object when the block has none). */
export function agentSettingsOf(block: Block): Settings {
  const acao = (block.$enteringCustomActions ?? []).find((a) => a.type === FORWARD_TO_AGENT);
  return obj(acao?.settings) ?? {};
}

/** Replace the `ForwardToAgent` settings (creating the action if an imported block lacks it). */
export function withAgentSettings(block: Block, settings: Settings): Block {
  const lista = block.$enteringCustomActions ?? [];
  const indice = lista.findIndex((a) => a.type === FORWARD_TO_AGENT);
  const acoes: AcaoDoEditor[] =
    indice < 0
      ? [{ $id: gerarId(), type: FORWARD_TO_AGENT, settings, conditions: [] }, ...lista]
      : lista.map((a, i) => (i === indice ? { ...a, settings } : a));
  return { ...block, $enteringCustomActions: acoes };
}

function editSettings(block: Block, edit: (s: Settings) => void): Block {
  const settings = copy(agentSettingsOf(block));
  edit(settings);
  return withAgentSettings(block, settings);
}

function modelOf(settings: Settings): Record<string, unknown> {
  const model = obj(settings['model']);
  if (model) return model;
  const novo: Record<string, unknown> = {};
  settings['model'] = novo;
  return novo;
}

/* --------------------------------------------------------- model config */

export interface AgentModelView {
  provider: AgentProvider;
  /** The model name as stored ('' when none: the engine then uses the provider's default). */
  model: string;
  /** The model the engine will call. */
  effectiveModel: string;
  maxTokens: number | null;
  temperature: number | null;
  /** The flow secret name as stored ('' = the provider's default). */
  apiKeySecret: string;
  /** The flow secret the API will read. */
  effectiveApiKeySecret: string;
}

export function agentModelView(block: Block): AgentModelView {
  const model = obj(agentSettingsOf(block)['model']) ?? {};
  const name = typeof model['model'] === 'string' ? model['model'].trim() : '';
  const provider = agentProvider(model['provider'], name || null);
  const secret = typeof model['apiKeySecret'] === 'string' ? model['apiKeySecret'].trim() : '';
  return {
    provider,
    model: name,
    effectiveModel: name || DEFAULT_AGENT_MODELS[provider],
    maxTokens: num(model['maxTokens']),
    temperature: num(model['temperature']),
    apiKeySecret: secret,
    effectiveApiKeySecret: secret || DEFAULT_AGENT_KEY_SECRETS[provider],
  };
}

/**
 * Switch the provider. A model or key secret that only makes sense for the other provider (its
 * default, or a model name the engine would infer as the other one) follows the new provider.
 */
export function setAgentProvider(block: Block, provider: AgentProvider): Block {
  const atual = agentModelView(block);
  return editSettings(block, (s) => {
    const model = modelOf(s);
    model['provider'] = provider;
    if (!atual.model || agentProvider(undefined, atual.model) !== provider) {
      model['model'] = DEFAULT_AGENT_MODELS[provider];
    }
    if (Object.values(DEFAULT_AGENT_KEY_SECRETS).includes(atual.apiKeySecret)) delete model['apiKeySecret'];
  });
}

export function setAgentModel(block: Block, name: string): Block {
  return editSettings(block, (s) => {
    const model = modelOf(s);
    model['model'] = name;
  });
}

/** Numbers typed in the panel; empty text removes the key (the engine's default applies). */
function setModelNumber(block: Block, key: 'maxTokens' | 'temperature', text: string): Block {
  return editSettings(block, (s) => {
    const model = modelOf(s);
    const value = text.trim() === '' ? null : Number(text.replace(',', '.'));
    if (value === null || !Number.isFinite(value)) delete model[key];
    else model[key] = value;
  });
}

export const setAgentMaxTokens = (block: Block, text: string): Block => setModelNumber(block, 'maxTokens', text);
export const setAgentTemperature = (block: Block, text: string): Block => setModelNumber(block, 'temperature', text);

/** The key secret's name; the provider's default name is stored as "no name" so it follows the provider. */
export function setAgentKeySecret(block: Block, name: string): Block {
  const provider = agentModelView(block).provider;
  return editSettings(block, (s) => {
    const model = modelOf(s);
    const nome = name.trim();
    if (!nome || nome === DEFAULT_AGENT_KEY_SECRETS[provider]) delete model['apiKeySecret'];
    else model['apiKeySecret'] = nome;
  });
}

/**
 * Whether the provider accepts a custom temperature for this model — the same rule `@pipe/ai`
 * applies before calling (`anthropicAcceptsTemperature`/`openAiAcceptsTemperature`); the Claude 5
 * generation and OpenAI reasoning models reject it, so the value is ignored there.
 */
export function temperatureAccepted(provider: AgentProvider, model: string): boolean {
  return provider === 'anthropic'
    ? /^claude-(3|haiku-4|sonnet-4|opus-4-[0-6](?!\d))/.test(model)
    : /^gpt-(4|3\.5)/.test(model);
}

/** Highest temperature each provider accepts. */
export const maxTemperature = (provider: AgentProvider): number => (provider === 'openai' ? 2 : 1);

/* --------------------------------------------------------- instructions */

/** The texts of the `system`/`instructions` prompt entries, in order. */
export function agentInstructions(block: Block): string[] {
  const prompt = agentSettingsOf(block)['prompt'];
  return (Array.isArray(prompt) ? prompt : [])
    .map(obj)
    .filter((p): p is Record<string, unknown> => !!p && isInstruction(p))
    .map((p) => (typeof p['content'] === 'string' ? p['content'] : ''));
}

/** Prompt entries the panel does not edit (examples, history variables…): kept as imported. */
export function otherPromptEntries(block: Block): number {
  const prompt = agentSettingsOf(block)['prompt'];
  return (Array.isArray(prompt) ? prompt : [])
    .map(obj)
    .filter((p) => !!p && !isInstruction(p) && !isMemory(p)).length;
}

/**
 * Replace the instructions list. Existing instruction entries keep their position and extra keys;
 * new ones are appended before the memory entry; removed ones leave the prompt.
 */
export function setAgentInstructions(block: Block, texts: readonly string[]): Block {
  return editSettings(block, (s) => {
    const prompt = (Array.isArray(s['prompt']) ? s['prompt'] : []) as unknown[];
    let next = 0;
    const out: unknown[] = [];
    for (const entry of prompt) {
      const p = obj(entry);
      if (!p || !isInstruction(p)) {
        out.push(entry);
        continue;
      }
      if (next < texts.length) out.push({ ...p, content: texts[next++] });
    }
    const extra = texts.slice(next).map((content) => ({ role: 'system', type: 'system', content, promptId: gerarId() }));
    const memoria = out.findIndex((e) => !!obj(e) && isMemory(obj(e)!));
    if (memoria < 0) out.push(...extra);
    else out.splice(memoria, 0, ...extra);
    s['prompt'] = out;
  });
}

/* --------------------------------------------------------------- memory */

export interface AgentMemoryView {
  enabled: boolean;
  /** The stored length, or null when absent/invalid (the engine uses 50). */
  length: number | null;
}

export function agentMemory(block: Block): AgentMemoryView {
  const prompt = agentSettingsOf(block)['prompt'];
  const entry = (Array.isArray(prompt) ? prompt : []).map(obj).find((p) => !!p && isMemory(p));
  if (!entry) return { enabled: false, length: null };
  return { enabled: true, length: num(obj(entry['config'])?.['length']) };
}

/** Turn the short-term memory on/off, or change its length (text as typed). */
export function setAgentMemory(block: Block, enabled: boolean, lengthText?: string): Block {
  return editSettings(block, (s) => {
    const prompt = (Array.isArray(s['prompt']) ? s['prompt'] : []) as unknown[];
    const indice = prompt.findIndex((e) => !!obj(e) && isMemory(obj(e)!));
    if (!enabled) {
      if (indice >= 0) prompt.splice(indice, 1);
      s['prompt'] = prompt;
      return;
    }
    const atual = indice >= 0 ? obj(prompt[indice])! : null;
    const length =
      lengthText === undefined
        ? (num(obj(atual?.['config'])?.['length']) ?? AGENT_MEMORY_DEFAULT)
        : lengthText.trim() === ''
          ? null
          : Number(lengthText);
    const base = atual ?? { role: 'short-term-memory', type: 'short-term-memory', promptId: gerarId() };
    const config: Record<string, unknown> = { ...(obj(base['config']) ?? {}) };
    if (length === null || !Number.isFinite(length)) delete config['length'];
    else config['length'] = length;
    const entry = { ...base, config };
    if (indice >= 0) prompt[indice] = entry;
    else prompt.push(entry);
    s['prompt'] = prompt;
  });
}

/* --------------------------------------------------------------- output */

export interface AgentOutputView {
  /** Send the agent's texts to the customer (engine default: on). */
  forward: boolean;
  /** Store the turn's text in a variable. */
  saveVariable: boolean;
  variable: string;
}

export function agentOutput(block: Block): AgentOutputView {
  const output = obj(agentSettingsOf(block)['output']) ?? {};
  const forward = obj(output['forward']);
  const variable = obj(output['variable']);
  // The engine reads `output.variable`; Blip's newer blocks keep the name in `forward.outputVariable`.
  const legacy = typeof forward?.['outputVariable'] === 'string' ? forward['outputVariable'] : '';
  const name = typeof variable?.['name'] === 'string' ? variable['name'] : legacy;
  return {
    forward: forward ? forward['enabled'] !== false : true,
    saveVariable: variable ? variable['enabled'] === true : !!legacy,
    variable: name,
  };
}

export function setAgentOutput(block: Block, patch: Partial<AgentOutputView>): Block {
  const atual = { ...agentOutput(block), ...patch };
  return editSettings(block, (s) => {
    const output = obj(s['output']) ?? {};
    const forward: Record<string, unknown> = { ...(obj(output['forward']) ?? {}), enabled: atual.forward };
    const nome = atual.variable.trim();
    // Both keys: the engine reads `output.variable`, Blip's editor shows `forward.outputVariable`.
    forward['outputVariable'] = atual.saveVariable && nome ? nome : null;
    s['output'] = {
      ...output,
      forward,
      variable: { enabled: atual.saveVariable, name: atual.variable },
    };
  });
}

/* ------------------------------------------------------------- handoffs */

export interface AgentHandoffView {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Index of the matching output in `$conditionOutputs`, or -1. */
  output: number;
}

const handoffName = (saida: SaidaDoEditor): string | null => {
  const tipo = saida.conditions?.find((c) => c.variable === HANDOFF_TYPE_VARIABLE)?.values?.[0];
  if (tipo !== AGENT_HANDOFF_TYPE) return null;
  const nome = saida.conditions?.find((c) => c.variable === HANDOFF_NAME_VARIABLE)?.values?.[0];
  return typeof nome === 'string' ? nome : null;
};

/** Index of the output that takes the handoff `name`. */
export function handoffOutputIndex(block: Block, name: string): number {
  return (block.$conditionOutputs ?? []).findIndex((s) => handoffName(s) === name);
}

export function agentHandoffs(block: Block): AgentHandoffView[] {
  const lista = agentSettingsOf(block)['handoffs'];
  return (Array.isArray(lista) ? lista : []).map((h) => {
    const handoff = obj(h) ?? {};
    const name = typeof handoff['name'] === 'string' ? handoff['name'] : '';
    return {
      name,
      description: typeof handoff['description'] === 'string' ? handoff['description'] : '',
      parameters: obj(handoff['parameters']) ?? {},
      output: name ? handoffOutputIndex(block, name) : -1,
    };
  });
}

/** Blip's handoff output: the handoff document with this name, no destination until one is chosen. */
function handoffOutput(name: string, id = gerarId()): SaidaDoEditor {
  return {
    $id: id,
    $isAgentOutput: true,
    $isAgentCustomOutput: true,
    $isAgentDefaultOutput: false,
    conditions: [
      { source: 'context', variable: HANDOFF_TYPE_VARIABLE, comparison: 'equals', values: [AGENT_HANDOFF_TYPE] },
      { source: 'context', variable: HANDOFF_NAME_VARIABLE, comparison: 'equals', values: [name] },
    ],
    $invalid: false,
  };
}

function uniqueHandoffName(block: Block): string {
  const nomes = new Set(agentHandoffs(block).map((h) => h.name));
  let i = 1;
  while (nomes.has(`direcionamento_${i}`)) i++;
  return `direcionamento_${i}`;
}

export type AgentEditResult = { ok: true; block: Block } | { ok: false; error: string };

/** "Adicionar direcionamento": a handoff and its named exit, no destination yet. */
export function addHandoff(block: Block, id = gerarId()): AgentEditResult {
  if ((block.$conditionOutputs ?? []).length >= LIMITE_DE_SAIDAS) return { ok: false, error: MESSAGES.limiteDeSaidas };
  const name = uniqueHandoffName(block);
  const withSettings = editSettings(block, (s) => {
    const lista = Array.isArray(s['handoffs']) ? s['handoffs'] : [];
    s['handoffs'] = [...lista, { name, description: '', parameters: {} }];
  });
  return {
    ok: true,
    block: { ...withSettings, $conditionOutputs: [...(block.$conditionOutputs ?? []), handoffOutput(name, id)] },
  };
}

function editHandoff(block: Block, index: number, edit: (h: Record<string, unknown>) => void): Block {
  return editSettings(block, (s) => {
    const lista = Array.isArray(s['handoffs']) ? [...(s['handoffs'] as unknown[])] : [];
    const h = obj(lista[index]);
    if (!h) return;
    edit(h);
    lista[index] = h;
    s['handoffs'] = lista;
  });
}

/** Rename a handoff and the name its exit tests (the exit is created if an import lacked it). */
export function renameHandoff(block: Block, index: number, name: string): Block {
  const atual = agentHandoffs(block)[index];
  if (!atual) return block;
  const next = editHandoff(block, index, (h) => {
    h['name'] = name;
  });
  const saidas = [...(next.$conditionOutputs ?? [])];
  if (atual.output >= 0) {
    const saida = saidas[atual.output]!;
    saidas[atual.output] = {
      ...saida,
      conditions: (saida.conditions ?? []).map((c) =>
        c.variable === HANDOFF_NAME_VARIABLE ? { ...c, values: [name] } : c,
      ),
    };
  } else {
    saidas.push(handoffOutput(name));
  }
  return { ...next, $conditionOutputs: saidas };
}

export function setHandoffDescription(block: Block, index: number, description: string): Block {
  return editHandoff(block, index, (h) => {
    h['description'] = description;
  });
}

/** The parameters schema, from the JSON the panel's "Schema" field holds; invalid JSON is refused. */
export function setHandoffParameters(block: Block, index: number, text: string): AgentEditResult {
  const parsed = parseSchema(text);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    block: editHandoff(block, index, (h) => {
      h['parameters'] = parsed.schema;
    }),
  };
}

/** Remove a handoff and its exit. */
export function removeHandoff(block: Block, index: number): Block {
  const atual = agentHandoffs(block)[index];
  if (!atual) return block;
  const next = editSettings(block, (s) => {
    const lista = Array.isArray(s['handoffs']) ? (s['handoffs'] as unknown[]) : [];
    s['handoffs'] = lista.filter((_, i) => i !== index);
  });
  const others = agentHandoffs(next).some((h) => h.name === atual.name);
  return {
    ...next,
    $conditionOutputs: (next.$conditionOutputs ?? []).filter((_, i) => others || i !== atual.output),
  };
}

/** Choose where a handoff leads; its exit is created when an imported block lacked it. */
export function setHandoffDestination(block: Block, index: number, stateId: string): Block {
  const atual = agentHandoffs(block)[index];
  if (!atual) return block;
  const saidas = [...(block.$conditionOutputs ?? [])];
  if (atual.output >= 0) saidas[atual.output] = { ...saidas[atual.output]!, stateId, typeOfStateId: 'state' };
  else saidas.push({ ...handoffOutput(atual.name), stateId, typeOfStateId: 'state' });
  return { ...block, $conditionOutputs: saidas };
}

/** Index of the exception output (status `Error`). */
export function errorOutputIndex(block: Block): number {
  return (block.$conditionOutputs ?? []).findIndex((s) =>
    s.conditions?.some((c) => c.variable === VARIABLE_OF_AGENT_FORWARDING && c.values?.[0] === 'Error'),
  );
}

/** "Saída de exceção": where the contact goes when the agent fails (created if missing). */
export function setErrorDestination(block: Block, stateId: string): Block {
  const saidas = [...(block.$conditionOutputs ?? [])];
  const indice = errorOutputIndex(block);
  if (indice >= 0) saidas[indice] = { ...saidas[indice]!, stateId, typeOfStateId: 'state' };
  else saidas.unshift({ ...errorOutput({}, gerarId()), stateId, typeOfStateId: 'state' });
  return { ...block, $conditionOutputs: saidas };
}

/** Outputs that are neither the exception nor a handoff (e.g. Blip's input forwarding ones). */
export function otherAgentOutputs(block: Block): number[] {
  const erro = errorOutputIndex(block);
  return (block.$conditionOutputs ?? []).flatMap((s, i) => (i === erro || handoffName(s) !== null ? [] : [i]));
}

/* ---------------------------------------------------------------- tools */

export const TOOL_NAME = /^[a-z0-9_-]+$/;

/** A JSON Schema for tool/handoff arguments: an object with `type: "object"` (empty text = no arguments). */
export function parseSchema(
  text: string,
): { ok: true; schema: Record<string, unknown> } | { ok: false; error: string } {
  if (!text.trim()) return { ok: true, schema: {} };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: AGENT_MESSAGES.schemaInvalido };
  }
  const schema = obj(value);
  if (!schema) return { ok: false, error: AGENT_MESSAGES.schemaInvalido };
  return { ok: true, schema };
}

export const EMPTY_TOOL_SCHEMA = { type: 'object', properties: {} } as const;

/** A new tool: an action of the catalog, named `ferramenta_N`, with an empty argument schema. */
export function newTool(block: Block, tipo: string, id = gerarId()): AcaoDoEditor {
  const nomes = new Set((block.$localCustomActions ?? []).map((a) => a.$title ?? ''));
  let i = 1;
  while (nomes.has(`ferramenta_${i}`)) i++;
  return {
    ...novaAcao(tipo, id),
    $title: `ferramenta_${i}`,
    $description: '',
    $inputSchema: copy(EMPTY_TOOL_SCHEMA),
  };
}

export const toolDescription = (acao: AcaoDoEditor): string =>
  typeof acao['$description'] === 'string' ? acao['$description'] : '';

export function withToolDescription(acao: AcaoDoEditor, description: string): AcaoDoEditor {
  return { ...acao, $description: description };
}

export const toolSchemaText = (acao: AcaoDoEditor): string =>
  JSON.stringify(obj(acao['$inputSchema']) ?? EMPTY_TOOL_SCHEMA, null, 2);

export function withToolSchema(acao: AcaoDoEditor, text: string): { ok: true; acao: AcaoDoEditor } | { ok: false; error: string } {
  const parsed = parseSchema(text);
  if (!parsed.ok) return parsed;
  if (Object.keys(parsed.schema).length && parsed.schema['type'] !== 'object') {
    return { ok: false, error: AGENT_MESSAGES.schemaNaoObjeto };
  }
  return { ok: true, acao: { ...acao, $inputSchema: Object.keys(parsed.schema).length ? parsed.schema : copy(EMPTY_TOOL_SCHEMA) } };
}

/** The agent-specific problems of one tool (name, description, schema), Blip's wording. */
export function toolErrors(acao: AcaoDoEditor, all: readonly AcaoDoEditor[]): string[] {
  const errors: string[] = [];
  const nome = (acao.$title ?? '').trim();
  if (nome.length < 3) errors.push(AGENT_MESSAGES.ferramentaCurta);
  else if (!TOOL_NAME.test(nome)) errors.push(AGENT_MESSAGES.ferramentaInvalida);
  if (nome && all.filter((a) => (a.$title ?? '').trim() === nome).length > 1) errors.push(AGENT_MESSAGES.ferramentaRepetida);
  if (!toolDescription(acao).trim()) errors.push(AGENT_MESSAGES.ferramentaSemDescricao(nome || acao.type));
  const schema = acao['$inputSchema'];
  if (schema !== undefined && (!obj(schema) || obj(schema)!['type'] !== 'object')) errors.push(AGENT_MESSAGES.schemaNaoObjeto);
  return errors;
}

/* ----------------------------------------------------------- validation */

/** What paints an agent block red, besides the generic output/action checks. */
export function aiAgentErrors(block: Block): string[] {
  if (!isAiAgentBlock(block)) return [];
  const errors: string[] = [];
  const add = (m: string): void => {
    if (!errors.includes(m)) errors.push(m);
  };
  const model = agentModelView(block);
  if (!model.model) add(AGENT_MESSAGES.modeloVazio);
  if (model.maxTokens !== null && (!Number.isInteger(model.maxTokens) || model.maxTokens < 1 || model.maxTokens > AGENT_LIMITS.maxTokens)) {
    add(AGENT_MESSAGES.maxTokens);
  }
  const maxTemp = maxTemperature(model.provider);
  if (model.temperature !== null && (model.temperature < 0 || model.temperature > maxTemp)) {
    add(AGENT_MESSAGES.temperatura(maxTemp));
  }
  if (!agentInstructions(block).some((t) => t.trim())) add(AGENT_MESSAGES.instrucoesVazias);
  const memory = agentMemory(block);
  if (memory.enabled && memory.length !== null && (!Number.isInteger(memory.length) || memory.length < 1 || memory.length > AGENT_LIMITS.maxMemoryMessages)) {
    add(AGENT_MESSAGES.memoria);
  }
  const output = agentOutput(block);
  if (output.saveVariable) {
    const nome = output.variable.trim();
    if (!nome) add(AGENT_MESSAGES.variavelVazia);
    else if (!/^[a-zA-Z0-9_.]+$/.test(nome)) add(AGENT_MESSAGES.variavelInvalida);
  }
  const handoffs = agentHandoffs(block);
  for (const h of handoffs) {
    const nome = h.name.trim();
    if (nome.length < 3) add(AGENT_MESSAGES.handoffCurto);
    else if (!/^[a-z0-9_]+$/.test(nome)) add(AGENT_MESSAGES.handoffInvalido);
    if (nome && handoffs.filter((o) => o.name.trim() === nome).length > 1) add(AGENT_MESSAGES.handoffRepetido);
    if (!h.description.trim()) add(AGENT_MESSAGES.handoffSemDescricao(nome));
    // An imported handoff whose exit is missing has nowhere to go (a present exit is checked with the outputs).
    if (nome && h.output < 0) add(AGENT_MESSAGES.handoffSemSaida(nome));
  }
  const tools = block.$localCustomActions ?? [];
  for (const acao of tools) {
    for (const e of toolErrors(acao, tools)) add(e);
    for (const e of actionErrors(acao)) add(e);
  }
  return errors;
}

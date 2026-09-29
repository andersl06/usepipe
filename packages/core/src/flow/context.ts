/**
 * Ported from takenet/blip-sdk-csharp (Apache-2.0): src/Take.Blip.Builder/ContextBase.cs, ContextExtensions.cs, StateManager.cs, LazyInput.cs, Utils/VariableReplacer.cs, and Variables/{VariableSource,InputVariableProvider,StateVariableProvider,ContactVariableProvider,ResourceVariableProvider}.cs. Changes from C# to TypeScript: Blip's remote user context becomes an in-memory map loaded from `execucao_fluxo.contexto` by the `api`; `LazyInput` has no AI, so intent/entity arrive prepared or null; variable expiration is stored under `#expirations` (see `EXPIRATIONS_KEY`); `calendar`, `random`, `application`, `tunnel` and `bucket` have providers (see each below), while other Blip service providers (secret, aiagent, etc.) are absent and throw, as the original does when a source lacks a provider. `resource` DOES have a provider: the `api` loads the flow's `recurso_do_fluxo` rows into `Context.resources` the same way it loads `contact`, so an imported flow reading `{{resource.x}}` (and `resource.x@prop` for JSON resources, via the generic `propertyJson` path already used by every source) resolves instead of throwing "Não há provedor para a fonte de variável 'resource'.".
 */

import type { CommandMatch } from './commands.js';
import type { FlowBlip } from './modelos.js';
import { KEYS_OF_STATE } from './modelos.js';

/** `VariableSource`, na ordem do original. */
export const SOURCES_OF_VARIABLE = [
  'context',
  'contact',
  'calendar',
  'random',
  'bucket',
  'config',
  'input',
  'state',
  'tunnel',
  'application',
  'ticket',
  'resource',
  'aianswers',
  'secret',
  'blipfunction',
  'aiagent',
] as const;
export type VariableSource = (typeof SOURCES_OF_VARIABLE)[number];

/** Sources with providers in Pipe; others throw, as in Blip without a provider. */
export const FONTES_SUPORTADAS: ReadonlySet<VariableSource> = new Set([
  'context',
  'contact',
  'config',
  'input',
  'state',
  'ticket',
  'resource',
  'calendar',
  'random',
  'application',
  'tunnel',
  'bucket',
]);

/** Incoming message in LIME vocabulary: `tipo` is the MIME type (`text/plain`, etc.). */
export interface InboundMessage {
  id: string;
  tipo: string;
  conteudo: unknown;
  de?: string;
  para?: string;
}

export interface Intent {
  id?: string;
  name?: string;
  score?: number;
  answer?: unknown;
}

export interface Entity {
  id?: string;
  name?: string;
  value?: string;
}

/** `LazyInput`. */
export interface InboundLazy {
  message: InboundMessage;
  /** `SerializedContent`: plain text unchanged, JSON document serialized. */
  serializedContent: string;
  intent?: Intent | null;
  entities?: Entity[] | null;
}

export function createInbound(
  message: InboundMessage,
  ia?: { intent?: Intent | null; entities?: Entity[] | null },
): InboundLazy {
  const conteudoSerializado =
    typeof message.conteudo === 'string'
      ? message.conteudo
      : JSON.stringify(message.conteudo ?? null);
  return {
    message,
    serializedContent: conteudoSerializado,
    intent: ia?.intent ?? null,
    entities: ia?.entities ?? null,
  };
}

/** O que o motor manda sair: o `Message` do `ISender.SendMessageAsync`. */
export interface OutputMessage {
  tipo: string;
  conteudo: unknown;
  metadados?: Record<string, string> | null;
  /** `SendRawMessage`: content is serialized text to deserialize according to its type. */
  bruto?: boolean;
}

/** Open human ticket, corresponding to Blip `Ticket`. */
export interface Attendance {
  id: string;
  [campo: string]: unknown;
}

export interface PedidoDeHttp {
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  cabecalhos: Record<string, string>;
  corpo?: string;
  timeoutMs: number;
}

export interface RespostaDeHttp {
  status: number;
  corpo: string;
}

/** What the engine asks the script sandbox to run; the `api` owns the sandbox. */
export interface ScriptRequest {
  /** 1 = `ExecuteScript`, 2 = `ExecuteScriptV2`. */
  version: 1 | 2;
  source: string;
  /** Function called with the input variables, `run` by default. */
  functionName: string;
  /** Input variable values in `inputVariables` order; a missing variable is `null`. */
  args: (string | null)[];
  timeoutMs: number;
  /** `LocalTimeZoneEnabled`: `Date` uses the bot time zone instead of UTC. */
  localTimeZone: boolean;
  /**
   * IANA zone the script's local `Date` methods use: the bot zone (`builder:#localTimeZone`) when
   * `localTimeZone` is on, `UTC` otherwise, as Blip's servers run scripts. Absent = host zone.
   */
  timeZone?: string;
}

export type ActionsSuspendedList = 'entrada' | 'conteudo' | 'saida';

export interface CursorDeProcessHttp {
  lista: ActionsSuspendedList;
  estadoId: string | null;
  indice: number;
  resposta?: RespostaDeHttp;
}

/**
 * External engine dependencies mirror Blip `ISender` and extensions. The `api` implements them; network actions must run outside the inbound transaction.
 */
/**
 * The running action's deadline (`FlowAction.timeout` or `defaultActionTimeLimitMs`). The engine
 * aborts `signal` when the time limit expires; services that do network or write work receive it so
 * an action past its deadline stops instead of writing through a transaction that already ended.
 */
export interface ActionDeadline {
  signal: AbortSignal;
  timeLimitMs: number;
}

/** A `SendCommand`/`ProcessCommand` after routing; `command` says which handler runs it. */
export interface CommandRequest {
  uri: string;
  method: string;
  resource: unknown;
  command: CommandMatch;
  /** The flow that sent it (`get /configuration/caller` finds its router). */
  flowId?: string;
}

export interface ServicosDoMotor {
  /** `signal`: the calling action's deadline; the `api` must not write after it aborts. */
  send(message: OutputMessage, signal?: AbortSignal): Promise<void>;
  forwardForAttendance(pedido: {
    origem: string;
    settings: Record<string, unknown> | null;
  }): Promise<Attendance>;
  registerEvent(evento: Record<string, unknown>): Promise<void>;
  /** Persist contact fields for the contact that owns this execution. */
  mergeContact?(fields: Record<string, unknown>): Promise<void>;
  /** The `api` executes the request; core only describes it and performs no network access. */
  callHttp?(pedido: PedidoDeHttp, signal?: AbortSignal): Promise<RespostaDeHttp>;
  /** The API stores the cursor and calls the network after the transaction ends. */
  suspendHttp?(pedido: PedidoDeHttp, cursor: Omit<CursorDeProcessHttp, 'resposta'>): Promise<never>;
  /** Runs untrusted script source in the sandbox and returns the JSON-safe result. */
  runScript?(request: ScriptRequest): Promise<unknown>;
  /** Runs a function selected from the conversation flow's function library in the same sandbox. */
  runFlowFunction?(request: { functionId: string; args: (string | null)[] }): Promise<unknown>;
  /**
   * `IRedirectManager.RedirectUserAsync` moves the contact to another router service. When absent, this flow is not behind a router and `Redirect` fails: "o redirecionamento funciona apenas no Bot Router" (help.blip.ai).
   */
  redirect?(pedido: { endereco: string; context: unknown }): Promise<void>;
  /**
   * Persist the answer to a native satisfaction survey block (`packages/core/src/flow/satisfaction-survey.ts`). Optional because a flow with no survey block never calls it.
   */
  recordSatisfactionAnswer?(answer: {
    rating: number | null;
    comment: string | null;
    status: string;
  }): Promise<void>;
  /** Native SetBucket equivalent, scoped to the current contact unless global is explicit. */
  bucketSet?(request: { key: string; type: string; value: unknown; scope: 'contact' | 'global'; expirationSeconds?: number }): Promise<void>;
  bucketGet?(request: { key: string; scope: 'contact' | 'global' }): Promise<unknown | null>;
  bucketDelete?(request: { key: string; scope: 'contact' | 'global' }): Promise<void>;
  /** Native ManageList equivalent. */
  listManage?(request: { name: string; operation: 'Add' | 'Remove' }): Promise<void>;
  /** Commands the engine matched in `COMMAND_ROUTES`; `command.route` names the handler to run. */
  sendCommand?(request: CommandRequest): Promise<void>;
  /**
   * Blip's `set /contexts/{contact}/stateid@{flowId}`: move this contact's saved block in ANOTHER flow
   * (usually back to `onboarding` before a Redirect). Returns false when `flowId` is not a flow of this
   * tenant (e.g. a Blip id from an imported flow); the engine then treats the command as done, because a
   * Pipe Redirect already starts the destination at its root.
   */
  setFlowState?(request: { flowId: string; stateId: string }): Promise<boolean>;
  processCommand?(request: CommandRequest): Promise<unknown>;
  /** RAG over the tenant's base_conhecimento/trecho_conhecimento tables. */
  respondWithKnowledge?(request: { text: string; minimumConfidence: number; tags?: string }): Promise<{ answer: string | null; confidence: number }>;
}

export type VariableProvider = (
  nome: string,
  context: Context,
) => Promise<string | null> | string | null;

/** `IContext`. */
export interface Context {
  /** `UserIdentity`. */
  user: string;
  flow: FlowBlip;
  inbound: InboundLazy;
  /** Persisted user context; Blip stores every value here as text. */
  variables: Record<string, string>;
  /** `InputContext` lasts only for this input, including current state and created ticket. */
  inboundContext: Map<string, unknown>;
  /** Contact in Blip vocabulary (`name`, `phoneNumber`, `email`, `extras`, etc.). */
  contact?: Record<string, unknown> | null;
  /**
   * This flow's `recurso_do_fluxo` rows, keyed by `nome`, value already the stored text (a JSON
   * resource's stringified content). The `resource` provider reads it directly; `@property` access
   * on a JSON resource is handled generically by `getVariable`, like every other source.
   */
  resources?: Record<string, string>;
  /**
   * This bot for `application.*`: the flow's short name. `routerIdentifier` is the router's short name
   * when the flow runs as a router service, which is when Blip messages arrive by tunnel (`tunnel.*`).
   */
  application?: { identifier: string; routerIdentifier?: string | null };
  /** Extra providers or replacements for defaults. */
  providers?: Partial<Record<VariableSource, VariableProvider>>;
  services: ServicosDoMotor;
}

// --- ContextExtensions ---

export const KEY_OF_TICKET = 'ticket';
export const KEY_OF_STATE_CURRENT = 'current-state-id';

// --- IContext: armazenamento ---

/**
 * Per-variable expiration deadlines (epoch ms), stored as JSON text INSIDE the persisted variables
 * map so every place that loads and saves `variables` (execution, router context, ProcessHttp
 * resume) keeps them with no schema change. `#` cannot appear in a variable name, so no flow can
 * read or overwrite this key.
 */
export const EXPIRATIONS_KEY = '#expirations';

function expirationsOf(variables: Record<string, string>): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(variables[EXPIRATIONS_KEY] ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function writeExpirations(variables: Record<string, string>, expirations: Record<string, number>): void {
  if (Object.keys(expirations).length === 0) delete variables[EXPIRATIONS_KEY];
  else variables[EXPIRATIONS_KEY] = JSON.stringify(expirations);
}

/** Drop every variable whose deadline has passed; the engine calls this before each input. */
export function pruneExpiredVariables(variables: Record<string, string>, now = Date.now()): void {
  if (!(EXPIRATIONS_KEY in variables)) return;
  const expirations = expirationsOf(variables);
  for (const [nome, expiresAt] of Object.entries(expirations)) {
    if (expiresAt > now) continue;
    delete variables[nome];
    delete expirations[nome];
  }
  writeExpirations(variables, expirations);
}

/** `GetContextVariableAsync`: o valor cru, sem fonte nem propriedade. */
export function contextGetVariable(context: Context, nome: string): string | null {
  const expiresAt = expirationsOf(context.variables)[nome];
  if (expiresAt !== undefined && expiresAt <= Date.now()) {
    deleteVariable(context, nome);
    return null;
  }
  return Object.prototype.hasOwnProperty.call(context.variables, nome)
    ? (context.variables[nome] ?? null)
    : null;
}

/** `SetVariableAsync`: `expirationSeconds` (Blip `SetVariable.expiration`) persists with the value. */
export function setVariable(
  context: Context,
  nome: string,
  value: string | null,
  expirationSeconds?: number,
): void {
  context.variables[nome] = value ?? '';
  const expirations = expirationsOf(context.variables);
  if (expirationSeconds !== undefined && expirationSeconds > 0) {
    expirations[nome] = Date.now() + expirationSeconds * 1000;
  } else if (nome in expirations) {
    delete expirations[nome];
  } else {
    return;
  }
  writeExpirations(context.variables, expirations);
}

export function deleteVariable(context: Context, nome: string): void {
  delete context.variables[nome];
  const expirations = expirationsOf(context.variables);
  if (!(nome in expirations)) return;
  delete expirations[nome];
  writeExpirations(context.variables, expirations);
}

/**
 * .NET `TimeSpan.Parse`, which Blip uses for `builder:stateExpiration` and
 * `builder:actionExecutionTimeout`: `[d.]hh:mm[:ss[.fffffff]]`, or a bare integer meaning DAYS.
 * Returns seconds, or null when the text is not a TimeSpan.
 */
export function timeSpanSeconds(text: string | null | undefined): number | null {
  const t = text?.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t) * 86_400;
  const m = /^(?:(\d+)\.)?(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,7}))?)?$/.exec(t);
  if (!m) return null;
  const [, d = '0', h = '0', min = '0', s = '0', frac = '0'] = m;
  if (Number(h) > 23 || Number(min) > 59 || Number(s) > 59) return null;
  return Number(d) * 86_400 + Number(h) * 3600 + Number(min) * 60 + Number(s) + Number(`0.${frac}`);
}

// --- StateManager ---

export const stateKey = (flowId: string): string => `stateId@${flowId}`;
const statePreviousKey = (flowId: string): string => `previous-stateId@${flowId}`;

export const getStateId = (c: Context): string | null =>
  contextGetVariable(c, stateKey(c.flow.id));
export const getStatePreviousId = (c: Context): string | null =>
  contextGetVariable(c, statePreviousKey(c.flow.id));
/** `builder:stateExpiration`: after this idle time the saved block expires and the user restarts at the root. */
const stateExpiration = (c: Context): number | undefined =>
  timeSpanSeconds(c.flow.configuration?.['builder:stateExpiration']) || undefined;
export const setStateId = (c: Context, id: string): void =>
  setVariable(c, stateKey(c.flow.id), id, stateExpiration(c));
export const setStatePreviousId = (c: Context, id: string): void =>
  setVariable(c, statePreviousKey(c.flow.id), id, stateExpiration(c));
export const deleteStateId = (c: Context): void => deleteVariable(c, stateKey(c.flow.id));

/** Read stored state from already persisted context without constructing `Contexto`. */
export const stateSaved = (variables: Record<string, string>, flowId: string): string | null => {
  const expiresAt = expirationsOf(variables)[stateKey(flowId)];
  if (expiresAt !== undefined && expiresAt <= Date.now()) return null;
  return variables[stateKey(flowId)] ?? null;
};

// --- ContextBase.GetVariableAsync ---

const NAME_OF_VARIABLE =
  /^(?<fonteOuNome>[\p{L}\p{N}_]+)(\.(?<nome>[\p{L}\p{N}_.]+))?(@(?<property>([\p{L}\p{N}_.](\[(\d+|\$n)\])?)+))?$/iu;

/** `VariableName.Parse`: `fonte.nome@propriedade`; without a source, this is a context variable. */
export function readVariableName(texto: string): {
  fonte: VariableSource;
  nome: string;
  property: string | null;
} {
  const m = NAME_OF_VARIABLE.exec(texto);
  if (!m?.groups) throw new Error(`Nome de variável inválido: '${texto}'.`);
  const { fonteOuNome = '', nome, property } = m.groups;
  if (nome !== undefined) {
    const fonte = SOURCES_OF_VARIABLE.find((f) => f === fonteOuNome.toLowerCase());
    if (!fonte) throw new Error(`Fonte de variável inválida: '${fonteOuNome}'.`);
    return { fonte, nome, property: property ?? null };
  }
  return { fonte: 'context', nome: fonteOuNome, property: property ?? null };
}

/** `JToken.ToString(Formatting.None).Trim('"')`. */
function comoTextoDeToken(value: unknown): string {
  return JSON.stringify(value).replace(/^"+|"+$/g, '');
}

/** `GetJsonProperty`: dotted property path into a JSON object value. */
function propertyJson(value: string, property: string): string | null {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return null;
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null;
  for (const parte of property.split('.')) {
    if (json === null || typeof json !== 'object') return null;
    json = (json as Record<string, unknown>)[parte];
    if (json === undefined) return null;
  }
  return comoTextoDeToken(json);
}

/** Case-insensitive property access, matching reflection-based `GetProperty`. */
function objectProperty(objeto: unknown, nome: string): string | null {
  if (objeto === null || typeof objeto !== 'object') return null;
  const key = Object.keys(objeto).find((k) => k.toLowerCase() === nome.toLowerCase());
  if (key === undefined) return null;
  const value = (objeto as Record<string, unknown>)[key];
  if (value === null || value === undefined) return null;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** `InputVariableProvider`. */
function inboundProvider(nome: string, c: Context): string | null {
  const inbound = c.inbound;
  const minusculo = nome.toLowerCase();
  switch (minusculo) {
    case 'content':
      return inbound.serializedContent;
    case 'message':
      return JSON.stringify(inbound.message);
    case 'type':
      return inbound.message.tipo;
    case 'length':
      return String(inbound.serializedContent.length);
    case 'analysis':
      return null;
  }
  if (minusculo.startsWith('intent.')) {
    return objectProperty(inbound.intent, minusculo.split('.')[1] ?? '');
  }
  if (minusculo.startsWith('entity.')) {
    const [, entity, prop] = minusculo.split('.');
    if (!entity || !prop) return null;
    const achada = inbound.entities?.find((e) => e.name?.toLowerCase() === entity);
    return objectProperty(achada, prop);
  }
  if (minusculo.startsWith('message.')) {
    const prop = minusculo.split('.')[1];
    if (prop === 'id') return inbound.message.id;
    if (prop === 'from' || prop === 'fromidentity') return inbound.message.de ?? null;
    if (prop === 'to' || prop === 'toidentity') return inbound.message.para ?? null;
  }
  return null;
}

/** `StateVariableProvider`. */
function stateProvider(nome: string, c: Context): string | null {
  const nomes = nome.toLowerCase().split('.');
  let stateId: string | null;
  if (nomes.length > 1) {
    if (nomes[0] === 'previous') stateId = getStatePreviousId(c);
    else if (nomes[0] === 'current') stateId = getStateId(c);
    else return null;
    nomes.shift();
  } else {
    stateId = getStateId(c);
  }
  const state = c.flow.states.find((s) => s.id === stateId);
  if (!state) return null;
  const variable = nomes[0] ?? '';
  if (variable === 'id') return state.id;
  if (KEYS_OF_STATE.has(variable) || !(variable in state)) return null;
  return comoTextoDeToken(state[variable]);
}

/** `ContactVariableProvider`: `extras.x`, `serialized` ou a propriedade do contato. */
function contactProvider(nome: string, c: Context): string | null {
  const contact = c.contact;
  if (!contact) return null;
  if (nome.toLowerCase().startsWith('extras.')) {
    return objectProperty(contact['extras'], nome.slice('extras.'.length));
  }
  if (nome.toLowerCase() === 'serialized') return JSON.stringify(contact);
  return objectProperty(contact, nome);
}

const DAY_MS = 86_400_000;
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `calendar.*` in GMT-0, with `tomorrow.` and `yesterday.` shifting the current instant by one day. */
function calendarProvider(nome: string): string | null {
  const partes = nome.toLowerCase().split('.');
  const shift = partes[0] === 'tomorrow' ? DAY_MS : partes[0] === 'yesterday' ? -DAY_MS : 0;
  if (shift !== 0) partes.shift();
  if (partes.length !== 1) return null;
  const d = new Date(Date.now() + shift);
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  switch (partes[0]) {
    case 'date':
      return date;
    case 'datetime':
      return `${date}T${time}:${pad2(d.getUTCSeconds())}Z`;
    case 'time':
      return time;
    case 'day':
      return String(d.getUTCDate());
    case 'dayofweek':
      return DAYS_OF_WEEK[d.getUTCDay()]!;
    case 'month':
      return String(d.getUTCMonth() + 1);
    case 'year':
      return String(d.getUTCFullYear());
    case 'hour':
      return String(d.getUTCHours());
    case 'minute':
      return String(d.getUTCMinutes());
    case 'second':
      return String(d.getUTCSeconds());
    case 'unixtime':
      return String(Math.floor(d.getTime() / 1000));
    case 'unixtimemilliseconds':
      return String(d.getTime());
  }
  return null;
}

const randomUUID = (): string =>
  (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID();

/** `random.guid`, `random.integer` (non-negative 32-bit, like .NET `Random.Next()`), `random.string`. */
function randomProvider(nome: string): string | null {
  switch (nome.toLowerCase()) {
    case 'guid':
      return randomUUID();
    case 'integer':
      return String(Math.floor(Math.random() * 2_147_483_647));
    case 'string':
      return randomUUID().replace(/-/g, '');
  }
  return null;
}

/** Blip's bot domain, kept so imported flows that build `{{application.identifier}}@msging.net` stay consistent. */
const BOT_DOMAIN = 'msging.net';
const BOT_INSTANCE = 'pipe';

/** `application.*`: identity is `identifier@domain`, node is `identity/instance`. */
function applicationProvider(nome: string, c: Context): string | null {
  const identifier = c.application?.identifier;
  if (!identifier) return null;
  const identity = `${identifier}@${BOT_DOMAIN}`;
  switch (nome.toLowerCase()) {
    case 'identifier':
      return identifier;
    case 'domain':
      return BOT_DOMAIN;
    case 'instance':
      return BOT_INSTANCE;
    case 'identity':
      return identity;
    case 'node':
      return `${identity}/${BOT_INSTANCE}`;
  }
  return null;
}

/**
 * `tunnel.*` exists only behind a router, as in Blip. Pipe has no tunnel identity: the contact is unique
 * in the tenant, so `identity` and `originator` are the contact itself (same as `contact.identity`);
 * `owner` is the router and `destination` this service.
 */
function tunnelProvider(nome: string, c: Context): string | null {
  const router = c.application?.routerIdentifier;
  if (!router || !c.application?.identifier) return null;
  switch (nome.toLowerCase()) {
    case 'identity':
    case 'originator':
      return c.user;
    case 'owner':
      return `${router}@${BOT_DOMAIN}`;
    case 'destination':
      return `${c.application.identifier}@${BOT_DOMAIN}`;
  }
  return null;
}

/**
 * `bucket.<id>`: the document SetBucket stored, the contact's first and then the tenant-wide one.
 * Text comes back as is, any other document as JSON.
 */
async function bucketProvider(nome: string, c: Context): Promise<string | null> {
  const get = c.services.bucketGet;
  if (!get) return null;
  const value =
    (await get({ key: nome, scope: 'contact' })) ?? (await get({ key: nome, scope: 'global' }));
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const PROVEDORES_PADRAO: Partial<Record<VariableSource, VariableProvider>> = {
  calendar: calendarProvider,
  random: randomProvider,
  application: applicationProvider,
  tunnel: tunnelProvider,
  bucket: bucketProvider,
  input: inboundProvider,
  state: stateProvider,
  contact: contactProvider,
  config: (nome, c) => c.flow.configuration?.[nome] ?? null,
  ticket: (nome, c) => objectProperty(c.inboundContext.get(KEY_OF_TICKET), nome),
  /** `ResourceVariableProvider`: `resources.<name>` set by the `api`; `@property` on a JSON value is generic. */
  resource: (nome, c) => c.resources?.[nome] ?? null,
};

/** `ContextBase.GetVariableAsync`. */
export async function getVariable(context: Context, nome: string): Promise<string | null> {
  const variable = readVariableName(nome);
  let value: string | null = '';
  if (variable.fonte === 'context') {
    value = contextGetVariable(context, variable.nome);
  } else {
    const provedor = context.providers?.[variable.fonte] ?? PROVEDORES_PADRAO[variable.fonte];
    if (!provedor) throw new Error(`Não há provedor para a fonte de variável '${variable.fonte}'.`);
    value = await provedor(variable.nome, context);
  }
  if (!value?.trim() || !variable.property?.trim()) return value;
  return propertyJson(value, variable.property);
}

// --- VariableReplacer ---

const VARIABLES_IN_TEXT = /{{([a-zA-Z0-9.@_-]+)}}/g;

/** `VariableReplacer.ReplaceAsync`: replace `{{nome}}` with its value escaped for JSON. */
export async function replaceVariables(value: string, context: Context): Promise<string> {
  const values = new Map<string, string | null>();
  for (const m of value.matchAll(VARIABLES_IN_TEXT)) {
    const nome = m[1]!;
    if (values.has(nome)) continue;
    values.set(nome, escaparTexto(await getVariable(context, nome)));
  }
  if (values.size === 0) return value;
  return value.replace(VARIABLES_IN_TEXT, (_todo, nome: string) => values.get(nome) ?? '');
}

/** `EscapeString`: the inserted value must not break the surrounding JSON string. */
export function escaparTexto(src: string | null): string | null {
  if (src === null || src.trim() === '') return src;
  let saida = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (!precisaEscapar(src, i)) {
      saida += c;
      continue;
    }
    switch (c) {
      case '\b':
        saida += '\\b';
        break;
      case '\f':
        saida += '\\f';
        break;
      case '\n':
        saida += '\\n';
        break;
      case '\r':
        saida += '\\r';
        break;
      case '\t':
        saida += '\\t';
        break;
      case '"':
        saida += '\\"';
        break;
      case '\\':
        saida += '\\\\';
        break;
      case '/':
        saida += '\\/';
        break;
      default:
        saida += `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;
    }
  }
  return saida;
}

function precisaEscapar(src: string, i: number): boolean {
  const c = src.charCodeAt(i);
  const antes = i > 0 ? src.charCodeAt(i - 1) : -1;
  const depois = i < src.length - 1 ? src.charCodeAt(i + 1) : -1;
  return (
    c < 32 ||
    c === 0x22 ||
    c === 0x5c ||
    // Surrogate alto sem par
    (c >= 0xd800 && c <= 0xdbff && (depois < 0xdc00 || depois > 0xdfff)) ||
    // Surrogate baixo sem par
    (c >= 0xdc00 && c <= 0xdfff && (antes < 0xd800 || antes > 0xdbff)) ||
    c === 0x2028 ||
    c === 0x2029 ||
    (c === 0x2f && antes === 0x3c)
  );
}

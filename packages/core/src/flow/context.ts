/**
 * Ported from takenet/blip-sdk-csharp (Apache-2.0): src/Take.Blip.Builder/ContextBase.cs, ContextExtensions.cs, StateManager.cs, LazyInput.cs, Utils/VariableReplacer.cs, and Variables/{VariableSource,InputVariableProvider,StateVariableProvider,ContactVariableProvider}.cs. Changes from C# to TypeScript: Blip's remote user context becomes an in-memory map loaded from `execucao_fluxo.contexto` by the `api`; `LazyInput` has no AI, so intent/entity arrive prepared or null; variable expiration is not stored; Blip service providers (bucket, resource, tunnel, calendar, secret, etc.) are absent and throw, as the original does when a source lacks a provider.
 */

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
export interface ServicosDoMotor {
  send(message: OutputMessage): Promise<void>;
  forwardForAttendance(pedido: {
    origem: string;
    settings: Record<string, unknown> | null;
  }): Promise<Attendance>;
  registerEvent(evento: Record<string, unknown>): Promise<void>;
  /** The `api` executes the request; core only describes it and performs no network access. */
  callHttp?(pedido: PedidoDeHttp): Promise<RespostaDeHttp>;
  /** The API stores the cursor and calls the network after the transaction ends. */
  suspendHttp?(pedido: PedidoDeHttp, cursor: Omit<CursorDeProcessHttp, 'resposta'>): Promise<never>;
  /**
   * `IRedirectManager.RedirectUserAsync` moves the contact to another router service. When absent, this flow is not behind a router and `Redirect` fails: "o redirecionamento funciona apenas no Bot Router" (help.blip.ai).
   */
  redirect?(pedido: { endereco: string; context: unknown }): Promise<void>;
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
  /** Extra providers or replacements for defaults. */
  providers?: Partial<Record<VariableSource, VariableProvider>>;
  services: ServicosDoMotor;
}

// --- ContextExtensions ---

export const KEY_OF_TICKET = 'ticket';
export const KEY_OF_STATE_CURRENT = 'current-state-id';

// --- IContext: armazenamento ---

/** `GetContextVariableAsync`: o valor cru, sem fonte nem propriedade. */
export function contextGetVariable(context: Context, nome: string): string | null {
  return Object.prototype.hasOwnProperty.call(context.variables, nome)
    ? (context.variables[nome] ?? null)
    : null;
}

/**
 * `SetVariableAsync`. ponytail: source `expiration` is not persisted, so a variable lasts until deletion or overwrite. Persistence would require a timestamp per key.
 */
export function setVariable(context: Context, nome: string, value: string | null): void {
  context.variables[nome] = value ?? '';
}

export function deleteVariable(context: Context, nome: string): void {
  delete context.variables[nome];
}

// --- StateManager ---

export const stateKey = (flowId: string): string => `stateId@${flowId}`;
const statePreviousKey = (flowId: string): string => `previous-stateId@${flowId}`;

export const getStateId = (c: Context): string | null =>
  contextGetVariable(c, stateKey(c.flow.id));
export const getStatePreviousId = (c: Context): string | null =>
  contextGetVariable(c, statePreviousKey(c.flow.id));
export const setStateId = (c: Context, id: string): void =>
  setVariable(c, stateKey(c.flow.id), id);
export const setStatePreviousId = (c: Context, id: string): void =>
  setVariable(c, statePreviousKey(c.flow.id), id);
export const deleteStateId = (c: Context): void => deleteVariable(c, stateKey(c.flow.id));

/** Read stored state from already persisted context without constructing `Contexto`. */
export const stateSaved = (variables: Record<string, string>, flowId: string): string | null =>
  variables[stateKey(flowId)] ?? null;

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

const PROVEDORES_PADRAO: Partial<Record<VariableSource, VariableProvider>> = {
  input: inboundProvider,
  state: stateProvider,
  contact: contactProvider,
  config: (nome, c) => c.flow.configuration?.[nome] ?? null,
  ticket: (nome, c) => objectProperty(c.inboundContext.get(KEY_OF_TICKET), nome),
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

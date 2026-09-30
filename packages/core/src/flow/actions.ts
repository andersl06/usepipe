/**
 * Ported from takenet/blip-sdk-csharp (Apache-2.0): src/Take.Blip.Builder/Actions/{ActionBase,ActionProvider}.cs; Actions/SetVariable/*, Actions/DeleteVariable/*, Actions/SendMessage/SendMessageAction.cs, Actions/SendRawMessage/*, Actions/TrackEvent/TrackEventSettings.cs, Actions/CreateTicket/CreateTicketAction.cs, and Actions/Redirect/RedirectAction.cs. Changes from C# to TypeScript: `ServicosDoMotor` injected by the `api` sends messages, opens tickets, and records events (originally `ISender` and Blip extensions); typing `Task.Delay` is not awaited because the engine runs inside the inbound transaction. `ForwardToDesk` and `LeavingFromDesk` are Blip server actions absent from the SDK; their behavior follows the exported editor block, including `desk_forwardToDeskState_status`.
 */

import type { ActionDeadline, CommandRequest, Context, DeskUnavailableStatus, PedidoDeHttp } from './context.js';
import { CONTEXT_STATE_URI, matchCommand } from './commands.js';
import { scriptVariables } from './script-variables.js';
import { DeskUnavailable, KEY_OF_STATE_CURRENT, KEY_OF_TICKET, deleteVariable as deleteContextVariable, getVariable, maskSecrets, setVariable as setContextVariable, stateKey } from './context.js';
import { runLocalCommand } from './builder-commands.js';

export type Settings = Record<string, unknown> | null;

/** `IAction`. */
export interface AcaoDoMotor {
  tipo: string;
  /** `prazo`: the deadline `processActions` enforces for this call (absent when run directly). */
  executar(context: Context, settings: Settings, prazo?: ActionDeadline): Promise<void>;
}

export type ActionsProvider = ReadonlyMap<string, AcaoDoMotor>;

/** Newtonsoft matches property names without case sensitivity (`Variable`/`variable`). */
function campo(settings: Settings, nome: string): unknown {
  if (!settings) return undefined;
  const key = Object.keys(settings).find((k) => k.toLowerCase() === nome.toLowerCase());
  return key === undefined ? undefined : settings[key];
}

const comoTexto = (v: unknown): string | null =>
  v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v);

/** Generic platform actions remain marked external when their settings are outside D-20's Pipe subset. */
export const EXTERNAL_DEPENDENCY_ACTIONS = [
  'SendCommand',
  'ProcessCommand',
  'ManageList',
  'SetBucket',
  'ProcessContentAssistant',
] as const;

function requireKnownCommand(tipo: string, settings: Record<string, unknown>, method: string): CommandRequest {
  const uri = comoTexto(campo(settings, 'uri'))?.trim();
  if (!uri) throw new Error(`O valor 'uri' é obrigatório na ação '${tipo}'.`);
  const command = matchCommand({ to: comoTexto(campo(settings, 'to')), method, uri });
  if (!command) throw new Error(`A URI '${uri}' não é executada no Pipe.`);
  return { uri, method, resource: campo(settings, 'resource') ?? null, command };
}

/** The resource may be `"onboarding"`, `{"resource":"onboarding"}` or that JSON as text, as Blip exports it. */
function stateOfResource(resource: unknown): string | null {
  let valor: unknown = resource;
  if (typeof valor === 'string') {
    const texto = valor.trim();
    try {
      valor = JSON.parse(texto);
    } catch {
      return texto || null;
    }
  }
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) valor = campo(valor as Settings, 'resource');
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

const nativeCommand = (tipo: 'SendCommand' | 'ProcessCommand'): AcaoDoMotor => ({
  tipo,
  async executar(context, settings) {
    const c = requireSettings(this.tipo, settings);
    const contextUri = comoTexto(campo(c, 'uri'))?.trim().match(CONTEXT_STATE_URI);
    if (contextUri && (comoTexto(campo(c, 'method')) ?? '').toLowerCase() === 'set') {
      const flowId = contextUri[1]!;
      const stateId = stateOfResource(campo(c, 'resource'));
      if (!stateId) throw new Error(`Informe o bloco de destino no resource da URI '${contextUri[0]}'.`);
      if (flowId === context.flow.id) setContextVariable(context, stateKey(flowId), stateId);
      else await context.services.setFlowState?.({ flowId, stateId });
      const output = comoTexto(campo(c, 'variable'))?.trim();
      if (tipo === 'ProcessCommand' && output) setContextVariable(context, output, '{"status":"success"}');
      return;
    }
    const method = (comoTexto(campo(c, 'method')) ?? (tipo === 'ProcessCommand' ? 'GET' : 'set')).toUpperCase();
    const request = { ...requireKnownCommand(this.tipo, c, method), flowId: context.flow.id };
    const local = await runLocalCommand(context, request);
    if (local) {
      if (tipo === 'SendCommand') return;
      const output = comoTexto(campo(c, 'variable'))?.trim();
      if (!output) throw new Error("O valor 'variable' é obrigatório na ação 'ProcessCommand'.");
      setContextVariable(context, output, JSON.stringify(local));
      return;
    }
    if (tipo === 'SendCommand') {
      if (!context.services.sendCommand) throw new Error("A ação 'SendCommand' não está disponível neste fluxo.");
      await context.services.sendCommand(request);
      return;
    }
    if (!context.services.processCommand) throw new Error("A ação 'ProcessCommand' não está disponível neste fluxo.");
    const result = await context.services.processCommand(request);
    const output = comoTexto(campo(c, 'variable'))?.trim();
    if (!output) throw new Error("O valor 'variable' é obrigatório na ação 'ProcessCommand'.");
    setContextVariable(context, output, comoTexto(result));
  },
});

const manageList: AcaoDoMotor = {
  tipo: 'ManageList',
  async executar(context, settings) {
    const c = requireSettings(this.tipo, settings);
    const name = comoTexto(campo(c, 'listName'))?.trim();
    if (!name) throw new Error("O valor 'listName' é obrigatório na ação 'ManageList'.");
    if (!context.services.listManage) throw new Error("A ação 'ManageList' não está disponível neste fluxo.");
    const operation = comoTexto(campo(c, 'action')) === 'Remove' ? 'Remove' : 'Add';
    await context.services.listManage({ name, operation });
  },
};

const setBucket: AcaoDoMotor = {
  tipo: 'SetBucket',
  async executar(context, settings) {
    const c = requireSettings(this.tipo, settings);
    const key = comoTexto(campo(c, 'id'))?.trim();
    const type = comoTexto(campo(c, 'type'))?.trim();
    if (!key) throw new Error("O valor 'id' é obrigatório na ação 'SetBucket'.");
    if (!type) throw new Error("O valor 'type' é obrigatório na ação 'SetBucket'.");
    if (!context.services.bucketSet) throw new Error("A ação 'SetBucket' não está disponível neste fluxo.");
    const expiration = Number(campo(c, 'expiration'));
    const global = campo(c, 'global') === true || campo(c, 'scope') === 'global';
    await context.services.bucketSet({
      key,
      type,
      value: campo(c, 'document') ?? null,
      scope: global ? 'global' : 'contact',
      expirationSeconds: Number.isFinite(expiration) && expiration > 0 ? expiration : undefined,
    });
  },
};

const processContentAssistant: AcaoDoMotor = {
  tipo: 'ProcessContentAssistant',
  async executar(context, settings) {
    const c = requireSettings(this.tipo, settings);
    const text = comoTexto(campo(c, 'text'))?.trim();
    const output = comoTexto(campo(c, 'outputVariable'))?.trim();
    if (!text) throw new Error("O valor 'text' é obrigatório na ação 'ProcessContentAssistant'.");
    if (!output) throw new Error("O valor 'outputVariable' é obrigatório na ação 'ProcessContentAssistant'.");
    if (!context.services.respondWithKnowledge) throw new Error("A ação 'ProcessContentAssistant' não está disponível neste fluxo.");
    const minimum = campo(c, 'score') === undefined || campo(c, 'score') === null ? 0 : Number(campo(c, 'score'));
    if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1) throw new Error("O valor 'score' deve estar entre 0 e 1.");
    const result = await context.services.respondWithKnowledge({ text, minimumConfidence: minimum, tags: comoTexto(campo(c, 'tags')) ?? undefined });
    setContextVariable(context, output, result.answer ?? 'Não sei responder com a base de conhecimento disponível.');
  },
};

const sendCommand = nativeCommand('SendCommand');
const processCommand = nativeCommand('ProcessCommand');

/** `ActionBase.ExecuteAsync` rejects null configuration before any work. */
function requireSettings(tipo: string, settings: Settings): Record<string, unknown> {
  if (!settings) throw new Error(`As configurações são obrigatórias na ação '${tipo}'.`);
  return settings;
}

const MIME = /^[\w.+-]+\/[\w.+-]+$/;

/** `SetVariableAction`. */
const setVariable: AcaoDoMotor = {
  tipo: 'SetVariable',
  async executar(context, settings) {
    const c = requireSettings(this.tipo, settings);
    const variable = comoTexto(campo(c, 'variable'));
    if (variable === null)
      throw new Error("O valor 'variable' é obrigatório na ação 'SetVariable'.");
    const expiration = Number(campo(c, 'expiration'));
    setContextVariable(
      context,
      variable,
      comoTexto(campo(c, 'value')),
      Number.isFinite(expiration) && expiration > 0 ? expiration : undefined,
    );
  },
};

/** `DeleteVariableAction`. */
const deleteVariable: AcaoDoMotor = {
  tipo: 'DeleteVariable',
  async executar(context, settings) {
    const c = requireSettings(this.tipo, settings);
    const variable = comoTexto(campo(c, 'variable'));
    if (variable === null)
      throw new Error("O valor 'variable' é obrigatório na ação 'DeleteVariable'.");
    deleteContextVariable(context, variable);
  },
};

/** `SendMessageAction`. */
const sendMessage: AcaoDoMotor = {
  tipo: 'SendMessage',
  async executar(context, settings, prazo) {
    const c = requireSettings(this.tipo, settings);
    const tipo = comoTexto(campo(c, 'type'));
    if (!tipo || !MIME.test(tipo)) throw new Error(`Tipo de mídia inválido: '${tipo}'.`);
    // ponytail: unlike the source, do not await typing `interval` (`Task.Delay`) here:
    // the engine runs inside the inbound transaction, and holding a connection for typing is costly.
    await context.services.send({
      tipo,
      conteudo: campo(c, 'content'),
      metadados: (campo(c, 'metadata') as Record<string, string> | undefined) ?? null,
    }, prazo?.signal);
  },
};

/**
 * Blip "Pesquisa" card (`SurveyMessage`, settings `type`, `scale`, `surveyContent`). Blip's server
 * renders it; Pipe sends the question as a menu whose options follow the chosen scale (1-3 or 1-5,
 * stars or numbers) or, for the recommendation survey, the two captured answers. The customer's
 * choice arrives as the next input, like any menu answer.
 */
const surveyMessage: AcaoDoMotor = {
  tipo: 'SurveyMessage',
  async executar(context, settings, prazo) {
    const c = requireSettings(this.tipo, settings);
    const type = comoTexto(campo(c, 'type')) ?? '';
    const scale = comoTexto(campo(c, 'scale')) ?? '';
    const question = comoTexto(campo(c, 'surveyContent'))?.trim();
    if (!type.trim()) throw new Error("O valor 'type' é obrigatório na ação 'SurveyMessage'.");
    if (!question) throw new Error("O valor 'surveyContent' é obrigatório na ação 'SurveyMessage'.");
    let options: string[];
    if (/recomendation/i.test(type)) {
      options = ['Recomendaria', 'Não recomendaria'];
    } else {
      if (!scale.trim()) throw new Error("O valor 'scale' é obrigatório na ação 'SurveyMessage'.");
      const size = /OneToThree/i.test(scale) ? 3 : 5;
      const stars = !/Number$/i.test(scale);
      options = Array.from({ length: size }, (_, i) => (stars ? '★'.repeat(i + 1) : String(i + 1)));
    }
    await context.services.send({
      tipo: 'application/vnd.lime.select+json',
      conteudo: { text: question, options: options.map((text, i) => ({ order: i + 1, text })) },
      metadados: (campo(c, 'metadata') as Record<string, string> | undefined) ?? null,
    }, prazo?.signal);
  },
};

/**
 * Blip `ForwardMessageToDesk` relays customer messages to the open ticket. Pipe already does this
 * by design: while a conversation is queued or with an agent, inbound messages go to Desk and never
 * reach the bot, so the action succeeds without doing anything.
 */
const forwardMessageToDesk: AcaoDoMotor = {
  tipo: 'ForwardMessageToDesk',
  async executar() {},
};

/** `SendRawMessageAction`. */
const sendRawMessage: AcaoDoMotor = {
  tipo: 'SendRawMessage',
  async executar(context, settings, prazo) {
    const c = requireSettings(this.tipo, settings);
    const bruto = comoTexto(campo(c, 'rawContent'));
    const tipo = comoTexto(campo(c, 'type'));
    if (bruto === null)
      throw new Error("O valor 'rawContent' é obrigatório na ação 'SendRawMessage'.");
    if (tipo === null) throw new Error("O valor 'type' é obrigatório na ação 'SendRawMessage'.");
    if (!MIME.test(tipo))
      throw new Error("O valor 'type' da ação 'SendRawMessage' precisa ser um MIME válido.");
    await context.services.send({
      tipo,
      conteudo: bruto,
      metadados: (campo(c, 'metadata') as Record<string, string> | undefined) ?? null,
      bruto: true,
    }, prazo?.signal);
  },
};

/** `TrackEventAction` requires `category` and `action`. */
const trackEvent: AcaoDoMotor = {
  tipo: 'TrackEvent',
  async executar(context, settings) {
    const c = requireSettings(this.tipo, settings);
    if (!comoTexto(campo(c, 'category'))?.trim()) {
      throw new Error("O valor 'category' é obrigatório na ação 'TrackEvent'.");
    }
    if (!comoTexto(campo(c, 'action'))?.trim()) {
      throw new Error("O valor 'action' é obrigatório na ação 'TrackEvent'.");
    }
    const value = comoTexto(campo(c, 'value'));
    const parsedValue = value === null || value.trim() === '' ? null : Number(value);
    await context.services.registerEvent({
      ...c,
      value: parsedValue !== null && Number.isFinite(parsedValue) ? parsedValue : null,
      fireAndForget: campo(c, 'fireAndForget') === false ? false : true,
      extras: campo(c, 'extras') ?? {},
    });
  },
};

/** `SendMessageFromHttpAction`: GET a declared resource and send its body as a LIME message. */
const sendMessageFromHttp: AcaoDoMotor = {
  tipo: 'SendMessageFromHttp',
  async executar(context, settings, prazo) {
    const c = requireSettings(this.tipo, settings);
    if (!context.services.callHttp) throw new Error('A ação SendMessageFromHttp não está disponível neste fluxo.');
    const uri = comoTexto(campo(c, 'uri'))?.trim();
    const type = comoTexto(campo(c, 'type'))?.trim();
    if (!uri) throw new Error("O valor 'uri' é obrigatório na ação 'SendMessageFromHttp'.");
    if (!type) throw new Error("O valor 'type' é obrigatório na ação 'SendMessageFromHttp'.");
    if (!MIME.test(type)) throw new Error("O valor 'type' da ação 'SendMessageFromHttp' precisa ser um MIME válido.");
    const headers = campo(c, 'headers');
    const cabecalhos: Record<string, string> = {};
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      for (const [key, value] of Object.entries(headers)) {
        const texto = comoTexto(value);
        if (texto !== null) cabecalhos[key] = texto;
      }
    }
    const timeout = Number(campo(c, 'requestTimeout'));
    const pedidoMs = Number.isFinite(timeout) && timeout > 0 ? timeout * 1000 : 60000;
    const resposta = await context.services.callHttp({
      metodo: 'GET',
      url: uri,
      cabecalhos,
      // The HTTP call never outlives the action: it runs inside the inbound transaction.
      timeoutMs: prazo ? Math.min(pedidoMs, prazo.timeLimitMs) : pedidoMs,
    }, prazo?.signal);
    prazo?.signal.throwIfAborted();
    if (resposta.status >= 400) throw new Error(`A ação 'SendMessageFromHttp' recebeu HTTP ${resposta.status}.`);
    await context.services.send({ tipo: type, conteudo: resposta.corpo }, prazo?.signal);
  },
};

/** `MergeContactAction`: the API service always writes the current execution contact. */
const mergeContact: AcaoDoMotor = {
  tipo: 'MergeContact',
  async executar(context, settings) {
    const c = requireSettings(this.tipo, settings);
    if (!context.services.mergeContact) throw new Error('A ação MergeContact não está disponível neste fluxo.');
    await context.services.mergeContact(c);
  },
};

/** `CreateTicketAction`: abre o atendimento e guarda o ticket em `{{ticket.*}}`. */
const createTicket: AcaoDoMotor = {
  tipo: 'CreateTicket',
  async executar(context, settings) {
    const c = requireSettings(this.tipo, settings);
    const attendance = await context.services.forwardForAttendance({
      origem: this.tipo,
      settings: c,
    });
    context.inboundContext.set(KEY_OF_TICKET, attendance);
    const variable = comoTexto(campo(c, 'variable'));
    if (variable?.trim()) setContextVariable(context, variable, attendance.id);
  },
};

/** Variable tested by the Blip editor's attendance block on entry and exit. */
export const VARIABLE_OF_FORWARDING = 'desk_forwardToDeskState_status';

const UNAVAILABLE_STATUSES: readonly DeskUnavailableStatus[] = ['OutOfAttendanceHour', 'NoAgentAvailable'];

/**
 * The availability checks the current block has an exit for (Builder "Disponibilidade de
 * atendimento"). As in Blip, a block without that exit keeps opening the ticket, which then waits
 * in the queue.
 */
export function unavailabilityExits(context: Context): DeskUnavailableStatus[] {
  const stateId = context.inboundContext.get(KEY_OF_STATE_CURRENT);
  const state = context.flow.states.find((s) => s.id === stateId);
  const tested = new Set(
    (state?.outputs ?? []).flatMap((o) =>
      (o.conditions ?? []).filter((c) => c.variable === VARIABLE_OF_FORWARDING).flatMap((c) => c.values ?? []),
    ),
  );
  return UNAVAILABLE_STATUSES.filter((s) => tested.has(s));
}

/**
 * Blip server `ForwardToDesk`: the editor attendance block expects entry only when this variable is `Success`, and its default exit is `Error`. A failure therefore becomes a variable value rather than an exception. A closed queue or one with nobody online opens no ticket and yields `OutOfAttendanceHour`/`NoAgentAvailable`, which only a block with that exit asks for.
 */
const forwardToDesk: AcaoDoMotor = {
  tipo: 'ForwardToDesk',
  async executar(context, settings) {
    try {
      const unavailableWhen = unavailabilityExits(context);
      const attendance = await context.services.forwardForAttendance({
        origem: this.tipo,
        settings: settings,
        ...(unavailableWhen.length ? { unavailableWhen } : {}),
      });
      context.inboundContext.set(KEY_OF_TICKET, attendance);
      setContextVariable(context, VARIABLE_OF_FORWARDING, 'Success');
    } catch (error) {
      setContextVariable(context, VARIABLE_OF_FORWARDING, error instanceof DeskUnavailable ? error.status : 'Error');
    }
  },
};

/** Blip server `LeavingFromDesk`: in Pipe, Desk has already closed the ticket. */
const leavingFromDesk: AcaoDoMotor = {
  tipo: 'LeavingFromDesk',
  async executar() {},
};

/**
 * `RedirectAction` settings are a LIME `Redirect` document (`application/vnd.lime.redirect+json`). `address` is the router service NAME (`blip-api-schemas.md` §5.4) and `context` accompanies it. `ServicosDoMotor` moves the contact to another service; without a router this fails, as in Blip.
 */
const redirect: AcaoDoMotor = {
  tipo: 'Redirect',
  async executar(context, settings) {
    const c = requireSettings(this.tipo, settings);
    const endereco = comoTexto(campo(c, 'address'))?.trim();
    if (!endereco) throw new Error("O valor 'address' é obrigatório na ação 'Redirect'.");
    if (!context.services.redirect) {
      throw new Error('O redirecionamento só funciona num fluxo que é serviço de um roteador.');
    }
    await context.services.redirect({ endereco, context: campo(c, 'context') ?? null });
  },
};

/**
 * Blip `ProcessHttpAction`: HTTP status, including 4xx/5xx, becomes a variable rather than failing the action; network failure is represented by a synthetic service response. The injected service performs the call so the engine remains pure.
 */
const processHttp: AcaoDoMotor = {
  tipo: 'ProcessHttp',
  async executar(context, settings, prazo) {
    const c = requireSettings(this.tipo, settings);
    if (!context.services.callHttp) throw new Error('A ação ProcessHttp não está disponível neste fluxo.');
    const metodo = (comoTexto(campo(c, 'method')) ?? 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) {
      throw new Error(`Método HTTP inválido: '${metodo}'.`);
    }
    const uri = comoTexto(campo(c, 'uri'))?.trim();
    if (!uri) throw new Error("O valor 'uri' é obrigatório na ação 'ProcessHttp'.");
    const bruto = campo(c, 'headers');
    const cabecalhos: Record<string, string> = {};
    if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) {
      for (const [key, value] of Object.entries(bruto)) {
        const texto = comoTexto(value);
        if (texto !== null) cabecalhos[key] = texto;
      }
    }
    const bodyValue = campo(c, 'body');
    const corpo = bodyValue === undefined || bodyValue === null
      ? undefined
      : typeof bodyValue === 'string' ? bodyValue : JSON.stringify(bodyValue);
    const timeoutCru = campo(c, 'requestTimeout');
    const timeoutMs = typeof timeoutCru === 'number' && timeoutCru > 0 ? timeoutCru * 1000 : 60_000;
    const pedido: PedidoDeHttp = {
      metodo: metodo as PedidoDeHttp['metodo'], url: uri, cabecalhos, timeoutMs,
      ...(corpo === undefined ? {} : { corpo }),
      // A request carrying `{{secret.*}}` must be encrypted wherever the `api` stores it.
      ...(prazo?.secrets?.size ? { sensivel: true } : {}),
    };
    const cursor = context.inboundContext.get('process-http-cursor');
    if (context.services.suspendHttp && cursor) {
      await context.services.suspendHttp(pedido, cursor as never);
    }
    // Synchronous path (no suspension, e.g. the Builder test run): bounded by the action deadline.
    const resposta = await context.services.callHttp(
      prazo ? { ...pedido, timeoutMs: Math.min(pedido.timeoutMs, prazo.timeLimitMs) } : pedido,
      prazo?.signal,
    );
    prazo?.signal.throwIfAborted();
    const status = comoTexto(campo(c, 'responseStatusVariable'))?.trim();
    const bodyVariable = comoTexto(campo(c, 'responseBodyVariable'))?.trim();
    if (status) setContextVariable(context, status, String(resposta.status));
    // A service that echoes the credential (or a network error quoting the URL) must not put it in context.
    if (bodyVariable) setContextVariable(context, bodyVariable, maskSecrets(resposta.corpo, prazo?.secrets));
  },
};

/** Blip's portal default for `builder:#localTimeZone` when the account has none. */
const BOT_TIME_ZONE_DEFAULT = 'America/Sao_Paulo';

/** Blip stores Windows zone ids; these are the ones a Brazilian/LatAm tenant realistically has. */
export const WINDOWS_TIME_ZONES: Readonly<Record<string, string>> = {
  'E. South America Standard Time': 'America/Sao_Paulo',
  'SA Eastern Standard Time': 'America/Cayenne',
  'Tocantins Standard Time': 'America/Araguaina',
  'Bahia Standard Time': 'America/Bahia',
  'Central Brazilian Standard Time': 'America/Cuiaba',
  'SA Western Standard Time': 'America/La_Paz',
  'SA Pacific Standard Time': 'America/Bogota',
  'UTC-02': 'Etc/GMT+2',
  'Argentina Standard Time': 'America/Buenos_Aires',
  'Pacific SA Standard Time': 'America/Santiago',
  'Paraguay Standard Time': 'America/Asuncion',
  'Montevideo Standard Time': 'America/Montevideo',
  'Venezuela Standard Time': 'America/Caracas',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'UTC': 'UTC',
};

/**
 * The bot's time zone as an IANA id, from `builder:#localTimeZone` (a Windows id in Blip, e.g.
 * `E. South America Standard Time`). An IANA id is accepted as is; anything unknown falls back to
 * Blip's own default, São Paulo.
 */
export function botTimeZone(configuration: Record<string, string> | null | undefined): string {
  const raw = configuration?.['builder:#localTimeZone']?.trim();
  if (!raw) return BOT_TIME_ZONE_DEFAULT;
  const mapped = WINDOWS_TIME_ZONES[raw] ?? raw;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: mapped });
    return mapped;
  } catch {
    return BOT_TIME_ZONE_DEFAULT;
  }
}

/** Blip limits: V1 (Jint) 5 s, V2 (V8/ClearScript) 10 s. */
const SCRIPT_TIMEOUT_MS = { 1: 5_000, 2: 10_000 } as const;

/**
 * `ExecuteScriptAction` / `ExecuteScriptV2Action`: `source` and `outputVariable` are required; input variables go to `function` (default `run`) as text, and the return value is stored like any context variable (text as is, anything else as JSON). V2 `captureExceptions` stores the script error in `exceptionVariable` instead of failing the action.
 */
function runScriptAction(version: 1 | 2): AcaoDoMotor['executar'] {
  return async function (this: AcaoDoMotor, context, settings) {
    const c = requireSettings(this.tipo, settings);
    if (!context.services.runScript) throw new Error(`A ação ${this.tipo} não está disponível neste fluxo.`);
    const source = comoTexto(campo(c, 'source'));
    if (!source?.trim()) throw new Error(`O valor 'source' é obrigatório na ação '${this.tipo}'.`);
    const output = comoTexto(campo(c, 'outputVariable'))?.trim();
    if (!output) throw new Error(`O valor 'outputVariable' é obrigatório na ação '${this.tipo}'.`);
    const inputs = campo(c, 'inputVariables');
    const names = Array.isArray(inputs) ? inputs.map((n) => comoTexto(n)?.trim() ?? '') : [];
    const args = await Promise.all(names.map((n) => (n ? getVariable(context, n) : null)));
    const exceptionVariable = comoTexto(campo(c, 'exceptionVariable'))?.trim();
    const capture = version === 2 && campo(c, 'captureExceptions') === true && !!exceptionVariable;
    const localTimeZone = campo(c, 'localTimeZoneEnabled') === true;
    try {
      const result = await context.services.runScript({
        version,
        source,
        functionName: comoTexto(campo(c, 'function'))?.trim() || 'run',
        args,
        timeoutMs: SCRIPT_TIMEOUT_MS[version],
        localTimeZone,
        timeZone: localTimeZone ? botTimeZone(context.flow.configuration) : 'UTC',
        ...(version === 2 ? { variables: scriptVariables(context) } : {}),
      });
      setContextVariable(context, output, comoTexto(result));
    } catch (error) {
      if (!capture) throw error;
      setContextVariable(context, exceptionVariable!, error instanceof Error ? error.message : String(error));
    }
  };
}

const executeScript: AcaoDoMotor = { tipo: 'ExecuteScript', executar: runScriptAction(1) };
const executeScriptV2: AcaoDoMotor = { tipo: 'ExecuteScriptV2', executar: runScriptAction(2) };

const executeTemplate: AcaoDoMotor = {
  tipo: 'ExecuteTemplate',
  executar: async function (context, settings) {
    const c = requireSettings(this.tipo, settings);
    const template = comoTexto(campo(c, 'template'));
    const output = comoTexto(campo(c, 'outputVariable'))?.trim();
    if (!template) throw new Error(`O valor 'template' é obrigatório na ação '${this.tipo}'.`);
    if (!output) throw new Error(`O valor 'outputVariable' é obrigatório na ação '${this.tipo}'.`);
    const inputs = campo(c, 'inputVariables');
    const names = Array.isArray(inputs) ? inputs.map((n) => comoTexto(n)?.trim() ?? '') : [];
    const values: Record<string, unknown> = {};
    for (const name of names) {
      if (!name) continue;
      const value = await getVariable(context, name);
      try { values[name] = value === null ? null : JSON.parse(value); } catch { values[name] = value; }
    }
    const result = template.replace(/{{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*}}/g, (_match, path: string) => {
      let value: unknown = values[path.split('.')[0]!];
      for (const part of path.split('.').slice(1)) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
      return value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
    });
    setContextVariable(context, output, result);
  },
};

const executeBlipFunction: AcaoDoMotor = {
  tipo: 'ExecuteBlipFunction',
  executar: async function (context, settings) {
    const c = requireSettings(this.tipo, settings);
    if (!context.services.runFlowFunction) {
      throw new Error(`A ação ${this.tipo} não está disponível neste fluxo.`);
    }
    // Blip stores the library function's UUID in `source` (its validator requires a UUID there);
    // `functionId` is what Pipe's Builder wrote before P10 and keeps working.
    const functionId = (comoTexto(campo(c, 'source'))?.trim() || comoTexto(campo(c, 'functionId'))?.trim()) ?? '';
    if (!functionId) throw new Error(`O valor 'source' é obrigatório na ação '${this.tipo}'.`);
    const output = comoTexto(campo(c, 'outputVariable'))?.trim();
    if (!output) throw new Error(`O valor 'outputVariable' é obrigatório na ação '${this.tipo}'.`);
    const inputs = campo(c, 'inputVariables');
    const names = Array.isArray(inputs) ? inputs.map((n) => comoTexto(n)?.trim() ?? '') : [];
    const args = await Promise.all(names.map((n) => (n ? getVariable(context, n) : null)));
    const result = await context.services.runFlowFunction({ functionId, args });
    setContextVariable(context, output, comoTexto(result));
  },
};

/**
 * Blip adds `TrackContactsJourney` to every block of an exported flow to feed its "Jornada dos
 * contatos" report. Pipe builds that report from each execution's visited blocks
 * (`execucao_passo`, `carregarJornada`), so the action has nothing to record here; it must still
 * succeed, or every imported Blip flow fails on its first block.
 */
const trackContactsJourney: AcaoDoMotor = {
  tipo: 'TrackContactsJourney',
  async executar() {},
};

export const ACTIONS_OF_MOTOR: readonly AcaoDoMotor[] = [
  trackContactsJourney,
  setVariable,
  deleteVariable,
  sendMessage,
  sendRawMessage,
  surveyMessage,
  forwardMessageToDesk,
  trackEvent,
  sendMessageFromHttp,
  mergeContact,
  createTicket,
  forwardToDesk,
  leavingFromDesk,
  redirect,
  processHttp,
  executeScript,
  executeScriptV2,
  executeTemplate,
  executeBlipFunction,
  sendCommand,
  processCommand,
  manageList,
  setBucket,
  processContentAssistant,
];

/** Default `ActionProvider` containing actions Pipe executes. */
export const PROVEDOR_PADRAO: ActionsProvider = new Map(ACTIONS_OF_MOTOR.map((a) => [a.tipo, a]));

/** `ActionProvider.Get` treats an unimplemented type as an error, never an ignored action. */
export function obterAcao(provedor: ActionsProvider, tipo: string): AcaoDoMotor {
  const acao = provedor.get(tipo);
  if (!acao) throw new Error(`A ação do tipo '${tipo}' não existe no Pipe.`);
  return acao;
}

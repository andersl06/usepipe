/**
 * Ported from takenet/blip-sdk-csharp (Apache-2.0): src/Take.Blip.Builder/Actions/{ActionBase,ActionProvider}.cs; Actions/SetVariable/*, Actions/DeleteVariable/*, Actions/SendMessage/SendMessageAction.cs, Actions/SendRawMessage/*, Actions/TrackEvent/TrackEventSettings.cs, Actions/CreateTicket/CreateTicketAction.cs, and Actions/Redirect/RedirectAction.cs. Changes from C# to TypeScript: `ServicosDoMotor` injected by the `api` sends messages, opens tickets, and records events (originally `ISender` and Blip extensions); typing `Task.Delay` is not awaited because the engine runs inside the inbound transaction. `ForwardToDesk` and `LeavingFromDesk` are Blip server actions absent from the SDK; their behavior follows the exported editor block, including `desk_forwardToDeskState_status`.
 */

import type { Context, PedidoDeHttp } from './context.js';
import { KEY_OF_TICKET, apagarVariable, definirVariable } from './context.js';

export type Settings = Record<string, unknown> | null;

/** `IAction`. */
export interface AcaoDoMotor {
  tipo: string;
  executar(context: Context, settings: Settings): Promise<void>;
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

/** `ActionBase.ExecuteAsync` rejects null configuration before any work. */
function exigirSettings(tipo: string, settings: Settings): Record<string, unknown> {
  if (!settings) throw new Error(`As configurações são obrigatórias na ação '${tipo}'.`);
  return settings;
}

const MIME = /^[\w.+-]+\/[\w.+-]+$/;

/** `SetVariableAction`. */
const setVariable: AcaoDoMotor = {
  tipo: 'SetVariable',
  async executar(context, settings) {
    const c = exigirSettings(this.tipo, settings);
    const variable = comoTexto(campo(c, 'variable'));
    if (variable === null)
      throw new Error("O valor 'variable' é obrigatório na ação 'SetVariable'.");
    definirVariable(context, variable, comoTexto(campo(c, 'value')));
  },
};

/** `DeleteVariableAction`. */
const deleteVariable: AcaoDoMotor = {
  tipo: 'DeleteVariable',
  async executar(context, settings) {
    const c = exigirSettings(this.tipo, settings);
    const variable = comoTexto(campo(c, 'variable'));
    if (variable === null)
      throw new Error("O valor 'variable' é obrigatório na ação 'DeleteVariable'.");
    apagarVariable(context, variable);
  },
};

/** `SendMessageAction`. */
const sendMessage: AcaoDoMotor = {
  tipo: 'SendMessage',
  async executar(context, settings) {
    const c = exigirSettings(this.tipo, settings);
    const tipo = comoTexto(campo(c, 'type'));
    if (!tipo || !MIME.test(tipo)) throw new Error(`Tipo de mídia inválido: '${tipo}'.`);
    // ponytail: unlike the source, do not await typing `interval` (`Task.Delay`) here:
    // the engine runs inside the inbound transaction, and holding a connection for typing is costly.
    await context.services.send({
      tipo,
      conteudo: campo(c, 'content'),
      metadados: (campo(c, 'metadata') as Record<string, string> | undefined) ?? null,
    });
  },
};

/** `SendRawMessageAction`. */
const sendRawMessage: AcaoDoMotor = {
  tipo: 'SendRawMessage',
  async executar(context, settings) {
    const c = exigirSettings(this.tipo, settings);
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
    });
  },
};

/** `TrackEventAction` requires `category` and `action`. */
const trackEvent: AcaoDoMotor = {
  tipo: 'TrackEvent',
  async executar(context, settings) {
    const c = exigirSettings(this.tipo, settings);
    if (!comoTexto(campo(c, 'category'))?.trim()) {
      throw new Error("O valor 'category' é obrigatório na ação 'TrackEvent'.");
    }
    if (!comoTexto(campo(c, 'action'))?.trim()) {
      throw new Error("O valor 'action' é obrigatório na ação 'TrackEvent'.");
    }
    await context.services.registerEvent(c);
  },
};

/** `CreateTicketAction`: abre o atendimento e guarda o ticket em `{{ticket.*}}`. */
const createTicket: AcaoDoMotor = {
  tipo: 'CreateTicket',
  async executar(context, settings) {
    const c = exigirSettings(this.tipo, settings);
    const attendance = await context.services.encaminharForAttendance({
      origem: this.tipo,
      settings: c,
    });
    context.inboundContext.set(KEY_OF_TICKET, attendance);
    const variable = comoTexto(campo(c, 'variable'));
    if (variable?.trim()) definirVariable(context, variable, attendance.id);
  },
};

/** Variable tested by the Blip editor's attendance block on entry and exit. */
export const VARIABLE_OF_FORWARDING = 'desk_forwardToDeskState_status';

/**
 * Blip server `ForwardToDesk`: the editor attendance block expects entry only when this variable is `Success`, and its default exit is `Error`. A failure therefore becomes a variable value rather than an exception.
 */
const forwardToDesk: AcaoDoMotor = {
  tipo: 'ForwardToDesk',
  async executar(context, settings) {
    try {
      const attendance = await context.services.encaminharForAttendance({
        origem: this.tipo,
        settings: settings,
      });
      context.inboundContext.set(KEY_OF_TICKET, attendance);
      definirVariable(context, VARIABLE_OF_FORWARDING, 'Success');
    } catch {
      definirVariable(context, VARIABLE_OF_FORWARDING, 'Error');
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
    const c = exigirSettings(this.tipo, settings);
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
  async executar(context, settings) {
    const c = exigirSettings(this.tipo, settings);
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
    const corpoValue = campo(c, 'body');
    const corpo = corpoValue === undefined || corpoValue === null
      ? undefined
      : typeof corpoValue === 'string' ? corpoValue : JSON.stringify(corpoValue);
    const timeoutCru = campo(c, 'requestTimeout');
    const timeoutMs = typeof timeoutCru === 'number' && timeoutCru > 0 ? timeoutCru * 1000 : 60_000;
    const pedido: PedidoDeHttp = {
      metodo: metodo as PedidoDeHttp['metodo'], url: uri, cabecalhos, timeoutMs,
      ...(corpo === undefined ? {} : { corpo }),
    };
    const cursor = context.inboundContext.get('process-http-cursor');
    if (context.services.suspendHttp && cursor) {
      await context.services.suspendHttp(pedido, cursor as never);
    }
    const resposta = await context.services.callHttp(pedido);
    const status = comoTexto(campo(c, 'responseStatusVariable'))?.trim();
    const corpoVariable = comoTexto(campo(c, 'responseBodyVariable'))?.trim();
    if (status) definirVariable(context, status, String(resposta.status));
    if (corpoVariable) definirVariable(context, corpoVariable, resposta.corpo);
  },
};

export const ACTIONS_OF_MOTOR: readonly AcaoDoMotor[] = [
  setVariable,
  deleteVariable,
  sendMessage,
  sendRawMessage,
  trackEvent,
  createTicket,
  forwardToDesk,
  leavingFromDesk,
  redirect,
  processHttp,
];

/** Default `ActionProvider` containing actions Pipe executes. */
export const PROVEDOR_PADRAO: ActionsProvider = new Map(ACTIONS_OF_MOTOR.map((a) => [a.tipo, a]));

/** `ActionProvider.Get` treats an unimplemented type as an error, never an ignored action. */
export function obterAcao(provedor: ActionsProvider, tipo: string): AcaoDoMotor {
  const acao = provedor.get(tipo);
  if (!acao) throw new Error(`A ação do tipo '${tipo}' não existe no Pipe.`);
  return acao;
}

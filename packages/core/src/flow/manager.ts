/**
 * Ported from takenet/blip-sdk-csharp (Apache-2.0): src/Take.Blip.Builder/FlowManager.cs (`ProcessInputAsync`, `ProcessActionsAsync`, `ProcessOutputsAsync`, `ValidateInputAsync`, `ValidateDocument`), Hosting/ConventionsConfiguration.cs (limits), Constants.cs (date formats), and FlowConstructionException, ActionProcessingException, OutputProcessingException, BuilderException. Changes from C# to TypeScript: no semaphore because the `api` locks the execution row in the database; no remote trace because the returned trace becomes `execucao_passo`; subflows and `inputExpiration` throw; `ExecuteBlipFunction` maps to `ExecuteScriptV2`; no monitoring logs. Preserve execution order: global entry actions → validate input and store `input.variable` → state exit actions → first matching output → after-state-change actions → store state → next state entry actions → repeat until input is awaited → global exit actions.
 */

import { evaluateConditions, paraDecimal } from './condition.js';
import type {
  Context,
  CursorDeProcessHttp,
  ActionsSuspendedList,
  PedidoDeHttp,
  RespostaDeHttp,
} from './context.js';
import {
  KEY_OF_STATE_CURRENT,
  deleteStateId,
  setStatePreviousId,
  setStateId,
  setVariable,
  getStateId,
  replaceVariables,
} from './context.js';
import type { Acao, State, FlowBlip, InboundValidation } from './modelos.js';
import { contextEhVariable, validateFlow } from './modelos.js';
import type { ActionsProvider } from './actions.js';
import { PROVEDOR_PADRAO, obterAcao } from './actions.js';
import { interpretSatisfactionAnswer } from './satisfaction-survey.js';

/** `ConventionsConfiguration` values match the source. */
export interface EngineConfiguration {
  /** `MaxTransitionsByInput` guards against loops. */
  maxTransitionsByInbound: number;
  /** `InputProcessingTimeout`. */
  inboundTimeLimitMs: number;
  /** `DefaultActionExecutionTimeout` applies when an action supplies none. */
  defaultActionTimeLimitMs: number;
}

export const CONFIGURATION_DEFAULT: EngineConfiguration = {
  maxTransitionsByInbound: 10,
  inboundTimeLimitMs: 60_000,
  defaultActionTimeLimitMs: 30_000,
};

/** `ActionTrace`, o que sobrou dele. */
export interface RastroDeAcao {
  tipo: string;
  error?: string;
  esquecida?: boolean;
}

/** `StateTrace`. */
export interface StateTrace {
  stateId: string;
  actions: RastroDeAcao[];
  nextStateId?: string | null;
  error?: string;
}

/** `InputTrace`. */
export interface InboundTrace {
  estados: StateTrace[];
  actionsGlobal: RastroDeAcao[];
  /** State left for the user; null means the next contact starts at the root. */
  stateFinalId: string | null;
  error?: string;
}

/** `FlowConstructionException`. */
export class BuildFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroDeConstrucaoDeFluxo';
  }
}

/** `ActionProcessingException`. */
export class ProcessingActionError extends Error {
  constructor(
    message: string,
    readonly tipoDaAcao: string,
    override readonly cause: unknown,
  ) {
    super(message);
    this.name = 'ErroDeProcessamentoDeAcao';
  }
}

/** `OutputProcessingException`. */
export class ProcessingOutputError extends Error {
  constructor(
    message: string,
    readonly outputState: string,
    override readonly cause: unknown,
  ) {
    super(message);
    this.name = 'ErroDeProcessamentoDeSaida';
  }
}

/** `BuilderException`: engine error carrying the trace up to the failure. */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly stateId: string | null,
    readonly rastro: InboundTrace,
    override readonly cause: unknown,
  ) {
    super(message);
    this.name = 'ErroDoMotor';
  }
}

export class SuspensaoDeProcessHttp extends Error {
  override readonly name = 'SuspensaoDeProcessHttp';
  rastro?: InboundTrace;

  constructor(
    readonly pedido: PedidoDeHttp,
    readonly cursor: Omit<CursorDeProcessHttp, 'resposta'>,
  ) {
    super('ProcessHttp suspenso para execução fora da transação.');
  }
}

class TimeExpired extends Error {}

/** Actions whose `source` is JavaScript: never substituted (WR-03). */
const SCRIPT_ACTIONS = new Set(['ExecuteScript', 'ExecuteScriptV2']);

/**
 * `Promise.race` alone leaves the losing action running; `controle` is aborted at the deadline so
 * the action (and the services it handed the signal to) stop instead of working past it.
 */
function withTimeLimit<T>(executar: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controle = new AbortController();
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => {
      const erro = new TimeExpired();
      controle.abort(erro);
      rejeitar(erro);
    }, ms);
  });
  return Promise.race([executar(controle.signal), limite]).finally(() => clearTimeout(relogio));
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface EngineOptions {
  configuration?: Partial<EngineConfiguration>;
  actions?: ActionsProvider;
  retomarProcessHttp?: CursorDeProcessHttp;
}

/**
 * `FlowManager.ProcessInputAsync` processes ONE user input. The `api` loads and stores state and variables in `contexto.variaveis`. Return the trace, or throw `ErroDoMotor` with the trace up to the error.
 */
export async function processInbound(
  context: Context,
  options: EngineOptions = {},
): Promise<InboundTrace> {
  const configuration = { ...CONFIGURATION_DEFAULT, ...options.configuration };
  const provedor = options.actions ?? PROVEDOR_PADRAO;
  const flow = context.flow;
  const rastro: InboundTrace = { estados: [], actionsGlobal: [], stateFinalId: null };
  const prazo = Date.now() + configuration.inboundTimeLimitMs;
  let state: State | null = null;
  const cursorPendente = options.retomarProcessHttp
    ? { ...options.retomarProcessHttp, consumido: false }
    : null;

  try {
    validateFlow(flow);

    // Restore stored state; use the root if absent or missing from this flow.
    const stateId = getStateId(context);
    state = flow.states.find((s) => s.id === stateId) ?? flow.states.find((s) => s.root)!;

    let transitions = 0;
    if (flow.inputActions) {
      await processActions(
        context,
        flow.inputActions,
        state,
        provedor,
        configuration,
        rastro.actionsGlobal,
        'entrada',
        null,
        cursorPendente,
      );
    }

    let waitInbound = true;
    let atual: StateTrace = { stateId: state.id, actions: [] };
    rastro.estados.push(atual);

    // Resuming a ProcessHttp suspended in the restored state's own entering actions: state
    // entering actions only run once, right after a transition (below, inside the loop), so a
    // resume that restores an already-current state must finish them here before the loop falls
    // through to that state's content/output actions.
    // The inbound message was already consumed by the state before the suspension, so after
    // finishing the entering actions decide exactly as the loop's `finally` does: a state that
    // awaits input stops here and waits for the NEXT message; one that does not continues to
    // its content/outputs without re-reading the old message as its answer.
    let aguardaProxima = false;
    if (
      cursorPendente &&
      !cursorPendente.consumido &&
      cursorPendente.lista === 'entrada' &&
      cursorPendente.estadoId === state.id
    ) {
      await processActions(
        context,
        state.inputActions,
        state,
        provedor,
        configuration,
        atual.actions,
        'entrada',
        state.id,
        cursorPendente,
      );
      const inboundCondition =
        !state.input?.conditions ||
        (await evaluateConditions(state.input.conditions, context.inbound, context));
      aguardaProxima = !!state.input && !state.input.bypass && inboundCondition;
      waitInbound = false;
    }

    if (!aguardaProxima) do {
      try {
        if (Date.now() > prazo) {
          throw new TimeExpired(
            `O processamento da entrada excedeu ${configuration.inboundTimeLimitMs} ms.`,
          );
        }
        const corrente: State = state!;

        if (waitInbound) {
          if (!(await stateValidateInbound(context, corrente))) break;
          if (corrente.input?.variable) {
            setVariable(
              context,
              corrente.input.variable,
              context.inbound.serializedContent,
            );
          }
          const satisfactionAnswer = interpretSatisfactionAnswer(
            corrente,
            context.inbound.serializedContent,
          );
          if (satisfactionAnswer) {
            await context.services.recordSatisfactionAnswer?.(satisfactionAnswer);
          }
        }

        await processActions(
          context,
          corrente.outputActions,
          corrente,
          provedor,
          configuration,
          atual.actions,
          'conteudo',
          corrente.id,
          cursorPendente,
        );

        let anteriorId = corrente.id;
        if (contextEhVariable(anteriorId))
          anteriorId = await replaceVariables(anteriorId, context);

        if (corrente.end) {
          // `RedirectToParentFlowAsync`: the source throws when there is no parent flow.
          throw new BuildFlowError(
            `O estado '${corrente.id}' é de fim de subfluxo, e subfluxo não existe no Pipe.`,
          );
        }

        state = await processarSaidas(context, flow, corrente);
        setStatePreviousId(context, anteriorId);

        // Run after-state-change actions only when the state actually changed.
        if (corrente.id !== state?.id) {
          await processActions(
            context,
            corrente.afterStateChangedActions,
            corrente,
            provedor,
            configuration,
            atual.actions,
            'saida',
            corrente.id,
            cursorPendente,
          );
          if (flow.afterStateChangedActions) {
            await processActions(
              context,
              flow.afterStateChangedActions,
              state,
              provedor,
              configuration,
              rastro.actionsGlobal,
              'saida',
              null,
              cursorPendente,
            );
          }
        }

        if (state?.id.startsWith('subflow:')) {
          throw new BuildFlowError(
            `O estado '${state.id}' é subfluxo, e subfluxo não existe no Pipe.`,
          );
        }

        atual.nextStateId = state?.id ?? null;
        if (state) {
          atual = { stateId: state.id, actions: [] };
          rastro.estados.push(atual);
          setStateId(context, state.id);
        } else {
          deleteStateId(context);
        }

        await processActions(
          context,
          state?.inputActions,
          state,
          provedor,
          configuration,
          atual.actions,
          'entrada',
          state?.id ?? null,
          cursorPendente,
        );

        // Guard against a flow loop.
        if (transitions++ >= configuration.maxTransitionsByInbound) {
          throw new BuildFlowError(
            `O limite de ${configuration.maxTransitionsByInbound} transições de estado por entrada foi atingido.`,
          );
        }
      } catch (error) {
        atual.error = messageOf(error);
        throw error;
      } finally {
        // Continue while the next state does not await input.
        const inboundCondition =
          !state?.input?.conditions ||
          (await evaluateConditions(state.input.conditions, context.inbound, context));
        waitInbound =
          state === null || (!!state.input && !state.input.bypass && inboundCondition);
      }
    } while (!waitInbound);

    if (flow.outputActions) {
      await processActions(
        context,
        flow.outputActions,
        state,
        provedor,
        configuration,
        rastro.actionsGlobal,
        'conteudo',
        null,
        cursorPendente,
      );
    }

    rastro.stateFinalId = state?.id ?? null;
    return rastro;
  } catch (error) {
    if (error instanceof SuspensaoDeProcessHttp) {
      error.rastro = rastro;
      throw error;
    }
    rastro.error = messageOf(error);
    rastro.stateFinalId = getStateId(context);
    throw new EngineError(
      `Erro ao processar a entrada '${context.inbound.message.id}' do usuário '${context.user}' no estado '${state?.id ?? ''}': ${messageOf(error)}`,
      state?.id ?? null,
      rastro,
      error,
    );
  }
}

/** `ProcessActionsAsync`. */
async function processActions(
  context: Context,
  actions: readonly Acao[] | null | undefined,
  state: State | null,
  provedor: ActionsProvider,
  configuration: EngineConfiguration,
  rastro: RastroDeAcao[],
  lista: ActionsSuspendedList,
  stateId: string | null,
  cursor: (CursorDeProcessHttp & { resposta?: RespostaDeHttp; consumido?: boolean }) | null,
): Promise<void> {
  if (!actions) return;
  // `OrderBy` is stable, as is `sort`: without `order`, retain file order.
  const ordenadas = [...actions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const alvo = cursor && cursor.lista === lista && cursor.estadoId === stateId ? cursor : null;
  if (cursor && !cursor.consumido && !alvo) return;
  for (const [indice, flowAction] of ordenadas.entries()) {
    if (
      flowAction.conditions &&
      !(await evaluateConditions(flowAction.conditions, context.inbound, context))
    ) {
      continue;
    }

    const tipo = flowAction.type;
    const acao = obterAcao(provedor, tipo);
    const passo: RastroDeAcao = { tipo: flowAction.type };
    rastro.push(passo);

    const timeLimit =
      typeof flowAction.timeout === 'number'
        ? flowAction.timeout * 1000
        : configuration.defaultActionTimeLimitMs;

    try {
      let settings: Record<string, unknown> | null = null;
      if (flowAction.settings !== undefined && flowAction.settings !== null) {
        // Pipe decision (security, diverges from Blip): script code is never a template. The JSON
        // escape only protects the settings JSON, not the JavaScript around the value, so a
        // customer message in `{{input.content}}` would become code in the sandbox (with the
        // tenant's fetch/mTLS). Scripts receive customer data only through `inputVariables`.
        const codigo = SCRIPT_ACTIONS.has(acao.tipo)
          ? Object.entries(flowAction.settings).filter(([k]) => k.toLowerCase() === 'source')
          : [];
        const resto = codigo.length > 0
          ? Object.fromEntries(Object.entries(flowAction.settings).filter(([k]) => k.toLowerCase() !== 'source'))
          : flowAction.settings;
        let texto = JSON.stringify(resto);
        // `ExecuteTemplate` receives the raw template; other actions receive substituted variables.
        if (acao.tipo !== 'ExecuteTemplate') texto = await replaceVariables(texto, context);
        settings = { ...(JSON.parse(texto) as Record<string, unknown>), ...Object.fromEntries(codigo) };
      }
      context.inboundContext.set(KEY_OF_STATE_CURRENT, state?.id ?? null);
      if (flowAction.type === 'ProcessHttp' && context.services.suspendHttp) {
        context.inboundContext.set('process-http-cursor', {
          lista,
          estadoId: stateId,
          indice,
        });
      }
      if (alvo && indice < alvo.indice) continue;
      if (alvo && !cursor?.consumido && indice === alvo.indice) {
        if (!alvo.resposta) throw new Error('A retomada de ProcessHttp não tem resposta.');
        const status = typeof settings?.['responseStatusVariable'] === 'string'
          ? settings['responseStatusVariable'].trim() : '';
        const corpo = typeof settings?.['responseBodyVariable'] === 'string'
          ? settings['responseBodyVariable'].trim() : '';
        if (status) setVariable(context, status, String(alvo.resposta.status));
        if (corpo) setVariable(context, corpo, alvo.resposta.corpo);
        if (cursor) cursor.consumido = true;
        continue;
      }
      await withTimeLimit(
        (signal) => acao.executar(context, settings, { signal, timeLimitMs: timeLimit }),
        timeLimit,
      );
    } catch (error) {
      if (error instanceof SuspensaoDeProcessHttp) throw error;
      passo.error = messageOf(error);
      const message =
        error instanceof TimeExpired
          ? `O processamento da ação '${flowAction.type}' excedeu o tempo limite de ${timeLimit} ms.`
          : `O processamento da ação '${flowAction.type}' falhou: ${messageOf(error)}`;
      if (flowAction.continueOnError) {
        passo.esquecida = true;
        continue;
      }
      throw new ProcessingActionError(message, flowAction.type, error);
    }
  }
}

/** `ProcessOutputsAsync`: the first matching output wins; none produces a null state. */
async function processarSaidas(
  context: Context,
  flow: FlowBlip,
  state: State,
): Promise<State | null> {
  const saidas = state.outputs;
  if (!saidas) return null;
  for (const saida of [...saidas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    try {
      if (
        !saida.conditions ||
        (await evaluateConditions(saida.conditions, context.inbound, context))
      ) {
        let alvo = saida.stateId;
        if (contextEhVariable(alvo)) alvo = await replaceVariables(alvo, context);
        const proximo = flow.states.find((s) => s.id === alvo);
        if (!proximo) {
          deleteStateId(context);
          throw new Error(
            `A variável de contexto da saída '${saida.stateId}' está indefinida ou não existe no fluxo.`,
          );
        }
        return proximo;
      }
    } catch (error) {
      throw new ProcessingOutputError(
        `Falha ao processar a condição da saída para o estado '${saida.stateId}': ${messageOf(error)}`,
        saida.stateId,
        error,
      );
    }
  }
  return null;
}

/**
 * `ValidateInputAsync`: invalid input sends an error message and stops; the user remains in the same state.
 */
async function stateValidateInbound(context: Context, state: State): Promise<boolean> {
  const validation = state.input?.validation;
  const conteudo = context.inbound.serializedContent;
  if (!validation || !conteudo || validateDocument(context, validation)) return true;
  if (validation.error) {
    // In Blip, an error containing `{{variável}}` is sent with `#message.spinText` and the server
    // substitutes the variable; here no server intervenes, so substitution happens first.
    const texto = contextEhVariable(validation.error)
      ? await replaceVariables(validation.error, context)
      : validation.error;
    await context.services.send({ tipo: 'text/plain', conteudo: texto });
  }
  return false;
}

/** `Constants.DateValidationFormats`. */
const FORMATOS_DE_DATA = [
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'dd-MM-yyyy',
  'MM-dd-yyyy',
  'dd-MM',
  'dd/MM',
  'MM-dd',
  'MM-dd-yy',
  'dd-MM-yy',
  'yyyy-MM-ddTHH:mm:ssK',
  'yyyy-dd-MMTHH:mm:ssK',
];

const TOKENS_DE_DATA: Record<string, string> = {
  yyyy: '(?<ano>\\d{4})',
  yy: '(?<ano>\\d{2})',
  MM: '(?<mes>\\d{2})',
  dd: '(?<dia>\\d{2})',
  HH: '(?<hora>\\d{2})',
  mm: '(?<minuto>\\d{2})',
  ss: '(?<segundo>\\d{2})',
  K: '(?<fuso>Z|[+-]\\d{2}:\\d{2})?',
};

/** `DateTime.TryParseExact` allowing spaces for the formats above. */
function casaData(texto: string, format: string): boolean {
  const padrao = format.replace(
    /yyyy|yy|MM|dd|HH|mm|ss|K|[^A-Za-z]/g,
    (t) => TOKENS_DE_DATA[t] ?? t.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&'),
  );
  const m = new RegExp(`^\\s*${padrao}\\s*$`).exec(texto);
  if (!m?.groups) return false;
  const { ano, mes, dia, hora, minuto, segundo } = m.groups;
  const a = ano === undefined ? 2000 : Number(ano.length === 2 ? `20${ano}` : ano);
  const me = Number(mes);
  const d = Number(dia);
  if (me < 1 || me > 12 || d < 1 || d > new Date(Date.UTC(a, me, 0)).getUTCDate()) return false;
  return (
    (hora === undefined || Number(hora) < 24) &&
    (minuto === undefined || Number(minuto) < 60) &&
    (segundo === undefined || Number(segundo) < 60)
  );
}

/** `ValidateDocument`. */
function validateDocument(context: Context, validation: InboundValidation): boolean {
  const conteudo = context.inbound.serializedContent;
  switch (validation.rule?.toLowerCase()) {
    case 'text':
      return context.inbound.message.tipo === 'text/plain';
    case 'number':
      return paraDecimal(conteudo) !== null;
    case 'date':
      return FORMATOS_DE_DATA.some((f) => casaData(conteudo, f));
    case 'regex':
      return new RegExp(validation.regex ?? '').test(conteudo);
    case 'type':
      return context.inbound.message.tipo === validation.type;
    default:
      throw new Error(`Regra de validação desconhecida: '${validation.rule}'.`);
  }
}

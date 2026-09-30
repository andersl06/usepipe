/**
 * Ported from takenet/blip-sdk-csharp (Apache-2.0): src/Take.Blip.Builder/FlowManager.cs (`ProcessInputAsync`, `ProcessActionsAsync`, `ProcessOutputsAsync`, `ValidateInputAsync`, `ValidateDocument`), Hosting/ConventionsConfiguration.cs (limits), Constants.cs (date formats), and FlowConstructionException, ActionProcessingException, OutputProcessingException, BuilderException. Changes from C# to TypeScript: no semaphore because the `api` locks the execution row in the database; no remote trace because the returned trace becomes `execucao_passo`; subflows (`IsSubflowState`, `RedirectToSubflowAsync`, `RedirectToParentFlowAsync`) persist their chain in `currentFlowSession@{flowId}` instead of a per-input queue (`subflows.ts`); `inputExpiration` follows `input-expiration.ts`; `ExecuteBlipFunction` maps to `ExecuteScriptV2`; no monitoring logs. Preserve execution order: global entry actions → validate input and store `input.variable` → state exit actions → first matching output → after-state-change actions → store state → next state entry actions → repeat until input is awaited → global exit actions.
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
  ACTIONS_WITH_SECRETS,
  KEY_OF_STATE_CURRENT,
  maskSecrets,
  deleteStateId,
  setStatePreviousId,
  setStateId,
  setVariable,
  getStateId,
  pruneExpiredVariables,
  replaceVariables,
  timeSpanSeconds,
} from './context.js';
import type { Acao, State, FlowBlip, InboundValidation } from './modelos.js';
import { contextEhVariable, isSubflowState, validateFlow } from './modelos.js';
import type { FlowSession } from './subflows.js';
import { currentSubflow, enterSubflow, openFlowSessions, returnToCaller } from './subflows.js';
import type { ActionsProvider } from './actions.js';
import { PROVEDOR_PADRAO, obterAcao } from './actions.js';
import { interpretSatisfactionAnswer } from './satisfaction-survey.js';
import { inputExpirationStateId } from './input-expiration.js';

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
  /** Short name of the subflow this block belongs to; absent for the bot's own blocks. */
  subflow?: string;
}

/** `InputTrace`. */
export interface InboundTrace {
  estados: StateTrace[];
  actionsGlobal: RastroDeAcao[];
  /** State left for the user; null means the next contact starts at the root. */
  stateFinalId: string | null;
  error?: string;
  /** Short name of the subflow `stateFinalId` belongs to; absent in the bot's own flow. */
  subflow?: string;
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
  const root = context.flow;
  // The flow running now: the bot's flow or, while the contact is in one, a subflow.
  let flow = root;
  let sessions: FlowSession[] = [{ flow: root, shortName: null }];
  // `builder:actionExecutionTimeout` replaces the 30 s default, capped by the 60 s input limit.
  const flowActionTimeout = timeSpanSeconds(root.configuration?.['builder:actionExecutionTimeout']);
  const configuration = {
    ...CONFIGURATION_DEFAULT,
    ...(flowActionTimeout
      ? { defaultActionTimeLimitMs: Math.min(flowActionTimeout * 1000, CONFIGURATION_DEFAULT.inboundTimeLimitMs) }
      : {}),
    ...options.configuration,
  };
  const provedor = options.actions ?? PROVEDOR_PADRAO;
  pruneExpiredVariables(context.variables);
  const rastro: InboundTrace = { estados: [], actionsGlobal: [], stateFinalId: null };
  const prazo = Date.now() + configuration.inboundTimeLimitMs;
  let state: State | null = null;
  const cursorPendente = options.retomarProcessHttp
    ? { ...options.retomarProcessHttp, consumido: false }
    : null;

  /** A trace step, tagged with the subflow it runs in. */
  const traceStep = (stateId: string): StateTrace => {
    const subflow = currentSubflow(sessions);
    return { stateId, actions: [], ...(subflow ? { subflow } : {}) };
  };

  try {
    validateFlow(root);
    // The contact may be inside a subflow (or a chain of them): run where it stopped.
    sessions = openFlowSessions(context);
    flow = context.flow;

    // Restore stored state; use the root if absent or missing from this flow.
    const stateId = getStateId(context);
    state = flow.states.find((s) => s.id === stateId) ?? flow.states.find((s) => s.root)!;
    // `InputExpirationHandler.IsValidateState`: an expiration for a block the user already left
    // (or whose saved block expired) is dropped without running anything.
    const expiredStateId = inputExpirationStateId(context.inbound.message);
    if (expiredStateId !== null && expiredStateId !== stateId) {
      rastro.stateFinalId = stateId;
      return rastro;
    }
    // Each input renews the session: `builder:stateExpiration` counts inactivity, not time in a block.
    if (stateId === state.id) setStateId(context, state.id);

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
    let atual: StateTrace = traceStep(state.id);
    rastro.estados.push(atual);

    /**
     * Move to `next`: close the current trace step, save (or clear) the block and run its entering
     * actions. A `subflow:` block runs its own entering actions in the caller (Blip's "Entering
     * subflow" event), then hands the contact to the subflow's root, which runs its own.
     */
    const arrive = async (next: State | null): Promise<void> => {
      atual.nextStateId = next?.id ?? null;
      if (next) {
        atual = traceStep(next.id);
        rastro.estados.push(atual);
        setStateId(context, next.id);
      } else {
        deleteStateId(context);
      }
      await processActions(
        context,
        next?.inputActions,
        next,
        provedor,
        configuration,
        atual.actions,
        'entrada',
        next?.id ?? null,
        cursorPendente,
      );
      if (isSubflowState(next)) {
        const start = enterSubflow(context, sessions, next);
        flow = context.flow;
        state = start;
        await arrive(start);
      }
    };

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
      // A `subflow:` block suspended in its entering actions still has to hand the contact over.
      if (isSubflowState(state)) {
        const start = enterSubflow(context, sessions, state);
        flow = context.flow;
        state = start;
        await arrive(start);
      }
      const retomado: State = state!;
      const inboundCondition =
        !retomado.input?.conditions ||
        (await evaluateConditions(retomado.input.conditions, context.inbound, context));
      aguardaProxima = !!retomado.input && !retomado.input.bypass && inboundCondition;
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
          // The expiration input is empty: it must not overwrite what the variable holds.
          if (corrente.input?.variable && expiredStateId === null) {
            setVariable(
              context,
              corrente.input.variable,
              context.inbound.serializedContent,
            );
          }
          const satisfactionAnswer = interpretSatisfactionAnswer(
            corrente,
            context.inbound.serializedContent,
            { timedOut: expiredStateId !== null },
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

        // `End == true`: skip this block's exits and return to the calling flow, whose `subflow:`
        // block then decides with its own exits (`RedirectToParentFlowAsync`). Without a caller
        // the source throws, and so does `returnToCaller`.
        let origem: State = corrente;
        if (corrente.end) {
          const leaving = atual;
          const caller = returnToCaller(context, sessions);
          await processActions(
            context,
            corrente.afterStateChangedActions,
            corrente,
            provedor,
            configuration,
            leaving.actions,
            'saida',
            corrente.id,
            cursorPendente,
          );
          flow = context.flow;
          origem = caller;
          anteriorId = caller.id;
          leaving.nextStateId = caller.id;
          atual = traceStep(caller.id);
          rastro.estados.push(atual);
        }

        state = await processarSaidas(context, flow, origem);
        setStatePreviousId(context, anteriorId);

        // Run after-state-change actions only when the state actually changed.
        if (origem.id !== state?.id) {
          await processActions(
            context,
            origem.afterStateChangedActions,
            origem,
            provedor,
            configuration,
            atual.actions,
            'saida',
            origem.id,
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

        await arrive(state);

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
    const subflowFinal = currentSubflow(sessions);
    if (subflowFinal) rastro.subflow = subflowFinal;
    return rastro;
  } catch (error) {
    const subflowFinal = currentSubflow(sessions);
    if (subflowFinal) rastro.subflow = subflowFinal;
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
  } finally {
    // The caller's context names the bot's flow again; the chain lives in `variables`.
    context.flow = root;
    delete context.rootFlow;
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

    // Secret values read while substituting this action (only HTTP actions read `{{secret.*}}`).
    const secrets = ACTIONS_WITH_SECRETS.has(flowAction.type) ? new Set<string>() : null;
    try {
      let settings: Record<string, unknown> | null = null;
      if (flowAction.settings !== undefined && flowAction.settings !== null) {
        // Owner decision D-55 (2026-09-28): same as Blip, `{{...}}` is substituted in every
        // setting, script `source` included, so flows exported from Blip run unchanged (a
        // resource can inject a whole function with `{{resource.x}}`). Accepted risk: a
        // customer-controlled variable written inside code becomes code in the sandbox, with the
        // tenant's fetch/mTLS. Prefer `inputVariables` for customer data.
        let texto = JSON.stringify(flowAction.settings);
        // `ExecuteTemplate` receives the raw template; other actions receive substituted variables.
        if (acao.tipo !== 'ExecuteTemplate') {
          texto = await replaceVariables(texto, context, secrets ? { secrets } : undefined);
        }
        settings = JSON.parse(texto) as Record<string, unknown>;
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
        if (corpo) setVariable(context, corpo, maskSecrets(alvo.resposta.corpo, secrets));
        if (cursor) cursor.consumido = true;
        continue;
      }
      await withTimeLimit(
        (signal) =>
          acao.executar(context, settings, {
            signal,
            timeLimitMs: timeLimit,
            ...(secrets?.size ? { secrets } : {}),
            // AI agent tools (P14): the block's local actions, in this block's trace.
            runActions: (list) =>
              processActions(inlineHttp(context), list, state, provedor, configuration, rastro, lista, stateId, null),
          }),
        timeLimit,
      );
    } catch (error) {
      if (error instanceof SuspensaoDeProcessHttp) throw error;
      // A secret must never reach the trace, `execucao_passo` or the test run: mask it in the error.
      const detail = maskSecrets(messageOf(error), secrets);
      passo.error = detail;
      const message =
        error instanceof TimeExpired
          ? `O processamento da ação '${flowAction.type}' excedeu o tempo limite de ${timeLimit} ms.`
          : `O processamento da ação '${flowAction.type}' falhou: ${detail}`;
      if (flowAction.continueOnError) {
        passo.esquecida = true;
        continue;
      }
      // The original error may quote the request; with a secret in it, keep only the masked text.
      const cause = secrets?.size ? new Error(detail) : error;
      throw new ProcessingActionError(message, flowAction.type, cause);
    }
  }
}

/**
 * The same context without `suspendHttp`: an action run from inside another action (an AI agent
 * tool) cannot suspend the input halfway, so its ProcessHttp calls the network directly. Variables,
 * input context and flow are shared with the caller.
 */
function inlineHttp(context: Context): Context {
  if (!context.services.suspendHttp) return context;
  const services = { ...context.services };
  delete services.suspendHttp;
  return { ...context, services };
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

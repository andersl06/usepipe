/**
 * Ported from takenet/blip-sdk-csharp (Apache-2.0): src/Take.Blip.Builder/Models/Flow.cs, State.cs, Input.cs, Output.cs, and Action.cs. Changes from C# to TypeScript: classes become interfaces over published Blip JSON with the SAME keys so the engine reads it without translation; `Validate()` becomes `validarFluxo`; messages remain Portuguese; `TraceSettings` and `BuilderConfiguration` are omitted.
 */

import type { ConditionBlip } from './condition.js';
import { ValidationError, validateCondition } from './condition.js';

/** `Action`: `settings` is free JSON per type, corresponding to original `JRaw`. */
export interface Acao {
  id?: string;
  $title?: string;
  order?: number;
  conditions?: ConditionBlip[] | null;
  /** Segundos, como no original. */
  timeout?: number | null;
  continueOnError?: boolean;
  executeAsynchronously?: boolean;
  type: string;
  settings?: unknown;
}

export const RULES_OF_VALIDATION = ['text', 'number', 'date', 'regex', 'type'] as const;

/** `InputValidation`. */
export interface InboundValidation {
  rule: string;
  regex?: string | null;
  type?: string | null;
  error?: string | null;
}


export interface Inbound {
  bypass?: boolean;
  conditions?: ConditionBlip[] | null;
  validation?: InboundValidation | null;
  expiration?: string | null;
  variable?: string | null;
}


export interface Saida {
  order?: number;
  conditions?: ConditionBlip[] | null;
  stateId: string;
}

/**
 * `State` retains nonmodel fields (`name`, `$position`, `$tags`, etc.) on the object, like original `ExtensionData`; `{{state.name}}` reads them there.
 */
export interface State {
  id: string;
  root?: boolean;
  end?: boolean;
  inputActions?: Acao[] | null;
  input?: Inbound | null;
  outputActions?: Acao[] | null;
  afterStateChangedActions?: Acao[] | null;
  outputs?: Saida[] | null;
  localCustomActions?: Acao[] | null;
  [extensao: string]: unknown;
}

/** Model keys; remaining state fields are `ExtensionData`. */
export const KEYS_OF_STATE = new Set([
  'id',
  'root',
  'end',
  'inputActions',
  'input',
  'outputActions',
  'afterStateChangedActions',
  'outputs',
  'localCustomActions',
]);

/** `Flow`. */
export interface FlowBlip {
  id: string;
  version?: number;
  /** `flow` ou `subflow`. */
  type?: string;
  sessionState?: string;
  inputActions?: Acao[] | null;
  states: State[];
  outputActions?: Acao[] | null;
  afterStateChangedActions?: Acao[] | null;
  configuration?: Record<string, string> | null;
}

const VERSAO_ATUAL_DE_SUBFLUXO = 2;
const VARIABLE_OF_INBOUND = /^([a-zA-Z0-9.]+)$/;

export const ehSubfluxo = (flow: FlowBlip): boolean => flow.type?.toLowerCase() === 'subflow';

/** `stateId` in `{{variavel}}` form: destination calculated at runtime. */
export const contextEhVariable = (id: string): boolean =>
  id.startsWith('{{') && id.endsWith('}}');

/** `Action.Validate()`. */
export function validarAcao(acao: Acao): void {
  if (!acao.type) throw new ValidationError('O tipo da ação é obrigatório.');
}

/** `Input.Validate()`. */
export function validateInbound(inbound: Inbound): void {
  const v = inbound.validation;
  if (v) {
    if (v.rule?.toLowerCase() === 'regex' && !v.regex?.trim()) {
      throw new ValidationError('A expressão regular é obrigatória na regra de validação regex.');
    }
    if (!v.error?.trim())
      throw new ValidationError('A mensagem de erro da validação é obrigatória.');
    if (v.rule?.toLowerCase() === 'type' && !v.type) {
      throw new ValidationError('O tipo de mídia é obrigatório na regra de validação type.');
    }
  }
  if (inbound.variable?.trim() && !VARIABLE_OF_INBOUND.test(inbound.variable)) {
    throw new ValidationError(
      'O nome da variável de entrada só pode ter letras, números e pontos.',
    );
  }
}

/** `Output.Validate()`. */
export function validarSaida(saida: Saida): void {
  if (!saida.stateId) throw new ValidationError('O estado de destino da saída é obrigatório.');
  for (const c of saida.conditions ?? []) validateCondition(c);
}

/** `State.Validate()`. */
export function validateState(state: State): void {
  if (!state.id) throw new ValidationError('O id do estado é obrigatório.');
  for (const a of state.inputActions ?? []) validarAcao(a);
  if (state.input) validateInbound(state.input);
  for (const a of state.outputActions ?? []) validarAcao(a);
  for (const a of state.afterStateChangedActions ?? []) validarAcao(a);
  for (const s of state.outputs ?? []) validarSaida(s);
}

/**
 * `Flow.Validate()` contract for a valid flow: exactly one root state; root awaits input and has no condition; unique IDs; every output destination exists or is `{{variável}}`; and no loop bypasses input.
 */
export function validateFlow(flow: FlowBlip): void {
  if (!flow.id) throw new ValidationError('O id do fluxo é obrigatório.');
  if (!Array.isArray(flow.states))
    throw new ValidationError('O fluxo precisa de pelo menos um estado.');
  const subfluxo = ehSubfluxo(flow);
  if (subfluxo && (flow.version ?? 1) < VERSAO_ATUAL_DE_SUBFLUXO) {
    throw new ValidationError(
      `A versão do subfluxo precisa ser maior ou igual a ${VERSAO_ATUAL_DE_SUBFLUXO}.`,
    );
  }

  const raizes = flow.states.filter((s) => s.root);
  if (raizes.length !== 1)
    throw new ValidationError('O fluxo precisa de exatamente um estado raiz.');
  const raiz = raizes[0]!;
  if (!raiz.input || (!subfluxo && raiz.input.bypass)) {
    throw new ValidationError('O estado raiz precisa esperar uma entrada.');
  }
  if (raiz.input.conditions?.length) {
    throw new ValidationError('O estado raiz não pode ter condições de entrada.');
  }

  for (const a of flow.inputActions ?? []) validarAcao(a);

  const byId = new Map(flow.states.map((s) => [s.id, s]));

  // Is there a direct path without input back to `alvo`?
  const podeSerAlcancado = (alvo: State, saida: Saida, vistos: Set<string>): boolean => {
    if (vistos.has(saida.stateId)) return false;
    const outputState = byId.get(saida.stateId);
    if (!outputState?.outputs?.length) return false;
    if (outputState.input && !outputState.input.bypass) return false;
    if (outputState.outputs.some((o) => o.stateId === alvo.id)) return true;
    vistos.add(saida.stateId);
    return outputState.outputs.some((o) => podeSerAlcancado(alvo, o, vistos));
  };

  for (const state of flow.states) {
    validateState(state);
    if (flow.states.filter((s) => s.id === state.id).length > 1) {
      throw new ValidationError(`O id de estado '${state.id}' se repete no fluxo.`);
    }
    for (const saida of state.outputs ?? []) {
      if (!byId.has(saida.stateId) && !contextEhVariable(saida.stateId)) {
        throw new ValidationError(`O estado de destino '${saida.stateId}' da saída não existe.`);
      }
      // As in the source, the second half tests ROOT input, not this state's input.
      // The root with bypass was already rejected above, so in practice only a state with no
      // input is checked.
      if (!state.input || (!subfluxo && raiz.input.bypass)) {
        if (podeSerAlcancado(state, saida, new Set())) {
          throw new ValidationError(
            `Há um laço no fluxo começando no estado ${state.id} que não pede entrada do usuário.`,
          );
        }
      }
    }
  }

  for (const a of flow.outputActions ?? []) validarAcao(a);
  for (const a of flow.afterStateChangedActions ?? []) validarAcao(a);
}

/** `validarFluxo` error attached to its causing state, or null for a whole-flow error. */
export interface ByStateError {
  stateId: string | null;
  message: string;
}

const validationMessage = (conferir: () => void): string | null => {
  try {
    conferir();
    return null;
  } catch (error) {
    if (error instanceof ValidationError) return error.message;
    throw error;
  }
};

/**
 * Return ALL errors `validarFluxo` would report, each attached to its causing state so Builder marks the right block. `validarFluxo` stops at the first error to remain faithful to `Flow.Validate()`; the engine needs only that. The UI needs all missing pieces at once. Validate each state and output destination, then whole-flow conditions such as missing or duplicate root, duplicate ID, and loop without input. Messages match `validarFluxo` exactly; an empty list means validation would pass.
 */
export function flowErrors(flow: FlowBlip): ByStateError[] {
  const errors: ByStateError[] = [];
  const anotar = (stateId: string | null, message: string): void => {
    if (!errors.some((e) => e.stateId === stateId && e.message === message)) {
      errors.push({ stateId, message });
    }
  };

  const estados = Array.isArray(flow.states) ? flow.states : [];
  const ids = new Set(estados.map((s) => s.id));
  for (const state of estados) {
    const proprio = validationMessage(() => validateState(state));
    if (proprio) anotar(state.id, proprio);
    for (const saida of state.outputs ?? []) {
      if (saida.stateId && !ids.has(saida.stateId) && !contextEhVariable(saida.stateId)) {
        anotar(state.id, `O estado de destino '${saida.stateId}' da saída não existe.`);
      }
    }
  }

  const geral = validationMessage(() => validateFlow(flow));
  // Do not duplicate a `validarFluxo` error already listed for a state.
  if (!geral || errors.some((e) => e.message === geral)) return errors;

  const raizes = estados.filter((s) => s.root);
  const laco = /começando no estado (.+) que não pede entrada/.exec(geral)?.[1];
  const citado =
    estados.find((s) => s.id === laco || geral.includes(`'${s.id}'`)) ??
    (geral.includes('raiz') && raizes.length === 1 ? raizes[0] : undefined);
  anotar(citado?.id ?? null, geral);
  return errors;
}

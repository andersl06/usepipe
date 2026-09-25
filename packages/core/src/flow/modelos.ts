/**
 * Portado de takenet/blip-sdk-csharp (Apache-2.0),
 * src/Take.Blip.Builder/Models/Flow.cs, State.cs, Input.cs, Output.cs e Action.cs
 * — modificado: C# → TypeScript; as classes viram interfaces sobre o JSON publicado da
 * Blip, com as MESMAS chaves, para o motor ler o fluxo da Blip sem tradução; os
 * `Validate()` viram `validarFluxo`; mensagens em português; `TraceSettings` e
 * `BuilderConfiguration` ficaram de fora.
 */

import type { ConditionBlip } from './condition.js';
import { ValidationError, validateCondition } from './condition.js';

/** `Action`. `settings` é o JSON livre de cada tipo (o `JRaw` do original). */
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

/** `Input`: o que o estado espera do usuário. */
export interface Inbound {
  bypass?: boolean;
  conditions?: ConditionBlip[] | null;
  validation?: InboundValidation | null;
  expiration?: string | null;
  variable?: string | null;
}

/** `Output`: a transição. */
export interface Saida {
  order?: number;
  conditions?: ConditionBlip[] | null;
  stateId: string;
}

/**
 * `State`. O que não é do modelo (`name`, `$position`, `$tags`…) fica no próprio objeto,
 * como o `ExtensionData` do original — é dali que `{{state.name}}` lê.
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

/** As chaves do modelo; o resto do estado é `ExtensionData`. */
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

/** `stateId` no formato `{{variavel}}`: destino calculado em tempo de execução. */
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
 * `Flow.Validate()`: o contrato real de um fluxo válido — um só estado raiz, a raiz
 * espera entrada e não tem condição, ids únicos, destino de saída existente (ou
 * `{{variável}}`) e nenhum laço que não passe por uma entrada.
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

  // Existe um caminho direto (sem entrada) de volta a `alvo`?
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
      // Igual ao original: a segunda metade testa a entrada da RAIZ, não a do estado.
      // Como a raiz com bypass já foi recusada acima, na prática só estado sem
      // entrada nenhuma é conferido.
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

/** Um erro de `validarFluxo` preso ao estado que o causa; `null` quando é do fluxo inteiro. */
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
 * TODOS os erros que `validarFluxo` apontaria, e não só o primeiro — cada um preso ao
 * estado que o causa, para o Builder marcar o bloco certo.
 *
 * `validarFluxo` para no primeiro porque é o porte fiel do `Flow.Validate()`; o motor
 * não precisa de mais. A tela precisa: quem desenha quer ver de uma vez tudo o que
 * falta. Cada estado é conferido sozinho (`validarEstado` e o destino de cada saída),
 * e depois o fluxo inteiro, para apanhar o que é do conjunto — raiz ausente ou
 * repetida, id repetido, laço sem entrada. As frases são as MESMAS de `validarFluxo`:
 * lista vazia aqui é o mesmo que `validarFluxo` passar.
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
  // O que `validarFluxo` apontou e já está na lista por estado não entra duas vezes.
  if (!geral || errors.some((e) => e.message === geral)) return errors;

  const raizes = estados.filter((s) => s.root);
  const laco = /começando no estado (.+) que não pede entrada/.exec(geral)?.[1];
  const citado =
    estados.find((s) => s.id === laco || geral.includes(`'${s.id}'`)) ??
    (geral.includes('raiz') && raizes.length === 1 ? raizes[0] : undefined);
  anotar(citado?.id ?? null, geral);
  return errors;
}

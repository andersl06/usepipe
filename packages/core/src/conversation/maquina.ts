/**
 * Conversation state machine from data-model §8. Allowed states and transitions follow the diagram. A transfer is not a transition: it closes the current conversation with `encerrada_por = transferencia` and opens another at the destination (Blip rules §2.6, measured in production), so `atribuida` has no edge back to `na_fila`. Customer events must not force invalid states, avoiding the Blip community's "ticket encerrado pelo usuário em fluxo humano" bug.
 */

import type { EventAttendance, TipoEvento } from '../metrics/eventos.js';

export type StateConversation =
  | 'na_fila'
  | 'atribuida'
  | 'em_atendimento'
  | 'em_espera'
  | 'encerrada';

export const STATES_CONVERSATION: readonly StateConversation[] = [
  'na_fila',
  'atribuida',
  'em_atendimento',
  'em_espera',
  'encerrada',
];


export const TRANSITIONS: Readonly<Record<StateConversation, readonly StateConversation[]>> = {
  na_fila: ['atribuida', 'encerrada'],
  atribuida: ['em_atendimento', 'encerrada'],
  em_atendimento: ['em_espera', 'encerrada'],
  em_espera: ['em_atendimento', 'encerrada'],
  encerrada: ['na_fila'],
};


export class TransitionInvalidError extends Error {
  readonly codigo = 'transicao_invalida' as const;
  readonly de: StateConversation;
  readonly para: StateConversation;
  readonly evento?: TipoEvento;

  constructor(de: StateConversation, para: StateConversation, evento?: TipoEvento) {
    const byCausaOf = evento ? ` (evento ${evento})` : '';
    super(`Transição inválida de ${de} para ${para}${byCausaOf}`);
    this.name = 'TransicaoInvalidaError';
    this.de = de;
    this.para = para;
    if (evento) this.evento = evento;
  }
}

export function transitionAllowed(de: StateConversation, para: StateConversation): boolean {
  return TRANSITIONS[de].includes(para);
}


export function transitar(de: StateConversation, para: StateConversation): StateConversation {
  if (!transitionAllowed(de, para)) throw new TransitionInvalidError(de, para);
  return para;
}

export type Tentativa<T> =
  | { ok: true; state: T }
  | { ok: false; error: TransitionInvalidError };

/** Nonthrowing variant for the event consumer's hot path. */
export function tentarTransitar(
  de: StateConversation,
  para: StateConversation,
): Tentativa<StateConversation> {
  if (!transitionAllowed(de, para)) {
    return { ok: false, error: new TransitionInvalidError(de, para) };
  }
  return { ok: true, state: para };
}

/**
 * Destination state per event type; null means the event does not change state (customer message, SLA alert, evaluation, or queue transfer recorded as history).
 */
export function eventStateAlvo(tipo: TipoEvento): StateConversation | null {
  switch (tipo) {
    case 'criada':
    case 'enfileirada':
      return 'na_fila';
    case 'atribuida':
    case 'reatribuida':
      return 'atribuida';
    case 'primeira_resposta':
      return 'em_atendimento';
    case 'espera_iniciada':
      return 'em_espera';
    case 'espera_encerrada':
      return 'em_atendimento';
    case 'encerrada':
      return 'encerrada';
    case 'reaberta':
      return 'na_fila';
    default:
      return null;
  }
}

export interface ResultApplication {
  state: StateConversation;
  mudou: boolean;
}

/**
 * Apply an event to the current state per product-design §4.3: unmapped events never change state; events mapping to the current state are idempotent, as webhook redelivery is normal; every other destination must pass the transition table or raise `TransicaoInvalidaError`.
 */
export function aplicarEvento(
  stateCurrent: StateConversation,
  evento: Pick<EventAttendance, 'tipo'>,
): ResultApplication {
  const alvo = eventStateAlvo(evento.tipo);
  if (alvo === null) return { state: stateCurrent, mudou: false };
  if (alvo === stateCurrent) return { state: stateCurrent, mudou: false };
  if (!transitionAllowed(stateCurrent, alvo)) {
    throw new TransitionInvalidError(stateCurrent, alvo, evento.tipo);
  }
  return { state: alvo, mudou: true };
}


export function tentarAplicarEvento(
  stateCurrent: StateConversation,
  evento: Pick<EventAttendance, 'tipo'>,
): Tentativa<ResultApplication> {
  try {
    return { ok: true, state: aplicarEvento(stateCurrent, evento) };
  } catch (error) {
    if (error instanceof TransitionInvalidError) return { ok: false, error };
    throw error;
  }
}

/**
 * Replay events from an initial state to recompute history; this is why events are immutable.
 */
export function reproduzirEventos(
  eventos: readonly Pick<EventAttendance, 'tipo'>[],
  stateInitial: StateConversation = 'na_fila',
): StateConversation {
  let state = stateInitial;
  for (const evento of eventos) {
    state = aplicarEvento(state, evento).state;
  }
  return state;
}


export type StateDelivery = 'pendente' | 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou';

export const TRANSITIONS_DELIVERY: Readonly<Record<StateDelivery, readonly StateDelivery[]>> = {
  pendente: ['enviando'],
  enviando: ['enviada', 'falhou'],
  enviada: ['entregue', 'lida', 'falhou'],
  entregue: ['lida'],
  lida: [],
  // Retry puts delivery back in the outbound queue; it never fails silently.
  falhou: ['pendente'],
};

export class TransitionDeliveryInvalidError extends Error {
  readonly codigo = 'transicao_entrega_invalida' as const;
  readonly de: StateDelivery;
  readonly para: StateDelivery;

  constructor(de: StateDelivery, para: StateDelivery) {
    super(`Transição de entrega inválida de ${de} para ${para}`);
    this.name = 'TransicaoEntregaInvalidaError';
    this.de = de;
    this.para = para;
  }
}

export function transitionDeliveryAllowed(de: StateDelivery, para: StateDelivery): boolean {
  return TRANSITIONS_DELIVERY[de].includes(para);
}

export function transitarDelivery(de: StateDelivery, para: StateDelivery): StateDelivery {
  if (!transitionDeliveryAllowed(de, para)) throw new TransitionDeliveryInvalidError(de, para);
  return para;
}

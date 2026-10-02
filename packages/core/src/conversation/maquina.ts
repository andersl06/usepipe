/**
 * Máquina de estados da conversa, no vocabulário da Blip. Transferir não é uma aresta: fecha o ticket como `Transferred` e abre outro com pai (o atendimento segue no filho, então `Transferred` não reabre). Standby não é estado: é `em_espera_desde` preenchido com o estado `Open`. Eventos do cliente não podem forçar estados inválidos.
 */

import type { ClosedBy, EventAttendance, TipoEvento } from '../metrics/eventos.js';

export type StateConversation =
  | 'Waiting'
  | 'Assigned'
  | 'Open'
  | 'ClosedAttendant'
  | 'ClosedClient'
  | 'ClosedClientInactivity'
  | 'Transferred';

export const STATES_CONVERSATION: readonly StateConversation[] = [
  'Waiting',
  'Assigned',
  'Open',
  'ClosedAttendant',
  'ClosedClient',
  'ClosedClientInactivity',
  'Transferred',
];

export type ClosedState = Extract<
  StateConversation,
  'ClosedAttendant' | 'ClosedClient' | 'ClosedClientInactivity' | 'Transferred'
>;

export const STATES_CLOSED: readonly ClosedState[] = [
  'ClosedAttendant',
  'ClosedClient',
  'ClosedClientInactivity',
  'Transferred',
];

export const STATES_ACTIVE: readonly StateConversation[] = ['Waiting', 'Assigned', 'Open'];

export function isClosedState(s: string): s is ClosedState {
  return (STATES_CLOSED as readonly string[]).includes(s);
}

/** Estado de encerramento derivado de quem encerrou. */
export function closedStateOf(closedBy: ClosedBy): ClosedState {
  switch (closedBy) {
    case 'atendente':
      return 'ClosedAttendant';
    case 'cliente':
      return 'ClosedClient';
    case 'inatividade':
      return 'ClosedClientInactivity';
    case 'transferencia':
      return 'Transferred';
  }
}

const listaSql = (l: readonly string[]) => `(${l.map((x) => `'${x}'`).join(', ')})`;

/** Listas prontas para `sql.raw` no SQL cru; só constantes, nenhuma entrada de requisição. */
export const SQL_STATES_CLOSED = listaSql(STATES_CLOSED);
export const SQL_STATES_ACTIVE = listaSql(STATES_ACTIVE);

export const TRANSITIONS: Readonly<Record<StateConversation, readonly StateConversation[]>> = {
  Waiting: ['Assigned', ...STATES_CLOSED],
  Assigned: ['Open', ...STATES_CLOSED],
  Open: [...STATES_CLOSED],
  ClosedAttendant: ['Waiting'],
  ClosedClient: ['Waiting'],
  ClosedClientInactivity: ['Waiting'],
  Transferred: [],
};

export class TransitionInvalidError extends Error {
  readonly codigo = 'transicao_invalida' as const;
  readonly de: StateConversation;
  readonly para: StateConversation;
  readonly evento?: TipoEvento;

  constructor(de: StateConversation, para: StateConversation, evento?: TipoEvento) {
    const byCauseOf = evento ? ` (evento ${evento})` : '';
    super(`Transição inválida de ${de} para ${para}${byCauseOf}`);
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
 * Destination state per event type; null means the event does not change state (customer message, SLA alert, evaluation, queue transfer recorded as history, or standby, which is a flag).
 */
export function eventStateTarget(
  evento: Pick<EventAttendance, 'tipo' | 'closedBy'>,
): StateConversation | null {
  switch (evento.tipo) {
    case 'criada':
    case 'enfileirada':
    case 'reaberta':
      return 'Waiting';
    case 'atribuida':
    case 'reatribuida':
      return 'Assigned';
    case 'primeira_resposta':
      return 'Open';
    case 'encerrada':
      return closedStateOf(evento.closedBy ?? 'atendente');
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
  evento: Pick<EventAttendance, 'tipo' | 'closedBy'>,
): ResultApplication {
  const alvo = eventStateTarget(evento);
  if (alvo === null) return { state: stateCurrent, mudou: false };
  if (alvo === stateCurrent) return { state: stateCurrent, mudou: false };
  if (!transitionAllowed(stateCurrent, alvo)) {
    throw new TransitionInvalidError(stateCurrent, alvo, evento.tipo);
  }
  return { state: alvo, mudou: true };
}


export function tentarAplicarEvento(
  stateCurrent: StateConversation,
  evento: Pick<EventAttendance, 'tipo' | 'closedBy'>,
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
  eventos: readonly Pick<EventAttendance, 'tipo' | 'closedBy'>[],
  stateInitial: StateConversation = 'Waiting',
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

export function transitionDelivery(de: StateDelivery, para: StateDelivery): StateDelivery {
  if (!transitionDeliveryAllowed(de, para)) throw new TransitionDeliveryInvalidError(de, para);
  return para;
}

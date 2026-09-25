/**
 * Máquina de estados da conversa — §8 do modelo de dados.
 *
 *         ┌──────────────── reaberta ─────────────────┐
 *         ▼                                           │
 *     na_fila ──► atribuida ──► em_atendimento ──► encerrada
 *         │            │              │  ▲
 *         │            │              ▼  │
 *         │            │           em_espera
 *         │            │
 *         └────────────┴──────────► encerrada (perdida / abandonada)
 *
 * Transferência **não** é transição: ela encerra a conversa com
 * `encerrada_por = transferencia` e abre outra no destino (regras da Blip §2.6,
 * medido em produção). Por isso não existe aresta de volta para `na_fila` a
 * partir de `atribuida`.
 *
 * Evento vindo do cliente não pode levar a conversa a estado inválido — é
 * exatamente o bug "ticket encerrado pelo usuário em fluxo humano" que a
 * comunidade da Blip reclama.
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

/** Transições permitidas, exatamente as do diagrama da §8. */
export const TRANSITIONS: Readonly<Record<StateConversation, readonly StateConversation[]>> = {
  na_fila: ['atribuida', 'encerrada'],
  atribuida: ['em_atendimento', 'encerrada'],
  em_atendimento: ['em_espera', 'encerrada'],
  em_espera: ['em_atendimento', 'encerrada'],
  encerrada: ['na_fila'],
};

/** Erro tipado de transição inválida. Nada de `throw new Error('opa')`. */
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

/** Transita ou lança `TransicaoInvalidaError`. */
export function transitar(de: StateConversation, para: StateConversation): StateConversation {
  if (!transitionAllowed(de, para)) throw new TransitionInvalidError(de, para);
  return para;
}

export type Tentativa<T> =
  | { ok: true; state: T }
  | { ok: false; error: TransitionInvalidError };

/** Versão sem exceção, para o caminho quente do consumidor de eventos. */
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
 * Estado de destino de cada tipo de evento. `null` = evento que não mexe no
 * estado (mensagem do cliente, alerta de SLA, avaliação, transferência de fila
 * registrada como histórico).
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
 * Aplica um evento ao estado corrente.
 *
 * Regras que sustentam a garantia da §4.3 do desenho do produto:
 * - evento que não mapeia estado nunca muda estado, seja de quem for;
 * - evento que mapeia o **mesmo** estado corrente é idempotente e não erra —
 *   reentrega de webhook é normal e não pode virar exceção;
 * - qualquer outro destino passa pela tabela de transições e, se não for
 *   permitido, lança `TransicaoInvalidaError`.
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

/** Versão sem exceção de `aplicarEvento`. */
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
 * Reproduz uma sequência de eventos a partir de um estado inicial.
 * Serve para recalcular o passado — a razão de os eventos serem imutáveis.
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

// --- Máquina da mensagem de saída (§8, segundo diagrama) ---

export type StateDelivery = 'pendente' | 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou';

export const TRANSITIONS_DELIVERY: Readonly<Record<StateDelivery, readonly StateDelivery[]>> = {
  pendente: ['enviando'],
  enviando: ['enviada', 'falhou'],
  enviada: ['entregue', 'lida', 'falhou'],
  entregue: ['lida'],
  lida: [],
  // Reenviar volta para a fila de saída — nunca falha em silêncio.
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

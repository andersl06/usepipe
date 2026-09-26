/**
 * Five time metrics from metrics spec §2 return `{ valor, populacao, excluidas, soma }`, always carrying the denominator. A negative interval signals inconsistent out-of-order events: exclude that conversation from the denominator and count it in `excluidas` rather than publishing a negative or forced-zero duration.
 */

import { resultado, type ResultadoMetrica } from '../comum/tipos.js';
import { segundosEntre } from '../comum/time.js';
import {
  derivarMarcos,
  intervalosDeResposta,
  type ConversationEvents,
  type Marcos,
} from './eventos.js';

/** Response-time result also reports how many conversations supplied the intervals. */
export interface ResponseTimeResult extends ResultadoMetrica {
  /** Conversations with at least one complete exchange, the population in metrics spec §2. */
  conversationsConsideradas: number;
}

function acumular(
  conversations: readonly ConversationEvents[],
  medir: (marcos: Marcos) => number | null,
): ResultadoMetrica {
  let soma = 0;
  let population = 0;
  let excluidas = 0;

  for (const conversation of conversations) {
    const medida = medir(derivarMarcos(conversation));
    if (medida === null || Number.isNaN(medida) || medida < 0) {
      excluidas += 1;
      continue;
    }
    soma += medida;
    population += 1;
  }

  return resultado(soma, population, excluidas);
}

/**
 * Queue time is `atribuida_em − criada_em`; population includes conversations that were assigned.
 */
export function timeInQueue(conversations: readonly ConversationEvents[]): ResultadoMetrica {
  return acumular(conversations, (m) =>
    m.criadaEm && m.atribuidaEm ? segundosEntre(m.criadaEm, m.atribuidaEm) : null,
  );
}

/**
 * Time to first response is `primeira_resposta_em − atribuida_em`; population includes conversations answered by an agent. A response without a recorded assignment cannot enter this formula and counts as excluded, shown beside the mean per the declared §2 divergence.
 */
export function timeAteFirstResposta(conversations: readonly ConversationEvents[]): ResultadoMetrica {
  return acumular(conversations, (m) =>
    m.atribuidaEm && m.firstRespostaIn ? segundosEntre(m.atribuidaEm, m.firstRespostaIn) : null,
  );
}

/**
 * Total customer wait: with an answer, `primeira_resposta_em − criada_em`; without one, `encerrada_em − criada_em`. Population is all conversations closed in the period. An open unanswered conversation has no wait end and is excluded.
 */
export function timeTotalOfEsperaOfCliente(
  conversations: readonly ConversationEvents[],
): ResultadoMetrica {
  return acumular(conversations, (m) => {
    if (!m.criadaEm) return null;
    if (m.firstRespostaIn) return segundosEntre(m.criadaEm, m.firstRespostaIn);
    if (m.encerradaEm) return segundosEntre(m.criadaEm, m.encerradaEm);
    return null;
  });
}

/**
 * Response time averages intervals from customer message to next agent message. The spec calls the population conversations with at least one complete exchange, but the formula averages INTERVALS. To preserve §5 sum/count rather than a mean of means, `valor` divides by interval count; `conversasConsideradas` separately reports conversation count, while `excluidas` counts conversations without a complete exchange.
 */
export function respostaTime(conversations: readonly ConversationEvents[]): ResponseTimeResult {
  let soma = 0;
  let intervalos = 0;
  let conversationsConsidered = 0;
  let excluidas = 0;

  for (const conversation of conversations) {
    const medidas = intervalosDeResposta(conversation).filter((s) => s >= 0);
    if (medidas.length === 0) {
      excluidas += 1;
      continue;
    }
    conversationsConsidered += 1;
    for (const medida of medidas) {
      soma += medida;
      intervalos += 1;
    }
  }

  return { ...resultado(soma, intervalos, excluidas), conversationsConsideradas: conversationsConsidered };
}

/**
 * Handling time is `encerrada_em − primeira_resposta_em`, for closed conversations with a first agent response. Blip makes the figure look better by omitting unanswered conversations. Keep the same formula for comparability, but report `excluidas` beside it in the UI.
 */
export function attendanceTime(conversations: readonly ConversationEvents[]): ResultadoMetrica {
  return acumular(conversations, (m) =>
    m.firstRespostaIn && m.encerradaEm ? segundosEntre(m.firstRespostaIn, m.encerradaEm) : null,
  );
}

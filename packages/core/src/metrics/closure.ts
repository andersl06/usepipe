/**
 * Closure statuses from metrics spec §4. `atribuida_em` separates lost from abandoned: lost reflects capacity or queue issues, abandoned reflects handling. Keeping them separate makes the metric actionable.
 */

import { derivarMarcos, type ConversationEvents, type Marcos } from './eventos.js';

export type StatusClosure = 'perdida' | 'abandonada' | 'finalizada';

export interface CountClosure {
  perdida: number;
  abandonada: number;
  finalizada: number;
  /** Sum of the three categories, called "fechada" in the spec. */
  fechada: number;
  /** Conversas ainda abertas no conjunto avaliado. */
  abertas: number;
}

/**
 * Classify a conversation closure; return null while open. `atendente` or `transferencia` means finalized regardless of assignment, since a manager can also close in bulk from monitoring. `cliente` or `inatividade` means lost if never assigned, abandoned otherwise. Missing `encerradaPor` follows the assignment rule; unknown origin must not be optimistically labeled finalized.
 */
export function classificarClosure(marcos: Marcos): StatusClosure | null {
  if (!marcos.encerradaEm) return null;
  if (marcos.encerradaBy === 'atendente' || marcos.encerradaBy === 'transferencia') {
    return 'finalizada';
  }
  return marcos.atribuidaEm ? 'abandonada' : 'perdida';
}

export function classificarConversation(conversation: ConversationEvents): StatusClosure | null {
  return classificarClosure(derivarMarcos(conversation));
}

export function contarClosures(
  conversations: readonly ConversationEvents[],
): CountClosure {
  const count: CountClosure = {
    perdida: 0,
    abandonada: 0,
    finalizada: 0,
    fechada: 0,
    abertas: 0,
  };

  for (const conversation of conversations) {
    const status = classificarConversation(conversation);
    if (status === null) {
      count.abertas += 1;
      continue;
    }
    count[status] += 1;
    count.fechada += 1;
  }

  return count;
}

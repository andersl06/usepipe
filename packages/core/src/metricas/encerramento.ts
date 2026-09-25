/**
 * Status de encerramento — §4 da spec de métricas.
 *
 * A fronteira entre perdida e abandonada é a existência de `atribuida_em`:
 * perdida é problema de capacidade ou de fila, abandonada é problema de
 * atendimento. Separá-las é o que torna o número acionável.
 */

import { derivarMarcos, type ConversationEvents, type Marcos } from './eventos.js';

export type StatusClosure = 'perdida' | 'abandonada' | 'finalizada';

export interface CountClosure {
  perdida: number;
  abandonada: number;
  finalizada: number;
  /** Soma das três — o "fechada" da spec. */
  fechada: number;
  /** Conversas ainda abertas no conjunto avaliado. */
  abertas: number;
}

/**
 * Classifica o encerramento de uma conversa. `null` quando ainda está aberta.
 *
 * - `atendente` ou `transferencia` → finalizada, tenha sido atribuída ou não
 *   (gestor também fecha em lote pela tela de monitoramento).
 * - `cliente` ou `inatividade` → perdida se nunca foi atribuída, abandonada se foi.
 * - Encerramento sem `encerradaPor` cai na mesma regra de atribuição, porque a
 *   origem desconhecida não pode virar "finalizada" por otimismo.
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

/**
 * Supporting session-time measure from Annex B.2. Across all chats, sum gaps between consecutive agent messages sent during a day when each gap is at most 10 minutes; longer gaps are breaks. This and the effort measure converge for handled tickets at the 11–13 minutes observed in production, providing a cross-check.
 */

import { MINUTO, ordenarInstantes } from '../comum/time.js';

/** Default maximum gap between two messages that still counts as active session time. */
export const SESSION_INTERVAL_LIMIT_SEG = 10 * MINUTO;

export interface BlockSession {
  inicio: Date;
  fim: Date;
  segundos: number;
  /** Quantidade de mensagens dentro do bloco. */
  messages: number;
}

export interface TimeInSession {
  sessionSeg: number;
  blocos: BlockSession[];
  messages: number;
}

/**
 * Sum consecutive gaps of at most `limiteSeg`. A single message adds zero seconds: this measures gaps, not mere presence. The conservative choice avoids inflating session time and making an agent seem less occupied than they are.
 */
export function calcularTimeInSession(
  instantes: readonly Date[],
  options: { limiteSeg?: number } = {},
): TimeInSession {
  const limiteSeg = options.limiteSeg ?? SESSION_INTERVAL_LIMIT_SEG;
  const ordenados = ordenarInstantes(instantes);

  if (ordenados.length === 0) return { sessionSeg: 0, blocos: [], messages: 0 };

  const blocos: BlockSession[] = [];
  let inicio = ordenados[0] as Date;
  let anterior = inicio;
  let segundos = 0;
  let messagesInBlock = 1;

  const fecharBlock = () => {
    blocos.push({ inicio, fim: anterior, segundos, messages: messagesInBlock });
  };

  for (let i = 1; i < ordenados.length; i += 1) {
    const atual = ordenados[i] as Date;
    const delta = (atual.getTime() - anterior.getTime()) / 1000;
    if (delta <= limiteSeg) {
      segundos += delta;
      messagesInBlock += 1;
    } else {
      fecharBlock();
      inicio = atual;
      segundos = 0;
      messagesInBlock = 1;
    }
    anterior = atual;
  }
  fecharBlock();

  return {
    sessionSeg: blocos.reduce((total, block) => total + block.segundos, 0),
    blocos,
    messages: ordenados.length,
  };
}

/** Espelha `esforco_atendente_dia` do modelo de dados (§4). */
export interface EffortAgentDia {
  dia: string;
  userId: string;
  effortSeg: number;
  tickets: number;
  sessionSeg: number;
  /** Effort divided by measured session time; null when no session was measured. */
  occupancy: number | null;
  /** Effort divided by tickets, a weighted average by construction (§5). */
  effortMedioByTicketSeg: number | null;
}

export function occupancy(effortSeg: number, sessionSeg: number): number | null {
  return sessionSeg > 0 ? effortSeg / sessionSeg : null;
}

/**
 * Consolidate an agent's day. The weighted mean is total effort divided by total tickets, never the mean of daily means; a busy day carries more weight.
 */
export function agentConsolidarDia(inbound: {
  dia: string;
  userId: string;
  esforcosSeg: readonly number[];
  messageInstantes: readonly Date[];
  limiteIntervaloSeg?: number;
}): EffortAgentDia {
  const effortSeg = inbound.esforcosSeg.reduce((a, b) => a + b, 0);
  const tickets = inbound.esforcosSeg.length;
  const options = inbound.limiteIntervaloSeg === undefined ? {} : { limiteSeg: inbound.limiteIntervaloSeg };
  const { sessionSeg } = calcularTimeInSession(inbound.messageInstantes, options);

  return {
    dia: inbound.dia,
    userId: inbound.userId,
    effortSeg,
    tickets,
    sessionSeg,
    occupancy: occupancy(effortSeg, sessionSeg),
    effortMedioByTicketSeg: tickets > 0 ? effortSeg / tickets : null,
  };
}

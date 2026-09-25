/**
 * Régua de apoio: tempo em sessão (Anexo B.2).
 *
 * Linha do tempo do atendente no dia, com as mensagens que ele enviou em todos
 * os chats. Tempo ativo é a soma dos intervalos entre mensagens consecutivas
 * **quando o intervalo é de até 10 minutos**; acima disso é pausa.
 *
 * As duas réguas convergem nos tickets conversados (11–13 min medidos em
 * produção) e uma valida a outra.
 */

import { MINUTO, ordenarInstantes } from '../comum/time.js';

/** Limite padrão entre duas mensagens para o tempo continuar contando. */
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
 * Soma os intervalos consecutivos de até `limiteSeg`.
 *
 * Uma mensagem sozinha vale zero segundo: o método mede intervalo entre
 * mensagens, não presença. Isso é conservador de propósito — inflar sessão
 * infla a ocupação e faz o atendente parecer mais folgado do que está.
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
  /** Esforço ÷ sessão. `null` quando não houve sessão medida. */
  occupancy: number | null;
  /** Esforço ÷ tickets, média ponderada por construção (§5). */
  effortMedioByTicketSeg: number | null;
}

export function occupancy(effortSeg: number, sessionSeg: number): number | null {
  return sessionSeg > 0 ? effortSeg / sessionSeg : null;
}

/**
 * Consolida o dia de um atendente.
 *
 * Média ponderada por construção: soma de todo o esforço ÷ soma de todos os
 * tickets. Nunca média de médias — dia cheio pesa mais.
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

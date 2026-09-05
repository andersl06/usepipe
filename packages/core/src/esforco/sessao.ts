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

import { MINUTO, ordenarInstantes } from '../comum/tempo.js';

/** Limite padrão entre duas mensagens para o tempo continuar contando. */
export const LIMITE_INTERVALO_SESSAO_SEG = 10 * MINUTO;

export interface BlocoSessao {
  inicio: Date;
  fim: Date;
  segundos: number;
  /** Quantidade de mensagens dentro do bloco. */
  mensagens: number;
}

export interface TempoEmSessao {
  sessaoSeg: number;
  blocos: BlocoSessao[];
  mensagens: number;
}

/**
 * Soma os intervalos consecutivos de até `limiteSeg`.
 *
 * Uma mensagem sozinha vale zero segundo: o método mede intervalo entre
 * mensagens, não presença. Isso é conservador de propósito — inflar sessão
 * infla a ocupação e faz o atendente parecer mais folgado do que está.
 */
export function calcularTempoEmSessao(
  instantes: readonly Date[],
  opcoes: { limiteSeg?: number } = {},
): TempoEmSessao {
  const limiteSeg = opcoes.limiteSeg ?? LIMITE_INTERVALO_SESSAO_SEG;
  const ordenados = ordenarInstantes(instantes);

  if (ordenados.length === 0) return { sessaoSeg: 0, blocos: [], mensagens: 0 };

  const blocos: BlocoSessao[] = [];
  let inicio = ordenados[0] as Date;
  let anterior = inicio;
  let segundos = 0;
  let mensagensNoBloco = 1;

  const fecharBloco = () => {
    blocos.push({ inicio, fim: anterior, segundos, mensagens: mensagensNoBloco });
  };

  for (let i = 1; i < ordenados.length; i += 1) {
    const atual = ordenados[i] as Date;
    const delta = (atual.getTime() - anterior.getTime()) / 1000;
    if (delta <= limiteSeg) {
      segundos += delta;
      mensagensNoBloco += 1;
    } else {
      fecharBloco();
      inicio = atual;
      segundos = 0;
      mensagensNoBloco = 1;
    }
    anterior = atual;
  }
  fecharBloco();

  return {
    sessaoSeg: blocos.reduce((total, bloco) => total + bloco.segundos, 0),
    blocos,
    mensagens: ordenados.length,
  };
}

/** Espelha `esforco_atendente_dia` do modelo de dados (§4). */
export interface EsforcoAtendenteDia {
  dia: string;
  usuarioId: string;
  esforcoSeg: number;
  tickets: number;
  sessaoSeg: number;
  /** Esforço ÷ sessão. `null` quando não houve sessão medida. */
  ocupacao: number | null;
  /** Esforço ÷ tickets, média ponderada por construção (§5). */
  esforcoMedioPorTicketSeg: number | null;
}

export function ocupacao(esforcoSeg: number, sessaoSeg: number): number | null {
  return sessaoSeg > 0 ? esforcoSeg / sessaoSeg : null;
}

/**
 * Consolida o dia de um atendente.
 *
 * Média ponderada por construção: soma de todo o esforço ÷ soma de todos os
 * tickets. Nunca média de médias — dia cheio pesa mais.
 */
export function consolidarDiaDoAtendente(entrada: {
  dia: string;
  usuarioId: string;
  esforcosSeg: readonly number[];
  instantesDeMensagem: readonly Date[];
  limiteIntervaloSeg?: number;
}): EsforcoAtendenteDia {
  const esforcoSeg = entrada.esforcosSeg.reduce((a, b) => a + b, 0);
  const tickets = entrada.esforcosSeg.length;
  const opcoes = entrada.limiteIntervaloSeg === undefined ? {} : { limiteSeg: entrada.limiteIntervaloSeg };
  const { sessaoSeg } = calcularTempoEmSessao(entrada.instantesDeMensagem, opcoes);

  return {
    dia: entrada.dia,
    usuarioId: entrada.usuarioId,
    esforcoSeg,
    tickets,
    sessaoSeg,
    ocupacao: ocupacao(esforcoSeg, sessaoSeg),
    esforcoMedioPorTicketSeg: tickets > 0 ? esforcoSeg / tickets : null,
  };
}

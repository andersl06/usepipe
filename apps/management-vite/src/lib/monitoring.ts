import {
  weightPriority,
  type CountClosure,
  type StateAgent,
  type Marcos,
  type ResultadoMetrica,
  type ResponseTimeResult,
} from '@pipe/core';
import { type PillSla } from './sla';

export interface ConversationOpenRow {
  id: string;
  /** `#<sequentialId>`: o mesmo número que o Desk mostra. */
  ticket: string;
  sequentialId: number;
  parentSequentialId: number | null;
  contactName: string;
  queueId: string | null;
  queueName: string | null;
  agentId: string | null;
  agentName: string | null;
  state: string;
  priority: string;
  marcos: Marcos;
  /** Segundos na fila: fechado quando já foi atribuída, correndo quando não. */
  inQueueSeg: number | null;
  queueRunning: boolean;
  firstResponseSeg: number | null;
  firstResponseRunning: boolean;
  attendanceSeg: number | null;
  emEspera: boolean;
  /** A bola está com o atendente: o cliente falou por último, ou ninguém respondeu ainda. */
  aguardandoAtendente: boolean;
  sla: PillSla;
  labels: string[];
}

export interface CardsRealTime {
  naFila: number;
  largestWaitInQueueSeg: number | null;
  /**
   * De quantas conversas o máximo acima saiu. Máximo sem população é a mesma
   * armadilha da média sem denominador (§2 da spec de métricas): "40 minutos"
   * entre duas conversas e entre duzentas pedem reações opostas.
   */
  waitingFirstResponse: number;
  largestWaitFirstResponseSeg: number | null;
  inAttendance: number;
  agentsOnline: number;
  mediaByAgent: number | null;
}

export interface CardAgents {
  online: number;
  pausa: number;
  invisivel: number;
  offline: number;
  pausasEstouradas: number;
}

export interface TodayCards {
  esperaDoCliente: ResultadoMetrica;
  untilFirstResponse: ResultadoMetrica;
  timeOfAttendance: ResultadoMetrica;
  timeOfResponse: ResponseTimeResult;
  closures: CountClosure;
}

export interface WorkloadAgent {
  id: string;
  name: string;
  state: StateAgent;
  ativas: number;
  waitingAgent: number;
  limite: number;
  carga: number;
  /** Carga máxima possível: o limite todo ocupado por conversa aguardando o atendente. */
  cargaMaxima: number;
  timeMediumResponseSeg: number | null;
  timeMediumAttendanceSeg: number | null;
}

export interface SummaryQueue {
  id: string;
  name: string;
  inQueue: number;
  emAtendimento: number;
  maiorEsperaSeg: number | null;
  atendentesOnline: number;
  timeMediumInQueueSeg: number | null;
  tempoMedioRespostaSeg: number | null;
  tempoMedioAtendimentoSeg: number | null;
}

export interface ResumoEtiqueta {
  id: string;
  name: string;
  color: string | null;
  abertas: number;
  finalizadas: number;
  tempoMedioAtendimentoSeg: number | null;
}

export interface Monitoring {
  agora: Date;
  fuso: string;
  realtime: CardsRealTime;
  agents: CardAgents;
  hoje: TodayCards;
  abertas: ConversationOpenRow[];
  carga: WorkloadAgent[];
  queues: SummaryQueue[];
  labels: ResumoEtiqueta[];
  ticketsOpenByHour: number[];
  /** Catálogo para os filtros rápidos. */
  listAgents: { id: string; name: string }[];
}

/**
 * Tudo o que a tela de monitoramento precisa, em uma transação só.
 *
 * `agora` entra por parâmetro: as métricas de "tempo real" têm cronômetro
 * correndo e o instante precisa ser o mesmo em todos os cartões, senão a soma
 * dos cartões não fecha com a tabela.
 */
export interface MonitoringFilter {
  queueId?: string | undefined;
  agentId?: string | undefined;
}

/**
 * A ordem da FILA DE ESPERA: prioridade primeiro, e empate desempata pela mais
 * antiga.
 *
 * É a regra deles, e ela só existe porque a prioridade tem um degrau de
 * AUSÊNCIA: um ticket `baixa` fura a frente de um `sem_prioridade`. Enquanto a
 * coluna nascia em `media`, ordenar por prioridade era ordenar por um dado que
 * ninguém tinha escolhido, e por isso a lista saía só por data de criação.
 *
 * O desempate por antiguidade é o que impede a fila de virar pilha, com o
 * último a chegar sendo o primeiro a sair. A aba "Atribuído/Em andamento"
 * continua em ordem de criação: lá o ticket já tem dono, e prioridade não muda
 * mais quem atende.
 */
export function waitSortQueue<
  T extends { priority: string; marcos: { criadaEm: Date | string | null } },
>(linhas: readonly T[]): T[] {
  return [...linhas].sort((a, b) => {
    const diferenca = weightPriority(a.priority) - weightPriority(b.priority);
    if (diferenca !== 0) return diferenca;
    /*
     * Missing creation time sorts last; it is unknown, not oldest, matching the Desk's null rule. API JSON supplies date as TEXT, not `Date`; calling `getTime` directly once broke the entire Waiting tab.
     */
    const ta = a.marcos.criadaEm ? new Date(a.marcos.criadaEm).getTime() : Infinity;
    const tb = b.marcos.criadaEm ? new Date(b.marcos.criadaEm).getTime() : Infinity;
    return ta - tb;
  });
}

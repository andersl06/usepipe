import {
  pesoPriority,
  type CountClosure,
  type StateAgent,
  type Marcos,
  type ResultadoMetrica,
  type ResponseTimeResult,
} from '@pipe/core';
import { type PillSla } from './sla';

export interface LinhaConversationAberta {
  id: string;
  ticket: string;
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
  queueCorrendo: boolean;
  firstRespostaSeg: number | null;
  firstRespostaCorrendo: boolean;
  attendanceSeg: number | null;
  emEspera: boolean;
  /** A bola está com o atendente: o cliente falou por último, ou ninguém respondeu ainda. */
  aguardandoAgent: boolean;
  sla: PillSla;
  etiquetas: string[];
}

export interface CardsRealTime {
  inQueue: number;
  maiorEsperaInQueueSeg: number | null;
  /**
   * De quantas conversas o máximo acima saiu. Máximo sem população é a mesma
   * armadilha da média sem denominador (§2 da spec de métricas): "40 minutos"
   * entre duas conversas e entre duzentas pedem reações opostas.
   */
  aguardandoFirstResposta: number;
  maiorEsperaFirstRespostaSeg: number | null;
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
  ateFirstResposta: ResultadoMetrica;
  attendanceTime: ResultadoMetrica;
  respostaTime: ResponseTimeResult;
  closures: CountClosure;
}

export interface CargaAgent {
  id: string;
  nome: string;
  state: StateAgent;
  ativas: number;
  aguardandoAgent: number;
  limite: number;
  carga: number;
  /** Carga máxima possível: o limite todo ocupado por conversa aguardando o atendente. */
  cargaMaxima: number;
  timeMedioRespostaSeg: number | null;
  timeMedioAttendanceSeg: number | null;
}

export interface SummaryQueue {
  id: string;
  nome: string;
  inQueue: number;
  inAttendance: number;
  maiorEsperaSeg: number | null;
  agentsOnline: number;
  timeMedioInQueueSeg: number | null;
  timeMedioRespostaSeg: number | null;
  timeMedioAttendanceSeg: number | null;
}

export interface ResumoEtiqueta {
  id: string;
  nome: string;
  cor: string | null;
  abertas: number;
  finalizadas: number;
  timeMedioAttendanceSeg: number | null;
}

export interface Monitoring {
  agora: Date;
  fuso: string;
  realTime: CardsRealTime;
  agents: CardAgents;
  hoje: TodayCards;
  abertas: LinhaConversationAberta[];
  carga: CargaAgent[];
  queues: SummaryQueue[];
  etiquetas: ResumoEtiqueta[];
  ticketsAbertosByHora: number[];
  /** Catálogo para os filtros rápidos. */
  listaAgents: { id: string; nome: string }[];
}

/** Número de ticket legível a partir do uuid — o modelo não tem sequência própria. */
export function ticketDe(id: string): string {
  return `#${id.replace(/-/g, '').slice(-6).toUpperCase()}`;
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
export function esperaOrdenarQueue<
  T extends { priority: string; marcos: { criadaEm: Date | string | null } },
>(linhas: readonly T[]): T[] {
  return [...linhas].sort((a, b) => {
    const diferenca = pesoPriority(a.priority) - pesoPriority(b.priority);
    if (diferenca !== 0) return diferenca;
    /* Sem marco de criação vai para o fim: ela não é "a mais antiga", é a que
       não sabemos quando começou. Mesma regra do `null` na ordem do Desk.
       Pelo JSON da API a data chega como TEXTO, não `Date`: chamar `getTime`
       direto derrubava a aba "Aguardando atendimento" inteira. */
    const ta = a.marcos.criadaEm ? new Date(a.marcos.criadaEm).getTime() : Infinity;
    const tb = b.marcos.criadaEm ? new Date(b.marcos.criadaEm).getTime() : Infinity;
    return ta - tb;
  });
}

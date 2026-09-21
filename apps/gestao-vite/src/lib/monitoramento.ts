import {
  pesoPrioridade,
  type ContagemEncerramento,
  type EstadoAtendente,
  type Marcos,
  type ResultadoMetrica,
  type ResultadoTempoDeResposta,
} from '@pipe/core';
import { type PillSla } from './sla';

export interface LinhaConversaAberta {
  id: string;
  ticket: string;
  contatoNome: string;
  filaId: string | null;
  filaNome: string | null;
  atendenteId: string | null;
  atendenteNome: string | null;
  estado: string;
  prioridade: string;
  marcos: Marcos;
  /** Segundos na fila: fechado quando já foi atribuída, correndo quando não. */
  naFilaSeg: number | null;
  filaCorrendo: boolean;
  primeiraRespostaSeg: number | null;
  primeiraRespostaCorrendo: boolean;
  atendimentoSeg: number | null;
  emEspera: boolean;
  /** A bola está com o atendente: o cliente falou por último, ou ninguém respondeu ainda. */
  aguardandoAtendente: boolean;
  sla: PillSla;
  etiquetas: string[];
}

export interface CartoesTempoReal {
  naFila: number;
  maiorEsperaNaFilaSeg: number | null;
  /**
   * De quantas conversas o máximo acima saiu. Máximo sem população é a mesma
   * armadilha da média sem denominador (§2 da spec de métricas): "40 minutos"
   * entre duas conversas e entre duzentas pedem reações opostas.
   */
  aguardandoPrimeiraResposta: number;
  maiorEsperaPrimeiraRespostaSeg: number | null;
  emAtendimento: number;
  atendentesOnline: number;
  mediaPorAtendente: number | null;
}

export interface CartaoAtendentes {
  online: number;
  pausa: number;
  invisivel: number;
  offline: number;
  pausasEstouradas: number;
}

export interface CartoesDeHoje {
  esperaDoCliente: ResultadoMetrica;
  atePrimeiraResposta: ResultadoMetrica;
  tempoDeAtendimento: ResultadoMetrica;
  tempoDeResposta: ResultadoTempoDeResposta;
  encerramentos: ContagemEncerramento;
}

export interface CargaAtendente {
  id: string;
  nome: string;
  estado: EstadoAtendente;
  ativas: number;
  aguardandoAtendente: number;
  limite: number;
  carga: number;
  /** Carga máxima possível: o limite todo ocupado por conversa aguardando o atendente. */
  cargaMaxima: number;
}

export interface ResumoFila {
  id: string;
  nome: string;
  naFila: number;
  emAtendimento: number;
  maiorEsperaSeg: number | null;
  atendentesOnline: number;
}

export interface ResumoEtiqueta {
  id: string;
  nome: string;
  cor: string | null;
  abertas: number;
}

export interface Monitoramento {
  agora: Date;
  fuso: string;
  tempoReal: CartoesTempoReal;
  atendentes: CartaoAtendentes;
  hoje: CartoesDeHoje;
  abertas: LinhaConversaAberta[];
  carga: CargaAtendente[];
  filas: ResumoFila[];
  etiquetas: ResumoEtiqueta[];
  /** Catálogo para os filtros rápidos. */
  listaAtendentes: { id: string; nome: string }[];
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
export interface FiltroMonitoramento {
  filaId?: string | undefined;
  atendenteId?: string | undefined;
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
export function ordenarFilaDeEspera<
  T extends { prioridade: string; marcos: { criadaEm: Date | string | null } },
>(linhas: readonly T[]): T[] {
  return [...linhas].sort((a, b) => {
    const diferenca = pesoPrioridade(a.prioridade) - pesoPrioridade(b.prioridade);
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

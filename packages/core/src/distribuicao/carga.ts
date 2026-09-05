/**
 * Distribuição por carga real — §7 da spec de métricas.
 *
 * Um atendente pode receber uma conversa quando, ao mesmo tempo: pertence à
 * fila, está online, e tem vaga (`limite_simultaneo − ativas > 0`). Há um
 * segundo teto independente: número máximo de conversas atribuídas ainda **sem
 * primeira resposta**, que impede o atendente de acumular fila própria enquanto
 * não responde ninguém.
 *
 * Entre os elegíveis, escolhe-se por carga, não por rodízio:
 *  1. menor carga ponderada — conversa aguardando o atendente pesa mais que
 *     conversa aguardando o cliente;
 *  2. empate: quem está há mais tempo sem receber conversa;
 *  3. empate persistente: ordem estável por identificador.
 */

import { compararIdentificador } from '../comum/tempo.js';

/** `status_atendente.estado` do modelo de dados (§3). Só `online` recebe. */
export type EstadoAtendente = 'online' | 'pausa' | 'invisivel' | 'offline';

export interface AtendenteDisponivel {
  id: string;
  estado: EstadoAtendente;
  /** Filas em que o atendente está habilitado. */
  filas: readonly string[];
  /** `fila_atendente.capacidade_override` ou o padrão da fila/tenant. */
  limiteSimultaneo: number;
  /** Conversas abertas atribuídas a ele agora. */
  ativas: number;
  /** Subconjunto de `ativas` em que a bola está com o atendente. */
  aguardandoAtendente: number;
  /** Conversas atribuídas que ainda não receberam primeira resposta. */
  semPrimeiraResposta: number;
  /** Quando recebeu a última conversa. `null` = nunca recebeu. */
  ultimaAtribuicaoEm: Date | null;
}

export type MotivoInelegivel =
  | 'fora_da_fila'
  | 'nao_esta_online'
  | 'sem_vaga'
  | 'teto_sem_primeira_resposta';

export interface OpcoesDistribuicao {
  filaId: string;
  /** Teto de conversas sem 1ª resposta. `null`/ausente desliga o segundo teto. */
  tetoSemPrimeiraResposta?: number | null;
  /** Peso da conversa que aguarda o atendente. Padrão 2. */
  pesoAguardandoAtendente?: number;
  /** Peso da conversa que aguarda o cliente. Padrão 1. */
  pesoAguardandoCliente?: number;
}

export interface DescarteDistribuicao {
  atendenteId: string;
  motivo: MotivoInelegivel;
}

export interface EscolhaDistribuicao {
  escolhido: AtendenteDisponivel | null;
  /** Elegíveis já na ordem de preferência. */
  elegiveis: AtendenteDisponivel[];
  descartados: DescarteDistribuicao[];
}

export const PESO_AGUARDANDO_ATENDENTE = 2;
export const PESO_AGUARDANDO_CLIENTE = 1;

/**
 * Carga ponderada do atendente.
 *
 * `aguardandoAtendente` é clampado em `ativas`: dado inconsistente não pode
 * gerar carga negativa para o outro termo.
 */
export function cargaPonderada(
  atendente: AtendenteDisponivel,
  opcoes: Pick<OpcoesDistribuicao, 'pesoAguardandoAtendente' | 'pesoAguardandoCliente'> = {},
): number {
  const pesoAtendente = opcoes.pesoAguardandoAtendente ?? PESO_AGUARDANDO_ATENDENTE;
  const pesoCliente = opcoes.pesoAguardandoCliente ?? PESO_AGUARDANDO_CLIENTE;
  const quentes = Math.max(0, Math.min(atendente.aguardandoAtendente, atendente.ativas));
  const frias = Math.max(0, atendente.ativas - quentes);
  return quentes * pesoAtendente + frias * pesoCliente;
}

/** Vagas restantes. Nunca negativo. */
export function vagas(atendente: AtendenteDisponivel): number {
  return Math.max(0, atendente.limiteSimultaneo - atendente.ativas);
}

/** Por que este atendente não pode receber agora — ou `null` se pode. */
export function motivoInelegivel(
  atendente: AtendenteDisponivel,
  opcoes: OpcoesDistribuicao,
): MotivoInelegivel | null {
  if (!atendente.filas.includes(opcoes.filaId)) return 'fora_da_fila';
  if (atendente.estado !== 'online') return 'nao_esta_online';
  if (vagas(atendente) <= 0) return 'sem_vaga';
  const teto = opcoes.tetoSemPrimeiraResposta;
  if (typeof teto === 'number' && atendente.semPrimeiraResposta >= teto) {
    return 'teto_sem_primeira_resposta';
  }
  return null;
}

export function elegivel(atendente: AtendenteDisponivel, opcoes: OpcoesDistribuicao): boolean {
  return motivoInelegivel(atendente, opcoes) === null;
}

/**
 * Ordem de preferência entre dois elegíveis.
 *
 * Quem nunca recebeu conversa (`ultimaAtribuicaoEm === null`) está há mais tempo
 * sem receber do que qualquer um que já recebeu — vem antes no desempate.
 */
export function compararPreferencia(
  a: AtendenteDisponivel,
  b: AtendenteDisponivel,
  opcoes: OpcoesDistribuicao,
): number {
  const cargaA = cargaPonderada(a, opcoes);
  const cargaB = cargaPonderada(b, opcoes);
  if (cargaA !== cargaB) return cargaA - cargaB;

  const ociosoA = a.ultimaAtribuicaoEm === null ? -Infinity : a.ultimaAtribuicaoEm.getTime();
  const ociosoB = b.ultimaAtribuicaoEm === null ? -Infinity : b.ultimaAtribuicaoEm.getTime();
  if (ociosoA !== ociosoB) return ociosoA - ociosoB;

  return compararIdentificador(a.id, b.id);
}

/**
 * Escolhe o atendente que recebe a próxima conversa da fila.
 *
 * Devolve também a lista de descartados com o motivo: sem isso, "ninguém
 * recebeu" vira um mistério em produção.
 */
export function escolherAtendente(
  atendentes: readonly AtendenteDisponivel[],
  opcoes: OpcoesDistribuicao,
): EscolhaDistribuicao {
  const elegiveis: AtendenteDisponivel[] = [];
  const descartados: DescarteDistribuicao[] = [];

  for (const atendente of atendentes) {
    const motivo = motivoInelegivel(atendente, opcoes);
    if (motivo === null) elegiveis.push(atendente);
    else descartados.push({ atendenteId: atendente.id, motivo });
  }

  elegiveis.sort((a, b) => compararPreferencia(a, b, opcoes));
  descartados.sort((a, b) => compararIdentificador(a.atendenteId, b.atendenteId));

  return { escolhido: elegiveis[0] ?? null, elegiveis, descartados };
}

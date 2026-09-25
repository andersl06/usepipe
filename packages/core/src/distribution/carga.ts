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

import { compararIdentificador } from '../comum/time.js';

/** `status_atendente.estado` do modelo de dados (§3). Só `online` recebe. */
export type StateAgent = 'online' | 'pausa' | 'invisivel' | 'offline';

export interface AgentDisponivel {
  id: string;
  state: StateAgent;
  /** Filas em que o atendente está habilitado. */
  queues: readonly string[];
  /** `fila_atendente.capacidade_override` ou o padrão da fila/tenant. */
  limiteSimultaneo: number;
  /** Conversas abertas atribuídas a ele agora. */
  ativas: number;
  /** Subconjunto de `ativas` em que a bola está com o atendente. */
  aguardandoAgent: number;
  /** Conversas atribuídas que ainda não receberam primeira resposta. */
  withoutFirstResposta: number;
  /** Quando recebeu a última conversa. `null` = nunca recebeu. */
  ultimaAssignmentIn: Date | null;
}

export type MotivoInelegivel =
  | 'fora_da_fila'
  | 'nao_esta_online'
  | 'sem_vaga'
  | 'teto_sem_primeira_resposta';

export interface OptionsDistribution {
  queueId: string;
  /** Teto de conversas sem 1ª resposta. `null`/ausente desliga o segundo teto. */
  tetoWithoutFirstResposta?: number | null;
  /** Peso da conversa que aguarda o atendente. Padrão 2. */
  pesoAguardandoAgent?: number;
  /** Peso da conversa que aguarda o cliente. Padrão 1. */
  pesoAguardandoCliente?: number;
}

export interface DescarteDistribution {
  agentId: string;
  motivo: MotivoInelegivel;
}

export interface EscolhaDistribution {
  escolhido: AgentDisponivel | null;
  /** Elegíveis já na ordem de preferência. */
  elegiveis: AgentDisponivel[];
  descartados: DescarteDistribution[];
}

export const PESO_AGUARDANDO_AGENT = 2;
export const PESO_AGUARDANDO_CLIENTE = 1;

/**
 * Carga ponderada do atendente.
 *
 * `aguardandoAtendente` é clampado em `ativas`: dado inconsistente não pode
 * gerar carga negativa para o outro termo.
 */
export function cargaPonderada(
  agent: AgentDisponivel,
  options: Pick<OptionsDistribution, 'pesoAguardandoAtendente' | 'pesoAguardandoCliente'> = {},
): number {
  const pesoAgent = options.pesoAguardandoAgent ?? PESO_AGUARDANDO_AGENT;
  const pesoCliente = options.pesoAguardandoCliente ?? PESO_AGUARDANDO_CLIENTE;
  const quentes = Math.max(0, Math.min(agent.aguardandoAgent, agent.ativas));
  const frias = Math.max(0, agent.ativas - quentes);
  return quentes * pesoAgent + frias * pesoCliente;
}

/** Vagas restantes. Nunca negativo. */
export function vagas(agent: AgentDisponivel): number {
  return Math.max(0, agent.limiteSimultaneo - agent.ativas);
}

/** Por que este atendente não pode receber agora — ou `null` se pode. */
export function motivoInelegivel(
  agent: AgentDisponivel,
  options: OptionsDistribution,
): MotivoInelegivel | null {
  if (!agent.queues.includes(options.queueId)) return 'fora_da_fila';
  if (agent.state !== 'online') return 'nao_esta_online';
  if (vagas(agent) <= 0) return 'sem_vaga';
  const teto = options.tetoWithoutFirstResposta;
  if (typeof teto === 'number' && agent.withoutFirstResposta >= teto) {
    return 'teto_sem_primeira_resposta';
  }
  return null;
}

export function elegivel(agent: AgentDisponivel, options: OptionsDistribution): boolean {
  return motivoInelegivel(agent, options) === null;
}

/**
 * Ordem de preferência entre dois elegíveis.
 *
 * Quem nunca recebeu conversa (`ultimaAtribuicaoEm === null`) está há mais tempo
 * sem receber do que qualquer um que já recebeu — vem antes no desempate.
 */
export function compararPreferencia(
  a: AgentDisponivel,
  b: AgentDisponivel,
  options: OptionsDistribution,
): number {
  const cargaA = cargaPonderada(a, options);
  const cargaB = cargaPonderada(b, options);
  if (cargaA !== cargaB) return cargaA - cargaB;

  const ociosoA = a.ultimaAssignmentIn === null ? -Infinity : a.ultimaAssignmentIn.getTime();
  const ociosoB = b.ultimaAssignmentIn === null ? -Infinity : b.ultimaAssignmentIn.getTime();
  if (ociosoA !== ociosoB) return ociosoA - ociosoB;

  return compararIdentificador(a.id, b.id);
}

/**
 * Escolhe o atendente que recebe a próxima conversa da fila.
 *
 * Devolve também a lista de descartados com o motivo: sem isso, "ninguém
 * recebeu" vira um mistério em produção.
 */
export function escolherAgent(
  agents: readonly AgentDisponivel[],
  options: OptionsDistribution,
): EscolhaDistribution {
  const elegiveis: AgentDisponivel[] = [];
  const descartados: DescarteDistribution[] = [];

  for (const agent of agents) {
    const motivo = motivoInelegivel(agent, options);
    if (motivo === null) elegiveis.push(agent);
    else descartados.push({ agentId: agent.id, motivo });
  }

  elegiveis.sort((a, b) => compararPreferencia(a, b, options));
  descartados.sort((a, b) => compararIdentificador(a.agentId, b.agentId));

  return { escolhido: elegiveis[0] ?? null, elegiveis, descartados };
}

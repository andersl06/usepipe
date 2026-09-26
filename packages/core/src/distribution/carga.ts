/**
 * Distribute by actual load (metrics spec §7). An agent is eligible only when in the queue, online, and below `limite_simultaneo − ativas > 0`; an independent cap limits assigned conversations still awaiting the first response. Among eligible agents choose lowest weighted load, with agent-waiting conversations weighted above customer-waiting ones; then longest time since last assignment; then stable identifier order.
 */

import { compararIdentificador } from '../comum/time.js';

/** Data-model §3 `status_atendente.estado`; only `online` agents receive conversations. */
export type StateAgent = 'online' | 'pausa' | 'invisivel' | 'offline';

export interface AgentDisponivel {
  id: string;
  state: StateAgent;

  queues: readonly string[];
  /** `fila_atendente.capacidade_override` or the queue/tenant default. */
  limiteSimultaneo: number;

  ativas: number;
  /** Subset of `ativas` awaiting an agent response. */
  aguardandoAgent: number;
  /** Assigned conversations with no first response yet. */
  withoutFirstResposta: number;
  /** Most recent assignment time; null means never assigned. */
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
  /** Weight for a conversation awaiting the agent, default 2. */
  pesoAguardandoAgent?: number;
  /** Weight for a conversation awaiting the customer, default 1. */
  pesoAguardandoCliente?: number;
}

export interface DescarteDistribution {
  agentId: string;
  motivo: MotivoInelegivel;
}

export interface EscolhaDistribution {
  escolhido: AgentDisponivel | null;

  elegiveis: AgentDisponivel[];
  descartados: DescarteDistribution[];
}

export const PESO_AGUARDANDO_AGENT = 2;
export const PESO_AGUARDANDO_CLIENTE = 1;

/**
 * Agent weighted load. Clamp `aguardandoAtendente` to `ativas` so inconsistent data cannot make the other term negative.
 */
export function cargaPonderada(
  agent: AgentDisponivel,
  options: Pick<OptionsDistribution, 'pesoAguardandoAgent' | 'pesoAguardandoCliente'> = {},
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
 * Preference order between eligible agents. An agent who has never received a conversation (`ultimaAtribuicaoEm === null`) has waited longer than any previously assigned agent and wins the time tie-break.
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
 * Choose the agent for the next queued conversation and return rejected candidates with reasons, so "nobody received it" can be diagnosed in production.
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

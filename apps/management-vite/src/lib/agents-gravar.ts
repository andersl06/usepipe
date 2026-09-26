import { api } from './api';
import { atualizarLeituras } from './actions';
import { motivoDe, type Resultado } from './rest';
import { queueDesvincularAgent, vincularAgentInQueue } from './registrations-gravar';

/**
 * Keep agent-screen writes (permissions, bulk edit, Excluir) separate from pure `cadastros.ts` and `atendentes.ts`. This module imports `./api`, whose `import.meta.env` dependency breaks tests outside Vite, as happened to `comunicacao.ts` before its writes moved out.
 */

/** One row of the reference Permission type by Status table. */
export interface PermissionLinha {
  codigo: string;
  grupo: string;
  description: string;
  dosPapeis: boolean;
  override: boolean | null;
  ligada: boolean;
  /** Mixed state means some selected agents have this permission and others do not; possible only with multiple selection. */
  parcial: boolean;
}

export interface AgentPermissions {
  agents: { id: string; nome: string; email: string }[];
  permissions: PermissionLinha[];
}

/** Build the read path with IDs in the query, matching the reference edit route without `:id`. */
export function permissionsCaminho(ids: readonly string[]): string | null {
  if (ids.length === 0) return null;
  return `/v1/management/agents/permissions?atendentes=${ids.join(',')}`;
}

/** Save only fields changed on the screen for `Salvar alterações`. */
export async function salvarPermissions(
  userIds: readonly string[],
  permissions: Record<string, boolean>,
): Promise<Resultado<void>> {
  try {
    await api.patch('/v1/management/agents/permissions', {
      usuarioIds: [...userIds],
      permissions,
    });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar as permissões.') };
  }
}

/**
 * Reference bulk edit (`Editar N atendentes`, requiring at least one field) assigns selected agents to a queue and/or sets an individual concurrent-ticket limit. Pipe has no separate edit-agent route: concurrency comes from queue membership (`fila_atendente.capacidade_override` over `fila.capacidade_padrao`), so both fields write through `POST /filas/:id/atendentes`. Existing members get an updated capacity; others join.
 */
export async function aplicarInSelection(
  userIds: readonly string[],
  queueId: string,
  capacityOverride: number | null,
): Promise<Resultado<void>> {
  for (const id of userIds) {
    const r = await vincularAgentInQueue(queueId, id, capacityOverride);
    if (!r.ok) return { ok: false, error: r.error };
  }
  return { ok: true, value: undefined };
}

/**
 * Recorded difference from the reference: its Excluir icon removes a person from the attendance team. Pipe has no such team record; tenant `usuario` is the account, and only queue members receive conversations. Here Excluir removes the agent from all queues while retaining the account and conversation history. Deleting the user would destroy history and exceed what the icon promises.
 */
export async function removeFromAllQueues(
  agentId: string,
  queueIds: readonly string[],
): Promise<Resultado<void>> {
  for (const queueId of queueIds) {
    const r = await queueDesvincularAgent(queueId, agentId);
    if (!r.ok) return r;
  }
  return { ok: true, value: undefined };
}



export interface RequestOfRuleOfPriority {
  nome: string;
  nivel: string;
  scopeType: 'fila' | 'tenant';
  scopeId: string | null;
}

export async function priorityCreateRule(
  pedido: RequestOfRuleOfPriority,
): Promise<Resultado<void>> {
  try {
    await api.post('/v1/management/rules/priority', pedido);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível criar a regra de priorização.') };
  }
}

export async function priorityExcluirRule(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/management/rules/priority/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a regra de priorização.') };
  }
}

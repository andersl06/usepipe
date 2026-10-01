import { api } from '@pipe/ui/api';
import { atualizarLeituras } from './actions';
import { withFlow } from './flow-scope';
import { motivoDe, type Resultado } from './rest';
import { queueUnlinkAgent, linkAgentInQueue } from './registrations-gravar';

/**
 * Keep agent-screen writes (permissions, bulk edit, Excluir) separate from pure `cadastros.ts` and `atendentes.ts`. This module imports `./api`, whose `import.meta.env` dependency breaks tests outside Vite, as happened to `comunicacao.ts` before its writes moved out.
 */

/** One row of the reference Permission type by Status table. */
export interface PermissionRow {
  code: string;
  group: string;
  description: string;
  dosPapeis: boolean;
  override: boolean | null;
  ligada: boolean;
  /** Mixed state means some selected agents have this permission and others do not; possible only with multiple selection. */
  parcial: boolean;
}

export interface AgentPermissions {
  agents: { id: string; name: string; email: string }[];
  permissions: PermissionRow[];
}

/** Build the read path with IDs in the query, matching the reference edit route without `:id`. */
export function permissionsPath(ids: readonly string[]): string | null {
  if (ids.length === 0) return null;
  return `/v1/management/agents/permissions?agents=${ids.join(',')}`;
}

/** Save only fields changed on the screen for `Salvar alterações`. */
export async function savePermissions(
  userIds: readonly string[],
  permissions: Record<string, boolean>,
): Promise<Resultado<void>> {
  try {
    await api.patch('/v1/management/agents/permissions', {
      userIds: [...userIds],
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
export async function applyInSelection(
  flowId: string,
  userIds: readonly string[],
  queueIds: readonly string[],
  capacityOverride: number | null,
): Promise<Resultado<void>> {
  for (const id of userIds) {
    for (const queueId of queueIds) {
      const r = await linkAgentInQueue(flowId, queueId, id, capacityOverride);
      if (!r.ok) return { ok: false, error: r.error };
    }
  }
  return { ok: true, value: undefined };
}

/**
 * Grava a edição de UM atendente: entra nas filas marcadas (aplicando o teto individual; `null` volta ao padrão da fila; `undefined` não mexe nas filas em que já está) e sai das desmarcadas.
 */
export async function saveAgent(
  flowId: string,
  userId: string,
  current: readonly string[],
  next: readonly string[],
  capacity: number | null | undefined,
): Promise<Resultado<void>> {
  const alvo = capacity === undefined ? next.filter((f) => !current.includes(f)) : next;
  const r = await applyInSelection(flowId, [userId], alvo, capacity ?? null);
  if (!r.ok) return r;
  for (const queueId of current.filter((f) => !next.includes(f))) {
    const u = await queueUnlinkAgent(flowId, queueId, userId);
    if (!u.ok) return u;
  }
  return { ok: true, value: undefined };
}

/**
 * Recorded difference from the reference: its Excluir icon removes a person from the attendance team. Pipe has no such team record; tenant `usuario` is the account, and only queue members receive conversations. Here Excluir removes the agent from all queues while retaining the account and conversation history. Deleting the user would destroy history and exceed what the icon promises.
 */
export async function removeFromAllQueues(
  flowId: string,
  agentId: string,
  queueIds: readonly string[],
): Promise<Resultado<void>> {
  for (const queueId of queueIds) {
    const r = await queueUnlinkAgent(flowId, queueId, agentId);
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
  flowId: string,
  pedido: RequestOfRuleOfPriority,
): Promise<Resultado<void>> {
  try {
    await api.post(withFlow('/v1/management/rules/priority', flowId), { flowId, name: pedido.nome, level: pedido.nivel, scopeType: pedido.scopeType, scopeId: pedido.scopeId });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível criar a regra de priorização.') };
  }
}

export async function priorityDeleteRule(flowId: string, id: string): Promise<Resultado<void>> {
  try {
    await api.delete(withFlow(`/v1/management/rules/priority/${id}`, flowId));
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a regra de priorização.') };
  }
}

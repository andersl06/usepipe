import type { FlowResource, FlowResourceInput } from '@pipe/contracts';
import { api } from '../../../lib/api';
import { motivoDe, type Resultado } from '../../../lib/rest';

/**
 * `GET/POST/PUT/DELETE /v1/management/flows/:id/resources` (`domain/management/flow-resources.ts`).
 * Kept apart from `regras.ts` for the same reason `flow-functions-gravar.ts` sits beside
 * `flow-functions.ts`: `regras.ts` must stay importable by `node --test` without `import.meta.env`.
 */

export async function listFlowResources(flowId: string): Promise<Resultado<FlowResource[]>> {
  try {
    const value = await api.get<FlowResource[]>(`/v1/management/flows/${flowId}/resources`);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível carregar os recursos.') };
  }
}

export async function createFlowResource(flowId: string, input: FlowResourceInput): Promise<Resultado<FlowResource>> {
  try {
    const value = await api.post<FlowResource>(`/v1/management/flows/${flowId}/resources`, input);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível criar o recurso.') };
  }
}

export async function updateFlowResource(
  flowId: string,
  id: string,
  input: FlowResourceInput,
): Promise<Resultado<FlowResource>> {
  try {
    const value = await api.put<FlowResource>(`/v1/management/flows/${flowId}/resources/${id}`, input);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar o recurso.') };
  }
}

export async function deleteFlowResource(flowId: string, id: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/management/flows/${flowId}/resources/${id}`);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir o recurso.') };
  }
}

import type { FlowSecret, FlowSecretInput } from '@pipe/contracts';
import { api } from '@pipe/ui/api';
import { motivoDe, type Resultado } from '../../lib/rest';

/**
 * `GET/POST/PUT/DELETE /v1/management/flows/:id/secrets` (`domain/management/flow-secrets.ts`).
 * The value only travels from here to the API; no response carries it back.
 */

export async function listFlowSecrets(flowId: string): Promise<Resultado<FlowSecret[]>> {
  try {
    const value = await api.get<FlowSecret[]>(`/v1/management/flows/${flowId}/secrets`);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível carregar as variáveis sensíveis.') };
  }
}

export async function createFlowSecret(flowId: string, input: FlowSecretInput): Promise<Resultado<FlowSecret>> {
  try {
    const value = await api.post<FlowSecret>(`/v1/management/flows/${flowId}/secrets`, input);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar a variável sensível.') };
  }
}

export async function updateFlowSecret(
  flowId: string,
  id: string,
  input: FlowSecretInput,
): Promise<Resultado<FlowSecret>> {
  try {
    const value = await api.put<FlowSecret>(`/v1/management/flows/${flowId}/secrets/${id}`, input);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar a variável sensível.') };
  }
}

export async function deleteFlowSecret(flowId: string, id: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/management/flows/${flowId}/secrets/${id}`);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a variável sensível.') };
  }
}

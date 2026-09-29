import type { FlowFunction, FlowFunctionInput } from '@pipe/contracts';
import { api } from '@pipe/ui/api';
import { motivoDe, type Resultado } from '../../lib/rest';

/**
 * `FlowFunctionsController` writes (02-17): `GET/POST/PUT/DELETE /v1/management/flow-functions`.
 * Kept apart from `flow-functions.ts`, whose pure filter/format functions must stay importable by
 * `node --test` without `import.meta.env` — same reason `builder-gravar.ts` sits beside
 * `builder.tsx` instead of inside it.
 */

export async function listFlowFunctions(): Promise<Resultado<FlowFunction[]>> {
  try {
    const value = await api.get<FlowFunction[]>('/v1/management/flow-functions');
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível carregar as funções.') };
  }
}

export async function createFlowFunction(input: FlowFunctionInput): Promise<Resultado<FlowFunction>> {
  try {
    const value = await api.post<FlowFunction>('/v1/management/flow-functions', input);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível criar a função.') };
  }
}

export async function updateFlowFunction(
  id: string,
  input: FlowFunctionInput,
): Promise<Resultado<FlowFunction>> {
  try {
    const value = await api.put<FlowFunction>(`/v1/management/flow-functions/${id}`, input);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar a função.') };
  }
}

export async function deleteFlowFunction(id: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/management/flow-functions/${id}`);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a função.') };
  }
}

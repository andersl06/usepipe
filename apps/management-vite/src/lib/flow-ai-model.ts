import type { FlowAiModel, FlowAiModelInput } from '@pipe/contracts';
import { api } from '@pipe/ui/api';
import { motivoDe, type Resultado } from './rest';

export const aiModelApi = (flowId: string): string => `/v1/management/flows/${encodeURIComponent(flowId)}/ai-model`;

/** PUT replaces the complete model; server metadata never becomes editor input. */
export async function saveAiModel(flowId: string, model: FlowAiModelInput): Promise<Resultado<FlowAiModel>> {
  const { settings, intents, entities, contents, assistants } = model;
  try {
    return { ok: true, value: await api.put<FlowAiModel>(aiModelApi(flowId), { settings, intents, entities, contents, assistants }) };
  } catch (cause) {
    return { ok: false, error: motivoDe(cause, 'Não foi possível salvar o modelo de IA.') };
  }
}

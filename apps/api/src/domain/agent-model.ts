import { callAgentModel as callProvider, type AgentCallOptions } from '@pipe/ai/agente';
import {
  DEFAULT_AGENT_KEY_SECRETS,
  maskSecrets,
  type AgentModelRequest,
  type AgentModelResponse,
  type ServicosDoMotor,
} from '@pipe/core';

/**
 * `ServicosDoMotor.callAgentModel` (P14): the AI agent block's model call on the provider the block
 * chose (D-58). Production and the Builder test run share it through `engineServices`.
 *
 * The provider key is the flow's secret variable (P11, "Variáveis sensíveis") the block names in
 * `model.apiKeySecret`, or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` by default. It is decrypted here,
 * handed to the provider client and dropped: it never reaches the engine, the flow context, the
 * trace or a test-run response, and any error text that quotes it is masked.
 *
 * Without a key, production fails the call (the block takes its `Error` exit, `aiagent.errorCode`
 * `model_error`); the test run answers with a stub so the Builder can still walk the flow.
 */

export interface AgentModelServiceOptions {
  /** Decrypted value of this flow's secret `name`, or null. */
  loadSecret: (name: string) => Promise<string | null>;
  /** Builder test run: answer with `stubAgentModel` when the flow has no provider key. */
  stubWhenNoKey: boolean;
  /** Test seam; the real provider call by default. */
  call?: (request: AgentModelRequest, options: AgentCallOptions) => Promise<AgentModelResponse>;
}

const PROVIDER_LABEL = { anthropic: 'Anthropic', openai: 'OpenAI' } as const;

/**
 * The test run's stand-in model: no network, no cost. It echoes the customer's message, and
 * `/handoff <nome>` calls that handoff so the Builder can test the block's exits.
 */
export function stubAgentModel(request: AgentModelRequest): AgentModelResponse {
  const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
  const said = lastUser?.content ?? '';
  const handoff = /^\/handoff\s+(\S+)/i.exec(said.trim())?.[1];
  const tool = handoff
    ? request.tools.find((t) => t.name.toLowerCase() === `handoff_${handoff}`.toLowerCase())
    : undefined;
  if (tool) {
    return { text: null, toolCalls: [{ id: `simulado-${Date.now()}`, name: tool.name, arguments: {} }], stopReason: 'tool_use', model: 'simulado' };
  }
  return {
    text:
      `[Simulação] Este fluxo não tem a chave do provedor ${PROVIDER_LABEL[request.provider]} configurada, ` +
      `então o agente não foi chamado. Mensagem recebida: "${said}".`,
    toolCalls: [],
    stopReason: 'end',
    model: 'simulado',
  };
}

export function agentModelService(options: AgentModelServiceOptions): NonNullable<ServicosDoMotor['callAgentModel']> {
  const call = options.call ?? callProvider;
  return async (request, signal) => {
    const secretName = request.apiKeySecret ?? DEFAULT_AGENT_KEY_SECRETS[request.provider];
    const apiKey = (await options.loadSecret(secretName))?.trim() || null;
    if (!apiKey) {
      if (options.stubWhenNoKey) return stubAgentModel(request);
      throw new Error(
        `A variável sensível '${secretName}' com a chave do provedor ${PROVIDER_LABEL[request.provider]} ` +
          'não está configurada neste fluxo.',
      );
    }
    try {
      return await call(request, { apiKey, ...(signal ? { signal } : {}), ...openAiBase() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(maskSecrets(message, new Set([apiKey])));
    }
  };
}

/** `PIPE_OPENAI_BASE_URL` points OpenAI calls at a compatible gateway (optional). */
function openAiBase(): Pick<AgentCallOptions, 'openAiBaseUrl'> {
  const base = process.env['PIPE_OPENAI_BASE_URL']?.trim();
  return base ? { openAiBaseUrl: base } : {};
}

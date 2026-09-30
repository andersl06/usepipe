/**
 * Blip "AI Answers" block (P16): an input block whose leaving action is `ProcessAnswers` with
 * `settings.{UserInput: "{{input.content}}", ContactId: "{{contact.identity}}", AssistantId}`. The
 * Builder says "Para consultar a resposta e o status da chamada use as variáveis aiAnswers.response e
 * aiAnswers.statusCode": the action sends nothing itself, the flow reads those two variables.
 *
 * In Blip the answer comes from an external generative assistant over the account's knowledge base.
 * Pipe answers through `ServicosDoMotor.processAnswers`, which the `api` implements with the flow's
 * curated assistants (profile, guidelines, invalid answer and Q&A knowledge) and the same provider
 * call as the AI agent (P14). The key stays a flow secret. A failure never throws: it is reported the
 * way Blip reports an HTTP call, with a non-2xx `statusCode`.
 */

import type { AcaoDoMotor } from './actions.js';
import { AI_ANSWERS_VARIABLES_KEY, setVariable, type Context } from './context.js';

export const PROCESS_ANSWERS = 'ProcessAnswers';

export interface AnswersRequest {
  userInput: string;
  contactId: string | null;
  assistantId: string;
}

export interface AnswersResult {
  /** HTTP-like status: 200 answered, 400 bad request, 404 unknown assistant, 5xx failure. */
  statusCode: number;
  response: string;
}

function setting(settings: Record<string, unknown> | null, name: string): string | null {
  if (!settings) return null;
  const key = Object.keys(settings).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key === undefined ? undefined : settings[key];
  if (value === undefined || value === null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.trim() ? text.trim() : null;
}

function writeAnswers(context: Context, result: AnswersResult): void {
  setVariable(context, AI_ANSWERS_VARIABLES_KEY, JSON.stringify({ response: result.response, statusCode: result.statusCode }));
}

export const processAnswers: AcaoDoMotor = {
  tipo: PROCESS_ANSWERS,
  async executar(context, settings, prazo) {
    const assistantId = setting(settings, 'AssistantId');
    const userInput = setting(settings, 'UserInput');
    if (!assistantId) {
      writeAnswers(context, { statusCode: 400, response: 'Nenhum assistente foi selecionado no bloco AI Answers.' });
      return;
    }
    if (!userInput) {
      writeAnswers(context, { statusCode: 400, response: 'A mensagem do cliente está vazia.' });
      return;
    }
    const service = context.services.processAnswers;
    if (!service) {
      writeAnswers(context, { statusCode: 503, response: 'O AI Answers não está disponível neste fluxo.' });
      return;
    }
    try {
      const result = await service({ userInput, contactId: setting(settings, 'ContactId'), assistantId }, prazo?.signal);
      writeAnswers(context, result);
    } catch (error) {
      // The engine's deadline still fails the action; any other failure is a status, like Blip's.
      if (prazo?.signal.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      writeAnswers(context, { statusCode: 500, response: message });
    }
  },
};

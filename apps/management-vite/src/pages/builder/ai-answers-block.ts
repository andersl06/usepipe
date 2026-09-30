import type { FlowAiModelInput } from '@pipe/contracts';
import type { Block, Mapa, Position } from './model';
import { esqueleto, gerarId, newInbound } from './model';
import { novaAcao } from './actions-of-block';

export const AI_LEXICAL_TEST_NOTE = 'Sem a chave do provedor configurada, este teste identifica intenções por similaridade de palavras nos exemplos e busca respostas no Q&A do assistente, com o prefixo [Simulação]. Com a chave, chama o provedor. Em produção, sem a chave, não identifica intenções e AI Answers retorna status 500.';
export const isAiAnswersBlock = (block: Block): boolean => block.id.startsWith('ai-answers:');

export function newAiAnswersBlock(_map: Mapa, position: Position, id = gerarId()): Block {
  return {
    ...esqueleto(`ai-answers:${id}`, 'AI Answers', position),
    $contentActions: [newInbound(`${id}-entrada`)],
    $leavingCustomActions: [novaAcao('ProcessAnswers', `${id}-answers`)],
    $defaultOutput: { stateId: 'fallback', typeOfStateId: 'state', $invalid: false },
  };
}

export function hasLexicalAi(model: FlowAiModelInput | null, ...maps: Mapa[]): boolean {
  return !!model?.intents.length || maps.some((map) => Object.values(map).some((block) =>
    [block.$enteringCustomActions, block.$leavingCustomActions, block.$localCustomActions, block.$afterStateChangedActions].some((list) => list?.some((a) => a.type === 'ProcessAnswers'))));
}

/** Secret metadata carries names only; unknown/loading state does not imply a missing key. */
export function needsLexicalStandIn(model: FlowAiModelInput | null, secretNames: readonly string[] | undefined): boolean {
  if (!secretNames) return false;
  const settings = model?.settings;
  const provider = settings?.provider ?? (/^(gpt-|o\d)/i.test(settings?.model ?? '') ? 'openai' : 'anthropic');
  const key = settings?.apiKeySecret?.trim() || (provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY');
  return !secretNames.includes(key);
}

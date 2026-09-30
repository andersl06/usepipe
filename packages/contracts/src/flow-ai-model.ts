/**
 * The flow's AI model (P16), backed by `modelo_ia_do_fluxo`: what Blip keeps in its AI extension
 * (`postmaster@ai.msging.net` `/intentions`, `/entities`, `/content`) and in its AI Answers
 * assistants, here one document per flow.
 *
 * - intents feed `input.intent.*` and the `intent` condition source;
 * - entities feed `input.entity.<name>.*` and the `entity` condition source;
 * - contents feed `input.contentAssistant.*` (an intent/entity combination → a result);
 * - assistants answer the AI Answers block (`ProcessAnswers`, `aiAnswers.*`).
 */

export type FlowAiProvider = 'anthropic' | 'openai';

export interface FlowAiModelSettings {
  /** Null: inferred from the model name (gpt-*, o* → OpenAI), else Anthropic. */
  provider: FlowAiProvider | null;
  /** Null: the provider's default model. */
  model: string | null;
  /** Name of the flow secret ("Variáveis sensíveis") with the provider key; null: the provider default. */
  apiKeySecret: string | null;
}

export interface FlowAiIntent {
  id: string;
  /** Read by `input.intent.name` and compared by the `intent` condition. */
  name: string;
  description?: string;
  /** Example user phrases (Blip "perguntas"). */
  examples: string[];
  /** `input.intent.answer` is one of these. */
  answers: string[];
}

export interface FlowAiEntityValue {
  /** The value `input.entity.<entity>.value` reads. */
  name: string;
  synonyms: string[];
}

export interface FlowAiEntity {
  id: string;
  name: string;
  values: FlowAiEntityValue[];
}

export interface FlowAiContentCombination {
  /** Intent name, or null for "any intent". */
  intent: string | null;
  /** Entity values that must appear. */
  entities: string[];
  /** How many of `entities` must match; defaults to all of them. */
  minEntityMatch?: number;
}

export interface FlowAiContent {
  id: string;
  name: string;
  combinations: FlowAiContentCombination[];
  /** `input.contentAssistant.result`. */
  result: string;
}

export interface FlowAiKnowledgeEntry {
  question: string;
  answer: string;
}

export interface FlowAiAssistant {
  /** The AI Answers block's `AssistantId`. */
  id: string;
  name: string;
  companyName?: string;
  /** Tone and persona. */
  profile?: string;
  /** Extra instructions for every answer. */
  guidelines?: string;
  /** Answer when the knowledge does not cover the question. */
  invalidAnswer: string;
  knowledge: FlowAiKnowledgeEntry[];
}

export interface FlowAiModelInput {
  settings: FlowAiModelSettings;
  intents: FlowAiIntent[];
  entities: FlowAiEntity[];
  contents: FlowAiContent[];
  assistants: FlowAiAssistant[];
}

export interface FlowAiModel extends FlowAiModelInput {
  flowId: string;
  updatedAt: string | null;
}

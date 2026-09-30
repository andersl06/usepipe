import type { FlowAiAssistant, FlowAiModelInput } from '@pipe/contracts';
import {
  DEFAULT_AGENT_KEY_SECRETS,
  DEFAULT_AGENT_MODELS,
  agentProvider,
  type AgentModelRequest,
  type AgentModelResponse,
  type AnswersResult,
  type ContentMatch,
  type Entity,
  type InputAnalysis,
  type Intent,
  type ServicosDoMotor,
} from '@pipe/core';

/**
 * P16 services behind `ServicosDoMotor.analyzeInput`, `matchContent` and `processAnswers`, over the
 * flow's AI model (`management/flow-ai-model.ts`). Production and the Builder test run share them
 * through `engineServices`.
 *
 * - **Intents** are scored by the flow's provider (the AI agent's `callAgentModel`, D-58) from the
 *   intents' names, descriptions and examples. The engine keeps the best one at or above
 *   `builder:minimumIntentScore`.
 * - **Entities** are found deterministically: an entity value or one of its synonyms appearing as
 *   whole words in the text (accents and case ignored). No model call.
 * - **Contents** (`input.contentAssistant.*`) match on the intent/entity combination.
 * - **AI Answers** retrieves the assistant's closest Q&A entries through `AnswersRetriever` and asks
 *   the provider for an answer grounded only on them, or the assistant's invalid answer.
 *
 * The provider key is the flow secret `settings.apiKeySecret` names (default `ANTHROPIC_API_KEY` /
 * `OPENAI_API_KEY`), resolved inside `callModel`; nothing here sees it. Without a key, production
 * gets no intent (as Blip when analysis fails) and AI Answers reports status 500; the test run uses
 * the lexical stand-ins below so the Builder can still walk the flow.
 */

export interface RetrievedPassage {
  question: string;
  answer: string;
  /** 0..1, higher is closer. */
  score: number;
}

/**
 * Where AI Answers finds its passages. `lexicalAnswersRetriever` ranks the assistant's own curated
 * Q&A; a knowledge-base (semantic) retriever can replace it without touching the rest.
 */
export interface AnswersRetriever {
  retrieve(request: { assistant: FlowAiAssistant; query: string; limit: number }): Promise<RetrievedPassage[]>;
}

export interface NlpServicesOptions {
  /** The running flow's AI model, or null (loaded at most once per input by the caller). */
  loadModel: () => Promise<FlowAiModelInput | null>;
  /** The provider call with the flow-secret key (`agentModelService`, never stubbed). */
  callModel: (request: AgentModelRequest, signal?: AbortSignal) => Promise<AgentModelResponse>;
  /** Whether the flow has the provider key the request would use. */
  hasKey: (secretName: string) => Promise<boolean>;
  /** Builder test run: lexical stand-ins when the flow has no provider key. */
  stubWhenNoKey: boolean;
  retriever?: AnswersRetriever;
}

export const NLP_LIMITS = {
  classifierMaxTokens: 512,
  answerMaxTokens: 1_024,
  /** Examples per intent sent to the classifier. */
  examplesInPrompt: 20,
  passages: 6,
  /** Passage text sent to the model. */
  passagesBytes: 12_000,
  /** The classifier runs while a condition or variable is read, outside any action deadline. */
  classifierTimeoutMs: 15_000,
} as const;

// --- text helpers ---

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Short Portuguese function words that carry no meaning for matching. */
const STOPWORDS = new Set(
  'a o as os de da do das dos e em no na nos nas um uma uns umas para por com que se me meu minha eu voce qual quais como onde quando e ou ao aos the is to of'.split(' '),
);

function tokens(text: string): string[] {
  return normalizeText(text).split(' ').filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Overlap between two texts' content words (Dice coefficient, 0..1). */
export function lexicalSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return (2 * common) / (ta.size + tb.size);
}

const containsPhrase = (haystack: string, phrase: string): boolean => {
  const p = normalizeText(phrase);
  return p.length > 0 && ` ${haystack} `.includes(` ${p} `);
};

// --- entities and contents ---

/** Every entity value (or synonym) the text contains, as whole words; one match per entity value. */
export function findEntities(model: FlowAiModelInput, text: string): Entity[] {
  const haystack = normalizeText(text);
  const found: Entity[] = [];
  for (const entity of model.entities) {
    for (const value of entity.values) {
      if ([value.name, ...value.synonyms].some((phrase) => containsPhrase(haystack, phrase))) {
        found.push({ id: entity.id, name: entity.name, value: value.name });
      }
    }
  }
  return found;
}

/** The content whose combination matches best (a named intent beats "any intent", then more entities). */
export function matchContentInModel(
  model: FlowAiModelInput,
  request: { intent: string | null; entities: Entity[] },
): ContentMatch | null {
  const values = new Set(request.entities.map((e) => normalizeText(e.value ?? '')).filter(Boolean));
  const intent = request.intent?.toLowerCase() ?? null;
  let best: { content: ContentMatch; rank: number } | null = null;
  for (const content of model.contents) {
    for (const combination of content.combinations) {
      if (combination.intent && combination.intent.toLowerCase() !== intent) continue;
      const hits = combination.entities.filter((e) => values.has(normalizeText(e))).length;
      if (hits < (combination.minEntityMatch ?? combination.entities.length)) continue;
      const rank = (combination.intent ? 1_000 : 0) + hits;
      if (!best || rank > best.rank) best = { content: { id: content.id, name: content.name, result: content.result }, rank };
    }
  }
  return best?.content ?? null;
}

// --- intents ---

function pick<T>(items: readonly T[]): T | undefined {
  return items.length ? items[Math.floor(Math.random() * items.length)] : undefined;
}

function toIntent(model: FlowAiModelInput, name: string, score: number): Intent | null {
  const intent = model.intents.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!intent) return null;
  const answer = pick(intent.answers);
  return {
    id: intent.id,
    name: intent.name,
    score: Math.round(Math.min(1, Math.max(0, score)) * 1_000) / 1_000,
    ...(answer ? { answer } : {}),
  };
}

/** The test run's stand-in classifier: best lexical match against each intent's name and examples. */
export function lexicalIntents(model: FlowAiModelInput, text: string): Intent[] {
  const scored: Intent[] = [];
  for (const intent of model.intents) {
    const phrases = [intent.name.replace(/[_-]+/g, ' '), ...intent.examples];
    const score = Math.max(0, ...phrases.map((p) => (normalizeText(p) === normalizeText(text) ? 1 : lexicalSimilarity(p, text))));
    if (score > 0) {
      const found = toIntent(model, intent.name, score);
      if (found) scored.push(found);
    }
  }
  return scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** The first JSON object in a model's text (models sometimes wrap it in prose or a code fence). */
export function firstJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function modelOf(model: FlowAiModelInput): Pick<AgentModelRequest, 'provider' | 'model' | 'apiKeySecret' | 'temperature'> {
  const provider = agentProvider(model.settings.provider, model.settings.model);
  return {
    provider,
    model: model.settings.model ?? DEFAULT_AGENT_MODELS[provider],
    apiKeySecret: model.settings.apiKeySecret,
    temperature: null,
  };
}

const secretNameOf = (request: Pick<AgentModelRequest, 'provider' | 'apiKeySecret'>): string =>
  request.apiKeySecret ?? DEFAULT_AGENT_KEY_SECRETS[request.provider];

export function classifierRequest(model: FlowAiModelInput, text: string): AgentModelRequest {
  const catalogue = model.intents
    .map((i) => {
      const examples = i.examples.slice(0, NLP_LIMITS.examplesInPrompt).map((e) => `  - ${JSON.stringify(e)}`).join('\n');
      return `- ${i.name}${i.description ? `: ${i.description}` : ''}${examples ? `\n${examples}` : ''}`;
    })
    .join('\n');
  return {
    ...modelOf(model),
    system:
      'You classify the intent of one customer message sent to a chatbot. The possible intents, with example messages, are:\n' +
      `${catalogue}\n\n` +
      'Reply with JSON only, no prose: {"intents":[{"name":"<intent name from the list>","score":<confidence from 0 to 1>}]}. ' +
      'List up to 3 intents from the list, most likely first, with calibrated confidence. ' +
      'Return {"intents":[]} when no intent fits. Never invent intent names.',
    messages: [{ role: 'user', content: text }],
    tools: [],
    maxTokens: NLP_LIMITS.classifierMaxTokens,
  };
}

/** Parse the classifier's reply into catalogue intents; unknown names are dropped. */
export function parseClassifierReply(model: FlowAiModelInput, reply: AgentModelResponse): Intent[] {
  const json = firstJsonObject(reply.text);
  const items = Array.isArray(json?.['intents']) ? (json['intents'] as unknown[]) : [];
  const intents: Intent[] = [];
  for (const item of items) {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const score = Number(o['score']);
    if (typeof o['name'] !== 'string' || !Number.isFinite(score)) continue;
    const intent = toIntent(model, o['name'], score);
    if (intent && !intents.some((i) => i.name === intent.name)) intents.push(intent);
  }
  return intents;
}

// --- AI Answers ---

/** The simple retriever: the assistant's curated Q&A ranked by lexical closeness to the question. */
export const lexicalAnswersRetriever: AnswersRetriever = {
  async retrieve({ assistant, query, limit }) {
    return assistant.knowledge
      .map((entry) => ({
        ...entry,
        score: Math.max(lexicalSimilarity(entry.question, query), 0.5 * lexicalSimilarity(entry.answer, query)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },
};

export function answersRequest(model: FlowAiModelInput, assistant: FlowAiAssistant, passages: RetrievedPassage[], question: string): AgentModelRequest {
  let budget: number = NLP_LIMITS.passagesBytes;
  const context: string[] = [];
  for (const p of passages) {
    const block = `P: ${p.question}\nR: ${p.answer}`;
    if (block.length > budget) break;
    budget -= block.length;
    context.push(block);
  }
  return {
    ...modelOf(model),
    system: [
      `You are ${assistant.name}, a customer service assistant${assistant.companyName ? ` for ${assistant.companyName}` : ''}.`,
      assistant.profile ? `Profile and tone: ${assistant.profile}` : '',
      assistant.guidelines ? `Guidelines: ${assistant.guidelines}` : '',
      'Answer the customer in the language of the question, briefly, using ONLY the knowledge below. ' +
        'If the knowledge does not answer the question, reply exactly with this text and nothing else:',
      assistant.invalidAnswer,
      '',
      'Knowledge:',
      context.join('\n\n') || '(empty)',
    ]
      .filter((line, i, all) => line !== '' || all[i - 1] !== '')
      .join('\n'),
    messages: [{ role: 'user', content: question }],
    tools: [],
    maxTokens: NLP_LIMITS.answerMaxTokens,
  };
}

// --- the services ---

export function nlpServices(options: NlpServicesOptions): Pick<ServicosDoMotor, 'analyzeInput' | 'matchContent' | 'processAnswers'> {
  const retriever = options.retriever ?? lexicalAnswersRetriever;
  const useStub = async (request: Pick<AgentModelRequest, 'provider' | 'apiKeySecret'>): Promise<boolean> =>
    options.stubWhenNoKey && !(await options.hasKey(secretNameOf(request)));

  return {
    analyzeInput: async ({ text }): Promise<InputAnalysis | null> => {
      const model = await options.loadModel();
      if (!model || (model.intents.length === 0 && model.entities.length === 0)) return null;
      const entities = findEntities(model, text);
      if (model.intents.length === 0) return { intentions: [], entities };
      const request = classifierRequest(model, text);
      const intentions = (await useStub(request))
        ? lexicalIntents(model, text)
        : parseClassifierReply(model, await options.callModel(request, AbortSignal.timeout(NLP_LIMITS.classifierTimeoutMs)));
      return { intentions, entities };
    },
    matchContent: async (request) => {
      const model = await options.loadModel();
      return model ? matchContentInModel(model, request) : null;
    },
    processAnswers: async ({ userInput, assistantId }, signal): Promise<AnswersResult> => {
      const model = await options.loadModel();
      const assistant = model?.assistants.find((a) => a.id === assistantId || a.id.toLowerCase() === assistantId.toLowerCase());
      if (!model || !assistant) {
        return { statusCode: 404, response: `O assistente '${assistantId}' não existe no modelo de IA deste fluxo.` };
      }
      const passages = await retriever.retrieve({ assistant, query: userInput, limit: NLP_LIMITS.passages });
      const relevant = passages.filter((p) => p.score > 0);
      if (relevant.length === 0 && passages.length === 0) return { statusCode: 200, response: assistant.invalidAnswer };
      const request = answersRequest(model, assistant, passages, userInput);
      if (await useStub(request)) {
        return { statusCode: 200, response: `[Simulação] ${relevant[0]?.answer ?? assistant.invalidAnswer}` };
      }
      const reply = await options.callModel(request, signal);
      if (reply.stopReason === 'refusal') return { statusCode: 422, response: assistant.invalidAnswer };
      return { statusCode: 200, response: reply.text?.trim() || assistant.invalidAnswer };
    },
  };
}

/**
 * NLP for the user input (P16): `input.intent.*`, `input.entity.*`, the `intent`/`entity` condition
 * sources and `input.contentAssistant.*`.
 *
 * Blip's `LazyInput` analyses the input text through its AI extension (`set /analysis`) only when the
 * flow first reads an intent or an entity, keeps the best intent whose score reaches
 * `builder:minimumIntentScore` (the Builder writes `"0.5"` by default), and treats an analysis failure
 * as "no intent". The content assistant (`set /content/analysis` with `{intent, entities,
 * minEntityMatch}`) then maps that intent/entity combination to a content result.
 *
 * Pipe keeps that shape: the engine asks `ServicosDoMotor.analyzeInput` once per input, lazily, and
 * `ServicosDoMotor.matchContent` once for the content assistant. The `api` classifies with the
 * flow's AI model (intents with examples and entities with values/synonyms) on the provider the flow
 * chose; its key stays a flow secret and never reaches the engine.
 *
 * This module only imports types, so `context.ts` and `condition.ts` can use it without an import cycle.
 */

import type { Context, Entity, InboundLazy, Intent } from './context.js';
import type { FlowBlip } from './modelos.js';

export interface InputAnalysisRequest {
  /** The input text (already trimmed and capped at `MAX_ANALYSIS_TEXT`). */
  text: string;
}

/** Every intention the classifier scored (0..1) and every entity it found. */
export interface InputAnalysis {
  intentions: Intent[];
  entities: Entity[];
}

export interface ContentMatchRequest {
  /** Name of the recognized intent, or null. */
  intent: string | null;
  entities: Entity[];
}

/** `input.contentAssistant.*`: the content whose combination matched and its result text. */
export interface ContentMatch {
  id: string;
  name: string;
  result: string;
}

/** Blip's Builder default for `builder:minimumIntentScore`. */
export const DEFAULT_MINIMUM_INTENT_SCORE = 0.5;
/** Longest text sent to the classifier. */
export const MAX_ANALYSIS_TEXT = 2_000;

/** `builder:minimumIntentScore` (0..1, stored as text); the default when absent or invalid. */
export function minimumIntentScore(flow: FlowBlip | null | undefined): number {
  const raw = flow?.configuration?.['builder:minimumIntentScore'];
  const value = raw === undefined || raw === null || String(raw).trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_MINIMUM_INTENT_SCORE;
}

/** The best intention at or above the minimum score, or null. */
export function bestIntent(intentions: readonly Intent[], minimum: number): Intent | null {
  let best: Intent | null = null;
  for (const intent of intentions) {
    const score = typeof intent.score === 'number' && Number.isFinite(intent.score) ? intent.score : 0;
    if (score < minimum) continue;
    if (!best || score > (best.score ?? 0)) best = intent;
  }
  return best;
}

/** Only plain text is analysed, as in Blip; a document input has no intent. */
function analyzableText(inbound: InboundLazy): string | null {
  if (inbound.message.tipo !== 'text/plain') return null;
  const text = inbound.serializedContent.trim();
  return text ? text.slice(0, MAX_ANALYSIS_TEXT) : null;
}

export interface InboundNlp {
  intent: Intent | null;
  entities: Entity[];
}

const analyses = new WeakMap<InboundLazy, Promise<InboundNlp>>();
const contents = new WeakMap<InboundLazy, Promise<ContentMatch | null>>();

/**
 * The input's intent and entities, analysed at most once per input. An input that arrived with
 * intent/entities already prepared keeps them; a failed analysis reads as no intent and no entity.
 */
export function analyzeInbound(inbound: InboundLazy, context: Context): Promise<InboundNlp> {
  const cached = analyses.get(inbound);
  if (cached) return cached;
  const promise = (async (): Promise<InboundNlp> => {
    if (inbound.intent || inbound.entities) {
      return { intent: inbound.intent ?? null, entities: inbound.entities ?? [] };
    }
    const text = analyzableText(inbound);
    const analyze = context.services.analyzeInput;
    if (!text || !analyze) return { intent: null, entities: [] };
    let analysis: InputAnalysis | null;
    try {
      analysis = await analyze({ text });
    } catch {
      analysis = null;
    }
    const intent = bestIntent(analysis?.intentions ?? [], minimumIntentScore(context.rootFlow ?? context.flow));
    const entities = analysis?.entities ?? [];
    inbound.intent = intent;
    inbound.entities = entities;
    return { intent, entities };
  })();
  analyses.set(inbound, promise);
  return promise;
}

/** `input.contentAssistant.*`: the content matched by this input's intent and entities, once per input. */
export function inboundContentAssistant(inbound: InboundLazy, context: Context): Promise<ContentMatch | null> {
  const cached = contents.get(inbound);
  if (cached) return cached;
  const promise = (async (): Promise<ContentMatch | null> => {
    const match = context.services.matchContent;
    if (!match) return null;
    const { intent, entities } = await analyzeInbound(inbound, context);
    if (!intent?.name && entities.length === 0) return null;
    try {
      return await match({ intent: intent?.name ?? null, entities });
    } catch {
      return null;
    }
  })();
  contents.set(inbound, promise);
  return promise;
}

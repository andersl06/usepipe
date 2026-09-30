/**
 * Native satisfaction survey block (BAH 3.0), documented in
 * `ref/inventario-satisfacao-e-tags.md` §1: the reference marks the block by the
 * content it sends on entry (`application/vnd.lime.satisfaction-survey+json`,
 * `content: { type, scale, question, score }`), not by a dedicated block type.
 * Branching after the answer uses the flow's own generic `$conditionOutputs`
 * (already handled by `processarSaidas` in `manager.ts`) — there is no fixed
 * category ("promotor"/"neutro"/"detrator") built into the block itself (D-09).
 * This module only recognizes the block and turns the raw reply into a
 * `{ rating, comment, status }` triple for `ServicosDoMotor.recordSatisfactionAnswer`.
 */

import type { State } from './modelos.js';

export const SURVEY_CONTENT_TYPE = 'application/vnd.lime.satisfaction-survey+json';

export interface SatisfactionAnswer {
  /** Raw 1-5 rating (D-06); null for `sem_resposta`. */
  rating: number | null;
  comment: string | null;
  /** `completa` | `so_nota` | `sem_resposta` (D-08.5); `abandono` is not produced here — see note below. */
  status: string;
}

/** Recognize the block by its entering action's serialized content, the same marker Blip uses. */
export function isSatisfactionSurveyState(state: State | null | undefined): boolean {
  if (!state?.inputActions) return false;
  return state.inputActions.some((a) => {
    if (a.type !== 'SendMessage') return false;
    const settings = a.settings as { type?: unknown } | null | undefined;
    return typeof settings?.type === 'string' && settings.type.toLowerCase() === SURVEY_CONTENT_TYPE;
  });
}

/** Leading integer 1-5, with any remaining text taken as the comment. */
const PLAIN_REPLY = /^([1-5])\b\s*(.*)$/;

function tryParseJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function ratingComment(serializedContent: string): { rating: number | null; comment: string | null } {
  const trimmed = serializedContent.trim();
  // A channel capable of echoing structured content back (mirrors the block's own envelope).
  const json = tryParseJson(trimmed) as { score?: unknown; comment?: unknown; comentario?: unknown } | null;
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const score = Number(json.score);
    const comment =
      typeof json.comment === 'string' ? json.comment : typeof json.comentario === 'string' ? json.comentario : null;
    return { rating: Number.isInteger(score) ? score : null, comment: comment?.trim() || null };
  }
  const casado = PLAIN_REPLY.exec(trimmed);
  if (!casado) return { rating: null, comment: null };
  const resto = casado[2]?.trim();
  return { rating: Number(casado[1]), comment: resto ? resto : null };
}

/**
 * Interpret one inbound reply against the survey state, or a timeout when `options.timedOut` is
 * set. Returns null when the state is not a native survey block, or when the reply is not a valid
 * 1-5 rating — an invalid rating is never recorded (the Builder's own input validation, when
 * configured, re-asks; this function is a second, defensive guard).
 *
 * ponytail: `abandono` (customer starts answering but never completes) is not distinguished from
 * `sem_resposta` here — the reference behavior for that split is blocked pending capture
 * (Capturas pendentes #3, D-03). The engine passes `timedOut: true` when the survey block's input
 * expiration fires (`input-expiration.ts`, P8), so a survey block with an inactivity time records
 * `sem_resposta`.
 */
export function interpretSatisfactionAnswer(
  state: State | null | undefined,
  serializedContent: string,
  options: { timedOut?: boolean } = {},
): SatisfactionAnswer | null {
  if (!isSatisfactionSurveyState(state)) return null;
  if (options.timedOut) return { rating: null, comment: null, status: 'sem_resposta' };
  const { rating, comment } = ratingComment(serializedContent);
  if (rating === null || rating < 1 || rating > 5) return null;
  return { rating, comment, status: comment ? 'completa' : 'so_nota' };
}

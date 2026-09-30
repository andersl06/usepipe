/**
 * Input expiration (Blip `input.expiration`, the block's "inactivity time"), following the
 * behaviour of Blip's `InputExpirationHandler` (takenet/blip-sdk-csharp, Apache-2.0): after the
 * engine leaves the user in a block that awaits input and has an expiration, a message is
 * scheduled for `now + expiration`; a user message before that cancels it; when it fires, the
 * engine processes an EMPTY `text/plain` input tagged with the expired block's id, so the block's
 * outputs decide where to go (a "user input exists" output does not match, and the default output
 * or an "input does not exist" condition takes the user onward). An expiration input for a block
 * the user already left is ignored.
 *
 * Changes from the source: the schedule is a Pipe delayed job (`apps/api`), not a LIME scheduler
 * message; the tagging travels in `InboundMessage.metadados` instead of message metadata; the
 * input's `variable` is not overwritten with the empty content, and a satisfaction survey block
 * records the expiration as `sem_resposta`.
 */
import type { InboundMessage } from './context.js';
import { timeSpanSeconds } from './context.js';
import type { FlowBlip, State } from './modelos.js';

/** Metadata key carrying the expired block's id (same name the SDK uses in message metadata). */
export const INPUT_EXPIRATION_STATE_ID = 'inputExpiration.stateId';

/** Blip's Builder accepts 1 to 1380 minutes; stored as `h:m` text (`"0:1"`, `"8:0"`). */
export const INPUT_EXPIRATION_MIN_MINUTES = 1;
export const INPUT_EXPIRATION_MAX_MINUTES = 1380;

/**
 * Seconds of inactivity after which `state`'s input expires, or null when the state does not
 * wait for input (no input, `bypass`) or has no valid expiration (`HasInputExpiration`).
 */
export function inputExpirationSeconds(state: State | null | undefined): number | null {
  const input = state?.input;
  if (!input || input.bypass || !input.expiration) return null;
  const seconds = timeSpanSeconds(input.expiration);
  return seconds && seconds > 0 ? seconds : null;
}

export interface PendingInputExpiration {
  stateId: string;
  seconds: number;
}

/** The expiration to arm after an input left the user in `stateId` (null: nothing to arm). */
export function pendingInputExpiration(flow: FlowBlip, stateId: string | null | undefined): PendingInputExpiration | null {
  if (!stateId) return null;
  const seconds = inputExpirationSeconds(flow.states.find((s) => s.id === stateId));
  return seconds === null ? null : { stateId, seconds };
}

/** The input the engine processes when the block `stateId` expires. */
export function inputExpirationMessage(stateId: string, id: string, from?: string): InboundMessage {
  return {
    id,
    tipo: 'text/plain',
    conteudo: '',
    ...(from ? { de: from } : {}),
    metadados: { [INPUT_EXPIRATION_STATE_ID]: stateId },
  };
}

/** The expired block's id when `message` is an input expiration, else null. */
export function inputExpirationStateId(message: InboundMessage): string | null {
  return message.metadados?.[INPUT_EXPIRATION_STATE_ID] ?? null;
}

/** Minutes typed in the editor → the `h:m` text Blip stores; null outside 1..1380 or not whole. */
export function minutesToInputExpiration(minutes: number): string | null {
  if (!Number.isInteger(minutes) || minutes < INPUT_EXPIRATION_MIN_MINUTES || minutes > INPUT_EXPIRATION_MAX_MINUTES) return null;
  return `${Math.floor(minutes / 60)}:${minutes % 60}`;
}

/** Stored `h:m` text → whole minutes, or null when it is not a TimeSpan. */
export function inputExpirationToMinutes(expiration: string | null | undefined): number | null {
  const seconds = timeSpanSeconds(expiration);
  return seconds === null ? null : Math.round(seconds / 60);
}

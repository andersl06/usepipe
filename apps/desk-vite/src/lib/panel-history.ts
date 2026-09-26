/**
 * Pure helpers for the Desk navigation contract (D-27/D-29/D-32,
 * `std/nav-contract.md` §Desk): an open conversation or contact/ticket
 * selection lives in React state, never in the URL or in `location.state`.
 * `location.state` only ever carries a marker — `{ panel: 'conversation' }`
 * or `{ panel: 'contact' }` — with no id, so it is safe if `history.state`
 * survives an F5. On every `location.key` change, the selection that isn't
 * backed by its marker is cleared (back/forward, direct navigation, or a
 * fresh F5 that starts with an empty context).
 *
 * No React import here on purpose: this module is testable with plain
 * `node:test`, and the same decisions apply whether they're driven by
 * `useNavigate`/`useLocation` in the app or by an in-memory history stub in
 * tests.
 */

export const PANEL_CONVERSATION = 'conversation';
export const PANEL_CONTACT = 'contact';

export type Panel = typeof PANEL_CONVERSATION | typeof PANEL_CONTACT;

export interface DeskSelection {
  conversationId: string | null;
  contact: { contactId: string; ticketId: string | null } | null;
}

/** The exact `location.state` shape for an open panel: a marker, never an id. */
export function panelState(panel: Panel): { panel: Panel } {
  return { panel };
}

/** True only when `state` is the marker object for this specific panel. */
export function isPanelOpen(state: unknown, panel: Panel): boolean {
  if (state === null || typeof state !== 'object') return false;
  return (state as { panel?: unknown }).panel === panel;
}

/**
 * Reconciles the in-memory selection with the history entry landed on
 * (browser Back/Forward, a fresh F5, or a normal navigate). The panel not
 * backed by its marker in `state` is cleared; the one that is keeps its
 * previous value untouched.
 */
export function selectionAfterLocationChange(
  selection: DeskSelection,
  state: unknown,
): DeskSelection {
  return {
    conversationId: isPanelOpen(state, PANEL_CONVERSATION) ? selection.conversationId : null,
    contact: isPanelOpen(state, PANEL_CONTACT) ? selection.contact : null,
  };
}

/**
 * Push vs. replace decision for opening a panel: replacing avoids piling up
 * history entries when switching directly from one open conversation/contact
 * to another (A -> B keeps history length at 2, not 3), while opening from a
 * neutral entry (the list) pushes a new one so Back can close it.
 */
export function navigationDecisionForPanel(
  currentState: unknown,
  panel: Panel,
): { replace: boolean } {
  return { replace: isPanelOpen(currentState, panel) };
}

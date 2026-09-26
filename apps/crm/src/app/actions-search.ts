'use server';

import { buscar } from '../lib/search';
import type { Resultado } from '../lib/search';

/**
 * The command menu's search, called on every keystroke.
 *
 * Server action, not a route: the menu is its only consumer, and a route would require
 * re-authenticating what the session has already resolved. When the front end moves to Vite
 * this becomes an endpoint in the `api` — it's tracked in
 * `docs/specs/2026-09-07-arquitetura-de-front.md`.
 *
 * Never throws: the command menu can't take down the screen the person is on.
 * A failure becomes an empty list, and the person closes it and keeps doing what they were doing.
 */
export async function buscarGlobal(termo: string): Promise<Resultado[]> {
  try {
    return await buscar(termo);
  } catch {
    return [];
  }
}

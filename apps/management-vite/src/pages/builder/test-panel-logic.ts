import type { TestRunActionTrace, TestRunDebug } from '@pipe/contracts';

/**
 * Pure logic for the Test panel (BUILDER-04, D-14), kept out of `test-panel.tsx` because that
 * file imports `@pipe/ui`: this module stays plain so `builder-painels.test.ts` can exercise it
 * with `node --import tsx --test`, no DOM or React runtime needed.
 */

/** Author-entered test variable rows, ready for the `testVariables` request field: blank names are dropped, values are kept as typed. */
export function testVariablesToRecord(rows: readonly { chave: string; valor: string }[]): Record<string, string> {
  return Object.fromEntries(
    rows.filter((linha) => linha.chave.trim().length > 0).map((linha) => [linha.chave.trim(), linha.valor]),
  );
}

/**
 * P8: the line above "Expirar entrada" when the test contact waits in a block with an inactivity
 * time (`debug.inputExpiration`): `3600` → "O bloco expira após 1 h sem resposta."
 */
export function inputExpirationHint(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const tempo = h > 0 ? (m > 0 ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  return `O bloco expira após ${tempo} sem resposta.`;
}

export interface DebugSection {
  stateId: string;
  actions: TestRunActionTrace[];
}

/** Marker for the flow's global entering/leaving actions inside the flattened Debug list, distinct from any real block id. */
export const GLOBAL_ACTIONS_SECTION_ID = '(globais)';

/** Flattens per-block traces and the global actions trace into one ordered list for the Debug view. */
export function debugSections(debug: TestRunDebug): DebugSection[] {
  return [...debug.states, { stateId: GLOBAL_ACTIONS_SECTION_ID, actions: debug.actionsGlobal }];
}

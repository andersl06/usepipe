import type { TestRunActionTrace, TestRunDebug } from '@pipe/contracts';
import type { Mapa } from './model';
import type { Subflows } from './subflows';

/**
 * The title the Debug shows for a step: the block's title in the canvas it ran in (the subflow's
 * when `subflow` is set, P13; short names compare ignoring case, as in the engine), else its id.
 */
export function stepTitle(mapa: Mapa, subfluxos: Subflows, stateId: string, subflow?: string | null): string {
  if (subflow) {
    const key = subflow in subfluxos
      ? subflow
      : Object.keys(subfluxos).find((k) => k.toLowerCase() === subflow.toLowerCase());
    return (key ? subfluxos[key]?.mapa[stateId]?.$title : undefined) ?? stateId;
  }
  return mapa[stateId]?.$title ?? stateId;
}

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
  /** The subflow the block belongs to (P13); absent for the flow's own blocks and the global actions. */
  subflow?: string;
}

/** Marker for the flow's global entering/leaving actions inside the flattened Debug list, distinct from any real block id. */
export const GLOBAL_ACTIONS_SECTION_ID = '(globais)';

/** Flattens per-block traces and the global actions trace into one ordered list for the Debug view. */
export function debugSections(debug: TestRunDebug): DebugSection[] {
  return [...debug.states, { stateId: GLOBAL_ACTIONS_SECTION_ID, actions: debug.actionsGlobal }];
}

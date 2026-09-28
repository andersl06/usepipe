import type { AcaoDoEditor, Block } from './model';
import { ACTIONS_LIMIT, LABELS_OF_ACTIONS } from './actions-of-block';
import type { ActionsList } from './actions-of-block';

/**
 * Global Actions in Configuration (`portal.js` `builder-configurations.globalActions.title`, `<actions state="$ctrl.globalActions">`) use the same `$enteringCustomActions` and `$leavingCustomActions` lists as a block, but for the whole flow. `editor.ts` confirms `globalActions.$enteringCustomActions` and `$leavingCustomActions` become executed flow-wide actions in published form. Reuse `acoes-do-bloco.ts` catalog, labels, and validation (`novaAcao`, `tipoDeAcao`, `fieldValue`, `comCampo`, `comTitulo`, `withConditions`, `actionErrors`); only list CRUD changes to `globais` (`Record<string, unknown>`) rather than `Block` with `id`.
 *
 * "Ações globais" (F-2.2) renders the identical component the block's "Ações" tab uses
 * (`ActionsPanel`, `panel-actions.tsx`), not a parallel list: `pseudoBlockOfGlobal`/`globalOfPseudoBlock`
 * wrap `global` as a `Block` just for that render, so the block-shaped CRUD in `actions-of-block.ts`
 * (`adicionarAcao`, `moverAcao`…) works on it unchanged. The `*Global` functions below stay for direct,
 * non-UI edits to `global` (still covered by their own tests).
 */

/** A non-attendance, non-root id: `ehAttendance`/`block.root` checks in `ActionsPanel` never trigger. */
const GLOBAL_PSEUDO_BLOCK_ID = '$global';

/** Wraps `global` as a `Block` so `ActionsPanel` can render "Ações globais" unchanged. */
export function pseudoBlockOfGlobal(global: Record<string, unknown>): Block {
  return { ...global, id: GLOBAL_PSEUDO_BLOCK_ID } as Block;
}

/** The inverse: strips the pseudo-block's `id` back out, leaving `global` as `ActionsPanel` left it. */
export function globalOfPseudoBlock(block: Block): Record<string, unknown> {
  const global: Record<string, unknown> = { ...block };
  delete global.id;
  return global;
}

export interface ActionsGlobal {
  $enteringCustomActions?: AcaoDoEditor[];
  $leavingCustomActions?: AcaoDoEditor[];
  [extensao: string]: unknown;
}

export const actionsGlobalList = (global: Record<string, unknown>, lista: ActionsList): AcaoDoEditor[] => {
  const actions = (global as ActionsGlobal)[lista];
  return Array.isArray(actions) ? actions : [];
};

export type ResultadoDeAcaoGlobal = { ok: true; global: Record<string, unknown> } | { ok: false; error: string };

export function adicionarAcaoGlobal(
  global: Record<string, unknown>,
  lista: ActionsList,
  acao: AcaoDoEditor,
): ResultadoDeAcaoGlobal {
  const current = actionsGlobalList(global, lista);
  if (current.length >= ACTIONS_LIMIT) return { ok: false, error: LABELS_OF_ACTIONS.limite };
  return { ok: true, global: { ...global, [lista]: [...current, acao] } };
}

export function substituirAcaoGlobal(
  global: Record<string, unknown>,
  lista: ActionsList,
  indice: number,
  acao: AcaoDoEditor,
): Record<string, unknown> {
  const current = actionsGlobalList(global, lista);
  return { ...global, [lista]: current.map((a, i) => (i === indice ? acao : a)) };
}

export function removerAcaoGlobal(
  global: Record<string, unknown>,
  lista: ActionsList,
  indice: number,
): Record<string, unknown> {
  const current = actionsGlobalList(global, lista);
  return { ...global, [lista]: current.filter((_, i) => i !== indice) };
}

export function moverAcaoGlobal(
  global: Record<string, unknown>,
  lista: ActionsList,
  de: number,
  para: number,
): Record<string, unknown> {
  const current = [...actionsGlobalList(global, lista)];
  if (de < 0 || de >= current.length || para < 0 || para >= current.length || de === para) return global;
  const [acao] = current.splice(de, 1);
  current.splice(para, 0, acao!);
  return { ...global, [lista]: current };
}

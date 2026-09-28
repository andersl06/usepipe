/**
 * Pure queue behind the Builder's single toast (F-6.1 K, D-56): newest on top, capped at
 * `TOAST_LIMIT`, each with its own countdown that a hover pauses. No DOM, no timers — the
 * component (`toast.tsx`) owns the `setInterval` and calls `expireToasts` on a tick.
 */

export type ToastTone = 'sucesso' | 'aviso' | 'perigo';

export interface ToastInput {
  tom: ToastTone;
  /** Optional bold first line; `texto` is always the line under it (or the only line). */
  titulo?: string;
  texto: string;
  /** Defaults to `TOAST_DURATION_MS`. */
  duracaoMs?: number;
}

export interface Toast extends ToastInput {
  id: number;
  duracaoMs: number;
  /** `Date.now()`-scale deadline; `expireToasts` refreshes it while paused. */
  expiraEm: number;
}

/** Up to 6 stacked, the oldest dropped first (F-6.1 K). */
export const TOAST_LIMIT = 6;

/** 5s per toast, like the Blip toast being reproduced (F-6.1 K). */
export const TOAST_DURATION_MS = 5000;

function nextId(lista: readonly Toast[]): number {
  return lista.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

/** Adds `input` at the top of `lista`; past `TOAST_LIMIT` the oldest (last) one is dropped. */
export function pushToast(lista: readonly Toast[], input: ToastInput, agora: number): Toast[] {
  const duracaoMs = input.duracaoMs ?? TOAST_DURATION_MS;
  const novo: Toast = {
    tom: input.tom,
    titulo: input.titulo,
    texto: input.texto,
    duracaoMs,
    id: nextId(lista),
    expiraEm: agora + duracaoMs,
  };
  const atualizada = [novo, ...lista];
  return atualizada.length > TOAST_LIMIT ? atualizada.slice(0, TOAST_LIMIT) : atualizada;
}

/** Removes only the toast with this `id`; every other one is untouched. */
export function dismissToast(lista: readonly Toast[], id: number): Toast[] {
  return lista.filter((t) => t.id !== id);
}

/**
 * Drops whatever expired by `agora`, except the ids in `pausados` (mouse over the toast): those
 * get their deadline pushed to `agora + duracaoMs`, so resuming (leaving `pausados`) restarts the
 * countdown instead of expiring right away with a stale deadline.
 */
export function expireToasts(
  lista: readonly Toast[],
  agora: number,
  pausados: ReadonlySet<number>,
): Toast[] {
  return lista
    .map((t) => (pausados.has(t.id) ? { ...t, expiraEm: agora + t.duracaoMs } : t))
    .filter((t) => pausados.has(t.id) || t.expiraEm > agora);
}

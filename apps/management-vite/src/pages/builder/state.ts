import type { Mapa } from './model';

/**
 * The editor's state and undo/redo — its two footer buttons ("Desfazer (Ctrl+z)", "Refazer (Ctrl+Shift+z)"), which the frame already rendered disabled.
 *
 * It's a pure reducer over the block map: every gesture that changes the drawing arrives as `aplicar` with the new map (the functions in `modelo.ts`, `condicoes.ts`, `conteudo.ts` and `acoes-do-bloco.ts` already return the ready map or block), the previous map goes to the past stack, and the future is cleared. `mover` is the exception: while the block is being dragged the map changes on every pixel, and only `soltar` records a step — otherwise Ctrl+Z would undo the drag pixel by pixel.
 *
 * `sujo` is what the footer's "Salvo" reads: it turns on with any change and only turns off on `salvo`, with the map that was saved — a change that arrived while the `PUT` was in flight stays dirty.
 */

export const HISTORY_LIMIT = 50;

export interface EditorState {
  mapa: Mapa;
  global: Record<string, unknown>;
  passado: Mapa[];
  futuro: Mapa[];
  /** The map before the drag in progress, so `soltar` records a single step. */
  antesDoArrasto: Mapa | null;
  sujo: boolean;
  /** The last saved map — so `salvo` can tell whether what came back is still current. */
  gravado: Mapa | null;
}

export type GestoDoEditor =
  | { tipo: 'carregar'; mapa: Mapa; global: Record<string, unknown> }
  | { tipo: 'aplicar'; mapa: Mapa }
  | { tipo: 'mover'; mapa: Mapa }
  | { tipo: 'soltar' }
  | { tipo: 'desfazer' }
  | { tipo: 'refazer' }
  | { tipo: 'salvo'; mapa: Mapa }
  /**
   * Global actions ("Ações Globais" tab of Configuração) — outside the undo/redo stack, which only stores `Mapa` (see `passado`/`futuro`); Ctrl+Z keeps undoing only the drawing, as it did before this tab existed.
   */
  | { tipo: 'aplicarGlobais'; global: Record<string, unknown> };

export function stateInitial(): EditorState {
  return { mapa: {}, global: {}, passado: [], futuro: [], antesDoArrasto: null, sujo: false, gravado: null };
}

export function reduzir(state: EditorState, gesto: GestoDoEditor): EditorState {
  switch (gesto.tipo) {
    case 'carregar':
      return { ...stateInitial(), mapa: gesto.mapa, global: gesto.global, gravado: gesto.mapa };
    case 'aplicar': {
      if (gesto.mapa === state.mapa) return state;
      const passado = [...state.passado, state.mapa].slice(-HISTORY_LIMIT);
      return { ...state, mapa: gesto.mapa, passado, futuro: [], sujo: true };
    }
    case 'mover':
      return {
        ...state,
        mapa: gesto.mapa,
        antesDoArrasto: state.antesDoArrasto ?? state.mapa,
        sujo: true,
      };
    case 'soltar': {
      if (!state.antesDoArrasto) return state;
      const passado = [...state.passado, state.antesDoArrasto].slice(-HISTORY_LIMIT);
      return { ...state, passado, futuro: [], antesDoArrasto: null };
    }
    case 'desfazer': {
      // A drag in progress hasn't become a history step yet (only `soltar`
      // empilha) — desfazer agora trocaria o mapa por baixo do arrasto e o
      // `soltar` seguinte empilharia o `antesDoArrasto` velho por cima, perdendo
      // undo. Ctrl+Z disappears while the mouse button is held down.
      if (state.antesDoArrasto) return state;
      const anterior = state.passado[state.passado.length - 1];
      if (!anterior) return state;
      return {
        ...state,
        mapa: anterior,
        passado: state.passado.slice(0, -1),
        futuro: [state.mapa, ...state.futuro],
        sujo: anterior !== state.gravado,
      };
    }
    case 'refazer': {
      if (state.antesDoArrasto) return state;
      const proximo = state.futuro[0];
      if (!proximo) return state;
      return {
        ...state,
        mapa: proximo,
        passado: [...state.passado, state.mapa].slice(-HISTORY_LIMIT),
        futuro: state.futuro.slice(1),
        sujo: proximo !== state.gravado,
      };
    }
    case 'salvo':
      return { ...state, gravado: gesto.mapa, sujo: state.mapa !== gesto.mapa };
    case 'aplicarGlobais':
      if (gesto.global === state.global) return state;
      return { ...state, global: gesto.global, sujo: true };
  }
}

export const podeDesfazer = (state: EditorState): boolean => state.passado.length > 0;
export const podeRefazer = (state: EditorState): boolean => state.futuro.length > 0;

import type { Mapa } from './model';

/**
 * The editor's state and undo/redo — its two footer buttons ("Desfazer (Ctrl+z)", "Refazer (Ctrl+Shift+z)"), which the frame already rendered disabled.
 *
 * It's a pure reducer over the block map: every gesture that changes the drawing arrives as `aplicar` with the new map (the functions in `modelo.ts`, `condicoes.ts`, `conteudo.ts` and `acoes-do-bloco.ts` already return the ready map or block), the previous map goes to the past stack, and the future is cleared. `mover` is the exception: while the block is being dragged the map changes on every pixel, and only `soltar` records a step — otherwise Ctrl+Z would undo the drag pixel by pixel.
 *
 * `sujo` is what the footer's "Salvo" reads: it turns on with any change and only turns off on `salvo`, with the map that was saved — a change that arrived while the `PUT` was in flight stays dirty.
 */

export const HISTORY_LIMIT = 50;

/** Only user keys (`configuration`'s Blip-reserved `builder:*` keys are written by the platform, not typed by hand). */
export const validConfigKey = (chave: string): boolean => /^[a-zA-Z0-9]+$/.test(chave);

/** One undo/redo step: the drawing and the configuration change together, same as the reference's own autosave. */
interface Snapshot {
  mapa: Mapa;
  configuracao: Record<string, string>;
}

export interface EditorState {
  mapa: Mapa;
  /** `configuration` map ({{config.Chave}}); edited by `tipo: 'configuracao'`, shares undo/redo with `mapa`. */
  configuracao: Record<string, string>;
  global: Record<string, unknown>;
  passado: Snapshot[];
  futuro: Snapshot[];
  /** The map before the drag in progress, so `soltar` records a single step. */
  antesDoArrasto: Mapa | null;
  sujo: boolean;
  /** The last saved snapshot — so `salvo` can tell whether what came back is still current. */
  gravado: Snapshot | null;
}

export type GestoDoEditor =
  | { tipo: 'carregar'; mapa: Mapa; global: Record<string, unknown>; configuracao?: Record<string, string> }
  | { tipo: 'aplicar'; mapa: Mapa }
  | { tipo: 'mover'; mapa: Mapa }
  | { tipo: 'soltar' }
  | { tipo: 'desfazer' }
  | { tipo: 'refazer' }
  | { tipo: 'salvo'; mapa: Mapa; configuracao: Record<string, string> }
  /** Sets one `configuration` key; `valor: null` removes it. Shares the `mapa` undo/redo stack. */
  | { tipo: 'configuracao'; chave: string; valor: string | null }
  /**
   * Global actions ("Ações Globais" tab of Configuração) — outside the undo/redo stack, which only stores `Snapshot` (see `passado`/`futuro`); Ctrl+Z keeps undoing only the drawing and the configuration, as it did before this tab existed.
   */
  | { tipo: 'aplicarGlobais'; global: Record<string, unknown> };

export function stateInitial(): EditorState {
  return {
    mapa: {},
    configuracao: {},
    global: {},
    passado: [],
    futuro: [],
    antesDoArrasto: null,
    sujo: false,
    gravado: null,
  };
}

/** Reference equality on both halves — the same check `desfazer`/`refazer` used on `mapa` alone before `configuracao` existed. */
const igualAoGravado = (mapa: Mapa, configuracao: Record<string, string>, gravado: Snapshot | null): boolean =>
  gravado !== null && mapa === gravado.mapa && configuracao === gravado.configuracao;

export function reduzir(state: EditorState, gesto: GestoDoEditor): EditorState {
  switch (gesto.tipo) {
    case 'carregar':
      return {
        ...stateInitial(),
        mapa: gesto.mapa,
        global: gesto.global,
        configuracao: gesto.configuracao ?? {},
        gravado: { mapa: gesto.mapa, configuracao: gesto.configuracao ?? {} },
      };
    case 'aplicar': {
      if (gesto.mapa === state.mapa) return state;
      const passado = [...state.passado, { mapa: state.mapa, configuracao: state.configuracao }].slice(-HISTORY_LIMIT);
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
      const passado = [...state.passado, { mapa: state.antesDoArrasto, configuracao: state.configuracao }].slice(
        -HISTORY_LIMIT,
      );
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
        mapa: anterior.mapa,
        configuracao: anterior.configuracao,
        passado: state.passado.slice(0, -1),
        futuro: [{ mapa: state.mapa, configuracao: state.configuracao }, ...state.futuro],
        sujo: !igualAoGravado(anterior.mapa, anterior.configuracao, state.gravado),
      };
    }
    case 'refazer': {
      if (state.antesDoArrasto) return state;
      const proximo = state.futuro[0];
      if (!proximo) return state;
      return {
        ...state,
        mapa: proximo.mapa,
        configuracao: proximo.configuracao,
        passado: [...state.passado, { mapa: state.mapa, configuracao: state.configuracao }].slice(-HISTORY_LIMIT),
        futuro: state.futuro.slice(1),
        sujo: !igualAoGravado(proximo.mapa, proximo.configuracao, state.gravado),
      };
    }
    case 'salvo': {
      const gravado = { mapa: gesto.mapa, configuracao: gesto.configuracao };
      return { ...state, gravado, sujo: !igualAoGravado(state.mapa, state.configuracao, gravado) };
    }
    case 'configuracao': {
      const jaTemAChave = gesto.chave in state.configuracao;
      if (gesto.valor === null) {
        if (!jaTemAChave) return state;
      } else if (jaTemAChave && state.configuracao[gesto.chave] === gesto.valor) {
        return state;
      }
      const configuracao = { ...state.configuracao };
      if (gesto.valor === null) delete configuracao[gesto.chave];
      else configuracao[gesto.chave] = gesto.valor;
      const passado = [...state.passado, { mapa: state.mapa, configuracao: state.configuracao }].slice(-HISTORY_LIMIT);
      return { ...state, configuracao, passado, futuro: [], sujo: true };
    }
    case 'aplicarGlobais':
      if (gesto.global === state.global) return state;
      return { ...state, global: gesto.global, sujo: true };
  }
}

export const podeDesfazer = (state: EditorState): boolean => state.passado.length > 0;
export const podeRefazer = (state: EditorState): boolean => state.futuro.length > 0;

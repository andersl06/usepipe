import type { Mapa } from './model';
import type { Subflows } from './subflows';
import { withSubflowMap } from './subflows';

/**
 * The editor's state and undo/redo — its two footer buttons ("Desfazer (Ctrl+z)", "Refazer (Ctrl+Shift+z)"), which the frame already rendered disabled.
 *
 * It's a pure reducer over the block map: every gesture that changes the drawing arrives as `aplicar` with the new map (the functions in `modelo.ts`, `condicoes.ts`, `conteudo.ts` and `acoes-do-bloco.ts` already return the ready map or block), the previous map goes to the past stack, and the future is cleared. `mover` is the exception: while the block is being dragged the map changes on every pixel, and only `soltar` records a step — otherwise Ctrl+Z would undo the drag pixel by pixel.
 *
 * Subflows (P13): `subfluxos` holds every subflow drawing and `subfluxoAberto` the one on screen (null = the main flow). `aplicar`/`mover` change the canvas on screen, whichever it is; `aplicarSubfluxos` changes the main map and the subflow list together (create, delete, import). Undo/redo covers all of it, so Ctrl+Z inside a subflow undoes the last change wherever it was made; navigating between canvases is not a step.
 *
 * `sujo` is what the footer's "Salvo" reads: it turns on with any change and only turns off on `salvo`, with the map that was saved — a change that arrived while the `PUT` was in flight stays dirty.
 */

export const HISTORY_LIMIT = 50;

/** Only user keys (`configuration`'s Blip-reserved `builder:*` keys are written by the platform, not typed by hand). */
export const validConfigKey = (chave: string): boolean => /^[a-zA-Z0-9]+$/.test(chave);

/** One undo/redo step: the drawing, its subflows and the configuration change together, same as the reference's own autosave. */
interface Snapshot {
  mapa: Mapa;
  configuracao: Record<string, string>;
  subfluxos: Subflows;
}

export interface EditorState {
  /** The main flow's block map, whichever canvas is on screen (see `mapaNaTela`). */
  mapa: Mapa;
  /** `configuration` map ({{config.Chave}}); edited by `tipo: 'configuracao'`, shares undo/redo with `mapa`. */
  configuracao: Record<string, string>;
  global: Record<string, unknown>;
  /** The flow's subflows by short name (P13). */
  subfluxos: Subflows;
  /** The subflow whose canvas is on screen; null = the main flow. */
  subfluxoAberto: string | null;
  passado: Snapshot[];
  futuro: Snapshot[];
  /** The state before the drag in progress, so `soltar` records a single step. */
  antesDoArrasto: Snapshot | null;
  sujo: boolean;
  /** The last saved snapshot — so `salvo` can tell whether what came back is still current. */
  gravado: Snapshot | null;
}

export type GestoDoEditor =
  | {
      tipo: 'carregar';
      mapa: Mapa;
      global: Record<string, unknown>;
      configuracao?: Record<string, string>;
      subfluxos?: Subflows;
    }
  /** Replaces the block map of the canvas on screen (the main flow or the open subflow). */
  | { tipo: 'aplicar'; mapa: Mapa }
  | { tipo: 'mover'; mapa: Mapa }
  | { tipo: 'soltar' }
  | { tipo: 'desfazer' }
  | { tipo: 'refazer' }
  | { tipo: 'salvo'; mapa: Mapa; configuracao: Record<string, string>; subfluxos?: Subflows }
  /** Sets one `configuration` key; `valor: null` removes it. Shares the `mapa` undo/redo stack. */
  | { tipo: 'configuracao'; chave: string; valor: string | null }
  /**
   * Global actions ("Ações Globais" tab of Configuração) — outside the undo/redo stack, which only stores `Snapshot` (see `passado`/`futuro`); Ctrl+Z keeps undoing only the drawing and the configuration, as it did before this tab existed.
   */
  | { tipo: 'aplicarGlobais'; global: Record<string, unknown> }
  /** The main map and the subflow list together: create, delete or import a subflow. One undo step. */
  | { tipo: 'aplicarSubfluxos'; mapa: Mapa; subfluxos: Subflows; abrir?: string | null }
  /** Shows a subflow's canvas (or the main flow's, with null). Not an undo step and not a change. */
  | { tipo: 'abrirSubfluxo'; shortName: string | null };

export function stateInitial(): EditorState {
  return {
    mapa: {},
    configuracao: {},
    global: {},
    subfluxos: {},
    subfluxoAberto: null,
    passado: [],
    futuro: [],
    antesDoArrasto: null,
    sujo: false,
    gravado: null,
  };
}

/** The block map of the canvas on screen. */
export function mapaNaTela(state: EditorState): Mapa {
  if (state.subfluxoAberto === null) return state.mapa;
  return state.subfluxos[state.subfluxoAberto]?.mapa ?? {};
}

const snapshotOf = (state: EditorState): Snapshot => ({
  mapa: state.mapa,
  configuracao: state.configuracao,
  subfluxos: state.subfluxos,
});

/** Reference equality on every part — the same check `desfazer`/`refazer` used on `mapa` alone before `configuracao` existed. */
const igualAoGravado = (s: Snapshot, gravado: Snapshot | null): boolean =>
  gravado !== null &&
  s.mapa === gravado.mapa &&
  s.configuracao === gravado.configuracao &&
  s.subfluxos === gravado.subfluxos;

const pushed = (state: EditorState, before: Snapshot = snapshotOf(state)): Snapshot[] =>
  [...state.passado, before].slice(-HISTORY_LIMIT);

/** The state with `mapa` put on the canvas on screen. */
function onScreen(state: EditorState, mapa: Mapa): Pick<EditorState, 'mapa' | 'subfluxos'> {
  if (state.subfluxoAberto === null) return { mapa, subfluxos: state.subfluxos };
  return { mapa: state.mapa, subfluxos: withSubflowMap(state.subfluxos, state.subfluxoAberto, mapa) };
}

/** A restored snapshot; the open subflow closes when the snapshot no longer has it. */
function restored(state: EditorState, s: Snapshot): Partial<EditorState> {
  const aberto = state.subfluxoAberto !== null && s.subfluxos[state.subfluxoAberto] ? state.subfluxoAberto : null;
  return { mapa: s.mapa, configuracao: s.configuracao, subfluxos: s.subfluxos, subfluxoAberto: aberto };
}

export function reduzir(state: EditorState, gesto: GestoDoEditor): EditorState {
  switch (gesto.tipo) {
    case 'carregar': {
      const loaded: Snapshot = {
        mapa: gesto.mapa,
        configuracao: gesto.configuracao ?? {},
        subfluxos: gesto.subfluxos ?? {},
      };
      return { ...stateInitial(), ...loaded, global: gesto.global, gravado: loaded };
    }
    case 'aplicar': {
      if (gesto.mapa === mapaNaTela(state)) return state;
      if (state.subfluxoAberto !== null && !state.subfluxos[state.subfluxoAberto]) return state;
      return { ...state, ...onScreen(state, gesto.mapa), passado: pushed(state), futuro: [], sujo: true };
    }
    case 'mover':
      if (state.subfluxoAberto !== null && !state.subfluxos[state.subfluxoAberto]) return state;
      return {
        ...state,
        ...onScreen(state, gesto.mapa),
        antesDoArrasto: state.antesDoArrasto ?? snapshotOf(state),
        sujo: true,
      };
    case 'soltar': {
      if (!state.antesDoArrasto) return state;
      return { ...state, passado: pushed(state, state.antesDoArrasto), futuro: [], antesDoArrasto: null };
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
        ...restored(state, anterior),
        passado: state.passado.slice(0, -1),
        futuro: [snapshotOf(state), ...state.futuro],
        sujo: !igualAoGravado(anterior, state.gravado),
      };
    }
    case 'refazer': {
      if (state.antesDoArrasto) return state;
      const proximo = state.futuro[0];
      if (!proximo) return state;
      return {
        ...state,
        ...restored(state, proximo),
        passado: pushed(state),
        futuro: state.futuro.slice(1),
        sujo: !igualAoGravado(proximo, state.gravado),
      };
    }
    case 'salvo': {
      const gravado: Snapshot = {
        mapa: gesto.mapa,
        configuracao: gesto.configuracao,
        subfluxos: gesto.subfluxos ?? state.subfluxos,
      };
      return { ...state, gravado, sujo: !igualAoGravado(snapshotOf(state), gravado) };
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
      return { ...state, configuracao, passado: pushed(state), futuro: [], sujo: true };
    }
    case 'aplicarGlobais':
      if (gesto.global === state.global) return state;
      return { ...state, global: gesto.global, sujo: true };
    case 'aplicarSubfluxos': {
      if (gesto.mapa === state.mapa && gesto.subfluxos === state.subfluxos && gesto.abrir === undefined) return state;
      const pedido = gesto.abrir === undefined ? state.subfluxoAberto : gesto.abrir;
      const aberto = pedido !== null && gesto.subfluxos[pedido] ? pedido : null;
      const mudou = gesto.mapa !== state.mapa || gesto.subfluxos !== state.subfluxos;
      if (!mudou) return { ...state, subfluxoAberto: aberto };
      return {
        ...state,
        mapa: gesto.mapa,
        subfluxos: gesto.subfluxos,
        subfluxoAberto: aberto,
        passado: pushed(state),
        futuro: [],
        sujo: true,
      };
    }
    case 'abrirSubfluxo': {
      if (state.antesDoArrasto) return state;
      const aberto = gesto.shortName !== null && state.subfluxos[gesto.shortName] ? gesto.shortName : null;
      if (aberto === state.subfluxoAberto) return state;
      return { ...state, subfluxoAberto: aberto };
    }
  }
}

export const podeDesfazer = (state: EditorState): boolean => state.passado.length > 0;
export const podeRefazer = (state: EditorState): boolean => state.futuro.length > 0;

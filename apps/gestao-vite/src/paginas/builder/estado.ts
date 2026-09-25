import type { Mapa } from './modelo';

/**
 * O estado do editor e o desfazer/refazer — os dois botões do rodapé deles
 * ("Desfazer (Ctrl+z)", "Refazer (Ctrl+Shift+z)"), que a moldura já desenhava
 * desligados.
 *
 * É um redutor puro sobre o mapa de blocos: todo gesto que muda o desenho
 * chega como `aplicar` com o mapa novo (as funções de `modelo.ts`,
 * `condicoes.ts`, `conteudo.ts` e `acoes-do-bloco.ts` já devolvem o mapa ou o
 * bloco pronto), o mapa anterior vai para a pilha do passado, e o futuro é
 * apagado. `mover` é a exceção: enquanto o bloco é arrastado o mapa muda a
 * cada pixel, e só o `soltar` grava um passo — senão o Ctrl+Z desfaria o
 * arrasto pixel a pixel.
 *
 * `sujo` é o que o "Salvo" do rodapé lê: liga em qualquer mudança e só desliga
 * em `salvo`, com o mapa que foi gravado — mudança que chegou enquanto o `PUT`
 * estava no ar continua suja.
 */

export const HISTORY_LIMIT = 50;

export interface EditorState {
  mapa: Mapa;
  global: Record<string, unknown>;
  passado: Mapa[];
  futuro: Mapa[];
  /** O mapa antes do arrasto em curso, para o `soltar` gravar um passo só. */
  antesDoArrasto: Mapa | null;
  sujo: boolean;
  /** O último mapa gravado — para `salvo` saber se o que voltou ainda é o atual. */
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
  /** As ações globais (aba "Ações Globais" da Configuração) — fora da pilha de
   * desfazer/refazer, que só guarda `Mapa` (ver `passado`/`futuro`); Ctrl+Z
   * continua desfazendo só o desenho, como antes desta aba existir. */
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
      // Um arrasto em curso ainda não virou passo do histórico (só `soltar` o
      // empilha) — desfazer agora trocaria o mapa por baixo do arrasto e o
      // `soltar` seguinte empilharia o `antesDoArrasto` velho por cima, perdendo
      // o desfazer. Ctrl+Z some enquanto o botão do mouse está apertado.
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

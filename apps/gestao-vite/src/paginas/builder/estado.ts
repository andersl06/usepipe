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

export const LIMITE_DO_HISTORICO = 50;

export interface EstadoDoEditor {
  mapa: Mapa;
  globais: Record<string, unknown>;
  passado: Mapa[];
  futuro: Mapa[];
  /** O mapa antes do arrasto em curso, para o `soltar` gravar um passo só. */
  antesDoArrasto: Mapa | null;
  sujo: boolean;
  /** O último mapa gravado — para `salvo` saber se o que voltou ainda é o atual. */
  gravado: Mapa | null;
}

export type GestoDoEditor =
  | { tipo: 'carregar'; mapa: Mapa; globais: Record<string, unknown> }
  | { tipo: 'aplicar'; mapa: Mapa }
  | { tipo: 'mover'; mapa: Mapa }
  | { tipo: 'soltar' }
  | { tipo: 'desfazer' }
  | { tipo: 'refazer' }
  | { tipo: 'salvo'; mapa: Mapa };

export function estadoInicial(): EstadoDoEditor {
  return { mapa: {}, globais: {}, passado: [], futuro: [], antesDoArrasto: null, sujo: false, gravado: null };
}

export function reduzir(estado: EstadoDoEditor, gesto: GestoDoEditor): EstadoDoEditor {
  switch (gesto.tipo) {
    case 'carregar':
      return { ...estadoInicial(), mapa: gesto.mapa, globais: gesto.globais, gravado: gesto.mapa };
    case 'aplicar': {
      if (gesto.mapa === estado.mapa) return estado;
      const passado = [...estado.passado, estado.mapa].slice(-LIMITE_DO_HISTORICO);
      return { ...estado, mapa: gesto.mapa, passado, futuro: [], sujo: true };
    }
    case 'mover':
      return {
        ...estado,
        mapa: gesto.mapa,
        antesDoArrasto: estado.antesDoArrasto ?? estado.mapa,
        sujo: true,
      };
    case 'soltar': {
      if (!estado.antesDoArrasto) return estado;
      const passado = [...estado.passado, estado.antesDoArrasto].slice(-LIMITE_DO_HISTORICO);
      return { ...estado, passado, futuro: [], antesDoArrasto: null };
    }
    case 'desfazer': {
      const anterior = estado.passado[estado.passado.length - 1];
      if (!anterior) return estado;
      return {
        ...estado,
        mapa: anterior,
        passado: estado.passado.slice(0, -1),
        futuro: [estado.mapa, ...estado.futuro],
        sujo: anterior !== estado.gravado,
      };
    }
    case 'refazer': {
      const proximo = estado.futuro[0];
      if (!proximo) return estado;
      return {
        ...estado,
        mapa: proximo,
        passado: [...estado.passado, estado.mapa].slice(-LIMITE_DO_HISTORICO),
        futuro: estado.futuro.slice(1),
        sujo: proximo !== estado.gravado,
      };
    }
    case 'salvo':
      return { ...estado, gravado: gesto.mapa, sujo: estado.mapa !== gesto.mapa };
  }
}

export const podeDesfazer = (estado: EstadoDoEditor): boolean => estado.passado.length > 0;
export const podeRefazer = (estado: EstadoDoEditor): boolean => estado.futuro.length > 0;

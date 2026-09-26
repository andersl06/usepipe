'use client';

/*
 * Adaptado de twenty-ui (MIT) —
 * https://github.com/twentyhq/twenty/blob/main/packages/twenty-ui/src/layout/ResizeHandle/hooks/useResizeHandle.ts
 *
 * Copyright (c) 2023 Twenty. Licenciado sob MIT.
 *
 * O que veio de lá, e é o que interessa: a mecânica de arraste com
 * `setPointerCapture`, o delta contra a posição inicial e o limite de tamanho
 * nas duas pontas. Capturar o ponteiro é o detalhe que faz a diferença entre
 * um arraste que funciona e um que solta a coluna quando o cursor passa por
 * cima de um link.
 *
 * O que mudou aqui: o deles guarda UM tamanho, o nosso guarda um por coluna, e
 * o nosso persiste. A largura da coluna que a pessoa ajustou tem de sobreviver
 * ao recarregamento, senão o ajuste é trabalho jogado fora a cada visita.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

/** Below 72px the header label no longer fits, and the column becomes a sliver. */
const MINIMA = 72;
/** Above 640px the column pushes all the others off screen. */
const MAXIMA = 640;
/** How much one arrow key press moves. A multiple of the spacing scale. */
const PASSO = 16;

export type Larguras = Record<string, number>;

function ler(key: string): Larguras {
  try {
    const cru = localStorage.getItem(key);
    if (!cru) return {};
    const lido: unknown = JSON.parse(cru);
    if (typeof lido !== 'object' || lido === null) return {};
    const limpas: Larguras = {};
    for (const [k, v] of Object.entries(lido as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) limpas[k] = limitar(v);
    }
    return limpas;
  } catch {
    return {};
  }
}

function limitar(value: number): number {
  return Math.min(MAXIMA, Math.max(MINIMA, Math.round(value)));
}

interface Arraste {
  column: string;
  inicioX: number;
  inicioLargura: number;
}

/**
 * Resizable column widths, persisted per browser.
 *
 * `chaveDeArmazenamento` keeps one table's memory separate from another's: the
 * leads list and the accounts list have differently named columns, and mixing
 * the two would make one inherit the other's width.
 */
export function useLarguras(storageKey: string, defaults: Larguras) {
  const [ajustadas, setAjustadas] = useState<Larguras>({});
  /**
   * The drag in progress lives in a ref, not in state.
   *
   * State only reaches the handler on the next render. If the browser delivers
   * `pointermove` in the same tick as `pointerdown` (happens with a fast pointer,
   * and always happens in a synthetic test), the handler would still see `null`
   * and the drag's first movement would be lost. The ref is written before the
   * function returns.
   */
  const arraste = useRef<Arraste | null>(null);
  /** Only for the header's class. This one can be state: it's just paint. */
  const [columnInArraste, setColumnInArraste] = useState<string | null>(null);

  // Only after mounting: the server has no `localStorage`, and reading during the
  // render would make the two sides draw different widths.
  useEffect(() => setAjustadas(ler(storageKey)), [storageKey]);

  const largura = useCallback(
    (column: string) => ajustadas[column] ?? defaults[column] ?? 160,
    [ajustadas, defaults],
  );

  const guardar = useCallback(
    (proximas: Larguras) => {
      setAjustadas(proximas);
      try {
        localStorage.setItem(storageKey, JSON.stringify(proximas));
      } catch {
        // Storage blocked: the width is only good for this session and disappears afterward.
      }
    },
    [storageKey],
  );

  const definir = useCallback(
    (column: string, value: number) => {
      guardar({ ...ajustadas, [column]: limitar(value) });
    },
    [ajustadas, guardar],
  );

  function aoPegar(column: string) {
    return (evento: PointerEvent) => {
      evento.preventDefault();
      (evento.target as HTMLElement).setPointerCapture(evento.pointerId);
      arraste.current = { column, inicioX: evento.clientX, inicioLargura: largura(column) };
      setColumnInArraste(column);
    };
  }

  function aoMover(evento: PointerEvent) {
    const atual = arraste.current;
    if (!atual) return;
    definir(atual.column, atual.inicioLargura + (evento.clientX - atual.inicioX));
  }

  function aoSoltar() {
    arraste.current = null;
    setColumnInArraste(null);
  }

  /**
   * The same adjustment via keyboard. A handle that only responds to the mouse is
   * a handle half the team can't reach, and the 16px increment reaches any useful
   * width in a few taps.
   */
  function aoTeclar(column: string) {
    return (evento: React.KeyboardEvent) => {
      const passo =
        evento.key === 'ArrowLeft' ? -PASSO : evento.key === 'ArrowRight' ? PASSO : 0;
      if (passo === 0) return;
      evento.preventDefault();
      definir(column, largura(column) + passo);
    };
  }

  /** Resets the column to the default. It's the double-click on the handle, like in any spreadsheet. */
  function toRestore(column: string) {
    return () => {
      // Deleting the key, not writing the default over it: that way the column goes back to
      // following the screen's default if it changes in a future deploy.
      const resto = Object.fromEntries(
        Object.entries(ajustadas).filter(([key]) => key !== column),
      );
      guardar(resto);
    };
  }

  return {
    largura,
    columnInArraste,
    aoPegar,
    aoMover,
    aoSoltar,
    aoTeclar,
    toRestore,
    MINIMA,
    MAXIMA,
  };
}

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

/** Abaixo de 72px o rótulo do cabeçalho já não cabe, e a coluna vira um traço. */
const MINIMA = 72;
/** Acima de 640px a coluna empurra todas as outras para fora da tela. */
const MAXIMA = 640;
/** Quanto uma seta do teclado move. Múltiplo da régua de espaço. */
const PASSO = 16;

export type Larguras = Record<string, number>;

function ler(chave: string): Larguras {
  try {
    const cru = localStorage.getItem(chave);
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

function limitar(valor: number): number {
  return Math.min(MAXIMA, Math.max(MINIMA, Math.round(valor)));
}

interface Arraste {
  coluna: string;
  inicioX: number;
  inicioLargura: number;
}

/**
 * Larguras de coluna redimensionáveis, persistidas por navegador.
 *
 * `chaveDeArmazenamento` separa a memória de uma tabela da de outra: a lista de
 * leads e a de contas têm colunas de nomes diferentes, e misturar as duas faria
 * uma herdar a largura da outra.
 */
export function useLarguras(chaveDeArmazenamento: string, padroes: Larguras) {
  const [ajustadas, setAjustadas] = useState<Larguras>({});
  /**
   * O arraste em curso vive numa referência, não em estado.
   *
   * Estado só chega ao manipulador na renderização seguinte. Se o navegador
   * entregar o `pointermove` no mesmo passo do `pointerdown` (acontece com
   * ponteiro rápido, e acontece sempre em teste sintético), o manipulador ainda
   * enxerga `null` e o primeiro movimento do arraste é perdido. A referência
   * está escrita antes de a função retornar.
   */
  const arraste = useRef<Arraste | null>(null);
  /** Só para a classe do cabeçalho. Este pode ser estado: é pintura. */
  const [colunaEmArraste, setColunaEmArraste] = useState<string | null>(null);

  // Só depois de montar: o servidor não tem `localStorage`, e ler durante a
  // renderização faria os dois desenharem larguras diferentes.
  useEffect(() => setAjustadas(ler(chaveDeArmazenamento)), [chaveDeArmazenamento]);

  const largura = useCallback(
    (coluna: string) => ajustadas[coluna] ?? padroes[coluna] ?? 160,
    [ajustadas, padroes],
  );

  const guardar = useCallback(
    (proximas: Larguras) => {
      setAjustadas(proximas);
      try {
        localStorage.setItem(chaveDeArmazenamento, JSON.stringify(proximas));
      } catch {
        // Armazenamento bloqueado: a largura vale para esta sessão e some depois.
      }
    },
    [chaveDeArmazenamento],
  );

  const definir = useCallback(
    (coluna: string, valor: number) => {
      guardar({ ...ajustadas, [coluna]: limitar(valor) });
    },
    [ajustadas, guardar],
  );

  function aoPegar(coluna: string) {
    return (evento: PointerEvent) => {
      evento.preventDefault();
      (evento.target as HTMLElement).setPointerCapture(evento.pointerId);
      arraste.current = { coluna, inicioX: evento.clientX, inicioLargura: largura(coluna) };
      setColunaEmArraste(coluna);
    };
  }

  function aoMover(evento: PointerEvent) {
    const atual = arraste.current;
    if (!atual) return;
    definir(atual.coluna, atual.inicioLargura + (evento.clientX - atual.inicioX));
  }

  function aoSoltar() {
    arraste.current = null;
    setColunaEmArraste(null);
  }

  /**
   * O mesmo ajuste pelo teclado. Alça que só responde ao mouse é alça que
   * metade do time não alcança, e a régua de 16px chega em qualquer largura
   * útil em poucos toques.
   */
  function aoTeclar(coluna: string) {
    return (evento: React.KeyboardEvent) => {
      const passo =
        evento.key === 'ArrowLeft' ? -PASSO : evento.key === 'ArrowRight' ? PASSO : 0;
      if (passo === 0) return;
      evento.preventDefault();
      definir(coluna, largura(coluna) + passo);
    };
  }

  /** Volta a coluna ao padrão. É o duplo clique na alça, como em toda planilha. */
  function aoRestaurar(coluna: string) {
    return () => {
      const { [coluna]: _descartada, ...resto } = ajustadas;
      guardar(resto);
    };
  }

  return {
    largura,
    colunaEmArraste,
    aoPegar,
    aoMover,
    aoSoltar,
    aoTeclar,
    aoRestaurar,
    MINIMA,
    MAXIMA,
  };
}

import type { ArestaDaJornada, TipoDeAresta } from '@pipe/core/analytics';

/**
 * The Journey diagram without a library. In the origin it's the `Sankey` from Google Charts (`sankeyDiagram`, controller `Oe`) with the `Ci` options: 15 node width, 30 between nodes, `iterations: 0` — i.e., NO reordering to reduce crossings: nodes stay in the order their edges arrive. That order is what can be reproduced in plain SVG, which is what's done here. Deliberately pure: `tests/analise-jornada.test.ts` locks the label.
 */

/** `getEdgeOrder()`: dentro da etapa, `Regular` em cima, `Other` no meio, `End` embaixo. */
const ORDER: Record<TipoDeAresta, number> = { regular: 0, outros: 1, saida: 2 };

/** `SankeyService.sumCounters`. */
const soma = (arestas: ArestaDaJornada[]) => arestas.reduce((t, a) => t + a.quantity, 0);

/**
 * `SankeyService.getLabelSufix(nome, i)`: the node's share at step `i` — those who ARRIVED at it over everyone who arrived at that step; for the starting node, those who LEFT it over everyone who left. With `i < 0` or an empty step, it returns the raw count.
 */
export function sufixoDoRotulo(nome: string, i: number, arestas: ArestaDaJornada[]): string {
  let s = soma(arestas.filter((a) => a.para === nome));
  let r = soma(arestas.filter((a) => a.passo === i));
  if (!s) {
    s = soma(arestas.filter((a) => a.de === nome));
    r = soma(arestas.filter((a) => a.passo === i + 1));
  }
  return i < 0 || r <= 0 ? String(r) : `${((s / r) * 100).toFixed(2)}%`;
}

export interface NoDoSankey {
  rotulo: string;
  tipo: TipoDeAresta;
  column: number;
  x: number;
  y: number;
  altura: number;
}

export interface FaixaDoSankey {
  d: string;
  dica: string;
}

export interface Sankey {
  nos: NoDoSankey[];
  faixas: FaixaDoSankey[];
  colunas: number;
}

export function desenharSankey(
  arestas: ArestaDaJornada[],
  largura: number,
  altura: number,
  larguraDoNo = 15,
  folga = 30,
): Sankey {
  /* `orderSankeyEdges()`: por etapa, e dentro dela pelo tipo. */
  const ordenadas = [...arestas].sort((a, b) => a.passo - b.passo || ORDER[a.tipo] - ORDER[b.tipo]);

  type Acumulado = { nome: string; column: number; tipo: TipoDeAresta; entra: number; sai: number };
  const nos = new Map<string, Acumulado>();
  /*
   * `loadNodeColors()` pushes the source WITHOUT a type and the destination WITH a type, keeping the first occurrence: a node that was already born as a source is `Regular`.
   */
  const no = (nome: string, column: number, tipo: TipoDeAresta) => {
    const achado = nos.get(nome);
    if (achado) return achado;
    const novo = { nome, column, tipo, entra: 0, sai: 0 };
    nos.set(nome, novo);
    return novo;
  };
  for (const a of ordenadas) {
    no(a.de, a.passo - 1, 'regular').sai += a.quantity;
    no(a.para, a.passo, a.tipo).entra += a.quantity;
  }

  const lista = [...nos.values()];
  const colunas = lista.reduce((m, n) => Math.max(m, n.column + 1), 0);
  const value = (n: Acumulado) => Math.max(n.entra, n.sai);

  /* The scale is set by the fullest column: it occupies the entire height. */
  let escala = Infinity;
  for (let c = 0; c < colunas; c++) {
    const ofColumn = lista.filter((n) => n.column === c);
    const total = ofColumn.reduce((t, n) => t + value(n), 0);
    if (total > 0) escala = Math.min(escala, (altura - folga * (ofColumn.length - 1)) / total);
  }
  if (!Number.isFinite(escala)) escala = 0;

  const passoX = colunas > 1 ? (largura - larguraDoNo) / (colunas - 1) : 0;
  const position = new Map<string, { x: number; y: number; altura: number }>();
  const topo = new Array<number>(colunas).fill(0);
  const desenhados: NoDoSankey[] = lista.map((n) => {
    const h = value(n) * escala;
    const p = { x: n.column * passoX, y: topo[n.column] ?? 0, altura: h };
    topo[n.column] = p.y + h + folga;
    position.set(n.nome, p);
    return {
      rotulo: `${n.nome}: ${sufixoDoRotulo(n.nome, n.column, arestas)}`,
      tipo: n.tipo,
      column: n.column,
      ...p,
    };
  });

  const saida = new Map<string, number>();
  const inbound = new Map<string, number>();
  const faixas = ordenadas.map((a) => {
    const de = position.get(a.de)!;
    const para = position.get(a.para)!;
    const h = a.quantity * escala;
    const y0 = de.y + (saida.get(a.de) ?? 0);
    const y1 = para.y + (inbound.get(a.para) ?? 0);
    saida.set(a.de, (saida.get(a.de) ?? 0) + h);
    inbound.set(a.para, (inbound.get(a.para) ?? 0) + h);
    const x0 = de.x + larguraDoNo;
    const x1 = para.x;
    const xm = (x0 + x1) / 2;
    return {
      d: `M${x0},${y0}C${xm},${y0} ${xm},${y1} ${x1},${y1}L${x1},${y1 + h}C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h}Z`,
      /* `createCustomTooltipContent()`: origem, destino, "N Contatos: X%". */
      dica: `${a.de} → ${a.para}\n${a.quantity} Contatos: ${sufixoDaDica(a, arestas)}`,
    };
  });

  return { nos: desenhados, faixas, colunas };
}

/** `getTooltipSufix()`: this edge's share among all edges leaving the same node. */
function sufixoDaDica(aresta: ArestaDaJornada, arestas: ArestaDaJornada[]): string {
  const n = soma(arestas.filter((a) => a.de === aresta.de));
  return n ? `${((aresta.quantity / n) * 100).toFixed(2)}%` : '';
}

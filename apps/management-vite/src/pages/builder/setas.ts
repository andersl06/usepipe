import type { Position } from './model';

/**
 * The arrows' geometry: the jsPlumb "Flowchart" connector the Blip editor uses to link blocks (`JsPlumbService.createInstance`: `Connector: "Flowchart"`, `Continuous` anchor, 10px arrowhead, 2px stroke).
 *
 * "Continuous" picks the face of each block that looks toward the other; "Flowchart" leaves that face straight for a 30px stub, turns at a right angle to the midpoint of the path, and arrives straight through the other side's stub — it's the `M -0.5 0 L 30.5 0 … L 278 10` captured from the DOM. Here, the same drawing, in our own SVG.
 */

/** Their card's measurements: 175px wide (`.diagram-node`). Height is measured from the DOM. */
export const WIDTH_OF_BLOCK = 175;
export const HEIGHT_DEFAULT_OF_BLOCK = 76;
export const TOCO = 30;
export const PONTA = 10;

/**
 * Below this, press-and-release counts as a click, not a drag — it neither moves the block nor completes a link. Without this floor, clicking (without releasing outside) on a block's output point would create a loop from the block to itself on its own, because `elementFromPoint` at the instant of the click is still over the very block the output came from.
 */
export const LIMIAR_DE_ARRASTO = 2;

export function houveArrasto(dx: number, dy: number, limiar = LIMIAR_DE_ARRASTO): boolean {
  return Math.abs(dx) >= limiar || Math.abs(dy) >= limiar;
}

export interface Caixa extends Position {
  largura: number;
  altura: number;
}

export type Face = 'direita' | 'esquerda' | 'baixo' | 'cima';

export interface Ponto {
  x: number;
  y: number;
}

/**
 * The connector's target is the block's box on the canvas plane, not the element under the cursor. This way pointer capture and overlapping SVGs don't make the destination disappear on `pointerup`.
 */
export function caixaContemPonto(caixa: Caixa, ponto: Ponto): boolean {
  return (
    ponto.x >= caixa.left &&
    ponto.x <= caixa.left + caixa.largura &&
    ponto.y >= caixa.top &&
    ponto.y <= caixa.top + caixa.altura
  );
}

const centro = (c: Caixa): Ponto => ({ x: c.left + c.largura / 2, y: c.top + c.altura / 2 });

/** The faces that face each other: more horizontal → right/left; otherwise bottom/top. */
export function facesEntre(de: Caixa, para: Caixa): { de: Face; para: Face } {
  const a = centro(de);
  const b = centro(para);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { de: 'direita', para: 'esquerda' } : { de: 'esquerda', para: 'direita' };
  }
  return dy >= 0 ? { de: 'baixo', para: 'cima' } : { de: 'cima', para: 'baixo' };
}

export function pontoDaFace(c: Caixa, face: Face): Ponto {
  switch (face) {
    case 'direita':
      return { x: c.left + c.largura, y: c.top + c.altura / 2 };
    case 'esquerda':
      return { x: c.left, y: c.top + c.altura / 2 };
    case 'baixo':
      return { x: c.left + c.largura / 2, y: c.top + c.altura };
    case 'cima':
      return { x: c.left + c.largura / 2, y: c.top };
  }
}

const afastar = (p: Ponto, face: Face, distancia: number): Ponto => {
  switch (face) {
    case 'direita':
      return { x: p.x + distancia, y: p.y };
    case 'esquerda':
      return { x: p.x - distancia, y: p.y };
    case 'baixo':
      return { x: p.x, y: p.y + distancia };
    case 'cima':
      return { x: p.x, y: p.y - distancia };
  }
};

const horizontal = (face: Face): boolean => face === 'direita' || face === 'esquerda';

/** O `d` do caminho da seta, com os pontos em coordenadas do canvas. */
export function caminhoDaSeta(de: Caixa, para: Caixa): { d: string; fim: Ponto; faceDoFim: Face } {
  const faces = facesEntre(de, para);
  const inicio = pontoDaFace(de, faces.de);
  const fim = pontoDaFace(para, faces.para);
  const p1 = afastar(inicio, faces.de, TOCO);
  const p2 = afastar(fim, faces.para, TOCO);
  const pontos: Ponto[] = [inicio, p1];
  if (horizontal(faces.de)) {
    const meioX = (p1.x + p2.x) / 2;
    pontos.push({ x: meioX, y: p1.y }, { x: meioX, y: p2.y });
  } else {
    const meioY = (p1.y + p2.y) / 2;
    pontos.push({ x: p1.x, y: meioY }, { x: p2.x, y: meioY });
  }
  pontos.push(p2, fim);
  const d = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return { d, fim, faceDoFim: faces.para };
}

/** jsPlumb's 10px arrowhead, pointing into the destination block. */
export function pontaDaSeta(fim: Ponto, face: Face): string {
  const base = afastar(fim, face, PONTA);
  const lado = PONTA / 2;
  const a = horizontal(face) ? { x: base.x, y: base.y - lado } : { x: base.x - lado, y: base.y };
  const b = horizontal(face) ? { x: base.x, y: base.y + lado } : { x: base.x + lado, y: base.y };
  return `M ${fim.x} ${fim.y} L ${a.x} ${a.y} L ${b.x} ${b.y} Z`;
}

/** A provisional line while the person drags from the output until releasing. */
export function caminhoProvisorio(de: Ponto, ate: Ponto): string {
  return `M ${de.x} ${de.y} L ${ate.x} ${ate.y}`;
}

/** Where "Adicionar bloco" places the new block: in the middle of what's visible, rounded to the 16 grid. */
export function positionInCenter(
  window: { largura: number; altura: number },
  offset: Position,
  zoom: number,
): Position {
  const grade = 16;
  const left = (window.largura / 2 - offset.left) / zoom - WIDTH_OF_BLOCK / 2;
  const top = (window.altura / 2 - offset.top) / zoom - HEIGHT_DEFAULT_OF_BLOCK / 2;
  return {
    left: Math.max(0, Math.round(left / grade) * grade),
    top: Math.max(0, Math.round(top / grade) * grade),
  };
}

/** The editor's zoom: 20% to 100%, and the wheel with Ctrl moves in steps of 10. */
export const ZOOM_MINIMO = 20;
export const ZOOM_MAXIMO = 100;
export const PASSO_DO_ZOOM = 10;

export function zoomAjustado(value: number): number {
  if (!Number.isFinite(value)) return ZOOM_MAXIMO;
  return Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, Math.round(value)));
}

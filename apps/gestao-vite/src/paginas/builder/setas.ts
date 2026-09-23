import type { Posicao } from './modelo';

/**
 * A geometria das setas: o conector "Flowchart" do jsPlumb com que o editor da
 * Blip liga os blocos (`JsPlumbService.createInstance`: `Connector:
 * "Flowchart"`, âncora `Continuous`, seta de 10 na ponta, traço de 2px).
 *
 * "Continuous" escolhe a face de cada bloco que olha para o outro; o
 * "Flowchart" sai reto dessa face por um toco de 30px, dobra em ângulo reto
 * até a metade do caminho e chega reto pelo toco do outro lado — é o `M -0.5 0
 * L 30.5 0 … L 278 10` capturado no DOM. Aqui o mesmo desenho, em SVG nosso.
 */

/** As medidas do cartão deles: 175px de largura (`.diagram-node`). A altura é medida no DOM. */
export const LARGURA_DO_BLOCO = 175;
export const ALTURA_PADRAO_DO_BLOCO = 76;
export const TOCO = 30;
export const PONTA = 10;

/**
 * Abaixo disto, pressionar-e-soltar conta como clique, não arrasto — nem move
 * o bloco nem completa uma ligação. Sem esse piso, clicar (sem soltar fora)
 * no ponto de saída de um bloco criava sozinho um laço do bloco para ele
 * mesmo, porque `elementFromPoint` no instante do clique ainda está sobre o
 * próprio bloco de onde a saída saiu.
 */
export const LIMIAR_DE_ARRASTO = 2;

export function houveArrasto(dx: number, dy: number, limiar = LIMIAR_DE_ARRASTO): boolean {
  return Math.abs(dx) >= limiar || Math.abs(dy) >= limiar;
}

export interface Caixa extends Posicao {
  largura: number;
  altura: number;
}

export type Face = 'direita' | 'esquerda' | 'baixo' | 'cima';

export interface Ponto {
  x: number;
  y: number;
}

/** O alvo do conector é a caixa do bloco no plano do canvas, não o elemento
 * sob o cursor. Assim a captura do ponteiro e SVGs sobrepostos não fazem o
 * destino desaparecer no `pointerup`. */
export function caixaContemPonto(caixa: Caixa, ponto: Ponto): boolean {
  return (
    ponto.x >= caixa.left &&
    ponto.x <= caixa.left + caixa.largura &&
    ponto.y >= caixa.top &&
    ponto.y <= caixa.top + caixa.altura
  );
}

const centro = (c: Caixa): Ponto => ({ x: c.left + c.largura / 2, y: c.top + c.altura / 2 });

/** As faces que se olham: mais horizontal → direita/esquerda; senão baixo/cima. */
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

/** A ponta de seta de 10px do jsPlumb, apontando para dentro do bloco de destino. */
export function pontaDaSeta(fim: Ponto, face: Face): string {
  const base = afastar(fim, face, PONTA);
  const lado = PONTA / 2;
  const a = horizontal(face) ? { x: base.x, y: base.y - lado } : { x: base.x - lado, y: base.y };
  const b = horizontal(face) ? { x: base.x, y: base.y + lado } : { x: base.x + lado, y: base.y };
  return `M ${fim.x} ${fim.y} L ${a.x} ${a.y} L ${b.x} ${b.y} Z`;
}

/** Uma reta provisória enquanto a pessoa arrasta da saída até soltar. */
export function caminhoProvisorio(de: Ponto, ate: Ponto): string {
  return `M ${de.x} ${de.y} L ${ate.x} ${ate.y}`;
}

/** Onde o "Adicionar bloco" põe o bloco novo: no meio do que se vê, arredondado à grade de 16. */
export function posicaoNoCentro(
  janela: { largura: number; altura: number },
  deslocamento: Posicao,
  zoom: number,
): Posicao {
  const grade = 16;
  const left = (janela.largura / 2 - deslocamento.left) / zoom - LARGURA_DO_BLOCO / 2;
  const top = (janela.altura / 2 - deslocamento.top) / zoom - ALTURA_PADRAO_DO_BLOCO / 2;
  return {
    left: Math.max(0, Math.round(left / grade) * grade),
    top: Math.max(0, Math.round(top / grade) * grade),
  };
}

/** O zoom do editor: de 20% a 100%, e a roda com Ctrl anda de 10 em 10. */
export const ZOOM_MINIMO = 20;
export const ZOOM_MAXIMO = 100;
export const PASSO_DO_ZOOM = 10;

export function zoomAjustado(valor: number): number {
  if (!Number.isFinite(valor)) return ZOOM_MAXIMO;
  return Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, Math.round(valor)));
}

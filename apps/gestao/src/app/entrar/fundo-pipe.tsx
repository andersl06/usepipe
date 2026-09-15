'use client';

import { useEffect, useRef } from 'react';

/**
 * O fundo da tela de entrada: um feixe de ~10.800 partículas desenhado em
 * `<canvas>` pelo próprio navegador. Sem GIF, sem vídeo, sem imagem — a
 * primeira tela do produto deixa de ter custo de rede (o fundo de referência
 * pesava 14,6 MB; este pesa o que pesa este arquivo).
 *
 * O desenho é a curva da marca ampliada até virar paisagem: um arco único com
 * o centro FORA do quadro, no canto inferior direito, em três camadas de
 * densidade decrescente — aresta viva, corpo difuso e névoa. O quadrante
 * superior esquerdo, onde ficam o cartão e o bloco da marca, fica vazio de
 * propósito: fundo não disputa leitura com formulário.
 *
 * **Não tem emenda porque não tem laço.** Nada se repete e nada reinicia: a
 * posição de cada partícula é função contínua do tempo. É o defeito que
 * qualquer GIF de fundo tem e que ninguém consegue esconder.
 *
 * Com `prefers-reduced-motion` ele desenha UM quadro e para — não há imagem
 * parada para baixar, é o mesmo código sem o relógio.
 */

/** Centro do arco, em fração da caixa, e o raio em fração da diagonal. */
const CENTRO = { x: 0.829, y: 1.347, R: 0.6 };

/** As três camadas, da aresta para dentro. `op` é a faixa de opacidade. */
const BANDAS = [
  { r0: 0.982, r1: 1.0, n: 3400, esc: 0.8, op: [0.38, 0.72] },
  { r0: 0.855, r1: 0.982, n: 4800, esc: 1.15, op: [0.12, 0.38] },
  { r0: 0.6, r1: 0.855, n: 2600, esc: 1.3, op: [0.04, 0.14] },
] as const;

type Particula = {
  r: number;
  a: number;
  v: number;
  tam: number;
  op: number;
  fase: number;
  osc: number;
};

/**
 * As partículas nascem de um gerador com semente FIXA: o mesmo desenho em toda
 * máquina e em toda recarga. Fundo que muda de forma a cada visita é ruído, e
 * ainda impede comparar duas capturas de tela.
 */
function criar(largura: number, altura: number): Particula[] {
  const R = Math.hypot(largura, altura) * CENTRO.R;
  const pontos: Particula[] = [];
  let semente = 20260912;
  const rnd = () => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };

  for (const b of BANDAS) {
    for (let i = 0; i < b.n; i++) {
      // `1 - rnd^0.7` adensa junto da aresta: é o que dá a linha viva.
      const t = 1 - Math.pow(rnd(), 0.7);
      const fade = 0.15 + t * 0.85;
      pontos.push({
        r: (b.r0 + (b.r1 - b.r0) * t) * R,
        a: -3.05 + rnd() * 2.0,
        // Cada partícula tem velocidade própria, e as de fora são mais lentas:
        // o feixe cisalha devagar em vez de girar em bloco.
        v: -(0.0099 + rnd() * 0.0118) * (1 - t * 0.4),
        tam: 0.6 + rnd() * b.esc,
        op: b.op[0] + rnd() * (b.op[1] - b.op[0]) * fade,
        fase: rnd() * Math.PI * 2,
        osc: 0.18 + rnd() * 0.5,
      });
    }
  }
  return pontos;
}

export function FundoPipe() {
  const alvo = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = alvo.current;
    if (!canvas) return;

    let pontos: Particula[] = [];
    let ctx: CanvasRenderingContext2D | null = null;
    let largura = 0;
    let altura = 0;
    let quadro = 0;
    const inicio = performance.now();

    function desenhar(t: number) {
      if (!ctx) return;
      const cx = CENTRO.x * largura;
      const cy = CENTRO.y * altura;
      ctx.clearRect(0, 0, largura, altura);

      // Massa clara difusa no canto, para o cartão não flutuar sobre creme chapado.
      const brilho = ctx.createRadialGradient(
        largura * 0.78,
        altura * 0.86,
        0,
        largura * 0.78,
        altura * 0.86,
        Math.hypot(largura, altura) * 0.7,
      );
      brilho.addColorStop(0, 'rgba(234,238,221,0.85)');
      brilho.addColorStop(1, 'rgba(234,238,221,0)');
      ctx.fillStyle = brilho;
      ctx.fillRect(0, 0, largura, altura);

      const deriva = Math.sin(t * 0.06) * 6;
      for (const p of pontos) {
        const a = p.a + p.v * t;
        const r = p.r + Math.sin(t * 0.09 + p.fase) * (p.osc * 9) + deriva;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (x < -4 || x > largura + 4 || y < -4 || y > altura + 4) continue;
        const cintila = 0.82 + 0.18 * Math.sin(t * 0.5 + p.fase * 3);
        ctx.fillStyle = 'rgba(61,77,28,' + (p.op * cintila).toFixed(3) + ')';
        ctx.fillRect(x, y, p.tam * 1.5, p.tam * 1.5);
      }
    }

    function dimensionar() {
      const l = canvas!.clientWidth;
      const a = canvas!.clientHeight;
      if (!l || !a) return;
      // Teto de 2 no `devicePixelRatio`: em tela 3x seriam 4x os pixels para
      // ganho que ninguém vê em ponto de 1 px.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(l * dpr);
      canvas!.height = Math.round(a * dpr);
      ctx = canvas!.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      largura = l;
      altura = a;
      pontos = criar(l, a);
      desenhar(quadro ? (performance.now() - inicio) / 1000 : 0);
    }

    function passo() {
      desenhar((performance.now() - inicio) / 1000);
      quadro = requestAnimationFrame(passo);
    }

    const parado = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observador = new ResizeObserver(dimensionar);
    observador.observe(canvas);
    dimensionar();
    if (!parado.matches) quadro = requestAnimationFrame(passo);

    return () => {
      observador.disconnect();
      cancelAnimationFrame(quadro);
    };
  }, []);

  return <canvas ref={alvo} className="entrar-fundo" aria-hidden />;
}

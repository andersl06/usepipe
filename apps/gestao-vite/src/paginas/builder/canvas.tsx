import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as PointerEventDeReact, WheelEvent as WheelEventDeReact } from 'react';
import type { Aresta, Bloco, Mapa, Posicao } from './modelo';
import { arestasDe, blocoDoTextoCopiado, podeExcluir, posicaoDe, textoDoBlocoCopiado } from './modelo';
import { No } from './no';
import { etiquetasDoBloco } from './no';
import {
  ALTURA_PADRAO_DO_BLOCO,
  LARGURA_DO_BLOCO,
  PASSO_DO_ZOOM,
  caminhoDaSeta,
  caminhoProvisorio,
  caixaContemPonto,
  houveArrasto,
  pontaDaSeta,
  zoomAjustado,
} from './setas';
import type { Caixa, Ponto } from './setas';

/**
 * O canvas do Builder — o `#canvas.grabbable` deles com o `#diagramContainer`
 * escalado por dentro: os blocos em posição absoluta, as setas em SVG por
 * trás, arrastar o fundo desloca a cena ("grab to pan"), Ctrl+roda muda o
 * zoom de 10 em 10 (20% a 100%, como o `rzslider` do rodapé).
 *
 * Os gestos, todos por Pointer Events com captura (funcionam com mouse, caneta
 * e toque, e não perdem o rastro quando o ponteiro sai do elemento):
 * - arrastar um bloco o move (`onMover` a cada movimento, `onSoltar` no fim —
 *   é o `soltar` do redutor, um passo só de desfazer);
 * - clicar sem arrastar seleciona e abre o painel (`onAbrir`), como o clique
 *   no `builder-node` deles abre a barra lateral;
 * - arrastar do ponto de saída até outro bloco chama `onLigar(de, para)`;
 *   soltar fora de um bloco não faz nada (o jsPlumb some com a seta solta);
 * - clicar numa seta a seleciona (fica na cor da marca); Delete apaga
 *   (`onDesligar`), que é o `bind("click")` + `keydown Delete` deles;
 * - botão direito no bloco abre o menu de contexto do editor: Duplicar,
 *   Copiar Id, Excluir — e o bloco de Início não tem menu, como lá.
 *
 * A altura de cada bloco é medida no DOM depois de renderizar (o texto do
 * título e as etiquetas mudam a altura), porque a seta sai da face certa.
 */

export interface PropsDoCanvas {
  mapa: Mapa;
  errosPorBloco: Record<string, string[]>;
  selecionado: string | null;
  editando: string | null;
  zoom: number;
  deslocamento: Posicao;
  onDeslocar: (posicao: Posicao) => void;
  onZoom: (valor: number) => void;
  onSelecionar: (id: string | null) => void;
  onAbrir: (id: string) => void;
  onMover: (id: string, posicao: Posicao) => void;
  onSoltar: () => void;
  onLigar: (de: string, para: string) => void;
  onDesligar: (de: string, para: string) => void;
  onDuplicar: (id: string) => void;
  onCopiarId: (id: string) => void;
  onColar: (bloco: Bloco, posicao: Posicao) => void;
  onExcluir: (id: string) => void;
  onAviso: (texto: string) => void;
  pesquisa: string;
}

type Arrasto =
  | { tipo: 'bloco'; id: string; origem: Ponto; inicio: Posicao; moveu: boolean }
  | { tipo: 'cena'; origem: Ponto; inicio: Posicao }
  | { tipo: 'ligacao'; de: string; origem: Ponto; ate: Ponto; alvo: string | null; moveu: boolean };

type MenuDeContexto =
  | { tipo: 'bloco'; id: string; x: number; y: number }
  | { tipo: 'fundo'; x: number; y: number; posicao: Posicao };

const chaveDaAresta = (a: Aresta): string => `${a.de}\u0000${a.para}`;

export function Canvas({
  mapa,
  errosPorBloco,
  selecionado,
  editando,
  zoom,
  deslocamento,
  onDeslocar,
  onZoom,
  onSelecionar,
  onAbrir,
  onMover,
  onSoltar,
  onLigar,
  onDesligar,
  onDuplicar,
  onCopiarId,
  onColar,
  onExcluir,
  onAviso,
  pesquisa,
}: PropsDoCanvas) {
  const fundo = useRef<HTMLDivElement>(null);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [alturas, setAlturas] = useState<Record<string, number>>({});
  const [arestaSelecionada, setArestaSelecionada] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuDeContexto | null>(null);
  const [blocoCopiado, setBlocoCopiado] = useState<Bloco | null>(null);
  const escala = zoom / 100;

  /* A altura real de cada cartão, para a seta sair da face certa. */
  useLayoutEffect(() => {
    const raiz = fundo.current;
    if (!raiz) return;
    const medidas: Record<string, number> = {};
    let mudou = false;
    for (const el of raiz.querySelectorAll<HTMLElement>('[data-bloco]')) {
      const id = el.dataset['bloco']!;
      medidas[id] = el.offsetHeight;
      if (alturas[id] !== el.offsetHeight) mudou = true;
    }
    if (mudou || Object.keys(medidas).length !== Object.keys(alturas).length) setAlturas(medidas);
  });

  /* Delete apaga a seta selecionada — e o bloco selecionado, quando ele pode sair. */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      if (arestaSelecionada) {
        const [de, para] = arestaSelecionada.split('\u0000');
        if (de && para) onDesligar(de, para);
        setArestaSelecionada(null);
        e.preventDefault();
      } else if (selecionado && !editando && podeExcluir(mapa, selecionado)) {
        onExcluir(selecionado);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [arestaSelecionada, selecionado, editando, mapa, onDesligar, onExcluir]);

  /* O menu de contexto fecha ao clicar em qualquer lugar ou com Esc. */
  useEffect(() => {
    if (!menu) return;
    const fechar = (): void => setMenu(null);
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('pointerdown', fechar);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('pointerdown', fechar);
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [menu]);

  /** Do ponteiro (tela) para o canvas (coordenadas do desenho, sem zoom). */
  function pontoDoCanvas(e: { clientX: number; clientY: number }): Ponto {
    const caixa = fundo.current?.getBoundingClientRect();
    return {
      x: ((caixa ? e.clientX - caixa.left : e.clientX) - deslocamento.left) / escala,
      y: ((caixa ? e.clientY - caixa.top : e.clientY) - deslocamento.top) / escala,
    };
  }

  function caixaDe(id: string): Caixa {
    const bloco = mapa[id];
    const posicao = bloco ? posicaoDe(bloco) : { top: 0, left: 0 };
    return { ...posicao, largura: LARGURA_DO_BLOCO, altura: alturas[id] ?? ALTURA_PADRAO_DO_BLOCO };
  }

  /** O bloco sob o ponteiro, no plano do canvas. `elementFromPoint` falha
   * durante a captura do ponteiro em alguns navegadores e com setas por cima. */
  function blocoSob(e: { clientX: number; clientY: number }): string | null {
    const ponto = pontoDoCanvas(e);
    const ids = Object.keys(mapa);
    for (let i = ids.length - 1; i >= 0; i -= 1) {
      const id = ids[i]!;
      if (caixaContemPonto(caixaDe(id), ponto)) return id;
    }
    return null;
  }

  /* ------------------------------------------------------------- blocos */

  function aoPressionarBloco(id: string, e: PointerEventDeReact<HTMLDivElement>): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    setArestaSelecionada(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrasto({
      tipo: 'bloco',
      id,
      origem: { x: e.clientX, y: e.clientY },
      inicio: posicaoDe(mapa[id]!),
      moveu: false,
    });
  }

  function aoPressionarSaida(id: string, e: PointerEventDeReact<HTMLSpanElement>): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrasto({
      tipo: 'ligacao',
      de: id,
      origem: { x: e.clientX, y: e.clientY },
      ate: pontoDoCanvas(e),
      alvo: null,
      moveu: false,
    });
  }

  function aoPressionarFundo(e: PointerEventDeReact<HTMLDivElement>): void {
    if (e.button !== 0) return;
    setMenu(null);
    setArestaSelecionada(null);
    onSelecionar(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrasto({ tipo: 'cena', origem: { x: e.clientX, y: e.clientY }, inicio: deslocamento });
  }

  function aoMover(e: PointerEventDeReact<HTMLElement>): void {
    if (!arrasto) return;
    if (arrasto.tipo === 'bloco') {
      const dx = (e.clientX - arrasto.origem.x) / escala;
      const dy = (e.clientY - arrasto.origem.y) / escala;
      if (!arrasto.moveu && !houveArrasto(dx, dy)) return;
      if (!arrasto.moveu) setArrasto({ ...arrasto, moveu: true });
      onMover(arrasto.id, { left: arrasto.inicio.left + dx, top: arrasto.inicio.top + dy });
    } else if (arrasto.tipo === 'cena') {
      onDeslocar({
        left: arrasto.inicio.left + (e.clientX - arrasto.origem.x),
        top: arrasto.inicio.top + (e.clientY - arrasto.origem.y),
      });
    } else {
      const alvo = blocoSob(e);
      const moveu = arrasto.moveu || houveArrasto(e.clientX - arrasto.origem.x, e.clientY - arrasto.origem.y);
      setArrasto({ ...arrasto, ate: pontoDoCanvas(e), alvo, moveu });
    }
  }

  function aoSoltar(e: PointerEventDeReact<HTMLElement>): void {
    if (!arrasto) return;
    if (arrasto.tipo === 'bloco') {
      if (arrasto.moveu) onSoltar();
      else {
        onSelecionar(arrasto.id);
        onAbrir(arrasto.id);
      }
    } else if (arrasto.tipo === 'ligacao') {
      // Sem arrasto de verdade, é clique no ponto de saída — não cria laço do
      // bloco para ele mesmo sozinho (ver `houveArrasto` em `setas.ts`).
      const alvo = arrasto.moveu ? blocoSob(e) : null;
      if (alvo) onLigar(arrasto.de, alvo);
    }
    setArrasto(null);
  }

  /* --------------------------------------------------------------- roda */

  function aoRolar(e: WheelEventDeReact<HTMLDivElement>): void {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onZoom(zoomAjustado(zoom + (e.deltaY > 0 ? -PASSO_DO_ZOOM : PASSO_DO_ZOOM)));
      return;
    }
    onDeslocar({ left: deslocamento.left - e.deltaX, top: deslocamento.top - e.deltaY });
  }

  /* -------------------------------------------------------------- setas */

  const arestas = arestasDe(mapa);
  const blocos = Object.values(mapa);
  const alvoDaLigacao = arrasto?.tipo === 'ligacao' ? arrasto.alvo : null;
  const menuDoBloco = menu?.tipo === 'bloco' ? mapa[menu.id] : undefined;
  const termoDaPesquisa = pesquisa.trim().toLocaleLowerCase('pt-BR');
  const corresponde = (bloco: (typeof blocos)[number]): boolean =>
    !termoDaPesquisa ||
    [bloco.id, bloco.$title ?? '', ...etiquetasDoBloco(bloco).map((etiqueta) => etiqueta.rotulo)]
      .join(' ')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('pt-BR')
      .includes(termoDaPesquisa.normalize('NFD').replace(/\p{Diacritic}/gu, ''));

  /** Um item do menu de contexto: fecha o menu e faz o gesto no bloco dele. */
  function escolher(gesto: (id: string) => void): void {
    if (!menu || menu.tipo !== 'bloco') return;
    setMenu(null);
    gesto(menu.id);
  }

  function copiarBloco(id: string): void {
    const bloco = mapa[id];
    if (!bloco) return;
    setBlocoCopiado(bloco);
    setMenu(null);
    void navigator.clipboard?.writeText(textoDoBlocoCopiado(bloco)).then(
      () => onAviso('Bloco copiado.'),
      () => onAviso('Bloco copiado nesta aba.'),
    );
  }

  async function colarBloco(): Promise<void> {
    if (!menu || menu.tipo !== 'fundo') return;
    let bloco = blocoCopiado;
    try {
      bloco = blocoDoTextoCopiado(await navigator.clipboard.readText()) ?? bloco;
    } catch {
      // A cópia feita neste Builder continua disponível mesmo sem permissão de leitura do navegador.
    }
    setMenu(null);
    if (!bloco) {
      onAviso('Copie um bloco do Builder antes de colar.');
      return;
    }
    onColar(bloco, menu.posicao);
    onAviso('Bloco colado.');
  }

  function abrirMenuDoFundo(e: React.MouseEvent<HTMLDivElement>): void {
    e.preventDefault();
    const caixa = fundo.current?.getBoundingClientRect();
    const ponto = pontoDoCanvas(e);
    setMenu({
      tipo: 'fundo',
      x: e.clientX - (caixa?.left ?? 0),
      y: e.clientY - (caixa?.top ?? 0),
      posicao: { top: ponto.y, left: ponto.x },
    });
  }

  return (
    <div
      ref={fundo}
      className={`bl-canvas${arrasto?.tipo === 'cena' ? ' bl-canvas--arrastando' : ''}${termoDaPesquisa ? ' bl-canvas--pesquisando' : ''}`}
      onPointerDown={aoPressionarFundo}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={() => setArrasto(null)}
      onWheel={aoRolar}
      onContextMenu={abrirMenuDoFundo}
      aria-label="Blocos do fluxo"
    >
      <div
        className="bl-cena"
        style={{ transform: `translate(${deslocamento.left}px, ${deslocamento.top}px) scale(${escala})` }}
      >
        <svg className="bl-setas" aria-hidden="true">
          {arestas.map((a) => {
            const { d, fim, faceDoFim } = caminhoDaSeta(caixaDe(a.de), caixaDe(a.para));
            const chave = chaveDaAresta(a);
            const ativa = chave === arestaSelecionada;
            return (
              <g
                key={chave}
                className={`bl-seta${ativa ? ' bl-seta--selecionada' : ''}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setArestaSelecionada(ativa ? null : chave);
                  onSelecionar(null);
                }}
              >
                <path className="bl-seta-alvo" d={d} />
                <path className="bl-seta-traco" d={d} />
                <path className="bl-seta-ponta" d={pontaDaSeta(fim, faceDoFim)} />
              </g>
            );
          })}
          {arrasto?.tipo === 'ligacao' ? (
            <path
              className="bl-seta-traco bl-seta--provisoria"
              d={caminhoProvisorio(
                {
                  x: caixaDe(arrasto.de).left + LARGURA_DO_BLOCO / 2,
                  y: caixaDe(arrasto.de).top + caixaDe(arrasto.de).altura,
                },
                arrasto.ate,
              )}
            />
          ) : null}
        </svg>

        {blocos.map((bloco) => (
          <No
            key={bloco.id}
            bloco={bloco}
            erros={errosPorBloco[bloco.id] ?? []}
            selecionado={selecionado === bloco.id}
            editando={editando === bloco.id}
            alvo={alvoDaLigacao === bloco.id}
            corresponde={corresponde(bloco)}
            onPointerDown={(e) => aoPressionarBloco(bloco.id, e)}
            onPointerDownNaSaida={(e) => aoPressionarSaida(bloco.id, e)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (bloco.root) return;
              onSelecionar(bloco.id);
              const caixa = fundo.current?.getBoundingClientRect();
              setMenu({ tipo: 'bloco', id: bloco.id, x: e.clientX - (caixa?.left ?? 0), y: e.clientY - (caixa?.top ?? 0) });
            }}
          />
        ))}
      </div>

      {menu?.tipo === 'bloco' && menuDoBloco ? (
        <div
          className="bl-menu-contexto"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => escolher(onDuplicar)}>
            Duplicar
          </button>
          <button type="button" role="menuitem" onClick={() => copiarBloco(menu.id)}>
            Copiar
          </button>
          <button type="button" role="menuitem" onClick={() => escolher(onCopiarId)}>
            Copiar Id
          </button>
          {podeExcluir(mapa, menu.id) ? (
            <button type="button" role="menuitem" onClick={() => escolher(onExcluir)}>
              Excluir
            </button>
          ) : null}
        </div>
      ) : null}
      {menu?.tipo === 'fundo' ? (
        <div
          className="bl-menu-contexto"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => void colarBloco()}>
            Colar
          </button>
        </div>
      ) : null}
    </div>
  );
}

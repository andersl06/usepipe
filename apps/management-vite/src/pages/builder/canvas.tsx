import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as PointerEventDeReact, WheelEvent as WheelEventDeReact } from 'react';
import type { Aresta, Block, Mapa, Position } from './model';
import { arestasDe, copiedTextBlock, podeExcluir, positionOf, copiedBlockText } from './model';
import { No } from './no';
import { searchMatches } from './search';
import {
  HEIGHT_DEFAULT_OF_BLOCK,
  WIDTH_OF_BLOCK,
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
 * Builder canvas mirrors reference `#canvas.grabbable` with scaled `#diagramContainer`: absolute blocks, SVG arrows behind, background drag to pan, Ctrl+wheel zoom by 10 from 20% to 100% like footer `rzslider`. Captured Pointer Events support mouse/pen/touch and keep drags outside elements. Block drag calls `onMover` repeatedly and `onSoltar` once for one `soltar` reducer step for undo; a click calls `onAbrir` like source `builder-node`. Drag from an output to another block calls `onLigar(de, para)`; dropping outside does nothing. Clicking an arrow selects it; Delete calls `onDesligar`, mirroring source `bind("click")` and `keydown Delete`. Right-click opens Duplicate/Copy ID/Delete except on Start. Measure card height after render so arrows leave the proper face as labels and titles change it.
 */

export interface PropsDoCanvas {
  mapa: Mapa;
  errorsByBlock: Record<string, string[]>;
  selecionado: string | null;
  editando: string | null;
  zoom: number;
  offset: Position;
  onDeslocar: (position: Position) => void;
  onZoom: (value: number) => void;
  onSelecionar: (id: string | null) => void;
  onAbrir: (id: string) => void;
  onMover: (id: string, position: Position) => void;
  onSoltar: () => void;
  onLigar: (de: string, para: string) => void;
  onDesligar: (de: string, para: string) => void;
  onDuplicar: (id: string) => void;
  onCopiarId: (id: string) => void;
  onColar: (block: Block, position: Position) => void;
  onExcluir: (id: string) => void;
  onAviso: (texto: string) => void;
  pesquisa: string;
}

type Arrasto =
  | { tipo: 'bloco'; id: string; origem: Ponto; inicio: Position; moveu: boolean }
  | { tipo: 'cena'; origem: Ponto; inicio: Position }
  | { tipo: 'ligacao'; de: string; origem: Ponto; ate: Ponto; alvo: string | null; moveu: boolean };

type ContextMenu =
  | { tipo: 'bloco'; id: string; x: number; y: number }
  | { tipo: 'fundo'; x: number; y: number; position: Position };

const edgeKey = (a: Aresta): string => `${a.de}\u0000${a.para}`;

export function Canvas({
  mapa,
  errorsByBlock,
  selecionado,
  editando,
  zoom,
  offset,
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
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [copiedBlock, setCopiedBlock] = useState<Block | null>(null);
  const escala = zoom / 100;

  /* Measure each card's actual height so its arrow leaves the correct edge. */
  useLayoutEffect(() => {
    const raiz = fundo.current;
    if (!raiz) return;
    const medidas: Record<string, number> = {};
    let mudou = false;
    for (const el of raiz.querySelectorAll<HTMLElement>('[data-block]')) {
      // `data-block` in no.tsx; the dataset key must follow the attribute name.
      const id = el.dataset['block']!;
      medidas[id] = el.offsetHeight;
      if (alturas[id] !== el.offsetHeight) mudou = true;
    }
    if (mudou || Object.keys(medidas).length !== Object.keys(alturas).length) setAlturas(medidas);
  });

  /* Delete removes the selected arrow, or the selected block when that block may be removed. */
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

  /** Convert pointer screen coordinates to unzoomed canvas coordinates. */
  function pontoDoCanvas(e: { clientX: number; clientY: number }): Ponto {
    const caixa = fundo.current?.getBoundingClientRect();
    return {
      x: ((caixa ? e.clientX - caixa.left : e.clientX) - offset.left) / escala,
      y: ((caixa ? e.clientY - caixa.top : e.clientY) - offset.top) / escala,
    };
  }

  function caixaDe(id: string): Caixa {
    const block = mapa[id];
    const position = block ? positionOf(block) : { top: 0, left: 0 };
    return { ...position, largura: WIDTH_OF_BLOCK, altura: alturas[id] ?? HEIGHT_DEFAULT_OF_BLOCK };
  }

  /**
   * Find the block under the pointer in canvas coordinates; `elementFromPoint` can fail during pointer capture or with arrows overlaid.
   */
  function blockUnder(e: { clientX: number; clientY: number }): string | null {
    const ponto = pontoDoCanvas(e);
    const ids = Object.keys(mapa);
    for (let i = ids.length - 1; i >= 0; i -= 1) {
      const id = ids[i]!;
      if (caixaContemPonto(caixaDe(id), ponto)) return id;
    }
    return null;
  }

  /* ------------------------------------------------------------- blocos */

  function toPressBlock(id: string, e: PointerEventDeReact<HTMLDivElement>): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    setArestaSelecionada(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrasto({
      tipo: 'bloco',
      id,
      origem: { x: e.clientX, y: e.clientY },
      inicio: positionOf(mapa[id]!),
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
    setArrasto({ tipo: 'cena', origem: { x: e.clientX, y: e.clientY }, inicio: offset });
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
      const alvo = blockUnder(e);
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
      // Without real dragging, this is a click on the output point; do not create a self-loop merely from the click.
      // bloco para ele mesmo sozinho (ver `houveArrasto` em `setas.ts`).
      const alvo = arrasto.moveu ? blockUnder(e) : null;
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
    onDeslocar({ left: offset.left - e.deltaX, top: offset.top - e.deltaY });
  }

  /* -------------------------------------------------------------- setas */

  const arestas = arestasDe(mapa);
  const blocos = Object.values(mapa);
  const connectionTarget = arrasto?.tipo === 'ligacao' ? arrasto.alvo : null;
  const blockMenu = menu?.tipo === 'bloco' ? mapa[menu.id] : undefined;
  /*
   * `null` = no search active; an empty `Set` = a term with no result. Both leave the canvas
   * intact (F-4.1) — only a non-empty result set dims the blocks that fall outside it.
   */
  const matches = searchMatches(mapa, pesquisa);
  const pesquisando = matches !== null && matches.size > 0;
  const corresponde = (block: (typeof blocos)[number]): boolean => !pesquisando || matches!.has(block.id);

  /** Um item do menu de contexto: fecha o menu e faz o gesto no bloco dele. */
  function escolher(gesto: (id: string) => void): void {
    if (!menu || menu.tipo !== 'bloco') return;
    setMenu(null);
    gesto(menu.id);
  }

  function copyBlock(id: string): void {
    const block = mapa[id];
    if (!block) return;
    setCopiedBlock(block);
    setMenu(null);
    void navigator.clipboard?.writeText(copiedBlockText(block)).then(
      () => onAviso('Bloco copiado.'),
      () => onAviso('Bloco copiado nesta aba.'),
    );
  }

  async function pasteBlock(): Promise<void> {
    if (!menu || menu.tipo !== 'fundo') return;
    let block = copiedBlock;
    try {
      block = copiedTextBlock(await navigator.clipboard.readText()) ?? block;
    } catch {
      // A Builder copy remains available even if the browser clipboard permission is denied.
    }
    setMenu(null);
    if (!block) {
      onAviso('Copie um bloco do Builder antes de colar.');
      return;
    }
    onColar(block, menu.position);
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
      position: { top: ponto.y, left: ponto.x },
    });
  }

  return (
    <div
      ref={fundo}
      className={`bl-canvas${arrasto?.tipo === 'cena' ? ' bl-canvas--arrastando' : ''}${pesquisando ? ' bl-canvas--pesquisando' : ''}`}
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
        style={{ transform: `translate(${offset.left}px, ${offset.top}px) scale(${escala})` }}
      >
        <svg className="bl-setas" aria-hidden="true">
          {arestas.map((a) => {
            const { d, fim, faceDoFim } = caminhoDaSeta(caixaDe(a.de), caixaDe(a.para));
            const key = edgeKey(a);
            const active = key === arestaSelecionada;
            return (
              <g
                key={key}
                className={`bl-seta${active ? ' bl-seta--selecionada' : ''}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setArestaSelecionada(active ? null : key);
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
                  x: caixaDe(arrasto.de).left + WIDTH_OF_BLOCK / 2,
                  y: caixaDe(arrasto.de).top + caixaDe(arrasto.de).altura,
                },
                arrasto.ate,
              )}
            />
          ) : null}
        </svg>

        {blocos.map((block) => (
          <No
            key={block.id}
            block={block}
            errors={errorsByBlock[block.id] ?? []}
            selecionado={selecionado === block.id}
            editando={editando === block.id}
            alvo={connectionTarget === block.id}
            corresponde={corresponde(block)}
            onPointerDown={(e) => toPressBlock(block.id, e)}
            onPointerDownNaSaida={(e) => aoPressionarSaida(block.id, e)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (block.root) return;
              onSelecionar(block.id);
              const caixa = fundo.current?.getBoundingClientRect();
              setMenu({ tipo: 'bloco', id: block.id, x: e.clientX - (caixa?.left ?? 0), y: e.clientY - (caixa?.top ?? 0) });
            }}
          />
        ))}
      </div>

      {menu?.tipo === 'bloco' && blockMenu ? (
        <div
          className="bl-menu-context"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => escolher(onDuplicar)}>
            Duplicar
          </button>
          <button type="button" role="menuitem" onClick={() => copyBlock(menu.id)}>
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
          className="bl-menu-context"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => void pasteBlock()}>
            Colar
          </button>
        </div>
      ) : null}
    </div>
  );
}

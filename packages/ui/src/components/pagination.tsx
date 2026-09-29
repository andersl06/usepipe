import { useMemo, useState } from 'react';
import { Select } from './select';

/**
 * The product's one pagination: an items-per-page `Select`, the `1-2 de 2` counter and the page
 * navigation. The math and the behavior are shared; `layout` only picks which measured Blip
 * skin (markup and classes) the screen already reproduces, so adopting this component never
 * restyles a screen:
 *
 * - `grade` — Detailed Monitoring and Team grids (`FICHA-monitoring.md` §5): "Resultados por
 *   página", counter and four icon buttons; hidden while there is nothing to show.
 * - `lista` — rules and queue cards (`FICHA-rules.md`, `FICHA-queue-management.md` §2.5/§5):
 *   the same parts with the list footer skin; `ocultarTamanho` drops the size select
 *   (`personalizedbreaks`, `FICHA-atendentes-filas-pausas.md` §b.3/§c).
 * - `portal` — the portal's `bds-pagination` ("Itens por página:", `de N páginas`, the current
 *   page as a select); always shown, even with one page (the eleven-bot DOM shows "1-11 de 11").
 *
 * The CSS for the three skins lives in the Gestão stylesheet next to the screen overrides that
 * refine it; moving it here would reorder the cascade.
 */
export const PAGE_SIZES = [5, 10, 15, 25, 50, 100, 250, 500] as const;

export interface PaginationState {
  page: number;
  byPage: number;
  total: number;
  setPage: (n: number) => void;
  setByPage: (n: number) => void;
}

/** Client-side slicing for lists already loaded whole; changing the size goes back to page 1. */
export function usePage<T>(
  linhas: readonly T[],
  byPageInitial: number = PAGE_SIZES[0],
): PaginationState & { visiveis: readonly T[] } {
  const [byPage, setByPageRaw] = useState<number>(byPageInitial);
  const [pageRaw, setPage] = useState(1);
  const total = linhas.length;
  const totalPages = Math.max(1, Math.ceil(total / byPage));
  const page = Math.min(pageRaw, totalPages);
  const inicio = total === 0 ? 0 : (page - 1) * byPage;
  const fim = Math.min(inicio + byPage, total);
  const visiveis = useMemo(() => linhas.slice(inicio, fim), [linhas, inicio, fim]);

  return {
    visiveis,
    page,
    byPage,
    total,
    setByPage: (n: number) => {
      setByPageRaw(n);
      setPage(1);
    },
    setPage,
  };
}

type Direction = 'primeira' | 'anterior' | 'proxima' | 'ultima';

const ARIA: Record<Direction, string> = {
  primeira: 'Primeira página',
  anterior: 'Página anterior',
  proxima: 'Próxima página',
  ultima: 'Última página',
};

export function Pagination({
  state,
  layout,
  sizes = PAGE_SIZES,
  grade,
  ocultarTamanho = false,
}: {
  state: PaginationState;
  layout: 'grade' | 'lista' | 'portal';
  sizes?: readonly number[];
  /** `grade` only: suffix of the reference `data-testid` of the grid being paginated. */
  grade?: string;
  /** `lista` only: no size select, only the counter and the arrows. */
  ocultarTamanho?: boolean;
}) {
  const { page, total, setPage } = state;
  const byPage = layout === 'portal' && !sizes.includes(state.byPage) ? sizes[0]! : state.byPage;
  const totalPages = Math.max(1, Math.ceil(total / byPage));
  const primeiro = total === 0 ? 0 : (page - 1) * byPage + 1;
  const ultimo = Math.min(page * byPage, total);
  const destino: Record<Direction, number> = {
    primeira: 1,
    anterior: page - 1,
    proxima: page + 1,
    ultima: totalPages,
  };
  const desabilitado = (d: Direction) => (d === 'primeira' || d === 'anterior' ? page <= 1 : page >= totalPages);

  const tamanho = (rotulo: string, aoMudar: (n: number) => void) => (
    <Select value={byPage} onChange={(e) => aoMudar(Number(e.currentTarget.value))} aria-label={rotulo}>
      {sizes.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </Select>
  );

  if (layout === 'portal') {
    const seta = (d: Direction, glifo: string) => (
      <button
        type="button"
        className="pt-pagination-icon"
        disabled={desabilitado(d)}
        onClick={() => setPage(destino[d])}
        aria-label={ARIA[d]}
      >
        {glifo}
      </button>
    );
    return (
      <div className="pt-pagination">
        <div className="pt-pagination-left">
          <label>Itens por página:</label>
          {tamanho('Itens por página', (n) => {
            state.setByPage(n);
            setPage(1);
          })}
          <span className="pt-pagination-account">
            {primeiro}-{ultimo} de {total}
          </span>
        </div>
        <nav className="pt-pagination-right" aria-label="Páginas">
          {seta('primeira', '«')}
          {seta('anterior', '‹')}
          <Select value={String(page)} aria-label="Página atual" onChange={(e) => setPage(Number(e.target.value))}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <span className="pt-pagination-of">de {totalPages} páginas</span>
          {seta('proxima', '›')}
          {seta('ultima', '»')}
        </nav>
      </div>
    );
  }

  if (layout === 'lista') {
    const seta = (d: Direction) => (
      <button type="button" disabled={desabilitado(d)} onClick={() => setPage(destino[d])} aria-label={ARIA[d]}>
        <ListArrow tipo={d} />
      </button>
    );
    return (
      <div className="footer-pagination">
        {ocultarTamanho ? null : (
          <label className="rp-tamanho">
            Resultados por página
            {tamanho('Resultados por página', state.setByPage)}
          </label>
        )}
        <span className="rp-count">{`${primeiro}-${ultimo} de ${total}`}</span>
        <div className="rp-nav">
          {seta('primeira')}
          {seta('anterior')}
          <span className="rp-atual">{page}</span>
          {seta('proxima')}
          {seta('ultima')}
        </div>
      </div>
    );
  }

  if (total === 0) return null;
  const seta = (d: Direction) => (
    <button
      type="button"
      className="iconbtn"
      disabled={desabilitado(d)}
      onClick={() => setPage(destino[d])}
      title={ARIA[d]}
      aria-label={ARIA[d]}
    >
      <GridIcon tipo={d} />
    </button>
  );
  return (
    <div className="pg" data-testid={grade ? `desk-grid-tabled-paginated-pagination-container-${grade}` : undefined}>
      <label className="pg-per-page">
        Resultados por página
        {tamanho('Resultados por página', state.setByPage)}
      </label>
      <div className="pg-direita">
        <span className="pg-contador" aria-live="polite">
          {primeiro}-{ultimo} de {total}
        </span>
        <div className="pg-nav" data-testid="pagination-test">
          {seta('primeira')}
          {seta('anterior')}
          {/* The current page number between the arrows, as reference `data-testid="current-page-test"`. */}
          <span className="pg-atual" aria-current="page" data-testid="current-page-test">
            {page}
          </span>
          {seta('proxima')}
          {seta('ultima')}
        </div>
      </div>
    </div>
  );
}

function GridIcon({ tipo }: { tipo: Direction }) {
  const esquerda = tipo === 'primeira' || tipo === 'anterior';
  const dupla = tipo === 'primeira' || tipo === 'ultima';
  return (
    <svg className="pg-icone" viewBox="0 0 24 24" aria-hidden="true">
      {dupla ? <path d={esquerda ? 'M6 5v14' : 'M18 5v14'} /> : null}
      <path d={esquerda ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

/** `arrow-first`, `arrow-left`, `arrow-right`, `arrow-last` of the list footer (`FICHA-rules.md` §5). */
function ListArrow({ tipo }: { tipo: Direction }) {
  const caminhos: Record<Direction, string> = {
    primeira: 'M11 7l-5 5l5 5M17 7l-5 5l5 5',
    anterior: 'M15 6l-6 6l6 6',
    proxima: 'M9 6l6 6l-6 6',
    ultima: 'M7 7l5 5l-5 5M13 7l5 5l-5 5',
  };
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={caminhos[tipo]} />
    </svg>
  );
}

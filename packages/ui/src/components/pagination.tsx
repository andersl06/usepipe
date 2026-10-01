import { useMemo, useState } from 'react';
import { PAGE_SIZES, janelaDaPagina } from './pagination-math';
import { Select } from './select';

/**
 * The product's one pagination: an items-per-page `Select`, the `1-2 de 2` counter and the page
 * navigation. The math and the behavior are shared; `layout` only picks which measured Blip
 * skin (markup and classes) the screen already reproduces, so adopting this component never
 * restyles a screen:
 *
 * - `grade` — the Attendance footer, the same in grids (Detailed Monitoring, Team) and lists (rules,
 *   queues, `paginacao.md`): "Resultados por página", counter and four icon buttons. `afastado` takes
 *   the list's top margin; `ocultarTamanho` drops the size select (`personalizedbreaks`); hidden while
 *   there is nothing to show unless `ocultarVazio={false}`.
 * - `portal` — the portal's `bds-pagination` ("Itens por página:", `de N páginas`, the current
 *   page as a select); always shown, even with one page (the eleven-bot DOM shows "1-11 de 11").
 *
 * The CSS for both skins lives in the Gestão stylesheet next to the screen overrides that
 * refine it; moving it here would reorder the cascade.
 */
export { PAGE_SIZES } from './pagination-math';

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
  const { page, inicio, fim } = janelaDaPagina(total, pageRaw, byPage);
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
  afastado = false,
  ocultarVazio = true,
}: {
  state: PaginationState;
  layout: 'grade' | 'portal';
  sizes?: readonly number[];
  /** `grade` only: suffix of the reference `data-testid` of the grid being paginated. */
  grade?: string;
  /** `grade` only: no size select, only the counter and the arrows. */
  ocultarTamanho?: boolean;
  /** `grade` only: the list footer's 20px top margin instead of the grid's 10px. */
  afastado?: boolean;
  /** `grade` only: render nothing while there is no row (default). */
  ocultarVazio?: boolean;
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

  if (total === 0 && ocultarVazio) return null;
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
    <div className={afastado ? 'pg pg-lista' : 'pg'} data-testid={grade ? `desk-grid-tabled-paginated-pagination-container-${grade}` : undefined}>
      {ocultarTamanho ? null : (
        <label className="pg-per-page">
          Resultados por página
          {tamanho('Resultados por página', state.setByPage)}
        </label>
      )}
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

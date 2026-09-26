import { useMemo, useState } from 'react';
import { Selection } from './selection';

/**
 * Detailed Monitoring pagination follows `FICHA-monitoring.md` Section 5: exact Results-per-page options, `1-5 de 8` counter, and four navigation buttons. Keep it client-side because `useRead` already loads all open rows in one transaction; slicing locally needs no additional server request.
 */
const OPTIONS_BY_PAGE = [5, 10, 15, 25, 50, 100, 250, 500] as const;

export interface StatePagination {
  page: number;
  totalPages: number;
  byPage: number;
  inicio: number;
  fim: number;
  total: number;
  setByPage: (n: number) => void;
  setPage: (n: number) => void;
}

export function usePage<T>(
  linhas: readonly T[],
  byPageInitial: (typeof OPTIONS_BY_PAGE)[number] = 5,
): StatePagination & { visiveis: readonly T[] } {
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
    totalPages,
    byPage,
    inicio,
    fim,
    total,
    setByPage: (n: number) => {
      setByPageRaw(n);
      setPage(1);
    },
    setPage,
  };
}

export function Pagination({ state, grade }: { state: StatePagination; grade?: string }) {
  const { page, totalPages, byPage, inicio, fim, total, setByPage, setPage } = state;
  if (total === 0) return null;

  return (
    <div
      className="pg"
      data-testid={grade ? `desk-grid-tabled-paginated-pagination-container-${grade}` : undefined}
    >
      <label className="pg-per-page">
        Resultados por página
        <Selection
          value={byPage}
          onChange={(e) => setByPage(Number(e.currentTarget.value))}
          aria-label="Resultados por página"
        >
          {OPTIONS_BY_PAGE.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Selection>
      </label>

      <div className="pg-direita">
        <span className="pg-contador" aria-live="polite">
          {inicio + 1}-{fim} de {total}
        </span>

        <div className="pg-nav" data-testid="pagination-test">
        <button
          type="button"
          className="iconbtn"
          disabled={page <= 1}
          onClick={() => setPage(1)}
          title="Primeira página"
          aria-label="Primeira página"
        >
          <PaginationIcon tipo="primeira" />
        </button>
        <button
          type="button"
          className="iconbtn"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          title="Página anterior"
          aria-label="Página anterior"
        >
          <PaginationIcon tipo="anterior" />
        </button>
        {/*
 * Show current page number between arrows, matching reference `data-testid="current-page-test"`.
 */}
        <span className="pg-atual" aria-current="page" data-testid="current-page-test">
          {page}
        </span>
        <button
          type="button"
          className="iconbtn"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          title="Próxima página"
          aria-label="Próxima página"
        >
          <PaginationIcon tipo="proxima" />
        </button>
        <button
          type="button"
          className="iconbtn"
          disabled={page >= totalPages}
          onClick={() => setPage(totalPages)}
          title="Última página"
          aria-label="Última página"
        >
          <PaginationIcon tipo="ultima" />
        </button>
        </div>
      </div>
    </div>
  );
}

function PaginationIcon({ tipo }: { tipo: 'primeira' | 'anterior' | 'proxima' | 'ultima' }) {
  const esquerda = tipo === 'primeira' || tipo === 'anterior';
  const dupla = tipo === 'primeira' || tipo === 'ultima';
  return (
    <svg className="pg-icone" viewBox="0 0 24 24" aria-hidden="true">
      {dupla ? <path d={esquerda ? 'M6 5v14' : 'M18 5v14'} /> : null}
      <path d={esquerda ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

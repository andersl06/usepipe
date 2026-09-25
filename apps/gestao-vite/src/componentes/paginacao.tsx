import { useMemo, useState } from 'react';
import { Selection } from './selecao';

/**
 * Paginação do "Monitoramento detalhado" — o rodapé deles, medido na
 * `FICHA-monitoring.md` §5: "Resultados por página" com as opções exatas,
 * contador "1-5 de 8" e os quatro botões de navegação.
 *
 * É paginação DE CLIENTE, e de propósito: a consulta já traz todas as linhas
 * abertas numa transação só (`useLeitura`), então recortar a página aqui não
 * custa uma ida a mais ao servidor.
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
  const [pageBruta, setPage] = useState(1);
  const total = linhas.length;
  const totalPages = Math.max(1, Math.ceil(total / byPage));
  const page = Math.min(pageBruta, totalPages);
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
      <label className="pg-por-pagina">
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
          <IconePagination tipo="primeira" />
        </button>
        <button
          type="button"
          className="iconbtn"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          title="Página anterior"
          aria-label="Página anterior"
        >
          <IconePagination tipo="anterior" />
        </button>
        {/* O número da página atual entre as setas — `data-testid=
            "current-page-test"` no rodapé deles. */}
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
          <IconePagination tipo="proxima" />
        </button>
        <button
          type="button"
          className="iconbtn"
          disabled={page >= totalPages}
          onClick={() => setPage(totalPages)}
          title="Última página"
          aria-label="Última página"
        >
          <IconePagination tipo="ultima" />
        </button>
        </div>
      </div>
    </div>
  );
}

function IconePagination({ tipo }: { tipo: 'primeira' | 'anterior' | 'proxima' | 'ultima' }) {
  const esquerda = tipo === 'primeira' || tipo === 'anterior';
  const dupla = tipo === 'primeira' || tipo === 'ultima';
  return (
    <svg className="pg-icone" viewBox="0 0 24 24" aria-hidden="true">
      {dupla ? <path d={esquerda ? 'M6 5v14' : 'M18 5v14'} /> : null}
      <path d={esquerda ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

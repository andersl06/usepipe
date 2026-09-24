import { useMemo, useState } from 'react';
import { Selecao } from './selecao';

/**
 * Paginação do "Monitoramento detalhado" — o rodapé deles, medido na
 * `FICHA-monitoring.md` §5: "Resultados por página" com as opções exatas,
 * contador "1-5 de 8" e os quatro botões de navegação.
 *
 * É paginação DE CLIENTE, e de propósito: a consulta já traz todas as linhas
 * abertas numa transação só (`useLeitura`), então recortar a página aqui não
 * custa uma ida a mais ao servidor.
 */
const OPCOES_POR_PAGINA = [5, 10, 15, 25, 50, 100, 250, 500] as const;

export interface EstadoPaginacao {
  pagina: number;
  totalPaginas: number;
  porPagina: number;
  inicio: number;
  fim: number;
  total: number;
  setPorPagina: (n: number) => void;
  setPagina: (n: number) => void;
}

export function usePagina<T>(
  linhas: readonly T[],
  porPaginaInicial: (typeof OPCOES_POR_PAGINA)[number] = 5,
): EstadoPaginacao & { visiveis: readonly T[] } {
  const [porPagina, setPorPaginaBruto] = useState<number>(porPaginaInicial);
  const [paginaBruta, setPagina] = useState(1);
  const total = linhas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(paginaBruta, totalPaginas);
  const inicio = total === 0 ? 0 : (pagina - 1) * porPagina;
  const fim = Math.min(inicio + porPagina, total);
  const visiveis = useMemo(() => linhas.slice(inicio, fim), [linhas, inicio, fim]);

  return {
    visiveis,
    pagina,
    totalPaginas,
    porPagina,
    inicio,
    fim,
    total,
    setPorPagina: (n: number) => {
      setPorPaginaBruto(n);
      setPagina(1);
    },
    setPagina,
  };
}

export function Paginacao({ estado, grade }: { estado: EstadoPaginacao; grade?: string }) {
  const { pagina, totalPaginas, porPagina, inicio, fim, total, setPorPagina, setPagina } = estado;
  if (total === 0) return null;

  return (
    <div
      className="pg"
      data-testid={grade ? `desk-grid-tabled-paginated-pagination-container-${grade}` : undefined}
    >
      <label className="pg-por-pagina">
        Resultados por página
        <Selecao
          value={porPagina}
          onChange={(e) => setPorPagina(Number(e.currentTarget.value))}
          aria-label="Resultados por página"
        >
          {OPCOES_POR_PAGINA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Selecao>
      </label>

      <div className="pg-direita">
        <span className="pg-contador" aria-live="polite">
          {inicio + 1}-{fim} de {total}
        </span>

        <div className="pg-nav" data-testid="pagination-test">
        <button
          type="button"
          className="iconbtn"
          disabled={pagina <= 1}
          onClick={() => setPagina(1)}
          title="Primeira página"
          aria-label="Primeira página"
        >
          <IconePaginacao tipo="primeira" />
        </button>
        <button
          type="button"
          className="iconbtn"
          disabled={pagina <= 1}
          onClick={() => setPagina(pagina - 1)}
          title="Página anterior"
          aria-label="Página anterior"
        >
          <IconePaginacao tipo="anterior" />
        </button>
        {/* O número da página atual entre as setas — `data-testid=
            "current-page-test"` no rodapé deles. */}
        <span className="pg-atual" aria-current="page" data-testid="current-page-test">
          {pagina}
        </span>
        <button
          type="button"
          className="iconbtn"
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina(pagina + 1)}
          title="Próxima página"
          aria-label="Próxima página"
        >
          <IconePaginacao tipo="proxima" />
        </button>
        <button
          type="button"
          className="iconbtn"
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina(totalPaginas)}
          title="Última página"
          aria-label="Última página"
        >
          <IconePaginacao tipo="ultima" />
        </button>
        </div>
      </div>
    </div>
  );
}

function IconePaginacao({ tipo }: { tipo: 'primeira' | 'anterior' | 'proxima' | 'ultima' }) {
  const esquerda = tipo === 'primeira' || tipo === 'anterior';
  const dupla = tipo === 'primeira' || tipo === 'ultima';
  return (
    <svg className="pg-icone" viewBox="0 0 24 24" aria-hidden="true">
      {dupla ? <path d={esquerda ? 'M6 5v14' : 'M18 5v14'} /> : null}
      <path d={esquerda ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

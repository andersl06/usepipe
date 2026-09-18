import { useMemo, useState } from 'react';
import { Icone } from '@pipe/ui';

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

export function Paginacao({ estado }: { estado: EstadoPaginacao }) {
  const { pagina, totalPaginas, porPagina, inicio, fim, total, setPorPagina, setPagina } = estado;
  if (total === 0) return null;

  return (
    <div className="pg">
      <label className="pg-por-pagina">
        Resultados por página
        <select
          value={porPagina}
          onChange={(e) => setPorPagina(Number(e.currentTarget.value))}
          aria-label="Resultados por página"
        >
          {OPCOES_POR_PAGINA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <span className="pg-contador">
        {inicio + 1}-{fim} de {total}
      </span>

      <div className="pg-nav">
        <button
          type="button"
          className="iconbtn"
          disabled={pagina <= 1}
          onClick={() => setPagina(1)}
          title="Primeira página"
          aria-label="Primeira página"
        >
          <span className="pg-dupla">
            <Icone nome="esquerda" tamanho={13} />
            <Icone nome="esquerda" tamanho={13} />
          </span>
        </button>
        <button
          type="button"
          className="iconbtn"
          disabled={pagina <= 1}
          onClick={() => setPagina(pagina - 1)}
          title="Página anterior"
          aria-label="Página anterior"
        >
          <Icone nome="esquerda" tamanho={14} />
        </button>
        <button
          type="button"
          className="iconbtn"
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina(pagina + 1)}
          title="Próxima página"
          aria-label="Próxima página"
        >
          <Icone nome="esquerda" tamanho={14} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button
          type="button"
          className="iconbtn"
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina(totalPaginas)}
          title="Última página"
          aria-label="Última página"
        >
          <span className="pg-dupla" style={{ transform: 'rotate(180deg)' }}>
            <Icone nome="esquerda" tamanho={13} />
            <Icone nome="esquerda" tamanho={13} />
          </span>
        </button>
      </div>
    </div>
  );
}

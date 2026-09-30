/** Items-per-page options of the reference pagination ("Resultados por página"). All are greater than zero. */
export const PAGE_SIZES = [5, 10, 15, 25, 50, 100, 250, 500] as const;

export interface PageWindow {
  page: number;
  totalPages: number;
  inicio: number;
  fim: number;
}

/**
 * Slice window for client-side pagination: an out-of-range page falls back to the last one,
 * an empty list is one page with an empty window.
 */
export function janelaDaPagina(total: number, pageRaw: number, byPage: number): PageWindow {
  const totalPages = Math.max(1, Math.ceil(total / byPage));
  const page = Math.min(pageRaw, totalPages);
  const inicio = total === 0 ? 0 : (page - 1) * byPage;
  const fim = Math.min(inicio + byPage, total);
  return { page, totalPages, inicio, fim };
}

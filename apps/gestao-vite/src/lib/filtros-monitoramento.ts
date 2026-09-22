export function urlParaLimparFiltros(
  base: string,
  atual: { fila?: string },
  preservarFila = false,
): string {
  return preservarFila && atual.fila ? `${base}?fila=${encodeURIComponent(atual.fila)}` : base;
}

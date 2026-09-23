export function urlParaLimparFiltros(
  base: string,
  atual: { fila?: string },
  preservarFila = false,
): string {
  return preservarFila && atual.fila ? `${base}?fila=${encodeURIComponent(atual.fila)}` : base;
}

/** Copia a query inteira: abas, busca e parâmetros futuros continuam no link. */
export function parametrosComFiltros(
  atuais: URLSearchParams,
  alteracoes: Readonly<Record<string, string | readonly string[] | undefined>>,
): URLSearchParams {
  const proximos = new URLSearchParams(atuais);
  for (const [chave, valor] of Object.entries(alteracoes)) {
    proximos.delete(chave);
    for (const item of typeof valor === 'string' ? [valor] : (valor ?? [])) {
      if (item.trim()) proximos.append(chave, item.trim());
    }
  }
  return proximos;
}

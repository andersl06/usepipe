/** Aceita links antigos (um id), valores repetidos e listas separadas por vírgula. */
export function filterIds(value: string | readonly string[] | undefined): string[] {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set((typeof value === 'string' ? [value] : value ?? [])
    .flatMap(v => v.split(',')).map(v => v.trim()).filter(v => uuid.test(v)))];
}

export function urlForLimparFilters(
  base: string,
  atual: { queue?: string },
  preservarQueue = false,
): string {
  return preservarQueue && atual.queue ? `${base}?queue=${encodeURIComponent(atual.queue)}` : base;
}

/** Copia a query inteira: abas, busca e parâmetros futuros continuam no link. */
export function parametrosWithFilters(
  current: URLSearchParams,
  changes: Readonly<Record<string, string | readonly string[] | undefined>>,
): URLSearchParams {
  const proximos = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    proximos.delete(key);
    for (const item of typeof value === 'string' ? [value] : (value ?? [])) {
      if (item.trim()) proximos.append(key, item.trim());
    }
  }
  return proximos;
}

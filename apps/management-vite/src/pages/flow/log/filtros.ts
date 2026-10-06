export interface LogFilterValues {
  busca: string;
  de: string;
  ate: string;
  direcao: string;
  tipo: string;
}

export const EMPTY_LOG_FILTERS: LogFilterValues = { busca: '', de: '', ate: '', direcao: '', tipo: '' };

/** Shape guard for the stored filter (D-30): any string field missing drops the whole value. */
export function validateLogFilters(value: unknown): LogFilterValues | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const fields = ['busca', 'de', 'ate', 'direcao', 'tipo'] as const;
  if (fields.some((f) => typeof v[f] !== 'string')) return null;
  return {
    busca: v.busca as string,
    de: v.de as string,
    ate: v.ate as string,
    direcao: v.direcao as string,
    tipo: v.tipo as string,
  };
}

/** Query string for `/analytics/log`; empty filters are left out. */
export function logQuery(filters: LogFilterValues): string {
  const query = new URLSearchParams();
  if (filters.busca) query.set('search', filters.busca);
  if (filters.de) query.set('from', filters.de);
  if (filters.ate) query.set('to', filters.ate);
  if (filters.direcao) query.set('direction', filters.direcao);
  if (filters.tipo) query.set('type', filters.tipo);
  return query.toString();
}

/** Filters as submitted by the form; a missing field is empty. */
export function filtersFromForm(data: FormData): LogFilterValues {
  const field = (name: keyof LogFilterValues) => String(data.get(name) ?? '');
  return {
    busca: field('busca'),
    de: field('de'),
    ate: field('ate'),
    direcao: field('direcao'),
    tipo: field('tipo'),
  };
}

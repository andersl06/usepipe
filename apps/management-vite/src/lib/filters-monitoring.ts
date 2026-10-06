/** Accept legacy links with one ID, repeated values, or comma-separated lists. */
export function filterIds(value: string | readonly string[] | undefined): string[] {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set((typeof value === 'string' ? [value] : value ?? [])
    .flatMap(v => v.split(',')).map(v => v.trim()).filter(v => uuid.test(v)))];
}

export function urlForClearFilters(
  base: string,
  _atual: { queue?: string },
  _preserveQueue = false,
): string {
  return base;
}

/** Copy the whole query so tabs, search, and future parameters remain in the link. */
export function parametersWithFilters(
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

/**
 * Contact and agent-status filters of the detailed list. Rows without an agent (or an agent whose status is unknown) never match a status filter.
 */
export function matchesListFilters(
  row: { contactName: string; agentState: string | undefined },
  filter: { contact?: string; status?: string },
): boolean {
  const contact = (filter.contact ?? '').trim().toLowerCase();
  if (contact && !row.contactName.toLowerCase().includes(contact)) return false;
  if (filter.status && row.agentState !== filter.status) return false;
  return true;
}

export type MonitoringFilter = {
  queue?: string;
  agent?: string;
  contact?: string;
  status?: string;
  search?: string;
};

/** Querystring of the monitoring list for a filter and tab; the agent becomes `atendente`. */
export function monitoringQuery(filter: MonitoringFilter, aba: string): URLSearchParams {
  const p = new URLSearchParams();
  if (filter.queue) p.set('fila', filter.queue);
  if (filter.agent) p.set('atendente', filter.agent);
  if (filter.contact) p.set('contato', filter.contact);
  if (filter.status) p.set('status', filter.status);
  if (filter.search) p.set('busca', filter.search);
  p.set('aba', aba);
  return p;
}

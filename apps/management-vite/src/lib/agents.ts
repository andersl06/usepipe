import type { AgentRegistered } from './registrations';

/**
 * Keep agent search, queue filter, and permission-page description in a pure module like `cadastros.ts` without `./api` or JSX, so `tests/atendentes.test.ts` runs with `node --test` and `tsx` outside Vite. Reference `FICHA-atendentes-filas-pausas.md` Section b.2 has one name/email search and one multi-select queue filter with clear/cancel/apply, nothing else.
 */

export interface AgentsFilter {
  /** O texto de "Buscar por nome ou e-mail". */
  search: string;
  /** Nomes de fila marcados no painel "Filtrar por: Filas". Vazio = todas. */
  queues: readonly string[];
}

export const FILTER_EMPTY: AgentsFilter = { search: '', queues: [] };

/**
 * Search both name and email as the placeholder promises; searching only names would fail on an email visibly listed on screen.
 */
export function filterAgents(
  agents: readonly AgentRegistered[],
  filter: AgentsFilter,
): AgentRegistered[] {
  const alvo = filter.search.trim().toLowerCase();
  const queues = new Set(filter.queues);
  return agents.filter((a) => {
    if (alvo && !`${a.nome} ${a.email}`.toLowerCase().includes(alvo)) return false;
    /*
     * One matched queue is enough: an agent in both Support and Finance appears under Support.
     */
    if (queues.size > 0 && !a.queues.some((f) => queues.has(f))) return false;
    return true;
  });
}

/**
 * Offer only queues carried by listed agents, deduplicated and sorted. The reference filter lists queues represented on screen, not every tenant queue.
 */
export function agentsQueues(agents: readonly AgentRegistered[]): string[] {
  const nomes = new Set<string>();
  for (const a of agents) for (const f of a.queues) nomes.add(f);
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Format the card's Queue field like captured `team.html` line 628: `Default,Suporte`, comma without spaces or chips.
 */
export function queuesInCard(queues: readonly string[]): string {
  return queues.length === 0 ? '—' : queues.join(',');
}

/**
 * Permission-page description has the source's three variants: `singleMemberDescription`, `coupleMembersDescription`, `multiplesMembersDescription` (reference sheet Section a.4).
 */
export function permissionsDescription(nomes: readonly string[]): string {
  const [first, segundo] = nomes;
  if (nomes.length === 0) return 'Configure as permissões do atendente';
  if (nomes.length === 1) return `Configure as permissões de ${first}`;
  if (nomes.length === 2) return `Configure as permissões de ${first} e ${segundo}`;
  return `Configure as permissões de ${first} e outros ${nomes.length - 1} atendentes`;
}


export function editTitle(quantity: number): string {
  return `Editar ${quantity} atendente${quantity === 1 ? '' : 's'}`;
}

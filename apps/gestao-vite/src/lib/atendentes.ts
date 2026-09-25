import type { AgentRegistered } from './cadastros';

/**
 * As contas da tela "Gestão de atendentes" — busca, filtro por fila e o texto
 * da descrição da página de permissões.
 *
 * Módulo PURO, sem `./api` e sem JSX, pelo mesmo motivo que `cadastros.ts`:
 * é o que deixa `tests/atendentes.test.ts` rodar com `node --test` + `tsx`,
 * fora do Vite.
 *
 * A forma vem de `FICHA-atendentes-filas-pausas.md` §b.2: a origem tem UMA
 * busca ("Buscar por nome ou e-mail") e UM filtro ("Filtrar por: Filas", com
 * seleção múltipla, "Limpar seleção"/"Cancelar"/"Aplicar"). Nenhum outro.
 */

export interface AgentsFilter {
  /** O texto de "Buscar por nome ou e-mail". */
  search: string;
  /** Nomes de fila marcados no painel "Filtrar por: Filas". Vazio = todas. */
  queues: readonly string[];
}

export const FILTER_EMPTY: AgentsFilter = { search: '', queues: [] };

/**
 * Busca em nome E e-mail, como o placeholder promete — buscar só no nome faria
 * a pessoa digitar o e-mail que está na tela e não achar nada.
 */
export function filterAgents(
  agents: readonly AgentRegistered[],
  filter: AgentsFilter,
): AgentRegistered[] {
  const alvo = filter.search.trim().toLowerCase();
  const queues = new Set(filter.queues);
  return agents.filter((a) => {
    if (alvo && !`${a.nome} ${a.email}`.toLowerCase().includes(alvo)) return false;
    /* Uma fila marcada basta: quem está em Suporte aparece no filtro de
       Suporte mesmo estando também em Financeiro. */
    if (queues.size > 0 && !a.queues.some((f) => queues.has(f))) return false;
    return true;
  });
}

/**
 * As filas que o painel de filtro oferece — as que os atendentes carregam,
 * sem repetição e em ordem. Sai da própria lista porque o painel da origem
 * não tem "todas as filas do tenant", tem as que a lista mostra.
 */
export function agentsQueues(agents: readonly AgentRegistered[]): string[] {
  const nomes = new Set<string>();
  for (const a of agents) for (const f of a.queues) nomes.add(f);
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * A coluna "Filas" do cartão, no formato da captura: `Default,Suporte` —
 * vírgula, sem espaço, sem etiqueta (`team.html` linha 628).
 */
export function queuesInCard(queues: readonly string[]): string {
  return queues.length === 0 ? '—' : queues.join(',');
}

/**
 * A descrição da página de permissões, nas TRÊS variantes da origem
 * (`singleMemberDescription`, `coupleMembersDescription`,
 * `multiplesMembersDescription` — §a.4 da ficha).
 */
export function permissionsDescription(nomes: readonly string[]): string {
  const [first, segundo] = nomes;
  if (nomes.length === 0) return 'Configure as permissões do atendente';
  if (nomes.length === 1) return `Configure as permissões de ${first}`;
  if (nomes.length === 2) return `Configure as permissões de ${first} e ${segundo}`;
  return `Configure as permissões de ${first} e outros ${nomes.length - 1} atendentes`;
}

/** O título da página de edição em lote: "Editar 3 atendentes" / "Editar 1 atendente". */
export function editTitulo(quantity: number): string {
  return `Editar ${quantity} atendente${quantity === 1 ? '' : 's'}`;
}

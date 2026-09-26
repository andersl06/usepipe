/**
 * Conversation priority scale and its waiting-queue order live here rather than in `@pipe/db`. The scale originated beside the database constraint in `schema/comum.ts`, but importing it from there would pull `drizzle-orm/pg-core` and the PostgreSQL driver into browser code. Desk instead kept a parallel three-level weight map that treated unknown priorities as `media`, wrongly ordering `maxima` and `sem_prioridade` as medium. This package holds pure rules without database or HTTP; `@pipe/db` imports the scale to build its constraint. See `referencias-blip/pesquisa/blip-gestao-medidas.md` §8.5.
 */

/**
 * Five levels in precedence order; the array index is the weight and the first receives service first. `sem_prioridade` means priority is absent, not medium by default: even `baixa` precedes it. The old `media` default assigned an invented priority to every ticket. Array order is business meaning; inserting a level changes queue order. Use `pesoPrioridade`, never a parallel weight map.
 */
export const NIVEIS_PRIORITY = ['maxima', 'alta', 'media', 'baixa', 'sem_prioridade'] as const;

export type NivelPriority = (typeof NIVEIS_PRIORITY)[number];

/**
 * A prioritization rule may assign any level except absence. Assigning `sem_prioridade` would demote a ticket to the end without anyone requesting it.
 */
export const NIVEIS_ATRIBUIVEIS = NIVEIS_PRIORITY.filter((n) => n !== 'sem_prioridade');


export const ROTULOS_PRIORITY: Record<NivelPriority, string> = {
  maxima: 'Máxima',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
  sem_prioridade: 'Sem prioridade',
};

/**
 * Sort weight: lower is served first. Unknown values go to the END rather than the middle; assigning them invented priority is the defect this function prevents.
 */
export function pesoPriority(nivel: string): number {
  const position = (NIVEIS_PRIORITY as readonly string[]).indexOf(nivel);
  return position === -1 ? NIVEIS_PRIORITY.length : position;
}

/*
 * Each app keeps its own comparator deliberately: Management stores creation at `marcos.criadaEm`, Desk at `criadaEm`, and a shared generic function would cost more than three duplicated lines. The scale above must remain single. Tie-break by priority first, then oldest creation time; otherwise the queue behaves as a stack, serving the latest arrival first.
 */

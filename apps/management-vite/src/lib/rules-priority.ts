import { NIVEIS_ATRIBUIVEIS, LABELS_PRIORITY, type LevelPriority } from '@pipe/core/conversation';

/**
 * Priority rules supply the queue-edit section from `FICHA-atendentes-filas-pausas.md` Section a.3. `GET /v1/gestao/regras/prioridade` returns the whole tenant: `regra_prioridade` has `escopo_tipo` (`tenant` or `queue`) and `escopo_id`. Show only rules with `queue` scope and this queue's `scopeId`; tenant rules apply here too but are not edited in this section. Keep this pure (no `./api` or JSX) so `tests/regras-prioridade.test.ts` runs with `node --test` and `tsx`.
 */

export interface PriorityRule {
  id: string;
  nome: string;
  nivel: string;
  scopeType: string;
  scopeId: string | null;
  condition: Record<string, unknown>;
  active: boolean;
}

export { NIVEIS_ATRIBUIVEIS };

/** Use core `ROTULOS_PRIORIDADE` for Portuguese priority labels instead of a parallel map. */
export function rotuloDoNivel(nivel: string): string {
  return LABELS_PRIORITY[nivel as LevelPriority] ?? nivel;
}

/** Keep rules for this queue in the API's existing name order. */
export function queueRules(
  regras: readonly PriorityRule[],
  queueId: string,
): PriorityRule[] {
  return regras.filter((r) => r.scopeType === 'fila' && r.scopeId === queueId);
}

/** Tenant-scoped rules apply to this queue too but cannot be edited here. */
export function regrasDoTenant(regras: readonly PriorityRule[]): PriorityRule[] {
  return regras.filter((r) => r.scopeType === 'tenant');
}

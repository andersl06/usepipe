import { and, asc, eq } from 'drizzle-orm';
import { avaliarExpressao, type Expressao } from '@pipe/core';
import { rulePriority } from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';

/**
 * The `regra_prioridade` engine now evaluates active rules when a conversation enters a queue (`dominio/entrada.ts`, `dominio/fluxo.ts`), and the first match sets `conversa.prioridade`. Earlier `regras-prioridade.ts` implemented only CRUD. Pipe still has no explicit order column: queue-scoped rules precede tenant-scoped rules, as in SLA `escolherRegra` in `sla.ts`; within a scope, older `criado_em` wins. Add an `ordem` column only if reordering without recreation becomes necessary. An empty condition matches all conversations IN SCOPE: `regra_prioridade.condicao` defaults to `{}` (`packages/db/src/schema/gestao.ts`), and scope already filters applicability. This deliberately differs from empty `regra_fila` conditions, which never match because their conditions are the whole rule.
 */

export interface RulePriorityForEngine {
  id: string;
  level: string;
  scopeType: string;
  scopeId: string | null;
  condition: Record<string, unknown>;
  criadoEm: Date;
}

export async function loadRulesOfPriorityActive(
  tx: TransactionPipe,
): Promise<RulePriorityForEngine[]> {
  const linhas = await tx
    .select({
      id: rulePriority.id,
      level: rulePriority.nivel,
      scopeType: rulePriority.scopeType,
      scopeId: rulePriority.scopeId,
      condition: rulePriority.condition,
      criadoEm: rulePriority.criadoEm,
    })
    .from(rulePriority)
    .where(and(eq(rulePriority.ativa, true)))
    .orderBy(asc(rulePriority.criadoEm), asc(rulePriority.id));
  return linhas.map((l) => ({ ...l, condition: (l.condition ?? {}) as Record<string, unknown> }));
}

/**
 * Deterministic evaluation order: `fila` scope (0) before `tenant` (1), then older creation time, then ID for exact ties.
 */
export function ordenarRulesOfPriority(
  regras: readonly RulePriorityForEngine[],
): RulePriorityForEngine[] {
  return [...regras].sort((a, b) => {
    const pesoA = a.scopeType === 'fila' ? 0 : 1;
    const pesoB = b.scopeType === 'fila' ? 0 : 1;
    if (pesoA !== pesoB) return pesoA - pesoB;
    const diferenca = a.criadoEm.getTime() - b.criadoEm.getTime();
    return diferenca !== 0 ? diferenca : a.id.localeCompare(b.id);
  });
}

function conditionEmpty(condition: Record<string, unknown>): boolean {
  return Object.keys(condition).length === 0;
}

/** Fields offered by a newly arrived conversation, shaped like `ContextoDaConversa` in `regra-fila.ts`. */
export interface ContextOfPriority {
  queueId?: string | null;
  message?: string | null;
  contact?: {
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
    atributos?: Readonly<Record<string, unknown>>;
  };
}

/**
 * Return the first active rule whose scope and condition match, checking cheap scope first. `null` leaves `conversa.prioridade` at default `sem_prioridade`, preserving behavior without registered rules.
 */
export function avaliarPriority(
  regras: readonly RulePriorityForEngine[],
  context: ContextOfPriority,
): string | null {
  for (const regra of ordenarRulesOfPriority(regras)) {
    if (regra.scopeType === 'fila' && regra.scopeId !== (context.queueId ?? null)) continue;
    if (
      !conditionEmpty(regra.condition) &&
      !avaliarExpressao(
        regra.condition as unknown as Expressao,
        context as Readonly<Record<string, unknown>>,
      )
    ) {
      continue;
    }
    return regra.level;
  }
  return null;
}

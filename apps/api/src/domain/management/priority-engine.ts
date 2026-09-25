import { and, asc, eq } from 'drizzle-orm';
import { avaliarExpressao, type Expressao } from '@pipe/core';
import { rulePriority } from '@pipe/db/schema';
import type { TransactionPipe as TransactionPipe } from '@pipe/db';

/**
 * O motor de `regra_prioridade` — item 2 da tarefa de "fazer funcionar o que só
 * está cadastrado". `regras-prioridade.ts` tem o CRUD completo desde a tarefa
 * de cadastros, mas registrava ali mesmo a decisão de NÃO construir este
 * motor ("Decisão Pipe — sem motor": "nenhum lugar do produto hoje LÊ
 * `regra_prioridade`"). Esta tarefa pediu para ligar: agora, quando a conversa
 * entra na fila (`dominio/entrada.ts`, `dominio/fluxo.ts`), as regras ativas
 * são avaliadas nesta ordem e a primeira que casar define `conversa.prioridade`.
 *
 * **Decisão Pipe — sem coluna de ordem, ainda.** `regras-prioridade.ts`
 * também tinha registrado "Decisão Pipe — sem ordem", condicionada a
 * "primeiro sinal de que faz falta é o motor de verdade nascer". O motor
 * nasceu agora, mas ainda dá para ter uma ordem determinística SEM migração:
 * regra de escopo `fila` sempre vence a de escopo `tenant` — a MESMA
 * precedência que `escolherRegra` já usa para `regra_sla` em `sla.ts`
 * ("a de escopo de fila vence a de escopo do tenant, porque a mais específica
 * é a que o gestor configurou de propósito") — e dentro do mesmo escopo a
 * mais ANTIGA (`criado_em`) vence. Uma coluna `ordem` (como `regra_fila` já
 * tem) fica para o dia em que alguém precisar reordenar sem recriar a regra.
 *
 * **Decisão Pipe — condição vazia sempre casa.** `regra_prioridade.condicao`
 * nasce `{}` (o padrão do schema, `packages/db/src/schema/gestao.ts`). Ao
 * contrário de `regra_fila` (`regra-fila.ts`, onde "regra ativa SEM condição
 * nenhuma nunca casa", porque lá a condição é a regra INTEIRA), aqui o
 * ESCOPO já filtra a aplicabilidade — condição é um refinamento OPCIONAL por
 * cima dele. "Toda conversa desta fila nasce com nível X" é um caso de uso
 * legítimo e não deveria exigir uma condição de mentira só para casar sempre.
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
      nivel: rulePriority.nivel,
      escopoTipo: rulePriority.scopeType,
      escopoId: rulePriority.scopeId,
      condicao: rulePriority.condition,
      criadoEm: rulePriority.criadoEm,
    })
    .from(rulePriority)
    .where(and(eq(rulePriority.ativa, true)))
    .orderBy(asc(rulePriority.criadoEm), asc(rulePriority.id));
  return linhas.map((l) => ({ ...l, condicao: (l.condicao ?? {}) as Record<string, unknown> }));
}

/**
 * Ordem de avaliação, estável e testável — ver a decisão Pipe no topo do
 * arquivo. Escopo `fila` (0) antes de `tenant` (1); empate desempata pela
 * mais antiga, e um empate residual (mesmo instante) pelo id.
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

/** O que a conversa recém-chegada oferece à condição — mesmo desenho de `ContextoDaConversa` em `regra-fila.ts`. */
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
 * A primeira regra ativa que casa (escopo + condição, nesta ordem — o escopo é
 * mais barato de checar e filtra a maioria antes de avaliar a expressão).
 * `null` quando nenhuma casa: a conversa mantém `sem_prioridade`, o padrão de
 * `conversa.prioridade` — não muda o comportamento de quem não cadastrou regra.
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

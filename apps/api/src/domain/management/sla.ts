import { and, asc, eq } from 'drizzle-orm';
import { avaliarSla, alvoFulfillment, inicioDoAlvo, type AlvoSla, type Marcos } from '@pipe/core';
import { regraSla } from '@pipe/db/schema';
import type { TransactionPipe as TransactionPipe } from '@pipe/db';

/**
 * Coluna SLA do monitoramento detalhado.
 *
 * O cálculo é do `@pipe/core` (`avaliarSla`, §11 da spec). Aqui só se escolhe a
 * regra aplicável e se traduz o resultado para o rótulo da tela.
 *
 * ponytail: o relógio roda sem expediente — `horario_atendimento` ainda não é
 * semeado, então nenhuma fila tem horário para respeitar. `avaliarSla` já aceita
 * o expediente; basta passar o horário da fila quando ele existir.
 */

export interface RegraSlaCarregada {
  id: string;
  name: string;
  target: AlvoSla;
  deadlineSeg: number;
  alertSeg: number | null;
  scopeType: string;
  scopeId: string | null;
  /** `{ tipo: 'notificar_supervisor' | 'elevar_prioridade', ... }` — motor em `sla-motor.ts`. */
  acaoAlert: Record<string, unknown>;
  acaoEstouro: Record<string, unknown>;
}

export type StatePill = 'inside' | 'alert' | 'exceeded' | 'without_rule' | 'cumprido';

export interface PillSla {
  state: StatePill;
  rotulo: string;
  /** Segundos além do prazo, quando estourou. */
  excedidoSeg: number | null;
}

/** `regra_sla.alvo` do banco → alvo do `@pipe/core`. Nomes divergem por história. */
const TARGET_OF_DATABASE: Record<string, AlvoSla | null> = {
  primeira_resposta: 'primeira_resposta',
  resposta: 'tempo_resposta',
  resolucao: 'encerramento',
  // `espera_fila` não tem equivalente no core e por isso não vira pill.
  espera_fila: null,
};

export async function carregarRegrasSla(tx: TransactionPipe): Promise<RegraSlaCarregada[]> {
  const linhas = await tx
    .select({
      id: regraSla.id,
      nome: regraSla.nome,
      alvo: regraSla.alvo,
      prazoSeg: regraSla.prazoSeg,
      alertaSeg: regraSla.alertaSeg,
      escopoTipo: regraSla.escopoTipo,
      escopoId: regraSla.escopoId,
      acaoAlerta: regraSla.acaoAlerta,
      acaoEstouro: regraSla.acaoEstouro,
    })
    .from(regraSla)
    .where(and(eq(regraSla.ativa, true)))
    .orderBy(asc(regraSla.nome));

  return linhas.flatMap((l) => {
    const alvo = TARGET_OF_DATABASE[l.alvo] ?? null;
    if (!alvo) return [];
    return [
      {
        ...l,
        alvo,
        acaoAlerta: (l.acaoAlerta ?? {}) as Record<string, unknown>,
        acaoEstouro: (l.acaoEstouro ?? {}) as Record<string, unknown>,
      },
    ];
  });
}

const SEM_REGRA: PillSla = { state: 'without_rule', rotulo: '—', excedidoSeg: null };

/**
 * Regra aplicável: a de escopo de fila vence a de escopo do tenant, porque a mais
 * específica é a que o gestor configurou de propósito.
 */
function escolherRegra(
  regras: readonly RegraSlaCarregada[],
  queueId: string | null,
): RegraSlaCarregada | null {
  const ofQueue = regras.find((r) => r.scopeType === 'fila' && r.scopeId === queueId);
  return ofQueue ?? regras.find((r) => r.scopeType === 'tenant') ?? null;
}

export function avaliarSlaOfConversation(
  regras: readonly RegraSlaCarregada[],
  marcos: Marcos,
  filaId: string | null,
  agora: Date,
): PillSla {
  const regra = escolherRegra(regras, filaId);
  if (!regra) return SEM_REGRA;

  const inicio = inicioDoAlvo(regra.target, marcos);
  if (!inicio) return SEM_REGRA;

  const cumpridoEm = alvoFulfillment(regra.target, marcos);
  const r = avaliarSla({
    regra: { prazoSeg: regra.deadlineSeg, alertaSeg: regra.alertSeg },
    inicio,
    agora,
    cumpridoEm,
  });

  if (r.state === 'exceeded') {
    return {
      state: 'exceeded',
      rotulo: 'ESTOUROU',
      excedidoSeg: r.decorridoSeg - regra.deadlineSeg,
    };
  }
  if (r.cumprido) return { state: 'cumprido', rotulo: 'CUMPRIDO', excedidoSeg: null };
  if (r.state === 'alert') return { state: 'alert', rotulo: 'ALERTA', excedidoSeg: null };
  return { state: 'inside', rotulo: 'DENTRO', excedidoSeg: null };
}

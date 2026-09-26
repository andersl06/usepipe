import { and, asc, eq } from 'drizzle-orm';
import { avaliarSla, targetFulfillment, inicioDoAlvo, type AlvoSla, type Marcos } from '@pipe/core';
import { regraSla } from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';

/**
 * SLA column for detailed monitoring. `@pipe/core` computes the SLA through `avaliarSla` (spec §11); this layer selects the applicable rule and maps the result to the screen label. ponytail: the clock currently runs outside business hours because `horario_atendimento` is not seeded. Once queues have schedules, pass the queue schedule to `avaliarSla`, which already supports it.
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
  /** Seconds past the deadline when breached. */
  excedidoSeg: number | null;
}

/** Map database `regra_sla.alvo` to the `@pipe/core` target; names differ for historical reasons. */
const TARGET_OF_DATABASE: Record<string, AlvoSla | null> = {
  primeira_resposta: 'primeira_resposta',
  resposta: 'tempo_resposta',
  resolucao: 'encerramento',
  // `espera_fila` has no core equivalent and therefore gets no pill.
  espera_fila: null,
};

export async function carregarRegrasSla(tx: TransactionPipe): Promise<RegraSlaCarregada[]> {
  const linhas = await tx
    .select({
      id: regraSla.id,
      name: regraSla.nome,
      alvo: regraSla.alvo,
      deadlineSeg: regraSla.prazoSeg,
      alertSeg: regraSla.alertaSeg,
      scopeType: regraSla.escopoTipo,
      scopeId: regraSla.escopoId,
      acaoAlert: regraSla.acaoAlerta,
      acaoEstouro: regraSla.acaoEstouro,
    })
    .from(regraSla)
    .where(and(eq(regraSla.ativa, true)))
    .orderBy(asc(regraSla.nome));

  return linhas.flatMap((l) => {
    const target = TARGET_OF_DATABASE[l.alvo] ?? null;
    if (!target) return [];
    const { alvo: _alvo, ...resto } = l;
    return [
      {
        ...resto,
        target,
        acaoAlert: (l.acaoAlert ?? {}) as Record<string, unknown>,
        acaoEstouro: (l.acaoEstouro ?? {}) as Record<string, unknown>,
      },
    ];
  });
}

const SEM_REGRA: PillSla = { state: 'without_rule', rotulo: '—', excedidoSeg: null };

/**
 * A queue-scoped rule overrides a tenant-scoped rule because it is the more specific rule deliberately configured by the manager.
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

  const cumpridoEm = targetFulfillment(regra.target, marcos);
  const r = avaliarSla({
    regra: { prazoSeg: regra.deadlineSeg, alertaSeg: regra.alertSeg },
    inicio,
    agora,
    cumpridoEm,
  });

  if (r.state === 'estourado') {
    return {
      state: 'exceeded',
      rotulo: 'ESTOUROU',
      excedidoSeg: r.decorridoSeg - regra.deadlineSeg,
    };
  }
  if (r.cumprido) return { state: 'cumprido', rotulo: 'CUMPRIDO', excedidoSeg: null };
  if (r.state === 'alerta') return { state: 'alert', rotulo: 'ALERTA', excedidoSeg: null };
  return { state: 'inside', rotulo: 'DENTRO', excedidoSeg: null };
}

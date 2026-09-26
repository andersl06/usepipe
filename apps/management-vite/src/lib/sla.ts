import { avaliarSla, targetFulfillment, inicioDoAlvo, type AlvoSla, type Marcos } from '@pipe/core';

/**
 * Detailed Monitoring SLA uses `@pipe/core` `avaliarSla` (metrics spec Section 11); this module selects the applicable rule and maps the result to screen text. Ponytail: the clock currently ignores working hours because `horario_atendimento` is not seeded, so no queue has a schedule to honor. `avaliarSla` already accepts hours; pass the queue schedule when available.
 */

export interface RegraSlaCarregada {
  id: string;
  nome: string;
  alvo: AlvoSla;
  prazoSeg: number;
  alertaSeg: number | null;
  scopeType: string;
  scopeId: string | null;
}

export type StatePill = 'dentro' | 'alerta' | 'estourado' | 'sem_regra' | 'cumprido';

export interface PillSla {
  state: StatePill;
  rotulo: string;
  /** Seconds beyond the SLA deadline when breached. */
  excedidoSeg: number | null;
}

const SEM_REGRA: PillSla = { state: 'sem_regra', rotulo: '—', excedidoSeg: null };

/**
 * A queue-scoped rule beats a tenant-scoped one because the manager deliberately configured the more specific rule.
 */
function escolherRegra(
  regras: readonly RegraSlaCarregada[],
  queueId: string | null,
): RegraSlaCarregada | null {
  const ofQueue = regras.find((r) => r.scopeType === 'fila' && r.scopeId === queueId);
  return ofQueue ?? regras.find((r) => r.scopeType === 'tenant') ?? null;
}

export function conversationEvaluateSla(
  regras: readonly RegraSlaCarregada[],
  marcos: Marcos,
  queueId: string | null,
  agora: Date,
): PillSla {
  const regra = escolherRegra(regras, queueId);
  if (!regra) return SEM_REGRA;

  const inicio = inicioDoAlvo(regra.alvo, marcos);
  if (!inicio) return SEM_REGRA;

  const cumpridoEm = targetFulfillment(regra.alvo, marcos);
  const r = avaliarSla({
    regra: { prazoSeg: regra.prazoSeg, alertaSeg: regra.alertaSeg },
    inicio,
    agora,
    cumpridoEm,
  });

  if (r.state === 'exceeded') {
    return {
      state: 'estourado',
      rotulo: 'ESTOUROU',
      excedidoSeg: r.decorridoSeg - regra.prazoSeg,
    };
  }
  if (r.cumprido) return { state: 'cumprido', rotulo: 'CUMPRIDO', excedidoSeg: null };
  if (r.state === 'alert') return { state: 'alerta', rotulo: 'ALERTA', excedidoSeg: null };
  return { state: 'dentro', rotulo: 'DENTRO', excedidoSeg: null };
}

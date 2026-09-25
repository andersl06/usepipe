import { avaliarSla, alvoFulfillment, inicioDoAlvo, type AlvoSla, type Marcos } from '@pipe/core';

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
  /** Segundos além do prazo, quando estourou. */
  excedidoSeg: number | null;
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

export function conversationAvaliarSla(
  regras: readonly RegraSlaCarregada[],
  marcos: Marcos,
  queueId: string | null,
  agora: Date,
): PillSla {
  const regra = escolherRegra(regras, queueId);
  if (!regra) return SEM_REGRA;

  const inicio = inicioDoAlvo(regra.alvo, marcos);
  if (!inicio) return SEM_REGRA;

  const cumpridoEm = alvoFulfillment(regra.alvo, marcos);
  const r = avaliarSla({
    regra: { prazoSeg: regra.prazoSeg, alertaSeg: regra.alertaSeg },
    inicio,
    agora,
    cumpridoEm,
  });

  if (r.state === 'exceeded') {
    return {
      state: 'exceeded',
      rotulo: 'ESTOUROU',
      excedidoSeg: r.decorridoSeg - regra.prazoSeg,
    };
  }
  if (r.cumprido) return { state: 'cumprido', rotulo: 'CUMPRIDO', excedidoSeg: null };
  if (r.state === 'alert') return { state: 'alert', rotulo: 'ALERTA', excedidoSeg: null };
  return { state: 'inside', rotulo: 'DENTRO', excedidoSeg: null };
}

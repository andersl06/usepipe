import { avaliarSla, cumprimentoDoAlvo, inicioDoAlvo, type AlvoSla, type Marcos } from '@pipe/core';

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
  escopoTipo: string;
  escopoId: string | null;
}

export type EstadoPill = 'dentro' | 'alerta' | 'estourado' | 'sem_regra' | 'cumprido';

export interface PillSla {
  estado: EstadoPill;
  rotulo: string;
  /** Segundos além do prazo, quando estourou. */
  excedidoSeg: number | null;
}

const SEM_REGRA: PillSla = { estado: 'sem_regra', rotulo: '—', excedidoSeg: null };

/**
 * Regra aplicável: a de escopo de fila vence a de escopo do tenant, porque a mais
 * específica é a que o gestor configurou de propósito.
 */
function escolherRegra(
  regras: readonly RegraSlaCarregada[],
  filaId: string | null,
): RegraSlaCarregada | null {
  const daFila = regras.find((r) => r.escopoTipo === 'fila' && r.escopoId === filaId);
  return daFila ?? regras.find((r) => r.escopoTipo === 'tenant') ?? null;
}

export function avaliarSlaDaConversa(
  regras: readonly RegraSlaCarregada[],
  marcos: Marcos,
  filaId: string | null,
  agora: Date,
): PillSla {
  const regra = escolherRegra(regras, filaId);
  if (!regra) return SEM_REGRA;

  const inicio = inicioDoAlvo(regra.alvo, marcos);
  if (!inicio) return SEM_REGRA;

  const cumpridoEm = cumprimentoDoAlvo(regra.alvo, marcos);
  const r = avaliarSla({
    regra: { prazoSeg: regra.prazoSeg, alertaSeg: regra.alertaSeg },
    inicio,
    agora,
    cumpridoEm,
  });

  if (r.estado === 'estourado') {
    return {
      estado: 'estourado',
      rotulo: 'ESTOUROU',
      excedidoSeg: r.decorridoSeg - regra.prazoSeg,
    };
  }
  if (r.cumprido) return { estado: 'cumprido', rotulo: 'CUMPRIDO', excedidoSeg: null };
  if (r.estado === 'alerta') return { estado: 'alerta', rotulo: 'ALERTA', excedidoSeg: null };
  return { estado: 'dentro', rotulo: 'DENTRO', excedidoSeg: null };
}

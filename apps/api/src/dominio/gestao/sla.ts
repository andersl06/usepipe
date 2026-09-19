import { and, asc, eq } from 'drizzle-orm';
import { avaliarSla, cumprimentoDoAlvo, inicioDoAlvo, type AlvoSla, type Marcos } from '@pipe/core';
import { regraSla } from '@pipe/db/schema';
import type { TransacaoPipe } from '@pipe/db';

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
  /** `{ tipo: 'notificar_supervisor' | 'elevar_prioridade', ... }` — motor em `sla-motor.ts`. */
  acaoAlerta: Record<string, unknown>;
  acaoEstouro: Record<string, unknown>;
}

export type EstadoPill = 'dentro' | 'alerta' | 'estourado' | 'sem_regra' | 'cumprido';

export interface PillSla {
  estado: EstadoPill;
  rotulo: string;
  /** Segundos além do prazo, quando estourou. */
  excedidoSeg: number | null;
}

/** `regra_sla.alvo` do banco → alvo do `@pipe/core`. Nomes divergem por história. */
const ALVO_DO_BANCO: Record<string, AlvoSla | null> = {
  primeira_resposta: 'primeira_resposta',
  resposta: 'tempo_resposta',
  resolucao: 'encerramento',
  // `espera_fila` não tem equivalente no core e por isso não vira pill.
  espera_fila: null,
};

export async function carregarRegrasSla(tx: TransacaoPipe): Promise<RegraSlaCarregada[]> {
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
    const alvo = ALVO_DO_BANCO[l.alvo] ?? null;
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

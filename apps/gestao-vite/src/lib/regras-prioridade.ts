import { NIVEIS_ATRIBUIVEIS, ROTULOS_PRIORIDADE, type NivelPrioridade } from '@pipe/core/conversa';

/**
 * As regras de priorização como a seção "Regras de Priorização" da página de
 * edição de fila precisa delas (`FICHA-atendentes-filas-pausas.md` §a.3).
 *
 * A rota `GET /v1/gestao/regras/prioridade` devolve as regras do tenant
 * INTEIRO — `regra_prioridade` tem `escopo_tipo` (`tenant`|`fila`) e
 * `escopo_id`. A seção da fila mostra as do escopo `fila` cujo `escopoId` é
 * esta fila; as de escopo `tenant` valem para todas e não são desta seção.
 *
 * Módulo PURO (sem `./api`, sem JSX): é o que deixa
 * `tests/regras-prioridade.test.ts` rodar com `node --test` + `tsx`.
 */

export interface RegraDePrioridade {
  id: string;
  nome: string;
  nivel: string;
  escopoTipo: string;
  escopoId: string | null;
  condicao: Record<string, unknown>;
  ativa: boolean;
}

export { NIVEIS_ATRIBUIVEIS };

/** O degrau em português — `ROTULOS_PRIORIDADE` do core, sem mapa paralelo. */
export function rotuloDoNivel(nivel: string): string {
  return ROTULOS_PRIORIDADE[nivel as NivelPrioridade] ?? nivel;
}

/** Só as regras desta fila, na ordem em que a API já as devolve (por nome). */
export function regrasDaFila(
  regras: readonly RegraDePrioridade[],
  filaId: string,
): RegraDePrioridade[] {
  return regras.filter((r) => r.escopoTipo === 'fila' && r.escopoId === filaId);
}

/** As do tenant — valem para esta fila também, mas não se editam aqui. */
export function regrasDoTenant(regras: readonly RegraDePrioridade[]): RegraDePrioridade[] {
  return regras.filter((r) => r.escopoTipo === 'tenant');
}

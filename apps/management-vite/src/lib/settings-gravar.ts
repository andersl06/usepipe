import { api } from './api';
import { atualizarLeituras } from './actions';
import { motivoDe, type Resultado } from './rest';

/**
 * Write `regra_sla` through real `POST`/`PATCH`/`DELETE` at `/v1/gestao/configuracoes/regras`; `regras-sla.tsx` was previously read-only (its `TODO(escrita)` was removed). Keep `api` calls here and reading types in `configuracoes.ts`, as with `cadastros.ts` and `cadastros-gravar.ts`.
 */

export interface PedidoDeRegraSla {
  nome: string;
  alvo: string;
  prazoSeg: number;
  alertaSeg?: number | null;
  scopeType?: string;
  scopeId?: string | null;
  active?: boolean;
}

export type RequestOfEditOfRuleSla = Partial<PedidoDeRegraSla>;

export async function createRuleSla(pedido: PedidoDeRegraSla): Promise<Resultado<{ id: string }>> {
  try {
    const criada = await api.post<{ id: string }>('/v1/management/settings/rules', pedido);
    atualizarLeituras();
    return { ok: true, value: criada };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível criar a regra de SLA.') };
  }
}

export async function editarRegraSla(
  id: string,
  pedido: RequestOfEditOfRuleSla,
): Promise<Resultado<void>> {
  try {
    await api.patch(`/v1/management/settings/rules/${id}`, pedido);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível editar a regra de SLA.') };
  }
}

export async function excluirRegraSla(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/management/settings/rules/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a regra de SLA.') };
  }
}

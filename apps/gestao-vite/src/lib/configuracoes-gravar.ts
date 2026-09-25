import { api } from './api';
import { atualizarLeituras } from './acoes';
import { motivoDe, type Resultado } from './rest';

/**
 * Escrita de `regra_sla` (item 2) — `POST`/`PATCH`/`DELETE` de verdade em
 * `/v1/gestao/configuracoes/regras`, a tela `regras-sla.tsx` que só tinha
 * leitura (`TODO(escrita)` removido de lá). Arquivo À PARTE de
 * `configuracoes.ts`, no mesmo padrão de `cadastros.ts`/`cadastros-gravar.ts`:
 * lá ficam os TIPOS de leitura, aqui a chamada à `api`.
 */

export interface PedidoDeRegraSla {
  nome: string;
  alvo: string;
  prazoSeg: number;
  alertaSeg?: number | null;
  scopeTipo?: string;
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

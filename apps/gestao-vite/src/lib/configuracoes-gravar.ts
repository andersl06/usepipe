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
  escopoTipo?: string;
  escopoId?: string | null;
  ativa?: boolean;
}

export type PedidoDeEdicaoDeRegraSla = Partial<PedidoDeRegraSla>;

export async function criarRegraSla(pedido: PedidoDeRegraSla): Promise<Resultado<{ id: string }>> {
  try {
    const criada = await api.post<{ id: string }>('/v1/gestao/configuracoes/regras', pedido);
    atualizarLeituras();
    return { ok: true, valor: criada };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível criar a regra de SLA.') };
  }
}

export async function editarRegraSla(
  id: string,
  pedido: PedidoDeEdicaoDeRegraSla,
): Promise<Resultado<void>> {
  try {
    await api.patch(`/v1/gestao/configuracoes/regras/${id}`, pedido);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível editar a regra de SLA.') };
  }
}

export async function excluirRegraSla(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/gestao/configuracoes/regras/${id}`);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível excluir a regra de SLA.') };
  }
}

import type { PedidoDeServico, ServicoVinculado } from '@pipe/contracts';
import { api } from '../../../lib/api';
import { atualizarLeituras } from '../../../lib/acoes';
import { motivoDe, type Resultado } from '../configuracoes/basicas/gravar';

/**
 * As escritas de Serviços: `POST`, `PATCH` e `DELETE` em
 * `/v1/gestao/fluxos/:id/servicos`. A regra mora na `api`
 * (`dominio/gestao/servicos-do-roteador.ts`); a recusa volta como texto.
 */

export async function salvarServico(
  roteadorId: string,
  servicoId: string | null,
  pedido: PedidoDeServico,
): Promise<Resultado<ServicoVinculado>> {
  const caminho = `/v1/gestao/fluxos/${roteadorId}/servicos`;
  try {
    const valor = servicoId
      ? await api.patch<ServicoVinculado>(`${caminho}/${servicoId}`, pedido)
      : await api.post<ServicoVinculado>(caminho, pedido);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Ocorreu um erro ao salvar o serviço') };
  }
}

export async function excluirServico(
  roteadorId: string,
  servicoId: string,
): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/gestao/fluxos/${roteadorId}/servicos/${servicoId}`);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Ocorreu um erro ao excluir o serviço') };
  }
}

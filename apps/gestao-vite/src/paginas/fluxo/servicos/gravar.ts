import type { RequestOfService, LinkedService } from '@pipe/contracts';
import { api } from '../../../lib/api';
import { atualizarLeituras } from '../../../lib/acoes';
import { motivoDe, type Resultado } from '../configuracoes/basicas/gravar';

/**
 * As escritas de Serviços: `POST`, `PATCH` e `DELETE` em
 * `/v1/gestao/fluxos/:id/servicos`. A regra mora na `api`
 * (`dominio/gestao/servicos-do-roteador.ts`); a recusa volta como texto.
 */

export async function salvarService(
  routerId: string,
  serviceId: string | null,
  pedido: RequestOfService,
): Promise<Resultado<LinkedService>> {
  const caminho = `/v1/gestao/fluxos/${routerId}/servicos`;
  try {
    const value = serviceId
      ? await api.patch<LinkedService>(`${caminho}/${serviceId}`, pedido)
      : await api.post<LinkedService>(caminho, pedido);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao salvar o serviço') };
  }
}

export async function excluirService(
  routerId: string,
  serviceId: string,
): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/gestao/fluxos/${routerId}/servicos/${serviceId}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao excluir o serviço') };
  }
}

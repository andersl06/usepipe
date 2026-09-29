import type { RequestOfService, LinkedService } from '@pipe/contracts';
import { api } from '@pipe/ui/api';
import { atualizarLeituras } from '../../../lib/actions';
import { motivoDe, type Resultado } from '../settings/basic/gravar';

/**
 * Services writes: `POST`, `PATCH` and `DELETE` on `/v1/gestao/fluxos/:id/servicos`. The rule lives in the `api` (`dominio/gestao/servicos-do-roteador.ts`); a refusal comes back as text.
 */

export async function saveService(
  routerId: string,
  serviceId: string | null,
  pedido: RequestOfService,
): Promise<Resultado<LinkedService>> {
  const caminho = `/v1/management/flows/${routerId}/services`;
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

export async function deleteService(
  routerId: string,
  serviceId: string,
): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/management/flows/${routerId}/services/${serviceId}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao excluir o serviço') };
  }
}

import { api } from '@pipe/ui/api';
import { atualizarLeituras } from '../../../../lib/actions';
import { motivoDe } from '../basic/gravar';
import type { ConfigurationOfMenuPersistent, ItemDoMenuPersistente } from '@pipe/contracts';

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/menu-persistente`. The rule (Messenger channel, boas-vindas filled in, up to 3 items) lives in the `api` (`dominio/gestao/configuracao-do-fluxo.ts`); here only the rejection becomes text.
 */

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

export async function salvarMenuPersistente(
  id: string,
  itens: ItemDoMenuPersistente[],
): Promise<Resultado<ConfigurationOfMenuPersistent>> {
  try {
    const value = await api.patch<ConfigurationOfMenuPersistent>(
      `/v1/management/flows/${id}/menu-persistent`,
      { itens },
    );
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao salvar a configuração') };
  }
}

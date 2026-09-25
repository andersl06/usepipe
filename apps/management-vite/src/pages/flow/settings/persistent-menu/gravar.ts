import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/actions';
import { motivoDe } from '../basic/gravar';
import type { ConfigurationOfMenuPersistent, ItemDoMenuPersistente } from '@pipe/contracts';

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/menu-persistente`. A regra (canal
 * Messenger, boas-vindas preenchida, até 3 itens) mora na `api`
 * (`dominio/gestao/configuracao-do-fluxo.ts`); aqui só a recusa vira texto.
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

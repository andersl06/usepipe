import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { motivoDe } from '../basicas/gravar';
import type { ConfiguracaoDeMenuPersistente, ItemDoMenuPersistente } from '@pipe/contracts';

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/menu-persistente`. A regra (canal
 * Messenger, boas-vindas preenchida, até 3 itens) mora na `api`
 * (`dominio/gestao/configuracao-do-fluxo.ts`); aqui só a recusa vira texto.
 */

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

export async function salvarMenuPersistente(
  id: string,
  itens: ItemDoMenuPersistente[],
): Promise<Resultado<ConfiguracaoDeMenuPersistente>> {
  try {
    const valor = await api.patch<ConfiguracaoDeMenuPersistente>(
      `/v1/gestao/fluxos/${id}/menu-persistente`,
      { itens },
    );
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Ocorreu um erro ao salvar a configuração') };
  }
}

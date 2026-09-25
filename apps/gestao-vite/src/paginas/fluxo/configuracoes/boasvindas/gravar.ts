import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { motivoDe } from '../basicas/gravar';
import type { ConfigurationOfWelcome } from '@pipe/contracts';

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/boas-vindas`. A regra mora na `api`
 * (`dominio/gestao/configuracao-do-fluxo.ts`); aqui só a recusa vira texto.
 */

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

export async function salvarBoasVindas(
  id: string,
  pedido: { ativo: boolean; message?: string; textoBotao?: string },
): Promise<Resultado<ConfigurationOfWelcome>> {
  try {
    const value = await api.patch<ConfigurationOfWelcome>(
      `/v1/management/flows/${id}/welcome`,
      pedido,
    );
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao salvar a configuração') };
  }
}

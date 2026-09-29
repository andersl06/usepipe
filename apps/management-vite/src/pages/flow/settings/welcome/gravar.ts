import { api } from '@pipe/ui/api';
import { atualizarLeituras } from '../../../../lib/actions';
import { motivoDe } from '../basic/gravar';
import type { ConfigurationOfWelcome } from '@pipe/contracts';

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/boas-vindas`. The rule lives in the `api` (`dominio/gestao/configuracao-do-fluxo.ts`); here only the rejection becomes text.
 */

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

export async function salvarBoasVindas(
  id: string,
  pedido: { ativo: boolean; message?: string; textoBotao?: string },
): Promise<Resultado<ConfigurationOfWelcome>> {
  try {
    const value = await api.patch<ConfigurationOfWelcome>(
      `/v1/management/flows/${id}/welcome`,
      { active: pedido.ativo, message: pedido.message, textoBotao: pedido.textoBotao },
    );
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao salvar a configuração') };
  }
}

import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { motivoDe } from '../basicas/gravar';
import type { ConfiguracaoDeBoasVindas } from '@pipe/contracts';

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/boas-vindas`. A regra mora na `api`
 * (`dominio/gestao/configuracao-do-fluxo.ts`); aqui só a recusa vira texto.
 */

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

export async function salvarBoasVindas(
  id: string,
  pedido: { ativo: boolean; mensagem?: string; textoBotao?: string },
): Promise<Resultado<ConfiguracaoDeBoasVindas>> {
  try {
    const valor = await api.patch<ConfiguracaoDeBoasVindas>(
      `/v1/gestao/fluxos/${id}/boas-vindas`,
      pedido,
    );
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Ocorreu um erro ao salvar a configuração') };
  }
}

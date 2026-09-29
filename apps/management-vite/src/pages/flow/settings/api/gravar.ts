import { api } from '@pipe/ui/api';
import { atualizarLeituras } from '../../../../lib/actions';
import { motivoDe } from '../basic/gravar';

/**
 * `GET/PUT /v1/gestao/fluxos/:id/conexao` — the read and the only real write of "Informações de conexão" (`dominio/gestao/integracoes.ts`): the "Conectar usando HTTP" card URLs become `webhook_saida`, one per event set.
 */
export interface FlowConnection {
  flowId: string;
  endpoint: string;
  keyPrefix: string | null;
  urlMessages: string | null;
  urlNotifications: string | null;
}

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

export async function salvarConexao(
  flowId: string,
  pedido: { urlMessages?: string | null; urlNotifications?: string | null },
): Promise<Resultado<FlowConnection>> {
  try {
    const value = await api.put<FlowConnection>(`/v1/management/flows/${flowId}/connection`, pedido);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar a configuração de conexão.') };
  }
}

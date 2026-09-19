import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { motivoDe } from '../basicas/gravar';

/**
 * `GET/PUT /v1/gestao/fluxos/:id/conexao` — a leitura e a única escrita real
 * de "Informações de conexão" (`dominio/gestao/integracoes.ts`): as URLs do
 * cartão "Conectar usando HTTP" viram `webhook_saida`, um por conjunto de
 * eventos.
 */
export interface ConexaoDoFluxo {
  fluxoId: string;
  endpoint: string;
  chavePrefixo: string | null;
  urlMensagens: string | null;
  urlNotificacoes: string | null;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

export async function salvarConexao(
  fluxoId: string,
  pedido: { urlMensagens?: string | null; urlNotificacoes?: string | null },
): Promise<Resultado<ConexaoDoFluxo>> {
  try {
    const valor = await api.put<ConexaoDoFluxo>(`/v1/gestao/fluxos/${fluxoId}/conexao`, pedido);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível salvar a configuração de conexão.') };
  }
}

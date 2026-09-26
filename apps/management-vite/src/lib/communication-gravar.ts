import { api } from './api';
import { atualizarLeituras } from './actions';
import { motivoDe, type Resultado } from './rest';

/**
 * Write real ready-reply `PATCH`/`DELETE` at `/v1/gestao/comunicacao/respostas-prontas/:id`, unlike `acoes.ts` which only has creator `salvarRespostaPronta`. Keep this separate from pure `comunicacao.ts`: `tests/comunicacao.test.ts` imports `cabecalhoTemMidia` and `headerOffset` under `node --test` without Vite, whereas `./api` reads `import.meta.env`.
 */

/** O interruptor do cartão-linha: liga/desliga sem abrir formulário. */
export async function alternarRespostaPronta(id: string, active: boolean): Promise<Resultado<void>> {
  try {
    await api.patch(`/v1/management/communication/responses-ready/${id}`, { ativa: !active });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível alterar a resposta.') };
  }
}

export async function excluirRespostaPronta(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/management/communication/responses-ready/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a resposta.') };
  }
}

import { api } from './api';
import { atualizarLeituras } from './acoes';
import { motivoDe, type Resultado } from './rest';

/**
 * Escrita de respostas prontas — `PATCH`/`DELETE` de verdade em
 * `/v1/gestao/comunicacao/respostas-prontas/:id`, diferente de `acoes.ts`
 * (que só tem `salvarRespostaPronta`, a criação).
 *
 * Arquivo À PARTE de `comunicacao.ts`, que é módulo PURO: `tests/comunicacao.test.ts`
 * importa `cabecalhoTemMidia`/`deslocamentoDoCabecalho` de lá com `node --test`,
 * sem Vite — e `./api` lê `import.meta.env`, que não existe fora dele. Foi
 * exatamente isso que quebrou o teste na primeira versão desta função.
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

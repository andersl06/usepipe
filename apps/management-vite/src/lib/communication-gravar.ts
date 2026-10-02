import { api } from '@pipe/ui/api';
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

const RESPOSTAS = '/v1/management/communication/responses-ready';
const CATEGORIAS = '/v1/management/communication/response-categories';

export async function criarRespostaPronta(corpo: {
  shortcut: string;
  title: string;
  body: string;
  category: string | null;
}): Promise<Resultado<{ id: string }>> {
  try {
    const criada = await api.post<{ id: string }>(RESPOSTAS, corpo);
    atualizarLeituras();
    return { ok: true, value: criada };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar a resposta.') };
  }
}

export async function editarRespostaPronta(
  id: string,
  corpo: { shortcut?: string; title?: string; body?: string; ativa?: boolean },
): Promise<Resultado<void>> {
  try {
    await api.patch(`${RESPOSTAS}/${id}`, corpo);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar a resposta.') };
  }
}

export async function renomearCategoriaDeRespostas(name: string, newName: string): Promise<Resultado<void>> {
  try {
    await api.patch(CATEGORIAS, { name, newName });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível renomear a categoria.') };
  }
}

export async function excluirCategoriaDeRespostas(name: string): Promise<Resultado<void>> {
  try {
    await api.delete(`${CATEGORIAS}?name=${encodeURIComponent(name)}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a categoria.') };
  }
}

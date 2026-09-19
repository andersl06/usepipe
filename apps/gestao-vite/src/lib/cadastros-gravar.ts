import { api } from './api';
import { atualizarLeituras } from './acoes';
import { motivoDe, type Resultado } from './rest';

/**
 * Escrita de filas e pausas — `PATCH`/`DELETE` de verdade em
 * `/v1/gestao/atendentes/{filas,pausas}/:id`, diferente de `acoes.ts` (que só
 * tem `salvarFila`/`salvarMotivoPausa`, a criação). Mesmo formato de
 * `paginas/fluxo/configuracoes/basicas/gravar.ts`.
 *
 * Arquivo À PARTE de `cadastros.ts`, que é módulo PURO — `tests/cadastros.test.ts`
 * (se um dia existir, como já existe `tests/comunicacao.test.ts`) importaria
 * `./api`, que lê `import.meta.env` e quebra fora do Vite (é o que aconteceu
 * com `comunicacao.ts` até esta função ganhar arquivo próprio).
 */

/** O interruptor do cartão-linha: liga/desliga sem abrir formulário. */
export async function alternarFila(id: string, ativa: boolean): Promise<Resultado<void>> {
  try {
    await api.patch(`/v1/gestao/atendentes/filas/${id}`, { ativa: !ativa });
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível alterar a fila.') };
  }
}

export async function excluirFila(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/gestao/atendentes/filas/${id}`);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível excluir a fila.') };
  }
}

export async function alternarMotivoPausa(id: string, ativo: boolean): Promise<Resultado<void>> {
  try {
    await api.patch(`/v1/gestao/atendentes/pausas/${id}`, { ativo: !ativo });
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível alterar o motivo.') };
  }
}

export async function excluirMotivoPausa(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/gestao/atendentes/pausas/${id}`);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível excluir o motivo.') };
  }
}

import { api, ErroDaApi } from './api';
import { atualizarLeituras } from './acoes';
import { motivoDe, type Resultado } from './rest';
import type { OperadorDeRegra } from './regra-fila';

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

/**
 * `Resultado` que também aponta o campo — o `{erro:{codigo,mensagem,
 * detalhe?:{campo}}}` da tarefa, para o modal "Editar fila" mostrar a recusa
 * no campo certo em vez de um aviso solto. `editarFila`/`vincularAtendenteNaFila`
 * de hoje (`apps/api/src/dominio/gestao/cadastros.ts`) não mandam
 * `detalhe.campo` — só o `codigo` diz qual campo é (`nome_obrigatorio`/
 * `nome_em_uso` → nome, `capacidade_invalida` → capacidadeOverride) —, por
 * isso o mapa abaixo cobre o que falta; se um dia a `api` mandar
 * `detalhe.campo`, ele já é lido primeiro.
 */
export type ResultadoComCampo<T> = { ok: true; valor: T } | { ok: false; erro: string; campo?: string };

const CAMPO_DO_CODIGO: Record<string, string> = {
  nome_obrigatorio: 'nome',
  nome_em_uso: 'nome',
  capacidade_invalida: 'capacidadeOverride',
};

function falhaComCampo<T>(erro: unknown, padrao: string): ResultadoComCampo<T> {
  if (erro instanceof ErroDaApi) {
    const corpo = erro.corpo as
      | { erro?: { codigo?: unknown; mensagem?: unknown; detalhe?: { campo?: unknown } } }
      | null;
    const codigo = corpo?.erro?.codigo;
    const mensagem = corpo?.erro?.mensagem;
    const campoDoDetalhe = corpo?.erro?.detalhe?.campo;
    const campo =
      (typeof campoDoDetalhe === 'string' ? campoDoDetalhe : undefined) ??
      (typeof codigo === 'string' ? CAMPO_DO_CODIGO[codigo] : undefined);
    return {
      ok: false,
      erro: typeof mensagem === 'string' && mensagem ? mensagem : padrao,
      ...(campo ? { campo } : {}),
    };
  }
  return { ok: false, erro: padrao };
}

/**
 * Editar a fila — `PATCH /v1/gestao/atendentes/filas/:id`.
 *
 * Os quatro campos do meio entraram quando "Dados da fila" mudou do modal de
 * criação para a página de edição (`FICHA-atendentes-filas-pausas.md` §a.2):
 * `cadastros.PedidoDeEdicaoDeFila` da `api` já os aceitava, só a tela não os
 * mandava.
 */
export interface PedidoDeEdicaoDeFila {
  nome?: string;
  cor?: string | null;
  horarioId?: string | null;
  capacidadePadrao?: number;
  ordem?: number;
  ativa?: boolean;
}

export async function editarFila(
  id: string,
  pedido: PedidoDeEdicaoDeFila,
): Promise<ResultadoComCampo<void>> {
  try {
    await api.patch(`/v1/gestao/atendentes/filas/${id}`, pedido);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return falhaComCampo(erro, 'Não foi possível renomear a fila.');
  }
}

/** Vincular atendente à fila — `POST .../filas/:id/atendentes`. Capacidade omitida usa a padrão da fila. */
export async function vincularAtendenteNaFila(
  filaId: string,
  atendenteId: string,
  capacidadeOverride?: number | null,
): Promise<ResultadoComCampo<void>> {
  try {
    await api.post(`/v1/gestao/atendentes/filas/${filaId}/atendentes`, {
      usuarioId: atendenteId,
      ...(capacidadeOverride != null ? { capacidadeOverride } : {}),
    });
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return falhaComCampo(erro, 'Não foi possível vincular o atendente.');
  }
}

/** Desvincular atendente da fila — `DELETE .../filas/:id/atendentes/:atendenteId`. */
export async function desvincularAtendenteDaFila(
  filaId: string,
  atendenteId: string,
): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/gestao/atendentes/filas/${filaId}/atendentes/${atendenteId}`);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível desvincular o atendente.') };
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

/**
 * Escrita da regra de atendimento (item 1, segunda parte) — `PATCH`/`DELETE`
 * de verdade em `/v1/gestao/regras/atendimento/:id`, ao lado de
 * `salvarRegraFila`/`alternarRegraFila` (`lib/acoes.ts`, a criação e o
 * interruptor). REORDENAR não tem função própria: é este mesmo `editarRegraFila`
 * chamado só com `{ ordem }` — a página manda um PATCH por linha movida.
 */
export interface PedidoDeEdicaoDeRegraFila {
  nome?: string;
  ordem?: number;
  combinador?: 'e' | 'ou';
  filaDestinoId?: string;
  condicoes?: { campo: string; operador: OperadorDeRegra; valor: string }[];
}

export async function editarRegraFila(
  id: string,
  pedido: PedidoDeEdicaoDeRegraFila,
): Promise<Resultado<void>> {
  try {
    await api.patch(`/v1/gestao/regras/atendimento/${id}`, pedido);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível editar a regra.') };
  }
}

export async function excluirRegraFila(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/gestao/regras/atendimento/${id}`);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível excluir a regra.') };
  }
}

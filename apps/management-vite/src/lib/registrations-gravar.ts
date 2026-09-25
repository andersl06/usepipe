import { api, ApiError } from './api';
import { atualizarLeituras } from './actions';
import { motivoDe, type Resultado } from './rest';
import type { OperadorDeRegra } from './rule-queue';

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
export async function alternarQueue(id: string, active: boolean): Promise<Resultado<void>> {
  try {
    await api.patch(`/v1/management/agents/queues/${id}`, { ativa: !active });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível alterar a fila.') };
  }
}

export async function excluirQueue(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/management/agents/queues/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a fila.') };
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
export type ResultadoComCampo<T> = { ok: true; value: T } | { ok: false; error: string; campo?: string };

const CAMPO_DO_CODIGO: Record<string, string> = {
  nome_obrigatorio: 'nome',
  nome_em_uso: 'nome',
  capacidade_invalida: 'capacidadeOverride',
};

function falhaComCampo<T>(error: unknown, padrao: string): ResultadoComCampo<T> {
  if (error instanceof ApiError) {
    const corpo = error.corpo as
      | { error?: { codigo?: unknown; message?: unknown; detalhe?: { campo?: unknown } } }
      | null;
    const codigo = corpo?.error?.codigo;
    const message = corpo?.error?.message;
    const campoDoDetalhe = corpo?.error?.detalhe?.campo;
    const campo =
      (typeof campoDoDetalhe === 'string' ? campoDoDetalhe : undefined) ??
      (typeof codigo === 'string' ? CAMPO_DO_CODIGO[codigo] : undefined);
    return {
      ok: false,
      error: typeof message === 'string' && message ? message : padrao,
      ...(campo ? { campo } : {}),
    };
  }
  return { ok: false, error: padrao };
}

/**
 * Editar a fila — `PATCH /v1/gestao/atendentes/filas/:id`.
 *
 * Os quatro campos do meio entraram quando "Dados da fila" mudou do modal de
 * criação para a página de edição (`FICHA-atendentes-filas-pausas.md` §a.2):
 * `cadastros.PedidoDeEdicaoDeFila` da `api` já os aceitava, só a tela não os
 * mandava.
 */
export interface RequestOfEditOfQueue {
  nome?: string;
  cor?: string | null;
  horarioId?: string | null;
  capacityDefault?: number;
  order?: number;
  active?: boolean;
}

export async function editQueue(
  id: string,
  pedido: RequestOfEditOfQueue,
): Promise<ResultadoComCampo<void>> {
  try {
    await api.patch(`/v1/management/agents/queues/${id}`, pedido);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return falhaComCampo(error, 'Não foi possível renomear a fila.');
  }
}

/** Vincular atendente à fila — `POST .../filas/:id/atendentes`. Capacidade omitida usa a padrão da fila. */
export async function vincularAgentInQueue(
  queueId: string,
  agentId: string,
  capacityOverride?: number | null,
): Promise<ResultadoComCampo<void>> {
  try {
    await api.post(`/v1/management/agents/queues/${queueId}/agents`, {
      usuarioId: agentId,
      ...(capacityOverride != null ? { capacityOverride } : {}),
    });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return falhaComCampo(error, 'Não foi possível vincular o atendente.');
  }
}

/** Desvincular atendente da fila — `DELETE .../filas/:id/atendentes/:atendenteId`. */
export async function queueDesvincularAgent(
  queueId: string,
  agentId: string,
): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/management/agents/queues/${queueId}/agents/${agentId}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível desvincular o atendente.') };
  }
}

export async function alternarMotivoPausa(id: string, ativo: boolean): Promise<Resultado<void>> {
  try {
    await api.patch(`/v1/management/agents/pauses/${id}`, { ativo: !ativo });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível alterar o motivo.') };
  }
}

export async function excluirMotivoPausa(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/management/agents/pauses/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir o motivo.') };
  }
}

/**
 * Escrita da regra de atendimento (item 1, segunda parte) — `PATCH`/`DELETE`
 * de verdade em `/v1/gestao/regras/atendimento/:id`, ao lado de
 * `salvarRegraFila`/`alternarRegraFila` (`lib/acoes.ts`, a criação e o
 * interruptor). REORDENAR não tem função própria: é este mesmo `editarRegraFila`
 * chamado só com `{ ordem }` — a página manda um PATCH por linha movida.
 */
export interface RequestOfEditOfRuleQueue {
  nome?: string;
  order?: number;
  combinador?: 'e' | 'ou';
  queueDestinationId?: string;
  conditions?: { campo: string; operador: OperadorDeRegra; value: string }[];
}

export async function editRuleQueue(
  id: string,
  pedido: RequestOfEditOfRuleQueue,
): Promise<Resultado<void>> {
  try {
    await api.patch(`/v1/management/rules/attendance/${id}`, pedido);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível editar a regra.') };
  }
}

export async function excluirRuleQueue(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/management/rules/attendance/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a regra.') };
  }
}

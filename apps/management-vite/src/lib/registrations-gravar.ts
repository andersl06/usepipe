import { api, ApiError } from '@pipe/ui/api';
import { atualizarLeituras } from './actions';
import { motivoDe, type Resultado } from './rest';
import type { OperadorDeRegra } from './rule-queue';

/**
 * Write real queue/pause `PATCH` and `DELETE` at `/v1/gestao/atendentes/{filas,pausas}/:id`, unlike `acoes.ts` which only exposes creators `salvarFila` and `salvarMotivoPausa`; match `paginas/fluxo/configuracoes/basicas/gravar.ts`. Keep this separate from pure `cadastros.ts`, so a future `tests/cadastros.test.ts` can run outside Vite as `tests/comunicacao.test.ts` does. Importing `./api` from the pure module would read `import.meta.env` and break there, as happened with `comunicacao.ts` before its writes moved.
 */

/** O interruptor do cartão-linha: liga/desliga sem abrir formulário. */
/** Texto de erro de gravação nas telas de Filas: o que foi digitado continua na tela. */
export const falhaAoSalvar = (motivo: string) =>
  `Não foi possível salvar: ${motivo}. Suas alterações continuam na tela; tente novamente.`;

export async function toggleQueue(id: string, active: boolean): Promise<Resultado<void>> {
  try {
    await api.patch(`/v1/management/agents/queues/${id}`, { ativa: !active });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível alterar a fila.') };
  }
}

export async function deleteQueue(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/management/agents/queues/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a fila.') };
  }
}

/**
 * `Resultado` also identifies a field from the expected `{erro:{codigo,mensagem,detalhe?:{campo}}}` response so Edit queue can show rejection beside the relevant field. Current `editarFila` and `vincularAtendenteNaFila` in `apps/api/src/dominio/gestao/cadastros.ts` omit `detalhe.campo`; map `nome_obrigatorio` and `nome_em_uso` to name, `capacidade_invalida` to capacidadeOverride. If the `api` later supplies `detalhe.campo`, use it first.
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
 * Edit queue via `PATCH /v1/gestao/atendentes/filas/:id`. Four additional middle fields arrived when `Dados da fila` moved from the creation modal to the edit page (`FICHA-atendentes-filas-pausas.md` Section a.2); `api` type `cadastros.PedidoDeEdicaoDeFila` already accepted them, but the old screen did not send them.
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
    // Body keys follow the API (`RequestOfEditOfQueue`: name, color, scheduleId, ativa).
    await api.patch(`/v1/management/agents/queues/${id}`, {
      name: pedido.nome,
      color: pedido.cor,
      scheduleId: pedido.horarioId,
      capacityDefault: pedido.capacityDefault,
      order: pedido.order,
      ativa: pedido.active,
    });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return falhaComCampo(error, 'Não foi possível renomear a fila.');
  }
}

/** Link an agent to a queue through `POST .../filas/:id/atendentes`; omitting capacity uses the queue default. */
export async function linkAgentInQueue(
  queueId: string,
  agentId: string,
  capacityOverride?: number | null,
): Promise<ResultadoComCampo<void>> {
  try {
    await api.post(`/v1/management/agents/queues/${queueId}/agents`, {
      userId: agentId,
      ...(capacityOverride != null ? { capacityOverride } : {}),
    });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return falhaComCampo(error, 'Não foi possível vincular o atendente.');
  }
}

/** Desvincular atendente da fila — `DELETE .../filas/:id/atendentes/:atendenteId`. */
export async function queueUnlinkAgent(
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
 * Write attendance-rule edits and deletes through actual `PATCH`/`DELETE` at `/v1/gestao/regras/atendimento/:id`, alongside `salvarRegraFila` and `alternarRegraFila` in `lib/acoes.ts` for creation and toggling. Reordering calls the same `editarRegraFila` with only `{ ordem }`; the page sends one PATCH per moved row.
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
    // Body keys follow the API (`RequestOfEditOfRuleQueue`: name, combiner, condicoes[field, operator]).
    await api.patch(`/v1/management/rules/attendance/${id}`, {
      name: pedido.nome,
      order: pedido.order,
      combiner: pedido.combinador,
      queueDestinationId: pedido.queueDestinationId,
      condicoes: pedido.conditions?.map((c) => ({ field: c.campo, operator: c.operador, value: c.value })),
    });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível editar a regra.') };
  }
}

export async function deleteRuleQueue(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/management/rules/attendance/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a regra.') };
  }
}

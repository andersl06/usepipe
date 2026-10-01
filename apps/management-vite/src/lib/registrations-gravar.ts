import { api, ApiError } from '@pipe/ui/api';
import { atualizarLeituras, saveRuleQueue, toggleRuleQueue } from './actions';
import { withFlow } from './flow-scope';
import { motivoDe, type Resultado } from './rest';
import type { OperadorDeRegra } from './rule-queue';
import type { AutoCloseConfig } from './queue-auto-close';

/**
 * Write real queue/pause `PATCH` and `DELETE` at `/v1/gestao/atendentes/{filas,pausas}/:id`, unlike `acoes.ts` which only exposes creators `salvarFila` and `salvarMotivoPausa`; match `paginas/fluxo/configuracoes/basicas/gravar.ts`. Keep this separate from pure `cadastros.ts`, so a future `tests/cadastros.test.ts` can run outside Vite as `tests/comunicacao.test.ts` does. Importing `./api` from the pure module would read `import.meta.env` and break there, as happened with `comunicacao.ts` before its writes moved.
 */

/** O interruptor do cartão-linha: liga/desliga sem abrir formulário. */
/** Texto de erro de gravação nas telas de Filas: o que foi digitado continua na tela. */
export const falhaAoSalvar = (motivo: string) =>
  `Não foi possível salvar: ${motivo}. Suas alterações continuam na tela; tente novamente.`;

export async function toggleQueue(flowId: string, id: string, active: boolean): Promise<Resultado<void>> {
  try {
    await api.patch(withFlow(`/v1/management/agents/queues/${id}`, flowId), { ativa: !active });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível alterar a fila.') };
  }
}

export async function deleteQueue(flowId: string, id: string): Promise<Resultado<void>> {
  try {
    await api.delete(withFlow(`/v1/management/agents/queues/${id}`, flowId));
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
  flowId: string,
  id: string,
  pedido: RequestOfEditOfQueue,
): Promise<ResultadoComCampo<void>> {
  try {
    // Body keys follow the API (`RequestOfEditOfQueue`: name, color, scheduleId, ativa).
    await api.patch(withFlow(`/v1/management/agents/queues/${id}`, flowId), {
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

/** Grava a lista completa de tags da fila. */
export async function saveQueueTags(flowId: string, id: string, tags: readonly string[]): Promise<Resultado<void>> {
  try {
    await api.put(withFlow(`/v1/management/agents/queues/${id}/tags`, flowId), { tags });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar as tags.') };
  }
}

/** Grava a configuração de encerramento automático (inclui o interruptor). */
export async function saveAutoClose(flowId: string, id: string, config: AutoCloseConfig): Promise<Resultado<void>> {
  try {
    await api.put(withFlow(`/v1/management/agents/queues/${id}/auto-close`, flowId), config);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao alterar os dados.') };
  }
}

/** Link an agent to a queue through `POST .../filas/:id/atendentes`; omitting capacity uses the queue default. */
export async function linkAgentInQueue(
  flowId: string,
  queueId: string,
  agentId: string,
  capacityOverride?: number | null,
): Promise<ResultadoComCampo<void>> {
  try {
    await api.post(withFlow(`/v1/management/agents/queues/${queueId}/agents`, flowId), {
      flowId,
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
  flowId: string,
  queueId: string,
  agentId: string,
): Promise<Resultado<void>> {
  try {
    await api.delete(withFlow(`/v1/management/agents/queues/${queueId}/agents/${agentId}`, flowId));
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
  flowId: string,
  id: string,
  pedido: RequestOfEditOfRuleQueue,
): Promise<Resultado<void>> {
  try {
    // Body keys follow the API (`RequestOfEditOfRuleQueue`: name, combiner, condicoes[field, operator]).
    await api.patch(withFlow(`/v1/management/rules/attendance/${id}`, flowId), {
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

export async function deleteRuleQueue(flowId: string, id: string): Promise<Resultado<void>> {
  try {
    await api.delete(withFlow(`/v1/management/rules/attendance/${id}`, flowId));
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a regra.') };
  }
}


/** Cria a regra de atendimento da fila pela ação `salvarRegraFila` (a fila de destino é a que está sendo editada). */
export async function createRuleQueue(
  flowId: string,
  pedido: {
    nome: string;
    order: number;
    combinador: 'e' | 'ou';
    queueDestinationId: string;
    conditions: readonly { campo: string; operador: OperadorDeRegra; valor: string }[];
  },
): Promise<Resultado<void>> {
  const dados = new FormData();
  dados.set('fluxoId', flowId);
  dados.set('nome', pedido.nome);
  dados.set('filaDestinoId', pedido.queueDestinationId);
  dados.set('combinador', pedido.combinador);
  dados.set('ordem', String(pedido.order));
  for (const c of pedido.conditions) {
    dados.append('campo', c.campo);
    dados.append('operador', c.operador);
    dados.append('valor', c.valor);
  }
  const resultado = await saveRuleQueue({ ok: true }, dados);
  return resultado.ok
    ? { ok: true, value: undefined }
    : { ok: false, error: resultado.error ?? 'Não foi possível criar a regra.' };
}

/** Liga ou desliga a regra de atendimento (a ação inverte o estado atual). */
export async function toggleRuleQueueActive(flowId: string, id: string): Promise<Resultado<void>> {
  const dados = new FormData();
  dados.set('fluxoId', flowId);
  dados.set('id', id);
  const resultado = await toggleRuleQueue({ ok: true }, dados);
  return resultado.ok
    ? { ok: true, value: undefined }
    : { ok: false, error: resultado.error ?? 'Não foi possível alterar a regra.' };
}

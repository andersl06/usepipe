import { api } from './api';
import { atualizarLeituras } from './acoes';
import { motivoDe, type Resultado } from './rest';
import { queueDesvincularAgent, vincularAgentInQueue } from './cadastros-gravar';

/**
 * Escrita das telas de atendente — permissões, edição em lote e "Excluir".
 *
 * À parte de `cadastros.ts`/`atendentes.ts`, que são módulos PUROS: este
 * importa `./api`, que lê `import.meta.env` e quebra fora do Vite (foi o que
 * aconteceu com `comunicacao.ts` até a escrita ganhar arquivo próprio).
 */

/** Uma linha da tabela "Tipo de permissão" × "Status" da origem. */
export interface PermissionLinha {
  codigo: string;
  grupo: string;
  description: string;
  dosPapeis: boolean;
  override: boolean | null;
  ligada: boolean;
  /** Uns dos selecionados têm, outros não — só com seleção múltipla. */
  parcial: boolean;
}

export interface AgentPermissions {
  agents: { id: string; nome: string; email: string }[];
  permissions: PermissionLinha[];
}

/** O caminho da leitura — os ids vão na busca, como na rota sem `:id` da origem. */
export function permissionsCaminho(ids: readonly string[]): string | null {
  if (ids.length === 0) return null;
  return `/v1/gestao/atendentes/permissoes?atendentes=${ids.join(',')}`;
}

/** "Salvar alterações": manda só o que a tela MEXEU. */
export async function salvarPermissions(
  userIds: readonly string[],
  permissions: Record<string, boolean>,
): Promise<Resultado<void>> {
  try {
    await api.patch('/v1/gestao/atendentes/permissoes', {
      usuarioIds: [...userIds],
      permissions,
    });
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar as permissões.') };
  }
}

/**
 * A edição em lote da origem ("Editar N atendentes", com "preencha pelo menos
 * um dos campos"): põe os selecionados numa fila e/ou dá a eles um número
 * próprio de tickets simultâneos.
 *
 * Não há rota de "editar atendente" — e não precisa: no Pipe o teto de
 * conversas simultâneas nasce da PARTICIPAÇÃO em fila
 * (`fila_atendente.capacidade_override` sobre `fila.capacidade_padrao`), então
 * os dois campos são a mesma gravação, `POST /filas/:id/atendentes`. Quem já
 * está na fila tem a capacidade trocada; quem não está, entra.
 */
export async function aplicarInSelection(
  userIds: readonly string[],
  queueId: string,
  capacityOverride: number | null,
): Promise<Resultado<void>> {
  for (const id of userIds) {
    const r = await vincularAgentInQueue(queueId, id, capacityOverride);
    if (!r.ok) return { ok: false, error: r.error };
  }
  return { ok: true, value: undefined };
}

/**
 * O "Excluir" da linha de atendente.
 *
 * **Divergência registrada.** Na origem esse ícone tira a pessoa da equipe de
 * atendimento. No Pipe não existe "equipe de atendimento" como cadastro: a
 * lista é a de `usuario` do tenant, e quem recebe conversa é quem está em
 * FILA. Então "Excluir" aqui é exatamente isso — a pessoa sai de todas as
 * filas e deixa de receber conversa, continuando com a conta. Apagar o usuário
 * seria destruir histórico de conversa, e não é o que o ícone promete.
 */
export async function removeFromAllQueues(
  agentId: string,
  queueIds: readonly string[],
): Promise<Resultado<void>> {
  for (const queueId of queueIds) {
    const r = await queueDesvincularAgent(queueId, agentId);
    if (!r.ok) return r;
  }
  return { ok: true, value: undefined };
}

/* ------------------------------------------- regras de priorização da fila */

export interface RequestOfRuleOfPriority {
  nome: string;
  nivel: string;
  scopeType: 'fila' | 'tenant';
  scopeId: string | null;
}

export async function priorityCreateRule(
  pedido: RequestOfRuleOfPriority,
): Promise<Resultado<void>> {
  try {
    await api.post('/v1/gestao/regras/prioridade', pedido);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível criar a regra de priorização.') };
  }
}

export async function priorityExcluirRule(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/gestao/regras/prioridade/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a regra de priorização.') };
  }
}

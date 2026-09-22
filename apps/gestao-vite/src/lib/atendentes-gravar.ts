import { api } from './api';
import { atualizarLeituras } from './acoes';
import { motivoDe, type Resultado } from './rest';
import { desvincularAtendenteDaFila, vincularAtendenteNaFila } from './cadastros-gravar';

/**
 * Escrita das telas de atendente — permissões, edição em lote e "Excluir".
 *
 * À parte de `cadastros.ts`/`atendentes.ts`, que são módulos PUROS: este
 * importa `./api`, que lê `import.meta.env` e quebra fora do Vite (foi o que
 * aconteceu com `comunicacao.ts` até a escrita ganhar arquivo próprio).
 */

/** Uma linha da tabela "Tipo de permissão" × "Status" da origem. */
export interface LinhaDePermissao {
  codigo: string;
  grupo: string;
  descricao: string;
  dosPapeis: boolean;
  override: boolean | null;
  ligada: boolean;
  /** Uns dos selecionados têm, outros não — só com seleção múltipla. */
  parcial: boolean;
}

export interface PermissoesDoAtendente {
  atendentes: { id: string; nome: string; email: string }[];
  permissoes: LinhaDePermissao[];
}

/** O caminho da leitura — os ids vão na busca, como na rota sem `:id` da origem. */
export function caminhoDasPermissoes(ids: readonly string[]): string | null {
  if (ids.length === 0) return null;
  return `/v1/gestao/atendentes/permissoes?atendentes=${ids.join(',')}`;
}

/** "Salvar alterações": manda só o que a tela MEXEU. */
export async function salvarPermissoes(
  usuarioIds: readonly string[],
  permissoes: Record<string, boolean>,
): Promise<Resultado<void>> {
  try {
    await api.patch('/v1/gestao/atendentes/permissoes', {
      usuarioIds: [...usuarioIds],
      permissoes,
    });
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível salvar as permissões.') };
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
export async function aplicarNaSelecao(
  usuarioIds: readonly string[],
  filaId: string,
  capacidadeOverride: number | null,
): Promise<Resultado<void>> {
  for (const id of usuarioIds) {
    const r = await vincularAtendenteNaFila(filaId, id, capacidadeOverride);
    if (!r.ok) return { ok: false, erro: r.erro };
  }
  return { ok: true, valor: undefined };
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
export async function tirarDeTodasAsFilas(
  atendenteId: string,
  filaIds: readonly string[],
): Promise<Resultado<void>> {
  for (const filaId of filaIds) {
    const r = await desvincularAtendenteDaFila(filaId, atendenteId);
    if (!r.ok) return r;
  }
  return { ok: true, valor: undefined };
}

/* ------------------------------------------- regras de priorização da fila */

export interface PedidoDeRegraDePrioridade {
  nome: string;
  nivel: string;
  escopoTipo: 'fila' | 'tenant';
  escopoId: string | null;
}

export async function criarRegraDePrioridade(
  pedido: PedidoDeRegraDePrioridade,
): Promise<Resultado<void>> {
  try {
    await api.post('/v1/gestao/regras/prioridade', pedido);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível criar a regra de priorização.') };
  }
}

export async function excluirRegraDePrioridade(id: string): Promise<Resultado<void>> {
  try {
    await api.delete(`/v1/gestao/regras/prioridade/${id}`);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível excluir a regra de priorização.') };
  }
}

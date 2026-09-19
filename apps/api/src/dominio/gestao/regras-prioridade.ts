import { and, asc, eq, ne } from 'drizzle-orm';
import { NIVEIS_ATRIBUIVEIS } from '@pipe/core/conversa';
import { regraPrioridade, fila } from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransacaoPipe } from '@pipe/db';
import { ErroPipe } from '../../erros.js';
import { exigirPermissao } from '../../sessao.js';
import { REGRA_GERENCIAR } from './cadastros.js';

/**
 * CRUD básico de `regra_prioridade` — item 4 da tarefa de cadastros do
 * Atendimento. "Sem tela nova": este arquivo só existe para a rota REST
 * ficar completa (leitura + escrita), sem página em `apps/gestao-vite`.
 *
 * **ATUALIZAÇÃO — o motor nasceu.** As duas decisões abaixo (sem motor, sem
 * ordem) valiam quando só existia o CRUD. Numa tarefa seguinte ("fazer
 * funcionar o que só está cadastrado"), o motor foi construído em
 * `prioridade-motor.ts` (`avaliarPrioridade`/`carregarRegrasDePrioridadeAtivas`)
 * e ligado em `dominio/entrada.ts`/`dominio/fluxo.ts`, no momento em que a
 * conversa entra na fila. A ordem sem coluna própria (escopo `fila` antes de
 * `tenant`, depois `criado_em`) está documentada lá — texto original mantido
 * abaixo como histórico de por que o CRUD nasceu sem essas duas coisas.
 *
 * **Decisão Pipe — sem motor (histórico).** Nenhum lugar do produto LIA
 * `regra_prioridade` para decidir a prioridade de uma conversa: a coluna
 * `conversa.prioridade` (`packages/core/src/conversa/prioridade.ts`) era
 * atribuída por fora, e não existia `avaliarPrioridade` equivalente ao
 * `filaDeDestino` de `regra-fila.ts`. Construir esse motor não tinha sido
 * pedido na tarefa de cadastros (que listava só "CRUD REST básico + ordem,
 * se a tabela permitir") e seria a parte cara daquela tarefa — o arquivo
 * fazia só o que tinha sido pedido: guardar a configuração.
 *
 * **Decisão Pipe — sem "ordem" (histórico).** `regra_prioridade` não tinha
 * coluna de ordem (`packages/db/src/schema/gestao.ts`, ao contrário de
 * `regra_fila`). A tarefa de cadastros condicionou reordenar a "se a tabela
 * permitir" — não permitia, e como não havia motor consumindo a tabela,
 * criar a coluna a mais (migração) seria trabalho para um comportamento que
 * ninguém observava ainda.
 *
 * **Decisão Pipe — mesmo limite de escopo do SLA.** `escopoTipo` só aceita
 * `tenant` e `fila`: sem motor nenhum lendo esta tabela, "verificar" que
 * `inbox`/`equipe`/`etiqueta` seriam aceitos por engano é o único cuidado
 * possível — o mesmo raciocínio de `regras-sla.ts`.
 */

const ESCOPOS_PRIORIDADE_SUPORTADOS = ['tenant', 'fila'] as const;
type EscopoPrioridade = (typeof ESCOPOS_PRIORIDADE_SUPORTADOS)[number];

function escopoValido(bruto: string): bruto is EscopoPrioridade {
  return (ESCOPOS_PRIORIDADE_SUPORTADOS as readonly string[]).includes(bruto);
}

export interface RegraPrioridadeGravada {
  id: string;
  nome: string;
  nivel: string;
  escopoTipo: string;
  escopoId: string | null;
  condicao: Record<string, unknown>;
  ativa: boolean;
}

export interface PedidoDeRegraPrioridade {
  nome: string;
  nivel: string;
  escopoTipo?: string;
  escopoId?: string | null;
  condicao?: Record<string, unknown>;
  ativa?: boolean;
}

export interface PedidoDeEdicaoDeRegraPrioridade {
  nome?: string;
  nivel?: string;
  escopoTipo?: string;
  escopoId?: string | null;
  condicao?: Record<string, unknown>;
  ativa?: boolean;
}

function nomeConferido(bruto: unknown): string {
  const nome = String(bruto ?? '').trim();
  if (!nome) throw ErroPipe.requisicao('nome_obrigatorio', 'Informe o nome da regra.');
  return nome;
}

function nivelConferido(bruto: unknown): string {
  const nivel = String(bruto ?? '');
  if (!(NIVEIS_ATRIBUIVEIS as readonly string[]).includes(nivel)) {
    throw ErroPipe.requisicao(
      'nivel_invalido',
      `"${nivel}" não é um nível atribuível. Use um de: ${NIVEIS_ATRIBUIVEIS.join(', ')}.`,
    );
  }
  return nivel;
}

/** Objeto simples, não array nem escalar — `jsonb` aceita qualquer JSON, mas condição de regra é um mapa de critérios. */
function condicaoConferida(bruto: unknown): Record<string, unknown> {
  if (bruto === undefined) return {};
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw ErroPipe.requisicao('condicao_invalida', 'A condição é um objeto (chave/valor), não lista nem texto solto.');
  }
  return bruto as Record<string, unknown>;
}

async function escopoConferido(
  tx: TransacaoPipe,
  tid: string,
  escopoTipo: string,
  escopoId: unknown,
): Promise<{ escopoTipo: EscopoPrioridade; escopoId: string | null }> {
  if (!escopoValido(escopoTipo)) {
    throw ErroPipe.requisicao('escopo_invalido', `Escopo "${escopoTipo}" não é suportado hoje. Use "tenant" ou "fila".`);
  }
  if (escopoTipo === 'tenant') return { escopoTipo, escopoId: null };

  const id = String(escopoId ?? '').trim();
  if (!id) throw ErroPipe.requisicao('escopo_id_obrigatorio', 'Escolha a fila deste escopo.');
  const [alvo] = await tx.select({ id: fila.id }).from(fila).where(and(eq(fila.tenantId, tid), eq(fila.id, id))).limit(1);
  if (!alvo) throw ErroPipe.requisicao('fila_nao_encontrada', 'Fila não encontrada.');
  return { escopoTipo, escopoId: id };
}

async function nomeEmUso(tx: TransacaoPipe, tid: string, nome: string, excetoId?: string): Promise<boolean> {
  const [conflito] = await tx
    .select({ id: regraPrioridade.id })
    .from(regraPrioridade)
    .where(
      and(
        eq(regraPrioridade.tenantId, tid),
        eq(regraPrioridade.nome, nome),
        excetoId ? ne(regraPrioridade.id, excetoId) : undefined,
      ),
    )
    .limit(1);
  return conflito !== undefined;
}

function linha(r: {
  id: string;
  nome: string;
  nivel: string;
  escopoTipo: string;
  escopoId: string | null;
  condicao: unknown;
  ativa: boolean;
}): RegraPrioridadeGravada {
  return { ...r, condicao: (r.condicao ?? {}) as Record<string, unknown> };
}

export async function carregarRegrasDePrioridade(tx: TransacaoPipe): Promise<RegraPrioridadeGravada[]> {
  const regras = await tx
    .select({
      id: regraPrioridade.id,
      nome: regraPrioridade.nome,
      nivel: regraPrioridade.nivel,
      escopoTipo: regraPrioridade.escopoTipo,
      escopoId: regraPrioridade.escopoId,
      condicao: regraPrioridade.condicao,
      ativa: regraPrioridade.ativa,
    })
    .from(regraPrioridade)
    .orderBy(asc(regraPrioridade.nome));
  return regras.map(linha);
}

async function regraPrioridadeViva(tx: TransacaoPipe, tid: string, id: string): Promise<RegraPrioridadeGravada> {
  const [atual] = await tx
    .select({
      id: regraPrioridade.id,
      nome: regraPrioridade.nome,
      nivel: regraPrioridade.nivel,
      escopoTipo: regraPrioridade.escopoTipo,
      escopoId: regraPrioridade.escopoId,
      condicao: regraPrioridade.condicao,
      ativa: regraPrioridade.ativa,
    })
    .from(regraPrioridade)
    .where(and(eq(regraPrioridade.tenantId, tid), eq(regraPrioridade.id, id)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('regra de prioridade');
  return linha(atual);
}

export async function criarRegraPrioridade(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  pedido: PedidoDeRegraPrioridade,
): Promise<{ id: string }> {
  await exigirPermissao(tx, usuarioId, REGRA_GERENCIAR);

  const nome = nomeConferido(pedido.nome);
  const nivel = nivelConferido(pedido.nivel);
  const condicao = condicaoConferida(pedido.condicao);
  const { escopoTipo, escopoId } = await escopoConferido(tx, tid, pedido.escopoTipo ?? 'tenant', pedido.escopoId);
  const ativa = pedido.ativa ?? true;

  if (await nomeEmUso(tx, tid, nome)) throw ErroPipe.conflito('nome_em_uso', `Já existe uma regra chamada "${nome}".`);

  const [criada] = await tx
    .insert(regraPrioridade)
    .values({ tenantId: tid, nome, nivel, escopoTipo, escopoId, condicao, ativa })
    .returning({ id: regraPrioridade.id });
  if (!criada) throw ErroPipe.requisicao('regra_nao_criada', 'Não consegui gravar a regra de prioridade.');

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'criou',
    objetoTipo: 'regra_prioridade',
    objetoId: criada.id,
    depois: { nome, nivel, escopoTipo, escopoId, ativa },
  });
  return { id: criada.id };
}

export async function editarRegraPrioridade(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicaoDeRegraPrioridade,
): Promise<RegraPrioridadeGravada> {
  const atual = await regraPrioridadeViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, REGRA_GERENCIAR);

  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.nome !== undefined) depois.nome = nomeConferido(pedido.nome);
  if (pedido.nivel !== undefined) depois.nivel = nivelConferido(pedido.nivel);
  if (pedido.condicao !== undefined) depois.condicao = condicaoConferida(pedido.condicao);
  if (pedido.ativa !== undefined) depois.ativa = pedido.ativa;
  if (pedido.escopoTipo !== undefined || pedido.escopoId !== undefined) {
    const resolvido = await escopoConferido(
      tx,
      tid,
      pedido.escopoTipo ?? depois.escopoTipo,
      pedido.escopoId !== undefined ? pedido.escopoId : depois.escopoId,
    );
    depois.escopoTipo = resolvido.escopoTipo;
    depois.escopoId = resolvido.escopoId;
  }

  if (depois.nome !== antes.nome && (await nomeEmUso(tx, tid, depois.nome, id))) {
    throw ErroPipe.conflito('nome_em_uso', `Já existe uma regra chamada "${depois.nome}".`);
  }

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  const [gravada] = await tx
    .update(regraPrioridade)
    .set({
      nome: depois.nome,
      nivel: depois.nivel,
      escopoTipo: depois.escopoTipo,
      escopoId: depois.escopoId,
      condicao: depois.condicao,
      ativa: depois.ativa,
      atualizadoEm: new Date(),
    })
    .where(and(eq(regraPrioridade.tenantId, tid), eq(regraPrioridade.id, id)))
    .returning({
      id: regraPrioridade.id,
      nome: regraPrioridade.nome,
      nivel: regraPrioridade.nivel,
      escopoTipo: regraPrioridade.escopoTipo,
      escopoId: regraPrioridade.escopoId,
      condicao: regraPrioridade.condicao,
      ativa: regraPrioridade.ativa,
    });
  if (!gravada) throw ErroPipe.naoEncontrado('regra de prioridade');

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'regra_prioridade',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return linha(gravada);
}

export async function excluirRegraPrioridade(tx: TransacaoPipe, tid: string, usuarioId: string, id: string): Promise<void> {
  const atual = await regraPrioridadeViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, REGRA_GERENCIAR);

  await tx.delete(regraPrioridade).where(and(eq(regraPrioridade.tenantId, tid), eq(regraPrioridade.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'excluiu',
    objetoTipo: 'regra_prioridade',
    objetoId: id,
    antes: { nome: atual.nome, nivel: atual.nivel, ativa: atual.ativa },
  });
}

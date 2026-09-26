import { and, asc, eq, ne } from 'drizzle-orm';
import { NIVEIS_ATRIBUIVEIS } from '@pipe/core/conversation';
import { rulePriority, queue } from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { exigirPermission } from '../../session.js';
import { RULE_MANAGE } from './registrations.js';

/**
 * CRUD básico de `regra_prioridade` — item 4 da tarefa de cadastros do
 * Atendimento. "Sem tela nova": este arquivo só existe para a rota REST
 * ficar completa (leitura + escrita), sem página em `apps/management-vite`.
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

const SCOPES_PRIORITY_SUPPORTED = ['tenant', 'fila'] as const;
type ScopePriority = (typeof SCOPES_PRIORITY_SUPPORTED)[number];

function scopeValid(bruto: string): bruto is ScopePriority {
  return (SCOPES_PRIORITY_SUPPORTED as readonly string[]).includes(bruto);
}

export interface RulePriorityWritten {
  id: string;
  name: string;
  level: string;
  scopeType: string;
  scopeId: string | null;
  condition: Record<string, unknown>;
  ativa: boolean;
}

export interface RequestOfRulePriority {
  name: string;
  level: string;
  scopeType?: string;
  scopeId?: string | null;
  condition?: Record<string, unknown>;
  ativa?: boolean;
}

export interface RequestOfEditOfRulePriority {
  name?: string;
  level?: string;
  scopeType?: string;
  scopeId?: string | null;
  condition?: Record<string, unknown>;
  ativa?: boolean;
}

function nomeConferido(bruto: unknown): string {
  const nome = String(bruto ?? '').trim();
  if (!nome) throw PipeError.request('name_required', 'Informe o nome da regra.');
  return nome;
}

function nivelConferido(bruto: unknown): string {
  const nivel = String(bruto ?? '');
  if (!(NIVEIS_ATRIBUIVEIS as readonly string[]).includes(nivel)) {
    throw PipeError.request(
      'level_invalid',
      `"${nivel}" não é um nível atribuível. Use um de: ${NIVEIS_ATRIBUIVEIS.join(', ')}.`,
    );
  }
  return nivel;
}

/** Objeto simples, não array nem escalar — `jsonb` aceita qualquer JSON, mas condição de regra é um mapa de critérios. */
function conditionChecked(bruto: unknown): Record<string, unknown> {
  if (bruto === undefined) return {};
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw PipeError.request('condition_invalid', 'A condição é um objeto (chave/valor), não lista nem texto solto.');
  }
  return bruto as Record<string, unknown>;
}

async function scopeChecked(
  tx: TransactionPipe,
  tid: string,
  scopeType: string,
  scopeId: unknown,
): Promise<{ scopeType: ScopePriority; scopeId: string | null }> {
  if (!scopeValid(scopeType)) {
    throw PipeError.request('scope_invalid', `Escopo "${scopeType}" não é suportado hoje. Use "tenant" ou "fila".`);
  }
  if (scopeType === 'tenant') return { scopeType, scopeId: null };

  const id = String(scopeId ?? '').trim();
  if (!id) throw PipeError.request('scope_id_required', 'Escolha a fila deste escopo.');
  const [alvo] = await tx.select({ id: queue.id }).from(queue).where(and(eq(queue.tenantId, tid), eq(queue.id, id))).limit(1);
  if (!alvo) throw PipeError.request('queue_not_found', 'Fila não encontrada.');
  return { scopeType, scopeId: id };
}

async function nomeEmUso(tx: TransactionPipe, tid: string, nome: string, excetoId?: string): Promise<boolean> {
  const [conflito] = await tx
    .select({ id: rulePriority.id })
    .from(rulePriority)
    .where(
      and(
        eq(rulePriority.tenantId, tid),
        eq(rulePriority.nome, nome),
        excetoId ? ne(rulePriority.id, excetoId) : undefined,
      ),
    )
    .limit(1);
  return conflito !== undefined;
}

function linha(r: {
  id: string;
  name: string;
  level: string;
  scopeType: string;
  scopeId: string | null;
  condition: unknown;
  ativa: boolean;
}): RulePriorityWritten {
  return { ...r, condition: (r.condition ?? {}) as Record<string, unknown> };
}

export async function loadRulesOfPriority(tx: TransactionPipe): Promise<RulePriorityWritten[]> {
  const regras = await tx
    .select({
      id: rulePriority.id,
      name: rulePriority.nome,
      level: rulePriority.nivel,
      scopeType: rulePriority.scopeType,
      scopeId: rulePriority.scopeId,
      condition: rulePriority.condition,
      ativa: rulePriority.ativa,
    })
    .from(rulePriority)
    .orderBy(asc(rulePriority.nome));
  return regras.map(linha);
}

async function rulePriorityViva(tx: TransactionPipe, tid: string, id: string): Promise<RulePriorityWritten> {
  const [atual] = await tx
    .select({
      id: rulePriority.id,
      name: rulePriority.nome,
      level: rulePriority.nivel,
      scopeType: rulePriority.scopeType,
      scopeId: rulePriority.scopeId,
      condition: rulePriority.condition,
      ativa: rulePriority.ativa,
    })
    .from(rulePriority)
    .where(and(eq(rulePriority.tenantId, tid), eq(rulePriority.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('regra de prioridade');
  return linha(atual);
}

export async function createRulePriority(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  pedido: RequestOfRulePriority,
): Promise<{ id: string }> {
  await exigirPermission(tx, userId, RULE_MANAGE);

  const nome = nomeConferido(pedido.name);
  const nivel = nivelConferido(pedido.level);
  const condition = conditionChecked(pedido.condition);
  const { scopeType, scopeId } = await scopeChecked(tx, tid, pedido.scopeType ?? 'tenant', pedido.scopeId);
  const active = pedido.ativa ?? true;

  if (await nomeEmUso(tx, tid, nome)) throw PipeError.conflito('name_in_use', `Já existe uma regra chamada "${nome}".`);

  const [criada] = await tx
    .insert(rulePriority)
    .values({ tenantId: tid, nome, nivel, scopeType, scopeId, condition, ativa: active })
    .returning({ id: rulePriority.id });
  if (!criada) throw PipeError.request('rule_not_created', 'Não consegui gravar a regra de prioridade.');

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: userId },
    acao: 'criou',
    objetoTipo: 'regra_prioridade',
    objetoId: criada.id,
    depois: { nome, nivel, escopoTipo: scopeType, escopoId: scopeId, active },
  });
  return { id: criada.id };
}

export async function editarRulePriority(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfRulePriority,
): Promise<RulePriorityWritten> {
  const atual = await rulePriorityViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, RULE_MANAGE);

  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.name !== undefined) depois.name = nomeConferido(pedido.name);
  if (pedido.level !== undefined) depois.level = nivelConferido(pedido.level);
  if (pedido.condition !== undefined) depois.condition = conditionChecked(pedido.condition);
  if (pedido.ativa !== undefined) depois.ativa = pedido.ativa;
  if (pedido.scopeType !== undefined || pedido.scopeId !== undefined) {
    const resolvido = await scopeChecked(
      tx,
      tid,
      pedido.scopeType ?? depois.scopeType,
      pedido.scopeId !== undefined ? pedido.scopeId : depois.scopeId,
    );
    depois.scopeType = resolvido.scopeType;
    depois.scopeId = resolvido.scopeId;
  }

  if (depois.name !== antes.name && (await nomeEmUso(tx, tid, depois.name, id))) {
    throw PipeError.conflito('name_in_use', `Já existe uma regra chamada "${depois.name}".`);
  }

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  const [gravada] = await tx
    .update(rulePriority)
    .set({
      nome: depois.name,
      nivel: depois.level,
      scopeType: depois.scopeType,
      scopeId: depois.scopeId,
      condition: depois.condition,
      ativa: depois.ativa,
      atualizadoEm: new Date(),
    })
    .where(and(eq(rulePriority.tenantId, tid), eq(rulePriority.id, id)))
    .returning({
      id: rulePriority.id,
      name: rulePriority.nome,
      level: rulePriority.nivel,
      scopeType: rulePriority.scopeType,
      scopeId: rulePriority.scopeId,
      condition: rulePriority.condition,
      ativa: rulePriority.ativa,
    });
  if (!gravada) throw PipeError.naoEncontrado('regra de prioridade');

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'regra_prioridade',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return linha(gravada);
}

export async function deleteRulePriority(tx: TransactionPipe, tid: string, usuarioId: string, id: string): Promise<void> {
  const atual = await rulePriorityViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, RULE_MANAGE);

  await tx.delete(rulePriority).where(and(eq(rulePriority.tenantId, tid), eq(rulePriority.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'excluiu',
    objetoTipo: 'regra_prioridade',
    objetoId: id,
    antes: { nome: atual.name, nivel: atual.level, ativa: atual.ativa },
  });
}

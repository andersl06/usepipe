import { and, eq, ne } from 'drizzle-orm';
import { queue, regraSla, slaConversation, ALVOS_SLA } from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { exigirPermission } from '../../session.js';
import { RULE_MANAGE } from './registrations.js';

/**
 * Escrita de `regra_sla` — item 2 da tarefa de cadastros do Atendimento. A
 * LEITURA continua em `configuracoes.ts` (`carregarRegras`, que já monta o
 * nome da fila para a tela de `regras/sla`); este arquivo é o irmão de
 * escrita, no mesmo padrão REST de `cadastros.ts` (`ErroPipe`, status de
 * verdade). Fica em arquivo próprio, e não dentro de `cadastros.ts`, porque
 * SLA é assunto à parte de fila/pausa/regra de entrada — mesma divisão que já
 * separa `comunicacao.ts` de `cadastros.ts`.
 *
 * `regra.gerenciar` é a MESMA permissão de `gravarRegraFila`: o catálogo já
 * a descreve como "Gerenciar regras de fila, prioridade e SLA" — não há
 * permissão nova para criar aqui.
 *
 * Decisão Pipe — `escopoTipo` só aceita `tenant` e `fila`. A tabela permite
 * mais (`inbox`, `equipe`, `etiqueta` — `ESCOPOS_REGRA` em
 * `packages/db/src/schema/gestao.ts`), mas `escolherRegra` do motor de SLA
 * (`dominio/gestao/sla.ts`) só sabe resolver estes dois; uma regra com outro
 * escopo seria aceita e nunca aplicada — pior que recusar na entrada.
 */

const SCOPES_SLA_SUPPORTED = ['tenant', 'fila'] as const;
type ScopeSla = (typeof SCOPES_SLA_SUPPORTED)[number];

function scopeSlaValid(bruto: string): bruto is ScopeSla {
  return (SCOPES_SLA_SUPPORTED as readonly string[]).includes(bruto);
}

/** Uma semana: acima disso o prazo provavelmente é erro de digitação (segundos em vez de minutos). */
const PRAZO_SEG_MAX = 7 * 86_400;

export interface PedidoDeRegraSla {
  name: string;
  target: string;
  deadlineSeg: number;
  alertSeg?: number | null;
  scopeType?: string;
  scopeId?: string | null;
  active?: boolean;
}

export interface RequestOfEditOfRuleSla {
  name?: string;
  target?: string;
  deadlineSeg?: number;
  alertSeg?: number | null;
  scopeType?: string;
  scopeId?: string | null;
  ativa?: boolean;
}

export interface RegraSlaGravada {
  id: string;
  name: string;
  target: string;
  deadlineSeg: number;
  alertSeg: number | null;
  scopeType: string;
  scopeId: string | null;
  ativa: boolean;
}

function nomeConferido(bruto: unknown): string {
  const nome = String(bruto ?? '').trim();
  if (!nome) throw PipeError.request('name_required', 'Informe o nome da regra.');
  return nome;
}

function alvoConferido(bruto: unknown): string {
  const alvo = String(bruto ?? '');
  if (!(ALVOS_SLA as readonly string[]).includes(alvo)) {
    throw PipeError.request('target_invalid', `"${alvo}" não é um alvo de SLA válido.`);
  }
  return alvo;
}

function prazoConferido(bruto: unknown): number {
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > PRAZO_SEG_MAX) {
    throw PipeError.request(
      'deadline_invalid',
      `O prazo é um inteiro de 1 a ${PRAZO_SEG_MAX} segundos (uma semana).`,
    );
  }
  return n;
}

/** `null`/ausente é "sem alerta"; quando vem, tem de soar ANTES do prazo estourar. */
function alertaConferido(bruto: unknown, prazoSeg: number): number | null {
  if (bruto === undefined || bruto === null) return null;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n >= prazoSeg) {
    throw PipeError.request(
      'alert_invalid',
      'O alerta é um inteiro positivo, menor que o prazo — alerta que soa depois do estouro não avisa nada.',
    );
  }
  return n;
}

async function nomeEmUso(tx: TransactionPipe, tid: string, nome: string, excetoId?: string): Promise<boolean> {
  const [conflito] = await tx
    .select({ id: regraSla.id })
    .from(regraSla)
    .where(and(eq(regraSla.tenantId, tid), eq(regraSla.nome, nome), excetoId ? ne(regraSla.id, excetoId) : undefined))
    .limit(1);
  return conflito !== undefined;
}

async function scopeChecked(
  tx: TransactionPipe,
  tid: string,
  scopeType: string,
  scopeId: unknown,
): Promise<{ scopeType: ScopeSla; scopeId: string | null }> {
  if (!scopeSlaValid(scopeType)) {
    throw PipeError.request(
      'scope_invalid',
      `Escopo "${scopeType}" não é aplicado pelo motor de SLA hoje. Use "tenant" ou "fila".`,
    );
  }
  if (scopeType === 'tenant') return { scopeType, scopeId: null };

  const id = String(scopeId ?? '').trim();
  if (!id) throw PipeError.request('scope_id_required', 'Escolha a fila deste escopo.');
  const [alvo] = await tx.select({ id: queue.id }).from(queue).where(and(eq(queue.tenantId, tid), eq(queue.id, id))).limit(1);
  if (!alvo) throw PipeError.request('queue_not_found', 'Fila não encontrada.');
  return { scopeType, scopeId: id };
}

async function regraSlaViva(tx: TransactionPipe, tid: string, id: string): Promise<RegraSlaGravada> {
  const [atual] = await tx
    .select({
      id: regraSla.id,
      nome: regraSla.nome,
      alvo: regraSla.alvo,
      prazoSeg: regraSla.prazoSeg,
      alertaSeg: regraSla.alertaSeg,
      escopoTipo: regraSla.escopoTipo,
      escopoId: regraSla.escopoId,
      ativa: regraSla.ativa,
    })
    .from(regraSla)
    .where(and(eq(regraSla.tenantId, tid), eq(regraSla.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('regra de SLA');
  return atual;
}

export async function createRuleSla(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  pedido: PedidoDeRegraSla,
): Promise<{ id: string }> {
  await exigirPermission(tx, userId, RULE_MANAGE);

  const nome = nomeConferido(pedido.name);
  const alvo = alvoConferido(pedido.target);
  const prazoSeg = prazoConferido(pedido.deadlineSeg);
  const alertaSeg = alertaConferido(pedido.alertSeg, prazoSeg);
  const { scopeType, scopeId } = await scopeChecked(tx, tid, pedido.scopeType ?? 'tenant', pedido.scopeId);
  const active = pedido.active ?? true;

  if (await nomeEmUso(tx, tid, nome)) throw PipeError.conflito('name_in_use', `Já existe uma regra chamada "${nome}".`);

  const [criada] = await tx
    .insert(regraSla)
    .values({ tenantId: tid, nome, alvo, prazoSeg, alertaSeg, escopoTipo: scopeType, escopoId: scopeId, active })
    .returning({ id: regraSla.id });
  if (!criada) throw PipeError.request('rule_not_created', 'Não consegui gravar a regra de SLA.');

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: userId },
    acao: 'criou',
    objetoTipo: 'regra_sla',
    objetoId: criada.id,
    depois: { nome, alvo, prazoSeg, alertaSeg, escopoTipo: scopeType, escopoId: scopeId, active },
  });
  return { id: criada.id };
}

export async function editarRegraSla(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfRuleSla,
): Promise<RegraSlaGravada> {
  const atual = await regraSlaViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, RULE_MANAGE);

  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.name !== undefined) depois.name = nomeConferido(pedido.name);
  if (pedido.target !== undefined) depois.target = alvoConferido(pedido.target);
  if (pedido.deadlineSeg !== undefined) depois.deadlineSeg = prazoConferido(pedido.deadlineSeg);
  if (pedido.ativa !== undefined) depois.ativa = pedido.ativa;

  // Alerta depende do prazo (final), então é conferido depois dos dois — o
  // pedido pode trocar só um dos dois e o outro continuar valendo.
  if (pedido.alertSeg !== undefined) depois.alertSeg = alertaConferido(pedido.alertSeg, depois.deadlineSeg);
  else if (depois.alertSeg !== null && depois.alertSeg >= depois.deadlineSeg) {
    // Prazo encolheu abaixo do alerta que já existia — recusa em vez de deixar um alerta que nunca soa.
    throw PipeError.request(
      'alert_invalid',
      'O novo prazo é menor ou igual ao alerta já cadastrado. Informe também o novo alerta.',
    );
  }

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
    .update(regraSla)
    .set({
      nome: depois.name,
      alvo: depois.target,
      prazoSeg: depois.deadlineSeg,
      alertaSeg: depois.alertSeg,
      escopoTipo: depois.scopeType,
      escopoId: depois.scopeId,
      ativa: depois.ativa,
      atualizadoEm: new Date(),
    })
    .where(and(eq(regraSla.tenantId, tid), eq(regraSla.id, id)))
    .returning({
      id: regraSla.id,
      nome: regraSla.nome,
      alvo: regraSla.alvo,
      prazoSeg: regraSla.prazoSeg,
      alertaSeg: regraSla.alertaSeg,
      escopoTipo: regraSla.escopoTipo,
      escopoId: regraSla.escopoId,
      ativa: regraSla.ativa,
    });
  if (!gravada) throw PipeError.naoEncontrado('regra de SLA');

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'regra_sla',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return gravada;
}

export async function excluirRegraSla(tx: TransactionPipe, tid: string, usuarioId: string, id: string): Promise<void> {
  const atual = await regraSlaViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, RULE_MANAGE);

  // `sla_conversa.regra_id` é `ON DELETE CASCADE`: excluir a regra apagaria em
  // silêncio o cronômetro de toda conversa que ainda está correndo com ela.
  const [inProgress] = await tx
    .select({ id: slaConversation.id })
    .from(slaConversation)
    .where(and(eq(slaConversation.regraId, id), eq(slaConversation.state, 'correndo')))
    .limit(1);
  if (inProgress) {
    throw PipeError.conflito(
      'rule_with_sla_running',
      'Esta regra tem cronômetro de SLA correndo em conversa aberta. Desative-a em vez de excluir, ou espere as conversas encerrarem.',
    );
  }

  await tx.delete(regraSla).where(and(eq(regraSla.tenantId, tid), eq(regraSla.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'excluiu',
    objetoTipo: 'regra_sla',
    objetoId: id,
    antes: { nome: atual.name, alvo: atual.target, ativa: atual.ativa },
  });
}

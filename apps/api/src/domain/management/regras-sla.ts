import { and, eq, inArray, ne } from 'drizzle-orm';
import { queue, regraSla, slaConversation, ALVOS_SLA } from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';
import { RULE_MANAGE } from './registrations.js';

/**
 * Write `regra_sla` here while `configuracoes.ts` `carregarRegras` reads rules and joins queue names for `regras/sla`. Follow `cadastros.ts` REST `ErroPipe` statuses. Keep SLA separate from queue, pause and inbound-rule registration, as `comunicacao.ts` is separate. Reuse `regra.gerenciar` from `gravarRegraFila`; catalog label 'Gerenciar regras de fila, prioridade e SLA' already covers it. Pipe accepts only `tenant` and `fila` `escopoTipo`: database `ESCOPOS_REGRA` also allows `inbox`, `equipe` and `etiqueta`, but SLA motor `escolherRegra` in `dominio/gestao/sla.ts` cannot apply those; reject them rather than saving inert rules.
 */

const SCOPES_SLA_SUPPORTED = ['tenant', 'fila'] as const;
type ScopeSla = (typeof SCOPES_SLA_SUPPORTED)[number];

function scopeSlaValid(bruto: string): bruto is ScopeSla {
  return (SCOPES_SLA_SUPPORTED as readonly string[]).includes(bruto);
}

/** Cap at one week; larger deadlines are likely unit mistakes, such as seconds entered as minutes. */
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

/** Missing or `null` means no alert; a supplied alert must fire BEFORE the deadline. */
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
      name: regraSla.nome,
      target: regraSla.alvo,
      deadlineSeg: regraSla.prazoSeg,
      alertSeg: regraSla.alertaSeg,
      scopeType: regraSla.escopoTipo,
      scopeId: regraSla.escopoId,
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
  await requirePermission(tx, userId, RULE_MANAGE);

  const nome = nomeConferido(pedido.name);
  const alvo = alvoConferido(pedido.target);
  const prazoSeg = prazoConferido(pedido.deadlineSeg);
  const alertaSeg = alertaConferido(pedido.alertSeg, prazoSeg);
  const { scopeType, scopeId } = await scopeChecked(tx, tid, pedido.scopeType ?? 'tenant', pedido.scopeId);
  const active = pedido.active ?? true;

  if (await nomeEmUso(tx, tid, nome)) throw PipeError.conflito('name_in_use', `Já existe uma regra chamada "${nome}".`);

  const [criada] = await tx
    .insert(regraSla)
    .values({ tenantId: tid, nome, alvo, prazoSeg, alertaSeg, escopoTipo: scopeType, escopoId: scopeId, ativa: active })
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
  await requirePermission(tx, usuarioId, RULE_MANAGE);

  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.name !== undefined) depois.name = nomeConferido(pedido.name);
  if (pedido.target !== undefined) depois.target = alvoConferido(pedido.target);
  if (pedido.deadlineSeg !== undefined) depois.deadlineSeg = prazoConferido(pedido.deadlineSeg);
  if (pedido.ativa !== undefined) depois.ativa = pedido.ativa;

  // Validate the alert after both final deadline values: a PATCH may change only
  // one deadline while retaining the other.
  if (pedido.alertSeg !== undefined) depois.alertSeg = alertaConferido(pedido.alertSeg, depois.deadlineSeg);
  else if (depois.alertSeg !== null && depois.alertSeg >= depois.deadlineSeg) {
    // Reject a deadline shortened below an existing alert rather than storing an alert that can never fire.
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
      name: regraSla.nome,
      target: regraSla.alvo,
      deadlineSeg: regraSla.prazoSeg,
      alertSeg: regraSla.alertaSeg,
      scopeType: regraSla.escopoTipo,
      scopeId: regraSla.escopoId,
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
  await requirePermission(tx, usuarioId, RULE_MANAGE);

  // `sla_conversa.regra_id` is `ON DELETE CASCADE`: deleting the rule would
  // silently delete timers for conversations still running under it.
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

/* ------------------------------------------------------------ política de SLA */

/**
 * Uma política de SLA (nome, filas, até três metas) é gravada como um conjunto de linhas `regra_sla` que dividem o mesmo `nome`: uma por meta e por escopo (fila, ou "toda a operação" para a regra padrão). Assim o motor (`escolherRegra`) continua escolhendo a regra por alvo e escopo, sem coluna nova. Metas fora das três da tela (`resposta`) não são tocadas na edição.
 */
export const METAS_DA_POLITICA = ['espera_fila', 'primeira_resposta', 'resolucao'] as const;
type MetaDaPolitica = (typeof METAS_DA_POLITICA)[number];

export interface PoliticaConferida {
  name: string;
  padrao: boolean;
  queueIds: string[];
  metas: { target: MetaDaPolitica; deadlineSeg: number }[];
}

/** Valida o corpo da política sem tocar no banco. Prazos em segundos. */
export function politicaConferida(bruto: unknown): PoliticaConferida {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    throw PipeError.request('policy_invalid', 'Pedido de regra de SLA inválido.');
  }
  const corpo = bruto as Record<string, unknown>;
  const name = nomeConferido(corpo['name']);
  if (name.length > 100) throw PipeError.request('name_too_long', 'O nome da regra tem no máximo 100 caracteres.');

  const filas = corpo['queueIds'] ?? [];
  if (!Array.isArray(filas) || filas.some((f) => typeof f !== 'string' || !f)) {
    throw PipeError.request('queues_invalid', 'Lista de filas inválida.');
  }
  const queueIds = [...new Set(filas as string[])];
  const padrao = corpo['padrao'] === true;
  if (!padrao && queueIds.length === 0) {
    throw PipeError.request('scope_required', 'Escolha ao menos uma fila ou use a regra como padrão.');
  }

  const metasBrutas = corpo['metas'];
  if (typeof metasBrutas !== 'object' || metasBrutas === null || Array.isArray(metasBrutas)) {
    throw PipeError.request('metas_required', 'Configure pelo menos uma meta de SLA.');
  }
  const metas: PoliticaConferida['metas'] = [];
  for (const [target, seg] of Object.entries(metasBrutas)) {
    if (!(METAS_DA_POLITICA as readonly string[]).includes(target)) {
      throw PipeError.request('target_invalid', `"${target}" não é uma meta de SLA válida.`);
    }
    metas.push({ target: target as MetaDaPolitica, deadlineSeg: prazoConferido(seg) });
  }
  if (metas.length === 0) throw PipeError.request('metas_required', 'Configure pelo menos uma meta de SLA.');
  return { name, padrao, queueIds, metas };
}

async function correndoEm(tx: TransactionPipe, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return false;
  const [linha] = await tx
    .select({ id: slaConversation.id })
    .from(slaConversation)
    .where(and(inArray(slaConversation.regraId, ids), eq(slaConversation.state, 'correndo')))
    .limit(1);
  return linha !== undefined;
}

async function linhasDaPolitica(tx: TransactionPipe, tid: string, id: string) {
  const [ancora] = await tx
    .select({ nome: regraSla.nome })
    .from(regraSla)
    .where(and(eq(regraSla.tenantId, tid), eq(regraSla.id, id)))
    .limit(1);
  if (!ancora) throw PipeError.naoEncontrado('regra de SLA');
  const linhas = await tx
    .select({
      id: regraSla.id,
      alvo: regraSla.alvo,
      alertaSeg: regraSla.alertaSeg,
      escopoTipo: regraSla.escopoTipo,
      escopoId: regraSla.escopoId,
      ativa: regraSla.ativa,
    })
    .from(regraSla)
    .where(and(eq(regraSla.tenantId, tid), eq(regraSla.nome, ancora.nome)));
  return { nome: ancora.nome, linhas };
}

/** Cria (sem `id`) ou substitui (com o `id` de qualquer linha da política) a política inteira, na mesma transação. */
export async function salvarPoliticaSla(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  bruto: unknown,
  id?: string,
): Promise<{ id: string }> {
  await requirePermission(tx, userId, RULE_MANAGE);
  const p = politicaConferida(bruto);
  const atual = id ? await linhasDaPolitica(tx, tid, id) : { nome: null, linhas: [] };

  if (p.queueIds.length > 0) {
    const donas = await tx
      .select({ id: queue.id })
      .from(queue)
      .where(and(eq(queue.tenantId, tid), inArray(queue.id, p.queueIds)));
    if (donas.length !== p.queueIds.length) throw PipeError.request('queue_not_found', 'Fila não encontrada.');
  }

  if (p.name !== atual.nome) {
    const [uso] = await tx
      .select({ id: regraSla.id })
      .from(regraSla)
      .where(and(eq(regraSla.tenantId, tid), eq(regraSla.nome, p.name)))
      .limit(1);
    if (uso) throw PipeError.conflito('name_in_use', `Já existe uma regra chamada "${p.name}".`);
  }

  const escopos: { tipo: ScopeSla; id: string | null }[] = [
    ...(p.padrao ? [{ tipo: 'tenant' as const, id: null }] : []),
    ...p.queueIds.map((q) => ({ tipo: 'fila' as const, id: q })),
  ];
  const chave = (alvo: string, tipo: string, escopoId: string | null) => `${alvo}|${tipo}|${escopoId ?? ''}`;
  const pedidas = new Set(p.metas.flatMap((m) => escopos.map((e) => chave(m.target, e.tipo, e.id))));

  // Outra política não pode definir a mesma meta para o mesmo escopo: o motor escolheria uma ao acaso.
  const daPolitica = new Set(atual.linhas.map((l) => l.id));
  const ativas = await tx
    .select({ id: regraSla.id, nome: regraSla.nome, alvo: regraSla.alvo, escopoTipo: regraSla.escopoTipo, escopoId: regraSla.escopoId })
    .from(regraSla)
    .where(and(eq(regraSla.tenantId, tid), eq(regraSla.ativa, true)));
  const choque = ativas.find((o) => !daPolitica.has(o.id) && pedidas.has(chave(o.alvo, o.escopoTipo, o.escopoId)));
  if (choque) {
    throw PipeError.conflito(
      'sla_scope_conflict',
      `A regra "${choque.nome}" já define esta meta para o mesmo escopo. Tire a fila ou a meta de uma das duas.`,
    );
  }

  const existentes = new Map(atual.linhas.map((l) => [chave(l.alvo, l.escopoTipo, l.escopoId), l]));
  const geridas = new Set<string>(METAS_DA_POLITICA);
  const remover = atual.linhas.filter(
    (l) => geridas.has(l.alvo) && !pedidas.has(chave(l.alvo, l.escopoTipo, l.escopoId)),
  );
  if (await correndoEm(tx, remover.map((l) => l.id))) {
    throw PipeError.conflito(
      'rule_with_sla_running',
      'Esta regra tem cronômetro de SLA correndo em conversa aberta. Espere as conversas encerrarem antes de remover metas ou filas.',
    );
  }

  const ativa = atual.linhas.length === 0 || atual.linhas.some((l) => l.ativa);
  for (const m of p.metas) {
    for (const e of escopos) {
      const linha = existentes.get(chave(m.target, e.tipo, e.id));
      if (linha) {
        await tx
          .update(regraSla)
          .set({
            prazoSeg: m.deadlineSeg,
            // Alerta que passa a ficar depois do novo prazo nunca dispararia: some.
            alertaSeg: linha.alertaSeg !== null && linha.alertaSeg >= m.deadlineSeg ? null : linha.alertaSeg,
            atualizadoEm: new Date(),
          })
          .where(and(eq(regraSla.tenantId, tid), eq(regraSla.id, linha.id)));
      } else {
        await tx
          .insert(regraSla)
          .values({ tenantId: tid, nome: p.name, alvo: m.target, prazoSeg: m.deadlineSeg, escopoTipo: e.tipo, escopoId: e.id, ativa });
      }
    }
  }
  if (remover.length > 0) {
    await tx.delete(regraSla).where(and(eq(regraSla.tenantId, tid), inArray(regraSla.id, remover.map((l) => l.id))));
  }
  // Todas as linhas da política (inclusive as metas que a tela não gerencia) acompanham o novo nome.
  if (atual.nome !== null && atual.nome !== p.name) {
    await tx
      .update(regraSla)
      .set({ nome: p.name, atualizadoEm: new Date() })
      .where(and(eq(regraSla.tenantId, tid), eq(regraSla.nome, atual.nome)));
  }

  // Uma linha que sobrou identifica a política para quem chamou (a primeira pode ter sido removida acima).
  const [ancora] = await tx
    .select({ id: regraSla.id })
    .from(regraSla)
    .where(and(eq(regraSla.tenantId, tid), eq(regraSla.nome, p.name)))
    .limit(1);
  const primeiro = ancora?.id ?? '';

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: userId },
    acao: id ? 'alterou' : 'criou',
    objetoTipo: 'regra_sla',
    objetoId: primeiro,
    depois: { nome: p.name, padrao: p.padrao, filas: p.queueIds, metas: p.metas },
  });
  return { id: primeiro };
}

/** Exclui todas as linhas da política a que `id` pertence. */
export async function excluirPoliticaSla(tx: TransactionPipe, tid: string, userId: string, id: string): Promise<void> {
  await requirePermission(tx, userId, RULE_MANAGE);
  const { nome, linhas } = await linhasDaPolitica(tx, tid, id);
  if (await correndoEm(tx, linhas.map((l) => l.id))) {
    throw PipeError.conflito(
      'rule_with_sla_running',
      'Esta regra tem cronômetro de SLA correndo em conversa aberta. Espere as conversas encerrarem antes de excluir.',
    );
  }
  await tx.delete(regraSla).where(and(eq(regraSla.tenantId, tid), eq(regraSla.nome, nome)));
  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: userId },
    acao: 'excluiu',
    objetoTipo: 'regra_sla',
    objetoId: id,
    antes: { nome, linhas: linhas.length },
  });
}

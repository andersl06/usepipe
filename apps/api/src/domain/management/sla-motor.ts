import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  LEVELS_PRIORITY,
  avaliarSla,
  targetFulfillment,
  inicioDoAlvo,
  type MarcosSla,
  type LevelPriority,
  SQL_STATES_ACTIVE,
} from '@pipe/core';
import { conversation, slaConversation } from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';
import { databaseOwner, noTenant } from '../../database.js';
import { registrarEvento } from '../eventos.js';
import { emitir } from '../../webhooks-saida.js';
import { carregarRegrasSla, type RegraSlaCarregada } from './sla.js';

/**
 * SLA clock activates the existing `regra_sla`/`sla_conversa` storage. Like media-download scheduling in `../../filas.ts` (`agendarVarreduraDownloadMidia`/`relogioMidia`), BullMQ `pipe-sla` nudges a periodic sweep, with an in-memory dev/test path. `sla_conversa` is authoritative; a lost job only delays processing until the next sweep. Pipe does NOT pause outside business hours: neither `referencias-blip/pesquisa/regras-blip.md` nor `blip-desk-regras-tecnicas.md` documents Blip doing so; the observed first-response timer RESET after an agent reply is different. Existing `dominio/gestao/sla.ts` records the same gap. Pass `horario: null` to `avaliarSla` for 24/7 evaluation; it already accepts a queue schedule if later evidence warrants one. Freeze the clock when a conversation closes, so the next sweep cannot breach one closed before its deadline. Choose one winning rule PER TARGET, not one per conversation: `sla_conversa` uniqueness `(conversa_id, regra_id)` permits concurrent first-response and resolution rules. Apply queue-scope precedence over tenant for each target, as more specific manager configuration.
 */

const STATES_TERMINALS = new Set(['cumprido', 'cancelado']);

function vencedoraDoAlvo(
  regras: readonly RegraSlaCarregada[],
  queueId: string | null,
): RegraSlaCarregada | null {
  const ofQueue = regras.find((r) => r.scopeType === 'fila' && r.scopeId === queueId);
  return ofQueue ?? regras.find((r) => r.scopeType === 'tenant') ?? null;
}

/** Group by target and select the most specific scope rule in each group. */
export function rulesWinningByTarget(
  regras: readonly RegraSlaCarregada[],
  filaId: string | null,
): RegraSlaCarregada[] {
  const byTarget = new Map<string, RegraSlaCarregada[]>();
  for (const r of regras) {
    const lista = byTarget.get(r.target);
    if (lista) lista.push(r);
    else byTarget.set(r.target, [r]);
  }
  const vencedoras: RegraSlaCarregada[] = [];
  for (const lista of byTarget.values()) {
    const v = vencedoraDoAlvo(lista, filaId);
    if (v) vencedoras.push(v);
  }
  return vencedoras;
}

/** Raise priority one step (`conversa/prioridade.ts`); do nothing when already at `maxima`. */
function nivelElevado(atual: string): LevelPriority | null {
  const position = (LEVELS_PRIORITY as readonly string[]).indexOf(atual);
  // A priority of -1 is unknown, and 0 is already `maxima`; neither can be raised.
  if (position <= 0) return null;
  return LEVELS_PRIORITY[position - 1] as LevelPriority;
}

/**
 * Executa a ação configurada (`regra_sla.acao_alerta`/`acao_estouro`, formato
 * `{ tipo: 'notificar_supervisor' | 'elevar_prioridade' }` — é o que
 * `packages/db`/`apps/management-vite` semeiam hoje).
 *
 * O EVENTO (`sla_alertado`/`sla_estourado` em `evento_atendimento`) já foi
 * gravado por quem chama, incondicionalmente — é o dado bruto de onde
 * `metrica_diaria.sla_estourados` um dia vai somar. A ação aqui é o
 * comportamento EXTRA, e regra sem ação configurada (`{}`, o padrão do
 * schema) não faz mais nada além do evento.
 *
 * Tipo desconhecido é ignorado em silêncio: um valor de `jsonb` mal digitado
 * não pode derrubar o relógio de SLA de todas as outras conversas.
 */
async function executarAcao(
  tx: TransactionPipe,
  ctx: { tenantId: string; conversationId: string; queueId: string | null; priorityCurrent: string },
  acao: Record<string, unknown>,
  eventoWebhook: 'sla.alertou' | 'sla.estourou',
): Promise<void> {
  const tipo = typeof acao['tipo'] === 'string' ? acao['tipo'] : '';
  if (tipo === 'notificar_supervisor') {
    await emitir(tx, ctx.tenantId, eventoWebhook, {
      conversa_id: ctx.conversationId,
      fila_id: ctx.queueId,
    });
    return;
  }
  if (tipo === 'elevar_prioridade') {
    const novoNivel = nivelElevado(ctx.priorityCurrent);
    if (!novoNivel) return;
    await tx
      .update(conversation)
      .set({ priority: novoNivel, atualizadoEm: new Date() })
      .where(eq(conversation.id, ctx.conversationId));
  }
}

interface ConversationForSla {
  id: string;
  queueId: string | null;
  priority: string;
  criadaEm: Date;
  assignedAt: Date | null;
  firstResponseAt: Date | null;
  closedAt: Date | null;
  lastMessageAt: Date | null;
  lastMessageFrom: string | null;
}

interface LinhaSlaExistente {
  id: string;
  state: string;
  alertedAt: Date | null;
  exceededAt: Date | null;
}

/** For one rule and conversation, choose new state and emit alert or breach at most once each. */
async function processarRegra(
  tx: TransactionPipe,
  tenantId: string,
  c: ConversationForSla,
  regra: RegraSlaCarregada,
  existente: LinhaSlaExistente | undefined,
  agora: Date,
): Promise<void> {
  // Strict idempotence: a terminal row never changes again, even if a sweep
  // revisits the same conversation a month later.
  if (existente && STATES_TERMINALS.has(existente.state)) return;

  const marcos: MarcosSla = {
    criadaEm: c.criadaEm,
    atribuidaEm: c.assignedAt,
    firstResponseIn: c.firstResponseAt,
    encerradaEm: c.closedAt,
    // For `resposta` (`tempo_resposta`), count only while the customer's message
    // is last. Once the agent or bot answers, this target has no remaining start time.
    aguardandoRespostaDesde: c.lastMessageFrom === 'contato' ? c.lastMessageAt : null,
  };

  const inicio = inicioDoAlvo(regra.target, marcos);
  if (!inicio) {
    // No start time today. If a row was running, the reply that ended the wait closes the cycle as met; otherwise it would remain running indefinitely.
    // sempre depois que o atendente respondesse.
    //
    // ponytail: alvo `resposta` reaproveita a MESMA linha entre ciclos de espera —
    // `sla_conversa` has one key per conversation and rule. Keeping every response cycle, rather than only the latest, would require a separate table; that history is not currently needed.
    if (existente) {
      await tx
        .update(slaConversation)
        .set({ state: 'cumprido', atualizadoEm: agora })
        .where(eq(slaConversation.id, existente.id));
    }
    return;
  }

  const cumpridoEm = targetFulfillment(regra.target, marcos);
  const encerrouAntes = marcos.encerradaEm !== null && marcos.encerradaEm.getTime() < agora.getTime();
  // The clock stops at `encerradaEm`; see the Pipe decision at the top of this file.
  const fimEfetivo = encerrouAntes ? (marcos.encerradaEm as Date) : agora;

  const resultado = avaliarSla({
    regra: { prazoSeg: regra.deadlineSeg, alertaSeg: regra.alertSeg },
    inicio,
    agora: fimEfetivo,
    cumpridoEm,
  });

  let newState: string;
  let alertadoEm = existente?.alertedAt ?? null;
  let estouradoEm = existente?.exceededAt ?? null;
  let dispararAlerta = false;
  let dispararEstouro = false;

  if (resultado.cumprido) {
    newState = 'cumprido';
  } else if (resultado.state === 'estourado') {
    newState = 'estourado';
    if (!estouradoEm) {
      estouradoEm = fimEfetivo;
      dispararEstouro = true;
    }
  } else if (resultado.state === 'alerta') {
    newState = 'alertado';
    if (!alertadoEm) {
      alertadoEm = fimEfetivo;
      dispararAlerta = true;
    }
  } else {
    newState = 'correndo';
  }

  // If the conversation closes without meeting the target or breaching it first, mark the cycle complete so it does not remain `correndo` or `alertado` forever. Closing early must not count as a breach.
  // dispara nada mais tarde.
  if (marcos.encerradaEm && !resultado.cumprido && newState !== 'estourado') {
    newState = 'cancelado';
  }

  if (!existente) {
    await tx.insert(slaConversation).values({
      tenantId,
      conversaId: c.id,
      regraId: regra.id,
      prazoEm: resultado.prazoEm ?? fimEfetivo,
      state: newState,
      alertadoEm,
      estouradoEm,
    });
  } else if (
    newState !== existente.state ||
    alertadoEm?.getTime() !== existente.alertedAt?.getTime() ||
    estouradoEm?.getTime() !== existente.exceededAt?.getTime()
  ) {
    await tx
      .update(slaConversation)
      .set({ state: newState, alertadoEm, estouradoEm, atualizadoEm: agora })
      .where(eq(slaConversation.id, existente.id));
  }

  const context = { tenantId, conversationId: c.id, queueId: c.queueId, priorityCurrent: c.priority };

  if (dispararAlerta) {
    await registrarEvento(tx, {
      tenantId,
      conversationId: c.id,
      type: 'sla_alertado',
      at: alertadoEm!,
      queueId: c.queueId,
      data: { regra_id: regra.id, regra_nome: regra.name, alvo: regra.target },
    });
    await executarAcao(tx, context, regra.acaoAlert, 'sla.alertou');
  }
  if (dispararEstouro) {
    await registrarEvento(tx, {
      tenantId,
      conversationId: c.id,
      type: 'sla_estourado',
      at: estouradoEm!,
      queueId: c.queueId,
      data: { regra_id: regra.id, regra_nome: regra.name, alvo: regra.target },
    });
    await executarAcao(tx, context, regra.acaoEstouro, 'sla.estourou');
  }
}

/**
 * Check one conversation's SLA, called by each `pipe-sla` queue job or directly for each pending conversation in memory mode. Run entirely inside `noTenant`: RLS controls what `carregarRegrasSla` can see and provides the same tenant isolation as the rest of the `api`.
 */
export async function checkSlaOfConversation(
  tenantId: string,
  conversationId: string,
  agora = new Date(),
): Promise<void> {
  await noTenant(tenantId, async (tx) => {
    const [c] = await tx
      .select({
        id: conversation.id,
        queueId: conversation.filaId,
        priority: conversation.priority,
        criadaEm: conversation.criadaEm,
        assignedAt: conversation.atribuidaEm,
        firstResponseAt: conversation.firstResponseAt,
        closedAt: conversation.encerradaEm,
        lastMessageAt: conversation.lastMessageAt,
        lastMessageFrom: conversation.lastMessageOf,
      })
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1);
    // The conversation disappeared between enqueue and processing. As with media downloads, do nothing; the next sweep will no longer find it.
    if (!c) return;

    const regras = await carregarRegrasSla(tx);
    const vencedoras = rulesWinningByTarget(regras, c.queueId);
    // If this queue and tenant have no configured rule, leave the conversation unchanged.
    if (vencedoras.length === 0) return;

    const existentes = await tx
      .select({
        id: slaConversation.id,
        regraId: slaConversation.regraId,
        state: slaConversation.state,
        alertedAt: slaConversation.alertadoEm,
        exceededAt: slaConversation.estouradoEm,
      })
      .from(slaConversation)
      .where(
        and(
          eq(slaConversation.conversaId, c.id),
          inArray(
            slaConversation.regraId,
            vencedoras.map((r) => r.id),
          ),
        ),
      );
    const byRuleId = new Map(existentes.map((e) => [e.regraId, e]));

    for (const regra of vencedoras) {
      await processarRegra(tx, tenantId, c, regra, byRuleId.get(regra.id), agora);
    }
  });
}

export interface CandidataASla {
  tenantId: string;
  conversationId: string;
}

/**
 * Sweep open conversations and closed ones whose `sla_conversa` is still `correndo` or `alertado`. That final pass closes the cycle as met, canceled, or breached, as in `processarRegra`. `bancoDono()` crosses tenants only to find candidates, like `midiasPendentes` and `contatosSemEspelho`; `checarSlaDaConversa` then processes one tenant at a time under RLS.
 */
export async function conversationsForCheckSla(lote = 200): Promise<CandidataASla[]> {
  const { rows } = await databaseOwner().execute<{ tenant_id: string; id: string }>(sql`
    select distinct c.tenant_id, c.id
      from conversa c
     where c.estado in ${sql.raw(SQL_STATES_ACTIVE)}
        or exists (
             select 1 from sla_conversa sc
              where sc.conversa_id = c.id and sc.estado in ('correndo', 'alertado')
           )
     order by c.id
     limit ${lote}
  `);
  return rows.map((l) => ({ tenantId: l.tenant_id, conversationId: l.id }));
}

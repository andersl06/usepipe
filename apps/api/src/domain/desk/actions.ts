import { and, eq, isNull, sql } from 'drizzle-orm';
import { motivoInelegivel } from '@pipe/core';
import type { MotivoInelegivel } from '@pipe/core';
import { notaInterna, pausa, statusAgent } from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';
import type { StateAgent } from '@pipe/contracts';
import type { Campos, Resultado } from '../management/actions/campos.js';
import { registrarEvento } from '../eventos.js';
import { transferConversation } from '../conversation.js';
import { queuesOfAgent, ceilingWithoutFirstResponse } from '../distribution.js';
import { lerConfigAtendimento } from '../management/atendimento-config.js';

/** The transaction already has its tenant fixed; `consultar` only names the block, as in Desk. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Desk Server Actions that WROTE directly to the database were moved from `apps/desk/src/app/acoes.ts` unchanged: agent status, inactivity logout, and internal notes. Sending, retrying, closing, and waiting already called `POST /v1/conversas/…` via Next `postNaApi`; now the browser calls it directly with the cookie. No new endpoints duplicate their rules, state transitions, or events. `tenantId` and `atendenteId` come from the SESSION (`sessaoDe` in the controller), never the body: accepting `usuarioId` from the body would let any signed-in person change a colleague's status.
 */

const OK: Resultado = { ok: true };

function falha(erro: string): Resultado {
  return { ok: false, error: erro };
}

// --- status do atendente ---

export async function definirStatus(
  tx: TransactionPipe,
  tenantId: string,
  atendenteId: string,
  dados: Campos,
): Promise<Resultado> {
  const state = String(dados.get('state') ?? '') as StateAgent;
  const motivoId = String(dados.get('motivoId') ?? '') || null;

  if (!['online', 'pausa', 'invisivel', 'offline'].includes(state)) {
    return falha('Estado desconhecido.');
  }
  // Pausa exige motivo, escolhido da lista que o gestor cadastra. Sem motivo, o tempo
  // cannot feed a report, which is why it is required.
  if (state === 'pausa' && !motivoId) {
    return falha('Escolha o motivo da pausa.');
  }

  await consultar(tx, async (tx) => {
    await tx
      .insert(statusAgent)
      .values({ usuarioId: atendenteId, tenantId, estado: state, desde: new Date() })
      .onConflictDoUpdate({
        target: statusAgent.usuarioId,
        set: { estado: state, desde: new Date() },
      });

    // Sai da pausa anterior antes de abrir outra: pausa aberta em duplicidade conta
    // the same minute twice in the occupancy report.
    await tx
      .update(pausa)
      .set({ encerradaEm: new Date() })
      .where(and(eq(pausa.usuarioId, atendenteId), isNull(pausa.encerradaEm)));

    if (state === 'pausa' && motivoId) {
      await tx.insert(pausa).values({ tenantId, usuarioId: atendenteId, motivoId });
    }
  });

  return OK;
}

/**
 * Inactivity drops an agent from distribution after twenty minutes without screen activity. This follows the reference screen's ten-minute warning plus ten-minute grace period (`referencias-blip/pesquisa/blip-desk-medidas.md` §9). The browser counts time in `componentes/inatividade`; this action receives only the verdict. It is intentionally narrow and idempotent: it only moves offline and does nothing if already Offline. Otherwise an abandoned second tab could disconnect an agent actively using another tab. Close any open break too, as in `definirStatus`, or an endless break would count the same minute forever in occupancy reports.
 */
export async function failByInactivity(
  tx: TransactionPipe,
  tenantId: string,
  agentId: string,
  _dados: Campos,
): Promise<Resultado> {
  await consultar(tx, async (tx) => {
    const agora = new Date();
    await tx
      .insert(statusAgent)
      .values({ usuarioId: agentId, tenantId, estado: 'offline', desde: agora })
      .onConflictDoUpdate({
        target: statusAgent.usuarioId,
        set: { estado: 'offline', desde: agora },
        where: sql`${statusAgent.estado} <> 'offline'`,
      });

    await tx
      .update(pausa)
      .set({ encerradaEm: agora })
      .where(and(eq(pausa.usuarioId, agentId), isNull(pausa.encerradaEm)));
  });

  return OK;
}

// --- nota interna ---

/**
 * Internal notes are the former `modo === 'nota'` branch of `enviarMensagem`. A note is not a conversation message, is never sent to the client, and is outside the 24-hour window. It therefore never had a `/v1/conversas` route and is the only composer write remaining here. Free text and templates go directly from the browser to `POST /v1/conversas/:id/mensagens`.
 */
export async function salvarNotaInterna(
  tx: TransactionPipe,
  tenantId: string,
  atendenteId: string,
  data: Campos,
): Promise<Resultado> {
  const conversationId = String(data.get('conversationId') ?? '');
  const texto = String(data.get('texto') ?? '').trim();

  if (!conversationId) return falha('Conversa não informada.');
  if (!texto) return falha('Escreva alguma coisa antes de enviar.');

  await consultar(tx, async (tx) => {
    await tx
      .insert(notaInterna)
      .values({ tenantId, conversaId: conversationId, usuarioId: atendenteId, corpo: texto });
  });

  return OK;
}


/** The "full" message matches source `code 23 / "Agent ticket list is full."`, rendered in Portuguese. */
function messageOfLimit(motivo: MotivoInelegivel, ativas: number): string {
  if (motivo === 'teto_sem_primeira_resposta') {
    return 'Responda os atendimentos que ainda estão sem primeira resposta antes de puxar outro.';
  }
  return (
    `Você atingiu o limite de atendimentos simultâneos (${ativas} em andamento). ` +
    'Finalize ou transfira um atendimento para puxar outro.'
  );
}

/**
 * The column's "Atender" action mirrors source `set /tickets/claim`: the agent claims the oldest conversation among their queues. It calls `assumirConversa` (`dominio/assumir.ts`) without choosing an ID, retaining the same guard (`where estado = 'na_fila'` with `skip locked` for competing claims), `atribuicao`, and event. Only Online agents may claim, as in the source. Capacity limits also apply: the source rejects `/tickets/claim` with `code 23 / "Agent ticket list is full."` (`blip-desk-regras-tecnicas.md` §2.2–2.3). `@pipe/core` `motivoInelegivel` evaluates free capacity (`limite − ativas > 0`) and the cap on conversations lacking a first response, using `filasDoAtendente` like `distribuirConversa`; only queues with room enter the `UPDATE`. The check is atomic per agent: lock that agent's `status_atendente` row (`for update`) before counting active conversations, so simultaneous clicks run serially and the second sees the first claim. Conversation `skip locked` separately resolves competition between DIFFERENT agents.
 */
export async function atender(
  tx: TransactionPipe,
  tenantId: string,
  atendenteId: string,
  _dados: Campos,
): Promise<Resultado & { conversationId?: string }> {
  return consultar(tx, async (tx) => {
    if ((await lerConfigAtendimento(tx, tenantId)).distribuicao.bloquearSolicitacaoManual) {
      return falha('A solicitação manual de tickets está desabilitada nas Configurações gerais.');
    }
    // `for update` serializes claims per agent as described above. Online agents
    // always have this row; it records that they are online.
    const { rows: status } = await tx.execute<{ state: string }>(
      sql`select estado as "state" from status_atendente where usuario_id = ${atendenteId}::uuid for update`,
    );
    if (status[0]?.state !== 'online') return falha('Fique online para atender.');

    const options = { tetoSemPrimeiraResposta: ceilingWithoutFirstResponse() };
    const byQueue = await queuesOfAgent(tx, atendenteId);
    const comVaga: string[] = [];
    let motivoDeRecusa: MotivoInelegivel | null = null;
    for (const linha of byQueue) {
      const queueId = linha.queues[0]!;
      const motivo = motivoInelegivel(linha, { queueId, ...options });
      if (motivo === null) comVaga.push(queueId);
      else motivoDeRecusa ??= motivo;
    }
    const ativas = byQueue[0]?.ativas ?? 0;

    // With no queue that has capacity, reject for the capacity limit rather than
    // searching for a conversation the agent cannot receive. An agent in no queue
    // can only claim an unqueued conversation, for which no configured queue limit applies.
    if (comVaga.length === 0 && motivoDeRecusa !== null) {
      return falha(messageOfLimit(motivoDeRecusa, ativas));
    }

    // An unqueued conversation (a direct transfer returned to waiting) is available
    // to any agent with capacity in some queue, or to an agent in no queue
    // where no queue limit applies.
    const acceptsWithoutQueue = byQueue.length === 0 || comVaga.length > 0;
    const queuesSql =
      comVaga.length > 0
        ? sql`c.fila_id = any(${`{${comVaga.join(',')}}`}::uuid[])`
        : sql`false`;

    const em = new Date();
    const { rows } = await tx.execute<{ id: string; queueId: string | null }>(sql`
      update conversa
         set atendente_id = ${atendenteId}::uuid, estado = 'atribuida',
             atribuida_em = ${em}, atualizado_em = now()
       where id = (
         select c.id from conversa c
          where c.estado = 'na_fila'
            and ((c.fila_id is null and ${acceptsWithoutQueue}::boolean) or ${queuesSql})
          order by c.criada_em asc
          for update skip locked
          limit 1
       )
       returning id, fila_id as "queueId"
    `);
    const puxada = rows[0];
    if (!puxada) {
      // Nothing is available in queues with capacity. If people wait in a queue where
      // the agent is full, report the capacity limit as the refusal reason.
      if (motivoDeRecusa !== null) {
        const { rows: esperando } = await tx.execute<{ n: string }>(sql`
          select count(*)::text as n from conversa c
           where c.estado = 'na_fila'
             and c.fila_id in (select fila_id from fila_atendente where usuario_id = ${atendenteId}::uuid)
        `);
        if (Number(esperando[0]?.n ?? 0) > 0) {
          return falha(messageOfLimit(motivoDeRecusa, ativas));
        }
      }
      return falha('Não há clientes aguardando.');
    }

    await tx.execute(sql`
      insert into atribuicao (tenant_id, conversa_id, para_usuario_id, de_fila_id, motivo, por_usuario_id, em)
      values (${tenantId}::uuid, ${puxada.id}::uuid, ${atendenteId}::uuid,
              ${puxada.queueId}, 'assumida_pelo_atendente', ${atendenteId}::uuid, ${em})
    `);
    await registrarEvento(tx, {
      tenantId,
      conversationId: puxada.id,
      type: 'atribuida',
      at: em,
      userId: atendenteId,
      queueId: puxada.queueId,
    });
    return { ok: true, conversaId: puxada.id };
  });
}


/**
 * The source "Ações em Massa" screen transfers several tickets to a queue or agent. Call `transferirConversa` (`dominio/conversa.ts`) serially, one conversation and transaction at a time. Each transfer closes and opens a conversation and records its event. Return the transferred count and first refusal reason, if any.
 */
export async function transferInBulk(
  _tx: TransactionPipe,
  tenantId: string,
  atendenteId: string,
  dados: Campos,
): Promise<Resultado & { transferidas?: number }> {
  const ids = dados.getAll('conversaId').filter(Boolean);
  const forQueueId = String(dados.get('paraFilaId') ?? '') || null;
  const forAgentId = String(dados.get('paraAtendenteId') ?? '') || null;
  if (ids.length === 0) return falha('Selecione ao menos um atendimento.');
  if (!forQueueId && !forAgentId) return falha('Escolha a fila ou o atendente de destino.');

  let transferidas = 0;
  let firstError: string | null = null;
  for (const conversationId of ids) {
    try {
      await transferConversation(
        { tenantId, agentId: atendenteId, requireAssignment: true },
        { conversationId, forQueueId, forAgentId, reason: 'Transferência em massa' },
      );
      transferidas += 1;
    } catch (error) {
      firstError ??= error instanceof Error ? error.message : 'Falha ao transferir.';
    }
  }
  if (transferidas === 0) return falha(firstError ?? 'Nenhum atendimento foi transferido.');
  return { ok: true, transferidas, ...(firstError ? { error: firstError } : {}) };
}

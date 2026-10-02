import { sql } from 'drizzle-orm';
import { SQL_STATES_ACTIVE } from '@pipe/core';
import { closeConversation, transferConversation } from '@pipe/api/domain/conversation';
import { assumeConversation } from '@pipe/api/domain/assume';
import { flowOfConversation } from '@pipe/api/domain/queue-entry';
import { sendMessage } from '@pipe/api/domain/sending';
import { noTenant } from './database.js';
import type { Session } from './rotas.js';

/**
 * Screen actions include claiming, replying, transferring, and closing. Each calls the domain function already used by `apps/api`, with the same state machine, events, and limits. The bridge only translates screen vocabulary into Pipe's. Claiming is a transfer to oneself in terms of rules: valid state, queue, and capacity. A separate path would duplicate the state machine just to save one line.
 */

/** The actor for a screen action is the signed-in agent acting on their own behalf. */
function ator(session: Session, requireAssignment: boolean) {
  return { tenantId: session.tenantId, agentId: session.userId, requireAssignment };
}

export async function assumir(session: Session, conversationId: string): Promise<void> {
  /*
   * Claiming is NOT transferring to oneself: a transfer closes this conversation and opens another, following the source platform's model. See `dominio/assumir.ts`.
   */
  await assumeConversation({ tenantId: session.tenantId, agentId: session.userId }, conversationId);
}

/** Claim the oldest conversation among the requester's queues. */
export async function assumirProximo(session: Session): Promise<string | null> {
  const id = await noTenant(session.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select c.id
        from conversa c
        join fila_atendente fa
          on fa.fila_id = c.fila_id and fa.usuario_id = ${session.userId}::uuid
       where c.estado = 'Waiting'
       order by c.criada_em
       limit 1
    `);
    return rows[0]?.id ?? null;
  });
  if (!id) return null;
  await assumir(session, id);
  return id;
}

/**
 * The screen sends a message to an IDENTITY (`5531988887777@wa.gw.msging.net`), not a conversation; that is how its protocol works. Resolve this identity to the open conversation for that phone number.
 */
export async function identityConversation(
  session: Session,
  identity: string,
): Promise<string | null> {
  const telefone = '+' + String(identity).split('@')[0]!.replace(/[^0-9]/g, '');
  return noTenant(session.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select c.id from conversa c
        join contato ct on ct.id = c.contato_id
       where ct.telefone_e164 = ${telefone}
         and c.estado in ${sql.raw(SQL_STATES_ACTIVE)}
       order by c.criada_em desc
       limit 1
    `);
    return rows[0]?.id ?? null;
  });
}

export async function responder(
  session: Session,
  conversationId: string,
  texto: string,
): Promise<{ messageId: string; withinWindow: boolean }> {
  const enfileirada = await sendMessage({
    tenantId: session.tenantId,
    conversationId,
    agentId: session.userId,
    texto,
  });
  /*
   * Return `dentroDaJanela` too: outside the 24-hour window Meta delivers only templates, and the screen must warn the sender.
   */
  return { messageId: enfileirada.id, withinWindow: enfileirada.insideOfWindow };
}

export async function transferForQueue(
  session: Session,
  conversationId: string,
  queueName: string,
): Promise<void> {
  const queueId = await noTenant(session.tenantId, async (tx) => {
    // Names repeat across flows (unique per flow only): look only inside the flow serving this conversation.
    const flowId = await flowOfConversation(tx, session.tenantId, conversationId);
    if (!flowId) return null;
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from fila
       where tenant_id = ${session.tenantId}::uuid and fluxo_id = ${flowId}::uuid and ativa and nome = ${queueName}
       limit 1
    `);
    return rows[0]?.id ?? null;
  });
  if (!queueId) throw new Error(`fila "${queueName}" não existe neste cliente`);
  await transferConversation(ator(session, false), { conversationId, forQueueId: queueId });
}

/**
 * The screen sends the selected tag names; each is looked up by name among the client's conversation tags. A name with no matching tag is reported and skipped: no other tag is substituted and none is created (that is the tag screen's job), and the conversation closes with the tags found, if any. Mandatory tags are still enforced by `closeConversation`.
 */
export async function encerrar(
  session: Session,
  conversationId: string,
  nomes: string[] = [],
): Promise<void> {
  const etiquetaIds = await noTenant(session.tenantId, async (tx) => {
    const ids: string[] = [];
    for (const nome of nomes) {
      const { rows } = await tx.execute<{ id: string }>(sql`
        select id from etiqueta
         where tenant_id = ${session.tenantId}::uuid and nome = ${nome} and escopo in ('conversa', 'ambos')
         limit 1
      `);
      if (rows[0]) ids.push(rows[0].id);
      else console.warn(`[bridge] etiqueta "${nome}" não existe neste cliente; encerrando sem ela (conversa ${conversationId})`);
    }
    return ids;
  });

  await closeConversation(ator(session, true), { conversationId, etiquetaIds });
}

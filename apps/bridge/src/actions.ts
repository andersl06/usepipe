import { sql } from 'drizzle-orm';
import { closeConversation, transferConversation } from '@pipe/api/domain/conversation';
import { assumeConversation } from '@pipe/api/domain/assume';
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
       where c.estado = 'na_fila'
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
         and c.estado in ('na_fila','atribuida','em_atendimento','em_espera')
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
    const { rows } = await tx.execute<{ id: string }>(
      sql`select id from fila where nome = ${queueName} limit 1`,
    );
    return rows[0]?.id ?? null;
  });
  if (!queueId) throw new Error(`fila "${queueName}" não existe neste cliente`);
  await transferConversation(ator(session, false), { conversationId, forQueueId: queueId });
}

/**
 * Closing requires a tag: a closed conversation without a reason makes later reports meaningless, and the source screen already enforced this. The screen sends selected tag names. Use the first supplied tag if it exists; otherwise use the client's first conversation tag. If the client has none, create the supplied name or "Encerrado pelo atendente" when no name was supplied. New companies commonly have no tags, and blocking closure would be worse than recording a generic reason.
 */
export async function encerrar(
  session: Session,
  conversationId: string,
  nomes: string[] = [],
): Promise<void> {
  const etiquetaId = await noTenant(session.tenantId, async (tx) => {
    const nome = nomes[0];
    if (nome) {
      const { rows } = await tx.execute<{ id: string }>(
        sql`select id from etiqueta where nome = ${nome} limit 1`,
      );
      if (rows[0]) return rows[0].id;
    }
    const { rows: first } = await tx.execute<{ id: string }>(
      sql`select id from etiqueta where escopo = 'conversa' order by criado_em limit 1`,
    );
    if (first[0]) return first[0].id;

    const { rows: criada } = await tx.execute<{ id: string }>(sql`
      insert into etiqueta (tenant_id, nome, escopo)
      values (${session.tenantId}::uuid, ${nome ?? 'Encerrado pelo atendente'}, 'conversa')
      returning id
    `);
    return criada[0]!.id;
  });

  await closeConversation(ator(session, true), { conversationId, etiquetaIds: [etiquetaId] });
}

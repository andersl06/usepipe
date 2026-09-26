import { sql } from 'drizzle-orm';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { registrarEvento } from './eventos.js';

/**
 * Let an attendant claim a queued conversation. Automatic load distribution and transfer existed, but claim did not, even though selecting and taking a conversation from the queue is a common attendant action. Do not reuse `transferirConversa`: the source platform's transfer closes the current conversation and opens another (reason "Transferida"). Using it to claim would close the customer conversation and create an empty one, as a previous shortcut did. Like automatic distribution, claim only from `na_fila`. If two attendants click together, the second update changes no row and is rejected; the database `where` decides the winner without a race.
 */
export async function assumeConversation(
  ator: { tenantId: string; agentId: string },
  conversationId: string,
  em = new Date(),
): Promise<{ conversationId: string; queueId: string | null }> {
  return noTenant(ator.tenantId, async (tx) => {
    const { rows: antes } = await tx.execute<{ state: string; queueId: string | null }>(
      sql`select estado, fila_id from conversa where id = ${conversationId}::uuid limit 1`,
    );
    const conversation = antes[0];
    if (!conversation) throw PipeError.naoEncontrado('Conversa');

    const { rowCount } = await tx.execute(sql`
      update conversa
         set atendente_id = ${ator.agentId}::uuid, estado = 'atribuida',
             atribuida_em = ${em}, atualizado_em = now()
       where id = ${conversationId}::uuid and estado = 'na_fila'
    `);

    if (!rowCount) {
      throw PipeError.request(
        'conversation_unavailable',
        conversation.state === 'na_fila'
          ? 'Não foi possível assumir a conversa.'
          : `A conversa não está na fila (estado: ${conversation.state}).`,
      );
    }

    await tx.execute(sql`
      insert into atribuicao (tenant_id, conversa_id, para_usuario_id, de_fila_id, motivo, por_usuario_id, em)
      values (${ator.tenantId}::uuid, ${conversationId}::uuid, ${ator.agentId}::uuid,
              ${conversation.queueId}, 'assumida_pelo_atendente', ${ator.agentId}::uuid, ${em})
    `);

    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversationId,
      type: 'atribuida',
      at: em,
      userId: ator.agentId,
      queueId: conversation.queueId,
    });

    return { conversationId, queueId: conversation.queueId };
  });
}

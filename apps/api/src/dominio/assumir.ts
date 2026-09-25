import { sql } from 'drizzle-orm';
import { noTenant } from '../banco.js';
import { PipeError } from '../erros.js';
import { registrarEvento } from './eventos.js';

/**
 * O atendente pega para si uma conversa que está na fila.
 *
 * Existia distribuição automática (por carga) e existia transferência, mas **não
 * existia assumir** — e assumir é a ação mais usada da tela do atendente: ele vê a
 * fila, escolhe e puxa.
 *
 * Por que não dá para reaproveitar transferência: `transferirConversa` segue o
 * modelo da plataforma de origem, onde transferir **encerra a conversa e abre outra**
 * (motivo "Transferida"). Usar aquilo para assumir fecharia a conversa do cliente e
 * criaria uma vazia — foi o que aconteceu quando tentei o atalho.
 *
 * A trava é a mesma da distribuição automática: só sai de `na_fila`. Se duas pessoas
 * clicarem ao mesmo tempo, a segunda não muda nada e recebe recusa — o `where` faz o
 * desempate no banco, sem corrida.
 */
export async function assumeConversation(
  ator: { tenantId: string; agentId: string },
  conversationId: string,
  em = new Date(),
): Promise<{ conversationId: string; queueId: string | null }> {
  return noTenant(ator.tenantId, async (tx) => {
    const { rows: antes } = await tx.execute<{ state: string; fila_id: string | null }>(
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
        'conversa_indisponivel',
        conversation.state === 'na_fila'
          ? 'Não foi possível assumir a conversa.'
          : `A conversa não está na fila (estado: ${conversation.state}).`,
      );
    }

    await tx.execute(sql`
      insert into atribuicao (tenant_id, conversa_id, para_usuario_id, de_fila_id, motivo, por_usuario_id, em)
      values (${ator.tenantId}::uuid, ${conversationId}::uuid, ${ator.agentId}::uuid,
              ${conversation.fila_id}, 'assumida_pelo_atendente', ${ator.agentId}::uuid, ${em})
    `);

    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversationId,
      tipo: 'atribuida',
      em,
      userId: ator.agentId,
      queueId: conversation.fila_id,
    });

    return { conversationId, filaId: conversation.fila_id };
  });
}

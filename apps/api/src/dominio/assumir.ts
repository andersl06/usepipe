import { sql } from 'drizzle-orm';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
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
export async function assumirConversa(
  ator: { tenantId: string; atendenteId: string },
  conversaId: string,
  em = new Date(),
): Promise<{ conversaId: string; filaId: string | null }> {
  return noTenant(ator.tenantId, async (tx) => {
    const { rows: antes } = await tx.execute<{ estado: string; fila_id: string | null }>(
      sql`select estado, fila_id from conversa where id = ${conversaId}::uuid limit 1`,
    );
    const conversa = antes[0];
    if (!conversa) throw ErroPipe.naoEncontrado('Conversa');

    const { rowCount } = await tx.execute(sql`
      update conversa
         set atendente_id = ${ator.atendenteId}::uuid, estado = 'atribuida',
             atribuida_em = ${em}, atualizado_em = now()
       where id = ${conversaId}::uuid and estado = 'na_fila'
    `);

    if (!rowCount) {
      throw ErroPipe.requisicao(
        'conversa_indisponivel',
        conversa.estado === 'na_fila'
          ? 'Não foi possível assumir a conversa.'
          : `A conversa não está na fila (estado: ${conversa.estado}).`,
      );
    }

    await tx.execute(sql`
      insert into atribuicao (tenant_id, conversa_id, para_usuario_id, de_fila_id, motivo, por_usuario_id, em)
      values (${ator.tenantId}::uuid, ${conversaId}::uuid, ${ator.atendenteId}::uuid,
              ${conversa.fila_id}, 'assumida_pelo_atendente', ${ator.atendenteId}::uuid, ${em})
    `);

    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversaId,
      tipo: 'atribuida',
      em,
      usuarioId: ator.atendenteId,
      filaId: conversa.fila_id,
    });

    return { conversaId, filaId: conversa.fila_id };
  });
}

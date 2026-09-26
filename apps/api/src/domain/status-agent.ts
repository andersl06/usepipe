import { sql } from 'drizzle-orm';
import { schema } from '@pipe/db';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { exigirPermission } from '../session.js';
import { evento, publicar } from '../realtime.js';

/**
 * Agent status is online, paused, invisible, or offline. Keep this transition in the API domain, as with closing and pausing conversations: the event cannot depend on a screen remembering to emit it. Otherwise Management learns of exits only on refresh, and disconnecting an inactive agent could not change another person's status safely through the screen.
 */

const STATES_AGENT = schema.STATES_AGENT;

export type StateAgent = (typeof STATES_AGENT)[number];

export function ehStateAgent(value: string): value is StateAgent {
  return (STATES_AGENT as readonly string[]).includes(value);
}

export interface PedidoDeStatus {
  tenantId: string;
  /** Requesting actor; null means an integration. */
  byUserId: string | null;
  /** Agent whose status changes; unlike `porUsuarioId`, this can be a supervisor action. */
  targetUserId: string;
  state: StateAgent;
  motivoPausaId?: string | null;
}

export async function definirStatus(pedido: PedidoDeStatus): Promise<{ state: StateAgent }> {
  // Pausa exige motivo, escolhido da lista que o gestor cadastra. Sem motivo, o tempo
  if (pedido.state === 'pausa' && !pedido.motivoPausaId) {
    throw PipeError.request('reason_required', 'Escolha o motivo da pausa.');
  }

  const agora = new Date();

  await noTenant(pedido.tenantId, async (tx) => {
    // Changing another agent's status requires supervision permission, as when Management disconnects an inactive agent. Agents may change their own status without that permission.
    //
    // Reuse `monitoramento.tempo_real.ver`, already granted to `supervisor` and used by the screen initiating this action.
    //
    // ponytail: this borrows `monitoramento.tempo_real.ver`; a dedicated `atendente.gerenciar` permission would require adding it to `CATALOGO_PERMISSOES` in `packages/db/src/semente.ts`, assigning it to supervisors, and changing this check. Until then, anyone allowed to monitor can disconnect an agent. That audience overlaps today by coincidence rather than design.
    if (pedido.byUserId && pedido.byUserId !== pedido.targetUserId) {
      await exigirPermission(tx, pedido.byUserId, 'monitoramento.tempo_real.ver');
    }

    const { rows } = await tx.execute<{ id: string }>(
      sql`select id from usuario where id = ${pedido.targetUserId}::uuid and ativo limit 1`,
    );
    if (!rows[0]) throw PipeError.naoEncontrado('Atendente');

    await tx.execute(sql`
      insert into status_atendente (usuario_id, tenant_id, estado, desde)
      values (${pedido.targetUserId}, ${pedido.tenantId}, ${pedido.state}, ${agora})
      on conflict (usuario_id) do update set estado = ${pedido.state}, desde = ${agora}
    `);

    // Sai da pausa anterior antes de abrir outra: pausa aberta em duplicidade conta o
    // Avoid counting the same minute twice in the occupancy report.
    await tx.execute(sql`
      update pausa set encerrada_em = ${agora}
       where usuario_id = ${pedido.targetUserId}::uuid and encerrada_em is null
    `);

    if (pedido.state === 'pausa' && pedido.motivoPausaId) {
      const { rows: motivos } = await tx.execute<{ id: string }>(
        sql`select id from motivo_pausa where id = ${pedido.motivoPausaId}::uuid and ativo limit 1`,
      );
      if (!motivos[0]) throw PipeError.naoEncontrado('Motivo de pausa');
      await tx.execute(sql`
        insert into pausa (tenant_id, usuario_id, motivo_id)
        values (${pedido.tenantId}, ${pedido.targetUserId}, ${pedido.motivoPausaId})
      `);
    }
  });

  // Emit only after commit, like other domain actions.
  //
  // Omit `usuarioId` deliberately: status changes concern the whole team. Management updates presence and Desk knows who can receive transfers; this is not private user data.
  await publicar(pedido.tenantId, evento('agent', pedido.targetUserId));
  // Leaving online status effectively returns conversations to the queue; refresh the list.
  await publicar(pedido.tenantId, evento('queue'));

  return { state: pedido.state };
}

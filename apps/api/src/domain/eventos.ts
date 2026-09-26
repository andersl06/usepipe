import { sql } from 'drizzle-orm';
import type { TipoEvento } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';

/**
 * Immutable `evento_atendimento` is the source of all metrics (data model §4). Writing an event is data, not a log: tomorrow's report is recalculated from it.
 */
export async function registrarEvento(
  tx: TransactionPipe,
  inbound: {
    tenantId: string;
    conversationId: string;
    type: TipoEvento;
    at?: Date;
    userId?: string | null;
    queueId?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into evento_atendimento (tenant_id, conversa_id, tipo, em, usuario_id, fila_id, dados)
    values (
      ${inbound.tenantId}, ${inbound.conversationId}, ${inbound.type},
      ${inbound.at ?? new Date()}, ${inbound.userId ?? null}, ${inbound.queueId ?? null},
      ${JSON.stringify(inbound.data ?? {})}::jsonb
    )
  `);
}

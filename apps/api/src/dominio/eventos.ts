import { sql } from 'drizzle-orm';
import type { TipoEvento } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';

/**
 * `evento_atendimento` é a fonte de toda métrica (modelo de dados §4) e é imutável.
 * Gravar o evento não é log: é o dado do qual o relatório de amanhã será recalculado.
 */
export async function registrarEvento(
  tx: TransactionPipe,
  inbound: {
    tenantId: string;
    conversationId: string;
    tipo: TipoEvento;
    em?: Date;
    userId?: string | null;
    queueId?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into evento_atendimento (tenant_id, conversa_id, tipo, em, usuario_id, fila_id, dados)
    values (
      ${inbound.tenantId}, ${inbound.conversationId}, ${inbound.tipo},
      ${inbound.em ?? new Date()}, ${inbound.userId ?? null}, ${inbound.queueId ?? null},
      ${JSON.stringify(inbound.data ?? {})}::jsonb
    )
  `);
}

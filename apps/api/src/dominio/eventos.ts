import { sql } from 'drizzle-orm';
import type { TipoEvento } from '@pipe/core';
import type { TransacaoPipe } from '@pipe/db';

/**
 * `evento_atendimento` é a fonte de toda métrica (modelo de dados §4) e é imutável.
 * Gravar o evento não é log: é o dado do qual o relatório de amanhã será recalculado.
 */
export async function registrarEvento(
  tx: TransacaoPipe,
  entrada: {
    tenantId: string;
    conversaId: string;
    tipo: TipoEvento;
    em?: Date;
    usuarioId?: string | null;
    filaId?: string | null;
    dados?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into evento_atendimento (tenant_id, conversa_id, tipo, em, usuario_id, fila_id, dados)
    values (
      ${entrada.tenantId}, ${entrada.conversaId}, ${entrada.tipo},
      ${entrada.em ?? new Date()}, ${entrada.usuarioId ?? null}, ${entrada.filaId ?? null},
      ${JSON.stringify(entrada.dados ?? {})}::jsonb
    )
  `);
}

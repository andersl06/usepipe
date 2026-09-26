import { sql } from 'drizzle-orm';
import type { DatabasePipe } from './cliente.js';

/**
 * `message` and `evento_atendimento` grow without bound and are queried by period, so both are partitioned monthly. This routine creates the next partition before it is needed; missing partitions cause inserts to fail at the worst time. It runs as table owner, like migrations, because it creates tables.
 */
export const TABELAS_PARTICIONADAS = ['mensagem', 'evento_atendimento'] as const;

export type TabelaParticionada = (typeof TABELAS_PARTICIONADAS)[number];

export function mesesAPartir(referencia: Date, quantity: number): Date[] {
  const meses: Date[] = [];
  for (let i = 0; i < quantity; i += 1) {
    meses.push(new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + i, 1)));
  }
  return meses;
}

export function namePartition(tabela: TabelaParticionada, mes: Date): string {
  const ano = mes.getUTCFullYear();
  const numeroMes = String(mes.getUTCMonth() + 1).padStart(2, '0');
  return `${tabela}_${ano}_${numeroMes}`;
}

/**
 * Ensure partitions for the current month and the next `mesesAFrente` months. Idempotent: a second call on the same day changes nothing.
 */
export async function ensurePartitions(
  db: DatabasePipe,
  mesesAFrente = 3,
  referencia = new Date(),
): Promise<string[]> {
  const criadas: string[] = [];
  for (const mes of mesesAPartir(referencia, mesesAFrente + 1)) {
    const dia = mes.toISOString().slice(0, 10);
    for (const tabela of TABELAS_PARTICIONADAS) {
      await db.execute(sql`select pipe_criar_particao_mes(${tabela}, ${dia}::date)`);
      criadas.push(namePartition(tabela, mes));
    }
  }
  return criadas;
}

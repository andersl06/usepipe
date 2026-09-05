import { sql } from 'drizzle-orm';
import type { BancoPipe } from './cliente.js';

/**
 * `mensagem` e `evento_atendimento` crescem sem limite e são sempre consultadas por
 * período. As duas são particionadas por mês; esta é a rotina que cria a partição do
 * mês seguinte antes que ela seja necessária — partição que falta vira erro de insert
 * na hora errada, que é de madrugada.
 *
 * Roda com o papel dono das tabelas (o mesmo das migrations), porque cria tabela.
 */
export const TABELAS_PARTICIONADAS = ['mensagem', 'evento_atendimento'] as const;

export type TabelaParticionada = (typeof TABELAS_PARTICIONADAS)[number];

export function mesesAPartir(referencia: Date, quantidade: number): Date[] {
  const meses: Date[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    meses.push(new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + i, 1)));
  }
  return meses;
}

export function nomeParticao(tabela: TabelaParticionada, mes: Date): string {
  const ano = mes.getUTCFullYear();
  const numeroMes = String(mes.getUTCMonth() + 1).padStart(2, '0');
  return `${tabela}_${ano}_${numeroMes}`;
}

/**
 * Garante as partições do mês corrente e dos `mesesAFrente` seguintes. Idempotente:
 * chamar duas vezes no mesmo dia não faz nada na segunda.
 */
export async function garantirParticoes(
  db: BancoPipe,
  mesesAFrente = 3,
  referencia = new Date(),
): Promise<string[]> {
  const criadas: string[] = [];
  for (const mes of mesesAPartir(referencia, mesesAFrente + 1)) {
    const dia = mes.toISOString().slice(0, 10);
    for (const tabela of TABELAS_PARTICIONADAS) {
      await db.execute(sql`select pipe_criar_particao_mes(${tabela}, ${dia}::date)`);
      criadas.push(nomeParticao(tabela, mes));
    }
  }
  return criadas;
}

import { sql } from 'drizzle-orm';
import type { TransactionPipe as TransactionPipe } from '@pipe/db';
import { tenant } from '@pipe/db/schema';

/** Um intervalo em instantes, já no fuso da conta — o `Janela` de `lib/banco.ts` da Gestão. */
export interface Window {
  start: Date;
  end: Date;
}

/** O fuso do tenant, para o "hoje" dos cartões não ser o fuso do servidor. */
export async function fusoDoTenant(tx: TransactionPipe): Promise<string> {
  const [linha] = await tx.select({ fuso: tenant.fuso }).from(tenant).limit(1);
  return linha?.fuso ?? 'America/Sao_Paulo';
}

/**
 * Início e fim do dia corrente no fuso do tenant.
 *
 * A conta é feita pelo Postgres de propósito: é ele que conhece o banco de fusos,
 * e reimplementar horário de verão em JavaScript é como se perde um dia inteiro.
 */
export async function windowOfToday(tx: TransactionPipe, fuso: string): Promise<Window> {
  const r = await tx.execute<{ start: Date; end: Date }>(
    sql`select date_trunc('day', now() at time zone ${fuso}) at time zone ${fuso} as inicio,
               (date_trunc('day', now() at time zone ${fuso}) + interval '1 day') at time zone ${fuso} as fim`,
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('não consegui calcular a janela de hoje');
  return { inicio: new Date(linha.start), fim: new Date(linha.end) };
}

/** Do começo de `de` ao fim de `ate` (inclusivo), dias de calendário no fuso da conta. */
export async function windowOfDatas(
  tx: TransactionPipe,
  fuso: string,
  de: string,
  ate: string,
): Promise<Window> {
  const r = await tx.execute<{ start: Date; end: Date }>(
    sql`select (${de}::date)::timestamp at time zone ${fuso} as inicio,
               ((${ate}::date + 1)::timestamp) at time zone ${fuso} as fim`,
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('período inválido');
  return { inicio: new Date(linha.start), fim: new Date(linha.end) };
}

/** `AAAA-MM-DD` de um instante, no fuso da conta. */
export function dataIso(instante: Date, fuso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(instante);
}

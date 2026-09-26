import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import { tenant } from '@pipe/db/schema';

/** Instant range in the account time zone, equivalent to Management's `Janela` in `lib/banco.ts`. */
export interface Window {
  start: Date;
  end: Date;
}

/** Use the tenant time zone for card 'today', not the server time zone. */
export async function fusoDoTenant(tx: TransactionPipe): Promise<string> {
  const [linha] = await tx.select({ fuso: tenant.fuso }).from(tenant).limit(1);
  return linha?.fuso ?? 'America/Sao_Paulo';
}

/**
 * Compute current-day bounds in the tenant time zone with PostgreSQL, which knows the time-zone database; duplicating daylight-saving logic in JavaScript risks losing a whole day.
 */
export async function windowOfToday(tx: TransactionPipe, fuso: string): Promise<Window> {
  const r = await tx.execute<{ inicio: Date; fim: Date }>(
    sql`select date_trunc('day', now() at time zone ${fuso}) at time zone ${fuso} as inicio,
               (date_trunc('day', now() at time zone ${fuso}) + interval '1 day') at time zone ${fuso} as fim`,
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('não consegui calcular a janela de hoje');
  return { start: new Date(linha.inicio), end: new Date(linha.fim) };
}

/** From the start of `de` through the inclusive end of `ate`, as calendar days in the account time zone. */
export async function windowOfDates(
  tx: TransactionPipe,
  fuso: string,
  de: string,
  ate: string,
): Promise<Window> {
  const r = await tx.execute<{ inicio: Date; fim: Date }>(
    sql`select (${de}::date)::timestamp at time zone ${fuso} as inicio,
               ((${ate}::date + 1)::timestamp) at time zone ${fuso} as fim`,
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('período inválido');
  return { start: new Date(linha.inicio), end: new Date(linha.fim) };
}

/** `AAAA-MM-DD` de um instante, no fuso da conta. */
export function dataIso(instante: Date, fuso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(instante);
}

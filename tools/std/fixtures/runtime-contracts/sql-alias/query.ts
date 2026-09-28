import { sql } from './lib/sql-tag.ts';

export async function loadRow(tx: { execute: <T>(query: unknown) => Promise<{ rows: T[] }> }) {
  const { rows } = await tx.execute<{ nameX: string }>(sql`select nome_x as "nomeX" from t`);
  const row = rows[0]!;
  return row.nameX;
}

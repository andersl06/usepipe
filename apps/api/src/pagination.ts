import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { PipeError } from './errors.js';

/**
 * Cursor pagination, sorting, and filtering (`apis.md` §5.3) use the previous page's last key rather than `offset`, which skips or repeats items under concurrent writes. Break ties with `id` for a total order. Keep `page_info.has_next_page` explicit because `data.length < limit` is false at an exact end boundary.
 */

export const LIMITE_PADRAO = 50;
export const LIMITE_TETO = 100;

export interface Cursor {
  /** Serialized sort-field value. */
  value: string;
  id: string;
}

export interface PageInfo {
  has_next_page: boolean;
  end_cursor: string | null;
}

export interface Page<T> {
  data: T[];
  page_info: PageInfo;
}

export function lerLimite(bruto: unknown): number {
  if (bruto === undefined || bruto === null || bruto === '') return LIMITE_PADRAO;
  const numero = Number(bruto);
  if (!Number.isInteger(numero) || numero < 1) {
    throw PipeError.request('limit_invalid', 'limit precisa ser inteiro maior que zero.');
  }
  // O cliente pode pedir menos, nunca mais.
  return Math.min(numero, LIMITE_TETO);
}

export function escreverCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function lerCursor(bruto: unknown): Cursor | null {
  if (bruto === undefined || bruto === null || bruto === '') return null;
  try {
    const objeto = JSON.parse(Buffer.from(String(bruto), 'base64url').toString('utf8')) as Cursor;
    if (typeof objeto.value !== 'string' || typeof objeto.id !== 'string') throw new Error();
    return objeto;
  } catch {
    throw PipeError.request('cursor_invalid', 'cursor não é um cursor desta API.');
  }
}

export type Direction = 'asc' | 'desc';

export interface Sorting {
  campo: string;
  direction: Direction;
}

/**
 * Parse `order_by=criada_em[desc]` against each route's allowed fields. Reject unknown fields rather than silently falling back to Postgres's natural order.
 */
export function readSorting(
  bruto: unknown,
  permitidos: readonly string[],
  padrao: Sorting,
): Sorting {
  if (bruto === undefined || bruto === null || bruto === '') return padrao;
  const texto = String(bruto).trim();
  const casado = /^([a-z_]+)(?:\[(asc|desc)\])?$/i.exec(texto);
  if (!casado || !casado[1] || !permitidos.includes(casado[1])) {
    throw PipeError.request(
      'order_by_invalid',
      `order_by aceita ${permitidos.join(', ')} com [asc] ou [desc].`,
    );
  }
  return { campo: casado[1], direction: (casado[2]?.toLowerCase() as Direction) ?? 'desc' };
}

/**
 * Use keyset tuple comparison `(campo, id) < (valor, id)` so Postgres can use a composite index, rather than an expanded OR condition. `expressao` comes from a closed column list, never client input.
 */
export function conditionOfCursor(
  expressao: string,
  tipo: 'timestamptz' | 'text',
  direcao: Direction,
  cursor: Cursor | null,
  columnId = 'id',
): SQL {
  if (!cursor) return sql`true`;
  const comparador = sql.raw(direcao === 'desc' ? '<' : '>');
  return sql`(${sql.raw(expressao)}, ${sql.raw(columnId)}) ${comparador} (${cursor.value}::${sql.raw(tipo)}, ${cursor.id}::uuid)`;
}

export function orderSql(expressao: string, direction: Direction, colunaId = 'id'): SQL {
  return sql`${sql.raw(expressao)} ${sql.raw(direction)}, ${sql.raw(colunaId)} ${sql.raw(direction)}`;
}

/**
 * Read `limite + 1` rows; the extra row proves another page exists without a count query.
 */
export function assemblePage<T>(
  linhas: T[],
  limite: number,
  key: (linha: T) => Cursor,
): Page<T> {
  const temMais = linhas.length > limite;
  const data = temMais ? linhas.slice(0, limite) : linhas;
  const ultima = data[data.length - 1];
  return {
    data,
    page_info: {
      has_next_page: temMais,
      end_cursor: ultima ? escreverCursor(key(ultima)) : null,
    },
  };
}

import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { ErroPipe } from './erros.js';

/**
 * Paginação por cursor, ordenação e filtro — `apis.md` §5.3.
 *
 * Cursor e não `offset`: com escrita concorrente, `offset` pula e repete item entre
 * páginas. O cursor é a chave da última linha da página anterior, e o desempate
 * final é sempre `id`, para nunca haver ordenação ambígua.
 *
 * `page_info.has_next_page` é explícito porque `data.length < limit` mente quando o
 * limite bate exato no fim da coleção.
 */

export const LIMITE_PADRAO = 50;
export const LIMITE_TETO = 100;

export interface Cursor {
  /** Valor do campo de ordenação, serializado. */
  valor: string;
  id: string;
}

export interface PageInfo {
  has_next_page: boolean;
  end_cursor: string | null;
}

export interface Pagina<T> {
  data: T[];
  page_info: PageInfo;
}

export function lerLimite(bruto: unknown): number {
  if (bruto === undefined || bruto === null || bruto === '') return LIMITE_PADRAO;
  const numero = Number(bruto);
  if (!Number.isInteger(numero) || numero < 1) {
    throw ErroPipe.requisicao('limite_invalido', 'limit precisa ser inteiro maior que zero.');
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
    if (typeof objeto.valor !== 'string' || typeof objeto.id !== 'string') throw new Error();
    return objeto;
  } catch {
    throw ErroPipe.requisicao('cursor_invalido', 'cursor não é um cursor desta API.');
  }
}

export type Direcao = 'asc' | 'desc';

export interface Ordenacao {
  campo: string;
  direcao: Direcao;
}

/**
 * `order_by=criada_em[desc]`, com o campo validado contra a lista da rota. Campo
 * fora da lista é erro, não silêncio: ordenar por coluna inexistente devolveria a
 * ordem "natural" do Postgres e ninguém perceberia.
 */
export function lerOrdenacao(
  bruto: unknown,
  permitidos: readonly string[],
  padrao: Ordenacao,
): Ordenacao {
  if (bruto === undefined || bruto === null || bruto === '') return padrao;
  const texto = String(bruto).trim();
  const casado = /^([a-z_]+)(?:\[(asc|desc)\])?$/i.exec(texto);
  if (!casado || !casado[1] || !permitidos.includes(casado[1])) {
    throw ErroPipe.requisicao(
      'order_by_invalido',
      `order_by aceita ${permitidos.join(', ')} com [asc] ou [desc].`,
    );
  }
  return { campo: casado[1], direcao: (casado[2]?.toLowerCase() as Direcao) ?? 'desc' };
}

/**
 * Condição de continuação da página, em keyset.
 *
 * `(campo, id) < (valor, id)` numa tupla só, e não `campo < valor or (campo = valor
 * and id < id)`: além de ser mais curto, o Postgres usa o índice composto na forma
 * de tupla. `expressao` já vem de uma lista fechada de colunas — nunca do cliente.
 */
export function condicaoDeCursor(
  expressao: string,
  tipo: 'timestamptz' | 'text',
  direcao: Direcao,
  cursor: Cursor | null,
  colunaId = 'id',
): SQL {
  if (!cursor) return sql`true`;
  const comparador = sql.raw(direcao === 'desc' ? '<' : '>');
  return sql`(${sql.raw(expressao)}, ${sql.raw(colunaId)}) ${comparador} (${cursor.valor}::${sql.raw(tipo)}, ${cursor.id}::uuid)`;
}

export function ordemSql(expressao: string, direcao: Direcao, colunaId = 'id'): SQL {
  return sql`${sql.raw(expressao)} ${sql.raw(direcao)}, ${sql.raw(colunaId)} ${sql.raw(direcao)}`;
}

/**
 * Monta a página a partir de `limite + 1` linhas lidas: a linha extra é o que prova
 * que existe página seguinte, sem uma segunda consulta de contagem.
 */
export function montarPagina<T>(
  linhas: T[],
  limite: number,
  chave: (linha: T) => Cursor,
): Pagina<T> {
  const temMais = linhas.length > limite;
  const data = temMais ? linhas.slice(0, limite) : linhas;
  const ultima = data[data.length - 1];
  return {
    data,
    page_info: {
      has_next_page: temMais,
      end_cursor: ultima ? escreverCursor(chave(ultima)) : null,
    },
  };
}

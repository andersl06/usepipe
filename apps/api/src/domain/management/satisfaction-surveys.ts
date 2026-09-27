import { ilike, sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import { satisfactionSurveyResponse } from '@pipe/db/schema';
import type { SatisfactionSurveyCategory, SatisfactionSurveyQuery, SatisfactionSurveyResponse } from '@pipe/contracts';
import { requirePermission } from '../../session.js';
import { PipeError } from '../../errors.js';
import { conditionOfCursor, orderSql, assemblePage, lerCursor, lerLimite } from '../../pagination.js';
import type { Cursor, Page } from '../../pagination.js';

/**
 * Query endpoint of BUILDER-03's native satisfaction survey (D-08.3/D-08.4/D-08.5), reproducing
 * the reference's Análise de Satisfação filters (`ref/inventario-satisfacao-e-tags.md` §3) over
 * the Pipe's own schema — the underlying Blip endpoint for the detailed table was never confirmed
 * (§4), so this contract is the Pipe's own, not a copy.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** T-2-22: comment search accepts at most this many characters. */
const MAX_SEARCH = 200;

function uuidOrBadRequest(value: string, campo: string): string {
  if (!UUID.test(value)) throw PipeError.request('filtro_invalido', `${campo} precisa ser um uuid.`);
  return value;
}

function dateOrBadRequest(value: string, campo: string): string {
  if (!DATE.test(value)) {
    throw PipeError.request('filtro_invalido', `${campo} precisa ser uma data ISO (yyyy-MM-dd).`);
  }
  return value;
}

function categoryOf(rating: number | null): SatisfactionSurveyCategory | null {
  if (rating === null) return null;
  if (rating <= 2) return 'insatisfeito';
  if (rating === 3) return 'neutro';
  return 'satisfeito';
}

type Linha = {
  id: string;
  conversationId: string;
  attendanceConversationId: string | null;
  queueId: string | null;
  queueName: string | null;
  agentId: string | null;
  agentEmail: string | null;
  contactId: string;
  rating: number | null;
  comment: string | null;
  status: string;
  createdAt: Date | string;
  respondedAt: Date | string | null;
};

/**
 * `relatorio.ver` gates the whole query; `noTenant` (called by the controller) plus RLS keep one
 * tenant's answers from ever reaching another's request, even when filter ids belong to another
 * tenant (T-2-10). Comment search is matched as literal text — `%`/`_` are wildcards to Postgres
 * `ilike`, so they are escaped before the pattern is built, and Drizzle's `ilike()` always binds
 * the pattern as a parameter, never string-concatenated SQL (T-2-22).
 */
export async function listSatisfactionResponses(
  tx: TransactionPipe,
  userId: string,
  query: SatisfactionSurveyQuery,
): Promise<Page<SatisfactionSurveyResponse>> {
  await requirePermission(tx, userId, 'relatorio.ver');

  const limite = lerLimite(query.limit);
  const cursor: Cursor | null = lerCursor(query.cursor);

  const filterFrom = query.from
    ? sql`pesquisa_satisfacao_resposta.criada_em >= ${dateOrBadRequest(query.from, 'from')}::date`
    : sql`true`;
  const filterTo = query.to
    ? sql`pesquisa_satisfacao_resposta.criada_em < (${dateOrBadRequest(query.to, 'to')}::date + 1)`
    : sql`true`;
  const filterQueue = query.queueId
    ? sql`pesquisa_satisfacao_resposta.fila_id = ${uuidOrBadRequest(query.queueId, 'queueId')}::uuid`
    : sql`true`;
  const filterAgent = query.agentId
    ? sql`pesquisa_satisfacao_resposta.atendente_id = ${uuidOrBadRequest(query.agentId, 'agentId')}::uuid`
    : sql`true`;
  let filterRating = sql`true`;
  if (query.rating !== undefined) {
    if (!Number.isInteger(query.rating) || query.rating < 1 || query.rating > 5) {
      throw PipeError.request('filtro_invalido', 'rating precisa ser um inteiro entre 1 e 5.');
    }
    filterRating = sql`pesquisa_satisfacao_resposta.nota = ${query.rating}`;
  }
  let filterSearch = sql`true`;
  if (query.search !== undefined) {
    const texto = query.search.trim();
    if (texto.length > MAX_SEARCH) {
      throw PipeError.request('filtro_invalido', `search aceita no máximo ${MAX_SEARCH} caracteres.`);
    }
    if (texto) {
      const escapado = texto.replace(/[\\%_]/g, (m) => `\\${m}`);
      // Unaliased column, matching the unaliased `pesquisa_satisfacao_resposta` in the FROM clause below.
      filterSearch = ilike(satisfactionSurveyResponse.comentario, `%${escapado}%`);
    }
  }

  const { rows } = await tx.execute<Linha>(sql`
    select pesquisa_satisfacao_resposta.id, pesquisa_satisfacao_resposta.conversa_id as "conversationId",
           pesquisa_satisfacao_resposta.conversa_atendimento_id as "attendanceConversationId",
           pesquisa_satisfacao_resposta.fila_id as "queueId", q.nome as "queueName",
           pesquisa_satisfacao_resposta.atendente_id as "agentId", u.email as "agentEmail",
           pesquisa_satisfacao_resposta.contato_id as "contactId", pesquisa_satisfacao_resposta.nota as rating,
           pesquisa_satisfacao_resposta.comentario as comment, pesquisa_satisfacao_resposta.estado as status,
           pesquisa_satisfacao_resposta.criada_em as "createdAt", pesquisa_satisfacao_resposta.respondida_em as "respondedAt"
      from pesquisa_satisfacao_resposta
      left join fila q on q.id = pesquisa_satisfacao_resposta.fila_id
      left join usuario u on u.id = pesquisa_satisfacao_resposta.atendente_id
     where ${filterFrom} and ${filterTo} and ${filterQueue} and ${filterAgent} and ${filterRating} and ${filterSearch}
       and ${conditionOfCursor('pesquisa_satisfacao_resposta.criada_em', 'timestamptz', 'desc', cursor, 'pesquisa_satisfacao_resposta.id')}
     order by ${orderSql('pesquisa_satisfacao_resposta.criada_em', 'desc', 'pesquisa_satisfacao_resposta.id')}
     limit ${limite + 1}
  `);

  const page = assemblePage(rows, limite, (linha) => ({
    value: new Date(linha.createdAt).toISOString(),
    id: linha.id,
  }));
  return {
    ...page,
    data: page.data.map((linha) => ({
      id: linha.id,
      conversationId: linha.conversationId,
      attendanceConversationId: linha.attendanceConversationId,
      queueId: linha.queueId,
      queueName: linha.queueName,
      agentId: linha.agentId,
      agentEmail: linha.agentEmail,
      contactId: linha.contactId,
      rating: linha.rating,
      category: categoryOf(linha.rating),
      comment: linha.comment,
      status: linha.status as SatisfactionSurveyResponse['status'],
      createdAt: new Date(linha.createdAt).toISOString(),
      respondedAt: linha.respondedAt ? new Date(linha.respondedAt).toISOString() : null,
    })),
  };
}

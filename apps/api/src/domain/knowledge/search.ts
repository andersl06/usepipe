import { sql, type SQL } from 'drizzle-orm';
import {
  DEFAULT_EMBEDDING_KEY_SECRET,
  KNOWLEDGE_LIMITS,
  maskSecrets,
  type KnowledgePassage,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResult,
  type ServicosDoMotor,
} from '@pipe/core';
import { DEFAULT_EMBEDDING_MODEL, createEmbeddings } from '@pipe/ai/embeddings';
import type { TransactionPipe } from '@pipe/db';

/**
 * Knowledge search (P15) over the tenant's `base_conhecimento` → `documento_conhecimento` →
 * `trecho_conhecimento`. Knowledge bases belong to the TENANT, like Blip's catalogs (the Builder
 * lists them per account and each agent tool only selects catalogs/documents); the flow only
 * chooses which bases a block reads and supplies the embeddings key.
 *
 * - **Semantic** when the flow has the embeddings key secret (`OPENAI_API_KEY` by default, or the
 *   name the block gives): the query is embedded with `text-embedding-3-small` and passages are
 *   ranked by cosine similarity (pgvector `<=>`, HNSW index of 0058). Passages are embedded lazily
 *   with the same key: each search first embeds up to `EMBEDDING_BACKLOG_PER_SEARCH` passages of
 *   its scope that have no embedding of this model (the ones matching the query's words first), in
 *   the same provider call as the query, and caches them in `trecho_conhecimento.embedding`.
 * - **Lexical** otherwise (no key, e.g. a Builder test run without secrets): Postgres full text
 *   (`portuguese`), scored by the share of the query's words the passage contains.
 *
 * Production and the Builder test run share this through `engineServices`. The key is decrypted
 * per input, used for the provider call only and masked in any error.
 */

export const EMBEDDING_BACKLOG_PER_SEARCH = 64;
const MAX_QUERY_TERMS = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Isolate = <T>(fn: (tx: TransactionPipe) => Promise<T>) => Promise<T>;

export type EmbedFunction = (
  inputs: string[],
  apiKey: string,
  signal?: AbortSignal,
) => Promise<{ model: string; vectors: number[][] }>;

export interface KnowledgeServiceOptions {
  tenantId: string;
  isolate: Isolate;
  /** Decrypted value of this flow's secret `name`, or null (no flow, or no such secret). */
  loadSecret: (name: string) => Promise<string | null>;
  /** Test seam; OpenAI embeddings (`PIPE_OPENAI_BASE_URL` honoured) by default. */
  embed?: EmbedFunction;
}

/** Postgres array literal of text values (quotes and backslashes escaped). */
export function pgArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

const vectorLiteral = (v: readonly number[]): string => `[${v.join(',')}]`;

/** Query words for the lexical search: letters/digits, 3+ characters, at most 12. */
export function queryTerms(query: string): string[] {
  const words = query.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  return [...new Set(words)].slice(0, MAX_QUERY_TERMS);
}

interface Scope {
  where: SQL;
}

/** Bases/documents the request names that exist in this tenant; none left = the whole tenant. */
async function resolveScope(tx: TransactionPipe, tenantId: string, request: KnowledgeSearchRequest): Promise<Scope> {
  const known = async (table: 'base_conhecimento' | 'documento_conhecimento', ids: string[]): Promise<string[]> => {
    const valid = ids.filter((id) => UUID.test(id));
    if (valid.length === 0) return [];
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from ${sql.identifier(table)} where tenant_id = ${tenantId}::uuid and id = any(${pgArray(valid)}::uuid[])
    `);
    return rows.map((r) => r.id);
  };
  const bases = await known('base_conhecimento', request.bases);
  const documents = await known('documento_conhecimento', request.documents);
  const parts: SQL[] = [sql`t.tenant_id = ${tenantId}::uuid`];
  if (bases.length) parts.push(sql`b.id = any(${pgArray(bases)}::uuid[])`);
  if (documents.length) parts.push(sql`d.id = any(${pgArray(documents)}::uuid[])`);
  if (request.tags.length) parts.push(sql`d.tags && ${pgArray(request.tags)}::text[]`);
  return { where: sql.join(parts, sql` and `) };
}

const FROM = (tenantId: string): SQL => sql`
  from trecho_conhecimento t
  join documento_conhecimento d on d.id = t.documento_id and d.tenant_id = ${tenantId}::uuid and d.ativo
  join base_conhecimento b on b.id = d.base_id and b.tenant_id = ${tenantId}::uuid and b.ativa
`;

type PassageRow = {
  id: string; texto: string; score: number | string;
  documentId: string; documentTitle: string; baseId: string; baseName: string;
};

const COLUMNS = sql`t.id, t.texto, d.id as "documentId", d.titulo as "documentTitle", b.id as "baseId", b.nome as "baseName"`;

function passages(rows: PassageRow[], minimumScore: number, topK: number): KnowledgePassage[] {
  return rows
    .map((r) => ({
      id: r.id,
      text: r.texto,
      score: Math.min(1, Math.max(0, Number(r.score))),
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      baseId: r.baseId,
      baseName: r.baseName,
    }))
    .filter((p) => p.score >= minimumScore)
    .slice(0, topK);
}

/** Full-text search: `score` = share of the query's (non stop-)words the passage contains. */
export async function lexicalSearch(tx: TransactionPipe, tenantId: string, request: KnowledgeSearchRequest): Promise<KnowledgePassage[]> {
  const terms = queryTerms(request.query);
  if (terms.length === 0) return [];
  const scope = await resolveScope(tx, tenantId, request);
  const termArray = sql`${pgArray(terms)}::text[]`;
  const { rows } = await tx.execute<PassageRow>(sql`
    with q as (select to_tsquery('portuguese', ${terms.join(' | ')}) as query),
    n as (
      select greatest(count(*), 1)::float as total from unnest(${termArray}) w
       where numnode(plainto_tsquery('portuguese', w)) > 0
    )
    select ${COLUMNS},
      (select count(*) from unnest(${termArray}) w
        where numnode(plainto_tsquery('portuguese', w)) > 0
          and to_tsvector('portuguese', t.texto) @@ plainto_tsquery('portuguese', w))::float / n.total as score
    ${FROM(tenantId)}
    cross join q cross join n
    where ${scope.where} and to_tsvector('portuguese', t.texto) @@ q.query
    order by score desc, ts_rank_cd(to_tsvector('portuguese', t.texto), q.query) desc, t.ordem asc
    limit ${Math.min(request.topK * 4, 100)}
  `);
  return passages(rows, request.minimumScore, request.topK);
}

/** Passages of the scope without an embedding of `model`, the ones matching the query's words first. */
async function embeddingBacklog(tx: TransactionPipe, tenantId: string, scope: Scope, model: string, query: string): Promise<{ id: string; texto: string }[]> {
  const terms = queryTerms(query);
  const matches = terms.length
    ? sql`(to_tsvector('portuguese', t.texto) @@ to_tsquery('portuguese', ${terms.join(' | ')}))`
    : sql`false`;
  const { rows } = await tx.execute<{ id: string; texto: string }>(sql`
    select t.id, t.texto ${FROM(tenantId)}
    where ${scope.where} and (t.embedding is null or t.modelo_embedding is distinct from ${model})
    order by ${matches} desc, t.ordem asc
    limit ${EMBEDDING_BACKLOG_PER_SEARCH}
  `);
  return rows;
}

async function storeEmbeddings(tx: TransactionPipe, tenantId: string, model: string, rows: { id: string; vector: number[] }[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.execute(sql`
    update trecho_conhecimento t
       set embedding = v.embedding::vector, modelo_embedding = ${model}
      from unnest(${pgArray(rows.map((r) => r.id))}::uuid[], ${pgArray(rows.map((r) => vectorLiteral(r.vector)))}::text[]) as v(id, embedding)
     where t.id = v.id and t.tenant_id = ${tenantId}::uuid
  `);
}

async function vectorSearch(tx: TransactionPipe, tenantId: string, scope: Scope, model: string, query: number[], request: KnowledgeSearchRequest): Promise<KnowledgePassage[]> {
  const q = vectorLiteral(query);
  const { rows } = await tx.execute<PassageRow>(sql`
    select ${COLUMNS}, 1 - (t.embedding <=> ${q}::vector) as score
    ${FROM(tenantId)}
    where ${scope.where} and t.embedding is not null and t.modelo_embedding = ${model}
    order by t.embedding <=> ${q}::vector asc
    limit ${request.topK}
  `);
  return passages(rows, request.minimumScore, request.topK);
}

/** OpenAI embeddings through `@pipe/ai`, at `PIPE_OPENAI_BASE_URL` when set (tests, gateways). */
export const openAiEmbed: EmbedFunction = async (inputs, apiKey, signal) => {
  const baseUrl = process.env['PIPE_OPENAI_BASE_URL']?.trim();
  return createEmbeddings(inputs, {
    apiKey,
    model: DEFAULT_EMBEDDING_MODEL,
    ...(signal ? { signal } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
};

function normalized(request: KnowledgeSearchRequest): KnowledgeSearchRequest {
  const topK = Number.isFinite(request.topK) ? Math.min(Math.max(1, Math.floor(request.topK)), KNOWLEDGE_LIMITS.maxTopK) : KNOWLEDGE_LIMITS.defaultTopK;
  const minimumScore = Number.isFinite(request.minimumScore) ? Math.min(Math.max(0, request.minimumScore), 1) : 0;
  return { ...request, query: request.query.trim().slice(0, KNOWLEDGE_LIMITS.maxQueryChars), topK, minimumScore };
}

export function knowledgeService(options: KnowledgeServiceOptions): Required<Pick<ServicosDoMotor, 'searchKnowledge' | 'respondWithKnowledge'>> {
  const { tenantId, isolate, loadSecret } = options;
  const embed = options.embed ?? openAiEmbed;

  const searchKnowledge = async (raw: KnowledgeSearchRequest, signal?: AbortSignal): Promise<KnowledgeSearchResult> => {
    const request = normalized(raw);
    if (!request.query) return { mode: 'lexical', passages: [] };
    const secretName = request.apiKeySecret ?? DEFAULT_EMBEDDING_KEY_SECRET;
    const apiKey = (await loadSecret(secretName))?.trim() || null;
    if (!apiKey) return { mode: 'lexical', passages: await isolate((tx) => lexicalSearch(tx, tenantId, request)) };

    const model = DEFAULT_EMBEDDING_MODEL;
    const { scope, backlog } = await isolate(async (tx) => {
      const scope = await resolveScope(tx, tenantId, request);
      return { scope, backlog: await embeddingBacklog(tx, tenantId, scope, model, request.query) };
    });
    let vectors: number[][];
    try {
      ({ vectors } = await embed([request.query, ...backlog.map((b) => b.texto)], apiKey, signal));
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(maskSecrets(`A busca na base de conhecimento falhou: ${message}`, new Set([apiKey])));
    }
    signal?.throwIfAborted();
    const [queryVector, ...passageVectors] = vectors;
    return {
      mode: 'semantic',
      passages: await isolate(async (tx) => {
        await storeEmbeddings(tx, tenantId, model, backlog.map((b, i) => ({ id: b.id, vector: passageVectors[i]! })));
        return vectorSearch(tx, tenantId, scope, model, queryVector!, request);
      }),
    };
  };

  return {
    searchKnowledge,
    // ProcessContentAssistant: the best passage, if it reaches the block's minimum confidence.
    respondWithKnowledge: async ({ text, minimumConfidence, tags, apiKeySecret }) => {
      const result = await searchKnowledge({
        query: text,
        topK: 1,
        minimumScore: 0,
        bases: [],
        documents: [],
        tags: (tags ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
        apiKeySecret: apiKeySecret ?? null,
      });
      const best = result.passages[0];
      if (!best) return { answer: null, confidence: 0 };
      return best.score >= minimumConfidence ? { answer: best.text, confidence: best.score } : { answer: null, confidence: best.score };
    },
  };
}

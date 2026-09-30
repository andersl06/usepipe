import { sql } from 'drizzle-orm';
import { registrarAuditoria, type TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';
import { EDIT_FLOW } from '../management/cycle-of-lifetime-of-flow.js';
import { chunkText } from './chunking.js';
import { pgArray } from './search.js';

/**
 * Knowledge base management (P15): the tenant's bases (Blip "catálogos"), their documents and the
 * passages the search reads. Bases belong to the account and any flow's knowledge block can select
 * them, so managing them requires `automacao.fluxo.editar` (the Builder's permission), not a
 * flow-team role.
 *
 * Ingestion takes TEXT (typed, or a .txt/.md file the client reads): the body is split into
 * passages (`chunking.ts`) with no embedding. Embeddings are computed lazily at search time with the
 * flow's key (`search.ts`), because the provider key is a flow secret and ingestion has no flow.
 * Binary formats (PDF, DOCX) would need a parser package and are not accepted.
 *
 * Raw SQL, as in `flow-secrets.ts`, so the shared Drizzle schema stays untouched (columns of 0058).
 */

export interface KnowledgeBase {
  id: string;
  name: string;
  active: boolean;
  documents: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface KnowledgeDocument {
  id: string;
  baseId: string;
  title: string;
  tags: string[];
  version: number;
  active: boolean;
  passages: number;
  /** Passages that already have an embedding (any model). */
  embedded: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface KnowledgeDocumentDetail extends KnowledgeDocument {
  body: string;
}

export interface KnowledgeBaseInput {
  name?: unknown;
  active?: unknown;
}

export interface KnowledgeDocumentInput {
  title?: unknown;
  body?: unknown;
  tags?: unknown;
  active?: unknown;
}

export const KNOWLEDGE_INPUT_LIMITS = {
  name: 120,
  title: 200,
  body: 500_000,
  tags: 20,
  tag: 50,
  passagesPerDocument: 2_000,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (value: Date | string | null): string | null => (value ? new Date(value).toISOString() : null);

function uuidOr404(id: string, what: string): string {
  if (!UUID.test(id)) throw PipeError.naoEncontrado(what);
  return id;
}

function requiredText(value: unknown, max: number, field: string, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw PipeError.request(`${field}_obrigatorio`, `Informe ${label}.`);
  if (text.length > max) throw PipeError.request(`${field}_grande_demais`, `${label[0]!.toUpperCase()}${label.slice(1)} aceita no máximo ${max} caracteres.`);
  return text;
}

function tagsOf(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!list) throw PipeError.request('tags_invalidas', 'As tags devem ser uma lista de textos.');
  const tags = [...new Set(list.map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : '')).filter(Boolean))];
  if (tags.length > KNOWLEDGE_INPUT_LIMITS.tags) {
    throw PipeError.request('tags_demais', `Um documento aceita no máximo ${KNOWLEDGE_INPUT_LIMITS.tags} tags.`);
  }
  if (tags.some((t) => t.length > KNOWLEDGE_INPUT_LIMITS.tag)) {
    throw PipeError.request('tag_grande_demais', `Cada tag aceita no máximo ${KNOWLEDGE_INPUT_LIMITS.tag} caracteres.`);
  }
  return tags;
}

function booleanOf(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw PipeError.request(`${field}_invalido`, `O campo '${field}' deve ser verdadeiro ou falso.`);
  return value;
}

function passagesOf(body: string): string[] {
  const passages = chunkText(body);
  if (passages.length === 0) throw PipeError.request('corpo_obrigatorio', 'Informe o texto do documento.');
  if (passages.length > KNOWLEDGE_INPUT_LIMITS.passagesPerDocument) {
    throw PipeError.request('documento_grande_demais', 'O documento é grande demais; divida-o em documentos menores.');
  }
  return passages;
}

type BaseRow = { id: string; name: string; active: boolean; documents: number | string; createdAt: Date | string; updatedAt: Date | string | null };
type DocumentRow = {
  id: string; baseId: string; title: string; tags: string[] | null; version: number; active: boolean;
  passages: number | string; embedded: number | string; createdAt: Date | string; updatedAt: Date | string | null;
};

const baseOutput = (r: BaseRow): KnowledgeBase => ({
  id: r.id, name: r.name, active: r.active, documents: Number(r.documents),
  createdAt: iso(r.createdAt) as string, updatedAt: iso(r.updatedAt),
});

const documentOutput = (r: DocumentRow): KnowledgeDocument => ({
  id: r.id, baseId: r.baseId, title: r.title, tags: r.tags ?? [], version: r.version, active: r.active,
  passages: Number(r.passages), embedded: Number(r.embedded),
  createdAt: iso(r.createdAt) as string, updatedAt: iso(r.updatedAt),
});

const BASE_SELECT = sql`
  select b.id, b.nome as name, b.ativa as active, b.criado_em as "createdAt", b.atualizado_em as "updatedAt",
         (select count(*) from documento_conhecimento d where d.base_id = b.id) as documents
    from base_conhecimento b
`;

const DOCUMENT_SELECT = sql`
  select d.id, d.base_id as "baseId", d.titulo as title, d.tags, d.versao as version, d.ativo as active,
         d.criado_em as "createdAt", d.atualizado_em as "updatedAt",
         (select count(*) from trecho_conhecimento t where t.documento_id = d.id) as passages,
         (select count(*) from trecho_conhecimento t where t.documento_id = d.id and t.embedding is not null) as embedded
    from documento_conhecimento d
`;

async function loadBase(tx: TransactionPipe, tenantId: string, baseId: string): Promise<KnowledgeBase> {
  const { rows } = await tx.execute<BaseRow>(sql`${BASE_SELECT} where b.id = ${uuidOr404(baseId, 'base de conhecimento')}::uuid and b.tenant_id = ${tenantId}::uuid`);
  if (!rows[0]) throw PipeError.naoEncontrado('base de conhecimento');
  return baseOutput(rows[0]);
}

async function loadDocument(tx: TransactionPipe, tenantId: string, baseId: string, documentId: string): Promise<KnowledgeDocument> {
  const { rows } = await tx.execute<DocumentRow>(sql`
    ${DOCUMENT_SELECT}
    where d.id = ${uuidOr404(documentId, 'documento')}::uuid and d.base_id = ${uuidOr404(baseId, 'base de conhecimento')}::uuid
      and d.tenant_id = ${tenantId}::uuid
  `);
  if (!rows[0]) throw PipeError.naoEncontrado('documento');
  return documentOutput(rows[0]);
}

async function insertPassages(tx: TransactionPipe, tenantId: string, documentId: string, passages: string[]): Promise<void> {
  await tx.execute(sql`
    insert into trecho_conhecimento (tenant_id, documento_id, texto, ordem)
    select ${tenantId}::uuid, ${documentId}::uuid, p.texto, p.ordem - 1
      from unnest(${pgArray(passages)}::text[]) with ordinality as p(texto, ordem)
  `);
}

// --- Bases ---

export async function listKnowledgeBases(tx: TransactionPipe, userId: string, tenantId: string): Promise<KnowledgeBase[]> {
  await requirePermission(tx, userId, EDIT_FLOW);
  const { rows } = await tx.execute<BaseRow>(sql`${BASE_SELECT} where b.tenant_id = ${tenantId}::uuid order by b.nome asc, b.criado_em asc`);
  return rows.map(baseOutput);
}

export async function createKnowledgeBase(tx: TransactionPipe, userId: string, tenantId: string, input: KnowledgeBaseInput): Promise<KnowledgeBase> {
  await requirePermission(tx, userId, EDIT_FLOW);
  const name = requiredText(input?.name, KNOWLEDGE_INPUT_LIMITS.name, 'nome', 'o nome da base');
  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into base_conhecimento (tenant_id, nome) values (${tenantId}::uuid, ${name}) returning id
  `);
  const id = rows[0]!.id;
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: userId }, acao: 'criou', objetoTipo: 'base_conhecimento', objetoId: id, depois: { name },
  });
  return loadBase(tx, tenantId, id);
}

export async function updateKnowledgeBase(
  tx: TransactionPipe, userId: string, tenantId: string, baseId: string, input: KnowledgeBaseInput,
): Promise<KnowledgeBase> {
  await requirePermission(tx, userId, EDIT_FLOW);
  const before = await loadBase(tx, tenantId, baseId);
  const name = input?.name === undefined ? before.name : requiredText(input.name, KNOWLEDGE_INPUT_LIMITS.name, 'nome', 'o nome da base');
  const active = input?.active === undefined ? before.active : booleanOf(input.active, 'active');
  await tx.execute(sql`
    update base_conhecimento set nome = ${name}, ativa = ${active}, atualizado_em = now()
     where id = ${baseId}::uuid and tenant_id = ${tenantId}::uuid
  `);
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: userId }, acao: 'alterou', objetoTipo: 'base_conhecimento', objetoId: baseId,
    antes: { name: before.name, active: before.active }, depois: { name, active },
  });
  return loadBase(tx, tenantId, baseId);
}

/** Deletes the base with its documents and passages (foreign keys cascade). */
export async function deleteKnowledgeBase(tx: TransactionPipe, userId: string, tenantId: string, baseId: string): Promise<void> {
  await requirePermission(tx, userId, EDIT_FLOW);
  const before = await loadBase(tx, tenantId, baseId);
  await tx.execute(sql`delete from base_conhecimento where id = ${baseId}::uuid and tenant_id = ${tenantId}::uuid`);
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: userId }, acao: 'excluiu', objetoTipo: 'base_conhecimento', objetoId: baseId,
    antes: { name: before.name, documents: before.documents },
  });
}

// --- Documents ---

export async function listKnowledgeDocuments(tx: TransactionPipe, userId: string, tenantId: string, baseId: string): Promise<KnowledgeDocument[]> {
  await requirePermission(tx, userId, EDIT_FLOW);
  await loadBase(tx, tenantId, baseId);
  const { rows } = await tx.execute<DocumentRow>(sql`
    ${DOCUMENT_SELECT} where d.base_id = ${baseId}::uuid and d.tenant_id = ${tenantId}::uuid order by d.titulo asc, d.criado_em asc
  `);
  return rows.map(documentOutput);
}

export async function getKnowledgeDocument(
  tx: TransactionPipe, userId: string, tenantId: string, baseId: string, documentId: string,
): Promise<KnowledgeDocumentDetail> {
  await requirePermission(tx, userId, EDIT_FLOW);
  const document = await loadDocument(tx, tenantId, baseId, documentId);
  const { rows } = await tx.execute<{ corpo: string }>(sql`select corpo from documento_conhecimento where id = ${documentId}::uuid`);
  return { ...document, body: rows[0]?.corpo ?? '' };
}

/** Ingestion: stores the text and its passages (no embedding yet; see `search.ts`). */
export async function createKnowledgeDocument(
  tx: TransactionPipe, userId: string, tenantId: string, baseId: string, input: KnowledgeDocumentInput,
): Promise<KnowledgeDocument> {
  await requirePermission(tx, userId, EDIT_FLOW);
  await loadBase(tx, tenantId, baseId);
  const title = requiredText(input?.title, KNOWLEDGE_INPUT_LIMITS.title, 'titulo', 'o título do documento');
  const body = requiredText(input?.body, KNOWLEDGE_INPUT_LIMITS.body, 'corpo', 'o texto do documento');
  const tags = tagsOf(input?.tags);
  const passages = passagesOf(body);
  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into documento_conhecimento (tenant_id, base_id, titulo, corpo, tags)
    values (${tenantId}::uuid, ${baseId}::uuid, ${title}, ${body}, ${pgArray(tags)}::text[]) returning id
  `);
  const id = rows[0]!.id;
  await insertPassages(tx, tenantId, id, passages);
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: userId }, acao: 'criou', objetoTipo: 'documento_conhecimento', objetoId: id,
    depois: { baseId, title, tags, passages: passages.length },
  });
  return loadDocument(tx, tenantId, baseId, id);
}

/** A new body is a new version: its passages are replaced (and embedded again on the next search). */
export async function updateKnowledgeDocument(
  tx: TransactionPipe, userId: string, tenantId: string, baseId: string, documentId: string, input: KnowledgeDocumentInput,
): Promise<KnowledgeDocument> {
  await requirePermission(tx, userId, EDIT_FLOW);
  const before = await getKnowledgeDocument(tx, userId, tenantId, baseId, documentId);
  const title = input?.title === undefined ? before.title : requiredText(input.title, KNOWLEDGE_INPUT_LIMITS.title, 'titulo', 'o título do documento');
  const tags = input?.tags === undefined ? before.tags : tagsOf(input.tags);
  const active = input?.active === undefined ? before.active : booleanOf(input.active, 'active');
  const body = input?.body === undefined ? before.body : requiredText(input.body, KNOWLEDGE_INPUT_LIMITS.body, 'corpo', 'o texto do documento');
  const newBody = body !== before.body;
  const passages = newBody ? passagesOf(body) : null;
  await tx.execute(sql`
    update documento_conhecimento
       set titulo = ${title}, tags = ${pgArray(tags)}::text[], ativo = ${active}, corpo = ${body},
           versao = versao + ${newBody ? 1 : 0}, atualizado_em = now()
     where id = ${documentId}::uuid and tenant_id = ${tenantId}::uuid
  `);
  if (passages) {
    await tx.execute(sql`delete from trecho_conhecimento where documento_id = ${documentId}::uuid and tenant_id = ${tenantId}::uuid`);
    await insertPassages(tx, tenantId, documentId, passages);
  }
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: userId }, acao: 'alterou', objetoTipo: 'documento_conhecimento', objetoId: documentId,
    antes: { title: before.title, tags: before.tags, active: before.active, version: before.version },
    depois: { title, tags, active, version: before.version + (newBody ? 1 : 0) },
  });
  return loadDocument(tx, tenantId, baseId, documentId);
}

export async function deleteKnowledgeDocument(
  tx: TransactionPipe, userId: string, tenantId: string, baseId: string, documentId: string,
): Promise<void> {
  await requirePermission(tx, userId, EDIT_FLOW);
  const before = await loadDocument(tx, tenantId, baseId, documentId);
  await tx.execute(sql`delete from documento_conhecimento where id = ${documentId}::uuid and tenant_id = ${tenantId}::uuid`);
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: userId }, acao: 'excluiu', objetoTipo: 'documento_conhecimento', objetoId: documentId,
    antes: { baseId, title: before.title },
  });
}

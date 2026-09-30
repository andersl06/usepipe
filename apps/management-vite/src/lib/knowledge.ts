import { api } from '@pipe/ui/api';
import { atualizarLeituras } from './actions';
import { motivoDe, type Resultado } from './rest';

/** Account-level contracts from 02-55's management knowledge API. No flow or provider key here. */
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
  embedded: number;
  createdAt: string;
  updatedAt: string | null;
}
export interface KnowledgeDocumentDetail extends KnowledgeDocument { body: string }
export interface KnowledgeDocumentDraft { title: string; body: string; tags: string }
export const KNOWLEDGE_BASES_API = '/v1/management/knowledge-bases';
export const KNOWLEDGE_BASES_PATH = '/application/tenant/knowledge-base';
export const knowledgeDocumentsApi = (baseId: string): string =>
  `${KNOWLEDGE_BASES_API}/${encodeURIComponent(baseId)}/documents`;

function requiredText(value: string, max: number, label: string): string {
  const text = value.trim();
  if (!text) throw new Error(`Informe ${label}.`);
  if (text.length > max) throw new Error(`${label}: máximo de ${max} caracteres.`);
  return text;
}

export function knowledgeTags(text: string): string[] {
  const tags = [...new Set(text.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  if (tags.length > 20) throw new Error('Use no máximo 20 tags.');
  if (tags.some((tag) => tag.length > 50)) throw new Error('Cada tag aceita no máximo 50 caracteres.');
  return tags;
}

export function knowledgeDocumentInput(draft: KnowledgeDocumentDraft) {
  return {
    title: requiredText(draft.title, 200, 'o título'),
    body: requiredText(draft.body, 500_000, 'o texto'),
    tags: knowledgeTags(draft.tags),
  };
}

/** Files stay in the browser; the API ingests plain text, never binary uploads. */
export async function readKnowledgeFile(file: File): Promise<{ title: string; body: string }> {
  if (!/\.(txt|md)$/i.test(file.name)) throw new Error('Selecione um arquivo .txt ou .md.');
  // UTF-8 can use up to four bytes per character; check the decoded length as well.
  if (file.size > 2_000_000) throw new Error('O texto aceita no máximo 500000 caracteres.');
  return {
    title: file.name.replace(/\.(txt|md)$/i, '').slice(0, 200),
    body: requiredText(await file.text(), 500_000, 'o texto'),
  };
}

async function request<T>(operation: () => Promise<T>, write = false): Promise<Resultado<T>> {
  try {
    const value = await operation();
    if (write) atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error && !(error.name === 'ApiError')
      ? motivoDe(error, error.message || 'Não foi possível acessar a base de conhecimento.')
      : motivoDe(error, 'Não foi possível acessar a base de conhecimento.') };
  }
}

export const listKnowledgeBases = (): Promise<Resultado<KnowledgeBase[]>> =>
  request(() => api.get(KNOWLEDGE_BASES_API));
export const createKnowledgeBase = (name: string): Promise<Resultado<KnowledgeBase>> =>
  request(() => api.post(KNOWLEDGE_BASES_API, { name: requiredText(name, 120, 'o nome da base') }), true);
export const updateKnowledgeBase = (id: string, changes: { name?: string; active?: boolean }): Promise<Resultado<KnowledgeBase>> =>
  request(() => api.patch(`${KNOWLEDGE_BASES_API}/${encodeURIComponent(id)}`, {
    ...changes, ...(changes.name === undefined ? {} : { name: requiredText(changes.name, 120, 'o nome da base') }),
  }), true);
export const deleteKnowledgeBase = (id: string): Promise<Resultado<void>> =>
  request(() => api.delete(`${KNOWLEDGE_BASES_API}/${encodeURIComponent(id)}`), true);
export const listKnowledgeDocuments = (baseId: string): Promise<Resultado<KnowledgeDocument[]>> =>
  request(() => api.get(knowledgeDocumentsApi(baseId)));
export const getKnowledgeDocument = (baseId: string, id: string): Promise<Resultado<KnowledgeDocumentDetail>> =>
  request(() => api.get(`${knowledgeDocumentsApi(baseId)}/${encodeURIComponent(id)}`));
export const saveKnowledgeDocument = (baseId: string, draft: KnowledgeDocumentDraft, id?: string): Promise<Resultado<KnowledgeDocument>> =>
  request(() => id
    ? api.patch(`${knowledgeDocumentsApi(baseId)}/${encodeURIComponent(id)}`, knowledgeDocumentInput(draft))
    : api.post(knowledgeDocumentsApi(baseId), knowledgeDocumentInput(draft)), true);
export const deleteKnowledgeDocument = (baseId: string, id: string): Promise<Resultado<void>> =>
  request(() => api.delete(`${knowledgeDocumentsApi(baseId)}/${encodeURIComponent(id)}`), true);

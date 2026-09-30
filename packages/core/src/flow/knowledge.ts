/**
 * Knowledge base and MCP (P15). Blip evidence (Builder bundle, format only, D-33):
 *
 * - `KnowledgeBaseConsult` is a local action of the AI agent block ("Base de conhecimento", only
 *   inside an agent). Blip turns each one into a grounding tool (name = `$title`, description =
 *   `$description`) and stores its setup as `settings.{top_k, catalogs[], documents[{id,
 *   catalog_id, status}]}`. Catalogs belong to the account (tenant), not to the bot: in Pipe a
 *   catalog is a `base_conhecimento` of the tenant and a document a `documento_conhecimento`.
 * - "Conectar MCP" (`IntegrateMCP`) is not an action: it writes an entry into the agent's
 *   `ForwardToAgent.settings.tools` = `{ <code>: { code, mcp: <url>, transport: 'streamable-http' |
 *   'sse', headers{} } }`. Blip's own `grounding-mcp` entry points at its document server; Pipe
 *   serves the same purpose with the `KnowledgeBaseConsult` tools and skips that entry.
 *
 * The engine only describes searches and MCP calls; the `api` runs them (`ServicosDoMotor.
 * searchKnowledge`, `listMcpTools`, `callMcpTool`), resolving the embeddings key and the MCP auth
 * headers from the flow's secrets (P11) — secret values never reach the engine.
 */

import type { AcaoDoMotor, Settings } from './actions.js';
import { deleteVariable, setVariable } from './context.js';

// --- Knowledge search contract ---

export interface KnowledgeSearchRequest {
  query: string;
  /** Passages returned at most (1..`KNOWLEDGE_LIMITS.maxTopK`). */
  topK: number;
  /** Passages below this score (0..1) are dropped. */
  minimumScore: number;
  /** `base_conhecimento` ids (Blip catalogs); empty = every active base of the tenant. */
  bases: string[];
  /** `documento_conhecimento` ids; empty = every document of the chosen bases. */
  documents: string[];
  /** Only documents with at least one of these tags; empty = no tag filter. */
  tags: string[];
  /** Flow secret holding the embeddings key; null = `DEFAULT_EMBEDDING_KEY_SECRET`. */
  apiKeySecret: string | null;
}

export interface KnowledgePassage {
  id: string;
  text: string;
  /** 0..1: cosine similarity (semantic) or the share of query terms found (lexical). */
  score: number;
  documentId: string;
  documentTitle: string;
  baseId: string;
  baseName: string;
}

export interface KnowledgeSearchResult {
  /** `semantic` with an embeddings key, `lexical` (Postgres full text) without one. */
  mode: 'semantic' | 'lexical';
  passages: KnowledgePassage[];
}

export const KNOWLEDGE_LIMITS = {
  defaultTopK: 5,
  maxTopK: 20,
  maxQueryChars: 2_000,
} as const;

/** The embeddings provider is OpenAI (`text-embedding-3-small`, 1536 dimensions). */
export const DEFAULT_EMBEDDING_KEY_SECRET = 'OPENAI_API_KEY';
export const KNOWLEDGE_BASE_CONSULT = 'KnowledgeBaseConsult';

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Ids from `["id", {id}]` (Blip writes catalogs and documents both ways). */
function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const id = text(item) ?? text(obj(item)?.['id']);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function tagsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(list.map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : '')).filter(Boolean))];
}

export function clampTopK(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), KNOWLEDGE_LIMITS.maxTopK) : KNOWLEDGE_LIMITS.defaultTopK;
}

/** `minimumScore` in 0..1 (Pipe's scale, as `ProcessContentAssistant`'s `score`); 0 otherwise. */
function minimumScoreOf(value: unknown): number {
  const n = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(n)) return 0;
  if (n < 0 || n > 1) throw new Error("O valor 'minimumScore' deve estar entre 0 e 1.");
  return n;
}

export interface KnowledgeConsultSettings {
  topK: number;
  bases: string[];
  documents: string[];
  tags: string[];
  minimumScore: number;
  apiKeySecret: string | null;
  /** Standalone action only: the query (default: the customer's input). */
  query: string | null;
  /** Standalone action only: where the result JSON goes. */
  outputVariable: string | null;
}

/** `KnowledgeBaseConsult.settings` as Blip stores them, plus Pipe's optional fields. */
export function knowledgeConsultSettings(settings: Settings): KnowledgeConsultSettings {
  const s = settings ?? {};
  return {
    topK: clampTopK(s['top_k'] ?? s['topK']),
    bases: ids(s['catalogs'] ?? s['bases']),
    documents: ids(s['documents']),
    tags: tagsOf(s['tags']),
    minimumScore: minimumScoreOf(s['minimumScore']),
    apiKeySecret: text(s['apiKeySecret']),
    query: text(s['query']),
    outputVariable: text(s['outputVariable']),
  };
}

export function knowledgeRequest(query: string, config: KnowledgeConsultSettings, fallbackKeySecret: string | null = null): KnowledgeSearchRequest {
  return {
    query: query.slice(0, KNOWLEDGE_LIMITS.maxQueryChars),
    topK: config.topK,
    minimumScore: config.minimumScore,
    bases: config.bases,
    documents: config.documents,
    tags: config.tags,
    apiKeySecret: config.apiKeySecret ?? fallbackKeySecret,
  };
}

/** The result as a flow variable or a tool result reads it. */
export function knowledgeResultJson(result: KnowledgeSearchResult, maxBytes = Infinity): string {
  const passages = result.passages.map((p) => ({
    text: p.text,
    score: Math.round(p.score * 1000) / 1000,
    document: p.documentTitle,
    documentId: p.documentId,
    base: p.baseName,
  }));
  // Drop the weakest passages until the JSON fits (a tool result has a size limit).
  for (let n = passages.length; n >= 0; n--) {
    const json = JSON.stringify({ mode: result.mode, passages: passages.slice(0, n) });
    if (json.length <= maxBytes || n === 0) return json;
  }
  return JSON.stringify({ mode: result.mode, passages: [] });
}

/**
 * `KnowledgeBaseConsult` outside an agent's tools (a Pipe addition; Blip offers it only as an agent
 * tool): searches with `settings.query` or the customer's input and writes the result JSON
 * (`{mode, passages[{text, score, document, documentId, base}]}`) to `outputVariable`. No passage
 * deletes the variable, so a block can take a "não encontrou" exit on `outputVariable` not existing.
 */
export const knowledgeBaseConsult: AcaoDoMotor = {
  tipo: KNOWLEDGE_BASE_CONSULT,
  async executar(context, settings, prazo) {
    const config = knowledgeConsultSettings(settings);
    const query = config.query ?? context.inbound.serializedContent.trim();
    if (!query) throw new Error("A ação 'KnowledgeBaseConsult' não recebeu texto para buscar.");
    if (!context.services.searchKnowledge) throw new Error("A ação 'KnowledgeBaseConsult' não está disponível neste fluxo.");
    const result = await context.services.searchKnowledge(knowledgeRequest(query, config), prazo?.signal);
    if (!config.outputVariable) return;
    if (result.passages.length === 0) deleteVariable(context, config.outputVariable);
    else setVariable(context, config.outputVariable, knowledgeResultJson(result));
  },
};

// --- MCP contract ---

export type McpTransport = 'streamable-http' | 'sse';

export interface McpServer {
  /** The entry's key in `ForwardToAgent.settings.tools`. */
  code: string;
  url: string;
  transport: McpTransport;
  /** Plain headers, already substituted (`{{contact.identity}}` …). */
  headers: Record<string, string>;
  /**
   * Pipe addition: header name → flow secret NAME whose value the `api` puts in that header (auth
   * tokens). `{{secret.*}}` does not resolve outside HTTP actions, so secrets are named here.
   */
  secretHeaders: Record<string, string>;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  /** The result as text for the model (text parts joined, other parts as JSON). */
  content: string;
  isError: boolean;
}

/** Blip's built-in knowledge MCP (its document server); Pipe uses `KnowledgeBaseConsult` instead. */
export const GROUNDING_MCP_CODE = 'grounding-mcp';

function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(value) ?? {})) {
    if (k.trim() && typeof v === 'string') out[k.trim()] = v;
  }
  return out;
}

/** The MCP servers of `ForwardToAgent.settings.tools`, in their order, without Blip's grounding entry. */
export function mcpServersOf(tools: unknown): McpServer[] {
  const servers: McpServer[] = [];
  for (const [key, raw] of Object.entries(obj(tools) ?? {})) {
    const entry = obj(raw);
    const code = text(entry?.['code']) ?? key;
    const url = text(entry?.['mcp']) ?? text(entry?.['url']);
    if (!entry || !url || code === GROUNDING_MCP_CODE || key === GROUNDING_MCP_CODE) continue;
    servers.push({
      code,
      url,
      transport: entry['transport'] === 'sse' ? 'sse' : 'streamable-http',
      headers: stringMap(entry['headers']),
      secretHeaders: stringMap(entry['secretHeaders']),
    });
  }
  return servers;
}

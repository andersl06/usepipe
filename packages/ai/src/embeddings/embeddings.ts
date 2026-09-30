/**
 * Text embeddings for the knowledge base (P15): OpenAI's `/embeddings` REST endpoint over `fetch`,
 * like the agent's OpenAI call (no new package). The default model, `text-embedding-3-small`,
 * returns 1536 dimensions, the size of `trecho_conhecimento.embedding` (`vector(1536)`).
 *
 * The key is an argument: the `api` decrypts the flow's secret right before the call. Errors carry
 * only the status and the provider's message, never the request headers.
 */

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
/** Inputs per request; OpenAI accepts more, but a flow action should stay small and fast. */
export const MAX_EMBEDDING_INPUTS = 128;
/** Characters per input (the model takes ~8k tokens; passages are far smaller). */
export const MAX_EMBEDDING_INPUT_CHARS = 16_000;

export interface EmbeddingOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  /** Replaces the global `fetch` (tests). */
  fetch?: typeof fetch;
  /** `https://api.openai.com/v1` by default. */
  baseUrl?: string;
}

export interface EmbeddingResult {
  model: string;
  vectors: number[][];
  usage?: { inputTokens: number };
}

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}

const validVector = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === EMBEDDING_DIMENSIONS && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** One vector per input, in input order, each with `EMBEDDING_DIMENSIONS` numbers. */
export async function createEmbeddings(inputs: readonly string[], options: EmbeddingOptions): Promise<EmbeddingResult> {
  if (!options.apiKey.trim()) throw new EmbeddingProviderError('A chave do provedor de embeddings está vazia.');
  const model = options.model ?? DEFAULT_EMBEDDING_MODEL;
  if (inputs.length === 0) return { model, vectors: [] };
  if (inputs.length > MAX_EMBEDDING_INPUTS) {
    throw new EmbeddingProviderError(`No máximo ${MAX_EMBEDDING_INPUTS} textos por pedido de embeddings.`);
  }
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const response = await doFetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify({
      model,
      // The provider rejects an empty string; a single space embeds as "nothing".
      input: inputs.map((text) => text.slice(0, MAX_EMBEDDING_INPUT_CHARS) || ' '),
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: 'float',
    }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = payload?.['error'] as { message?: unknown } | undefined;
    const detail = typeof error?.message === 'string' ? error.message : response.statusText;
    throw new EmbeddingProviderError(`OpenAI (embeddings) respondeu ${response.status}: ${detail}`, response.status);
  }
  const data = Array.isArray(payload?.['data']) ? (payload['data'] as { index?: unknown; embedding?: unknown }[]) : [];
  const vectors: number[][] = [];
  for (const [position, item] of data.entries()) {
    const index = typeof item.index === 'number' ? item.index : position;
    if (!validVector(item.embedding)) {
      throw new EmbeddingProviderError(`O provedor devolveu um embedding inválido (esperado ${EMBEDDING_DIMENSIONS} dimensões).`);
    }
    vectors[index] = item.embedding;
  }
  if (vectors.length !== inputs.length || [...vectors].some((v) => !v)) {
    throw new EmbeddingProviderError('O provedor não devolveu um embedding para cada texto.');
  }
  const usage = payload?.['usage'] as { prompt_tokens?: number } | undefined;
  return {
    model: typeof payload?.['model'] === 'string' ? payload['model'] : model,
    vectors,
    ...(usage ? { usage: { inputTokens: usage.prompt_tokens ?? 0 } } : {}),
  };
}

/** Cosine similarity of two vectors (0 when either is all zeros). */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

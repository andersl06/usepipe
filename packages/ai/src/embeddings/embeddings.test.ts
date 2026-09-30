import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS, EmbeddingProviderError, cosineSimilarity, createEmbeddings } from './embeddings.js';

const KEY = 'chave-inventada-de-teste';
const vector = (hot: number): number[] => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === hot ? 1 : 0));

function stubFetch(handler: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler();
  }) as typeof fetch;
  return { fn, calls };
}

describe('createEmbeddings', () => {
  it('posts the inputs with the key only in the header and returns vectors in input order', async () => {
    const { fn, calls } = stubFetch(() =>
      Response.json({
        model: 'text-embedding-3-small',
        data: [
          { index: 1, embedding: vector(1) },
          { index: 0, embedding: vector(0) },
        ],
        usage: { prompt_tokens: 7 },
      }),
    );
    const result = await createEmbeddings(['a', ''], { apiKey: KEY, fetch: fn, baseUrl: 'https://gateway.exemplo.test/v1/' });
    expect(calls[0]!.url).toBe('https://gateway.exemplo.test/v1/embeddings');
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).toEqual({ model: 'text-embedding-3-small', input: ['a', ' '], dimensions: 1536, encoding_format: 'float' });
    expect(String(calls[0]!.init.body)).not.toContain(KEY);
    expect((calls[0]!.init.headers as Record<string, string>)['authorization']).toBe(`Bearer ${KEY}`);
    expect(result.vectors[0]![0]).toBe(1);
    expect(result.vectors[1]![1]).toBe(1);
    expect(result.usage).toEqual({ inputTokens: 7 });
  });

  it('fails without quoting the key and rejects wrong dimensions', async () => {
    const denied = stubFetch(() => Response.json({ error: { message: 'Incorrect API key' } }, { status: 401 }));
    const error = await createEmbeddings(['a'], { apiKey: KEY, fetch: denied.fn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmbeddingProviderError);
    expect((error as EmbeddingProviderError).status).toBe(401);
    expect(String(error)).not.toContain(KEY);

    const short = stubFetch(() => Response.json({ data: [{ index: 0, embedding: [1, 2, 3] }] }));
    await expect(createEmbeddings(['a'], { apiKey: KEY, fetch: short.fn })).rejects.toThrow('1536');
    await expect(createEmbeddings(['a'], { apiKey: ' ', fetch: short.fn })).rejects.toThrow('vazia');
    expect(await createEmbeddings([], { apiKey: KEY, fetch: short.fn })).toEqual({ model: 'text-embedding-3-small', vectors: [] });
    const missing = stubFetch(() => Response.json({ data: [{ index: 0, embedding: vector(0) }] }));
    await expect(createEmbeddings(['a', 'b'], { apiKey: KEY, fetch: missing.fn })).rejects.toThrow('cada texto');
  });

  it('computes cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

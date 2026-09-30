import { describe, expect, it } from 'vitest';
import type { McpServer } from '@pipe/core';
import { CHUNK_MAX, CHUNK_TARGET, chunkText } from '../src/domain/knowledge/chunking.js';
import { pgArray, queryTerms } from '../src/domain/knowledge/search.js';
import { mcpService } from '../src/domain/knowledge/mcp-tools.js';

/** P15 pieces that need no database: chunking, query terms, array literals and the MCP service. */

describe('chunking', () => {
  it('joins short paragraphs, keeps order and never exceeds the maximum', () => {
    expect(chunkText('  Primeiro parágrafo.\r\n\r\nSegundo   parágrafo.\n\n\n')).toEqual(['Primeiro parágrafo.\n\nSegundo parágrafo.']);
    const long = Array.from({ length: 40 }, (_, i) => `Frase número ${i} sobre a política de trocas da loja.`).join(' ');
    const chunks = chunkText(`${long}\n\nFim.`);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= CHUNK_MAX)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(`${long} Fim.`);
    const word = 'x'.repeat(CHUNK_MAX * 2 + 10);
    expect(chunkText(word).map((c) => c.length)).toEqual([CHUNK_MAX, CHUNK_MAX, 10]);
    expect(chunkText('a\n\n'.repeat(3)).every((c) => c.length <= CHUNK_TARGET)).toBe(true);
    expect(chunkText(' \n\n ')).toEqual([]);
  });

  it('extracts query terms and quotes array literals', () => {
    expect(queryTerms('Como faço a TROCA do pedido? troca, já!')).toEqual(['como', 'faço', 'troca', 'pedido']);
    expect(pgArray(['a', 'b"c', 'd\\e', 'f,g'])).toBe('{"a","b\\"c","d\\\\e","f,g"}');
    expect(pgArray([])).toBe('{}');
  });
});

describe('MCP service', () => {
  const TOKEN = 'token-mcp-inventado-0001';
  const server = (overrides: Partial<McpServer> = {}): McpServer => ({
    code: 'pedidos', url: 'https://mcp.exemplo.test/mcp', transport: 'streamable-http',
    headers: { 'X-Contato': 'ana' }, secretHeaders: { Authorization: 'MCP_TOKEN' }, ...overrides,
  });

  function stub(failCall = false) {
    const seen: { method: string; headers: Record<string, string> }[] = [];
    const fn = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { id?: number; method: string };
      seen.push({ method: body.method, headers: init?.headers as Record<string, string> });
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      const result =
        body.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: {} }
          : body.method === 'tools/list' ? { tools: [{ name: 'consultar_pedido', inputSchema: { type: 'object' } }] }
            : failCall ? null : { content: [{ type: 'text', text: 'ok' }] };
      if (!result) {
        return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: `recusado para Bearer ${TOKEN.slice(0, 5)}… ${TOKEN}` } });
      }
      return Response.json({ jsonrpc: '2.0', id: body.id, result });
    }) as typeof fetch;
    return { fn, seen };
  }

  it('puts the secret in the named header, reuses one session per input and masks the secret in errors', async () => {
    const s = stub(true);
    const service = mcpService({ loadSecret: async (name) => (name === 'MCP_TOKEN' ? TOKEN : null), fetch: s.fn });
    expect(await service.listMcpTools(server())).toEqual([{ name: 'consultar_pedido', description: '', inputSchema: { type: 'object' } }]);
    const error = await service.callMcpTool(server(), 'consultar_pedido', {}).catch((e: unknown) => e);
    expect(String(error)).toContain('recusado');
    expect(String(error)).not.toContain(TOKEN);
    expect(s.seen.map((x) => x.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
    expect(s.seen.every((x) => x.headers['Authorization'] === TOKEN && x.headers['X-Contato'] === 'ana')).toBe(true);
  });

  it('refuses private or plain-HTTP URLs, a missing secret and the SSE transport, without calling the network', async () => {
    const s = stub();
    const service = mcpService({ loadSecret: async () => null, fetch: s.fn });
    await expect(service.listMcpTools(server({ url: 'http://mcp.exemplo.test/mcp', secretHeaders: {} }))).rejects.toThrow('HTTPS');
    await expect(service.listMcpTools(server({ url: 'https://127.0.0.1/mcp', secretHeaders: {} }))).rejects.toThrow('rede privada');
    await expect(service.listMcpTools(server())).rejects.toThrow("'MCP_TOKEN'");
    await expect(service.listMcpTools(server({ transport: 'sse', secretHeaders: {} }))).rejects.toThrow('sse');
    expect(s.seen).toHaveLength(0);
  });
});

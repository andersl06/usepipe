import { describe, expect, it } from 'vitest';

import { McpClient, McpError, mcpResultText } from './client.js';

const URL_MCP = 'https://mcp.exemplo.test/mcp';
const TOKEN = 'token-inventado-de-teste';

interface Seen {
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** An invented MCP server: answers JSON or SSE, and issues a session id on `initialize`. */
function server(options: { sse?: boolean; failCall?: boolean } = {}) {
  const seen: Seen[] = [];
  const fn = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const headers = init?.headers as Record<string, string>;
    seen.push({ method: String(body['method']), headers, body });
    const reply = (result: unknown, extra: Record<string, string> = {}) => {
      const message = JSON.stringify({ jsonrpc: '2.0', id: body['id'], result });
      if (options.sse) {
        return new Response(`event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: ${message}\n\n`, {
          headers: { 'content-type': 'text/event-stream', ...extra },
        });
      }
      return new Response(message, { headers: { 'content-type': 'application/json', ...extra } });
    };
    switch (body['method']) {
      case 'initialize':
        return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'teste' } }, { 'mcp-session-id': 'sessao-1' });
      case 'notifications/initialized':
        return new Response(null, { status: 202 });
      case 'tools/list': {
        const params = body['params'] as { cursor?: string };
        if (!params.cursor) {
          return reply({ tools: [{ name: 'consultar_pedido', description: 'Consulta um pedido', inputSchema: { type: 'object', properties: { numero: { type: 'string' } } } }], nextCursor: 'p2' });
        }
        return reply({ tools: [{ name: 'sem_schema' }, { description: 'sem nome' }] });
      }
      case 'tools/call':
        if (options.failCall) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: body['id'], error: { code: -32602, message: 'ferramenta desconhecida' } }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        return reply({ content: [{ type: 'text', text: 'Pedido 42: enviado' }, { type: 'image', data: 'x', mimeType: 'image/png' }], isError: false });
      default:
        return new Response('nope', { status: 404 });
    }
  }) as typeof fetch;
  return { fn, seen };
}

describe('McpClient (streamable HTTP)', () => {
  it('initializes once, lists every page of tools and calls a tool with the session and headers', async () => {
    const s = server();
    const client = new McpClient({ url: URL_MCP, headers: { authorization: `Bearer ${TOKEN}` }, fetch: s.fn });
    const tools = await client.listTools();
    expect(tools).toEqual([
      { name: 'consultar_pedido', description: 'Consulta um pedido', inputSchema: { type: 'object', properties: { numero: { type: 'string' } } } },
      { name: 'sem_schema', description: '', inputSchema: { type: 'object', properties: {} } },
    ]);
    const result = await client.callTool('consultar_pedido', { numero: '42' });
    expect(result.isError).toBe(false);
    expect(mcpResultText(result)).toBe('Pedido 42: enviado\n{"type":"image","data":"x","mimeType":"image/png"}');
    expect(s.seen.map((x) => x.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/list', 'tools/call']);
    expect(s.seen[0]!.headers['mcp-session-id']).toBeUndefined();
    for (const x of s.seen.slice(1)) {
      expect(x.headers['mcp-session-id']).toBe('sessao-1');
      expect(x.headers['authorization']).toBe(`Bearer ${TOKEN}`);
      expect(x.headers['accept']).toBe('application/json, text/event-stream');
    }
    expect(s.seen[4]!.body['params']).toEqual({ name: 'consultar_pedido', arguments: { numero: '42' } });
  });

  it('reads the response out of an event stream', async () => {
    const s = server({ sse: true });
    const client = new McpClient({ url: URL_MCP, fetch: s.fn });
    expect((await client.listTools()).map((t) => t.name)).toEqual(['consultar_pedido', 'sem_schema']);
  });

  it('turns JSON-RPC and HTTP errors into McpError without quoting headers, and refuses SSE transport', async () => {
    const s = server({ failCall: true });
    const client = new McpClient({ url: URL_MCP, headers: { authorization: `Bearer ${TOKEN}` }, fetch: s.fn });
    const error = await client.callTool('x', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpError);
    expect(String(error)).toContain('ferramenta desconhecida');
    expect(String(error)).not.toContain(TOKEN);

    const down = new McpClient({ url: URL_MCP, fetch: (async () => new Response('x', { status: 401 })) as typeof fetch });
    await expect(down.listTools()).rejects.toThrow('respondeu 401');
    expect(() => new McpClient({ url: URL_MCP, transport: 'sse' })).toThrow('sse');
  });
});

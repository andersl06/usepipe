/**
 * Minimal MCP client (Model Context Protocol, Streamable HTTP transport) over `fetch`, for the AI
 * agent block's MCP servers (P15, Blip "Conectar MCP"). No SDK package: the client speaks only what
 * the agent needs — `initialize`, `notifications/initialized`, `tools/list` and `tools/call` — as
 * JSON-RPC 2.0 POSTs whose answer is either `application/json` or a `text/event-stream` carrying
 * the JSON-RPC response.
 *
 * The legacy SSE transport (Blip's `transport: 'sse'`, a long-lived GET stream plus an endpoint
 * event) is not implemented; `McpClient` refuses it with a clear error.
 *
 * Header values (auth included) are arguments: the `api` resolves secrets before building the
 * client, and no error message ever quotes a header.
 */

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export type McpTransport = 'streamable-http' | 'sse';

export interface McpClientOptions {
  url: string;
  transport?: McpTransport;
  headers?: Record<string, string>;
  /** Replaces the global `fetch` (tests). */
  fetch?: typeof fetch;
  /** Largest response body read, in bytes (1 MB by default). */
  maxResponseBytes?: number;
  clientName?: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface McpCallResult {
  content: McpContent[];
  isError: boolean;
  structuredContent?: unknown;
}

export class McpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

const MAX_TOOL_PAGES = 10;

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export class McpClient {
  private sessionId: string | null = null;
  private initialized: Promise<void> | null = null;
  private nextId = 1;
  private readonly doFetch: typeof fetch;
  private readonly maxBytes: number;

  constructor(private readonly options: McpClientOptions) {
    if ((options.transport ?? 'streamable-http') !== 'streamable-http') {
      throw new McpError("O transporte MCP 'sse' não é suportado no Pipe; use 'streamable-http'.");
    }
    this.doFetch = options.fetch ?? fetch;
    this.maxBytes = options.maxResponseBytes ?? 1_048_576;
  }

  /** Every tool the server lists (following `nextCursor`, up to 10 pages). */
  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    await this.initialize(signal);
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_TOOL_PAGES; page++) {
      const result = obj(await this.request('tools/list', cursor ? { cursor } : {}, signal)) ?? {};
      for (const raw of Array.isArray(result['tools']) ? result['tools'] : []) {
        const tool = obj(raw);
        if (!tool || typeof tool['name'] !== 'string' || !tool['name']) continue;
        const schema = obj(tool['inputSchema']);
        tools.push({
          name: tool['name'],
          description: typeof tool['description'] === 'string' ? tool['description'] : '',
          inputSchema: schema && schema['type'] === 'object' ? schema : { type: 'object', properties: {} },
        });
      }
      cursor = typeof result['nextCursor'] === 'string' && result['nextCursor'] ? result['nextCursor'] : undefined;
      if (!cursor) break;
    }
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallResult> {
    await this.initialize(signal);
    const result = obj(await this.request('tools/call', { name, arguments: args }, signal)) ?? {};
    const content = (Array.isArray(result['content']) ? result['content'] : [])
      .map(obj)
      .filter((c): c is Record<string, unknown> => !!c && typeof c['type'] === 'string') as McpContent[];
    return {
      content,
      isError: result['isError'] === true,
      ...(result['structuredContent'] !== undefined ? { structuredContent: result['structuredContent'] } : {}),
    };
  }

  private initialize(signal?: AbortSignal): Promise<void> {
    this.initialized ??= (async () => {
      await this.request(
        'initialize',
        {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: this.options.clientName ?? 'pipe', version: '0.1.0' },
        },
        signal,
      );
      await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, null, signal);
    })().catch((error: unknown) => {
      this.initialized = null;
      throw error;
    });
    return this.initialized;
  }

  private async request(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const id = this.nextId++;
    const response = await this.post({ jsonrpc: '2.0', id, method, params }, id, signal);
    if (!response) throw new McpError(`O servidor MCP não respondeu a '${method}'.`);
    if (response.error) {
      throw new McpError(
        `O servidor MCP recusou '${method}': ${response.error.message ?? 'erro sem mensagem'}`,
        undefined,
        response.error.code,
      );
    }
    return response.result;
  }

  /** POST one JSON-RPC message; `id` null = a notification (no response expected). */
  private async post(message: Record<string, unknown>, id: number | null, signal?: AbortSignal): Promise<JsonRpcResponse | null> {
    const headers: Record<string, string> = {
      ...(this.options.headers ?? {}),
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
    };
    let response: Response;
    try {
      response = await this.doFetch(this.options.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new McpError(`Não foi possível conectar ao servidor MCP: ${error instanceof Error ? error.message : String(error)}`);
    }
    const session = response.headers.get('mcp-session-id');
    if (session) this.sessionId = session;
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new McpError(`O servidor MCP respondeu ${response.status}.`, response.status);
    }
    if (id === null) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('text/event-stream')) return this.readEventStream(response, id);
    const text = await this.readText(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new McpError('O servidor MCP devolveu uma resposta que não é JSON.');
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return (list.map(obj).find((m) => m?.['id'] === id) as JsonRpcResponse | undefined) ?? null;
  }

  private async readText(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > this.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new McpError('A resposta do servidor MCP é grande demais.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }

  /** Reads SSE events until the JSON-RPC response with `id` arrives, then closes the stream. */
  private async readEventStream(response: Response, id: number): Promise<JsonRpcResponse | null> {
    const reader = response.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let buffer = '';
    let bytes = 0;
    const eventOf = (block: string): JsonRpcResponse | null => {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) return null;
      try {
        const message = obj(JSON.parse(data));
        return message && message['id'] === id ? (message as JsonRpcResponse) : null;
      } catch {
        return null;
      }
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (value) {
          bytes += value.byteLength;
          if (bytes > this.maxBytes) throw new McpError('A resposta do servidor MCP é grande demais.');
          buffer += decoder.decode(value, { stream: true });
        }
        if (done) buffer += '\n\n';
        let cut: RegExpExecArray | null;
        while ((cut = /\r?\n\r?\n/.exec(buffer))) {
          const block = buffer.slice(0, cut.index);
          buffer = buffer.slice(cut.index + cut[0].length);
          const found = eventOf(block);
          if (found) return found;
        }
        if (done) return null;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
}

/** A tool result as the model reads it: the text parts joined, other parts as JSON. */
export function mcpResultText(result: McpCallResult): string {
  const parts = result.content.map((c) => (c.type === 'text' && typeof c.text === 'string' ? c.text : JSON.stringify(c)));
  if (parts.length === 0 && result.structuredContent !== undefined) return JSON.stringify(result.structuredContent);
  return parts.join('\n');
}

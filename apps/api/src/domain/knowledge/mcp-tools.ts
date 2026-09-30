import { maskSecrets, type McpServer, type McpToolInfo, type McpToolResult, type ServicosDoMotor } from '@pipe/core';
import { McpClient, mcpResultText } from '@pipe/mcp';
import { confirmarUrlSegura } from '../management/integrations.js';

/**
 * The AI agent block's MCP servers (P15, Blip "Conectar MCP"): list their tools and call them.
 *
 * - The URL must be public HTTPS (`confirmarUrlSegura`, the same SSRF rule as outbound webhooks
 *   and ProcessHttp), so a flow cannot reach the platform's own network.
 * - Auth headers come from the flow's secrets: `secretHeaders` maps a header to a secret NAME,
 *   decrypted here per input. A missing secret fails the server (its tools are left out). Secret
 *   values never reach the engine and are masked in every error.
 * - One MCP session per server and input: the client is cached for the input's lifetime (the
 *   engine services are built per input), so `initialize` runs once per server.
 *
 * Production and the Builder test run share this through `engineServices`.
 */

export interface McpServiceOptions {
  loadSecret: (name: string) => Promise<string | null>;
  /** Test seam; the global `fetch` by default. */
  fetch?: typeof fetch;
}

export function mcpService(options: McpServiceOptions): Required<Pick<ServicosDoMotor, 'listMcpTools' | 'callMcpTool'>> {
  const clients = new Map<string, Promise<{ client: McpClient; secrets: Set<string> }>>();

  const connect = (server: McpServer): Promise<{ client: McpClient; secrets: Set<string> }> => {
    const key = JSON.stringify([server.url, server.transport, server.headers, server.secretHeaders]);
    let entry = clients.get(key);
    if (!entry) {
      entry = (async () => {
        confirmarUrlSegura(server.url);
        const headers: Record<string, string> = { ...server.headers };
        const secrets = new Set<string>();
        for (const [header, secretName] of Object.entries(server.secretHeaders)) {
          const value = (await options.loadSecret(secretName))?.trim();
          if (!value) {
            throw new Error(`A variável sensível '${secretName}' do servidor MCP '${server.code}' não está configurada neste fluxo.`);
          }
          headers[header] = value;
          secrets.add(value);
        }
        const client = new McpClient({
          url: server.url,
          transport: server.transport,
          headers,
          ...(options.fetch ? { fetch: options.fetch } : {}),
        });
        return { client, secrets };
      })();
      // A failed connection is retried on the next use instead of being cached.
      entry.catch(() => clients.delete(key));
      clients.set(key, entry);
    }
    return entry;
  };

  const masked = async <T>(server: McpServer, run: (client: McpClient) => Promise<T>, signal?: AbortSignal): Promise<T> => {
    let secrets = new Set<string>();
    try {
      const connection = await connect(server);
      secrets = connection.secrets;
      return await run(connection.client);
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(maskSecrets(message, secrets));
    }
  };

  return {
    listMcpTools: (server, signal): Promise<McpToolInfo[]> => masked(server, (client) => client.listTools(signal), signal),
    callMcpTool: (server, name, args, signal): Promise<McpToolResult> =>
      masked(
        server,
        async (client) => {
          const result = await client.callTool(name, args, signal);
          return { content: mcpResultText(result), isError: result.isError };
        },
        signal,
      ),
  };
}

import ivm from 'isolated-vm';
import type { ScriptRequest } from '@pipe/core';
import { chamarComMtls, type PedidoDeSaida } from './mtls.js';
import { confirmarUrlSegura } from './management/integrations.js';

/**
 * Flow scripts (`ExecuteScript`/`ExecuteScriptV2`) run in a fresh V8 isolate per call: no Node
 * globals, no `require`/`import`, heap capped by `memoryLimit`, wall-clock capped by the request
 * timeout. Only JSON-safe data crosses the boundary: inputs are copied in, the result leaves as a
 * JSON string. The isolate lives inside the API process.
 * ponytail: in-process isolate; a dedicated child process is the hardening step if isolated-vm ever
 * reports a catastrophic error in production.
 */

/** Host side of `request.fetchAsync`; values arrive already copied out of the isolate. */
export type ScriptFetch = (url: unknown, init?: unknown) => Promise<{ status: number; body: string }>;

export interface ScriptOptions {
  /** Exposed to V2 scripts as `request.fetchAsync`; V1 never gets HTTP. */
  fetch?: ScriptFetch;
  /** Blip limit for both engines: 100 MB. */
  memoryMb?: number;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export async function runFlowScript(request: ScriptRequest, options: ScriptOptions = {}): Promise<unknown> {
  if (!IDENTIFIER.test(request.functionName)) {
    throw new Error(`Nome de função inválido no script: '${request.functionName}'.`);
  }
  const memoryMb = options.memoryMb ?? 100;
  const isolate = new ivm.Isolate({ memoryLimit: memoryMb, onCatastrophicError: catastrophic });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (!isolate.isDisposed) isolate.dispose();
  }, request.timeoutMs);
  try {
    const context = await isolate.createContext();
    if (request.version === 2 && options.fetch) {
      const fetch = options.fetch;
      // A host rejection would surface as an unhandled rejection in the API; it crosses as data instead.
      const settled = (url: unknown, init: unknown) =>
        fetch(url, init).then(
          (response) => ({ ok: true, response }),
          (error: unknown) => ({ ok: false, message: message(error) }),
        );
      // Separate closure: the Reference stays private to fetchAsync, out of the script's scope.
      await context.evalClosure(
        `globalThis.request = Object.freeze({
          fetchAsync: async (url, init) => {
            const r = await $0.apply(undefined, [url, init],
              { arguments: { copy: true }, result: { promise: true, copy: true } });
            if (!r.ok) throw new Error(r.message);
            return r.response;
          },
        });`,
        [new ivm.Reference(settled)],
      );
    }
    const result = await context.evalClosure(
      `${request.source}\n;return (async () => JSON.stringify(await ${request.functionName}(...$0)))();`,
      [request.args],
      { arguments: { copy: true }, result: { promise: true, copy: true }, timeout: request.timeoutMs },
    );
    if (result === undefined) return null;
    if (typeof result !== 'string') throw new Error('O script devolveu um valor que não pode ser serializado.');
    return JSON.parse(result) as unknown;
  } catch (error) {
    if (timedOut || /timed out/i.test(message(error))) {
      throw new Error(`O script excedeu o tempo limite de ${request.timeoutMs / 1000} s.`);
    }
    if (/memory limit/i.test(message(error))) {
      throw new Error(`O script excedeu o limite de memória de ${memoryMb} MB.`);
    }
    throw error instanceof Error ? error : new Error(message(error));
  } finally {
    clearTimeout(timer);
    if (!isolate.isDisposed) isolate.dispose();
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * isolated-vm: V8 lost control of an isolate and its resources are unrecoverable. Log without script
 * content or contact data, let the SIGTERM handler in `main.ts` drain outstanding work, then abort.
 */
function catastrophic(reason: string): void {
  console.error('[alert] script_sandbox_catastrophic', { reason });
  process.kill(process.pid, 'SIGTERM');
  setTimeout(() => process.abort(), 10_000).unref();
}

/**
 * `request.fetchAsync` for a tenant: same SSRF gate (`confirmarUrlSegura`) and mTLS client
 * (`chamarComMtls`) as `ProcessHttp`. The argument/response shape (`url`, `{ method, headers, body }`
 * → `{ status, body }`) is provisional until the exact Blip signature is captured.
 */
export function scriptFetch(tenantId: string): ScriptFetch {
  return async (url, init) => {
    if (typeof url !== 'string') throw new Error('request.fetchAsync precisa de uma URL em texto.');
    confirmarUrlSegura(url);
    const i = (init && typeof init === 'object' ? init : {}) as Record<string, unknown>;
    const method = typeof i['method'] === 'string' ? i['method'].toUpperCase() : 'GET';
    if (!METHODS.has(method)) throw new Error(`Método HTTP não suportado: ${method}.`);
    const headers: Record<string, string> = {};
    if (i['headers'] && typeof i['headers'] === 'object') {
      for (const [k, v] of Object.entries(i['headers'] as Record<string, unknown>)) headers[k] = String(v);
    }
    const resposta = await chamarComMtls(tenantId, url, {
      metodo: method as PedidoDeSaida['metodo'],
      headers,
      ...(typeof i['body'] === 'string' ? { body: i['body'] } : {}),
      timeoutMs: 10_000,
    });
    const limite = Number(process.env['PIPE_PROCESS_HTTP_MAX_RESPOSTA_BYTES'] ?? 1_048_576);
    return { status: resposta.status, body: (await resposta.texto()).slice(0, limite) };
  };
}

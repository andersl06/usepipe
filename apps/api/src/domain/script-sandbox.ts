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

/**
 * Host side of `request.fetchAsync`; values arrive already copied out of the isolate. `signal`
 * aborts when the script execution ends, so no host call outlives its isolate.
 */
export type ScriptFetch = (url: unknown, init?: unknown, signal?: AbortSignal) => Promise<{ status: number; body: string }>;

/** `request.fetchAsync` calls allowed per script execution (a script cannot fan out thousands). */
export const MAX_FETCHES_POR_SCRIPT = 10;
/** Isolates alive at once in this process; the next execution waits for a slot up to its time limit. */
export const MAX_ISOLATES = Number(process.env['PIPE_SCRIPT_MAX_ISOLATES'] ?? 8);
/** Serialized return value ceiling: it becomes a context variable persisted on every message (same as SetBucket). */
export const MAX_RESULTADO_BYTES = 65_536;

// ponytail: per-process semaphore; a cluster-wide limit would need Redis, add it if the API scales out.
let isolatesAtivos = 0;
const esperandoIsolate: (() => void)[] = [];

async function ocuparIsolate(esperaMs: number): Promise<void> {
  if (isolatesAtivos < MAX_ISOLATES) {
    isolatesAtivos += 1;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const vez = () => {
      clearTimeout(relogio);
      resolve();
    };
    const relogio = setTimeout(() => {
      esperandoIsolate.splice(esperandoIsolate.indexOf(vez), 1);
      reject(new Error(`Há scripts em execução demais neste momento (limite de ${MAX_ISOLATES}).`));
    }, esperaMs);
    esperandoIsolate.push(vez);
  });
}

/** Hand the slot straight to the next waiting execution, or free it. */
function liberarIsolate(): void {
  const proxima = esperandoIsolate.shift();
  if (proxima) proxima();
  else isolatesAtivos -= 1;
}

export interface ScriptOptions {
  /** Exposed to V2 scripts as `request.fetchAsync`; V1 never gets HTTP. */
  fetch?: ScriptFetch;
  /** Blip limit for both engines: 100 MB. */
  memoryMb?: number;
  /**
   * The flow's function library (`funcao_do_fluxo`, D-22): each function becomes callable by name
   * from `ExecuteScript`/`ExecuteScriptV2`, which is what "Inserir função da biblioteca" writes.
   */
  library?: Iterable<{ name: string; code: string }>;
}

/**
 * Each library entry runs in its own function scope and only its named function reaches the
 * script, so a helper or `const` inside one entry never collides with the script or another entry.
 * `var` (not `const`) so a script declaring a function of the same name still loads.
 */
function libraryPrelude(library: Iterable<{ name: string; code: string }> | undefined): string {
  let prelude = '';
  for (const fn of library ?? []) {
    if (!IDENTIFIER.test(fn.name)) continue;
    // A function the script itself declares (hoisted) with the same name wins over the library.
    prelude += `var ${fn.name} = typeof ${fn.name} === 'function' ? ${fn.name} : (function () {\n${fn.code}\n;return ${fn.name};\n})();\n`;
  }
  return prelude;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export async function runFlowScript(request: ScriptRequest, options: ScriptOptions = {}): Promise<unknown> {
  if (!IDENTIFIER.test(request.functionName)) {
    throw new Error(`Nome de função inválido no script: '${request.functionName}'.`);
  }
  await ocuparIsolate(request.timeoutMs);
  try {
    return await rodarNoIsolate(request, options);
  } finally {
    liberarIsolate();
  }
}

async function rodarNoIsolate(request: ScriptRequest, options: ScriptOptions): Promise<unknown> {
  const memoryMb = options.memoryMb ?? 100;
  const isolate = new ivm.Isolate({ memoryLimit: memoryMb, onCatastrophicError: catastrophic });
  const fim = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (!isolate.isDisposed) isolate.dispose();
  }, request.timeoutMs);
  try {
    const context = await isolate.createContext();
    if (request.version === 2 && options.fetch) {
      const fetch = options.fetch;
      let chamadas = 0;
      // A host rejection would surface as an unhandled rejection in the API; it crosses as data instead.
      const settled = (url: unknown, init: unknown) => {
        chamadas += 1;
        if (chamadas > MAX_FETCHES_POR_SCRIPT) {
          return Promise.resolve({
            ok: false,
            message: `request.fetchAsync pode ser chamado no máximo ${MAX_FETCHES_POR_SCRIPT} vezes por execução.`,
          });
        }
        return fetch(url, init, fim.signal).then(
          (response) => ({ ok: true, response }),
          (error: unknown) => ({ ok: false, message: message(error) }),
        );
      };
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
      `${libraryPrelude(options.library)}${request.source}\n;return (async () => JSON.stringify(await ${request.functionName}(...$0)))();`,
      [request.args],
      { arguments: { copy: true }, result: { promise: true, copy: true }, timeout: request.timeoutMs },
    );
    if (result === undefined) return null;
    if (typeof result !== 'string') throw new Error('O script devolveu um valor que não pode ser serializado.');
    if (Buffer.byteLength(result, 'utf8') > MAX_RESULTADO_BYTES) {
      throw new Error(`O retorno do script excede ${MAX_RESULTADO_BYTES / 1024} KB.`);
    }
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
    fim.abort(new Error('A execução do script terminou.'));
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
  return async (url, init, signal) => {
    if (typeof url !== 'string') throw new Error('request.fetchAsync precisa de uma URL em texto.');
    confirmarUrlSegura(url);
    const i = (init && typeof init === 'object' ? init : {}) as Record<string, unknown>;
    const method = typeof i['method'] === 'string' ? i['method'].toUpperCase() : 'GET';
    if (!METHODS.has(method)) throw new Error(`Método HTTP não suportado: ${method}.`);
    const headers: Record<string, string> = {};
    if (i['headers'] && typeof i['headers'] === 'object') {
      for (const [k, v] of Object.entries(i['headers'] as Record<string, unknown>)) headers[k] = String(v);
    }
    const limite = Number(process.env['PIPE_PROCESS_HTTP_MAX_RESPOSTA_BYTES'] ?? 1_048_576);
    const resposta = await chamarComMtls(tenantId, url, {
      metodo: method as PedidoDeSaida['metodo'],
      headers,
      ...(typeof i['body'] === 'string' ? { body: i['body'] } : {}),
      timeoutMs: 10_000,
      maxBytes: limite,
      ...(signal ? { signal } : {}),
    });
    return { status: resposta.status, body: await resposta.texto() };
  };
}

import ivm from 'isolated-vm';
import { timeSpanSeconds, type ScriptRequest, type ScriptVariables } from '@pipe/core';
import { MAX_CONTEXT_CALLS, v2ApiPrelude } from './script-v2-api.js';
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
export type ScriptFetch = (
  url: unknown,
  init?: unknown,
  signal?: AbortSignal,
) => Promise<{ status: number; body: string; headers?: Record<string, string> }>;

/** `request.fetchAsync` calls allowed per script execution (a script cannot fan out thousands). */
export const MAX_FETCHES_POR_SCRIPT = 10;
/** Isolates alive at once in this process; the next execution waits for a slot up to its time limit. */
export const MAX_ISOLATES = Number(process.env['PIPE_SCRIPT_MAX_ISOLATES'] ?? 8);
/** Serialized return value ceiling: it becomes a context variable persisted on every message (same as SetBucket). */
export const MAX_RESULTADO_BYTES = 65_536;

// ponytail: per-process semaphore; a cluster-wide limit would need Redis, add it if the API scales out.
let isolatesAtivos = 0;
const esperandoIsolate: (() => void)[] = [];

export async function ocuparIsolate(esperaMs: number): Promise<void> {
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
export function liberarIsolate(): void {
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

/**
 * Pins the isolate's local time to one IANA zone (`LocalTimeZoneEnabled` → bot zone, otherwise UTC,
 * as Blip's servers run scripts), whatever zone the API host has. Local getters/setters,
 * `getTimezoneOffset`, `toString`, `toLocale*` and `new Date(y, m, …)` follow the zone.
 * ponytail: `new Date('2026-01-01T10:00')` (text without offset) still parses in the host zone;
 * patch `Date.parse` too if a flow depends on it.
 */
function timeZonePrelude(timeZone: string | undefined): string {
  if (!timeZone) return '';
  let zone = 'UTC';
  try {
    zone = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
  } catch {
    // Unknown zone: stay deterministic in UTC.
  }
  return `(() => {
  const D = Date, P = D.prototype, TZ = ${JSON.stringify(zone)};
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric',
    month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const offset = (t) => {
    if (t !== t) return 0;
    const p = {};
    for (const x of fmt.formatToParts(new D(t))) p[x.type] = x.value;
    const s = t - (((t % 1000) + 1000) % 1000);
    return D.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - s;
  };
  const utc = {};
  for (const n of ['FullYear', 'Month', 'Date', 'Day', 'Hours', 'Minutes', 'Seconds', 'Milliseconds']) {
    utc['get' + n] = P['getUTC' + n];
    if (n !== 'Day') utc['set' + n] = P['setUTC' + n];
  }
  const wall = (d) => new D(d.getTime() + offset(d.getTime()));
  const fromWall = (w) => { const t = w - offset(w); return w - offset(t); };
  for (const k of Object.keys(utc)) {
    P[k] = k.startsWith('get')
      ? function () { return utc[k].call(wall(this)); }
      : function (...a) { const w = wall(this); utc[k].apply(w, a); return this.setTime(fromWall(w.getTime())); };
  }
  P.getTimezoneOffset = function () { return -offset(this.getTime()) / 60000; };
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const two = (n) => String(n).padStart(2, '0');
  P.toDateString = function () {
    if (this.getTime() !== this.getTime()) return 'Invalid Date';
    return days[this.getDay()] + ' ' + months[this.getMonth()] + ' ' + two(this.getDate()) + ' ' + this.getFullYear();
  };
  P.toTimeString = function () {
    if (this.getTime() !== this.getTime()) return 'Invalid Date';
    const o = -this.getTimezoneOffset(), a = Math.abs(o);
    return two(this.getHours()) + ':' + two(this.getMinutes()) + ':' + two(this.getSeconds()) +
      ' GMT' + (o < 0 ? '-' : '+') + two(Math.floor(a / 60)) + two(a % 60);
  };
  P.toString = function () {
    return this.getTime() !== this.getTime() ? 'Invalid Date' : this.toDateString() + ' ' + this.toTimeString();
  };
  for (const n of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
    const f = P[n];
    P[n] = function (l, o) { return f.call(this, l, { timeZone: TZ, ...o }); };
  }
  const Z = function Date(...a) {
    if (!new.target) return new D().toString();
    if (a.length < 2) return new D(...a);
    const [y, m, d = 1, h = 0, mi = 0, s = 0, ms = 0] = a.map(Number);
    return new D(fromWall(D.UTC(y, m, d, h, mi, s, ms)));
  };
  Z.prototype = P;
  Z.now = D.now; Z.UTC = D.UTC; Z.parse = D.parse;
  Object.defineProperty(P, 'constructor', { value: Z, writable: true, configurable: true });
  globalThis.Date = Z;
})();
`;
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
  const inicio = Date.now();
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
      // Blip's response also has `success`, `headers` and `jsonAsync()` (used by its own templates).
      await context.evalClosure(
        `globalThis.request = Object.freeze({
          fetchAsync: async (url, init) => {
            const r = await $0.apply(undefined, [url, init],
              { arguments: { copy: true }, result: { promise: true, copy: true } });
            if (!r.ok) throw new Error(r.message);
            const { status, body } = r.response;
            const headers = r.response.headers || {};
            return {
              status,
              body,
              headers,
              success: status >= 200 && status < 300,
              jsonAsync: async () => JSON.parse(body),
              getHeader: (name) => headers[String(name).toLowerCase()] ?? null,
            };
          },
        });`,
        [new ivm.Reference(settled)],
      );
    }
    if (request.version === 2) {
      await context.evalClosure(v2ApiPrelude(request.timeZone ?? 'UTC'), [
        new ivm.Reference(sleepFor(inicio + request.timeoutMs, fim.signal)),
        request.variables ? new ivm.Reference(contextBridge(request.variables, fim.signal)) : undefined,
      ]);
    }
    const result = await context.evalClosure(
      `${timeZonePrelude(request.timeZone)}${libraryPrelude(options.library)}${request.source}\n;return (async () => JSON.stringify(await ${request.functionName}(...$0)))();`,
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

/**
 * Host side of `time.sleep`: waits in the host event loop while only the isolate thread blocks.
 * A sleep that would cross the execution deadline never wakes up early; the time limit ends it.
 */
function sleepFor(deadline: number, end: AbortSignal): (ms: number) => Promise<void> {
  return (ms) =>
    new Promise<void>((resolve) => {
      if (end.aborted) return resolve();
      const remaining = deadline - Date.now();
      const timer = ms < remaining ? setTimeout(resolve, ms) : undefined;
      end.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
}

/**
 * Host side of `context.*Async`: validated, counted and refused once the execution ended, so a late
 * call from a timed-out script never changes the flow context. Errors cross as data.
 */
function contextBridge(
  variables: ScriptVariables,
  end: AbortSignal,
): (op: unknown, name: unknown, value?: unknown, expiration?: unknown) => Promise<{ ok: boolean; value?: string | null; message?: string }> {
  let calls = 0;
  return async (op, name, value, expiration) => {
    try {
      if (end.aborted) throw new Error('A execução do script terminou.');
      calls += 1;
      if (calls > MAX_CONTEXT_CALLS) {
        throw new Error(`context.*Async pode ser chamado no máximo ${MAX_CONTEXT_CALLS} vezes por execução.`);
      }
      if (typeof name !== 'string') throw new Error('O nome da variável deve ser um texto.');
      if (op === 'get') return { ok: true, value: await variables.get(name) };
      if (op === 'delete') {
        variables.delete(name);
        return { ok: true, value: null };
      }
      if (op !== 'set' || typeof value !== 'string') throw new Error('Operação de contexto inválida.');
      if (Buffer.byteLength(value, 'utf8') > MAX_RESULTADO_BYTES) {
        throw new Error(`O valor da variável excede ${MAX_RESULTADO_BYTES / 1024} KB.`);
      }
      variables.set(name, value, expirationSeconds(expiration));
      return { ok: true, value: null };
    } catch (error) {
      return { ok: false, message: message(error) };
    }
  };
}

/**
 * `setVariableAsync` third argument: a number is milliseconds (JavaScript's unit, as `time.sleep`),
 * a text is a .NET TimeSpan (`01:00:00`), as `builder:stateExpiration` is written.
 */
function expirationSeconds(expiration: unknown): number | undefined {
  if (typeof expiration === 'number') return expiration > 0 ? expiration / 1000 : undefined;
  if (typeof expiration === 'string') {
    const seconds = timeSpanSeconds(expiration);
    if (seconds === null) throw new Error(`Expiração inválida: '${expiration}'.`);
    return seconds > 0 ? seconds : undefined;
  }
  return undefined;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * isolated-vm: V8 lost control of an isolate and its resources are unrecoverable. Log without script
 * content or contact data, let the SIGTERM handler in `main.ts` drain outstanding work, then abort.
 */
export function catastrophic(reason: string): void {
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
    return { status: resposta.status, body: await resposta.texto(), headers: resposta.headers ?? {} };
  };
}

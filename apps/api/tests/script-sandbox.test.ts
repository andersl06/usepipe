import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScriptRequest } from '@pipe/core';
import { runFlowScript, scriptFetch } from '../src/domain/script-sandbox.js';

function script(source: string, extra: Partial<ScriptRequest> = {}): ScriptRequest {
  return {
    version: 2,
    source,
    functionName: 'run',
    args: [],
    timeoutMs: 10_000,
    localTimeZone: false,
    ...extra,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('script sandbox: behavior', () => {
  it('calls run with the input variables and returns the JSON-safe result', async () => {
    const r = await runFlowScript(
      script('function run(a, b) { return { soma: Number(a) + Number(b), texto: a + b }; }', {
        version: 1,
        args: ['1', '2'],
        timeoutMs: 5_000,
      }),
    );
    expect(r).toEqual({ soma: 3, texto: '12' });
  });

  it('awaits an async function (V2) and honors a custom function name', async () => {
    const r = await runFlowScript(
      script('async function principal(x) { await null; return `oi ${x}`; }', {
        functionName: 'principal',
        args: ['Ana'],
      }),
    );
    expect(r).toBe('oi Ana');
  });

  it('returns null for undefined and missing inputs arrive as null', async () => {
    expect(await runFlowScript(script('function run() {}'))).toBeNull();
    expect(await runFlowScript(script('function run(a) { return a === null; }', { args: [null] }))).toBe(true);
  });

  it('propagates the error thrown by the script', async () => {
    await expect(runFlowScript(script('function run() { throw new Error("falhou aqui"); }'))).rejects.toThrow(
      'falhou aqui',
    );
  });

  it('rejects a function name that is not an identifier', async () => {
    await expect(
      runFlowScript(script('function run() { return 1; }', { functionName: 'run(); process' })),
    ).rejects.toThrow(/função/);
  });
});

describe('script sandbox: escape attempts', () => {
  it('has no require, process, module or Buffer in scope', async () => {
    const r = await runFlowScript(
      script(`function run() {
        return [typeof require, typeof process, typeof module, typeof Buffer, typeof globalThis.process,
          typeof setTimeout, typeof fetch];
      }`),
    );
    expect(r).toEqual(['undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined']);
  });

  it('Function constructor reaches only the isolate global, never the host', async () => {
    const r = await runFlowScript(
      script(`function run() {
        const g = Function('return this')();
        const viaCtor = ({}).constructor.constructor('return this')();
        return [typeof g.process, typeof viaCtor.process, typeof g.require, g === globalThis];
      }`),
    );
    expect(r).toEqual(['undefined', 'undefined', 'undefined', true]);
  });

  it('input values carry no host prototype (constructor of an argument)', async () => {
    const r = await runFlowScript(
      script(`function run(a) {
        return typeof a.constructor.constructor('return typeof process')() + '|' +
          typeof a.constructor.constructor('return this')().require;
      }`, { args: ['texto'] }),
    );
    expect(r).toBe('undefined|undefined');
  });

  it('dynamic import of node:fs and child_process fails', async () => {
    const r = await runFlowScript(
      script(`async function run() {
        const out = [];
        for (const m of ['node:fs', 'fs', 'node:child_process']) {
          try { await import(m); out.push('carregou ' + m); } catch (e) { out.push('bloqueado'); }
        }
        return out;
      }`),
    );
    expect(r).toEqual(['bloqueado', 'bloqueado', 'bloqueado']);
  });

  it('has no network API besides the approved request.fetchAsync', async () => {
    const r = await runFlowScript(
      script(`function run() {
        return [typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof request];
      }`),
    );
    // Without an injected fetch not even request exists.
    expect(r).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);
  });

  it('V1 never gets request.fetchAsync, even when the host offers it', async () => {
    const fetch = vi.fn();
    const r = await runFlowScript(script('function run() { return typeof request; }', { version: 1 }), {
      fetch,
    });
    expect(r).toBe('undefined');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prototype pollution inside the script does not reach the host', async () => {
    await runFlowScript(
      script(`function run() {
        Object.prototype.polluted = 'sim';
        Array.prototype.map = function () { return 'x'; };
        JSON.parse('{"__proto__": {"polluted2": "sim"}}');
        return 1;
      }`),
    );
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(({} as Record<string, unknown>)['polluted2']).toBeUndefined();
    expect([1, 2].map((x) => x * 2)).toEqual([2, 4]);
  });

  it('a result that tries to smuggle a function or getter crosses only as JSON', async () => {
    const r = await runFlowScript(
      script(`function run() {
        return { f: function () { return 1; }, get g() { return 'valor'; }, n: 1 };
      }`),
    );
    expect(r).toEqual({ g: 'valor', n: 1 });
  });

  it('infinite loop stops at the time limit', async () => {
    const inicio = Date.now();
    await expect(
      runFlowScript(script('function run() { while (true) {} }', { version: 1, timeoutMs: 500 })),
    ).rejects.toThrow(/tempo limite/);
    expect(Date.now() - inicio).toBeLessThan(1_000);
  });

  it('a never-settling async script stops at the time limit', async () => {
    const inicio = Date.now();
    await expect(
      runFlowScript(script('async function run() { await new Promise(() => {}); }', { timeoutMs: 500 })),
    ).rejects.toThrow(/tempo limite/);
    expect(Date.now() - inicio).toBeLessThan(1_000);
  });

  it('memory bomb hits the memory limit without killing the test process', async () => {
    await expect(
      runFlowScript(
        script(`function run() {
          const a = [];
          while (true) a.push(new Array(1e6).fill('x'.repeat(10)));
        }`),
        { memoryMb: 16 },
      ),
    ).rejects.toThrow(/limite de memória/);
    // The host keeps working after the isolate died.
    expect(await runFlowScript(script('function run() { return 2 + 2; }'))).toBe(4);
  });
});

describe('script sandbox: HTTP', () => {
  it('request.fetchAsync goes through the host fetch with copied values', async () => {
    const fetch = vi.fn(async (url: string) => ({ status: 200, body: `ok ${url}` }));
    const r = await runFlowScript(
      script(`async function run() {
        const resposta = await request.fetchAsync('https://api.exemplo.com/x', { method: 'GET' });
        return resposta.status + ' ' + resposta.body;
      }`),
      { fetch },
    );
    expect(r).toBe('200 ok https://api.exemplo.com/x');
    expect(fetch).toHaveBeenCalledWith('https://api.exemplo.com/x', { method: 'GET' });
  });

  it('blocks private URL from script HTTP (SSRF)', async () => {
    const saida = vi.spyOn(globalThis, 'fetch');
    const fetch = scriptFetch('00000000-0000-0000-0000-000000000000');
    for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.1/',
      'https://127.0.0.1/', 'https://169.254.169.254/', 'https://10.0.0.1/', 'https://localhost/']) {
      await expect(
        runFlowScript(
          script(`async function run(u) { return (await request.fetchAsync(u)).status; }`, { args: [url] }),
          { fetch },
        ),
      ).rejects.toThrow(/HTTPS|localhost|rede privada/);
    }
    expect(saida).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScriptRequest } from '@pipe/core';
import {
  MAX_FETCHES_POR_SCRIPT,
  MAX_ISOLATES,
  MAX_RESULTADO_BYTES,
  runFlowScript,
  scriptFetch,
} from '../src/domain/script-sandbox.js';
import { chamarComMtls } from '../src/domain/mtls.js';
import { confirmarUrlSegura } from '../src/domain/management/integrations.js';

const TENANT_QUALQUER = '00000000-0000-0000-0000-000000000000';

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
        return a.constructor.constructor('return typeof process')() + '|' +
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
    const fetch = vi.fn(async (url: unknown) => ({ status: 200, body: `ok ${String(url)}` }));
    const r = await runFlowScript(
      script(`async function run() {
        const resposta = await request.fetchAsync('https://api.exemplo.com/x', { method: 'GET' });
        return resposta.status + ' ' + resposta.body;
      }`),
      { fetch },
    );
    expect(r).toBe('200 ok https://api.exemplo.com/x');
    expect(fetch).toHaveBeenCalledWith('https://api.exemplo.com/x', { method: 'GET' }, expect.any(AbortSignal));
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

  it('blocks bracketed IPv6 literals, including IPv4-mapped ones (CR-05)', async () => {
    const saida = vi.spyOn(globalThis, 'fetch');
    const fetch = scriptFetch(TENANT_QUALQUER);
    for (const url of ['https://[::1]/', 'https://[::ffff:a9fe:a9fe]/latest/meta-data', 'https://[::ffff:169.254.169.254]/',
      'https://[::ffff:127.0.0.1]/', 'https://[::ffff:7f00:1]/', 'https://[fd00::1]/', 'https://[fe80::1]/', 'https://[::]/',
      'https://[64:ff9b::a9fe:a9fe]/', 'https://[2002:a9fe:a9fe::1]/', 'https://100.64.0.1/']) {
      await expect(
        runFlowScript(
          script(`async function run(u) { return (await request.fetchAsync(u)).status; }`, { args: [url] }),
          { fetch },
        ),
      ).rejects.toThrow(/rede privada|localhost/);
    }
    expect(saida).not.toHaveBeenCalled();
  });

  it('still accepts public hosts, including names that merely start with fc/fd and public IPv6 (CR-05)', () => {
    for (const url of ['https://fcbarcelona.com/', 'https://fd.exemplo.com/', 'https://[2001:4860:4860::8888]/', 'https://8.8.8.8/']) {
      expect(() => confirmarUrlSegura(url)).not.toThrow();
    }
  });
});

describe('script sandbox: resource limits (WR-02)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('caps request.fetchAsync calls per execution and aborts the host calls when it ends', async () => {
    const sinais: AbortSignal[] = [];
    const fetch = vi.fn(async (_url: unknown, _init: unknown, signal?: AbortSignal) => {
      if (signal) sinais.push(signal);
      return { status: 200, body: 'ok' };
    });
    await expect(
      runFlowScript(
        script(`async function run() {
          await Promise.all(Array.from({ length: ${MAX_FETCHES_POR_SCRIPT + 1} }, () => request.fetchAsync('https://api.exemplo.com/x')));
          return 'todas';
        }`),
        { fetch },
      ),
    ).rejects.toThrow(`no máximo ${MAX_FETCHES_POR_SCRIPT}`);
    expect(fetch).toHaveBeenCalledTimes(MAX_FETCHES_POR_SCRIPT);
    expect(sinais.length).toBeGreaterThan(0);
    expect(sinais.every((s) => s.aborted)).toBe(true);
  });

  it('reads the script HTTP response as a stream and stops at the byte limit', async () => {
    let lidos = 0;
    const corpo = new ReadableStream<Uint8Array>({
      pull(controle) {
        // An endless body: only a streaming reader that stops at the limit finishes.
        lidos += 64 * 1024;
        controle.enqueue(new Uint8Array(64 * 1024).fill(97));
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(corpo, { status: 200 }));
    const r = await chamarComMtls(TENANT_QUALQUER, 'http://publico.exemplo.com/grande', {
      metodo: 'GET', headers: {}, timeoutMs: 5_000, maxBytes: 1_048_576,
    });
    const texto = await r.texto();
    expect(texto.length).toBe(1_048_576);
    expect(lidos).toBeLessThan(2 * 1_048_576);
  });

  it('limits concurrent isolates: extra executions wait for a slot, and give up at their time limit', async () => {
    const lentos = Array.from({ length: MAX_ISOLATES }, () =>
      runFlowScript(script('function run() { const t = Date.now(); while (Date.now() - t < 300) {} return 1; }')));
    const esperando = runFlowScript(script('function run() { return 2; }'));
    const desistiu = runFlowScript(script('function run() { return 3; }', { timeoutMs: 50 }));
    await expect(desistiu).rejects.toThrow(/scripts em execução/);
    expect(await Promise.all(lentos)).toEqual(Array(MAX_ISOLATES).fill(1));
    expect(await esperando).toBe(2);
  });

  it('refuses a return value larger than the variable limit', async () => {
    await expect(
      runFlowScript(script(`function run() { return 'x'.repeat(${MAX_RESULTADO_BYTES + 1}); }`)),
    ).rejects.toThrow(/retorno do script/);
    expect(await runFlowScript(script(`function run() { return 'x'.repeat(${MAX_RESULTADO_BYTES - 10}); }`))).toHaveLength(MAX_RESULTADO_BYTES - 10);
  });
});

describe('script sandbox: flow function library (CR-07)', () => {
  const library = [
    { name: 'formatarCpf', code: 'const limpar = (t) => String(t).replace(/\\D/g, ""); function formatarCpf(cpf) { return limpar(cpf); }' },
    { name: 'saudar', code: 'const limpar = 1; function saudar(nome) { return "Olá " + nome; }' },
  ];

  it('library functions are callable from the script, each in its own scope', async () => {
    const r = await runFlowScript(
      script('function run(cpf) {\n  const resultado = formatarCpf(cpf);\n  return saudar(resultado) + " " + typeof limpar;\n}', { args: ['123.456.789-00'] }),
      { library },
    );
    expect(r).toBe('Olá 12345678900 undefined');
  });

  it('a script declaring a function with a library name still loads, and its own declaration wins', async () => {
    const r = await runFlowScript(
      script('function saudar() { return "local"; }\nfunction run() { return saudar(); }'),
      { library },
    );
    expect(r).toBe('local');
  });
});

describe('outbound HTTP: redirects are re-validated hop by hop (CR-05)', () => {
  afterEach(() => vi.restoreAllMocks());
  const redirecionar = (location: string, status = 302) =>
    new Response(null, { status, headers: { location } });

  it.each([
    'https://169.254.169.254/latest/meta-data/iam/security-credentials/',
    'http://169.254.169.254/latest/meta-data',
    'https://[::1]/admin',
    'https://[::ffff:a9fe:a9fe]/',
    'https://[::ffff:127.0.0.1]/',
  ])('302 → %s is refused and never requested', async (location) => {
    const saida = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirecionar(location));
    await expect(
      chamarComMtls(TENANT_QUALQUER, 'http://publico.exemplo.com/r', { metodo: 'GET', headers: {}, timeoutMs: 5_000 }),
    ).rejects.toThrow(/HTTPS|rede privada|localhost/);
    expect(saida).toHaveBeenCalledTimes(1);
    expect(saida.mock.calls[0]![1]).toMatchObject({ redirect: 'manual' });
  });

  it('aborts the request when the caller deadline (action time limit) expires (CR-06)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }));
    const prazo = new AbortController();
    setTimeout(() => prazo.abort(new Error('prazo da ação')), 50);
    await expect(
      chamarComMtls(TENANT_QUALQUER, 'http://publico.exemplo.com/lento', {
        metodo: 'GET', headers: {}, timeoutMs: 60_000, signal: prazo.signal,
      }),
    ).rejects.toThrow('prazo da ação');
  });

  it('follows a safe redirect as GET, dropping credentials across origins, and caps the hops', async () => {
    const saida = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirecionar('https://outro.exemplo.com/final', 302))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const r = await chamarComMtls(TENANT_QUALQUER, 'http://publico.exemplo.com/r', {
      metodo: 'POST', headers: { authorization: 'Bearer segredo', 'x-outro': '1' }, body: '{}', timeoutMs: 5_000,
    });
    expect(r.status).toBe(200);
    expect(await r.texto()).toBe('ok');
    expect(saida.mock.calls[1]![0]).toBe('https://outro.exemplo.com/final');
    expect(saida.mock.calls[1]![1]).toMatchObject({ method: 'GET', headers: { 'x-outro': '1' }, body: undefined });
    expect((saida.mock.calls[1]![1] as { headers: Record<string, string> }).headers).not.toHaveProperty('authorization');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => redirecionar('https://outro.exemplo.com/de-novo'));
    await expect(
      chamarComMtls(TENANT_QUALQUER, 'http://publico.exemplo.com/r', { metodo: 'GET', headers: {}, timeoutMs: 5_000 }),
    ).rejects.toThrow(/redirecionou mais de/);
  });
});

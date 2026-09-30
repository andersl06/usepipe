/**
 * P9 — `ExecuteScriptV2` API inside the real isolate: `context.*Async` (through the core bridge
 * `scriptVariables`), `time.parseDate/dateToString/sleep`, the bot time zone and the extra fields of
 * the `request.fetchAsync` response. DB-free: runs with the sandbox only. Values are invented.
 */
import { describe, expect, it, vi } from 'vitest';
import { EXPIRATIONS_KEY, createInbound, scriptVariables, type Context, type ScriptRequest } from '@pipe/core';
import { runFlowScript } from '../src/domain/script-sandbox.js';
import { MAX_CONTEXT_CALLS, MAX_SLEEP_MS } from '../src/domain/script-v2-api.js';

function script(source: string, extra: Partial<ScriptRequest> = {}): ScriptRequest {
  return { version: 2, source, functionName: 'run', args: [], timeoutMs: 10_000, localTimeZone: false, timeZone: 'UTC', ...extra };
}

function flowContext(variables: Record<string, string> = {}) {
  const resolveSecret = vi.fn(async () => 'tok-INVENTED-1234567890');
  const context: Context = {
    user: 'user@domain',
    flow: { id: 'f1', states: [] },
    inbound: createInbound({ id: 'm1', tipo: 'text/plain', conteudo: 'quero pizza' }),
    variables,
    inboundContext: new Map(),
    contact: null,
    services: {
      async send() {},
      async forwardForAttendance() {
        return { id: 'atd', status: 'Open' };
      },
      async registerEvent() {},
      resolveSecret,
    },
  };
  return { context, resolveSecret };
}

describe('script V2: context.*Async', () => {
  it('reads every source, writes and deletes flow variables', async () => {
    const { context } = flowContext({ pedido: '{"id":7}', velha: 'x' });
    const r = await runFlowScript(
      script(
        `async function run() {
          await context.setVariableAsync('texto', 'olá');
          await context.setVariableAsync('objeto', { a: 1, b: [true] });
          await context.setVariableAsync('numero', 42);
          await context.setVariableAsync('vazio', null);
          await context.deleteVariableAsync('velha');
          return [
            await context.getVariableAsync('pedido@id'),
            await context.getVariableAsync('input.content'),
            await context.getVariableAsync('texto'),
            await context.getVariableAsync('velha'),
          ];
        }`,
        { variables: scriptVariables(context) },
      ),
    );
    expect(r).toEqual(['7', 'quero pizza', 'olá', null]);
    expect(context.variables).toMatchObject({ texto: 'olá', objeto: '{"a":1,"b":[true]}', numero: '42', vazio: '' });
    expect('velha' in context.variables).toBe(false);
  });

  it('a Date is stored with time.dateToString in the script zone', async () => {
    const { context } = flowContext();
    await runFlowScript(
      script(`async function run() { await context.setVariableAsync('quando', new Date(Date.UTC(2026, 0, 2, 13, 4, 5))); }`, {
        variables: scriptVariables(context),
        timeZone: 'America/Sao_Paulo',
      }),
    );
    expect(context.variables['quando']).toBe('2026-01-02T10:04:05.0000000-03:00');
  });

  it('expiration: milliseconds or TimeSpan text, persisted like SetVariable.expiration', async () => {
    const { context } = flowContext();
    const before = Date.now();
    await runFlowScript(
      script(
        `async function run() {
          await context.setVariableAsync('ms', 'a', 60000);
          await context.setVariableAsync('ts', 'b', '01:00:00');
        }`,
        { variables: scriptVariables(context) },
      ),
    );
    const deadlines = JSON.parse(context.variables[EXPIRATIONS_KEY]!) as Record<string, number>;
    expect(deadlines['ms']! - before).toBeGreaterThanOrEqual(60_000);
    expect(deadlines['ms']! - before).toBeLessThan(70_000);
    expect(deadlines['ts']! - before).toBeGreaterThanOrEqual(3_600_000);
  });

  it('secret.* reads as null and the secret is never looked up (P11)', async () => {
    const { context, resolveSecret } = flowContext();
    const r = await runFlowScript(
      script(
        `async function run() {
          return [await context.getVariableAsync('secret.apiToken'), await context.getVariableAsync('secret.apiToken@x')];
        }`,
        { variables: scriptVariables(context) },
      ),
    );
    expect(r).toEqual([null, null]);
    expect(resolveSecret).not.toHaveBeenCalled();
  });

  it('the internal #expirations key is out of reach', async () => {
    const { context } = flowContext({ [EXPIRATIONS_KEY]: '{"a":9999999999999}', a: '1' });
    const r = await runFlowScript(
      script(
        `async function run() {
          const out = [];
          for (const f of [
            () => context.getVariableAsync('#expirations'),
            () => context.setVariableAsync('#expirations', '{}'),
            () => context.deleteVariableAsync('#expirations'),
          ]) {
            try { await f(); out.push('passou'); } catch (e) { out.push(e.message); }
          }
          return out;
        }`,
        { variables: scriptVariables(context) },
      ),
    );
    expect(r).toEqual([expect.stringContaining('inválido'), expect.stringContaining('reservado'), expect.stringContaining('reservado')]);
    expect(context.variables[EXPIRATIONS_KEY]).toBe('{"a":9999999999999}');
  });

  it('caps calls and value size, and V1 or a request without the bridge has no context global', async () => {
    const { context } = flowContext();
    await expect(
      runFlowScript(
        script(`async function run() { for (let i = 0; i <= ${MAX_CONTEXT_CALLS}; i++) await context.getVariableAsync('x'); }`, {
          variables: scriptVariables(context),
        }),
      ),
    ).rejects.toThrow(`no máximo ${MAX_CONTEXT_CALLS}`);
    await expect(
      runFlowScript(
        script(`async function run() { await context.setVariableAsync('grande', 'x'.repeat(70000)); }`, {
          variables: scriptVariables(context),
        }),
      ),
    ).rejects.toThrow('64 KB');
    expect(await runFlowScript(script('function run() { return typeof context; }', { version: 1, variables: scriptVariables(context) }))).toBe(
      'undefined',
    );
    expect(await runFlowScript(script('function run() { return typeof context + typeof time; }'))).toBe('undefinedobject');
  });
});

describe('script V2: time.*', () => {
  const run = (body: string, extra: Partial<ScriptRequest> = {}) => runFlowScript(script(`function run() { ${body} }`, extra));

  it('dateToString with .NET custom and standard formats, zone and culture', async () => {
    const at = 'new Date(Date.UTC(2026, 1, 3, 14, 5, 9, 120))';
    expect(await run(`return time.dateToString(${at});`)).toBe('2026-02-03T14:05:09.1200000Z');
    expect(await run(`return time.dateToString(${at}, { format: 'dd/MM/yyyy HH:mm:ss', timeZone: 'E. South America Standard Time' });`)).toBe(
      '03/02/2026 11:05:09',
    );
    expect(await run(`return time.dateToString(${at}, { format: "dddd, d 'de' MMMM 'de' yyyy h:mm tt zzz", culture: 'pt-BR' });`, {
      timeZone: 'America/Sao_Paulo',
    })).toBe('terça-feira, 3 de fevereiro de 2026 11:05 AM -03:00');
    expect(await run(`return time.dateToString(${at}, { format: 'MMM yy ss.FFF' });`)).toBe('Feb 26 09.12');
    expect(await run(`return time.dateToString(${at}, { format: 'u', timeZone: 'America/Sao_Paulo' });`)).toBe('2026-02-03 14:05:09Z');
    expect(await run(`return time.dateToString(${at}, { format: 'd', culture: 'pt-BR' });`)).toBe('03/02/2026');
  });

  it('parseDate honours format, offsets and the default zone', async () => {
    expect(await run(`return time.parseDate('03/02/2026 11:05', { format: 'dd/MM/yyyy HH:mm', timeZone: 'America/Sao_Paulo' }).toISOString();`)).toBe(
      '2026-02-03T14:05:00.000Z',
    );
    expect(await run(`return time.parseDate('2026-02-03T11:05:00-03:00').toISOString();`)).toBe('2026-02-03T14:05:00.000Z');
    expect(await run(`return time.parseDate('2026-02-03 11:05').toISOString();`, { timeZone: 'America/Sao_Paulo' })).toBe(
      '2026-02-03T14:05:00.000Z',
    );
    expect(await run(`return time.parseDate('03/02/2026', { culture: 'pt-BR' }).toISOString();`)).toBe('2026-02-03T00:00:00.000Z');
    expect(await run(`return time.parseDate('3 fevereiro 2026', { format: 'd MMMM yyyy', culture: 'pt-BR' }).toISOString();`)).toBe(
      '2026-02-03T00:00:00.000Z',
    );
    expect(await run(`return time.parseDate('2/3/2026 1:05 PM', { format: 'M/d/yyyy h:mm tt' }).toISOString();`)).toBe(
      '2026-02-03T13:05:00.000Z',
    );
  });

  it('parseDate rejects invalid text, formats and zones', async () => {
    await expect(run(`time.parseDate('31/02/2026', { format: 'dd/MM/yyyy' });`)).rejects.toThrow('não está no formato');
    await expect(run(`time.parseDate('amanhã');`)).rejects.toThrow('Não foi possível interpretar');
    await expect(run(`time.parseDate('2026-01-01', { timeZone: 'Lua/Base' });`)).rejects.toThrow('Fuso horário desconhecido');
  });

  it('dateToString of parseDate round-trips in the bot zone (LocalTimeZoneEnabled)', async () => {
    expect(await run(`const d = time.parseDate('2026-07-10 08:30:00'); return [time.dateToString(d, { format: 's' }), d.getHours()];`, {
      localTimeZone: true,
      timeZone: 'America/Sao_Paulo',
    })).toEqual(['2026-07-10T08:30:00', 8]);
  });

  it('sleep waits without blocking the host and counts against the time limit', async () => {
    let ticks = 0;
    const tick = setInterval(() => (ticks += 1), 10);
    const started = Date.now();
    expect(await run(`const a = Date.now(); time.sleep(200); return Date.now() - a >= 190;`)).toBe(true);
    clearInterval(tick);
    expect(Date.now() - started).toBeGreaterThanOrEqual(190);
    expect(ticks).toBeGreaterThan(5);
    await expect(run(`time.sleep(${MAX_SLEEP_MS + 1});`)).rejects.toThrow(`no máximo ${MAX_SLEEP_MS}`);
    await expect(run(`time.sleep(-1);`)).rejects.toThrow('milissegundos');
    const limitStart = Date.now();
    await expect(run(`time.sleep(1000); time.sleep(1000); return 'acordou';`, { timeoutMs: 1_500 })).rejects.toThrow('tempo limite');
    expect(Date.now() - limitStart).toBeLessThan(3_000);
  });

  it('time is frozen and V1 has no time global', async () => {
    expect(await run(`'use strict'; try { time.sleep = null; } catch (e) { return 'congelado'; } return 'mudou';`)).toBe('congelado');
    expect(await run('return typeof time;', { version: 1, timeoutMs: 5_000 })).toBe('undefined');
  });
});

describe('script V2: request.fetchAsync response', () => {
  it('has success, headers, getHeader and jsonAsync like Blip', async () => {
    const fetch = vi.fn(async () => ({ status: 201, body: '{"id":9}', headers: { 'content-type': 'application/json' } }));
    const r = await runFlowScript(
      script(`async function run() {
        const r = await request.fetchAsync('https://api.exemplo.com/x');
        return [r.status, r.success, r.getHeader('Content-Type'), (await r.jsonAsync()).id, r.headers['content-type']];
      }`),
      { fetch },
    );
    expect(r).toEqual([201, true, 'application/json', 9, 'application/json']);
  });
});

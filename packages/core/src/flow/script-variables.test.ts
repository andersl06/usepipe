/**
 * P9 — `ExecuteScriptV2` `context.getVariableAsync/setVariableAsync/deleteVariableAsync`: the engine
 * hands V2 scripts a bridge to the flow context. The sandbox is faked here (it lives in the API);
 * `apps/api/tests/script-v2-api.test.ts` runs the same bridge inside the real isolate.
 */
import { describe, expect, it } from 'vitest';
import { EXPIRATIONS_KEY, createInbound } from './context.js';
import type { Context, ScriptRequest, ScriptVariables } from './context.js';
import { processInbound } from './manager.js';
import type { Acao } from './modelos.js';
import { scriptVariables } from './script-variables.js';

function contextWith(actions: Acao[], script: (request: ScriptRequest) => Promise<unknown>) {
  const lookups: string[] = [];
  const context: Context = {
    user: 'user@domain',
    flow: { id: 'f1', states: [{ id: 'root', root: true, input: {}, outputActions: actions, outputs: [] }] },
    inbound: createInbound({ id: 'm1', tipo: 'text/plain', conteudo: 'oi' }),
    variables: {},
    inboundContext: new Map(),
    contact: { identity: 'user@domain', name: 'Ana Inventada' } as Context['contact'],
    services: {
      async send() {},
      async forwardForAttendance() {
        return { id: 'atd', status: 'Open' };
      },
      async registerEvent() {},
      async resolveSecret(name) {
        lookups.push(name);
        return 'tok-INVENTED-1234567890';
      },
      runScript: script,
    },
  };
  return { context, lookups };
}

const v2 = (source = 'async function run() {}'): Acao => ({
  type: 'ExecuteScriptV2',
  settings: { source, outputVariable: 'out', captureExceptions: true, exceptionVariable: 'err' },
});

describe('ExecuteScriptV2 context bridge', () => {
  it('only V2 scripts receive the context bridge', async () => {
    const seen: ScriptRequest[] = [];
    const { context } = contextWith(
      [v2(), { type: 'ExecuteScript', settings: { source: 'function run() {}', outputVariable: 'o1' } }],
      async (r) => {
        seen.push(r);
        return null;
      },
    );
    await processInbound(context);
    expect(seen.map((r) => [r.version, typeof r.variables])).toEqual([
      [2, 'object'],
      [1, 'undefined'],
    ]);
  });

  it('set, get and delete write the same flow context the other actions use', async () => {
    const { context } = contextWith([v2()], async ({ variables }) => {
      const v = variables!;
      v.set('pedido', '{"id":7,"itens":[1,2]}');
      v.set('temp', 'x');
      v.delete('temp');
      return [await v.get('pedido@id'), await v.get('contact.name'), await v.get('temp'), await v.get('nada')];
    });
    await processInbound(context);
    expect(context.variables['pedido']).toBe('{"id":7,"itens":[1,2]}');
    expect('temp' in context.variables).toBe(false);
    expect(JSON.parse(context.variables['out']!)).toEqual(['7', 'Ana Inventada', null, null]);
  });

  it('an expiration persists under the internal key, like SetVariable.expiration', async () => {
    const { context } = contextWith([v2()], async ({ variables }) => {
      variables!.set('codigo', '123', 60);
      variables!.set('semPrazo', 'y', 0);
      return null;
    });
    const before = Date.now();
    await processInbound(context);
    const deadlines = JSON.parse(context.variables[EXPIRATIONS_KEY]!) as Record<string, number>;
    expect(Object.keys(deadlines)).toEqual(['codigo']);
    expect(deadlines['codigo']).toBeGreaterThanOrEqual(before + 60_000);
  });

  it('never reveals secret.* and never asks the API for it (P11)', async () => {
    const { context, lookups } = contextWith([v2()], async ({ variables }) => [
      await variables!.get('secret.apiToken'),
      await variables!.get('secret.apiToken@clientSecret'),
    ]);
    await processInbound(context);
    expect(context.variables['out']).toBe('[null,null]');
    expect(lookups).toEqual([]);
    expect(JSON.stringify(context.variables)).not.toContain('INVENTED');
  });

  it('the internal #expirations key cannot be read, written or deleted', async () => {
    const { context } = contextWith([], async () => null);
    context.variables['keep'] = 'v';
    context.variables[EXPIRATIONS_KEY] = '{"keep":9999999999999}';
    const bridge: ScriptVariables = scriptVariables(context);
    await expect(bridge.get(EXPIRATIONS_KEY)).rejects.toThrow('Nome de variável inválido');
    expect(() => bridge.set(EXPIRATIONS_KEY, '{}')).toThrow('reservado');
    expect(() => bridge.delete(EXPIRATIONS_KEY)).toThrow('reservado');
    expect(() => bridge.set('__proto__', 'x')).toThrow('reservado');
    expect(() => bridge.set('  ', 'x')).toThrow('obrigatório');
    expect(() => bridge.set('a'.repeat(257), 'x')).toThrow('256');
    expect(context.variables[EXPIRATIONS_KEY]).toBe('{"keep":9999999999999}');
  });

  it('writes made before a captured exception stay, as in Blip', async () => {
    const { context } = contextWith([v2()], async ({ variables }) => {
      variables!.set('passo', '1');
      throw new Error('falhou depois');
    });
    await processInbound(context);
    expect(context.variables['passo']).toBe('1');
    expect(context.variables['err']).toBe('falhou depois');
  });
});

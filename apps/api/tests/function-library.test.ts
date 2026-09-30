import { describe, expect, it } from 'vitest';
import type { TransactionPipe } from '@pipe/db';
import { engineServices, type EngineEffects } from '../src/domain/engine-services.js';
import { callPattern, type LoadedFlowFunction } from '../src/domain/management/flow-functions.js';

/**
 * The tenant function library (P10, D-57) without a database: the engine finds a function by the
 * UUID a Blip export carries (any case) and reports a missing one against the account library;
 * `callPattern` is the name-call detector `functionUsage` hands to Postgres (`~`, ARE syntax that
 * JavaScript's RegExp reads the same way for this pattern).
 */

const tx = {} as TransactionPipe;
const effects = { send: async () => {}, registerEvent: async () => {} } as unknown as EngineEffects;
const ID = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

function services(library: LoadedFlowFunction[]) {
  return engineServices({
    tenantId: 't1',
    flowFunctions: new Map(library.map((fn) => [fn.id, fn])),
    isolate: (fn) => fn(tx),
    effects,
  });
}

describe('tenant function library in the engine', () => {
  it('runs a function referenced by an upper-case UUID', async () => {
    const s = services([{ id: ID, name: 'saudar', parameters: ['nome'], code: 'function saudar(nome) { return "Olá " + nome; }' }]);
    await expect(s.runFlowFunction!({ functionId: ID.toUpperCase(), args: ['Bia'] })).resolves.toBe('Olá Bia');
  });

  it('names the account library when the function is missing', async () => {
    await expect(services([]).runFlowFunction!({ functionId: ID, args: [] })).rejects.toThrow('biblioteca da conta');
  });
});

describe('callPattern', () => {
  const matches = (name: string, text: string): boolean => new RegExp(callPattern(name)).test(text);

  it('finds a call by name', () => {
    expect(matches('formatarCpf', '"source":"function run(c) {\\n  return formatarCpf(c);\\n}"')).toBe(true);
    expect(matches('formatarCpf', 'formatarCpf (c)')).toBe(true);
    expect(matches('$util', 'x = $util(1)')).toBe(true);
  });

  it('ignores property calls and longer identifiers', () => {
    expect(matches('format', 'moment().format("L")')).toBe(false);
    expect(matches('format', 'reformat(x)')).toBe(false);
    expect(matches('format', 'format_2(x)')).toBe(false);
    expect(matches('$util', 'a$util(1)')).toBe(false);
  });
});

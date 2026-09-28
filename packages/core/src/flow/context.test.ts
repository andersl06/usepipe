import { describe, expect, it } from 'vitest';
import { createInbound, getVariable, replaceVariables, type Context } from './context.js';

function context(overrides: Partial<Context> = {}): Context {
  return {
    user: 'contato-1',
    flow: { id: 'fluxo-1', states: [{ id: 'raiz', root: true, input: {}, outputActions: [], outputs: [] }] },
    inbound: createInbound({ id: 'entrada-1', tipo: 'text/plain', conteudo: 'oi' }),
    variables: {},
    inboundContext: new Map(),
    services: {
      send: async () => {},
      forwardForAttendance: async () => ({ id: 'ticket-1' }),
      registerEvent: async () => {},
    },
    ...overrides,
  };
}

describe('resource variable source', () => {
  it('resolves a text/plain resource loaded by the api, instead of throwing "Não há provedor"', async () => {
    const c = context({ resources: { TimeZoneAttendance: 'America/Sao_Paulo' } });
    await expect(getVariable(c, 'resource.TimeZoneAttendance')).resolves.toBe('America/Sao_Paulo');
  });

  it('resolves @property access into a JSON resource, like an imported flow reading objectResources@foo', async () => {
    const c = context({ resources: { objectResources: '{"foo":"bar","n":2}' } });
    await expect(getVariable(c, 'resource.objectResources@foo')).resolves.toBe('bar');
    await expect(getVariable(c, 'resource.objectResources@n')).resolves.toBe('2');
  });

  it('returns null for a resource this flow does not have, without throwing', async () => {
    const c = context({ resources: {} });
    await expect(getVariable(c, 'resource.missing')).resolves.toBeNull();
  });

  it('still throws for a source with no provider at all (e.g. secret), unlike resource', async () => {
    const c = context();
    await expect(getVariable(c, 'secret.token')).rejects.toThrow(
      "Não há provedor para a fonte de variável 'secret'.",
    );
  });

  it('interpolates {{resource.x}} in message text, including a JS source resource (D-55 createMenuFunction)', async () => {
    const c = context({ resources: { createMenuFunction: 'function run(){return 1;}' } });
    const saida = await replaceVariables('{{resource.createMenuFunction}}', c);
    expect(saida).toBe('function run(){return 1;}');
  });
});

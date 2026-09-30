import { describe, expect, it, vi } from 'vitest';
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

  it('still throws for a source with no provider at all (e.g. blipfunction), unlike resource', async () => {
    const c = context();
    await expect(getVariable(c, 'blipfunction.name')).rejects.toThrow(
      "Não há provedor para a fonte de variável 'blipfunction'.",
    );
  });

  it('secret reads empty outside an HTTP action instead of throwing (P11)', async () => {
    const c = context();
    await expect(getVariable(c, 'secret.token')).resolves.toBeNull();
  });

  it('interpolates {{resource.x}} in message text, including a JS source resource (D-55 createMenuFunction)', async () => {
    const c = context({ resources: { createMenuFunction: 'function run(){return 1;}' } });
    const saida = await replaceVariables('{{resource.createMenuFunction}}', c);
    expect(saida).toBe('function run(){return 1;}');
  });
});

describe('calendar variable source (GMT-0)', () => {
  it('formats today, tomorrow and yesterday like the Blip catalog', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T03:04:05.678Z'));
    try {
      const c = context();
      await expect(getVariable(c, 'calendar.date')).resolves.toBe('2026-03-01');
      await expect(getVariable(c, 'calendar.datetime')).resolves.toBe('2026-03-01T03:04:05Z');
      await expect(getVariable(c, 'calendar.time')).resolves.toBe('03:04');
      await expect(getVariable(c, 'calendar.day')).resolves.toBe('1');
      await expect(getVariable(c, 'calendar.dayOfWeek')).resolves.toBe('Sunday');
      await expect(getVariable(c, 'calendar.month')).resolves.toBe('3');
      await expect(getVariable(c, 'calendar.year')).resolves.toBe('2026');
      await expect(getVariable(c, 'calendar.hour')).resolves.toBe('3');
      await expect(getVariable(c, 'calendar.minute')).resolves.toBe('4');
      await expect(getVariable(c, 'calendar.second')).resolves.toBe('5');
      await expect(getVariable(c, 'calendar.unixTime')).resolves.toBe('1772334245');
      await expect(getVariable(c, 'calendar.unixTimeMilliseconds')).resolves.toBe('1772334245678');
      await expect(getVariable(c, 'calendar.tomorrow.date')).resolves.toBe('2026-03-02');
      await expect(getVariable(c, 'calendar.tomorrow.dayOfWeek')).resolves.toBe('Monday');
      await expect(getVariable(c, 'calendar.yesterday.date')).resolves.toBe('2026-02-28');
      await expect(getVariable(c, 'calendar.yesterday.unixTime')).resolves.toBe('1772247845');
      await expect(getVariable(c, 'calendar.unknown')).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves every calendar name the Builder catalog lists (36)', async () => {
    const nomes = ['date', 'datetime', 'day', 'dayOfWeek', 'hour', 'minute', 'month', 'second', 'time', 'unixTime', 'unixTimeMilliseconds', 'year'];
    const c = context();
    for (const prefixo of ['', 'tomorrow.', 'yesterday.']) {
      for (const nome of nomes) {
        expect(await getVariable(c, `calendar.${prefixo}${nome}`), `${prefixo}${nome}`).toMatch(/\S/);
      }
    }
  });
});

describe('random variable source', () => {
  it('returns a fresh guid, a non-negative integer and an alphanumeric string', async () => {
    const c = context();
    const guid = await getVariable(c, 'random.guid');
    expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await getVariable(c, 'random.guid')).not.toBe(guid);
    expect(Number(await getVariable(c, 'random.integer'))).toBeGreaterThanOrEqual(0);
    expect(await getVariable(c, 'random.string')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('application and tunnel variable sources', () => {
  const service = { identifier: 'desk180326', routerIdentifier: 'roteador1' };

  it('describes the bot by its short name', async () => {
    const c = context({ application: service });
    await expect(getVariable(c, 'application.identifier')).resolves.toBe('desk180326');
    await expect(getVariable(c, 'application.domain')).resolves.toBe('msging.net');
    await expect(getVariable(c, 'application.identity')).resolves.toBe('desk180326@msging.net');
    await expect(getVariable(c, 'application.instance')).resolves.toBe('pipe');
    await expect(getVariable(c, 'application.node')).resolves.toBe('desk180326@msging.net/pipe');
  });

  it('fills tunnel.* only behind a router, with the contact as the tunnel identity', async () => {
    const c = context({ application: service });
    await expect(getVariable(c, 'tunnel.identity')).resolves.toBe('contato-1');
    await expect(getVariable(c, 'tunnel.originator')).resolves.toBe('contato-1');
    await expect(getVariable(c, 'tunnel.owner')).resolves.toBe('roteador1@msging.net');
    await expect(getVariable(c, 'tunnel.destination')).resolves.toBe('desk180326@msging.net');
    const direto = context({ application: { identifier: 'desk180326' } });
    await expect(getVariable(direto, 'tunnel.identity')).resolves.toBeNull();
  });

  it('resolves the export excerpt that uses tunnel, application and random', async () => {
    // Settings copied from ProcessCommand/SetVariable actions of the production export (desk180326…json).
    const trecho = JSON.stringify([
      { to: 'postmaster@desk.msging.net', method: 'get', uri: "/tickets?$filter=customerIdentity%20eq%20'{{tunnel.identity}}'", from: '{{application.identity}}' },
      { to: 'postmaster@desk.msging.net', method: 'set', uri: '/tickets/{{ticketId}}/close', from: '{{application.identity}}', resource: { id: '{{random.guid}}', customerIdentity: '{{tunnel.identity}}', ownerIdentity: '{{application.identifier}}@msging.net', status: 'ClosedClient' } },
      { value: '{{application.identifier}}', variable: 'identifierTest' },
    ]);
    const c = context({ application: service, variables: { ticketId: 't-9' } });
    type Settings = { uri?: string; from?: string; value?: string; resource?: Record<string, string> };
    const [lista, fechar, definir] = JSON.parse(await replaceVariables(trecho, c)) as Settings[];
    expect(lista?.uri).toBe("/tickets?$filter=customerIdentity%20eq%20'contato-1'");
    expect(lista?.from).toBe('desk180326@msging.net');
    expect(fechar?.uri).toBe('/tickets/t-9/close');
    expect(fechar?.resource?.['id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(fechar?.resource?.['customerIdentity']).toBe('contato-1');
    expect(fechar?.resource?.['ownerIdentity']).toBe(fechar?.from);
    expect(definir?.value).toBe('desk180326');
  });
});

describe('bucket variable source', () => {
  it('reads the contact document first, then the global one, JSON for non-text', async () => {
    const pedidos: string[] = [];
    const store: Record<string, unknown> = { 'contact:a': 'texto', 'global:b': { x: 1 } };
    const c = context();
    c.services.bucketGet = async ({ key, scope }) => {
      pedidos.push(`${scope}:${key}`);
      return store[`${scope}:${key}`] ?? null;
    };
    await expect(getVariable(c, 'bucket.a')).resolves.toBe('texto');
    await expect(getVariable(c, 'bucket.b')).resolves.toBe('{"x":1}');
    await expect(getVariable(c, 'bucket.b@x')).resolves.toBe('1');
    await expect(getVariable(c, 'bucket.c')).resolves.toBeNull();
    expect(pedidos).toEqual(['contact:a', 'contact:b', 'global:b', 'contact:b', 'global:b', 'contact:c', 'global:c']);
  });

  it('is null when the host has no bucket store', async () => {
    await expect(getVariable(context(), 'bucket.a')).resolves.toBeNull();
  });
});

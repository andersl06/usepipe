import { describe, expect, it } from 'vitest';
import { createInbound, type Context } from './context.js';
import { processInbound } from './manager.js';

function context(): Context {
  const chamada: Context['services']['callHttp'] = async (pedido) => {
    expect(pedido).toEqual({
      metodo: 'POST',
      url: 'https://api.exemplo.test/clientes/42',
      cabecalhos: { authorization: 'Bearer abc' },
      corpo: '{"nome":"Ana"}',
      timeoutMs: 60000,
    });
    return { status: 201, corpo: '{"id":"c-1"}' };
  };
  return {
    user: 'contato-1',
    flow: { id: 'fluxo-1', states: [{ id: 'raiz', root: true, input: {}, outputActions: [], outputs: [] }] },
    inbound: createInbound({ id: 'entrada-1', tipo: 'text/plain', conteudo: 'oi' }),
    variables: { id: '42', token: 'abc' },
    inboundContext: new Map(),
    services: {
      send: async () => {},
      forwardForAttendance: async () => ({ id: 'ticket-1' }),
      registerEvent: async () => {},
      callHttp: chamada,
    },
  };
}

describe('ProcessHttp', () => {
  it('interpolates the request and stores status and body in the configured variables', async () => {
    const c = context();
    c.flow.states[0]!.outputActions = [{
      type: 'ProcessHttp',
      settings: {
        method: 'POST',
        uri: 'https://api.exemplo.test/clientes/{{id}}',
        headers: { authorization: 'Bearer {{token}}' },
        body: '{"nome":"Ana"}',
        responseStatusVariable: 'http.status',
        responseBodyVariable: 'http.body',
      },
    }];
    await processInbound(c);

    expect(c.variables).toMatchObject({ 'http.status': '201', 'http.body': '{"id":"c-1"}' });
  });
});

describe('context actions', () => {
  it('sends the GET response from SendMessageFromHttp', async () => {
    const c = context();
    const sent: unknown[] = [];
    c.services.callHttp = async (pedido) => {
      expect(pedido).toEqual({
        metodo: 'GET',
        url: 'https://api.exemplo.test/message',
        cabecalhos: { authorization: 'Bearer abc' },
        timeoutMs: 60000,
      });
      return { status: 200, corpo: '{"text":"oi"}' };
    };
    c.services.send = async (message) => { sent.push(message); };
    c.flow.states[0]!.outputActions = [{
      type: 'SendMessageFromHttp',
      settings: {
        uri: 'https://api.exemplo.test/message',
        type: 'application/json',
        headers: { authorization: 'Bearer {{token}}' },
      },
    }];

    await processInbound(c);

    expect(sent).toEqual([{
      tipo: 'application/json',
      conteudo: '{"text":"oi"}',
    }]);
  });

  it('rejects missing required context action fields', async () => {
    const c = context();
    c.flow.states[0]!.outputActions = [
      { type: 'SendMessageFromHttp', settings: { uri: 'https://example.test' } },
    ];

    await expect(processInbound(c)).rejects.toThrow("'type' é obrigatório");
  });

  it('merges contact fields through the current execution contact', async () => {
    const c = context();
    const merged: unknown[] = [];
    c.services.mergeContact = async (fields) => { merged.push(fields); };
    c.flow.states[0]!.outputActions = [{
      type: 'MergeContact',
      settings: { name: 'Ana', extras: { segment: 'b2b' }, contact_id: 'other-tenant-contact' },
    }];

    await processInbound(c);

    expect(merged).toEqual([{
      name: 'Ana',
      extras: { segment: 'b2b' },
      contact_id: 'other-tenant-contact',
    }]);
  });

  it('stores variable expiration and uses TrackEvent defaults', async () => {
    const c = context();
    const events: Record<string, unknown>[] = [];
    c.services.registerEvent = async (event) => { events.push(event); };
    c.flow.states[0]!.outputActions = [
      { type: 'SetVariable', settings: { variable: 'temporary', value: 'yes', expiration: 60 } },
      { type: 'TrackEvent', settings: { category: 'sales', action: 'qualified', value: '1.5' } },
    ];

    await processInbound(c);

    expect(c.variables.temporary).toBe('yes');
    expect(c.variableExpirations?.temporary).toBeGreaterThan(Date.now());
    expect(events[0]).toMatchObject({ category: 'sales', action: 'qualified', value: 1.5, fireAndForget: true });
  });

  it('interpolation is text-only', async () => {
    const c = context();
    c.flow.states[0]!.outputActions = [{
      type: 'SetVariable',
      settings: { variable: 'result', value: '{{constructor}} {{1+1}}' },
    }];

    await processInbound(c);

    expect(c.variables.result).toBe(' {{1+1}}');
  });
});

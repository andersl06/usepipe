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

describe('flow function actions', () => {
  it('executes a selected library function and stores its return value', async () => {
    const c = context();
    const services = c.services as typeof c.services & {
      runFlowFunction: (request: { functionId: string; args: (string | null)[] }) => Promise<unknown>;
    };
    services.runFlowFunction = async (request) => {
      expect(request).toEqual({ functionId: 'func-1', args: ['Ana'] });
      return { greeting: 'Olá Ana' };
    };
    c.flow.states[0]!.outputActions = [{
      type: 'ExecuteBlipFunction',
      settings: { functionId: 'func-1', inputVariables: ['nome'], outputVariable: 'resultado' },
    }];
    c.variables['nome'] = 'Ana';

    await processInbound(c);

    expect(c.variables['resultado']).toBe('{"greeting":"Olá Ana"}');
  });
});

describe('script actions', () => {
  it('passes input variables to run and stores the result', async () => {
    const c = context();
    const requests: unknown[] = [];
    c.services.runScript = async (request) => { requests.push(request); return 3; };
    c.variables.x = '1';
    c.flow.states[0]!.outputActions = [{
      type: 'ExecuteScript',
      settings: { source: 'function run(a, b) { return +a + +b; }', inputVariables: ['x', 'missing'], outputVariable: 'sum' },
    }];

    await processInbound(c);

    expect(requests).toEqual([{
      version: 1,
      source: 'function run(a, b) { return +a + +b; }',
      functionName: 'run',
      args: ['1', null],
      timeoutMs: 5000,
      localTimeZone: false,
    }]);
    expect(c.variables.sum).toBe('3');
  });

  it('stores objects as JSON and uses the V2 time limit', async () => {
    const c = context();
    let timeoutMs = 0;
    c.services.runScript = async (request) => { timeoutMs = request.timeoutMs; return { ok: true }; };
    c.flow.states[0]!.outputActions = [{
      type: 'ExecuteScriptV2',
      settings: { source: 'async function run() { return { ok: true }; }', outputVariable: 'out' },
    }];

    await processInbound(c);

    expect(timeoutMs).toBe(10000);
    expect(c.variables.out).toBe('{"ok":true}');
  });

  it('V2 captureExceptions stores the error instead of failing', async () => {
    const c = context();
    c.services.runScript = async () => { throw new Error('boom'); };
    c.flow.states[0]!.outputActions = [{
      type: 'ExecuteScriptV2',
      settings: { source: 'function run() { throw new Error("boom"); }', outputVariable: 'out', captureExceptions: true, exceptionVariable: 'err' },
    }];

    await processInbound(c);

    expect(c.variables.err).toBe('boom');
    expect(c.variables.out).toBeUndefined();
  });

  it('a V1 script error fails the action even with captureExceptions', async () => {
    const c = context();
    c.services.runScript = async () => { throw new Error('boom'); };
    c.flow.states[0]!.outputActions = [{
      type: 'ExecuteScript',
      settings: { source: 'function run() {}', outputVariable: 'out', captureExceptions: true, exceptionVariable: 'err' },
    }];

    await expect(processInbound(c)).rejects.toThrow('boom');
  });

  it('requires source and outputVariable', async () => {
    const c = context();
    c.services.runScript = async () => null;
    c.flow.states[0]!.outputActions = [{ type: 'ExecuteScript', settings: { outputVariable: 'out' } }];
    await expect(processInbound(c)).rejects.toThrow("'source' é obrigatório");

    c.flow.states[0]!.outputActions = [{ type: 'ExecuteScriptV2', settings: { source: 'function run() {}' } }];
    await expect(processInbound(c)).rejects.toThrow("'outputVariable' é obrigatório");
  });
});

describe('platform actions', () => {
  it('maps known commands and rejects an arbitrary LIME URI', async () => {
    const c = context();
    const commands: unknown[] = [];
    c.services.sendCommand = async (request) => { commands.push(request); };
    c.flow.states[0]!.outputActions = [{ type: 'SendCommand', settings: {
      uri: '/tickets/123/change-tags', method: 'set', resource: { tags: ['vip'] },
    } }];
    await processInbound(c);
    expect(commands).toHaveLength(1);
    c.flow.states[0]!.outputActions = [{ type: 'SendCommand', settings: { uri: 'https://router.example/anything' } }];
    await expect(processInbound(c)).rejects.toThrow('não é executada no Pipe');
  });

  it('keeps bucket and list operations scoped through their services', async () => {
    const c = context();
    const calls: unknown[] = [];
    c.services.bucketSet = async (request) => { calls.push(['bucket', request]); };
    c.services.listManage = async (request) => { calls.push(['list', request]); };
    c.flow.states[0]!.outputActions = [
      { type: 'SetBucket', settings: { id: 'preferences', type: 'application/json', document: { dark: true } } },
      { type: 'ManageList', settings: { listName: 'vip', action: 'Add' } },
    ];
    await processInbound(c);
    expect(calls).toEqual([
      ['bucket', expect.objectContaining({ key: 'preferences', scope: 'contact' })],
      ['list', { name: 'vip', operation: 'Add' }],
    ]);
  });

  it('writes the RAG answer only when the confidence contract is 0..1', async () => {
    const c = context();
    c.services.respondWithKnowledge = async (request) => {
      expect(request.minimumConfidence).toBe(0.7);
      return { answer: 'Resposta da base', confidence: 0.9 };
    };
    c.flow.states[0]!.outputActions = [{ type: 'ProcessContentAssistant', settings: {
      text: 'Como funciona?', score: 0.7, outputVariable: 'resposta',
    } }];
    await processInbound(c);
    expect(c.variables.resposta).toBe('Resposta da base');
  });
});

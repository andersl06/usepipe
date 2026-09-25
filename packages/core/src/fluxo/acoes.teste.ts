import { describe, expect, it } from 'vitest';
import { createInbound, type Context } from './contexto.js';
import { processarInbound } from './gerenciador.js';

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
      encaminharForAttendance: async () => ({ id: 'ticket-1' }),
      registerEvent: async () => {},
      callHttp: chamada,
    },
  };
}

describe('ProcessHttp', () => {
  it('interpola a requisição e grava status e corpo nas variáveis configuradas', async () => {
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
    await processarInbound(c);

    expect(c.variables).toMatchObject({ 'http.status': '201', 'http.body': '{"id":"c-1"}' });
  });
});

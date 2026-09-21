import { describe, expect, it } from 'vitest';
import { criarEntrada, type Contexto } from './contexto.js';
import { processarEntrada } from './gerenciador.js';

function contexto(): Contexto {
  const chamada: Contexto['servicos']['chamarHttp'] = async (pedido) => {
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
    usuario: 'contato-1',
    fluxo: { id: 'fluxo-1', states: [{ id: 'raiz', root: true, input: {}, outputActions: [], outputs: [] }] },
    entrada: criarEntrada({ id: 'entrada-1', tipo: 'text/plain', conteudo: 'oi' }),
    variaveis: { id: '42', token: 'abc' },
    entradaContexto: new Map(),
    servicos: {
      enviar: async () => {},
      encaminharParaAtendimento: async () => ({ id: 'ticket-1' }),
      registrarEvento: async () => {},
      chamarHttp: chamada,
    },
  };
}

describe('ProcessHttp', () => {
  it('interpola a requisição e grava status e corpo nas variáveis configuradas', async () => {
    const c = contexto();
    c.fluxo.states[0]!.outputActions = [{
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
    await processarEntrada(c);

    expect(c.variaveis).toMatchObject({ 'http.status': '201', 'http.body': '{"id":"c-1"}' });
  });
});

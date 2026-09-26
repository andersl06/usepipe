import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  serviceFieldsVisible,
  searchChatbots,
  pedidoDoFormulario,
} from '../src/pages/flow/services/regras';

describe('service form', () => {
  it('hides the redirect when the service is the main one', () => {
    assert.deepEqual(serviceFieldsVisible(true, false), {
      mostrarPersistente: false,
      mostrarExpiracao: false,
    });
  });

  it('hides only the expiration when the redirect is persistent', () => {
    assert.deepEqual(serviceFieldsVisible(false, true), {
      mostrarPersistente: true,
      mostrarExpiracao: false,
    });
  });

  it('o campo escondido não vai no pedido', () => {
    const base = { nome: ' Suporte ', chatbotId: 'c1', expiration: '30' };
    assert.deepEqual(pedidoDoFormulario({ ...base, principal: true, persistente: true }), {
      nome: 'Suporte',
      chatbotId: 'c1',
      principal: true,
      persistente: false,
      expiracaoMin: null,
    });
    assert.equal(
      pedidoDoFormulario({ ...base, principal: false, persistente: true }).expiracaoMin,
      null,
    );
    assert.equal(
      pedidoDoFormulario({ ...base, principal: false, persistente: false }).expiracaoMin,
      30,
    );
  });

  it('search filters by name and excludes what is already a service', () => {
    const bot = (id: string, nome: string) => ({
      id,
      nome,
      estado: 'publicado',
      tipo: 'fluxo',
      shortName: null,
    });
    const search = [bot('1', 'Suporte'), bot('2', 'Vendas'), bot('3', 'Suporte VIP')];
    assert.deepEqual(
      searchChatbots(search, 'sup', new Set(['1'])).map((b) => b.id),
      ['3'],
    );
    assert.deepEqual(searchChatbots(search, 'nada', new Set()), []);
  });
});

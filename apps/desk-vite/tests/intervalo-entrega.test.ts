import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ItemOfConversation } from '@pipe/contracts';
import { deliveryInterval } from '../src/lib/intervalo-entrega';

function message(stateDelivery: string | null): ItemOfConversation {
  return {
    genero: 'mensagem',
    id: 'm1',
    criadaEm: '2026-09-21T21:51:03.716Z',
    direction: 'saida',
    tipo: 'texto',
    conteudo: 'Teste',
    stateDelivery,
    errorCode: null,
    errorText: null,
    lidaEm: null,
    entregueEm: null,
    deRespostaPronta: false,
    deTemplate: false,
  };
}

test('polls the conversation quickly while a message is in transit', () => {
  assert.equal(deliveryInterval([message('pendente')]), 1_000);
  assert.equal(deliveryInterval([message('enviando')]), 1_000);
  assert.equal(deliveryInterval([message('enviada')]), 15_000);
  assert.equal(deliveryInterval([message('falhou')]), 15_000);
});

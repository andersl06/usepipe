import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ItemOfConversation } from '@pipe/contracts';
import { agrupar, deliverySignal, type Message } from '../src/lib/groups';

function msg(
  id: string,
  direction: 'entrada' | 'saida',
  stateDelivery: string | null = 'entregue',
): Message {
  return {
    genero: 'mensagem',
    id,
    criadaEm: '2026-09-17T10:00:00Z',
    direction,
    tipo: 'texto',
    conteudo: id,
    stateDelivery,
    errorCode: null,
    errorText: null,
    lidaEm: null,
    entregueEm: null,
    deRespostaPronta: false,
    deTemplate: false,
  };
}

test('consecutive messages from the same side form a group; a note breaks it', () => {
  const nota: ItemOfConversation = {
    genero: 'nota',
    id: 'n',
    criadaEm: '2026-09-17T10:00:00Z',
    corpo: 'x',
    autor: null,
  };
  const groups = agrupar([
    msg('1', 'entrada'),
    msg('2', 'entrada'),
    msg('3', 'saida'),
    nota,
    msg('4', 'saida'),
  ]);
  assert.deepEqual(
    groups.map((g) => (g.genero === 'nota' ? 'nota' : `${g.direction}:${g.messages.length}`)),
    ['entrada:2', 'saida:1', 'nota', 'saida:1'],
  );
});

test('the delivery indicator is the one from the last bubble', () => {
  assert.equal(deliverySignal([msg('1', 'saida', 'lida'), msg('2', 'saida', 'enviada')]), 'check');
  assert.equal(deliverySignal([msg('1', 'saida', 'lida')]), 'lida');
  assert.equal(deliverySignal([msg('1', 'saida', 'pendente')]), 'relogio');
  assert.equal(deliverySignal([msg('1', 'saida', 'falhou')]), 'erro');
  assert.equal(deliverySignal([]), null);
});

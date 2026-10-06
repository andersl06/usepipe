import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOnline } from '../src/lib/flow-status.ts';

test('a published flow is on the air', () => {
  assert.equal(isOnline({ estado: 'publicado', tipo: 'fluxo' }), true);
});

test('a draft flow is not on the air, even with a channel', () => {
  assert.equal(isOnline({ estado: 'rascunho', tipo: 'fluxo', canalAtivo: true }), false);
});

test('a draft router is on the air only with an active channel', () => {
  assert.equal(isOnline({ estado: 'rascunho', tipo: 'roteador', canalAtivo: false }), false);
  assert.equal(isOnline({ estado: 'rascunho', tipo: 'roteador' }), false);
  assert.equal(isOnline({ estado: 'rascunho', tipo: 'roteador', canalAtivo: true }), true);
});

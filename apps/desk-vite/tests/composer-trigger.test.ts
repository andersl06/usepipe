import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinaComTermo, responsesTrigger } from '../src/lib/composer-trigger';

test('# sozinho abre com termo vazio', () => {
  assert.deepEqual(responsesTrigger('#'), { aberto: true, termo: '' });
});
test('# com texto filtra', () => {
  assert.deepEqual(responsesTrigger('#bol'), { aberto: true, termo: 'bol' });
});
test('sem gatilho fica fechado', () => {
  assert.deepEqual(responsesTrigger(''), { aberto: false, termo: '' });
  assert.deepEqual(responsesTrigger('olá'), { aberto: false, termo: '' });
});
test('# após palavra não abre', () => {
  assert.equal(responsesTrigger('olá #bo').aberto, false);
});
test('/ não é gatilho', () => {
  assert.equal(responsesTrigger('/bo').aberto, false);
});
test('apagar o gatilho fecha', () => {
  assert.equal(responsesTrigger('#a').aberto, true);
  assert.equal(responsesTrigger('a').aberto, false);
});
test('filtro: prefixo do nome ou de qualquer palavra, sem caixa', () => {
  assert.equal(combinaComTermo('Boas Vindas', 'BOA'), true);
  assert.equal(combinaComTermo('Boas Vindas', 'vin'), true);
  assert.equal(combinaComTermo('Boas Vindas', 'inda'), false);
});

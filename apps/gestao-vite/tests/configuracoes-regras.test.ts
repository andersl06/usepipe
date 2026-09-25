import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITE_DE_CHAVES,
  errorToCreate,
  marcarPadrao,
  noLimite,
  podeExcluir,
} from '../src/paginas/fluxo/configuracoes/regras.ts';

test('the new-key form opens up to the limit of 3; at the limit it becomes a warning banner', () => {
  assert.equal(LIMITE_DE_CHAVES, 3);
  assert.equal(noLimite(0), false);
  assert.equal(noLimite(2), false);
  assert.equal(noLimite(3), true);
});

test('create requires a name and respects the limit, in that order', () => {
  assert.equal(errorToCreate('', 0), 'nome');
  assert.equal(errorToCreate('   ', 0), 'nome');
  assert.equal(errorToCreate('Integração CRM', 0), null);
  assert.equal(errorToCreate('Integração CRM', 3), 'limite');
  assert.equal(errorToCreate('', 3), 'limite');
});

test('the first key is the default, and the default cannot be deleted', () => {
  const [first, segunda] = marcarPadrao([{ id: 'a' }, { id: 'b' }]);
  const chaves = [first!, segunda!];
  assert.deepEqual(
    chaves.map((c) => c.padrao),
    [true, false],
  );
  assert.equal(podeExcluir(first!), false);
  assert.equal(podeExcluir(segunda!), true);
});

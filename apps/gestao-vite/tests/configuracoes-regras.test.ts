import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITE_DE_CHAVES,
  errorToCreate,
  marcarPadrao,
  noLimite,
  podeExcluir,
} from '../src/paginas/fluxo/configuracoes/regras.ts';

test('o formulário de nova chave abre até o limite de 3; no limite vira a faixa de aviso', () => {
  assert.equal(LIMITE_DE_CHAVES, 3);
  assert.equal(noLimite(0), false);
  assert.equal(noLimite(2), false);
  assert.equal(noLimite(3), true);
});

test('criar exige nome e respeita o limite, nessa ordem', () => {
  assert.equal(errorToCreate('', 0), 'nome');
  assert.equal(errorToCreate('   ', 0), 'nome');
  assert.equal(errorToCreate('Integração CRM', 0), null);
  assert.equal(errorToCreate('Integração CRM', 3), 'limite');
  assert.equal(errorToCreate('', 3), 'limite');
});

test('a primeira chave é a padrão e a padrão não pode ser excluída', () => {
  const [first, segunda] = marcarPadrao([{ id: 'a' }, { id: 'b' }]);
  const chaves = [first!, segunda!];
  assert.deepEqual(
    chaves.map((c) => c.padrao),
    [true, false],
  );
  assert.equal(podeExcluir(first!), false);
  assert.equal(podeExcluir(segunda!), true);
});

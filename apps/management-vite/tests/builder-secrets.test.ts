import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SECRET_VALUE_MASK,
  secretDraftError,
  secretUsage,
} from '../src/pages/builder/secret-variables.ts';

test('secretDraftError accepts a valid new secret and rejects names the engine cannot parse', () => {
  assert.equal(secretDraftError({ name: 'apiToken', value: 'invented' }, null), null);
  assert.equal(secretDraftError({ name: 'a.b_1', value: 'invented' }, null), null);
  for (const name of ['my-token', 'my token', 'chave🙂']) {
    assert.match(secretDraftError({ name, value: 'x' }, null) ?? '', /apenas letras/);
  }
  assert.equal(secretDraftError({ name: '  ', value: 'x' }, null), 'Informe o nome da variável.');
});

test('secretDraftError always requires the value, and explains it on a rename (Blip: reinsira o valor)', () => {
  assert.equal(secretDraftError({ name: 'token', value: '' }, null), 'Informe o valor da variável.');
  assert.equal(secretDraftError({ name: 'token', value: ' ' }, 'token'), 'Informe o valor da variável.');
  assert.equal(
    secretDraftError({ name: 'tokenNovo', value: '' }, 'token'),
    'Para alterar o nome, insira o valor novamente.',
  );
  assert.equal(secretDraftError({ name: 'tokenNovo', value: 'novo' }, 'token'), null);
});

test('a saved row shows a mask, and the usage hint is {{secret.name}}', () => {
  assert.ok(SECRET_VALUE_MASK.length > 0);
  assert.ok(!/[a-z0-9]/i.test(SECRET_VALUE_MASK));
  assert.equal(secretUsage(' apiToken '), '{{secret.apiToken}}');
});

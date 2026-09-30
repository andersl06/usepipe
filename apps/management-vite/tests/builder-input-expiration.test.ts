import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  inactivityEnabled,
  inactivityMinutes,
  withInactivity,
  withInactivityMinutes,
} from '../src/pages/builder/conteudo.ts';
import { inputExpirationHint } from '../src/pages/builder/test-panel-logic.ts';

// P8 (plan 02-49): the block's "Tempo de inatividade" (Blip `input.expiration`, `h:m` text).

test('inactivity switch: on starts empty, off removes the key', () => {
  const base = { bypass: false, variable: 'x' };
  assert.equal(inactivityEnabled(base), false);
  const on = withInactivity(base, true);
  assert.deepEqual(on, { bypass: false, variable: 'x', expiration: '' });
  assert.equal(inactivityEnabled(on), true);
  const off = withInactivity({ ...on, expiration: '0:5' }, false);
  assert.deepEqual(off, { bypass: false, variable: 'x' });
  assert.equal('expiration' in off, false);
  // Turning it on again keeps a stored value.
  assert.equal(withInactivity({ expiration: '1:0' }, true).expiration, '1:0');
});

test('inactivity minutes: stored as h:m within 1..1380, invalid stores empty text', () => {
  assert.deepEqual(withInactivityMinutes({}, '1'), { inbound: { expiration: '0:1' }, valid: true });
  assert.deepEqual(withInactivityMinutes({}, '90'), { inbound: { expiration: '1:30' }, valid: true });
  assert.deepEqual(withInactivityMinutes({}, '1380'), { inbound: { expiration: '23:0' }, valid: true });
  for (const invalid of ['', '0', '1381', '1.5', 'abc', '-3']) {
    assert.deepEqual(withInactivityMinutes({ expiration: '0:1' }, invalid), { inbound: { expiration: '' }, valid: false }, invalid);
  }
});

test('inactivity minutes shown for imported Blip values', () => {
  assert.equal(inactivityMinutes({ expiration: '8:0' }), '480');
  assert.equal(inactivityMinutes({ expiration: '0:01' }), '1');
  assert.equal(inactivityMinutes({ expiration: '' }), '');
  assert.equal(inactivityMinutes({}), '');
});

test('test panel: expiration hint in minutes and hours', () => {
  assert.equal(inputExpirationHint(60), 'O bloco expira após 1 min sem resposta.');
  assert.equal(inputExpirationHint(3600), 'O bloco expira após 1 h sem resposta.');
  assert.equal(inputExpirationHint(5400), 'O bloco expira após 1 h 30 min sem resposta.');
});

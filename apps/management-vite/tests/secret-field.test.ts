import assert from 'node:assert/strict';
import { test } from 'node:test';
import { secretFieldVisualState } from '../src/lib/secret-field.ts';

test('secret field switches icon and accessible action with visibility', () => {
  assert.deepEqual(secretFieldVisualState(false), {
    type: 'password',
    icon: 'eye',
    action: 'Mostrar',
  });
  assert.deepEqual(secretFieldVisualState(true), {
    type: 'text',
    icon: 'eye-off',
    action: 'Ocultar',
  });
});

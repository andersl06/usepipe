import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caminhoInterno } from '@pipe/ui/api';

test('caminhoInterno only lets same-app paths through (no open redirect)', () => {
  assert.equal(caminhoInterno('/chat/1', '/'), '/chat/1');
  assert.equal(caminhoInterno('//evil.test', '/'), '/');
  assert.equal(caminhoInterno('/\\evil.test', '/'), '/');
  assert.equal(caminhoInterno('https://evil.test', '/'), '/');
  assert.equal(caminhoInterno(null, '/'), '/');
});

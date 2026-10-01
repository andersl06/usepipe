import assert from 'node:assert/strict';
import { test } from 'node:test';
import { duracaoDaPausa } from '../src/lib/pausas.ts';

test('duração da pausa: de 1 a 999 minutos inteiros', () => {
  assert.equal(duracaoDaPausa('15'), 15);
  assert.equal(duracaoDaPausa('999'), 999);
  assert.equal(duracaoDaPausa('1'), 1);
  for (const ruim of ['', '0', '000', '1000', '1.5', '-3', 'abc']) assert.equal(duracaoDaPausa(ruim), null, ruim);
});

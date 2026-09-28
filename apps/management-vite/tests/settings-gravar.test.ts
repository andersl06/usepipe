import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wireBodyOfRuleSla } from '../src/lib/settings-gravar.ts';

/**
 * SLA rule creation posted the raw local shape ({nome, alvo, prazoSeg, alertaSeg, active})
 * straight to the API, which reads {name, target, deadlineSeg, alertSeg, ativa} — every
 * creation failed with `name_required` and edits silently dropped every field (b7bb6c8d-class
 * bug: one side renamed, the other side never translated the wire body).
 */
test('wireBodyOfRuleSla translates the local PT shape into the API wire body', () => {
  assert.deepEqual(
    wireBodyOfRuleSla({
      nome: 'Primeira resposta',
      alvo: 'firstResponse',
      prazoSeg: 300,
      alertaSeg: 240,
      scopeType: 'tenant',
      scopeId: null,
      active: true,
    }),
    {
      name: 'Primeira resposta',
      target: 'firstResponse',
      deadlineSeg: 300,
      alertSeg: 240,
      scopeType: 'tenant',
      scopeId: null,
      ativa: true,
    },
  );
});

test('wireBodyOfRuleSla omits fields absent from a partial edit request', () => {
  assert.deepEqual(wireBodyOfRuleSla({ active: false }), { ativa: false });
});

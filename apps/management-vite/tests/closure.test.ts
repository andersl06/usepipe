import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { closureCanConfirm } from '../../../packages/ui/src/rules-closure';

describe('monitoring\'s closure card rule', () => {
  it('exige os motivos configurados e aceita outras tags múltiplas', () => {
    const tags = [
      { id: 'a', nome: 'Resolvido', obrigatoriaNoEncerramento: true },
      { id: 'b', nome: 'Dúvida', obrigatoriaNoEncerramento: false },
    ];
    assert.equal(closureCanConfirm(tags, ['b'], false), false);
    assert.equal(closureCanConfirm(tags, ['a', 'b'], false), true);
  });

  it('aceita lista vazia se o tenant não configurou tags obrigatórias', () => {
    assert.equal(closureCanConfirm([], [], false), true);
  });
});

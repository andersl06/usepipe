import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { closureCanConfirm } from '../../../packages/ui/src/rules-closure';

describe('closure card rule copied from Blip', () => {
  const tags = [
    { id: 'obrigatoria', nome: 'Resolvido', obrigatoriaInClosure: true },
    { id: 'opcional', nome: 'Dúvida', obrigatoriaInClosure: false },
  ];

  it('permite encerrar sem tag quando a política não exige nenhuma', () => {
    assert.equal(closureCanConfirm([], [], false), true);
    assert.equal(closureCanConfirm([tags[1]!], [], false), true);
  });

  it('bloqueia até que todas as tags obrigatórias estejam selecionadas', () => {
    assert.equal(closureCanConfirm(tags, [], false), false);
    assert.equal(closureCanConfirm(tags, ['opcional'], false), false);
    assert.equal(closureCanConfirm(tags, ['obrigatoria'], false), true);
  });

  it('blocks confirmation while sending', () => {
    assert.equal(closureCanConfirm([], [], true), false);
  });
});

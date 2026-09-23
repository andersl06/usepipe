import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encerramentoPodeConfirmar } from '../../../packages/ui/src/regras-encerramento';

describe('regra do cartão de encerramento do monitoramento', () => {
  it('exige os motivos configurados e aceita outras tags múltiplas', () => {
    const tags = [
      { id: 'a', nome: 'Resolvido', obrigatoriaNoEncerramento: true },
      { id: 'b', nome: 'Dúvida', obrigatoriaNoEncerramento: false },
    ];
    assert.equal(encerramentoPodeConfirmar(tags, ['b'], false), false);
    assert.equal(encerramentoPodeConfirmar(tags, ['a', 'b'], false), true);
  });

  it('aceita lista vazia se o tenant não configurou tags obrigatórias', () => {
    assert.equal(encerramentoPodeConfirmar([], [], false), true);
  });
});

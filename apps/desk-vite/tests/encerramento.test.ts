import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encerramentoPodeConfirmar } from '../../../packages/ui/src/regras-encerramento';

describe('regra do cartão de encerramento copiado da Blip', () => {
  const tags = [
    { id: 'obrigatoria', nome: 'Resolvido', obrigatoriaNoEncerramento: true },
    { id: 'opcional', nome: 'Dúvida', obrigatoriaNoEncerramento: false },
  ];

  it('permite encerrar sem tag quando a política não exige nenhuma', () => {
    assert.equal(encerramentoPodeConfirmar([], [], false), true);
    assert.equal(encerramentoPodeConfirmar([tags[1]!], [], false), true);
  });

  it('bloqueia até que todas as tags obrigatórias estejam selecionadas', () => {
    assert.equal(encerramentoPodeConfirmar(tags, [], false), false);
    assert.equal(encerramentoPodeConfirmar(tags, ['opcional'], false), false);
    assert.equal(encerramentoPodeConfirmar(tags, ['obrigatoria'], false), true);
  });

  it('bloqueia confirmação durante o envio', () => {
    assert.equal(encerramentoPodeConfirmar([], [], true), false);
  });
});

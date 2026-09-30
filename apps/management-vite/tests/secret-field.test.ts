import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estadoVisualDoCampoSecreto } from '../src/lib/secret-field.ts';

test('campo secreto troca o ícone e a ação junto com a visibilidade', () => {
  assert.deepEqual(estadoVisualDoCampoSecreto(false), {
    tipo: 'password',
    icone: 'olho',
    acao: 'Mostrar',
  });
  assert.deepEqual(estadoVisualDoCampoSecreto(true), {
    tipo: 'text',
    icone: 'olho-riscado',
    acao: 'Ocultar',
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAMPOS_EDITAVEIS,
  campoValido,
  normalizar,
  recusar,
} from '../src/lib/campos-editaveis.ts';

/**
 * A régua da edição inline.
 *
 * `recusar` e `campoValido` rodam nos dois lados: no navegador para não fazer
 * uma viagem à toa, e no servidor porque a server action é um endereço HTTP e
 * qualquer um alcança. Um teste só, sem framework — `node --import tsx --test`,
 * com o `tsx` que o aplicativo já tem.
 *
 * O que ele protege: a lista branca não pode aceitar nome de coluna qualquer, e
 * campo em branco tem de virar `null` e não string vazia — é `null` que apaga o
 * proprietário, e `''` gravaria um id vazio na chave estrangeira.
 */

test('a lista branca só aceita o que está no catálogo', () => {
  assert.ok(campoValido('email'));
  assert.ok(campoValido('proprietario'));
  // Os que a escrita NÃO pode alcançar, e que existem como coluna no banco.
  for (const fora of ['status', 'score_atual', 'tenant_id', 'excluido_em', 'toString', '']) {
    assert.equal(campoValido(fora), false, `${fora} não pode passar`);
  }
});

test('branco vira nulo, e espaço nas pontas some', () => {
  assert.equal(normalizar('   '), null);
  assert.equal(normalizar(''), null);
  assert.equal(normalizar('  ana@exemplo.com '), 'ana@exemplo.com');
});

test('nulo passa em qualquer campo: apagar é operação legítima', () => {
  for (const campo of Object.keys(CAMPOS_EDITAVEIS)) {
    assert.equal(recusar(campo as keyof typeof CAMPOS_EDITAVEIS, null), null);
  }
});

test('e-mail sem arroba ou sem domínio é recusado', () => {
  assert.equal(recusar('email', 'ana@exemplo.com.br'), null);
  assert.ok(recusar('email', 'ana'));
  assert.ok(recusar('email', 'ana@exemplo'));
  assert.ok(recusar('email', 'a na@exemplo.com'));
});

test('telefone recusa letra e aceita o formato brasileiro escrito à mão', () => {
  assert.equal(recusar('telefone', '+55 (11) 99999-0000'), null);
  assert.equal(recusar('telefone', '11999990000'), null);
  assert.ok(recusar('telefone', 'liga pra mim'));
});

test('o teto de caracteres é do catálogo, e vale', () => {
  const longo = 'a'.repeat(CAMPOS_EDITAVEIS.origem.maximo + 1);
  assert.ok(recusar('origem', longo));
  assert.equal(recusar('origem', 'a'.repeat(CAMPOS_EDITAVEIS.origem.maximo)), null);
});

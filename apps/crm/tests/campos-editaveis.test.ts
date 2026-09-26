import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAMPOS_EDITAVEIS,
  campoValido,
  normalizar,
  recusar,
} from '../src/lib/campos-editaveis.ts';

/**
 * The inline-edit ruler.
 *
 * `recusar` and `campoValido` run on both sides: in the browser to avoid a
 * wasted round trip, and on the server because the server action is an HTTP
 * address and anyone can reach it. A single test, no framework —
 * `node --import tsx --test`, with the `tsx` the app already has.
 *
 * What it protects: the allowlist can't accept just any column name, and a
 * blank field has to become `null` and not an empty string — it's `null` that
 * clears the owner, and `''` would write an empty id into the foreign key.
 */

test('a lista branca só aceita o que está no catálogo', () => {
  assert.ok(campoValido('email'));
  assert.ok(campoValido('proprietario'));
  // The ones the write CANNOT reach, and that exist as a column in the database.
  for (const fora of ['status', 'score_atual', 'tenant_id', 'excluido_em', 'toString', '']) {
    assert.equal(campoValido(fora), false, `${fora} não pode passar`);
  }
});

test('branco vira nulo, e espaço nas pontas some', () => {
  assert.equal(normalizar('   '), null);
  assert.equal(normalizar(''), null);
  assert.equal(normalizar('  ana@exemplo.com '), 'ana@exemplo.com');
});

test('null passes for any field: clearing it is a legitimate operation', () => {
  for (const campo of Object.keys(CAMPOS_EDITAVEIS)) {
    assert.equal(recusar(campo as keyof typeof CAMPOS_EDITAVEIS, null), null);
  }
});

test('an email without an @ or without a domain is rejected', () => {
  assert.equal(recusar('email', 'ana@exemplo.com.br'), null);
  assert.ok(recusar('email', 'ana'));
  assert.ok(recusar('email', 'ana@exemplo'));
  assert.ok(recusar('email', 'a na@exemplo.com'));
});

test('phone rejects letters and accepts the Brazilian format written by hand', () => {
  assert.equal(recusar('telefone', '+55 (11) 99999-0000'), null);
  assert.equal(recusar('telefone', '11999990000'), null);
  assert.ok(recusar('telefone', 'liga pra mim'));
});

test('o teto de caracteres é do catálogo, e vale', () => {
  const longo = 'a'.repeat(CAMPOS_EDITAVEIS.origem.maximo + 1);
  assert.ok(recusar('origem', longo));
  assert.equal(recusar('origem', 'a'.repeat(CAMPOS_EDITAVEIS.origem.maximo)), null);
});

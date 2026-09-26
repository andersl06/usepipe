import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TETO_ESCALA,
  TETO_NOTA,
  fatalReprovado,
  fractionAnswered,
} from '../src/lib/nota-evaluation.ts';

/**
 * A fatal criterion zeroes out the whole evaluation. Getting this wrong means giving a zero to someone who doesn't deserve it — or hiding the zero from someone who does — and in both cases the number becomes a decision about a person.
 *
 * The caps are copied from `packages/ai/src/avaliacao/tipos.ts`, and the test also exists to flag it if they ever diverge.
 */

test('os tetos continuam sendo os do formulário: escala 5, nota 10', () => {
  assert.equal(TETO_ESCALA, 5);
  assert.equal(TETO_NOTA, 10);
});

test('conforme vale tudo, não conforme vale nada', () => {
  assert.equal(fractionAnswered('conforme', 'conforme'), 1);
  assert.equal(fractionAnswered('conforme', 'nao_conforme'), 0);
});

test('não se aplica sai do cálculo — não é zero, é ausência', () => {
  assert.equal(fractionAnswered('conforme', 'nao_se_aplica'), null);
  assert.equal(fractionAnswered('escala', 'nao_se_aplica'), null);
  assert.equal(fatalReprovado('conforme', true, 'nao_se_aplica'), false);
});

test('scale and score become a fraction of their own ceiling', () => {
  assert.equal(fractionAnswered('escala', '5'), 1);
  assert.equal(fractionAnswered('escala', '4'), 0.8);
  assert.equal(fractionAnswered('nota', '10'), 1);
  assert.equal(fractionAnswered('nota', '7'), 0.7);
  // Comma is the decimal separator the model returns when writing in Portuguese.
  assert.equal(fractionAnswered('nota', '7,5'), 0.75);
});

test('a value outside the scale does not become zero — it becomes unknown', () => {
  assert.equal(fractionAnswered('escala', '9'), null);
  assert.equal(fractionAnswered('nota', '-1'), null);
  assert.equal(fractionAnswered('conforme', 'talvez'), null);
});

test('fatal only fails with a known fraction below the maximum', () => {
  assert.equal(fatalReprovado('conforme', true, 'nao_conforme'), true);
  assert.equal(fatalReprovado('escala', true, '4'), true);
  assert.equal(fatalReprovado('escala', true, '5'), false);
  // An unanswered criterion means an incomplete form, not a failed agent.
  assert.equal(fatalReprovado('conforme', true, null), false);
  // And a non-fatal criterion never fails the evaluation, no matter how bad the answer.
  assert.equal(fatalReprovado('conforme', false, 'nao_conforme'), false);
});

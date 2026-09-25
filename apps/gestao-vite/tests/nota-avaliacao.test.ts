import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TETO_ESCALA,
  TETO_NOTA,
  fatalReprovado,
  fractionAnswered,
} from '../src/lib/nota-avaliacao.ts';

/**
 * Critério fatal zera a avaliação inteira. Errar aqui é dar zero a quem não
 * merece — ou esconder o zero de quem merece —, e nos dois casos o número vira
 * decisão sobre gente.
 *
 * Os tetos são cópia de `packages/ai/src/avaliacao/tipos.ts`, e o teste existe
 * também para gritar se um dia divergirem.
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
  // Vírgula é o separador decimal que o modelo devolve escrevendo em português.
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
  // Critério não respondido é formulário incompleto, não atendente reprovado.
  assert.equal(fatalReprovado('conforme', true, null), false);
  // E critério que não é fatal nunca reprova, por pior que seja a resposta.
  assert.equal(fatalReprovado('conforme', false, 'nao_conforme'), false);
});

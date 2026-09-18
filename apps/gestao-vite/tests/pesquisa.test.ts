import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ESCALA_POR_TIPO,
  classeDaNota,
  disparoValido,
  tipoDePesquisaValido,
} from '../src/lib/pesquisa.ts';

/**
 * §6 da spec de métricas: CSAT e NPS são escalas incompatíveis, e a fronteira
 * de cada classe é diferente. Um 4 é promotor no CSAT e detrator no NPS — é
 * exatamente esse par que o teste protege, porque trocar as duas fronteiras
 * inverte o sinal do relatório inteiro sem quebrar nada.
 */

test('a escala sai do tipo, não do formulário', () => {
  assert.deepEqual(
    { min: ESCALA_POR_TIPO.csat.min, max: ESCALA_POR_TIPO.csat.max },
    { min: 1, max: 5 },
  );
  assert.deepEqual(
    { min: ESCALA_POR_TIPO.nps.min, max: ESCALA_POR_TIPO.nps.max },
    { min: 0, max: 10 },
  );
});

test('o mesmo 4 é promotor no CSAT e detrator no NPS', () => {
  assert.equal(classeDaNota('csat', 4), 'promotor');
  assert.equal(classeDaNota('nps', 4), 'detrator');
});

test('as fronteiras do CSAT: 1–2 detrator, 3 neutro, 4–5 promotor', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((n) => classeDaNota('csat', n)),
    ['detrator', 'detrator', 'neutro', 'promotor', 'promotor'],
  );
});

test('as fronteiras do NPS: 0–6 detrator, 7–8 neutro, 9–10 promotor', () => {
  assert.deepEqual(
    [0, 6, 7, 8, 9, 10].map((n) => classeDaNota('nps', n)),
    ['detrator', 'detrator', 'neutro', 'neutro', 'promotor', 'promotor'],
  );
});

test('nota fora da escala não recebe classe — não vira detrator por descuido', () => {
  assert.equal(classeDaNota('csat', 0), null);
  assert.equal(classeDaNota('csat', 6), null);
  assert.equal(classeDaNota('nps', 11), null);
  assert.equal(classeDaNota('nps', Number.NaN), null);
});

test('o que a tela aceita é o que o banco tem check', () => {
  assert.ok(tipoDePesquisaValido('nps'));
  assert.equal(tipoDePesquisaValido('csat-2'), false);
  assert.ok(disparoValido('encerramento'));
  assert.equal(disparoValido('quando_der'), false);
});

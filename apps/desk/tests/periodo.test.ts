import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  comoCampoDeData,
  ehPeriodo,
  intervaloDe,
  intervaloPersonalizado,
  TETO_DIAS,
} from '../src/lib/periodo.ts';

/** Uma quarta-feira às 14h37, para o dia ter começo e fim distintos do agora. */
const AGORA = new Date(2026, 8, 9, 14, 37, 12, 345);
/** A meia-noite do mesmo dia: é dela que se conta o recuo, não do relógio. */
const HOJE_ZERO = new Date(2026, 8, 9);
const diasEntre = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / 86400000);

test('"Hoje" vai da meia-noite até AGORA, e não até o fim do dia', () => {
  const { inicio, fim } = intervaloDe('hoje', AGORA);
  assert.equal(inicio.getHours(), 0);
  assert.equal(inicio.getDate(), 9);
  // Projetar o fim do dia faria a média da manhã parecer pior do que é.
  assert.equal(fim.getTime(), AGORA.getTime());
});

test('"Ontem" é o dia anterior inteiro, das 00:00 às 23:59', () => {
  const { inicio, fim } = intervaloDe('ontem', AGORA);
  assert.equal(inicio.getDate(), 8);
  assert.equal(inicio.getHours(), 0);
  assert.equal(fim.getDate(), 8);
  assert.equal(fim.getHours(), 23);
});

test('os atalhos recuam 6, 29 e 89 dias e terminam hoje', () => {
  for (const [chave, recuo] of [['7d', 6], ['30d', 29], ['90d', 89]] as const) {
    const { inicio, fim } = intervaloDe(chave, AGORA);
    assert.equal(diasEntre(HOJE_ZERO, inicio), recuo, `${chave} deveria recuar ${recuo} dias`);
    assert.equal(fim.getDate(), AGORA.getDate());
  }
});

test('período desconhecido não passa pelo guarda', () => {
  assert.equal(ehPeriodo('7d'), true);
  assert.equal(ehPeriodo('ano'), false);
  assert.equal(ehPeriodo(undefined), false);
});

test('o intervalo à mão aceita as duas datas e cobre os dois dias inteiros', () => {
  const r = intervaloPersonalizado('2026-09-01', '2026-09-03', AGORA);
  assert.ok(r);
  assert.equal(r.inicio.getDate(), 1);
  assert.equal(r.inicio.getHours(), 0);
  assert.equal(r.fim.getDate(), 3);
  assert.equal(r.fim.getHours(), 23);
});

test('datas invertidas trocam de lugar em vez de devolver nada', () => {
  const r = intervaloPersonalizado('2026-09-03', '2026-09-01', AGORA);
  assert.ok(r);
  assert.ok(r.inicio < r.fim);
  assert.equal(r.inicio.getDate(), 1);
});

test('começo além de 90 dias sobe para o teto, e o fim não passa de hoje', () => {
  const r = intervaloPersonalizado('2020-01-01', '2030-01-01', AGORA);
  assert.ok(r);
  assert.equal(diasEntre(HOJE_ZERO, r.inicio), TETO_DIAS);
  assert.equal(r.fim.getDate(), AGORA.getDate());
});

test('data ilegível e intervalo que começa no futuro são recusados', () => {
  assert.equal(intervaloPersonalizado('nada', '2026-09-01', AGORA), null);
  assert.equal(intervaloPersonalizado('2027-01-01', '2027-02-01', AGORA), null);
});

test('a data do campo sai no relógio local, com zero à esquerda', () => {
  assert.equal(comoCampoDeData(new Date(2026, 0, 5)), '2026-01-05');
});

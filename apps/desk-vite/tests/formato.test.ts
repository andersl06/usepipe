import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cronometro,
  horarioDoBalao,
  horarioRelativo,
  initials,
  timeElapsed,
} from '../src/lib/formato';

const agora = new Date(2026, 8, 17, 12, 0, 0);

test('today shows HH:mm; another day shows elapsed time without a suffix (card) or the abbreviated date (bubble)', () => {
  const hoje = new Date(2026, 8, 17, 9, 5);
  const ontem = new Date(2026, 8, 16, 9, 5);
  assert.equal(horarioRelativo(hoje, agora), '09:05');
  assert.equal(horarioRelativo(ontem, agora), 'um dia');
  assert.equal(horarioDoBalao(hoje, agora), '09:05');
  assert.equal(horarioDoBalao(new Date(2026, 7, 26, 12, 41), agora), '26 de Ago de 2026 12:41');
});

test('the elapsed-time steps match moment\'s', () => {
  const em = (seg: number) => new Date(agora.getTime() - seg * 1000);
  assert.equal(timeElapsed(em(30), agora), 'poucos segundos');
  assert.equal(timeElapsed(em(60), agora), 'um minuto');
  assert.equal(timeElapsed(em(20 * 60), agora), '20 minutos');
  assert.equal(timeElapsed(em(5 * 3600), agora), '5 horas');
  assert.equal(timeElapsed(em(3 * 86400), agora), '3 dias');
  assert.equal(timeElapsed(em(40 * 86400), agora), 'um mês');
});

test('timer and initials', () => {
  assert.equal(cronometro(3725), '01:02:05');
  assert.equal(cronometro(-5), '00:00:00');
  assert.equal(initials('Anderson Linhares'), 'AL');
  assert.equal(initials('Ana'), 'A');
  assert.equal(initials(null), '');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cronometro,
  horarioDoBalao,
  horarioRelativo,
  iniciais,
  tempoDecorrido,
} from '../src/lib/formato';

const agora = new Date(2026, 8, 17, 12, 0, 0);

test('hoje é HH:mm; outro dia é o tempo decorrido sem sufixo (cartão) ou a data abreviada (balão)', () => {
  const hoje = new Date(2026, 8, 17, 9, 5);
  const ontem = new Date(2026, 8, 16, 9, 5);
  assert.equal(horarioRelativo(hoje, agora), '09:05');
  assert.equal(horarioRelativo(ontem, agora), 'um dia');
  assert.equal(horarioDoBalao(hoje, agora), '09:05');
  assert.equal(horarioDoBalao(new Date(2026, 7, 26, 12, 41), agora), '26 de Ago de 2026 12:41');
});

test('os degraus do tempo decorrido são os do moment', () => {
  const em = (seg: number) => new Date(agora.getTime() - seg * 1000);
  assert.equal(tempoDecorrido(em(30), agora), 'poucos segundos');
  assert.equal(tempoDecorrido(em(60), agora), 'um minuto');
  assert.equal(tempoDecorrido(em(20 * 60), agora), '20 minutos');
  assert.equal(tempoDecorrido(em(5 * 3600), agora), '5 horas');
  assert.equal(tempoDecorrido(em(3 * 86400), agora), '3 dias');
  assert.equal(tempoDecorrido(em(40 * 86400), agora), 'um mês');
});

test('cronômetro e iniciais', () => {
  assert.equal(cronometro(3725), '01:02:05');
  assert.equal(cronometro(-5), '00:00:00');
  assert.equal(iniciais('Anderson Linhares'), 'AL');
  assert.equal(iniciais('Ana'), 'A');
  assert.equal(iniciais(null), '');
});

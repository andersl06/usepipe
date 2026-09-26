import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arranjar, moverVisivel, type Config } from '../src/components/colunas.tsx';

/**
 * The column-arrangement ruler.
 *
 * What it protects is the merge between two lists that drift apart on their
 * own: the one stored in the browser and the one the screen has today. A new
 * column from a deploy, a column grouping removed, a column gone for good — all
 * three have already broken a table in a product that does this, and all
 * three show up here.
 *
 * No test touches React or `localStorage`: `arranjar` and `moverVisivel` are
 * list functions, and that's how you test a list.
 */

const CHAVES = ['lead', 'origem', 'score', 'faixa', 'proprietario'];
const LIMPA: Config = { order: [], ocultas: [] };

test('with nothing saved, the order matches the screen and the pinned column stays out of the movable ones', () => {
  const a = arranjar(CHAVES, LIMPA, 'lead');
  assert.deepEqual(a.todas, ['origem', 'score', 'faixa', 'proprietario']);
  assert.deepEqual(a.visiveis, ['origem', 'score', 'faixa', 'proprietario']);
  assert.deepEqual(a.ocultas, []);
});

test('the pinned column is never hidden, even if someone edits storage directly', () => {
  const a = arranjar(CHAVES, { order: ['lead'], ocultas: ['lead', 'score'] }, 'lead');
  assert.equal(a.todas.includes('lead'), false);
  assert.equal(a.visiveis.includes('lead'), false);
  assert.equal(a.ocultas.includes('lead'), false);
  assert.deepEqual(a.ocultas, ['score']);
});

test('a new column from a deploy is appended at the end, without pushing existing ones', () => {
  // `faixa` and `proprietario` didn't exist when the person arranged the table.
  const guardada: Config = { order: ['score', 'origem'], ocultas: [] };
  const a = arranjar(CHAVES, guardada, 'lead');
  assert.deepEqual(a.visiveis, ['score', 'origem', 'faixa', 'proprietario']);
});

test('a column removed from the screen disappears from the arrangement without leaving a gap', () => {
  // It's what happens when grouping by source: the redundant column drops out of the list.
  const guardada: Config = { order: ['score', 'origem', 'faixa'], ocultas: ['faixa'] };
  const a = arranjar(['lead', 'score', 'proprietario'], guardada, 'lead');
  assert.deepEqual(a.todas, ['score', 'proprietario']);
  assert.deepEqual(a.visiveis, ['score', 'proprietario']);
  assert.deepEqual(a.ocultas, []);
});

test('a hidden column keeps its place: showing it again does not push it to the end', () => {
  const guardada: Config = { order: ['origem', 'score', 'faixa'], ocultas: ['score'] };
  const escondida = arranjar(CHAVES, guardada, 'lead');
  assert.deepEqual(escondida.visiveis, ['origem', 'faixa', 'proprietario']);

  const mostrada = arranjar(CHAVES, { order: escondida.todas, ocultas: [] }, 'lead');
  assert.deepEqual(mostrada.visiveis, ['origem', 'score', 'faixa', 'proprietario']);
});

test('moving down places the column after the one that occupied the destination', () => {
  const a = arranjar(CHAVES, LIMPA, 'lead');
  assert.deepEqual(moverVisivel(a, 0, 2), ['score', 'faixa', 'origem', 'proprietario']);
});

test('moving up places the column before the one that occupied the destination', () => {
  const a = arranjar(CHAVES, LIMPA, 'lead');
  assert.deepEqual(moverVisivel(a, 3, 1), ['origem', 'proprietario', 'score', 'faixa']);
});

test('moving returns the FULL order, with hidden columns anchored to their neighbor', () => {
  // `score` is hidden between `origem` and `faixa`. Moving `faixa` to the front
  // can't make `score` disappear from the saved order.
  const a = arranjar(CHAVES, { order: [], ocultas: ['score'] }, 'lead');
  assert.deepEqual(a.visiveis, ['origem', 'faixa', 'proprietario']);
  const nova = moverVisivel(a, 1, 0);
  assert.deepEqual(nova, ['faixa', 'origem', 'score', 'proprietario']);
  assert.equal(nova.length, a.todas.length, 'nenhuma coluna pode sumir ao mover');
});

test('mover para o próprio lugar, ou para índice que não existe, não muda nada', () => {
  const a = arranjar(CHAVES, LIMPA, 'lead');
  assert.deepEqual(moverVisivel(a, 1, 1), a.todas);
  assert.deepEqual(moverVisivel(a, 1, 9), a.todas);
  assert.deepEqual(moverVisivel(a, -1, 0), a.todas);
});

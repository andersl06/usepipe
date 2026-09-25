import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arranjar, moverVisivel, type Config } from '../src/components/colunas.tsx';

/**
 * A régua do arranjo de colunas.
 *
 * O que ela protege é o encontro entre duas listas que divergem sozinhas: a que
 * está guardada no navegador e a que a tela tem hoje. Coluna nova de um deploy,
 * coluna que o agrupamento tirou, coluna que sumiu de vez — as três já
 * quebraram tabela em produto que faz isso, e as três aparecem aqui.
 *
 * Nenhum teste toca React nem `localStorage`: `arranjar` e `moverVisivel` são
 * funções de lista, e é assim que se testa lista.
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
  // `faixa` e `proprietario` não existiam quando a pessoa arrumou a tabela.
  const guardada: Config = { order: ['score', 'origem'], ocultas: [] };
  const a = arranjar(CHAVES, guardada, 'lead');
  assert.deepEqual(a.visiveis, ['score', 'origem', 'faixa', 'proprietario']);
});

test('a column removed from the screen disappears from the arrangement without leaving a gap', () => {
  // É o que acontece ao agrupar por origem: a coluna redundante sai da lista.
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
  // `score` está oculta entre `origem` e `faixa`. Mover `faixa` para o começo
  // não pode fazer `score` desaparecer da ordem gravada.
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

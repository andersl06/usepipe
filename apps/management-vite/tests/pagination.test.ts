import assert from 'node:assert/strict';
import test from 'node:test';

import { PAGE_SIZES, janelaDaPagina } from '../../../packages/ui/src/components/pagination-math';

test('lista vazia mostra uma página e janela vazia', () => {
  assert.deepEqual(janelaDaPagina(0, 1, 10), { page: 1, totalPages: 1, inicio: 0, fim: 0 });
});

test('última página parcial termina no total', () => {
  assert.deepEqual(janelaDaPagina(23, 3, 10), { page: 3, totalPages: 3, inicio: 20, fim: 23 });
});

test('página fora do limite volta para a última', () => {
  assert.deepEqual(janelaDaPagina(23, 9, 10), { page: 3, totalPages: 3, inicio: 20, fim: 23 });
});

test('total igual ao tamanho cabe em uma página', () => {
  assert.deepEqual(janelaDaPagina(5, 1, 5), { page: 1, totalPages: 1, inicio: 0, fim: 5 });
});

test('tamanhos de página continuam os da referência', () => {
  assert.deepEqual([...PAGE_SIZES], [5, 10, 15, 25, 50, 100, 250, 500]);
});

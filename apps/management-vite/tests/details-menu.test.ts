import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextMenuIndex } from '../src/lib/details-menu.ts';

test('ArrowDown wraps to the first item after the last', () => {
  assert.equal(nextMenuIndex(0, 3, 'ArrowDown'), 1);
  assert.equal(nextMenuIndex(2, 3, 'ArrowDown'), 0);
  assert.equal(nextMenuIndex(-1, 3, 'ArrowDown'), 0);
});

test('ArrowUp wraps to the last item from the first', () => {
  assert.equal(nextMenuIndex(0, 3, 'ArrowUp'), 2);
  assert.equal(nextMenuIndex(2, 3, 'ArrowUp'), 1);
  assert.equal(nextMenuIndex(-1, 3, 'ArrowUp'), 2);
});

test('Home and End jump to the ends; other keys keep the index', () => {
  assert.equal(nextMenuIndex(1, 3, 'Home'), 0);
  assert.equal(nextMenuIndex(1, 3, 'End'), 2);
  assert.equal(nextMenuIndex(1, 3, 'a'), 1);
});

test('An empty menu returns -1', () => {
  assert.equal(nextMenuIndex(0, 0, 'ArrowDown'), -1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReload, markOpened } from '../src/lib/presence';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

test('first call in a tab is not a reload; after markOpened it is', () => {
  const storage = memory();
  assert.equal(isReload(storage), false);
  markOpened(storage);
  assert.equal(isReload(storage), true);
});

test('unavailable storage reads as a new tab without throwing', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(isReload(broken), false);
  assert.doesNotThrow(() => markOpened(broken));
});

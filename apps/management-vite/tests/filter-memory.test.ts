import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterStorageKey, loadFilters, saveFilters } from '../src/lib/filter-memory';

function memoryStorage() {
  const map = new Map<string, string>();
  let getCalls = 0;
  return {
    getCalls: () => getCalls,
    getItem: (key: string) => {
      getCalls++;
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    has: (key: string) => map.has(key),
  };
}

test('filterStorageKey builds the pipe:<app>:<screen>:filters:v1:<tenant>:<user> key', () => {
  assert.equal(
    filterStorageKey('gestao', 'monitoring', 't1', 'u1'),
    'pipe:gestao:monitoring:filters:v1:t1:u1',
  );
});

test('filterStorageKey differs when tenantId or userId differ', () => {
  const base = filterStorageKey('gestao', 'monitoring', 't1', 'u1');
  assert.notEqual(filterStorageKey('gestao', 'monitoring', 't2', 'u1'), base);
  assert.notEqual(filterStorageKey('gestao', 'monitoring', 't1', 'u2'), base);
});

test('saveFilters then loadFilters with a validator round-trips the value', () => {
  const storage = memoryStorage();
  const key = filterStorageKey('gestao', 'monitoring', 't1', 'u1');
  saveFilters(key, { queue: 'q1' }, storage);
  const result = loadFilters<{ queue: string }>(
    key,
    (v) => (v && typeof v === 'object' && 'queue' in v ? (v as { queue: string }) : null),
    storage,
  );
  assert.deepEqual(result, { queue: 'q1' });
});

test('loadFilters returns null and removes the key when stored JSON is invalid', () => {
  const storage = memoryStorage();
  const key = filterStorageKey('gestao', 'monitoring', 't1', 'u1') as string;
  storage.setItem(key, '{not json');
  const result = loadFilters(key, (v) => v, storage);
  assert.equal(result, null);
  assert.equal(storage.has(key), false);
});

test('loadFilters returns null and removes the key when the validator rejects stale ids', () => {
  const storage = memoryStorage();
  const key = filterStorageKey('gestao', 'monitoring', 't1', 'u1') as string;
  saveFilters(key, { queue: 'stale-queue' }, storage);
  const result = loadFilters(key, () => null, storage);
  assert.equal(result, null);
  assert.equal(storage.has(key), false);
});

test('loadFilters with a missing tenantId or userId returns null and never reads storage', () => {
  const storage = memoryStorage();
  const key = filterStorageKey('gestao', 'monitoring', '', 'u1');
  assert.equal(key, null);
  const result = loadFilters(key, (v) => v, storage);
  assert.equal(result, null);
  assert.equal(storage.getCalls(), 0);
});

test('storage is injectable and loadFilters never throws without a real localStorage', () => {
  const key = filterStorageKey('gestao', 'monitoring', 't1', 'u1');
  // No storage argument: falls back to globalThis.localStorage, which does
  // not exist in this node:test environment — must degrade to null, not throw.
  assert.doesNotThrow(() => loadFilters(key, (v) => v));
  assert.equal(loadFilters(key, (v) => v), null);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterResources, nameError, parseImportedResources } from '../src/pages/flow/resources/regras.ts';

test('nameError: accepts letters, digits, underscore and dot; rejects hyphen, space and emoji', () => {
  assert.equal(nameError('TimeZoneAttendance'), null);
  assert.equal(nameError('simple_resources.v2'), null);
  assert.equal(nameError(''), 'vazio');
  assert.equal(nameError('   '), 'vazio');
  assert.equal(nameError('my-resource'), 'invalido');
  assert.equal(nameError('my resource'), 'invalido');
  assert.equal(nameError('chave🙂'), 'invalido');
});

test('filterResources matches the name only, ignoring accent and case', () => {
  const list = [
    { id: '1', flowId: 'f', name: 'TimeZoneAttendance', type: 'text/plain', value: 'x', createdAt: '', updatedAt: null },
    { id: '2', flowId: 'f', name: 'objectResources', type: 'application/json', value: '{}', createdAt: '', updatedAt: null },
  ];
  assert.deepEqual(filterResources(list, 'timezone').map((r) => r.name), ['TimeZoneAttendance']);
  assert.deepEqual(filterResources(list, ''), list);
});

test('parseImportedResources reads Blip\'s export shape (key/type/content)', () => {
  const result = parseImportedResources(JSON.stringify([
    { key: 'TimeZoneAttendance', type: 'text/plain', content: 'America/Sao_Paulo' },
    { key: 'objectResources', type: 'application/json', content: { foo: 'bar' } },
  ]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.items, [
    { name: 'TimeZoneAttendance', type: 'text/plain', value: 'America/Sao_Paulo' },
    { name: 'objectResources', type: 'application/json', value: '{"foo":"bar"}' },
  ]);
  assert.deepEqual(result.errors, []);
});

test('parseImportedResources reads a plain object map, inferring type from the value', () => {
  const result = parseImportedResources(JSON.stringify({
    createMenuFunction: 'function run(){return 1;}',
    simpleResources: { a: 1 },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.items, [
    { name: 'createMenuFunction', type: 'text/plain', value: 'function run(){return 1;}' },
    { name: 'simpleResources', type: 'application/json', value: '{"a":1}' },
  ]);
});

test('parseImportedResources reports invalid JSON without throwing', () => {
  const result = parseImportedResources('{not json}');
  assert.equal(result.ok, false);
});

test('parseImportedResources skips a bad name but keeps the rest, reporting the error', () => {
  const result = parseImportedResources(JSON.stringify({ 'my-bad-name': 'x', good: 'y' }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.items.map((i) => i.name), ['good']);
  assert.equal(result.errors.length, 1);
});

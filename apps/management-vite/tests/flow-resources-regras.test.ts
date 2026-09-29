import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contentError,
  filterResources,
  kindOfType,
  nameError,
  parseImportedResources,
  truncateContent,
  typeLabel,
} from '../src/pages/flow/resources/regras.ts';

test('typeLabel maps MIME types to Texto/JSON', () => {
  assert.equal(typeLabel('text/plain'), 'Texto');
  assert.equal(typeLabel('application/json'), 'JSON');
  assert.equal(typeLabel('application/vnd.api+json'), 'JSON');
  assert.equal(typeLabel('text/html'), 'Texto');
  assert.equal(kindOfType('APPLICATION/JSON'), 'json');
});

test('truncateContent cuts by lines and characters with an ellipsis', () => {
  assert.equal(truncateContent('short'), 'short');
  assert.equal(truncateContent('a\nb\nc\nd'), 'a\nb\nc…');
  assert.equal(truncateContent('x'.repeat(50), 10), `${'x'.repeat(10)}…`);
  assert.equal(truncateContent('a\nb\nc'), 'a\nb\nc');
});

test('contentError validates JSON only for the json kind', () => {
  assert.equal(contentError('json', '{"a":1}'), null);
  assert.equal(contentError('json', '{oops'), 'Este conteúdo deve ser um JSON válido.');
  assert.equal(contentError('json', '  '), null);
  assert.equal(contentError('text', '{oops'), null);
});

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

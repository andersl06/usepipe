import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_LOG_FILTERS, filtersFromForm, logQuery, validateLogFilters } from '../src/pages/flow/log/filtros';

test('logQuery keeps only the filled filters', () => {
  assert.equal(
    logQuery({ busca: 'a', de: '2026-10-01', ate: '', direcao: 'entrada', tipo: '' }),
    'search=a&from=2026-10-01&direction=entrada',
  );
});

test('logQuery of empty filters is empty', () => {
  assert.equal(logQuery(EMPTY_LOG_FILTERS), '');
});

test('filtersFromForm reads the submitted value', () => {
  const form = new FormData();
  form.set('direcao', 'saida');
  assert.deepEqual(filtersFromForm(form), { ...EMPTY_LOG_FILTERS, direcao: 'saida' });
});

test('validateLogFilters drops a value with a missing field', () => {
  assert.equal(validateLogFilters({ busca: '' }), null);
  assert.deepEqual(validateLogFilters(EMPTY_LOG_FILTERS), EMPTY_LOG_FILTERS);
});

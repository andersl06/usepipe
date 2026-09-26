import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  writeFilters,
  filterValid,
  readFilters,
  filterLabel,
  WITHOUT_VALUE,
} from '../src/lib/leads-visao.ts';

/**
 * The per-column filter ruler.
 *
 * The filter is the listing's only parameter that comes with a VARIABLE name
 * in the URL, and that's why it needs a test: `aba` and `dir` can only be right
 * or absent, but `f.anything` is whatever someone types into the address bar.
 *
 * What's protected here:
 *   1. only a catalog column becomes a filter — the column name doesn't come
 *      from the screen;
 *   2. a round trip through the URL neither loses nor invents a filter, which
 *      is what keeps a saved view valid after being shared.
 */

test('só as colunas do catálogo filtram', () => {
  assert.ok(filterValid('origem'));
  assert.ok(filterValid('proprietario'));
  for (const fora of ['score', 'dias', 'tenant_id', 'lead', 'toString', '']) {
    assert.equal(filterValid(fora), false, `${fora} não pode filtrar`);
  }
});

test('anything in the list that is not `f.` is ignored when reading', () => {
  const lido = readFilters({
    aba: 'novos',
    q: 'ana',
    origem: 'não conta, falta o prefixo',
    'f.origem': 'Anúncio Meta',
    'f.tenant_id': 'tentativa',
    'f.faixa': '',
  });
  assert.deepEqual(lido, { origem: 'Anúncio Meta' });
});

test('repeated parameter: the first one counts, the rest do not become a second filter', () => {
  assert.deepEqual(readFilters({ 'f.fase': ['Proposta', 'Fechamento'] }), { fase: 'Proposta' });
});

test('a round trip through the URL preserves the filter, including one with a blank value', () => {
  const filters = { origem: 'Indicação', proprietario: WITHOUT_VALUE };
  const p = writeFilters(new URLSearchParams({ tab: 'todos' }), filters);
  assert.equal(p.get('aba'), 'todos', 'o resto da consulta não pode ser atropelado');
  assert.deepEqual(readFilters(Object.fromEntries(p)), filters);
});

test('removing a filter deletes its parameter instead of leaving it empty in the URL', () => {
  const p = writeFilters(new URLSearchParams('aba=todos&f.origem=Indica%C3%A7%C3%A3o'), {});
  assert.equal(p.has('f.origem'), false);
  assert.equal(p.toString(), 'aba=todos');
});

test('the chip shows the column and value, and a blank value is labeled in plain language', () => {
  assert.equal(filterLabel('origem', 'Indicação'), 'Origem: Indicação');
  assert.equal(filterLabel('proprietario', WITHOUT_VALUE), 'Proprietário: em branco');
});

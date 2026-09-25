import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterIds, parametrosWithFilters, urlForLimparFilters } from '../src/lib/filters-monitoring.ts';

test('multiple selection survives submission and reopening, including in old links', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  assert.deepEqual(filterIds([a, `${b},${a}`, 'inválido']), [a, b]);
  const query = parametrosWithFilters(new URLSearchParams('aba=espera'), { fila: [a, b] });
  assert.deepEqual(filterIds(query.getAll('fila')), [a, b]);
  assert.deepEqual(filterIds(filterIds(query.getAll('fila')).join(',')), [a, b]);
  assert.deepEqual(filterIds(''), []);
});

test('clearing filters stays on the current bot\'s monitoring', () => {
  assert.equal(
    urlForLimparFilters('/fluxo/bot-1/atendimento/monitoramento', { queue: 'fila-1' }),
    '/fluxo/bot-1/atendimento/monitoramento',
  );
});

test('clearing the list preserves the operation\'s queue filter', () => {
  assert.equal(
    urlForLimparFilters('/fluxo/bot-1/atendimento/monitoramento', { queue: 'fila-1' }, true),
    '/fluxo/bot-1/atendimento/monitoramento?queue=fila-1',
  );
});

test('applying one chip preserves the other parameters, including search and tab', () => {
  const current = new URLSearchParams('fila=f1&agent=a1&contato=Ana&status=online&aba=espera&busca=123&extra=x');
  const proximos = parametrosWithFilters(current, { atendente: 'a2' });
  assert.equal(proximos.get('atendente'), 'a2');
  for (const key of ['fila', 'contato', 'status', 'aba', 'busca', 'extra']) {
    assert.equal(proximos.get(key), current.get(key));
  }
  assert.equal(current.get('atendente'), 'a1');
});

test('clearing only the current filter preserves the others', () => {
  const proximos = parametrosWithFilters(new URLSearchParams('fila=f1&contact=Ana&aba=atribuido&busca=456'), { contato: '' });
  assert.equal(proximos.has('contato'), false);
  assert.equal(proximos.toString(), 'fila=f1&aba=atribuido&search=456');
});

test('applying multiple values keeps repeats where the query allows it', () => {
  const proximos = parametrosWithFilters(new URLSearchParams('aba=espera&tag=antiga'), { tag: ['nova', 'urgente'] });
  assert.deepEqual(proximos.getAll('tag'), ['nova', 'urgente']);
  assert.equal(proximos.get('aba'), 'espera');
});

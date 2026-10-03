import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterIds, matchesListFilters, parametersWithFilters, urlForClearFilters } from '../src/lib/filters-monitoring.ts';

test('multiple selection survives submission and reopening, including in old links', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  assert.deepEqual(filterIds([a, `${b},${a}`, 'inválido']), [a, b]);
  const query = parametersWithFilters(new URLSearchParams('aba=espera'), { fila: [a, b] });
  assert.deepEqual(filterIds(query.getAll('fila')), [a, b]);
  assert.deepEqual(filterIds(filterIds(query.getAll('fila')).join(',')), [a, b]);
  assert.deepEqual(filterIds(''), []);
});

test('clearing filters stays on the current bot\'s monitoring', () => {
  assert.equal(
    urlForClearFilters('/fluxo/bot-1/atendimento/monitoramento', { queue: 'fila-1' }),
    '/fluxo/bot-1/atendimento/monitoramento',
  );
});

test('clearing the list leaves remembered queue out of the URL', () => {
  assert.equal(
    urlForClearFilters('/fluxo/bot-1/atendimento/monitoramento', { queue: 'fila-1' }, true),
    '/fluxo/bot-1/atendimento/monitoramento',
  );
});

test('applying a URL filter preserves search, tab and future parameters', () => {
  const current = new URLSearchParams('contato=Ana&status=online&aba=espera&busca=123&extra=x');
  const proximos = parametersWithFilters(current, { contato: 'Bia' });
  assert.equal(proximos.get('contato'), 'Bia');
  for (const key of ['status', 'aba', 'busca', 'extra']) {
    assert.equal(proximos.get(key), current.get(key));
  }
  assert.equal(current.get('contato'), 'Ana');
});

test('clearing only the current filter preserves the others', () => {
  const proximos = parametersWithFilters(new URLSearchParams('status=online&contato=Ana&aba=atribuido&busca=456'), { contato: '' });
  assert.equal(proximos.has('contato'), false);
  assert.equal(proximos.toString(), 'status=online&aba=atribuido&busca=456');
});

test('applying multiple values keeps repeats where the query allows it', () => {
  const proximos = parametersWithFilters(new URLSearchParams('aba=espera&tag=antiga'), { tag: ['nova', 'urgente'] });
  assert.deepEqual(proximos.getAll('tag'), ['nova', 'urgente']);
  assert.equal(proximos.get('aba'), 'espera');
});

test('contact and agent status filter the rows of the detailed list', () => {
  assert.equal(matchesListFilters({ contactName: 'Ana Souza', agentState: 'Online' }, { contact: 'ana', status: 'Online' }), true);
  assert.equal(matchesListFilters({ contactName: 'Bia', agentState: 'Online' }, { contact: 'ana' }), false);
  assert.equal(matchesListFilters({ contactName: 'Ana', agentState: 'Pause' }, { status: 'Online' }), false);
  assert.equal(matchesListFilters({ contactName: 'Ana', agentState: undefined }, { status: 'Online' }), false);
});

test('empty filters let every row through and invisible matches no one yet', () => {
  assert.equal(matchesListFilters({ contactName: 'Ana', agentState: undefined }, {}), true);
  assert.equal(matchesListFilters({ contactName: 'Ana', agentState: 'Online' }, { contact: '  ', status: '' }), true);
  assert.equal(matchesListFilters({ contactName: 'Ana', agentState: 'Online' }, { status: 'Invisible' }), false);
});

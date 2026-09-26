import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GROUPINGS,
  groupingValid,
  agruparHistory,
  alternarTodosVisiveis,
  reconciliarMarcados,
} from '../src/lib/history.ts';
import type { LinhaHistory } from '../src/lib/history.ts';
import { ticketDe } from '../src/lib/monitoring.ts';

/**
 * History's grouping and the ticket number.
 *
 * Both are read by people: grouping decides how many conversations the manager attributes to each queue, and the ticket is what the agent dictates over the phone. Neither one touches the database.
 */

const linha = (parcial: Partial<LinhaHistory> = {}): LinhaHistory => ({
  id: 'a',
  ticket: '#000001',
  contactName: 'Contato',
  queueName: 'Suporte',
  agentName: 'Ana',
  encerradaEm: '2026-09-05T19:22:00.000Z',
  status: 'finalizada',
  esperaSeg: 10,
  firstRespostaSeg: 20,
  attendanceSeg: 30,
  etiquetas: [],
  ...parcial,
});

test('grouping from the URL falls back to "none" when it is not in the catalog', () => {
  /*
   * The value arrives from `searchParams`, meaning from anyone who types into the address bar. Without this filter, a stray value would pass through and `agruparHistorico` would return the list duplicated under a nonexistent key.
   */
  assert.equal(groupingValid('fila'), 'fila');
  assert.equal(groupingValid(undefined), 'nenhum');
  assert.equal(groupingValid(''), 'nenhum');
  assert.equal(groupingValid('atendente; drop'), 'nenhum');
  assert.equal(groupingValid('toString'), 'nenhum');
  for (const a of GROUPINGS) assert.equal(groupingValid(a.chave), a.chave);
});

test('with no grouping, a single group comes out with the entire list', () => {
  const linhas = [linha(), linha({ id: 'b' })];
  const groups = agruparHistory(linhas, 'nenhum');
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.titulo, '');
  assert.equal(groups[0]!.linhas.length, 2);
});

test('by queue, whoever has no queue gets its own group instead of disappearing', () => {
  /*
   * A conversation lost at the root queue has a null `filaNome`. If it doesn't become its own group, the groups' sum falls short of the total, and the manager concludes the day had fewer conversations than it actually did.
   */
  const groups = agruparHistory(
    [linha({ queueName: 'Suporte' }), linha({ id: 'b', queueName: null })],
    'fila',
  );
  assert.deepEqual(groups.map((g) => g.titulo).sort(), ['Sem fila', 'Suporte']);
  assert.equal(
    groups.reduce((s, g) => s + g.linhas.length, 0),
    2,
  );
});

test('the groups come out from largest to smallest', () => {
  /* The order is the screen's answer: the first group is where the volume is. */
  const groups = agruparHistory(
    [
      linha({ agentName: 'Ana' }),
      linha({ id: 'b', agentName: 'Bia' }),
      linha({ id: 'c', agentName: 'Bia' }),
    ],
    'atendente',
  );
  assert.deepEqual(
    groups.map((g) => [g.titulo, g.linhas.length]),
    [
      ['Bia', 2],
      ['Ana', 1],
    ],
  );
});

test('o desfecho vira rótulo em português, e o desconhecido passa cru', () => {
  /*
   * The label is what the manager reads. A new status in the database must not make the group disappear — it shows up under its technical name, which is ugly but visible.
   */
  const groups = agruparHistory(
    [linha({ status: 'abandonada' }), linha({ id: 'b', status: null })],
    'status',
  );
  const titulos = groups.map((g) => g.titulo).sort();
  assert.deepEqual(titulos, ['Abandonada', 'Sem desfecho']);
});

test('by tag, the conversation enters every tag it has', () => {
  /*
   * By design the groups' sum exceeds the total: the question is "how many conversations touched this tag", not "how do I split the total". If someone "fixes" this, the per-tag count starts undercounting.
   */
  const groups = agruparHistory(
    [linha({ etiquetas: ['Elogio', 'Reclamação'] }), linha({ id: 'b', etiquetas: [] })],
    'etiqueta',
  );
  assert.deepEqual(groups.map((g) => g.titulo).sort(), ['Elogio', 'Reclamação', 'Sem etiqueta']);
  assert.equal(
    groups.reduce((s, g) => s + g.linhas.length, 0),
    3,
  );
});

test('agrupar não mexe na lista que recebeu', () => {
  /* The same list feeds the CSV export right after. */
  const linhas = [linha(), linha({ id: 'b' })];
  agruparHistory(linhas, 'fila');
  assert.equal(linhas.length, 2);
});

test('selection discards IDs missing from the visible list without changing the input', () => {
  const original = new Set(['a', 'b', 'c']);
  const atual = reconciliarMarcados(original, ['b', 'd']);
  assert.deepEqual([...atual], ['b']);
  assert.deepEqual([...original], ['a', 'b', 'c']);
  assert.equal(reconciliarMarcados(atual, ['b', 'd']), atual);
});

test('selecionar todos considera somente resultados visíveis', () => {
  const filtrados = ['b', 'd'];
  assert.deepEqual([...alternarTodosVisiveis(new Set(['a', 'b']), filtrados)], filtrados);
  assert.deepEqual([...alternarTodosVisiveis(new Set(['a', 'b', 'd']), filtrados)], []);
  assert.deepEqual([...alternarTodosVisiveis(new Set(['a']), [])], []);
});

test('o ticket sai dos últimos seis do uuid, em maiúsculas e sem hífen', () => {
  /*
   * It's the number the agent reads aloud and the manager pastes into search. If the rule changes, already-dictated tickets stop finding the conversation.
   */
  assert.equal(ticketDe('0191f3aa-77e2-7a1b-9c3d-0000000abc12'), '#0ABC12');
  assert.equal(ticketDe('----------------------------ABCDEF'), '#ABCDEF');
});

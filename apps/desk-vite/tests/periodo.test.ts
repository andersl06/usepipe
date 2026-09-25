import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intervaloDoAtalho, intervaloPersonalizado, timeMedio } from '../src/lib/periodo';
import { agruparContacts } from '../src/lib/contatos';
import { aplicarParametros } from '../src/lib/modelo';
import { readPreferences } from '../src/lib/preferencias';

const agora = new Date(2026, 8, 17, 15, 30);

test('the period shortcuts', () => {
  assert.deepEqual(intervaloDoAtalho('hoje', agora), {
    inicio: new Date(2026, 8, 17, 0, 0, 0, 0),
    fim: agora,
  });
  const ontem = intervaloDoAtalho('ontem', agora);
  assert.equal(ontem.inicio.getDate(), 16);
  assert.equal(ontem.fim.getHours(), 23);
  assert.equal(intervaloDoAtalho('7-dias', agora).inicio.getDate(), 11);
  assert.equal(intervaloDoAtalho('30-dias', agora).inicio.getMonth(), 7);
});

test('o intervalo à mão vira quando invertido e cabe no teto de 90 dias', () => {
  const i = intervaloPersonalizado(new Date(2026, 8, 10), new Date(2026, 8, 1));
  assert.equal(i.inicio.getDate(), 1);
  assert.equal(i.fim.getDate(), 10);
  const longo = intervaloPersonalizado(new Date(2026, 0, 1), new Date(2026, 8, 1));
  assert.ok((longo.fim.getTime() - longo.inicio.getTime()) / 86_400_000 <= 91);
});

test('average time with no value shows a dash, not zero', () => {
  assert.equal(timeMedio(null), '-');
  assert.equal(timeMedio(61), '00:01:01');
});

const c = (id: string, nome: string | null, ultima: string | null) => ({
  id,
  nome,
  telefone: null,
  email: null,
  ultimaInteracaoEm: ultima,
});

test('alphabetical order groups by letter and sends unnamed items to the end', () => {
  const groups = agruparContacts(
    [c('1', null, null), c('2', 'Álvaro', null), c('3', 'Bia', null), c('4', 'ana', null)],
    'alfabetica',
  );
  assert.deepEqual(
    groups.map((g) => g.rotulo),
    ['A', 'B', '#'],
  );
  assert.deepEqual(
    groups[0]?.contacts.map((x) => x.id),
    ['2', '4'],
  );
});

test('last interaction groups by day, most recent first', () => {
  const groups = agruparContacts(
    [
      c('1', 'A', '2026-09-01T10:00:00'),
      c('2', 'B', '2026-09-17T10:00:00'),
      c('3', 'C', '2026-09-17T08:00:00'),
    ],
    'ultima-interacao',
  );
  assert.deepEqual(
    groups.map((g) => g.contacts.map((x) => x.id)),
    [['2', '3'], ['1']],
  );
});

test('template parameters and preferences with a default', () => {
  assert.equal(
    aplicarParametros('Olá {{1}}, seu pedido {{2}}', ['Ana']),
    'Olá Ana, seu pedido {{2}}',
  );
  const prefs = readPreferences((k) => (k === 'desk.pref.continuarOnline' ? '1' : null));
  assert.equal(prefs.continuarOnline, true);
  assert.equal(prefs.corretorOrtografico, true);
});

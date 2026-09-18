import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intervaloDoAtalho, intervaloPersonalizado, tempoMedio } from '../src/lib/periodo';
import { agruparContatos } from '../src/lib/contatos';
import { aplicarParametros } from '../src/lib/modelo';
import { lerPreferencias } from '../src/lib/preferencias';

const agora = new Date(2026, 8, 17, 15, 30);

test('os atalhos de período', () => {
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

test('o tempo médio sem valor é traço, não zero', () => {
  assert.equal(tempoMedio(null), '-');
  assert.equal(tempoMedio(61), '00:01:01');
});

const c = (id: string, nome: string | null, ultima: string | null) => ({
  id,
  nome,
  telefone: null,
  email: null,
  ultimaInteracaoEm: ultima,
});

test('ordem alfabética agrupa pela letra e manda os sem-nome para o fim', () => {
  const grupos = agruparContatos(
    [c('1', null, null), c('2', 'Álvaro', null), c('3', 'Bia', null), c('4', 'ana', null)],
    'alfabetica',
  );
  assert.deepEqual(
    grupos.map((g) => g.rotulo),
    ['A', 'B', '#'],
  );
  assert.deepEqual(
    grupos[0]?.contatos.map((x) => x.id),
    ['2', '4'],
  );
});

test('última interação agrupa por dia, do mais recente', () => {
  const grupos = agruparContatos(
    [
      c('1', 'A', '2026-09-01T10:00:00'),
      c('2', 'B', '2026-09-17T10:00:00'),
      c('3', 'C', '2026-09-17T08:00:00'),
    ],
    'ultima-interacao',
  );
  assert.deepEqual(
    grupos.map((g) => g.contatos.map((x) => x.id)),
    [['2', '3'], ['1']],
  );
});

test('parâmetros do modelo e preferências com padrão', () => {
  assert.equal(
    aplicarParametros('Olá {{1}}, seu pedido {{2}}', ['Ana']),
    'Olá Ana, seu pedido {{2}}',
  );
  const prefs = lerPreferencias((k) => (k === 'desk.pref.continuarOnline' ? '1' : null));
  assert.equal(prefs.continuarOnline, true);
  assert.equal(prefs.corretorOrtografico, true);
});

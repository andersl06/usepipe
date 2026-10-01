import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONFIG_PADRAO,
  configDoRascunho,
  erroDeTags,
  errosDoRascunho,
  rascunhoAlterado,
  rascunhoDe,
  tagsAlteradas,
} from '../src/lib/queue-auto-close.ts';

test('rascunho padrão é válido e não conta como alterado em relação ao padrão', () => {
  const r = rascunhoDe(null);
  assert.deepEqual(errosDoRascunho(r), {});
  assert.equal(rascunhoAlterado(r, null), false);
  assert.equal(rascunhoAlterado({ ...r, tempo: '90' }, null), true);
});

test('tempo: precisa ser inteiro maior que 0 e até 30 dias', () => {
  const r = rascunhoDe(null);
  for (const ruim of ['0', '', 'abc', '1.5', '-3']) assert.ok(errosDoRascunho({ ...r, tempo: ruim }).tempo, ruim);
  assert.ok(errosDoRascunho({ ...r, tempo: '721', unidade: 'horas' }).tempo);
  assert.equal(errosDoRascunho({ ...r, tempo: '720', unidade: 'horas' }).tempo, undefined);
});

test('alerta: mensagem obrigatória e antecedência menor que a inatividade', () => {
  const r = { ...rascunhoDe(null), alertaAtivo: true, tempo: '30' };
  assert.ok(errosDoRascunho(r).alertaMensagem);
  const ok = { ...r, alertaMensagem: 'Ainda aí?', alertaAntecedencia: '5' };
  assert.deepEqual(errosDoRascunho(ok), {});
  assert.ok(errosDoRascunho({ ...ok, alertaAntecedencia: '30' }).alertaAntecedencia);
  assert.ok(errosDoRascunho({ ...ok, alertaAntecedencia: '1', alertaUnidade: 'horas' }).alertaAntecedencia);
  assert.ok(errosDoRascunho({ ...ok, alertaMensagem: '<b>oi</b>' }).alertaMensagem);
  // Alerta desligado não valida os campos dele.
  assert.deepEqual(errosDoRascunho({ ...r, alertaAtivo: false }), {});
});

test('tags de encerramento: ligado exige ao menos uma', () => {
  const r = { ...rascunhoDe(null), tagsAtivo: true };
  assert.ok(errosDoRascunho(r).tags);
  assert.deepEqual(errosDoRascunho({ ...r, tags: ['Inativo'] }), {});
});

test('corpo gravado: desligado limpa mensagem e tags, e carrega o interruptor', () => {
  const r = { ...rascunhoDe(null), tempo: ' 45 ', alertaAtivo: false, alertaMensagem: 'sobra', tagsAtivo: false, tags: ['x'] };
  const c = configDoRascunho(r, true);
  assert.equal(c.ativo, true);
  assert.equal(c.tempo, 45);
  assert.equal(c.alerta.mensagem, '');
  assert.deepEqual(c.tags, { ativo: false, tags: [] });
  assert.equal(configDoRascunho(rascunhoDe(CONFIG_PADRAO), false).ativo, false);
});

test('tags da fila: alteração depende de conteúdo e ordem; limites e HTML são recusados', () => {
  assert.equal(tagsAlteradas(['a', 'b'], ['a', 'b']), false);
  assert.equal(tagsAlteradas(['b', 'a'], ['a', 'b']), true);
  assert.equal(tagsAlteradas([], ['a']), true);
  assert.equal(erroDeTags(['ok']), null);
  assert.ok(erroDeTags(['x'.repeat(41)]));
  assert.ok(erroDeTags(Array.from({ length: 31 }, (_, i) => `t${i}`)));
  assert.ok(erroDeTags(['<i>']));
});

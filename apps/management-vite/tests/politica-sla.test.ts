import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  agruparPoliticas,
  descreverPrazo,
  erroDaMeta,
  melhorUnidade,
  pedidoDePolitica,
  type MetaEmRascunho,
} from '../src/lib/politica-sla.ts';
import type { RegraSlaConfigurada } from '../src/lib/settings.ts';

const linha = (over: Partial<RegraSlaConfigurada>): RegraSlaConfigurada => ({
  id: 'r',
  name: 'P',
  target: 'espera_fila',
  deadlineSeg: 60,
  alertSeg: null,
  scopeType: 'fila',
  scopeId: 'f1',
  scopeName: 'Suporte',
  ativa: true,
  ...over,
});

const desligada: MetaEmRascunho = { ligada: false, valor: '', unidade: 'segundos' };

test('agruparPoliticas junta as linhas de mesmo nome e ordena as metas como a tela', () => {
  const politicas = agruparPoliticas([
    linha({ id: 'a', target: 'resolucao', deadlineSeg: 3600 }),
    linha({ id: 'b', target: 'espera_fila' }),
    linha({ id: 'c', target: 'espera_fila', scopeType: 'tenant', scopeId: null, scopeName: null }),
    linha({ id: 'd', name: 'Outra', target: 'resposta', scopeId: 'f2', scopeName: 'Vendas' }),
  ]);
  assert.equal(politicas.length, 2);
  const [p, outra] = politicas;
  assert.equal(p!.id, 'a');
  assert.equal(p!.padrao, true);
  assert.deepEqual(p!.filas, [{ id: 'f1', name: 'Suporte' }]);
  assert.deepEqual(p!.metas.map((m) => m.sigla), ['TME', 'TMA']);
  assert.deepEqual(outra!.metas.map((m) => m.sigla), ['TMR']);
});

test('melhorUnidade e descreverPrazo escolhem a maior unidade exata', () => {
  assert.deepEqual(melhorUnidade(7200), { valor: 2, unidade: 'horas' });
  assert.deepEqual(melhorUnidade(90), { valor: 90, unidade: 'segundos' });
  assert.deepEqual(melhorUnidade(86_400), { valor: 1, unidade: 'dias' });
  assert.equal(descreverPrazo(3600), '1 hora');
  assert.equal(descreverPrazo(120), '2 minutos');
});

test('erroDaMeta: só vale para meta ligada e respeita o limite de 7 dias', () => {
  assert.equal(erroDaMeta(desligada), null);
  assert.equal(erroDaMeta({ ligada: true, valor: '', unidade: 'minutos' }), 'Campo obrigatório');
  assert.notEqual(erroDaMeta({ ligada: true, valor: '0', unidade: 'minutos' }), null);
  assert.notEqual(erroDaMeta({ ligada: true, valor: '1.5', unidade: 'minutos' }), null);
  assert.notEqual(erroDaMeta({ ligada: true, valor: '8', unidade: 'dias' }), null);
  assert.equal(erroDaMeta({ ligada: true, valor: '7', unidade: 'dias' }), null);
});

test('pedidoDePolitica converte para segundos e recusa rascunho incompleto', () => {
  const metas = {
    espera_fila: { ligada: true, valor: '2', unidade: 'minutos' as const },
    primeira_resposta: desligada,
    resolucao: desligada,
  };
  assert.deepEqual(pedidoDePolitica(' SLA ', false, ['f1'], metas), {
    name: 'SLA',
    padrao: false,
    queueIds: ['f1'],
    metas: { espera_fila: 120 },
  });
  assert.equal(pedidoDePolitica('', false, ['f1'], metas), null);
  assert.equal(pedidoDePolitica('SLA', false, [], metas), null);
  assert.notEqual(pedidoDePolitica('SLA', true, [], metas), null);
  assert.equal(
    pedidoDePolitica('SLA', true, [], { espera_fila: desligada, primeira_resposta: desligada, resolucao: desligada }),
    null,
  );
  assert.equal(
    pedidoDePolitica('SLA', true, [], { ...metas, resolucao: { ligada: true, valor: '', unidade: 'horas' } }),
    null,
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parametrosComFiltros, urlParaLimparFiltros } from '../src/lib/filtros-monitoramento.ts';

test('limpar filtros permanece no monitoramento do bot atual', () => {
  assert.equal(
    urlParaLimparFiltros('/fluxo/bot-1/atendimento/monitoramento', { fila: 'fila-1' }),
    '/fluxo/bot-1/atendimento/monitoramento',
  );
});

test('limpar a lista preserva o filtro de fila da operação', () => {
  assert.equal(
    urlParaLimparFiltros('/fluxo/bot-1/atendimento/monitoramento', { fila: 'fila-1' }, true),
    '/fluxo/bot-1/atendimento/monitoramento?fila=fila-1',
  );
});

test('aplicar uma pílula preserva os demais parâmetros, inclusive busca e aba', () => {
  const atuais = new URLSearchParams('fila=f1&atendente=a1&contato=Ana&status=online&aba=espera&busca=123&extra=x');
  const proximos = parametrosComFiltros(atuais, { atendente: 'a2' });
  assert.equal(proximos.get('atendente'), 'a2');
  for (const chave of ['fila', 'contato', 'status', 'aba', 'busca', 'extra']) {
    assert.equal(proximos.get(chave), atuais.get(chave));
  }
  assert.equal(atuais.get('atendente'), 'a1');
});

test('limpar somente o filtro corrente preserva os outros', () => {
  const proximos = parametrosComFiltros(new URLSearchParams('fila=f1&contato=Ana&aba=atribuido&busca=456'), { contato: '' });
  assert.equal(proximos.has('contato'), false);
  assert.equal(proximos.toString(), 'fila=f1&aba=atribuido&busca=456');
});

test('aplicar múltiplos valores mantém repetições onde a query permite', () => {
  const proximos = parametrosComFiltros(new URLSearchParams('aba=espera&tag=antiga'), { tag: ['nova', 'urgente'] });
  assert.deepEqual(proximos.getAll('tag'), ['nova', 'urgente']);
  assert.equal(proximos.get('aba'), 'espera');
});

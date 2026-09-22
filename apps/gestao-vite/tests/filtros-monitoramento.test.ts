import assert from 'node:assert/strict';
import { test } from 'node:test';
import { urlParaLimparFiltros } from '../src/lib/filtros-monitoramento.ts';

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

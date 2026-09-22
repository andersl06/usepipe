import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ItemDaConversa } from '@pipe/contracts';
import { intervaloDaEntrega } from '../src/lib/intervalo-entrega';

function mensagem(estadoEntrega: string | null): ItemDaConversa {
  return {
    genero: 'mensagem',
    id: 'm1',
    criadaEm: '2026-09-21T21:51:03.716Z',
    direcao: 'saida',
    tipo: 'texto',
    conteudo: 'Teste',
    estadoEntrega,
    erroCodigo: null,
    erroTexto: null,
    lidaEm: null,
    entregueEm: null,
    deRespostaPronta: false,
    deTemplate: false,
  };
}

test('consulta a conversa rapidamente enquanto uma mensagem está em trânsito', () => {
  assert.equal(intervaloDaEntrega([mensagem('pendente')]), 1_000);
  assert.equal(intervaloDaEntrega([mensagem('enviando')]), 1_000);
  assert.equal(intervaloDaEntrega([mensagem('enviada')]), 15_000);
  assert.equal(intervaloDaEntrega([mensagem('falhou')]), 15_000);
});

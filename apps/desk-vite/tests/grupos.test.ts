import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ItemDaConversa } from '@pipe/contracts';
import { agrupar, sinalDeEntrega, type Mensagem } from '../src/lib/grupos';

function msg(
  id: string,
  direcao: 'entrada' | 'saida',
  estadoEntrega: string | null = 'entregue',
): Mensagem {
  return {
    genero: 'mensagem',
    id,
    criadaEm: '2026-09-17T10:00:00Z',
    direcao,
    tipo: 'texto',
    conteudo: id,
    estadoEntrega,
    erroCodigo: null,
    erroTexto: null,
    lidaEm: null,
    entregueEm: null,
    deRespostaPronta: false,
    deTemplate: false,
  };
}

test('mensagens seguidas do mesmo lado formam um grupo; a nota quebra', () => {
  const nota: ItemDaConversa = {
    genero: 'nota',
    id: 'n',
    criadaEm: '2026-09-17T10:00:00Z',
    corpo: 'x',
    autor: null,
  };
  const grupos = agrupar([
    msg('1', 'entrada'),
    msg('2', 'entrada'),
    msg('3', 'saida'),
    nota,
    msg('4', 'saida'),
  ]);
  assert.deepEqual(
    grupos.map((g) => (g.genero === 'nota' ? 'nota' : `${g.direcao}:${g.mensagens.length}`)),
    ['entrada:2', 'saida:1', 'nota', 'saida:1'],
  );
});

test('o sinal de entrega é o do último balão', () => {
  assert.equal(sinalDeEntrega([msg('1', 'saida', 'lida'), msg('2', 'saida', 'enviada')]), 'check');
  assert.equal(sinalDeEntrega([msg('1', 'saida', 'lida')]), 'lida');
  assert.equal(sinalDeEntrega([msg('1', 'saida', 'pendente')]), 'relogio');
  assert.equal(sinalDeEntrega([msg('1', 'saida', 'falhou')]), 'erro');
  assert.equal(sinalDeEntrega([]), null);
});

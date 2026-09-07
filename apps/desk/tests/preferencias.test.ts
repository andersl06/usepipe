import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  comoTexto,
  lerValor,
  nomeDaChave,
  padroes,
  PREFERENCIAS,
  secoes,
} from '../src/lib/preferencias.ts';

test('cada preferência tem seção, rótulo e ajuda — nenhuma nasce sem explicação', () => {
  for (const p of PREFERENCIAS) {
    assert.ok(p.secao.length > 0, `${p.chave} sem seção`);
    assert.ok(p.rotulo.length > 0, `${p.chave} sem rótulo`);
    assert.ok(p.ajuda.length > 0, `${p.chave} sem ajuda`);
  }
});

test('as seções saem sem repetir e na ordem de declaração — a ordem é regra', () => {
  assert.deepEqual(secoes(), [
    'Alertas sonoros',
    'Notificações do navegador',
    'Ao fechar',
    'Corretor de textos',
  ]);
});

test('o padrão avisa de ticket novo e corrige o texto, e não faz o resto', () => {
  assert.deepEqual(padroes(), {
    somTicket: true,
    somMensagem: false,
    notificacaoNavegador: false,
    manterOnline: false,
    corretor: true,
  });
});

test('só "sim" e "nao" são resposta; o resto cai no padrão da preferência', () => {
  assert.equal(lerValor('somTicket', 'sim'), true);
  assert.equal(lerValor('somTicket', 'nao'), false);
  // Nunca guardado, valor de outra versão, ou lixo digitado no console: o
  // alerta de ticket novo continua ligado em vez de sumir em silêncio.
  assert.equal(lerValor('somTicket', null), true);
  assert.equal(lerValor('somTicket', 'true'), true);
  assert.equal(lerValor('somTicket', ''), true);
  // E o que nasce desligado continua desligado pelo mesmo caminho.
  assert.equal(lerValor('manterOnline', 'lixo'), false);
});

test('o que é gravado volta a ser lido igual', () => {
  for (const ligada of [true, false]) {
    assert.equal(lerValor('corretor', comoTexto(ligada)), ligada);
  }
});

test('a chave de armazenamento é prefixada, para não colidir com outro app', () => {
  assert.equal(nomeDaChave('manterOnline'), 'pipe.desk.pref.manterOnline');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  campoValido,
  descreverRegra,
  destinationQueue,
  ordenarRegras,
  regrasInalcancaveis,
  type QueueRule,
} from '../src/lib/regra-fila.ts';

/**
 * A regra de entrada — §8 da spec de métricas.
 *
 * O que decide aqui é para qual fila a conversa cai, e errar significa mandar
 * o cliente para a equipe errada em silêncio: regra que não casa não dá erro.
 * Por isso o teste cobre as duas decisões que a spec toma contra a Blip — a
 * ORDEM de avaliação e a COMPOSIÇÃO com E/OU — e não os operadores, que são do
 * `@pipe/core` e já têm teste lá.
 */

const regra = (parcial: Partial<QueueRule> = {}): QueueRule => ({
  id: 'r1',
  nome: 'Regra 1',
  order: 0,
  combinador: 'e',
  queueDestinationId: 'f1',
  queueDestinationName: 'Suporte',
  active: true,
  conditions: [{ campo: 'mensagem', operador: 'contem', value: 'boleto' }],
  ...parcial,
});

const context = {
  mensagem: 'Preciso da segunda via do BOLETO',
  contato: { nome: 'Ana Maria', email: 'ana@empresa.com.br', atributos: { plano: 'ouro' } },
};

test('a primeira regra que casa vence, e a ordem é a da tela', () => {
  const casou = destinationQueue(
    [
      regra({ id: 'b', order: 2, queueDestinationId: 'f-financeiro', queueDestinationName: 'Financeiro' }),
      regra({ id: 'a', order: 1, queueDestinationId: 'f-cobranca', queueDestinationName: 'Cobrança' }),
    ],
    context,
  );
  assert.equal(casou?.queueDestinationName, 'Cobrança');
});

test('empate de ordem desempata por identificador, e não pela ordem do banco', () => {
  const ordenadas = ordenarRegras([
    regra({ id: 'zz', order: 0 }),
    regra({ id: 'aa', order: 0 }),
    regra({ id: 'mm', order: 0 }),
  ]);
  assert.deepEqual(
    ordenadas.map((r) => r.id),
    ['aa', 'mm', 'zz'],
  );
});

test('nenhuma regra casada devolve nulo — a conversa segue para a fila padrão', () => {
  assert.equal(destinationQueue([regra()], { message: 'quero cancelar' }), null);
});

test('regra desativada não é avaliada, mesmo casando', () => {
  assert.equal(destinationQueue([regra({ active: false })], context), null);
});

test('combinador E exige todas as condições', () => {
  const todas = regra({
    combinador: 'e',
    conditions: [
      { campo: 'mensagem', operador: 'contem', value: 'boleto' },
      { campo: 'contato.email', operador: 'contem', value: '@empresa' },
    ],
  });
  assert.ok(destinationQueue([todas], context));

  const uma = regra({
    combinador: 'e',
    conditions: [
      { campo: 'mensagem', operador: 'contem', value: 'boleto' },
      { campo: 'contato.email', operador: 'contem', value: '@gmail' },
    ],
  });
  assert.equal(destinationQueue([uma], context), null);
});

test('combinador OU basta uma condição', () => {
  const ou = regra({
    combinador: 'ou',
    conditions: [
      { campo: 'mensagem', operador: 'contem', value: 'cancelamento' },
      { campo: 'contato.email', operador: 'contem', value: '@empresa' },
    ],
  });
  assert.ok(destinationQueue([ou], context));
});

test('campo extra do contato é lido pelo caminho com ponto', () => {
  const extra = regra({
    conditions: [{ campo: 'contato.atributos.plano', operador: 'igual', value: 'Ouro' }],
  });
  // Caixa e acento não contam: a normalização é a do `@pipe/core`.
  assert.ok(destinationQueue([extra], context));
});

test('regra ativa sem condição nunca casa, e é apontada como inalcançável', () => {
  const vazia = regra({ conditions: [] });
  assert.equal(destinationQueue([vazia], context), null);
  assert.deepEqual(regrasInalcancaveis([vazia]), ['r1']);
});

test('regra idêntica abaixo de outra é inalcançável — a de cima vence sempre', () => {
  const mortas = regrasInalcancaveis([
    regra({ id: 'topo', order: 1 }),
    regra({ id: 'sombra', order: 2 }),
    regra({
      id: 'outra',
      order: 3,
      conditions: [{ campo: 'mensagem', operador: 'contem', value: 'nota' }],
    }),
  ]);
  assert.deepEqual(mortas, ['sombra']);
});

test('campo livre só passa com chave de atributo utilizável', () => {
  assert.ok(campoValido('mensagem'));
  assert.ok(campoValido('contato.atributos.plano'));
  assert.equal(campoValido('contato.atributos.'), false);
  assert.equal(campoValido('contato.telefone_do_avô'), false);
});

test('a regra sai por extenso com o combinador visível', () => {
  assert.equal(
    descreverRegra(
      regra({
        combinador: 'ou',
        conditions: [
          { campo: 'mensagem', operador: 'contem', value: 'boleto' },
          { campo: 'contato.atributos.plano', operador: 'igual', value: 'ouro' },
        ],
      }),
    ),
    'Conteúdo da mensagem contém “boleto” OU Campo extra “plano” é igual a “ouro”',
  );
});

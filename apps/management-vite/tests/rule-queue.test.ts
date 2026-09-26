import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  campoValido,
  descreverRegra,
  destinationQueue,
  ordenarRegras,
  regrasInalcancaveis,
  type QueueRule,
} from '../src/lib/rule-queue.ts';

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
  message: 'Preciso da segunda via do BOLETO',
  contact: { nome: 'Ana Maria', email: 'ana@empresa.com.br', atributos: { plano: 'ouro' } },
};

test('the first matching rule wins, and the order is the one on the screen', () => {
  const casou = destinationQueue(
    [
      regra({ id: 'b', order: 2, queueDestinationId: 'f-financeiro', queueDestinationName: 'Financeiro' }),
      regra({ id: 'a', order: 1, queueDestinationId: 'f-cobranca', queueDestinationName: 'Cobrança' }),
    ],
    context,
  );
  assert.equal(casou?.queueDestinationName, 'Cobrança');
});

test('an order tie is broken by identifier, not by the database order', () => {
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

test('no matching rule returns null — the conversation goes to the default queue', () => {
  assert.equal(destinationQueue([regra()], { message: 'quero cancelar' }), null);
});

test('regra desativada não é avaliada, mesmo casando', () => {
  assert.equal(destinationQueue([regra({ active: false })], context), null);
});

test('the AND combinator requires every condition', () => {
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

test('the OR combinator only needs one condition', () => {
  const ou = regra({
    combinador: 'ou',
    conditions: [
      { campo: 'mensagem', operador: 'contem', value: 'cancelamento' },
      { campo: 'contato.email', operador: 'contem', value: '@empresa' },
    ],
  });
  assert.ok(destinationQueue([ou], context));
});

test('the contact\'s extra field is read via a dotted path', () => {
  const extra = regra({
    conditions: [{ campo: 'contato.atributos.plano', operador: 'igual', value: 'Ouro' }],
  });
  // Caixa e acento não contam: a normalização é a do `@pipe/core`.
  assert.ok(destinationQueue([extra], context));
});

test('an active rule with no condition never matches, and is flagged as unreachable', () => {
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

test('a free-form field only passes with a usable attribute key', () => {
  assert.ok(campoValido('mensagem'));
  assert.ok(campoValido('contato.atributos.plano'));
  assert.equal(campoValido('contato.atributos.'), false);
  assert.equal(campoValido('contato.telefone_do_avô'), false);
});

test('the rule is spelled out in full with the combinator visible', () => {
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

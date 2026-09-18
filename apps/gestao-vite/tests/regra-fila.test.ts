import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  campoValido,
  descreverRegra,
  filaDeDestino,
  ordenarRegras,
  regrasInalcancaveis,
  type RegraDeFila,
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

const regra = (parcial: Partial<RegraDeFila> = {}): RegraDeFila => ({
  id: 'r1',
  nome: 'Regra 1',
  ordem: 0,
  combinador: 'e',
  filaDestinoId: 'f1',
  filaDestinoNome: 'Suporte',
  ativa: true,
  condicoes: [{ campo: 'mensagem', operador: 'contem', valor: 'boleto' }],
  ...parcial,
});

const contexto = {
  mensagem: 'Preciso da segunda via do BOLETO',
  contato: { nome: 'Ana Maria', email: 'ana@empresa.com.br', atributos: { plano: 'ouro' } },
};

test('a primeira regra que casa vence, e a ordem é a da tela', () => {
  const casou = filaDeDestino(
    [
      regra({ id: 'b', ordem: 2, filaDestinoId: 'f-financeiro', filaDestinoNome: 'Financeiro' }),
      regra({ id: 'a', ordem: 1, filaDestinoId: 'f-cobranca', filaDestinoNome: 'Cobrança' }),
    ],
    contexto,
  );
  assert.equal(casou?.filaDestinoNome, 'Cobrança');
});

test('empate de ordem desempata por identificador, e não pela ordem do banco', () => {
  const ordenadas = ordenarRegras([
    regra({ id: 'zz', ordem: 0 }),
    regra({ id: 'aa', ordem: 0 }),
    regra({ id: 'mm', ordem: 0 }),
  ]);
  assert.deepEqual(
    ordenadas.map((r) => r.id),
    ['aa', 'mm', 'zz'],
  );
});

test('nenhuma regra casada devolve nulo — a conversa segue para a fila padrão', () => {
  assert.equal(filaDeDestino([regra()], { mensagem: 'quero cancelar' }), null);
});

test('regra desativada não é avaliada, mesmo casando', () => {
  assert.equal(filaDeDestino([regra({ ativa: false })], contexto), null);
});

test('combinador E exige todas as condições', () => {
  const todas = regra({
    combinador: 'e',
    condicoes: [
      { campo: 'mensagem', operador: 'contem', valor: 'boleto' },
      { campo: 'contato.email', operador: 'contem', valor: '@empresa' },
    ],
  });
  assert.ok(filaDeDestino([todas], contexto));

  const uma = regra({
    combinador: 'e',
    condicoes: [
      { campo: 'mensagem', operador: 'contem', valor: 'boleto' },
      { campo: 'contato.email', operador: 'contem', valor: '@gmail' },
    ],
  });
  assert.equal(filaDeDestino([uma], contexto), null);
});

test('combinador OU basta uma condição', () => {
  const ou = regra({
    combinador: 'ou',
    condicoes: [
      { campo: 'mensagem', operador: 'contem', valor: 'cancelamento' },
      { campo: 'contato.email', operador: 'contem', valor: '@empresa' },
    ],
  });
  assert.ok(filaDeDestino([ou], contexto));
});

test('campo extra do contato é lido pelo caminho com ponto', () => {
  const extra = regra({
    condicoes: [{ campo: 'contato.atributos.plano', operador: 'igual', valor: 'Ouro' }],
  });
  // Caixa e acento não contam: a normalização é a do `@pipe/core`.
  assert.ok(filaDeDestino([extra], contexto));
});

test('regra ativa sem condição nunca casa, e é apontada como inalcançável', () => {
  const vazia = regra({ condicoes: [] });
  assert.equal(filaDeDestino([vazia], contexto), null);
  assert.deepEqual(regrasInalcancaveis([vazia]), ['r1']);
});

test('regra idêntica abaixo de outra é inalcançável — a de cima vence sempre', () => {
  const mortas = regrasInalcancaveis([
    regra({ id: 'topo', ordem: 1 }),
    regra({ id: 'sombra', ordem: 2 }),
    regra({
      id: 'outra',
      ordem: 3,
      condicoes: [{ campo: 'mensagem', operador: 'contem', valor: 'nota' }],
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
        condicoes: [
          { campo: 'mensagem', operador: 'contem', valor: 'boleto' },
          { campo: 'contato.atributos.plano', operador: 'igual', valor: 'ouro' },
        ],
      }),
    ),
    'Conteúdo da mensagem contém “boleto” OU Campo extra “plano” é igual a “ouro”',
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  escreverFilters,
  filterValid,
  readFilters,
  filterRotulo,
  WITHOUT_VALUE,
} from '../src/lib/leads-visao.ts';

/**
 * A régua do filtro por coluna.
 *
 * O filtro é o único parâmetro da listagem que vem com nome VARIÁVEL na URL, e
 * é por isso que ele precisa de teste: `aba` e `dir` só podem estar certos ou
 * ausentes, mas `f.qualquercoisa` é o que alguém digita na barra de endereço.
 *
 * O que se protege aqui:
 *   1. só coluna do catálogo vira filtro — nome de coluna não vem da tela;
 *   2. ida e volta pela URL não perde nem inventa filtro, que é o que faz a
 *      visão salva continuar valendo depois de compartilhada.
 */

test('só as colunas do catálogo filtram', () => {
  assert.ok(filterValid('origem'));
  assert.ok(filterValid('proprietario'));
  for (const fora of ['score', 'dias', 'tenant_id', 'lead', 'toString', '']) {
    assert.equal(filterValid(fora), false, `${fora} não pode filtrar`);
  }
});

test('o que não é `f.` da lista é ignorado na leitura', () => {
  const lido = readFilters({
    aba: 'novos',
    q: 'ana',
    origem: 'não conta, falta o prefixo',
    'f.origem': 'Anúncio Meta',
    'f.tenant_id': 'tentativa',
    'f.faixa': '',
  });
  assert.deepEqual(lido, { origem: 'Anúncio Meta' });
});

test('parâmetro repetido: o primeiro vale, e o resto não vira segundo filtro', () => {
  assert.deepEqual(readFilters({ 'f.fase': ['Proposta', 'Fechamento'] }), { fase: 'Proposta' });
});

test('ida e volta pela URL preserva o filtro, inclusive o de valor em branco', () => {
  const filters = { origem: 'Indicação', proprietario: WITHOUT_VALUE };
  const p = escreverFilters(new URLSearchParams({ aba: 'todos' }), filters);
  assert.equal(p.get('aba'), 'todos', 'o resto da consulta não pode ser atropelado');
  assert.deepEqual(readFilters(Object.fromEntries(p)), filters);
});

test('tirar um filtro apaga o parâmetro dele, e não o deixa vazio na URL', () => {
  const p = escreverFilters(new URLSearchParams('aba=todos&f.origem=Indica%C3%A7%C3%A3o'), {});
  assert.equal(p.has('f.origem'), false);
  assert.equal(p.toString(), 'aba=todos');
});

test('o chip diz a coluna e o valor, e "em branco" tem nome de gente', () => {
  assert.equal(filterRotulo('origem', 'Indicação'), 'Origem: Indicação');
  assert.equal(filterRotulo('proprietario', WITHOUT_VALUE), 'Proprietário: em branco');
});

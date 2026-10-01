import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAMPO_EXTRA,
  condicaoDePriorizacao,
  condicoesGravaveis,
  lerCondicaoDePriorizacao,
  lerEmails,
  proximoNomeDeRegra,
  rascunhoDeCondicao,
  resolverEmails,
} from '../src/lib/fila-cartoes.ts';

test('condições: extra ganha o prefixo e rascunho incompleto não grava', () => {
  const extra = { campo: CAMPO_EXTRA, chave: 'plano', operador: 'igual' as const, valor: ' ouro ' };
  assert.deepEqual(condicoesGravaveis([extra]), [
    { campo: 'contato.atributos.plano', operador: 'igual', valor: 'ouro' },
  ]);
  assert.equal(condicoesGravaveis([{ ...extra, chave: 'a b' }]), null);
  assert.equal(condicoesGravaveis([{ ...extra, valor: ' ' }]), null);
});

test('condições: ida e volta do campo extra', () => {
  const r = rascunhoDeCondicao('contato.atributos.plano', 'igual', 'ouro');
  assert.deepEqual(r, { campo: CAMPO_EXTRA, chave: 'plano', operador: 'igual', valor: 'ouro' });
  assert.equal(rascunhoDeCondicao('mensagem', 'xyz', 'a').operador, 'contem');
});

test('priorização: sem aplicar condições grava {} e lê de volta', () => {
  assert.deepEqual(
    condicaoDePriorizacao(false, 'e', [{ campo: 'mensagem', operador: 'contem', valor: 'a' }]),
    {},
  );
  const gravada = condicaoDePriorizacao(true, 'ou', [
    { campo: 'mensagem', operador: 'contem', valor: 'a' },
  ]);
  assert.equal(lerCondicaoDePriorizacao(gravada)?.combinador, 'ou');
  assert.equal(lerCondicaoDePriorizacao({}), null);
});

test('nome padrão da regra pula nomes já usados', () => {
  assert.equal(proximoNomeDeRegra([]), 'Regra 1');
  assert.equal(proximoNomeDeRegra(['Regra 2']), 'Regra 3');
});

test('e-mails em lote: separadores, minúsculas e sem repetição', () => {
  assert.deepEqual(lerEmails('A@x.com, b@x.com;a@x.com\n c@x.com '), [
    'a@x.com',
    'b@x.com',
    'c@x.com',
  ]);
});

test('e-mails em lote: recusa sem conta, inválido, já na fila e desativado; não cria ninguém', () => {
  const usuarios = [
    { id: 'u1', email: 'Ana@x.com', active: true },
    { id: 'u2', email: 'bia@x.com', active: true },
    { id: 'u3', email: 'cris@x.com', active: false },
  ];
  const r = resolverEmails(
    ['ana@x.com', 'bia@x.com', 'cris@x.com', 'fora@outro.com', 'sem-arroba'],
    usuarios,
    new Set(['u2']),
  );
  assert.deepEqual(r.achados, [{ email: 'ana@x.com', userId: 'u1' }]);
  assert.deepEqual(
    r.recusados.map((x) => x.email),
    ['bia@x.com', 'cris@x.com', 'fora@outro.com', 'sem-arroba'],
  );
  assert.match(r.recusados[2]?.motivo ?? '', /não tem conta/);
});

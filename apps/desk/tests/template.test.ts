import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aplicarVariaveis, renderizarTemplate } from '../src/lib/template.ts';
import type { VariaveisDoContato } from '../src/lib/template.ts';

/**
 * As duas numerações de variável.
 *
 * Vale um teste porque o erro aqui SAI PARA O CLIENTE: até esta correção o
 * Desk gravava o corpo do template cru, e a mensagem que o cliente receberia
 * era literalmente "Olá {{1}}".
 */

const VARIAVEIS: VariaveisDoContato = {
  'contato.nome': 'Marcelo',
  'contato.email': 'marcelo@exemplo.com.br',
  'contato.telefone': '+5531994714471',
  'atendente.nome': 'Ana Ribeiro',
  'atendente.primeiro_nome': 'Ana',
  'atendente.email': 'ana@demo.pipe.app',
};

test('template resolve as posições pelos nomes da coluna `variaveis`', () => {
  const rendido = renderizarTemplate(
    'Olá {{1}}, aqui é {{2}} da Pipe.',
    ['contato.nome', 'atendente.primeiro_nome'],
    VARIAVEIS,
  );
  assert.equal(rendido.corpo, 'Olá Marcelo, aqui é Ana da Pipe.');
  assert.deepEqual(rendido.faltando, []);
});

test('variável que a tela não sabe preencher é reportada, e o corpo não mente', () => {
  const rendido = renderizarTemplate(
    'Olá {{1}}, confirmando para {{2}}.',
    ['contato.nome', 'data'],
    VARIAVEIS,
  );
  assert.deepEqual(rendido.faltando, ['data']);
  // A posição não resolvida continua visível: é o que o botão desabilitado explica.
  assert.ok(rendido.corpo.includes('{{2}}'));
});

test('posição sem nome cadastrado não vira palpite', () => {
  const rendido = renderizarTemplate('Oi {{1}} e {{2}}', ['contato.nome'], VARIAVEIS);
  assert.deepEqual(rendido.faltando, ['posição 2']);
});

test('template sem variável passa inteiro, com `variaveis` nulo', () => {
  const rendido = renderizarTemplate('Bom dia!', null, VARIAVEIS);
  assert.equal(rendido.corpo, 'Bom dia!');
  assert.deepEqual(rendido.faltando, []);
});

test('resposta pronta usa o NOME, não a posição', () => {
  assert.equal(
    aplicarVariaveis('Olá {{ contato.nome }}, é a {{atendente.primeiro_nome}}.', VARIAVEIS),
    'Olá Marcelo, é a Ana.',
  );
});

test('nome desconhecido em resposta pronta fica como está, sem virar "undefined"', () => {
  assert.equal(aplicarVariaveis('Seu {{contato.cpf}}', VARIAVEIS), 'Seu {{contato.cpf}}');
});

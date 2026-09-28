import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newBlock } from '../src/pages/builder/model.ts';
import type { Block } from '../src/pages/builder/model.ts';
import { adicionarConteudo, novoTexto } from '../src/pages/builder/conteudo.ts';
import { adicionarSaida } from '../src/pages/builder/conditions.ts';
import { adicionarAcao, comCampo, comTitulo, novaAcao } from '../src/pages/builder/actions-of-block.ts';
import {
  SEARCH_DEBOUNCE_MS,
  isSearchDimming,
  matchBlock,
  parseSearch,
  searchMatches,
} from '../src/pages/builder/search.ts';

/**
 * Blip search covers title, tags, output-condition variable/values, action title/fields and
 * content text, each reachable both unprefixed and through its `title:`/`tags:`/`output:`/
 * `actions:`/`content:` prefix — never the block id.
 */

function blocoComTag(id: string, rotulo: string): Block {
  const base = newBlock({}, { top: 0, left: 0 }, id);
  return { ...base, $tags: [{ label: rotulo, color: '#ff961e' }] };
}

function blocoComSaida(id: string, variable: string, values: string[]): Block {
  const base = newBlock({}, { top: 0, left: 0 }, id);
  const r = adicionarSaida(base, {
    $id: `${id}-saida`,
    typeOfStateId: 'state',
    conditions: [{ source: 'context', variable, comparison: 'equals', values }],
  });
  assert.equal(r.ok, true);
  return r.ok ? r.block : base;
}

function blocoComAcao(id: string, titulo: string, campoValor: string): Block {
  const base = newBlock({}, { top: 0, left: 0 }, id);
  const acao = comCampo(comTitulo(novaAcao('SetVariable', `${id}-acao`), titulo), 'value', campoValor);
  const r = adicionarAcao(base, '$enteringCustomActions', acao);
  assert.equal(r.ok, true);
  return r.ok ? r.block : base;
}

function blocoComConteudo(id: string, texto: string): Block {
  const base = newBlock({}, { top: 0, left: 0 }, id);
  const r = adicionarConteudo(base, novoTexto(texto, `${id}-conteudo`));
  assert.equal(r.ok, true);
  return r.ok ? r.block : base;
}

test('parseSearch: prefixo reconhecido, normalizado sem acento e minúsculo', () => {
  assert.deepEqual(parseSearch('title: Início'), { campo: 'title', termo: 'inicio' });
  assert.deepEqual(parseSearch('tags:VIP'), { campo: 'tags', termo: 'vip' });
  assert.deepEqual(parseSearch('content: Olá'), { campo: 'content', termo: 'ola' });
  assert.deepEqual(parseSearch('actions: Redirecionar'), { campo: 'actions', termo: 'redirecionar' });
  assert.deepEqual(parseSearch('output: status'), { campo: 'output', termo: 'status' });
});

test('parseSearch: sem prefixo, espaços extras ignorados', () => {
  assert.deepEqual(parseSearch('  Olá   Mundo  '), { campo: null, termo: 'ola mundo' });
  assert.deepEqual(parseSearch(''), { campo: null, termo: '' });
});

test('matchBlock: sem prefixo casa por título', () => {
  const bloco = { ...newBlock({}, { top: 0, left: 0 }, 'b1'), $title: 'Menu Início' };
  assert.equal(matchBlock(bloco, parseSearch('inicio')), true);
  assert.equal(matchBlock(bloco, parseSearch('zzzz')), false);
});

test('matchBlock: sem prefixo casa por etiqueta', () => {
  const bloco = blocoComTag('b1', 'Importante');
  assert.equal(matchBlock(bloco, parseSearch('importante')), true);
});

test('matchBlock: sem prefixo casa por variável e valor da condição de saída', () => {
  const bloco = blocoComSaida('b1', 'statusPedido', ['aprovado']);
  assert.equal(matchBlock(bloco, parseSearch('statusPedido')), true);
  assert.equal(matchBlock(bloco, parseSearch('aprovado')), true);
});

test('matchBlock: sem prefixo casa por título e campo das ações', () => {
  const bloco = blocoComAcao('b1', 'Guardar CPF', 'contexto.cpf');
  assert.equal(matchBlock(bloco, parseSearch('guardar cpf')), true);
  assert.equal(matchBlock(bloco, parseSearch('contexto.cpf')), true);
});

test('matchBlock: sem prefixo casa por texto do conteúdo', () => {
  const bloco = blocoComConteudo('b1', 'Olá, tudo bem?');
  assert.equal(matchBlock(bloco, parseSearch('tudo bem')), true);
});

test('matchBlock: nunca casa só pelo id', () => {
  const bloco = newBlock({}, { top: 0, left: 0 }, 'ccpf100_menu_unico');
  assert.equal(matchBlock(bloco, parseSearch('ccpf100_menu_unico')), false);
});

test('matchBlock: com prefixo, casa só no campo indicado', () => {
  const bloco = { ...blocoComTag('b1', 'VIP'), $title: 'VIP no título' };
  assert.equal(matchBlock(bloco, parseSearch('tags:vip')), true);
  assert.equal(matchBlock(bloco, parseSearch('title:vip')), true);
  // O título contém "VIP", mas o prefixo `tags:` só olha $tags — aqui casa pela etiqueta, não pelo título.
  const soTitulo = { ...newBlock({}, { top: 0, left: 0 }, 'b2'), $title: 'VIP no título' };
  assert.equal(matchBlock(soTitulo, parseSearch('tags:vip')), false);
});

test('matchBlock: com prefixo actions:/content:/output: restringe o campo', () => {
  const comAcao = blocoComAcao('b1', 'Guardar CPF', 'contexto.cpf');
  const comConteudo = blocoComConteudo('b2', 'Guardar CPF na tela');
  assert.equal(matchBlock(comAcao, parseSearch('actions:guardar cpf')), true);
  assert.equal(matchBlock(comConteudo, parseSearch('actions:guardar cpf')), false);
  assert.equal(matchBlock(comConteudo, parseSearch('content:guardar cpf')), true);
  assert.equal(matchBlock(comAcao, parseSearch('content:guardar cpf')), false);

  const comSaida = blocoComSaida('b3', 'statusPedido', ['aprovado']);
  assert.equal(matchBlock(comSaida, parseSearch('output:aprovado')), true);
  assert.equal(matchBlock(comConteudo, parseSearch('output:aprovado')), false);
});

test('searchMatches: termo vazio não pesquisa (null)', () => {
  const mapa = { b1: newBlock({}, { top: 0, left: 0 }, 'b1') };
  assert.equal(searchMatches(mapa, ''), null);
  assert.equal(searchMatches(mapa, '   '), null);
});

test('searchMatches: termo sem resultado devolve Set vazio', () => {
  const mapa = { b1: newBlock({}, { top: 0, left: 0 }, 'b1') };
  const resultado = searchMatches(mapa, 'zzzz');
  assert.notEqual(resultado, null);
  assert.equal(resultado?.size, 0);
});

test('searchMatches: devolve só os ids que casam', () => {
  const bate = { ...newBlock({}, { top: 0, left: 0 }, 'bate'), $title: 'Início do fluxo' };
  const naoBate = { ...newBlock({}, { top: 0, left: 0 }, 'nao-bate'), $title: 'Outro bloco' };
  const mapa = { bate: bate, [naoBate.id]: naoBate };
  const resultado = searchMatches(mapa, 'title:inicio');
  assert.deepEqual([...(resultado ?? [])], ['bate']);
});

test('SEARCH_DEBOUNCE_MS: igual ao debounce(makeSearch, 500) da Blip', () => {
  assert.equal(SEARCH_DEBOUNCE_MS, 500);
});

test('isSearchDimming: só esmaece com pelo menos um bloco encontrado (Blip searchedStates.length > 0)', () => {
  const bate = { ...newBlock({}, { top: 0, left: 0 }, 'bate'), $title: 'Início' };
  const outro = { ...newBlock({}, { top: 0, left: 0 }, 'outro'), $title: 'Outro' };
  const mapa = { bate, outro };
  assert.equal(isSearchDimming(searchMatches(mapa, '')), false);
  assert.equal(isSearchDimming(searchMatches(mapa, 'zzzz')), false);
  const achados = searchMatches(mapa, 'inicio');
  assert.equal(isSearchDimming(achados), true);
  assert.equal(achados?.has('bate'), true);
  assert.equal(achados?.has('outro'), false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { collectKeys, codePropertyNames } from './jsonb-keys.ts';

test('collectKeys junta chaves aninhadas e desce em array', () => {
  const doc = { a: { b: 1, c: [{ d: 2 }] } };
  assert.deepEqual(collectKeys(doc).sort(), ['a', 'b', 'c', 'd']);
});

test('collectKeys exclui filhos de caminho opaco mas mantém a própria chave', () => {
  const doc = { a: { b: 1, c: [{ d: 2 }] }, vars: { x: 1 } };
  const chaves = collectKeys(doc, ['$.vars.*']).sort();
  assert.deepEqual(chaves, ['a', 'b', 'c', 'd', 'vars']);
});

test('collectKeys com caminho opaco aninhado só some com o que está abaixo dele', () => {
  const doc = { cabecalhos: { 'x-custom': 'v' }, pedido: { url: 'https://x' } };
  const chaves = collectKeys(doc, ['$.cabecalhos.*']).sort();
  assert.deepEqual(chaves, ['cabecalhos', 'pedido', 'url']);
});

test('collectKeys sem doc nem chave nenhuma devolve vazio', () => {
  assert.deepEqual(collectKeys(null), []);
  assert.deepEqual(collectKeys('texto'), []);
  assert.deepEqual(collectKeys([1, 2, 3]), []);
});

function fonte(texto: string): ts.SourceFile {
  return ts.createSourceFile('x.ts', texto, ts.ScriptTarget.Latest, true);
}

test('codePropertyNames pega membro de interface e de type literal', () => {
  const nomes = codePropertyNames(
    fonte(`
      interface Foo { bar: string; }
      type Baz = { qux: number };
    `),
  );
  assert.ok(nomes.has('bar'));
  assert.ok(nomes.has('qux'));
});

test('codePropertyNames pega chave de objeto literal, inclusive shorthand', () => {
  const quux = 1;
  const nomes = codePropertyNames(
    fonte(`
      const quux = 1;
      const o = { normal: 1, quux, ['literal-string']: 2 };
    `),
  );
  assert.ok(nomes.has('normal'));
  assert.ok(nomes.has('quux'));
  assert.ok(nomes.has('literal-string'));
  void quux;
});

test('codePropertyNames pega acesso.propriedade e acesso[\'indice\']', () => {
  const nomes = codePropertyNames(
    fonte(`
      o.acesso;
      o['indice'];
      o[variavelDinamica];
    `),
  );
  assert.ok(nomes.has('acesso'));
  assert.ok(nomes.has('indice'));
  assert.ok(!nomes.has('variavelDinamica'));
});

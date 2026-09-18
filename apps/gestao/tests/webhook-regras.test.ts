import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITE_URLS,
  adicionarUrl,
  interruptorDesabilitado,
  removerUrl,
  salvarDesabilitado,
  urlValida,
} from '../src/app/fluxo/[id]/integracoes/webhook/regras.ts';

test('adicionar acrescenta uma linha vazia até o limite de dez', () => {
  assert.deepEqual(adicionarUrl(['https://a.pipe.app']), ['https://a.pipe.app', '']);
  const cheia = Array.from({ length: LIMITE_URLS }, (_, i) => `https://u${i}.pipe.app`);
  assert.deepEqual(adicionarUrl(cheia), cheia);
});

test('remover tira só a linha pedida', () => {
  assert.deepEqual(removerUrl(['https://a.pipe.app', '', 'https://c.pipe.app'], 1), [
    'https://a.pipe.app',
    'https://c.pipe.app',
  ]);
  assert.deepEqual(removerUrl(['https://a.pipe.app'], 0), []);
});

test('só HTTPS vale, e não pode repetir', () => {
  assert.ok(urlValida('https://exemplo.pipe.app/webhook', ['https://exemplo.pipe.app/webhook']));
  assert.ok(!urlValida('http://exemplo.pipe.app', ['http://exemplo.pipe.app']));
  assert.ok(!urlValida('https://exemplo', ['https://exemplo']));
  const repetida = 'https://exemplo.pipe.app';
  assert.ok(!urlValida(repetida, [repetida, repetida]));
});

test('o interruptor Ativar só libera com a primeira URL preenchida e válida', () => {
  assert.ok(interruptorDesabilitado([]));
  assert.ok(interruptorDesabilitado(['']));
  assert.ok(interruptorDesabilitado(['https://a.pipe.app', 'ftp://x']));
  assert.ok(!interruptorDesabilitado(['https://a.pipe.app']));
});

test('salvar trava com URL inválida, mas linha vazia não trava', () => {
  assert.ok(salvarDesabilitado(['nada']));
  assert.ok(!salvarDesabilitado(['', 'https://a.pipe.app']));
});

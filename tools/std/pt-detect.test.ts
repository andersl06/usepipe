import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildExtraLexicon,
  isPtComment,
  isPtToken,
  lexiconHash,
  splitIdentifier,
  stripDiacritics,
} from './pt-detect.ts';

test('splitIdentifier separa camelCase e delimitadores tecnicos', () => {
  assert.deepEqual(splitIdentifier('ControladorAnexos'), ['controlador', 'anexos']);
  assert.deepEqual(splitIdentifier('pipe-entrada'), ['pipe', 'entrada']);
  assert.deepEqual(splitIdentifier('arquivo_vazio'), ['arquivo', 'vazio']);
  assert.deepEqual(splitIdentifier('useLeitura'), ['use', 'leitura']);
  assert.deepEqual(splitIdentifier('v1/gestao/fluxos'), ['v1', 'gestao', 'fluxos']);
});

test('stripDiacritics normaliza texto em portugues', () => {
  assert.equal(stripDiacritics('sessão'), 'sessao');
});

test('isPtToken reconhece lexico, morfologia e allowlist inglesa', () => {
  assert.equal(isPtToken('conversa'), true);
  assert.equal(isPtToken('status'), false);
  assert.equal(isPtToken('total'), false);
  assert.equal(isPtToken('distribuicao'), true);
  assert.equal(isPtToken('station'), false);
});

test('isPtComment reconhece palavras funcionais e diacriticos', () => {
  assert.equal(isPtComment('// Busca a conversa quando o id existe'), true);
  assert.equal(isPtComment('// TODO: fix race'), false);
  assert.equal(isPtComment('// não'), true);
});

test('buildExtraLexicon conserva somente tokens portugueses', () => {
  const extra = buildExtraLexicon([
    { old: 'useLeitura', new: 'useReading' },
    { old: 'getConversa', new: 'getConversation' },
    { old: 'listaPorFila', new: 'listByQueue' },
    { old: 'handlerDoWebhook', new: 'webhookHandler' },
  ]);
  for (const token of ['leitura', 'conversa', 'fila', 'por']) assert.equal(extra.has(token), true);
  for (const token of ['use', 'get', 'by', 'list', 'handler', 'webhook']) {
    assert.equal(extra.has(token), false);
  }
});

test("isPtToken('use', extra) permanece falso em mapa candidato", () => {
  const extra = buildExtraLexicon([{ old: 'useLeitura', new: '' }]);
  assert.equal(isPtToken('use', extra), false);
});

test("isPtToken('get', extra) permanece falso em mapa candidato", () => {
  const extra = buildExtraLexicon([{ old: 'getConversa', new: '' }]);
  assert.equal(isPtToken('get', extra), false);
});

test('isPtToken aceita lexico extra sem superar EN_ALLOW', () => {
  assert.equal(isPtToken('inventado', new Set(['inventado'])), true);
  assert.equal(isPtToken('status', new Set(['status'])), false);
});

test('lexiconHash independe da ordem de insercao', () => {
  assert.equal(lexiconHash(new Set(['fila', 'leitura'])), lexiconHash(new Set(['leitura', 'fila'])));
});

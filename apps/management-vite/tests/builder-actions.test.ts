import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CATALOG_OF_ACTIONS,
  actionErrors,
  comCampo,
  comCampoJson,
  fieldValue,
  novaAcao,
  tipoDeAcao,
} from '../src/pages/builder/actions-of-block.ts';

const CONTEXT_ACTIONS = ['SendMessageFromHttp', 'MergeContact'] as const;

for (const tipo of CONTEXT_ACTIONS) {
  test(`${tipo}: catálogo, defaults e ida e volta preservam settings`, () => {
    const acao = novaAcao(tipo, `id-${tipo}`);
    assert.equal(tipoDeAcao(tipo)?.tipo, tipo);
    assert.equal(acao.type, tipo);
    const campo = tipo === 'SendMessageFromHttp' ? 'uri' : 'name';
    const valor = tipo === 'SendMessageFromHttp' ? 'https://api.exemplo.test/message' : 'Ana';
    const editada = comCampo(acao, campo, valor);
    assert.equal(fieldValue(editada, campo), valor);
    assert.deepEqual(comCampo(editada, campo, '').settings, acao.settings);
  });
}

test('context action defaults and required fields match the reference contract', () => {
  assert.equal(fieldValue(novaAcao('SendMessageFromHttp'), 'requestTimeout'), '60');
  assert.deepEqual(novaAcao('TrackEvent').settings, { extras: {}, fireAndForget: true });
  assert.deepEqual(actionErrors(novaAcao('SendMessageFromHttp')), [
    'URL: campo obrigatório.',
    'Tipo de conteúdo (MIME): campo obrigatório.',
  ]);
  assert.deepEqual(actionErrors(novaAcao('MergeContact')), []);
});

test('structured contact extras survive persistence round trip and are validated', () => {
  const acao = novaAcao('MergeContact');
  const editada = comCampoJson(acao, 'extras', '{"segment":"b2b"}');
  assert.deepEqual(editada.settings?.extras, { segment: 'b2b' });
  assert.equal(actionErrors(editada).length, 0);
  assert.equal(CATALOG_OF_ACTIONS.some((item) => item.tipo === 'MergeContact'), true);
});

test('actions panel does not render raw HTML', () => {
  const source = readFileSync(new URL('../src/pages/builder/panel-actions.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('dangerouslySetInnerHTML'), false);
});

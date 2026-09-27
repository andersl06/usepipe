import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CATALOG_OF_ACTIONS,
  EXTERNAL_DEPENDENCY_ACTIONS,
  EXTERNAL_DEPENDENCY_MESSAGE,
  acaoTemDependenciaExterna,
  actionsOfGroup,
  SCRIPT_TEMPLATE,
  actionErrors,
  variablesOfField,
  withVariables,
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

test('script actions warn that {{variables}} are not substituted in code (WR-03)', () => {
  for (const tipo of ['ExecuteScript', 'ExecuteScriptV2']) {
    const comVariavel = comCampo(novaAcao(tipo), 'source', 'function run() { return "{{input.content}}"; }');
    assert.ok(actionErrors(comVariavel).some((e) => e.includes('não são substituídas')));
    assert.ok(!actionErrors(novaAcao(tipo)).some((e) => e.includes('não são substituídas')));
  }
});

test('platform actions: native editors exist and external fallbacks are explicit', () => {
  for (const tipo of ['SendCommand', 'ProcessCommand', 'ManageList', 'SetBucket', 'ProcessContentAssistant']) {
    assert.equal(tipoDeAcao(tipo)?.tipo, tipo);
    assert.ok(actionsOfGroup('Executar').some((action) => action.tipo === tipo) || actionsOfGroup('Manipular').some((action) => action.tipo === tipo));
  }
  assert.deepEqual(EXTERNAL_DEPENDENCY_ACTIONS, ['SendCommand', 'ProcessCommand', 'ManageList', 'SetBucket', 'ProcessContentAssistant']);
  assert.match(EXTERNAL_DEPENDENCY_MESSAGE, /^Esta ação depende de um serviço da Blip/);
});

test('platform actions: arbitrary command imports are read-only dependencies', () => {
  assert.equal(acaoTemDependenciaExterna({ type: 'SendCommand', settings: { uri: 'lime://arbitrary' } }), true);
  assert.equal(acaoTemDependenciaExterna({ type: 'ProcessCommand', settings: { uri: '/tickets/123/status' } }), false);
  assert.equal(acaoTemDependenciaExterna({ type: 'SetBucket', settings: {} }), false);
});

test('structured contact extras survive persistence round trip and are validated', () => {
  const acao = novaAcao('MergeContact');
  const editada = comCampoJson(acao, 'extras', '{"segment":"b2b"}');
  assert.deepEqual(editada.settings?.extras, { segment: 'b2b' });
  assert.equal(actionErrors(editada).length, 0);
  assert.equal(CATALOG_OF_ACTIONS.some((item) => item.tipo === 'MergeContact'), true);
});

for (const tipo of ['ExecuteScript', 'ExecuteScriptV2'] as const) {
  test(`script actions: ${tipo} starts with the default source and the reference fields`, () => {
    const acao = novaAcao(tipo, `id-${tipo}`);
    assert.equal(fieldValue(acao, 'source'), SCRIPT_TEMPLATE);
    assert.deepEqual(variablesOfField(acao, 'inputVariables'), []);
    assert.deepEqual(
      tipoDeAcao(tipo)?.campos.map((c) => c.key),
      ['source', 'inputVariables', 'outputVariable'],
    );
    assert.deepEqual(actionErrors(acao), ['Variável para o valor de retorno: campo obrigatório.']);
    assert.deepEqual(actionErrors(comCampo(acao, 'source', '')), [
      'Código-fonte: campo obrigatório.',
      'Variável para o valor de retorno: campo obrigatório.',
    ]);
  });

  test(`script actions: ${tipo} round trip keeps source and variable lists`, () => {
    const source = 'function run(a, b) {\n  return a + b;\n}';
    let acao = novaAcao(tipo);
    acao = comCampo(acao, 'source', source);
    acao = withVariables(acao, 'inputVariables', ['x', 'contact.name']);
    acao = comCampo(acao, 'outputVariable', 'soma');
    const volta = JSON.parse(JSON.stringify(acao)) as typeof acao;
    assert.equal(fieldValue(volta, 'source'), source);
    assert.deepEqual(variablesOfField(volta, 'inputVariables'), ['x', 'contact.name']);
    assert.equal(fieldValue(volta, 'outputVariable'), 'soma');
    assert.deepEqual(actionErrors(volta), []);
  });
}

test('script actions: V1 defaults function to run', () => {
  assert.equal(fieldValue(novaAcao('ExecuteScript'), 'function'), 'run');
});

test('actions panel does not render raw HTML', () => {
  const source = readFileSync(new URL('../src/pages/builder/panel-actions.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('dangerouslySetInnerHTML'), false);
});

test('script actions: Monaco is lazy-loaded from the local package, never statically or from a CDN', () => {
  const panel = readFileSync(new URL('../src/pages/builder/panel-actions.tsx', import.meta.url), 'utf8');
  assert.match(panel, /lazy\(\(\) => import\('\.\/code-editor'\)\)/);
  assert.equal(/from '(monaco-editor|@monaco-editor\/react)/.test(panel), false);
  const editor = readFileSync(new URL('../src/pages/builder/code-editor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /loader\.config\(\{ monaco \}\)/);
});

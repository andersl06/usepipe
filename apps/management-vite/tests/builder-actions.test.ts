import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CATALOG_OF_ACTIONS,
  EXTERNAL_DEPENDENCY_ACTIONS,
  EXTERNAL_DEPENDENCY_MESSAGE,
  ACTION_TYPE_ICON,
  ACTION_ICON_GENERIC,
  LABELS_OF_ACTIONS,
  acaoTemDependenciaExterna,
  actionsOfGroup,
  SCRIPT_TEMPLATE,
  actionErrors,
  iconOfActionType,
  removeActions,
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

test('a command resource exported by Blip as text is accepted; bad JSON with a JSON type is not', () => {
  const blip = {
    ...novaAcao('ProcessCommand'),
    settings: {
      method: 'set',
      uri: '/contexts/{{contact.identity}}/stateid@82d6b54b',
      type: 'text/plain',
      resource: '{\n    "resource": "onboarding"\n}\n        ',
      variable: 'processedContext',
    },
  };
  assert.ok(!actionErrors(blip).some((e) => e.startsWith('Resource')));
  const quebrado = { ...blip, settings: { ...blip.settings, type: 'application/json', resource: '{ nope' } };
  assert.ok(actionErrors(quebrado).some((e) => e.startsWith('Resource')));
});

test('script code may carry {{variables}}, as in Blip (D-55)', () => {
  for (const tipo of ['ExecuteScript', 'ExecuteScriptV2']) {
    const comVariavel = comCampo(novaAcao(tipo), 'source', 'function run() { {{resource.fn}} return "{{input.content}}"; }');
    assert.ok(!actionErrors(comVariavel).some((e) => e.startsWith('Código')));
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

test('the Ações tab opens with the function library section and its two buttons wired to onAbrirFuncoes', () => {
  const source = readFileSync(new URL('../src/pages/builder/panel-actions.tsx', import.meta.url), 'utf8');
  assert.match(source, /Biblioteca de funções/);
  assert.match(source, /Gerenciar funções/);
  assert.match(source, /Criar função/);
  assert.match(source, /onAbrirFuncoes\('gerenciar'\)/);
  assert.match(source, /onAbrirFuncoes\('criar'\)/);
});

test('script actions: Monaco is lazy-loaded from the local package, never statically or from a CDN', () => {
  const panel = readFileSync(new URL('../src/pages/builder/panel-actions.tsx', import.meta.url), 'utf8');
  assert.match(panel, /lazy\(\(\) => import\('\.\/code-editor'\)\)/);
  assert.equal(/from '(monaco-editor|@monaco-editor\/react)/.test(panel), false);
  const editor = readFileSync(new URL('../src/pages/builder/code-editor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /loader\.config\(\{ monaco \}\)/);
});

test('ACTION_TYPE_ICON maps the reference F-1.2 types to a Pipe icon; unknown types fall back to the generic one', () => {
  const expected: Record<string, string> = {
    ProcessHttp: 'httpRequest',
    TrackEvent: 'trackEvent',
    MergeContact: 'mergeContact',
    Redirect: 'redirect',
    ManageList: 'manageList',
    ExecuteScript: 'script',
    ExecuteScriptV2: 'script',
    ExecuteBlipFunction: 'blipFunction',
    SetVariable: 'setVariable',
    ProcessCommand: 'processCommand',
    ExecuteTemplate: 'executeTemplate',
    ForwardToAgent: 'forwardToAgent',
  };
  for (const [tipo, icone] of Object.entries(expected)) {
    assert.equal(ACTION_TYPE_ICON[tipo], icone);
    assert.equal(iconOfActionType(tipo), icone);
  }
  assert.equal(iconOfActionType('SendMessageFromHttp'), ACTION_ICON_GENERIC);
  assert.equal(iconOfActionType('SomeUnknownFutureType'), ACTION_ICON_GENERIC);
});

test('removeActions drops the selected positions, keeping the remaining order', () => {
  const acoes = [novaAcao('SetVariable', 'a'), novaAcao('TrackEvent', 'b'), novaAcao('MergeContact', 'c')];
  assert.deepEqual(removeActions(acoes, [0, 2]).map((a) => a.$id), ['b']);
  assert.deepEqual(removeActions(acoes, []).map((a) => a.$id), ['a', 'b', 'c']);
  assert.deepEqual(removeActions(acoes, [1]).map((a) => a.$id), ['a', 'c']);
});

test('LABELS_OF_ACTIONS carries the bulk-selection texts, the error chip text and bold description parts with no raw HTML', () => {
  assert.equal(LABELS_OF_ACTIONS.copiarSelecionados, 'Copiar selecionados');
  assert.equal(LABELS_OF_ACTIONS.deletarSelecionados, 'Deletar selecionados');
  assert.equal(LABELS_OF_ACTIONS.erro, 'Erro');
  for (const partes of [LABELS_OF_ACTIONS.entradaDescricao, LABELS_OF_ACTIONS.saidaDescricao]) {
    assert.ok(Array.isArray(partes));
    assert.ok(partes.some((p) => p.forte));
    for (const parte of partes) assert.equal(/<[^>]+>/.test(parte.texto), false);
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adicionarAcaoGlobal,
  actionsGlobalList,
  moverAcaoGlobal,
  removerAcaoGlobal,
  substituirAcaoGlobal,
} from '../src/pages/builder/actions-global.ts';
import {
  ACTIONS_LIMIT,
  LABELS_OF_ACTIONS,
  tipoDeAcao,
  pasteActions,
  cabecalhosDoCampo,
  comCabecalhos,
  comCampo,
  comCampoJson,
  actionErrors,
  moverAcao,
  novaAcao,
} from '../src/pages/builder/actions-of-block.ts';
import {
  MESSAGES_OF_IMPORT,
  nameOfFileOfExport,
  nameOfFileOfExportedVersion,
  exportText,
  validateImport,
} from '../src/pages/builder/import-exportar.ts';
import { formatPublishedAt, lastPublished, latestPublished } from '../src/pages/builder/versions-list.ts';
import { lerDesenho, newBlock } from '../src/pages/builder/model.ts';
import { LEGACY_BLUES, TAG_PALETTE, blockTags } from '../src/pages/builder/tags-of-block.ts';
import { blockErrors } from '../src/pages/builder/validation.ts';
import {
  filterVariables,
  systemFilterVariables,
  userLibraryFilter,
  userVariables,
} from '../src/pages/builder/variables.ts';
import { BLIP_SYSTEM_VARIABLES } from '../src/pages/builder/system-variables.ts';
import {
  GLOBAL_ACTIONS_SECTION_ID,
  debugSections,
  testVariablesToRecord,
} from '../src/pages/builder/test-panel-logic.ts';
import {
  CONFIGURATION_SECTIONS,
  secondsToTimeSpan,
  timeSpanToSeconds,
} from '../src/pages/builder/configuration-sections.ts';

/* ------------------------------------------------------------- variaveis.ts */

test('pasting actions preserves origin, creates unique ids and respects the limit atomically', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'bloco');
  const original = {
    $id: 'origem',
    type: 'SetVariable',
    settings: { variable: 'saldo', value: '1' },
  };
  const r = pasteActions(block, '$enteringCustomActions', [original, original]);
  assert.ok(r.ok);
  const actions = r.block.$enteringCustomActions!;
  assert.equal(new Set(actions.map((a) => a.$id)).size, 2);
  assert.ok(actions.every((a) => a.$id !== original.$id));
  actions[0]!.settings!.value = '2';
  assert.equal(original.settings.value, '1');
  assert.equal(actions[1]!.settings!.value, '1');
  assert.deepEqual(
    moverAcao(r.block, '$enteringCustomActions', 0, 1).$enteringCustomActions?.map((a) => a.$id),
    [actions[1]!.$id, actions[0]!.$id],
  );
  const cheio = { ...block, $enteringCustomActions: Array.from({ length: 14 }, () => original) };
  assert.equal(pasteActions(cheio, '$enteringCustomActions', [original, original]).ok, false);
  assert.equal(cheio.$enteringCustomActions.length, 14);
});

test('ProcessHttp edits headers in pairs and keeps the flow\'s object', () => {
  const acao = novaAcao('ProcessHttp');
  assert.equal(acao.settings?.method, 'GET');
  assert.deepEqual(tipoDeAcao('ProcessHttp')?.campos[0]?.options, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  const valida = comCabecalhos(
    comCampo(acao, 'uri', 'https://api.exemplo.test'),
    'headers',
    [{ key: 'authorization', value: 'Bearer {{token}}' }],
  );
  assert.deepEqual(valida.settings?.headers, { authorization: 'Bearer {{token}}' });
  assert.deepEqual(cabecalhosDoCampo(valida, 'headers'), [{ key: 'authorization', value: 'Bearer {{token}}' }]);
  assert.deepEqual(actionErrors(valida), []);

  const withoutKey = comCabecalhos(valida, 'headers', [{ key: '', value: 'ignorado' }]);
  assert.equal(withoutKey.settings?.headers, undefined);

  const invalida = comCampoJson(acao, 'headers', '{');
  assert.deepEqual(actionErrors(invalida), ['URL: campo obrigatório.']);
});

test('an empty output draft stays on the card and does not enter the publish alert', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'inicio');
  block.$conditionOutputs = [{ conditions: [{ source: 'input', comparison: 'equals', values: [] }] }];
  const errors = blockErrors(block, { inicio: block });
  assert.ok(!errors.includes('Definição de saída não preenchida'));
  assert.ok(!errors.includes('A condição precisa de valores quando a comparação não é exists nem notExists.'));
});

test('the block card shows content, entry and custom actions without repeating', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'inicio');
  block.$contentActions = [
    { action: { type: 'SendMessage' } },
    { action: { type: 'SendMessage' } },
    { input: { bypass: false } },
  ];
  block.$leavingCustomActions = [{ type: 'ProcessHttp' }];
  block.$tags = [{ label: 'API', background: '#3f7de8' }];
  const etiquetas = blockTags(block);
  assert.deepEqual(
    etiquetas.map(({ rotulo }) => rotulo),
    ['API', 'ProcessHttp', 'SendMessage', 'UserInput'],
  );
  assert.equal(etiquetas[0]?.cor, 'var(--p-builder-marca)');
});

test('tag color: blue becomes brand token', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'inicio');
  block.$tags = [{ label: 'Origem', background: '#498bff' }];
  const [etiqueta] = blockTags(block);
  assert.equal(etiqueta?.cor, 'var(--p-builder-marca)');
});

test('TAG_PALETTE has no blue', () => {
  const azulNaPaleta = TAG_PALETTE.map((entrada) => entrada.value.toLowerCase()).some((cor) =>
    LEGACY_BLUES.includes(cor),
  );
  assert.equal(azulNaPaleta, false);
});

test('userVariables merges context variables from blocks and global actions, without repeating', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'bloco');
  block.$enteringCustomActions = [{ type: 'SetVariable', settings: { variable: 'saldo' } }];
  block.$conditionOutputs = [
    {
      $id: 's1',
      stateId: 'outro',
      conditions: [{ source: 'context', variable: 'etapa', comparison: 'equals', values: ['1'] }],
    },
  ];
  block.$contentActions![0]!.input!.variable = 'resposta';
  const mapa = { block };
  const global = {
    $leavingCustomActions: [
      { type: 'DeleteVariable', settings: { variable: 'temp' } },
      { type: 'SetVariable', settings: { variable: 'saldo' } },
    ],
  };

  assert.deepEqual(userVariables(mapa, global), ['etapa', 'resposta', 'saldo', 'temp']);
});

test('userVariables returns an empty list when the flow references no context variable', () => {
  const mapa = { bloco: newBlock({}, { top: 0, left: 0 }, 'bloco') };
  assert.deepEqual(userVariables(mapa, {}), []);
});

test('userVariables collects responseStatusVariable/responseBodyVariable, outputVariable and the flow\'s configuration keys', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'bloco');
  block.$enteringCustomActions = [
    {
      type: 'ProcessHttp',
      settings: { responseStatusVariable: 'status', responseBodyVariable: 'corpo' },
    },
    { type: 'ExecuteScript', settings: { outputVariable: 'resultado' } },
    { type: 'ProcessCommand', settings: { variable: 'respostaComando' } },
  ];
  const mapa = { block };

  assert.deepEqual(
    userVariables(mapa, {}, { ApiKey: 'x', Ambiente: 'prod' }),
    ['config.Ambiente', 'config.ApiKey', 'corpo', 'respostaComando', 'resultado', 'status'],
  );
});

test('userVariables lists this flow\'s resources as resource.<nome>', () => {
  const mapa = { bloco: newBlock({}, { top: 0, left: 0 }, 'bloco') };
  assert.deepEqual(
    userVariables(mapa, {}, {}, ['TimeZoneAttendance', 'objectResources']),
    ['resource.objectResources', 'resource.TimeZoneAttendance'],
  );
});

test('filterVariables ignores accents and case', () => {
  const nomes = ['Saldo', 'situação', 'temp'];
  assert.deepEqual(filterVariables(nomes, 'situacao'), ['situação']);
  assert.deepEqual(filterVariables(nomes, 'SALDO'), ['Saldo']);
  assert.deepEqual(filterVariables(nomes, ''), nomes);
  assert.deepEqual(filterVariables(nomes, 'zzz'), []);
});

test('BLIP_SYSTEM_VARIABLES has all 118 reference variables, sorted, with pt-BR descriptions and support marks', () => {
  assert.equal(BLIP_SYSTEM_VARIABLES.length, 118);
  const sorted = [...BLIP_SYSTEM_VARIABLES].sort((a, b) => a.nome.localeCompare(b.nome));
  assert.deepEqual(BLIP_SYSTEM_VARIABLES.map((v) => v.nome), sorted.map((v) => v.nome));

  const inputContent = BLIP_SYSTEM_VARIABLES.find((v) => v.nome === 'input.content');
  assert.equal(inputContent?.descricao, 'Conteúdo da mensagem enviado pelo usuário');
  assert.equal(inputContent?.suportada, true);

  const context = BLIP_SYSTEM_VARIABLES.find((v) => v.nome === 'context.?');
  assert.ok(context);
  assert.equal(context?.suportada, true);

  const bucket = BLIP_SYSTEM_VARIABLES.find((v) => v.nome === 'bucket.?');
  assert.equal(bucket?.suportada, true);
  const secret = BLIP_SYSTEM_VARIABLES.find((v) => v.nome === 'secret.?');
  assert.equal(secret?.suportada, false);

  // Every variable whose source now has an engine provider is marked supported.
  const novas = BLIP_SYSTEM_VARIABLES.filter((v) => /^(application|calendar|random|tunnel)\./.test(v.nome));
  assert.equal(novas.length, 48);
  assert.ok(novas.every((v) => v.suportada));
});

test('systemFilterVariables (accent-sensitive) searches the name and the description', () => {
  const byName = systemFilterVariables(BLIP_SYSTEM_VARIABLES, 'contact.email');
  assert.deepEqual(
    byName.map((v) => v.nome),
    ['contact.email'],
  );

  const byDescription = systemFilterVariables(BLIP_SYSTEM_VARIABLES, 'nome do contato');
  assert.ok(byDescription.some((v) => v.nome === 'contact.name'));

  assert.deepEqual(systemFilterVariables(BLIP_SYSTEM_VARIABLES, 'situaçao'), []);
});

test('userLibraryFilter (accent-sensitive) searches the name only', () => {
  const nomes = ['saldo', 'situação', 'temp'];
  assert.deepEqual(userLibraryFilter(nomes, 'situação'), ['situação']);
  assert.deepEqual(userLibraryFilter(nomes, 'situacao'), []);
  assert.deepEqual(userLibraryFilter(nomes, 'SALDO'), ['saldo']);
  assert.deepEqual(userLibraryFilter(nomes, ''), nomes);
});

/* --------------------------------------------------------- importar-exportar.ts */

test('exportText produces {flow, globalActions} with the block keyed by id', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'onboarding');
  block.root = true;
  const mapa = { onboarding: block };
  const global = { $enteringCustomActions: [{ type: 'TrackEvent' }] };

  const json = JSON.parse(exportText(mapa, global)) as {
    flow: Record<string, unknown>;
    globalActions: unknown;
  };

  assert.deepEqual(Object.keys(json.flow), ['onboarding']);
  assert.equal((json.flow.onboarding as { id: string }).id, 'onboarding');
  assert.deepEqual(json.globalActions, global);
});

test('exportFileName sanitizes the flow\'s name and is never empty', () => {
  assert.equal(nameOfFileOfExport('Meu Bot!'), 'meu-bot.json');
  assert.equal(nameOfFileOfExport('  '), 'fluxo.json');
  assert.equal(nameOfFileOfExport('Atendimento/Vendas'), 'atendimento-vendas.json');
});

test('validateImport rejects text that is not JSON', () => {
  const r = validateImport('{ isso não é json');
  assert.deepEqual(r, { ok: false, error: MESSAGES_OF_IMPORT.arquivoInvalido });
});

test('validateImport rejects JSON that does not match the editor\'s export format', () => {
  const r = validateImport(JSON.stringify({ nada: 'a ver' }));
  assert.deepEqual(r, { ok: false, error: MESSAGES_OF_IMPORT.arquivoInvalido });
});

test('validateImport rejects a flow with no root block', () => {
  const semRaiz = {
    flow: { onboarding: { id: 'onboarding', $contentActions: [] } },
    globalActions: {},
  };
  const r = validateImport(JSON.stringify(semRaiz));
  assert.deepEqual(r, { ok: false, error: MESSAGES_OF_IMPORT.semRaiz });
});

test('validateImport accepts a valid export and returns the map ready to load', () => {
  const valido = {
    flow: { onboarding: { id: 'onboarding', root: true, $contentActions: [] } },
    globalActions: { $enteringCustomActions: [] },
  };
  const r = validateImport(JSON.stringify(valido));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.mapa.onboarding?.root, true);
  assert.deepEqual(r.global, { $enteringCustomActions: [] });
});

/* --------------------------------------------------- versions-list.ts (F-2) */

test('versions: lastPublished keeps only published versions, newest first, capped at 10', () => {
  const publicadas = Array.from({ length: 12 }, (_, i) => ({
    id: `v${i}`,
    versao: i + 1,
    estado: 'publicada' as const,
    blocos: 1,
    publicadaEm: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    publishedBy: 'Ana',
    criadoEm: null,
    atualizadoEm: null,
  }));
  const rascunho = {
    id: 'draft',
    versao: 13,
    estado: 'rascunho' as const,
    blocos: 1,
    publicadaEm: null,
    publishedBy: null,
    criadoEm: null,
    atualizadoEm: null,
  };
  const recentes = lastPublished([...publicadas, rascunho]);
  assert.equal(recentes.length, 10);
  assert.deepEqual(recentes.map((v) => v.versao), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
});

test('versions: latestPublished returns the newest publication, or null when nothing was published', () => {
  const publicada = {
    id: 'v1',
    versao: 1,
    estado: 'publicada' as const,
    blocos: 1,
    publicadaEm: '2026-01-01T00:00:00Z',
    publishedBy: 'Ana',
    criadoEm: null,
    atualizadoEm: null,
  };
  const rascunho = {
    id: 'v2',
    versao: 2,
    estado: 'rascunho' as const,
    blocos: 1,
    publicadaEm: null,
    publishedBy: null,
    criadoEm: null,
    atualizadoEm: null,
  };
  assert.equal(latestPublished([publicada, rascunho])?.versao, 1);
  assert.equal(latestPublished([]), null);
  assert.equal(latestPublished([rascunho]), null);
});

test('versions: formatPublishedAt renders dd/MM/yyyy - HH:mm:ss in the given timezone', () => {
  assert.equal(formatPublishedAt('2026-09-28T13:04:05Z', 'America/Sao_Paulo'), '28/09/2026 - 10:04:05');
});

/* ----------------------------------------------------- versions: (D-16) */

test('versions: nameOfFileOfExportedVersion adds the version and truncates the date', () => {
  assert.equal(
    nameOfFileOfExportedVersion('Meu Bot!', 3, '2026-09-20T14:05:00.000Z'),
    'meu-bot-v3-2026-09-20.json',
  );
  assert.equal(nameOfFileOfExportedVersion('Meu Bot!', 1, null), 'meu-bot-v1.json');
});

test('versions: an old version drawing round-trips through exportText and validateImport', () => {
  // // Same shape `GET :id/builder/versions/:version` (Task 1) returns: a compiled `DesenhoDoBuilder`.
  const desenho = {
    flow: { onboarding: { id: 'onboarding', root: true, $contentActions: [] } },
    globals: { $enteringCustomActions: [] },
  };
  const mapa = lerDesenho(desenho);
  const texto = exportText(mapa, desenho.globals);
  const r = validateImport(texto);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.mapa.onboarding?.root, true);
  assert.deepEqual(r.global, { $enteringCustomActions: [] });
});

/* ------------------------------------------------------------- acoes-globais.ts */

test('globalActionList returns an empty list when the key does not exist', () => {
  assert.deepEqual(actionsGlobalList({}, '$enteringCustomActions'), []);
});

test('adicionarAcaoGlobal acrescenta na lista certa sem mexer na outra', () => {
  const r = adicionarAcaoGlobal({}, '$enteringCustomActions', { type: 'SetVariable' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(actionsGlobalList(r.global, '$enteringCustomActions'), [
    { type: 'SetVariable' },
  ]);
  assert.deepEqual(actionsGlobalList(r.global, '$leavingCustomActions'), []);
});

test('addGlobalAction rejects past the limit of 15, same as block actions', () => {
  const cheias = {
    $enteringCustomActions: Array.from({ length: ACTIONS_LIMIT }, () => ({
      type: 'SetVariable',
    })),
  };
  const r = adicionarAcaoGlobal(cheias, '$enteringCustomActions', { type: 'SetVariable' });
  assert.deepEqual(r, { ok: false, error: LABELS_OF_ACTIONS.limite });
});

test('substituirAcaoGlobal troca só o índice pedido', () => {
  const global = {
    $leavingCustomActions: [
      { type: 'SetVariable', $title: 'a' },
      { type: 'TrackEvent', $title: 'b' },
    ],
  };
  const trocado = substituirAcaoGlobal(global, '$leavingCustomActions', 1, {
    type: 'TrackEvent',
    $title: 'novo',
  });
  assert.deepEqual(
    actionsGlobalList(trocado, '$leavingCustomActions').map((a) => a.$title),
    ['a', 'novo'],
  );
});

test('removerAcaoGlobal e moverAcaoGlobal mexem só na lista indicada', () => {
  const global = {
    $enteringCustomActions: [{ type: 'A' }, { type: 'B' }, { type: 'C' }],
  };
  const movido = moverAcaoGlobal(global, '$enteringCustomActions', 2, 0);
  assert.deepEqual(
    actionsGlobalList(movido, '$enteringCustomActions').map((a) => a.type),
    ['C', 'A', 'B'],
  );

  const removido = removerAcaoGlobal(movido, '$enteringCustomActions', 1);
  assert.deepEqual(
    actionsGlobalList(removido, '$enteringCustomActions').map((a) => a.type),
    ['C', 'B'],
  );
});

/* -------------------------------------------------------- test panel: test-panel-logic.ts (D-14) */

test('test panel: testVariablesToRecord drops blank names and keeps values as typed', () => {
  assert.deepEqual(
    testVariablesToRecord([
      { chave: 'modo', valor: 'simulação' },
      { chave: '  ', valor: 'ignorado' },
      { chave: ' nome ', valor: 'Ana' },
    ]),
    { modo: 'simulação', nome: 'Ana' },
  );
  assert.deepEqual(testVariablesToRecord([]), {});
});

test('test panel: debugSections appends the global actions trace after the visited blocks', () => {
  const debug = {
    states: [
      { stateId: 'inicio', actions: [{ tipo: 'SetVariable' }] },
      { stateId: 'confirma', actions: [] },
    ],
    actionsGlobal: [{ tipo: 'TrackEvent', error: 'falhou' }],
    currentStateId: 'confirma',
    variables: {},
  };
  const secoes = debugSections(debug);
  assert.equal(secoes.length, 3);
  assert.deepEqual(
    secoes.map((s) => s.stateId),
    ['inicio', 'confirma', GLOBAL_ACTIONS_SECTION_ID],
  );
  assert.deepEqual(secoes[2]?.actions, [{ tipo: 'TrackEvent', error: 'falhou' }]);
});

test('test panel: debugSections with no visited blocks still surfaces the global actions section', () => {
  const debug = { states: [], actionsGlobal: [], currentStateId: null, variables: {} };
  assert.deepEqual(
    debugSections(debug).map((s) => s.stateId),
    [GLOBAL_ACTIONS_SECTION_ID],
  );
});

/* ---------------------------------------------------- floating-sidebar.tsx (F-2/F-3/F-5 shell) */

test('the floating shell (.bl-panel--flutuante) matches the Blip measurements: 460px, radius 16, shadow', () => {
  const css = readFileSync(new URL('../src/pages/builder/panel-block.css', import.meta.url), 'utf8');
  const bloco = css.match(/\.bl-panel--flutuante,\s*\n\.bl-panel--block\s*\{[^}]*\}/);
  assert.ok(bloco, 'shared .bl-panel--flutuante/.bl-panel--block geometry block not found');
  assert.match(bloco![0], /width:\s*460px/);
  assert.match(bloco![0], /border-radius:\s*16px/);
  assert.match(bloco![0], /box-shadow:\s*32px 0 56px 32px rgb\(0 0 0 \/ 50%\)/);
});

test('the floating shell keeps the block panel unchanged and adds direita/esquerda positions', () => {
  const css = readFileSync(new URL('../src/pages/builder/panel-block.css', import.meta.url), 'utf8');
  assert.match(css, /\.bl-panel--block\s*\{\s*\n\s*top:\s*16px;\s*\n\s*right:\s*16px;\s*\n\s*bottom:\s*16px;\s*\n\}/);
  assert.match(
    css,
    /\.bl-panel--flutuante\.bl-panel--direita\s*\{\s*\n\s*top:\s*16px;\s*\n\s*right:\s*16px;\s*\n\s*bottom:\s*16px;\s*\n\}/,
  );
  assert.match(
    css,
    /\.bl-panel--flutuante\.bl-panel--esquerda\s*\{\s*\n\s*top:\s*16px;\s*\n\s*left:\s*16px;\s*\n\s*bottom:\s*16px;\s*\n\s*right:\s*auto;\s*\n\}/,
  );
});

test('floating-sidebar.tsx exports FloatingSidebar and mounts as .bl-panel--flutuante', () => {
  const source = readFileSync(new URL('../src/pages/builder/floating-sidebar.tsx', import.meta.url), 'utf8');
  assert.match(source, /export function FloatingSidebar/);
  assert.match(source, /bl-panel bl-panel--flutuante bl-panel--\$\{lado\}/);
});

test('Configuração, Biblioteca and Filas mount on the shared floating shell', () => {
  const configuracao = readFileSync(
    new URL('../src/pages/builder/panel-configuration.tsx', import.meta.url),
    'utf8',
  );
  const biblioteca = readFileSync(new URL('../src/pages/builder/panel-variables.tsx', import.meta.url), 'utf8');
  const filas = readFileSync(new URL('../src/pages/builder/panel-queues.tsx', import.meta.url), 'utf8');

  assert.match(configuracao, /<FloatingSidebar/);
  assert.match(configuracao, /lado="direita"/);
  assert.match(configuracao, /titulo="Configurações gerais"/);

  assert.match(biblioteca, /<FloatingSidebar/);
  assert.match(biblioteca, /lado="esquerda"/);
  assert.equal(/titulo=/.test(biblioteca), false);
  assert.equal(biblioteca.includes('<hr'), false);

  assert.match(filas, /<FloatingSidebar/);
  assert.match(filas, /lado="direita"/);
  assert.match(filas, /titulo="Gerenciamento de filas"/);
});

/* ------------------------------------------- configuration-sections.ts (F-2, D-56 item 3) */

test('CONFIGURATION_SECTIONS has the 8 captured sections, in order, with literal titles', () => {
  const titulos = CONFIGURATION_SECTIONS.map((s) => s.titulo);
  assert.deepEqual(titulos, [
    'CONFIABILIDADE DE IA',
    'TRACKING AUTOMÁTICO',
    'UTILIZAR CONTEXTO DO ROTEADOR',
    'EXPIRAÇÃO DA SESSÃO',
    'TEMPO LIMITE DE AÇÕES',
    'IDENTIFICADOR DO FLUXO',
    'VARIÁVEIS DE CONFIGURAÇÃO',
    'VARIÁVEIS SENSÍVEIS',
  ]);
});

test('only "Variáveis de configuração" is available — the engine only reads config.X generically', () => {
  const disponiveis = CONFIGURATION_SECTIONS.filter((s) => s.disponivel).map((s) => s.id);
  assert.deepEqual(disponiveis, ['variaveis-configuracao']);
});

test('secondsToTimeSpan/timeSpanToSeconds round-trip the TimeSpan text Blip stores', () => {
  assert.equal(secondsToTimeSpan(90), '00:01:30');
  assert.equal(secondsToTimeSpan(3600), '01:00:00');
  assert.equal(timeSpanToSeconds('01:00:00'), 3600);
  assert.equal(timeSpanToSeconds('00:01:30'), 90);
  assert.equal(timeSpanToSeconds('not a timespan'), null);
  assert.equal(timeSpanToSeconds('99:99:99'), null);
  assert.equal(secondsToTimeSpan(-1), null);
});

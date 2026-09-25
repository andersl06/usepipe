import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adicionarAcaoGlobal,
  actionsGlobalLista,
  moverAcaoGlobal,
  removerAcaoGlobal,
  substituirAcaoGlobal,
} from '../src/paginas/builder/acoes-globais.ts';
import {
  ACTIONS_LIMIT,
  ROTULOS_OF_ACTIONS,
  tipoDeAcao,
  colarActions,
  cabecalhosDoCampo,
  comCabecalhos,
  comCampo,
  comCampoJson,
  actionErrors,
  moverAcao,
  novaAcao,
} from '../src/paginas/builder/acoes-do-bloco.ts';
import {
  MESSAGES_OF_IMPORT,
  nameOfFileOfExport,
  exportText,
  validateImport,
} from '../src/paginas/builder/importar-exportar.ts';
import { newBlock } from '../src/paginas/builder/modelo.ts';
import { blockTags } from '../src/paginas/builder/etiquetas-do-bloco.ts';
import { blockErrors } from '../src/paginas/builder/validacao.ts';
import {
  VARIABLES_OF_SISTEMA,
  filterVariables,
  sistemaFiltrarVariables,
  userVariables,
} from '../src/paginas/builder/variaveis.ts';

/* ------------------------------------------------------------- variaveis.ts */

test('colar ações preserva origem, cria ids únicos e respeita o limite atomicamente', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'bloco');
  const original = {
    $id: 'origem',
    type: 'SetVariable',
    settings: { variable: 'saldo', value: '1' },
  };
  const r = colarActions(block, '$enteringCustomActions', [original, original]);
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
  assert.equal(colarActions(cheio, '$enteringCustomActions', [original, original]).ok, false);
  assert.equal(cheio.$enteringCustomActions.length, 14);
});

test('ProcessHttp edita cabeçalhos em pares e mantém o objeto do fluxo', () => {
  const acao = novaAcao('ProcessHttp');
  assert.equal(acao.settings?.method, 'GET');
  assert.deepEqual(tipoDeAcao('ProcessHttp')?.campos[0]?.options, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  const valida = comCabecalhos(
    comCampo(acao, 'uri', 'https://api.exemplo.test'),
    'headers',
    [{ key: 'authorization', value: 'Bearer {{token}}' }],
  );
  assert.deepEqual(valida.settings?.headers, { authorization: 'Bearer {{token}}' });
  assert.deepEqual(cabecalhosDoCampo(valida, 'headers'), [{ chave: 'authorization', valor: 'Bearer {{token}}' }]);
  assert.deepEqual(actionErrors(valida), []);

  const withoutKey = comCabecalhos(valida, 'headers', [{ key: '', value: 'ignorado' }]);
  assert.equal(withoutKey.settings?.headers, undefined);

  const invalida = comCampoJson(acao, 'headers', '{');
  assert.deepEqual(actionErrors(invalida), ['URL: campo obrigatório.']);
});

test('rascunho de saída vazio fica no cartão e não entra no alerta de publicação', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'inicio');
  block.$conditionOutputs = [{ conditions: [{ source: 'input', comparison: 'equals', values: [] }] }];
  const errors = blockErrors(block, { inicio: block });
  assert.ok(!errors.includes('Definição de saída não preenchida'));
  assert.ok(!errors.includes('A condição precisa de valores quando a comparação não é exists nem notExists.'));
});

test('card do bloco mostra ações de conteúdo, entrada e ações personalizadas sem repetir', () => {
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
  assert.equal(etiquetas[0]?.cor, '#4a5d23');
});

test('variaveisDoUsuario junta as variáveis de context de blocos e ações globais, sem repetir', () => {
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

test('variaveisDoUsuario devolve lista vazia quando o fluxo não referencia nenhuma variável de context', () => {
  const mapa = { bloco: newBlock({}, { top: 0, left: 0 }, 'bloco') };
  assert.deepEqual(userVariables(mapa, {}), []);
});

test('filtrarVariaveis ignora acento e caixa', () => {
  const nomes = ['Saldo', 'situação', 'temp'];
  assert.deepEqual(filterVariables(nomes, 'situacao'), ['situação']);
  assert.deepEqual(filterVariables(nomes, 'SALDO'), ['Saldo']);
  assert.deepEqual(filterVariables(nomes, ''), nomes);
  assert.deepEqual(filterVariables(nomes, 'zzz'), []);
});

test('filtrarVariaveisDoSistema busca no nome e na descrição', () => {
  const byName = sistemaFiltrarVariables(VARIABLES_OF_SISTEMA, 'contact.email');
  assert.deepEqual(
    byName.map((v) => v.nome),
    ['contact.email'],
  );

  const byDescription = sistemaFiltrarVariables(VARIABLES_OF_SISTEMA, 'atendimento');
  assert.ok(byDescription.some((v) => v.nome === 'ticket.id'));
});

/* --------------------------------------------------------- importar-exportar.ts */

test('textoDeExportacao produz {flow, globalActions} com o bloco pela chave do id', () => {
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

test('nomeDoArquivoDeExportacao sanitiza o nome do fluxo e nunca fica vazio', () => {
  assert.equal(nameOfFileOfExport('Meu Bot!'), 'meu-bot.json');
  assert.equal(nameOfFileOfExport('  '), 'fluxo.json');
  assert.equal(nameOfFileOfExport('Atendimento/Vendas'), 'atendimento-vendas.json');
});

test('validarImportacao recusa texto que não é JSON', () => {
  const r = validateImport('{ isso não é json');
  assert.deepEqual(r, { ok: false, erro: MESSAGES_OF_IMPORT.arquivoInvalido });
});

test('validarImportacao recusa JSON que não tem o formato do export do editor', () => {
  const r = validateImport(JSON.stringify({ nada: 'a ver' }));
  assert.deepEqual(r, { ok: false, erro: MESSAGES_OF_IMPORT.arquivoInvalido });
});

test('validarImportacao recusa um fluxo sem bloco raiz', () => {
  const semRaiz = {
    flow: { onboarding: { id: 'onboarding', $contentActions: [] } },
    globalActions: {},
  };
  const r = validateImport(JSON.stringify(semRaiz));
  assert.deepEqual(r, { ok: false, erro: MESSAGES_OF_IMPORT.semRaiz });
});

test('validarImportacao aceita um export válido e devolve o mapa pronto pra carregar', () => {
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

/* ------------------------------------------------------------- acoes-globais.ts */

test('listaDeAcoesGlobais devolve lista vazia quando a chave não existe', () => {
  assert.deepEqual(actionsGlobalLista({}, '$enteringCustomActions'), []);
});

test('adicionarAcaoGlobal acrescenta na lista certa sem mexer na outra', () => {
  const r = adicionarAcaoGlobal({}, '$enteringCustomActions', { type: 'SetVariable' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(actionsGlobalLista(r.global, '$enteringCustomActions'), [
    { type: 'SetVariable' },
  ]);
  assert.deepEqual(actionsGlobalLista(r.global, '$leavingCustomActions'), []);
});

test('adicionarAcaoGlobal recusa depois do limite de 15, igual às ações de bloco', () => {
  const cheias = {
    $enteringCustomActions: Array.from({ length: ACTIONS_LIMIT }, () => ({
      type: 'SetVariable',
    })),
  };
  const r = adicionarAcaoGlobal(cheias, '$enteringCustomActions', { type: 'SetVariable' });
  assert.deepEqual(r, { ok: false, erro: ROTULOS_OF_ACTIONS.limite });
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
    actionsGlobalLista(trocado, '$leavingCustomActions').map((a) => a.$title),
    ['a', 'novo'],
  );
});

test('removerAcaoGlobal e moverAcaoGlobal mexem só na lista indicada', () => {
  const global = {
    $enteringCustomActions: [{ type: 'A' }, { type: 'B' }, { type: 'C' }],
  };
  const movido = moverAcaoGlobal(global, '$enteringCustomActions', 2, 0);
  assert.deepEqual(
    actionsGlobalLista(movido, '$enteringCustomActions').map((a) => a.type),
    ['C', 'A', 'B'],
  );

  const removido = removerAcaoGlobal(movido, '$enteringCustomActions', 1);
  assert.deepEqual(
    actionsGlobalLista(removido, '$enteringCustomActions').map((a) => a.type),
    ['C', 'B'],
  );
});

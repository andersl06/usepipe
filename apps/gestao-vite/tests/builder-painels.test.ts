import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adicionarAcaoGlobal,
  listaDeAcoesGlobais,
  moverAcaoGlobal,
  removerAcaoGlobal,
  substituirAcaoGlobal,
} from '../src/paginas/builder/acoes-globais.ts';
import { LIMITE_DE_ACOES, ROTULOS_DAS_ACOES } from '../src/paginas/builder/acoes-do-bloco.ts';
import {
  MENSAGENS_DE_IMPORTACAO,
  nomeDoArquivoDeExportacao,
  textoDeExportacao,
  validarImportacao,
} from '../src/paginas/builder/importar-exportar.ts';
import { novoBloco } from '../src/paginas/builder/modelo.ts';
import {
  VARIAVEIS_DO_SISTEMA,
  filtrarVariaveis,
  filtrarVariaveisDoSistema,
  variaveisDoUsuario,
} from '../src/paginas/builder/variaveis.ts';

/* ------------------------------------------------------------- variaveis.ts */

test('variaveisDoUsuario junta as variáveis de context de blocos e ações globais, sem repetir', () => {
  const bloco = novoBloco({}, { top: 0, left: 0 }, 'bloco');
  bloco.$enteringCustomActions = [{ type: 'SetVariable', settings: { variable: 'saldo' } }];
  bloco.$conditionOutputs = [
    { $id: 's1', stateId: 'outro', conditions: [{ source: 'context', variable: 'etapa', comparison: 'equals', values: ['1'] }] },
  ];
  bloco.$contentActions![0]!.input!.variable = 'resposta';
  const mapa = { bloco };
  const globais = { $leavingCustomActions: [{ type: 'DeleteVariable', settings: { variable: 'temp' } }, { type: 'SetVariable', settings: { variable: 'saldo' } }] };

  assert.deepEqual(variaveisDoUsuario(mapa, globais), ['etapa', 'resposta', 'saldo', 'temp']);
});

test('variaveisDoUsuario devolve lista vazia quando o fluxo não referencia nenhuma variável de context', () => {
  const mapa = { bloco: novoBloco({}, { top: 0, left: 0 }, 'bloco') };
  assert.deepEqual(variaveisDoUsuario(mapa, {}), []);
});

test('filtrarVariaveis ignora acento e caixa', () => {
  const nomes = ['Saldo', 'situação', 'temp'];
  assert.deepEqual(filtrarVariaveis(nomes, 'situacao'), ['situação']);
  assert.deepEqual(filtrarVariaveis(nomes, 'SALDO'), ['Saldo']);
  assert.deepEqual(filtrarVariaveis(nomes, ''), nomes);
  assert.deepEqual(filtrarVariaveis(nomes, 'zzz'), []);
});

test('filtrarVariaveisDoSistema busca no nome e na descrição', () => {
  const porNome = filtrarVariaveisDoSistema(VARIAVEIS_DO_SISTEMA, 'contact.email');
  assert.deepEqual(porNome.map((v) => v.nome), ['contact.email']);

  const porDescricao = filtrarVariaveisDoSistema(VARIAVEIS_DO_SISTEMA, 'atendimento');
  assert.ok(porDescricao.some((v) => v.nome === 'ticket.id'));
});

/* --------------------------------------------------------- importar-exportar.ts */

test('textoDeExportacao produz {flow, globalActions} com o bloco pela chave do id', () => {
  const bloco = novoBloco({}, { top: 0, left: 0 }, 'onboarding');
  bloco.root = true;
  const mapa = { onboarding: bloco };
  const globais = { $enteringCustomActions: [{ type: 'TrackEvent' }] };

  const json = JSON.parse(textoDeExportacao(mapa, globais)) as { flow: Record<string, unknown>; globalActions: unknown };

  assert.deepEqual(Object.keys(json.flow), ['onboarding']);
  assert.equal((json.flow.onboarding as { id: string }).id, 'onboarding');
  assert.deepEqual(json.globalActions, globais);
});

test('nomeDoArquivoDeExportacao sanitiza o nome do fluxo e nunca fica vazio', () => {
  assert.equal(nomeDoArquivoDeExportacao('Meu Bot!'), 'meu-bot.json');
  assert.equal(nomeDoArquivoDeExportacao('  '), 'fluxo.json');
  assert.equal(nomeDoArquivoDeExportacao('Atendimento/Vendas'), 'atendimento-vendas.json');
});

test('validarImportacao recusa texto que não é JSON', () => {
  const r = validarImportacao('{ isso não é json');
  assert.deepEqual(r, { ok: false, erro: MENSAGENS_DE_IMPORTACAO.arquivoInvalido });
});

test('validarImportacao recusa JSON que não tem o formato do export do editor', () => {
  const r = validarImportacao(JSON.stringify({ nada: 'a ver' }));
  assert.deepEqual(r, { ok: false, erro: MENSAGENS_DE_IMPORTACAO.arquivoInvalido });
});

test('validarImportacao recusa um fluxo sem bloco raiz', () => {
  const semRaiz = { flow: { onboarding: { id: 'onboarding', $contentActions: [] } }, globalActions: {} };
  const r = validarImportacao(JSON.stringify(semRaiz));
  assert.deepEqual(r, { ok: false, erro: MENSAGENS_DE_IMPORTACAO.semRaiz });
});

test('validarImportacao aceita um export válido e devolve o mapa pronto pra carregar', () => {
  const valido = {
    flow: { onboarding: { id: 'onboarding', root: true, $contentActions: [] } },
    globalActions: { $enteringCustomActions: [] },
  };
  const r = validarImportacao(JSON.stringify(valido));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.mapa.onboarding?.root, true);
  assert.deepEqual(r.globais, { $enteringCustomActions: [] });
});

/* ------------------------------------------------------------- acoes-globais.ts */

test('listaDeAcoesGlobais devolve lista vazia quando a chave não existe', () => {
  assert.deepEqual(listaDeAcoesGlobais({}, '$enteringCustomActions'), []);
});

test('adicionarAcaoGlobal acrescenta na lista certa sem mexer na outra', () => {
  const r = adicionarAcaoGlobal({}, '$enteringCustomActions', { type: 'SetVariable' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(listaDeAcoesGlobais(r.globais, '$enteringCustomActions'), [{ type: 'SetVariable' }]);
  assert.deepEqual(listaDeAcoesGlobais(r.globais, '$leavingCustomActions'), []);
});

test('adicionarAcaoGlobal recusa depois do limite de 15, igual às ações de bloco', () => {
  const cheias = { $enteringCustomActions: Array.from({ length: LIMITE_DE_ACOES }, () => ({ type: 'SetVariable' })) };
  const r = adicionarAcaoGlobal(cheias, '$enteringCustomActions', { type: 'SetVariable' });
  assert.deepEqual(r, { ok: false, erro: ROTULOS_DAS_ACOES.limite });
});

test('substituirAcaoGlobal troca só o índice pedido', () => {
  const globais = { $leavingCustomActions: [{ type: 'SetVariable', $title: 'a' }, { type: 'TrackEvent', $title: 'b' }] };
  const trocado = substituirAcaoGlobal(globais, '$leavingCustomActions', 1, { type: 'TrackEvent', $title: 'novo' });
  assert.deepEqual(listaDeAcoesGlobais(trocado, '$leavingCustomActions').map((a) => a.$title), ['a', 'novo']);
});

test('removerAcaoGlobal e moverAcaoGlobal mexem só na lista indicada', () => {
  const globais = {
    $enteringCustomActions: [{ type: 'A' }, { type: 'B' }, { type: 'C' }],
  };
  const movido = moverAcaoGlobal(globais, '$enteringCustomActions', 2, 0);
  assert.deepEqual(listaDeAcoesGlobais(movido, '$enteringCustomActions').map((a) => a.type), ['C', 'A', 'B']);

  const removido = removerAcaoGlobal(movido, '$enteringCustomActions', 1);
  assert.deepEqual(listaDeAcoesGlobais(removido, '$enteringCustomActions').map((a) => a.type), ['C', 'B']);
});

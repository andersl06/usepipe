import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blipReadSubflows, converterDoEditor, validateFlow } from '@pipe/core';
import type { ExportDoEditor, FlowBlip } from '@pipe/core';
import { duplicateBlock, ligar, newBlock, podeExcluir } from '../src/pages/builder/model.ts';
import type { Mapa } from '../src/pages/builder/model.ts';
import { mapaNaTela, reduzir, stateInitial } from '../src/pages/builder/state.ts';
import {
  buildSubflows,
  canvasInvalidBlocks,
  createSubflow,
  deleteSubflowBlock,
  newSubflowDrawing,
  readSubflows,
  restrictedActionErrors,
  shortNameFor,
  subflowCallerErrors,
  subflowCanvasErrors,
  subflowTitle,
} from '../src/pages/builder/subflows.ts';
import {
  exportSubflowText,
  exportText,
  missingSubflows,
  validateImport,
  validateSubflowImport,
} from '../src/pages/builder/import-exportar.ts';
import { actionsOfGroup } from '../src/pages/builder/actions-of-block.ts';
import { stepTitle } from '../src/pages/builder/test-panel-logic.ts';

const inicio = (): Mapa => ({
  onboarding: {
    ...newBlock({}, { top: 0, left: 0 }, 'onboarding'),
    root: true,
    $title: 'Início',
  },
});

test('shortNameFor strips accents/symbols, lowercases and stays unique ignoring case', () => {
  assert.equal(shortNameFor('Coleta de Dados!', []), 'coletadedados');
  assert.equal(shortNameFor('Coleta de dados', ['ColetaDeDados']), 'coletadedados2');
  assert.equal(shortNameFor('***', []), 'subfluxo');
});

test('createSubflow adds a subflow: block with shortNameOfSubflow and an Início -> Fim drawing', () => {
  const r = createSubflow(inicio(), {}, { top: 10, left: 10 }, 'Coleta de dados', 'abc');
  assert.equal(r.block.id, 'subflow:abc');
  assert.equal(r.block['shortNameOfSubflow'], 'coletadedados');
  assert.equal(r.block.$title, 'Coleta de dados');
  assert.ok(r.mapa['subflow:abc']);
  const d = r.subflows['coletadedados']!;
  assert.equal(d.mapa['onboarding']!.root, true);
  assert.equal(d.mapa['end']!['end'], true);
  assert.equal(d.mapa['onboarding']!.$defaultOutput?.stateId, 'end');
  assert.equal(subflowTitle(r.mapa, 'coletadedados'), 'Coleta de dados');
});

test('a new subflow drawing compiles and validates as a Blip subflow (engine accepts what the Builder saves)', () => {
  const r = createSubflow(inicio(), {}, { top: 10, left: 10 }, 'Pagamento', 'x1');
  const saved = buildSubflows(r.subflows);
  const main = r.mapa;
  main['onboarding']!.$defaultOutput = { stateId: 'subflow:x1' };
  const flow: FlowBlip = converterDoEditor(
    { flow: main, globalActions: {} } as unknown as ExportDoEditor,
    'bot',
  );
  flow.subflows = blipReadSubflows(
    Object.fromEntries(
      Object.entries(saved).map(([k, s]) => [k, { flow: s.flow, globalActions: s.globals ?? {} }]),
    ),
  );
  assert.doesNotThrow(() => validateFlow(flow));
});

test('Fim of a subflow cannot be deleted nor linked onwards', () => {
  const d = newSubflowDrawing();
  assert.equal(podeExcluir(d.mapa, 'end'), false);
  assert.equal(podeExcluir(d.mapa, 'onboarding'), false);
  assert.equal(ligar(d.mapa, 'end', 'onboarding').ok, false);
});

test('deleteSubflowBlock removes the subflow unless another block still calls it', () => {
  const r = createSubflow(inicio(), {}, { top: 10, left: 10 }, 'Coleta', 'a');
  const gone = deleteSubflowBlock(r.mapa, r.subflows, 'subflow:a');
  assert.equal(gone.mapa['subflow:a'], undefined);
  assert.deepEqual(Object.keys(gone.subflows), []);

  const dup = duplicateBlock(r.mapa, 'subflow:a', 'b');
  assert.ok(dup['subflow:b'], 'a duplicated calling block keeps the subflow: prefix');
  const kept = deleteSubflowBlock(dup, r.subflows, 'subflow:a');
  assert.deepEqual(Object.keys(kept.subflows), ['coleta']);
});

test('reducer: edits go to the open subflow, undo restores and closes a subflow that no longer exists', () => {
  const r = createSubflow(inicio(), {}, { top: 10, left: 10 }, 'Coleta', 'a');
  let s = reduzir(stateInitial(), { tipo: 'carregar', mapa: inicio(), global: {} });
  s = reduzir(s, { tipo: 'aplicarSubfluxos', mapa: r.mapa, subfluxos: r.subflows });
  assert.equal(s.sujo, true);
  s = reduzir(s, { tipo: 'abrirSubfluxo', shortName: 'coleta' });
  assert.equal(s.subfluxoAberto, 'coleta');
  assert.equal(s.passado.length, 1, 'navigating is not an undo step');

  const sub = mapaNaTela(s);
  const bloco = newBlock(sub, { top: 200, left: 200 }, 'pergunta');
  s = reduzir(s, { tipo: 'aplicar', mapa: { ...sub, pergunta: bloco } });
  assert.ok(s.subfluxos['coleta']!.mapa['pergunta']);
  assert.equal(s.mapa['pergunta'], undefined, 'the main flow is untouched');

  s = reduzir(s, { tipo: 'desfazer' });
  assert.equal(s.subfluxos['coleta']!.mapa['pergunta'], undefined);
  assert.equal(s.subfluxoAberto, 'coleta');
  s = reduzir(s, { tipo: 'desfazer' });
  assert.equal(s.subfluxoAberto, null, 'undoing the creation closes the subflow canvas');
  assert.equal(s.sujo, false);

  s = reduzir(s, { tipo: 'abrirSubfluxo', shortName: 'naoexiste' });
  assert.equal(s.subfluxoAberto, null);
});

test('reducer: dragging inside a subflow records one step and salvo compares the subflows too', () => {
  const r = createSubflow(inicio(), {}, { top: 10, left: 10 }, 'Coleta', 'a');
  let s = reduzir(stateInitial(), { tipo: 'carregar', mapa: r.mapa, global: {}, subfluxos: r.subflows });
  s = reduzir(s, { tipo: 'abrirSubfluxo', shortName: 'coleta' });
  const m = mapaNaTela(s);
  s = reduzir(s, { tipo: 'mover', mapa: { ...m, end: { ...m['end']!, $position: { top: '1px', left: '1px' } } } });
  s = reduzir(s, { tipo: 'mover', mapa: { ...m, end: { ...m['end']!, $position: { top: '2px', left: '2px' } } } });
  s = reduzir(s, { tipo: 'soltar' });
  assert.equal(s.passado.length, 1);
  s = reduzir(s, { tipo: 'salvo', mapa: s.mapa, configuracao: s.configuracao, subfluxos: r.subflows });
  assert.equal(s.sujo, true, 'the saved subflows are older than the screen');
  s = reduzir(s, { tipo: 'salvo', mapa: s.mapa, configuracao: s.configuracao, subfluxos: s.subfluxos });
  assert.equal(s.sujo, false);
});

test('read/build round-trip keeps each subflow as the editor block map', () => {
  const read = readSubflows({ coleta: { flow: newSubflowDrawing().mapa, globals: {}, configuration: { a: '1' } } });
  const built = buildSubflows(read);
  assert.deepEqual(Object.keys(built['coleta']!.flow).sort(), ['end', 'onboarding']);
  assert.deepEqual(built['coleta']!.configuration, { a: '1' });
  assert.deepEqual(buildSubflows({}), {});
});

test('Redirect and ProcessContentAssistant are not offered inside a subflow, and are flagged there', () => {
  const tipos = (inSubflow: boolean) =>
    [...actionsOfGroup('Executar', { inSubflow }), ...actionsOfGroup('Manipular', { inSubflow })].map((t) => t.tipo);
  assert.ok(tipos(false).includes('Redirect'));
  assert.ok(!tipos(true).includes('Redirect'));
  assert.ok(!tipos(true).includes('ProcessContentAssistant'));
  assert.ok(tipos(true).includes('ProcessHttp'));

  const d = newSubflowDrawing();
  d.mapa['end']!.$enteringCustomActions = [{ $id: 'r', type: 'Redirect', settings: { address: 'x' } }];
  assert.equal(restrictedActionErrors(d.mapa['end']!).length, 1);
  assert.ok(canvasInvalidBlocks(d.mapa, {}, [], 'coleta').has('end'));
});

test('subflow problems paint the calling block; a missing subflow too', () => {
  const r = createSubflow(inicio(), {}, { top: 10, left: 10 }, 'Coleta', 'a');
  assert.deepEqual(subflowCallerErrors(r.mapa, r.subflows), []);

  r.subflows['coleta']!.mapa['end']!.$leavingCustomActions = [{ $id: 'p', type: 'ProcessContentAssistant', settings: {} }];
  assert.ok(canvasInvalidBlocks(r.mapa, r.subflows, []).has('subflow:a'));

  const semDesenho = subflowCallerErrors(r.mapa, {});
  assert.match(semDesenho[0]!.mensagem, /O subfluxo 'coleta' chamado pelo bloco 'subflow:a' não existe/);
});

test('API errors for a subflow land on the inner block the message names', () => {
  const d = newSubflowDrawing();
  const erros = subflowCanvasErrors(d.mapa, 'coleta', [
    { block: 'subflow:a', mensagem: "Subfluxo 'Coleta': O estado de destino 'xyz' da saída não existe." },
    { block: 'subflow:a', mensagem: "Subfluxo 'coleta': Há um laço no fluxo começando no estado end que não pede entrada do usuário." },
    { block: 'onboarding', mensagem: 'Erro do fluxo principal' },
  ]);
  assert.deepEqual(erros.map((e) => e.block), ['end']);
});

test('export/import carries bundled subflows and names the missing ones', () => {
  const r = createSubflow(inicio(), {}, { top: 10, left: 10 }, 'Coleta', 'a');
  const texto = exportText(r.mapa, {}, r.subflows);
  const lido = validateImport(texto);
  assert.ok(lido.ok);
  if (!lido.ok) return;
  assert.deepEqual(Object.keys(lido.subfluxos), ['coleta']);
  assert.deepEqual(missingSubflows(lido.mapa, lido.subfluxos), []);
  assert.deepEqual(missingSubflows(lido.mapa, {}), ['coleta']);

  const semSub = JSON.parse(exportText(r.mapa, {})) as Record<string, unknown>;
  assert.equal('subflows' in semSub, false);

  const sub = validateSubflowImport(exportSubflowText(r.subflows['coleta']!));
  assert.ok(sub.ok);
  assert.equal(validateSubflowImport('{"nada":1}').ok, false);
});

test('Debug names a step by its title in the subflow it ran in', () => {
  const r = createSubflow(inicio(), {}, { top: 10, left: 10 }, 'Coleta', 'a');
  assert.equal(stepTitle(r.mapa, r.subflows, 'end', 'Coleta'), 'Fim');
  assert.equal(stepTitle(r.mapa, r.subflows, 'onboarding', null), 'Início');
  assert.equal(stepTitle(r.mapa, r.subflows, 'x', 'naoexiste'), 'x');
});

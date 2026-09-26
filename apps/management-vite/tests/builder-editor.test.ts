import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moverSaida } from '../src/pages/builder/conditions.ts';
import { stateInitial, reduzir } from '../src/pages/builder/state.ts';
import {
  addBlock,
  copiedTextBlock,
  pasteBlock,
  desligar,
  deleteBlock,
  ligar,
  montarDesenho,
  moveBlock,
  newBlock,
  positionOf,
  copiedBlockText,
} from '../src/pages/builder/model.ts';
import { caixaContemPonto, houveArrasto } from '../src/pages/builder/setas.ts';
import { blockErrors } from '../src/pages/builder/validation.ts';

test('buildDrawing exports the screen\'s blocks and the global actions without changing the map', () => {
  const first = newBlock({}, { top: 10, left: 20 }, 'primeiro');
  const mapa = { first };

  const desenho = montarDesenho(mapa, { entrada: [{ type: 'SetVariable' }] });

  assert.deepEqual(Object.keys(desenho.flow), ['primeiro']);
  assert.equal((desenho.flow.primeiro as { id: string }).id, 'primeiro');
  assert.deepEqual(desenho.globals, { entrada: [{ type: 'SetVariable' }] });
  assert.notEqual(desenho.flow.primeiro, first);
});

test('creates, moves and deletes a block, removing destinations that pointed to it', () => {
  const origem = newBlock({}, { top: 10, left: 20 }, 'origem');
  const destination = newBlock({ origem }, { top: 50, left: 60 }, 'destino');
  const mapa = addBlock({ origem }, destination);
  const resultado = ligar(mapa, 'origem', 'destino', 'saida');
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  const ligado = resultado.mapa;
  const movido = moveBlock(ligado, 'destino', { top: 99.6, left: -1 });

  assert.deepEqual(positionOf(movido.destino!), { top: 100, left: 0 });
  assert.equal(deleteBlock(movido, 'destino').destino, undefined);
  assert.deepEqual(deleteBlock(movido, 'destino').origem!.$conditionOutputs, []);
});

test('copies a block to the clipboard and pastes a copy at the chosen position', () => {
  const origem = newBlock({}, { top: 10, left: 20 }, 'origem');
  const copiado = copiedTextBlock(copiedBlockText(origem));
  assert.ok(copiado);
  const mapa = pasteBlock({ origem }, copiado, { top: 120, left: 340 }, 'destino');

  assert.equal(mapa.origem, origem);
  assert.equal(mapa.destino?.$title, 'Novo bloco [Cópia]');
  assert.deepEqual(positionOf(mapa.destino!), { top: 120, left: 340 });
  assert.equal(copiedTextBlock('texto comum'), null);
});

test('toggles an edge on and off without duplicating the output\'s condition', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  const destination = newBlock({ origem }, { top: 0, left: 200 }, 'destino');
  const mapa = { origem, destination };
  const ligado = ligar(mapa, 'origem', 'destino', 'saida');

  assert.equal(ligado.ok, true);
  if (!ligado.ok) return;
  assert.equal(ligado.mapa.origem!.$conditionOutputs?.length, 1);
  const repetido = ligar(ligado.mapa, 'origem', 'destino', 'outra');
  assert.equal(repetido.ok, true);
  if (!repetido.ok) return;
  assert.equal(repetido.mapa.origem!.$conditionOutputs?.length, 1);
  assert.deepEqual(desligar(ligado.mapa, 'origem', 'destino').origem!.$conditionOutputs, []);
});

test('desfazer e refazer tratam o arrasto como uma mudança única', () => {
  const mapa = { bloco: newBlock({}, { top: 0, left: 0 }, 'bloco') };
  const carregado = reduzir(stateInitial(), { tipo: 'carregar', mapa, global: {} });
  const duranteArrasto = reduzir(carregado, { tipo: 'mover', mapa: moveBlock(mapa, 'bloco', { top: 30, left: 40 }) });
  const solto = reduzir(duranteArrasto, { tipo: 'soltar' });

  assert.equal(solto.passado.length, 1);
  assert.deepEqual(positionOf(reduzir(solto, { tipo: 'desfazer' }).mapa.bloco!), { top: 0, left: 0 });
  assert.deepEqual(positionOf(reduzir(reduzir(solto, { tipo: 'desfazer' }), { tipo: 'refazer' }).mapa.bloco!), { top: 30, left: 40 });
});

test('keeps the outputs\' condition order because the first matching condition wins', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'origem');
  block.$conditionOutputs = [
    { $id: 'primeira', stateId: 'um', conditions: [] },
    { $id: 'segunda', stateId: 'dois', conditions: [] },
  ];

  assert.deepEqual(moverSaida(block, 1, 0).$conditionOutputs?.map((saida) => saida.$id), ['segunda', 'primeira']);
});

test('Ctrl+Z disappears while a block is being dragged, so the drag\'s undo is not lost', () => {
  const mapa = { bloco: newBlock({}, { top: 0, left: 0 }, 'bloco') };
  const carregado = reduzir(stateInitial(), { tipo: 'carregar', mapa, global: {} });

  // First drag, complete — a real step in the history.
  const firstMovement = reduzir(carregado, {
    tipo: 'mover',
    mapa: moveBlock(mapa, 'bloco', { top: 10, left: 10 }),
  });
  const firstLoose = reduzir(firstMovement, { tipo: 'soltar' });
  assert.equal(firstLoose.passado.length, 1);

  // Second drag in progress — Ctrl+Z in the middle of it does nothing.
  const duranteArrasto = reduzir(firstLoose, {
    tipo: 'mover',
    mapa: moveBlock(firstLoose.mapa, 'bloco', { top: 30, left: 40 }),
  });
  const desfeitoNoMeio = reduzir(duranteArrasto, { tipo: 'desfazer' });
  assert.equal(desfeitoNoMeio, duranteArrasto);

  // Soltar depois do Ctrl+Z ignorado empilha certo o passo do segundo arrasto —
  // without the guard, the map here would snap back to (0,0) with a corrupted past.
  const segundoSolto = reduzir(desfeitoNoMeio, { tipo: 'soltar' });
  assert.equal(segundoSolto.passado.length, 2);
  assert.deepEqual(positionOf(segundoSolto.mapa.bloco!), { top: 30, left: 40 });

  // E os dois desfazeres, na ordem certa, voltam ao (10,10) e depois ao (0,0).
  const firstUndo = reduzir(segundoSolto, { tipo: 'desfazer' });
  assert.deepEqual(positionOf(firstUndo.mapa.bloco!), { top: 10, left: 10 });
  const segundoDesfazer = reduzir(firstUndo, { tipo: 'desfazer' });
  assert.deepEqual(positionOf(segundoDesfazer.mapa.bloco!), { top: 0, left: 0 });
});

test('applyGlobals marks dirty without touching the canvas undo stack', () => {
  const mapa = { bloco: newBlock({}, { top: 0, left: 0 }, 'bloco') };
  const carregado = reduzir(stateInitial(), { tipo: 'carregar', mapa, global: {} });
  assert.equal(carregado.sujo, false);

  const comAcaoGlobal = reduzir(carregado, {
    tipo: 'aplicarGlobais',
    global: { $enteringCustomActions: [{ type: 'SetVariable' }] },
  });

  assert.equal(comAcaoGlobal.sujo, true);
  assert.deepEqual(comAcaoGlobal.global, { $enteringCustomActions: [{ type: 'SetVariable' }] });
  assert.equal(comAcaoGlobal.passado.length, 0);
  assert.equal(comAcaoGlobal.mapa, mapa);
});

test('wasDragged: only counts a real drag, not a click that jittered a pixel', () => {
  assert.equal(houveArrasto(0, 0), false);
  assert.equal(houveArrasto(1, 1), false);
  assert.equal(houveArrasto(2, 0), true);
  assert.equal(houveArrasto(0, -2), true);
  assert.equal(houveArrasto(-5, 5), true);
});

test('a connection\'s target is resolved from the block\'s box, without depending on the DOM element under the cursor', () => {
  const caixa = { left: 100, top: 80, largura: 175, altura: 76 };
  assert.equal(caixaContemPonto(caixa, { x: 100, y: 80 }), true);
  assert.equal(caixaContemPonto(caixa, { x: 275, y: 156 }), true);
  assert.equal(caixaContemPonto(caixa, { x: 276, y: 156 }), false);
  assert.equal(caixaContemPonto(caixa, { x: 140, y: 157 }), false);
});

test('the panel\'s validation flags the entry\'s required fields before saving', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'bloco');
  const inbound = block.$contentActions?.[0]?.input;
  assert.ok(inbound);
  inbound.variable = 'nome inválido';
  inbound.validation = { rule: 'regex', regex: '', error: '' };

  assert.deepEqual(blockErrors(block, { block }), [
    'O nome da variável de entrada só pode ter letras, números e pontos.',
    'A expressão regular é obrigatória na regra de validação regex.',
    'A mensagem de erro da validação é obrigatória.',
  ]);
});

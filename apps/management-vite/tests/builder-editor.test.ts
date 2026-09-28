import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flowHasSurvey, moverSaida, removeCondition } from '../src/pages/builder/conditions.ts';
import { stateInitial, reduzir, validConfigKey } from '../src/pages/builder/state.ts';
import { exportText, validateImport } from '../src/pages/builder/import-exportar.ts';
import { SURVEY_CONTENT_TYPE } from '@pipe/core';
import {
  addBlock,
  arestasDe,
  attendanceNewBlock,
  copiedTextBlock,
  pasteBlock,
  desligar,
  deleteBlock,
  duplicateBlock,
  isSurveyBlock,
  ligar,
  lerDesenho,
  montarDesenho,
  moveBlock,
  newBlock,
  newSurveyBlock,
  positionOf,
  setSurveyQuestion,
  surveyQuestion,
  copiedBlockText,
} from '../src/pages/builder/model.ts';
import { caixaContemPonto, houveArrasto } from '../src/pages/builder/setas.ts';
import { blockErrors } from '../src/pages/builder/validation.ts';
import { filterDestinations } from '../src/pages/builder/variables.ts';

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
  const mapa = { origem, destino: destination };
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

/* ---------------------------------------------------------- arestasDe() */

test('edges: a valid $conditionOutputs stateId produces exactly { de, para }', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [{ $id: 'saida', stateId: 'destino', conditions: [] }];
  const destino = newBlock({}, { top: 0, left: 200 }, 'destino');
  assert.deepEqual(arestasDe({ origem, destino }), [{ de: 'origem', para: 'destino' }]);
});

test('edges: a stateId missing from the map produces no edge', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [{ $id: 'saida', stateId: 'inexistente', conditions: [] }];
  assert.deepEqual(arestasDe({ origem }), []);
});

test('edges: two outputs of the same block to the same destination collapse into a single edge', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [
    { $id: 'a', stateId: 'destino', conditions: [] },
    { $id: 'b', stateId: 'destino', conditions: [] },
  ];
  const destino = newBlock({}, { top: 0, left: 200 }, 'destino');
  assert.deepEqual(arestasDe({ origem, destino }), [{ de: 'origem', para: 'destino' }]);
});

test('edges: outputs to different destinations produce one edge per destination, in output order', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [
    { $id: 'a', stateId: 'destinoB', conditions: [] },
    { $id: 'b', stateId: 'destinoA', conditions: [] },
  ];
  const destinoA = newBlock({}, { top: 0, left: 200 }, 'destinoA');
  const destinoB = newBlock({}, { top: 0, left: 400 }, 'destinoB');
  assert.deepEqual(arestasDe({ origem, destinoA, destinoB }), [
    { de: 'origem', para: 'destinoB' },
    { de: 'origem', para: 'destinoA' },
  ]);
});

test('edges: an attendance block with destinations on ClosedAttendant/ClosedClient/ClosedClientInactivity produces three edges', () => {
  const attendance = attendanceNewBlock({}, { top: 0, left: 0 }, 'atendimento');
  const destinationByStatus: Record<string, string> = {
    ClosedAttendant: 'closedAttendant',
    ClosedClient: 'closedClient',
    ClosedClientInactivity: 'closedClientInactivity',
  };
  for (const saida of attendance.$conditionOutputs ?? []) {
    const status = saida.conditions?.find((c) => c.variable === 'input.content@status')?.values?.[0];
    if (typeof status === 'string' && destinationByStatus[status]) saida.stateId = destinationByStatus[status];
  }
  const closedAttendant = newBlock({}, { top: 0, left: 200 }, 'closedAttendant');
  const closedClient = newBlock({}, { top: 0, left: 400 }, 'closedClient');
  const closedClientInactivity = newBlock({}, { top: 0, left: 600 }, 'closedClientInactivity');
  assert.deepEqual(
    arestasDe({ [attendance.id]: attendance, closedAttendant, closedClient, closedClientInactivity }),
    [
      { de: attendance.id, para: 'closedAttendant' },
      { de: attendance.id, para: 'closedClient' },
      { de: attendance.id, para: 'closedClientInactivity' },
    ],
  );
});

test('edges: an output flagged $isDeskDefaultOutput never draws an edge, even with an existing destination', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [
    { $id: 'erro', stateId: 'destino', $isDeskDefaultOutput: true, conditions: [] },
  ];
  const destino = newBlock({}, { top: 0, left: 200 }, 'destino');
  assert.deepEqual(arestasDe({ origem, destino }), []);
});

test('edges: a $isDeskCustomOutput (OutOfAttendanceHour/NoAgentAvailable) with an existing destination draws an edge', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [
    {
      $id: 'disponibilidade',
      stateId: 'destino',
      $isDeskOutput: true,
      $isDeskCustomOutput: true,
      conditions: [
        { source: 'context', variable: 'desk_forwardToDeskState_status', comparison: 'equals', values: ['OutOfAttendanceHour'] },
      ],
    },
  ];
  const destino = newBlock({}, { top: 0, left: 200 }, 'destino');
  // caracterização: conferir com ref/inventario-paineis-e-setas.md (D-29.2) — arestasDe não filtra
  // por $isDeskCustomOutput (só por $isDeskDefaultOutput), então a seta é desenhada.
  assert.deepEqual(arestasDe({ origem, destino }), [{ de: 'origem', para: 'destino' }]);
});

test('edges: a filled $defaultOutput without $conditionOutputs never draws an edge (PAINEL-Saidas.md:53)', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$defaultOutput = { stateId: 'destino' };
  const destino = newBlock({}, { top: 0, left: 200 }, 'destino');
  assert.deepEqual(arestasDe({ origem, destino }), []);
});

test('edges: an empty map and a block without $conditionOutputs both return []', () => {
  assert.deepEqual(arestasDe({}), []);
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  assert.deepEqual(arestasDe({ origem }), []);
});

/* --------------------------------------------------- newSurveyBlock()/isSurveyBlock() */

test('survey: newSurveyBlock creates a survey:-prefixed block that sends the native document and awaits a reply', () => {
  const block = newSurveyBlock({}, { top: 0, left: 0 }, 'nota');
  assert.equal(block.id, 'survey:nota');
  assert.equal(isSurveyBlock(block), true);
  const pergunta = block.$contentActions?.[0]?.action;
  assert.equal(pergunta?.type, 'SendMessage');
  assert.equal((pergunta?.settings as { type?: string })?.type, SURVEY_CONTENT_TYPE);
  assert.ok(block.$contentActions?.[1]?.input, 'entrada do usuário waits for the reply');
});

test('survey: isSurveyBlock only recognizes the id prefix, not the title', () => {
  const bloco = newBlock({}, { top: 0, left: 0 }, 'bloco');
  assert.equal(isSurveyBlock(bloco), false);
  assert.equal(isSurveyBlock({ ...bloco, $title: 'Pesquisa de satisfação' }), false);
  assert.equal(isSurveyBlock(newSurveyBlock({}, { top: 0, left: 0 }, 'nota')), true);
});

test('survey: surveyQuestion reads and setSurveyQuestion replaces the question, keeping the fixed 1-5 scale', () => {
  const bloco = newSurveyBlock({}, { top: 0, left: 0 }, 'nota');
  assert.equal(surveyQuestion(bloco), 'De 1 a 5, como você avalia o atendimento?');
  const mudado = setSurveyQuestion(bloco, 'Você recomendaria nosso atendimento?');
  assert.equal(surveyQuestion(mudado), 'Você recomendaria nosso atendimento?');
  const settings = mudado.$contentActions?.[0]?.action?.settings as { content?: { scale?: string } };
  assert.equal(settings.content?.scale, '1-5');
});

test('survey: montarDesenho -> lerDesenho round trip preserves the survey block', () => {
  const bloco = newSurveyBlock({}, { top: 10, left: 20 }, 'nota');
  const mapa = { [bloco.id]: bloco };
  const desenho = montarDesenho(mapa, {});
  const relido = lerDesenho(desenho);
  assert.ok(relido['survey:nota']);
  assert.equal(isSurveyBlock(relido['survey:nota']!), true);
  assert.equal(surveyQuestion(relido['survey:nota']!), surveyQuestion(bloco));
});

test('survey: linking a survey block as the destination of an attendance closing output draws an edge (D-29.2)', () => {
  const attendance = attendanceNewBlock({}, { top: 0, left: 0 }, 'atendimento');
  const survey = newSurveyBlock({}, { top: 0, left: 200 }, 'nota');
  for (const saida of attendance.$conditionOutputs ?? []) {
    const status = saida.conditions?.find((c) => c.variable === 'input.content@status')?.values?.[0];
    if (status === 'ClosedAttendant') saida.stateId = survey.id;
  }
  assert.deepEqual(arestasDe({ [attendance.id]: attendance, [survey.id]: survey }), [
    { de: attendance.id, para: survey.id },
  ]);
});

/* ------------------------------------------------------- filterDestinations() */

test('filterDestinations: matches "atendi" against both "Atendimento" and "ATENDIMENTO humano", case- and accent-insensitive', () => {
  const blocos = [
    { id: 'a1', $title: 'Atendimento' },
    { id: 'a2', $title: 'ATENDIMENTO humano' },
    { id: 'a3', $title: 'Menu principal' },
  ];
  assert.deepEqual(
    filterDestinations(blocos, 'atendi').map((b) => b.id),
    ['a1', 'a2'],
  );
});

test('filterDestinations: matches "Ação" when the search has no accent', () => {
  const blocos = [
    { id: 'x', $title: 'Ação' },
    { id: 'y', $title: 'Outro bloco' },
  ];
  assert.deepEqual(
    filterDestinations(blocos, 'acao').map((b) => b.id),
    ['x'],
  );
});

test('filterDestinations: an empty search returns every block', () => {
  const blocos = [
    { id: 'a', $title: 'A' },
    { id: 'b', $title: 'B' },
  ];
  assert.deepEqual(filterDestinations(blocos, ''), blocos);
});

test('filterDestinations: also matches by id, not only by title', () => {
  const blocos = [{ id: 'fallback', $title: 'Bloco sem título' }];
  assert.deepEqual(
    filterDestinations(blocos, 'fallb').map((b) => b.id),
    ['fallback'],
  );
});

test('filterDestinations: the origin block can appear as its own destination (loopback allowed, D-02 inventory)', () => {
  const origem = { id: 'origem', $title: 'Origem' };
  assert.deepEqual(filterDestinations([origem], 'orig'), [origem]);
});

/* ------------------------------------------------------ copiar/colar/duplicar */

test('copy-paste: duplicating a block yields a new id and independent data (mutating the copy leaves the original untouched)', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  const mapa = duplicateBlock({ origem }, 'origem', 'copia');
  const copia = mapa.copia;
  assert.ok(copia);
  assert.notEqual(copia!.id, origem.id);
  copia!.$title = 'mudou';
  copia!.$contentActions![0]!.input!.variable = 'mudou';
  assert.notEqual(origem.$title, 'mudou');
  assert.notEqual(origem.$contentActions?.[0]?.input?.variable, 'mudou');
});

test('copy-paste: pasting the copied text twice yields a distinct id each time', () => {
  const origem = newBlock({}, { top: 10, left: 20 }, 'origem');
  const copiado1 = copiedTextBlock(copiedBlockText(origem));
  assert.ok(copiado1);
  const mapa1 = pasteBlock({ origem }, copiado1!, { top: 50, left: 50 });
  const copiado2 = copiedTextBlock(copiedBlockText(origem));
  assert.ok(copiado2);
  const mapa2 = pasteBlock(mapa1, copiado2!, { top: 90, left: 90 });
  const idsColados = Object.keys(mapa2).filter((id) => id !== 'origem');
  assert.equal(idsColados.length, 2);
  assert.notEqual(idsColados[0], idsColados[1]);
});

test('copy-paste: invalid pasted text returns null without touching the map', () => {
  const mapa = { origem: newBlock({}, { top: 0, left: 0 }, 'origem') };
  assert.equal(copiedTextBlock('pipe-builder:block/v1:{quebrado'), null);
  assert.equal(copiedTextBlock(`pipe-builder:block/v1:${JSON.stringify({ semId: true })}`), null);
  assert.deepEqual(mapa, { origem: mapa.origem });
});

test('copy-paste: a copied output keeps its stateId, but arestasDe never draws an edge to a block missing from the destination map', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [{ $id: 'saida', stateId: 'outro', conditions: [] }];
  const copiado = copiedTextBlock(copiedBlockText(origem));
  assert.ok(copiado);
  const mapaIsolado = pasteBlock({}, copiado!, { top: 50, left: 50 }, 'copia');
  assert.equal(mapaIsolado.copia?.$conditionOutputs?.[0]?.stateId, 'outro');
  assert.deepEqual(arestasDe(mapaIsolado), []);
});

test('removeCondition: an output with two conditions keeps the output after removing one', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [
    {
      $id: 'saida',
      stateId: 'destino',
      conditions: [
        { source: 'input', comparison: 'equals', values: ['a'] },
        { source: 'input', comparison: 'equals', values: ['b'] },
      ],
    },
  ];
  const resultado = removeCondition(origem, 0, 0);
  assert.equal(resultado.$conditionOutputs?.length, 1);
  assert.deepEqual(
    resultado.$conditionOutputs?.[0]?.conditions,
    [{ source: 'input', comparison: 'equals', values: ['b'] }],
  );
});

test('removeCondition: removing an output\'s only condition removes the output itself (Blip on-remove-condition)', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [
    { $id: 'primeira', stateId: 'destino1', conditions: [{ source: 'input', comparison: 'equals', values: ['a'] }] },
    { $id: 'segunda', stateId: 'destino2', conditions: [{ source: 'input', comparison: 'equals', values: ['b'] }] },
  ];
  const resultado = removeCondition(origem, 0, 0);
  assert.equal(resultado.$conditionOutputs?.length, 1);
  assert.equal(resultado.$conditionOutputs?.[0]?.$id, 'segunda');
});

test('removeCondition: an out-of-range index leaves the block untouched', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [
    { $id: 'saida', stateId: 'destino', conditions: [{ source: 'input', comparison: 'equals', values: ['a'] }] },
  ];
  const resultado = removeCondition(origem, 5, 0);
  assert.deepEqual(resultado, origem);
});

test('removeCondition: the operator field of an untouched sibling condition is preserved (not shown, but kept for import/export)', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  origem.$conditionOutputs = [
    {
      $id: 'saida',
      stateId: 'destino',
      conditions: [
        { source: 'input', comparison: 'equals', values: ['a'] },
        { source: 'input', comparison: 'equals', values: ['x', 'y'], operator: 'and' },
      ],
    },
  ];
  const resultado = removeCondition(origem, 0, 0);
  assert.equal(resultado.$conditionOutputs?.[0]?.conditions?.[0]?.operator, 'and');
});

/* --------------------------------------------------------- configuration */

test('configuracao: sets a key, `valor: null` removes it, and desfazer returns to the previous value', () => {
  const carregado = reduzir(stateInitial(), { tipo: 'carregar', mapa: {}, global: {} });
  assert.deepEqual(carregado.configuracao, {});

  const gravado = reduzir(carregado, { tipo: 'configuracao', chave: 'Nome', valor: 'Ana' });
  assert.deepEqual(gravado.configuracao, { Nome: 'Ana' });
  assert.equal(gravado.sujo, true);

  const removido = reduzir(gravado, { tipo: 'configuracao', chave: 'Nome', valor: null });
  assert.deepEqual(removido.configuracao, {});

  const desfeito = reduzir(removido, { tipo: 'desfazer' });
  assert.deepEqual(desfeito.configuracao, { Nome: 'Ana' });
  const refeito = reduzir(desfeito, { tipo: 'refazer' });
  assert.deepEqual(refeito.configuracao, {});
});

test('validConfigKey: only letters and numbers, no hyphen or other symbols', () => {
  assert.equal(validConfigKey('Nome1'), true);
  assert.equal(validConfigKey('nome-1'), false);
});

test('import-exportar: export -> import does not touch the screen\'s configuracao (the file carries only {flow, globalActions})', () => {
  const raiz = newBlock({}, { top: 0, left: 0 }, 'raiz');
  raiz.root = true;
  const mapa = { raiz };
  const carregado = reduzir(stateInitial(), {
    tipo: 'carregar',
    mapa,
    global: {},
    configuracao: { Nome: 'Ana' },
  });

  const texto = exportText(carregado.mapa, carregado.global);
  assert.equal(JSON.parse(texto).configuration, undefined);

  const resultado = validateImport(texto);
  assert.equal(resultado.ok, true);
  assert.equal('configuration' in resultado, false);
  // A tela nunca despacha `carregar` a partir de um import (ver `import-exportar.ts`),
  // então `configuracao` continua a mesma depois de aplicar `mapa`/`global` do import.
  const depoisDoImport = resultado.ok
    ? reduzir(carregado, { tipo: 'aplicar', mapa: resultado.mapa })
    : carregado;
  assert.deepEqual(depoisDoImport.configuracao, { Nome: 'Ana' });
});

test('flowHasSurvey: true only when a block in the map is the satisfaction survey block', () => {
  const semPesquisa = { origem: newBlock({}, { top: 0, left: 0 }, 'origem') };
  assert.equal(flowHasSurvey(semPesquisa), false);

  const comPesquisa = {
    origem: newBlock({}, { top: 0, left: 0 }, 'origem'),
    'survey:1': newBlock({}, { top: 0, left: 0 }, 'survey:1'),
  };
  assert.equal(flowHasSurvey(comPesquisa), true);
});

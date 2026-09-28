import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockMarks, invalidBlocks } from '../src/pages/builder/error-marks.ts';
import { newBlock } from '../src/pages/builder/model.ts';

test('an output with no "Ir para" marks its index and turns the node red', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'inicio');
  block.$conditionOutputs = [
    { conditions: [{ source: 'input', comparison: 'equals', values: ['1'] }] },
  ];
  const marks = blockMarks(block, { inicio: block });
  assert.equal(marks.node, true);
  assert.deepEqual([...marks.outputs], [0]);
  assert.equal(marks.contentCards.size, 0);
  assert.equal(marks.actions.size, 0);
});

test('an empty text card marks its index and turns the node red', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'inicio');
  block.$contentActions = [{ action: { type: 'SendMessage', settings: { type: 'text/plain', content: '' } } }];
  const marks = blockMarks(block, { inicio: block });
  assert.equal(marks.node, true);
  assert.deepEqual([...marks.contentCards], [0]);
  assert.equal(marks.outputs.size, 0);
});

test('ProcessHttp with no URL marks the action id and turns the node red', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'inicio');
  block.$enteringCustomActions = [{ $id: 'a1', type: 'ProcessHttp', settings: { method: 'GET' } }];
  const marks = blockMarks(block, { inicio: block });
  assert.equal(marks.node, true);
  assert.deepEqual([...marks.actions], ['a1']);
  assert.equal(marks.outputs.size, 0);
  assert.equal(marks.contentCards.size, 0);
});

test('an engine message for the block turns the node red without marking any part', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'inicio');
  const marks = blockMarks(block, { inicio: block }, ['Existe um laço no fluxo.']);
  assert.equal(marks.node, true);
  assert.equal(marks.outputs.size, 0);
  assert.equal(marks.contentCards.size, 0);
  assert.equal(marks.actions.size, 0);
  assert.ok(marks.messages.includes('Existe um laço no fluxo.'));
});

test('a fully valid block never turns red', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'inicio');
  const marks = blockMarks(block, { inicio: block });
  assert.equal(marks.node, false);
});

test('invalidBlocks lists every block id whose marks say node: true, including api-only errors', () => {
  const invalido = newBlock({}, { top: 0, left: 0 }, 'invalido');
  invalido.$conditionOutputs = [
    { conditions: [{ source: 'input', comparison: 'equals', values: ['1'] }] },
  ];
  const valido = newBlock({}, { top: 100, left: 0 }, 'valido');
  const soApi = newBlock({}, { top: 200, left: 0 }, 'so-api');
  const mapa = { invalido, valido, 'so-api': soApi };

  const ids = invalidBlocks(mapa, [{ block: 'so-api', mensagem: 'Bloco sem entrada de usuário.' }]);
  assert.deepEqual([...ids].sort(), ['invalido', 'so-api']);
});

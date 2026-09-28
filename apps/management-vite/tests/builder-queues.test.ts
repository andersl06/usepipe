import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newBlock, attendanceNewBlock, type Mapa } from '../src/pages/builder/model.ts';
import {
  filterQueues,
  hasAttendanceBlock,
  pageQueues,
  queueNameError,
  queuesPanelReducer,
} from '../src/pages/builder/queues-panel.ts';

test('hasAttendanceBlock: false com um mapa sem bloco de atendimento', () => {
  const mapa: Mapa = { inicio: newBlock({}, { top: 0, left: 0 }, 'inicio') };
  assert.equal(hasAttendanceBlock(mapa), false);
});

test('hasAttendanceBlock: true com pelo menos um bloco de atendimento', () => {
  const humano = attendanceNewBlock({}, { top: 0, left: 0 });
  const mapa: Mapa = { inicio: newBlock({}, { top: 0, left: 0 }, 'inicio'), [humano.id]: humano };
  assert.equal(hasAttendanceBlock(mapa), true);
});

test('queueNameError: nome vazio', () => {
  assert.equal(queueNameError('', []), 'Você precisa dar um nome para essa fila');
  assert.equal(queueNameError('   ', []), 'Você precisa dar um nome para essa fila');
});

test('queueNameError: nome repetido, sem diferenciar maiúsculas', () => {
  assert.equal(queueNameError('suporte', [{ name: 'Suporte' }]), 'Já existe uma fila com esse nome.');
});

test('queueNameError: DIRECT_TRANSFER é reservado', () => {
  assert.equal(queueNameError('DIRECT_TRANSFER', []), 'reservado');
  assert.equal(queueNameError('direct_transfer', []), 'reservado');
});

test('queueNameError: nome válido não gera erro', () => {
  assert.equal(queueNameError('Cobrança', [{ name: 'Suporte' }]), null);
});

test('queueNameError: espaços nas pontas não contam', () => {
  assert.equal(queueNameError('  Suporte  ', [{ name: 'Suporte' }]), 'Já existe uma fila com esse nome.');
});

test('filterQueues: casa por nome sem diferenciar maiúsculas', () => {
  const filas = [{ name: 'Suporte' }, { name: 'Financeiro' }];
  assert.deepEqual(filterQueues(filas, 'sup'), [{ name: 'Suporte' }]);
});

test('filterQueues: termo vazio devolve tudo', () => {
  const filas = [{ name: 'Suporte' }, { name: 'Financeiro' }];
  assert.deepEqual(filterQueues(filas, '  '), filas);
});

test('pageQueues: 100 por página', () => {
  const filas = Array.from({ length: 150 }, (_, i) => ({ name: `Fila ${i}` }));
  const pagina1 = pageQueues(filas, 1);
  assert.equal(pagina1.visiveis.length, 100);
  assert.equal(pagina1.total, 150);
  assert.equal(pagina1.temMais, true);

  const pagina2 = pageQueues(filas, 2);
  assert.equal(pagina2.visiveis.length, 150);
  assert.equal(pagina2.temMais, false);
});

test('queuesPanelReducer: lista -> abrirCriar -> criar', () => {
  const estado = queuesPanelReducer({ modo: 'lista' }, { tipo: 'abrirCriar' });
  assert.deepEqual(estado, { modo: 'criar' });
});

test('queuesPanelReducer: criada(id) -> regras(id)', () => {
  const estado = queuesPanelReducer({ modo: 'criar' }, { tipo: 'criada', id: 'f1' });
  assert.deepEqual(estado, { modo: 'regras', id: 'f1' });
});

test('queuesPanelReducer: editar(id) -> regras(id)', () => {
  const estado = queuesPanelReducer({ modo: 'lista' }, { tipo: 'editar', id: 'f2' });
  assert.deepEqual(estado, { modo: 'regras', id: 'f2' });
});

test('queuesPanelReducer: voltar -> lista', () => {
  const estado = queuesPanelReducer({ modo: 'regras', id: 'f2' }, { tipo: 'voltar' });
  assert.deepEqual(estado, { modo: 'lista' });
});

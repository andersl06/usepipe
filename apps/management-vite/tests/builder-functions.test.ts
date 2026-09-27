import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterFlowFunctions, functionCallSnippet } from '../src/pages/builder/flow-functions.ts';

const FUNCTIONS = [
  {
    id: '1', tenantId: 't', flowId: null, name: 'calculoDeFrete',
    description: 'Calcula o total do frete.', parameters: ['cep'],
    code: 'function calculoDeFrete(cep) { return cep; }', version: 1, scope: 'tenant' as const,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '2', tenantId: 't', flowId: null, name: 'saudacao',
    description: 'Monta a saudação do dia.', parameters: [],
    code: 'function saudacao() { return "oi"; }', version: 1, scope: 'tenant' as const,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

test('functions: filterFlowFunctions matches the name, ignoring accent and case', () => {
  assert.deepEqual(
    filterFlowFunctions(FUNCTIONS, 'calcul').map((f) => f.name),
    ['calculoDeFrete'],
  );
  assert.deepEqual(
    filterFlowFunctions(FUNCTIONS, 'SAUDACAO').map((f) => f.name),
    ['saudacao'],
  );
});

test('functions: filterFlowFunctions also matches the description', () => {
  assert.deepEqual(
    filterFlowFunctions(FUNCTIONS, 'calcula o total').map((f) => f.name),
    ['calculoDeFrete'],
  );
});

test('functions: an empty or blank search returns every function in the original order', () => {
  assert.deepEqual(filterFlowFunctions(FUNCTIONS, ''), FUNCTIONS);
  assert.deepEqual(filterFlowFunctions(FUNCTIONS, '   '), FUNCTIONS);
});

test('functions: a search with no match returns an empty list', () => {
  assert.deepEqual(filterFlowFunctions(FUNCTIONS, 'zzz'), []);
});

test('functions: functionCallSnippet formats the call as name(param1, param2)', () => {
  assert.equal(functionCallSnippet(FUNCTIONS[0]!), 'calculoDeFrete(cep)');
  assert.equal(functionCallSnippet(FUNCTIONS[1]!), 'saudacao()');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterFlowFunctions, functionCallSnippet, inUseWarning, insertLibraryCall, otherFlowsUsing,
} from '../src/pages/builder/flow-functions.ts';
import {
  SCRIPT_TEMPLATE, actionErrors, functionReference, withFunctionReference,
} from '../src/pages/builder/actions-of-block.ts';

const FUNCTIONS = [
  {
    id: '1', tenantId: 't', name: 'calculoDeFrete',
    description: 'Calcula o total do frete.', parameters: ['cep'],
    code: 'function calculoDeFrete(cep) { return cep; }', version: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '2', tenantId: 't', name: 'saudacao',
    description: 'Monta a saudação do dia.', parameters: [],
    code: 'function saudacao() { return "oi"; }', version: 1,
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

test('functions: inserting a library call puts it inside run, never at the top level (CR-07)', () => {
  const inserido = insertLibraryCall(SCRIPT_TEMPLATE, FUNCTIONS[0]!);
  // The parameter becomes run's own parameter (fed by "Variáveis de entrada"), so the call never
  // references an undeclared name, and it only runs when the engine calls run.
  assert.equal(inserido, 'function run(cep) {\n  calculoDeFrete(cep);\n  return;\n}\n');
  // Already declared parameters are reused; a custom function name (V1 `function`) is honoured.
  assert.equal(
    insertLibraryCall('async function principal(cep, outro) {\n  return 1;\n}', FUNCTIONS[0]!, 'principal'),
    'async function principal(cep, outro) {\n  calculoDeFrete(cep);\n  return 1;\n}',
  );
  // No entry function to insert into: kept as a comment instead of a call that runs at load.
  assert.equal(insertLibraryCall('const x = 1;', FUNCTIONS[1]!), 'const x = 1;\n// saudacao()');
});

test('functions: the inserted call runs in the engine once the library is in scope (CR-07)', () => {
  const source = insertLibraryCall(SCRIPT_TEMPLATE, FUNCTIONS[0]!).replace('  return;', '  return calculoDeFrete(cep);');
  // Mirrors the API sandbox prelude: the library function is in scope when run is called.
  const run = new Function(`function calculoDeFrete(cep) { return 'frete ' + cep; }\n${source}\nreturn run;`)() as (cep: string) => string;
  assert.equal(run('01001-000'), 'frete 01001-000');
});

/* P10 / D-57: the library belongs to the account. */

const USAGE = [
  { flowId: 'f1', flowName: 'Vendas', shortName: 'vendas' },
  { flowId: 'f2', flowName: 'Suporte', shortName: 'suporte' },
  { flowId: 'f3', flowName: 'Cobrança', shortName: 'cobranca' },
  { flowId: 'f4', flowName: 'Pós-venda', shortName: 'pos-venda' },
  { flowId: 'f5', flowName: 'Ouvidoria', shortName: 'ouvidoria' },
];

test('functions: otherFlowsUsing leaves out the flow open in the Builder', () => {
  assert.deepEqual(otherFlowsUsing(USAGE.slice(0, 2), 'f1').map((f) => f.flowId), ['f2']);
  assert.deepEqual(otherFlowsUsing(USAGE.slice(0, 1), 'f1'), []);
  assert.equal(otherFlowsUsing(USAGE.slice(0, 2), undefined).length, 2);
});

test('functions: inUseWarning says "em uso em outros bots" and names up to three', () => {
  assert.equal(inUseWarning([], 'editar'), null);
  assert.equal(
    inUseWarning(USAGE.slice(1, 3), 'editar'),
    'Esta função está em uso em outros bots (Suporte, Cobrança). As alterações valem para todos eles.',
  );
  const excluir = inUseWarning(USAGE, 'excluir')!;
  assert.match(excluir, /em uso em outros bots \(Vendas, Suporte, Cobrança e mais 2\)/);
  assert.match(excluir, /deixarem de funcionar/);
});

const BLIP_ID = '3b7e1a52-9c4d-4f1e-8a6b-2d5c7e9f0a13';

test('functions: ExecuteBlipFunction reads Blip source first, then the legacy functionId', () => {
  const blip = { type: 'ExecuteBlipFunction', settings: { source: BLIP_ID, outputVariable: 'r' } };
  const legado = { type: 'ExecuteBlipFunction', settings: { functionId: 'antigo', outputVariable: 'r' } };
  assert.equal(functionReference(blip), BLIP_ID);
  assert.equal(functionReference(legado), 'antigo');
  assert.deepEqual(actionErrors(blip), []);
  assert.deepEqual(actionErrors(legado), []);
  assert.deepEqual(actionErrors({ type: 'ExecuteBlipFunction', settings: { outputVariable: 'r' } }), [
    'Definição da função: campo obrigatório.',
  ]);
});

test('functions: picking a function writes source and drops functionId', () => {
  const acao = withFunctionReference({ type: 'ExecuteBlipFunction', settings: { functionId: 'antigo', outputVariable: 'r' } }, BLIP_ID);
  assert.deepEqual(acao.settings, { outputVariable: 'r', source: BLIP_ID });
});

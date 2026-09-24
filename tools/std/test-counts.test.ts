import assert from 'node:assert/strict';
import test from 'node:test';
import { appliedPackageRenames, baselineFromMarkdown, compareCounts, knownFlakyPaths, onlyKnownFlakyFailures, parseTestCounts } from './test-counts.ts';
import type { MapRow } from './lib/map.ts';

test('lê Vitest e node:test com prefixos Turbo e falhas por arquivo', () => {
  const counts = parseTestCounts([
    '@pipe/api:test:  FAIL  tests/fluxo.test.ts > caso',
    '@pipe/api:test:  Tests  1 failed | 653 passed (654)',
    '@pipe/desk-vite:test: ℹ pass 27',
    '@pipe/desk-vite:test: ℹ fail 0',
    '@pipe/desk-vite:test: ℹ skipped 0',
  ].join('\n'));
  assert.deepEqual(counts['@pipe/api'], { passed: 653, failed: 1, skipped: 0, files_failed: ['tests/fluxo.test.ts'] });
  assert.equal(counts['@pipe/desk-vite']?.passed, 27);
});

test('baseline em Markdown impede contagem zero em pacote node:test', () => {
  const expected = baselineFromMarkdown('| @pipe/desk-vite | node:test | 27 | 0 | 0 |');
  assert.equal(expected['@pipe/desk-vite']?.passed, 27);
  assert.equal(compareCounts({ '@pipe/desk-vite': { passed: 0, failed: 0, skipped: 0, files_failed: [] } }, expected, {}).length, 1);
});

test('pacote aprovado mas não aplicado não traduz a chave da baseline', () => {
  const row = { kind: 'package', old: '@pipe/antigo', new: '@pipe/new', status: 'approved' } as MapRow;
  assert.deepEqual(appliedPackageRenames([row]), {});
  assert.equal(compareCounts({ '@pipe/new': { passed: 5, failed: 0, skipped: 0, files_failed: [] } },
    { '@pipe/antigo': { passed: 5, failed: 0, skipped: 0, files_failed: [] } }, appliedPackageRenames([row])).length, 1);
  assert.deepEqual(appliedPackageRenames([{ ...row, status: 'verified' }]), { '@pipe/antigo': '@pipe/new' });
});

test('zero testes, falhas e remoções acima da exceção impedem PASS', () => {
  const baseline = { '@pipe/api': { passed: 653, failed: 0, skipped: 0, files_failed: [] } };
  assert.equal(compareCounts({}, baseline, {}).length, 1);
  assert.equal(compareCounts({ '@pipe/api': { passed: 0, failed: 0, skipped: 0, files_failed: [] } }, baseline, {}).length, 1);
  assert.equal(compareCounts({ '@pipe/api': { passed: 652, failed: 0, skipped: 0, files_failed: [] } }, baseline, {}, { '@pipe/api': 1 }).length, 0);
  assert.equal(compareCounts({ '@pipe/api': { passed: 652, failed: 1, skipped: 0, files_failed: [] } }, baseline, {}, { '@pipe/api': 1 }).length, 1);
});

test('exceção de flaky rejeita nome parecido e mesmo nome em outro pacote', () => {
  const make = (pkg: string, file: string) => ({ [pkg]: { passed: 1, failed: 1, skipped: 0, files_failed: [file] } });
  assert.equal(onlyKnownFlakyFailures(make('@pipe/api', 'tests/fluxo.test.ts'), []), true);
  assert.equal(onlyKnownFlakyFailures(make('@pipe/api', 'tests/fluxo-extra.test.ts'), []), false);
  assert.equal(onlyKnownFlakyFailures(make('@pipe/workers', 'tests/fluxo.test.ts'), []), false);
  assert.equal(onlyKnownFlakyFailures(make('@pipe/api', 'tests\\fluxo.test.ts'), []), true);
  const rename = { kind: 'file', old: 'apps/api/tests/fluxo.test.ts', new: 'apps/api/tests/flow.test.ts', status: 'applied' } as MapRow;
  assert.equal(knownFlakyPaths([rename])[1], 'tests/flow.test.ts');
  assert.equal(onlyKnownFlakyFailures(make('@pipe/api', 'tests/flow.test.ts'), [rename]), true);
  assert.equal(onlyKnownFlakyFailures(make('@pipe/api', 'tests/fluxo.test.ts'), [rename]), false);
});

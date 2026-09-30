import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv, toCsv } from './lib/csv.ts';

const reports = '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports';
const [headers, ...rows] = parseCsv(readFileSync(`${reports}/std11-classified-scan.csv`, 'utf8'));
const at = (name: string) => { const index = headers.indexOf(name); assert(index >= 0, name); return index; };
const fileIndex = at('file'), kindIndex = at('kind'), categoryIndex = at('category');
const scopes = ['packages', 'api-domain', 'api-core', 'api-tests', 'mgmt-pages', 'mgmt-rest-desk', 'crm-tools-site', 'infra', 'comments'];
function scopeOf(file: string, kind: string): string {
  const infra = file.startsWith('infra/') || /(^|\/)Dockerfile(?:\.|$)|(^|\/)docker-compose|(^|\/)\.dockerignore$/.test(file) || ['pnpm-workspace.yaml', 'package.json'].includes(file);
  if (infra) return 'infra';
  if (kind === 'comment') return 'comments';
  if (file.startsWith('packages/')) return 'packages';
  if (file.startsWith('apps/api/src/domain/')) return 'api-domain';
  if (/^apps\/(?:api\/src|workers|bridge)\//.test(file)) return 'api-core';
  if (file.startsWith('apps/api/tests/')) return 'api-tests';
  if (file.startsWith('apps/management-vite/src/pages/')) return 'mgmt-pages';
  if (/^apps\/(?:management-vite|desk-vite)\//.test(file)) return 'mgmt-rest-desk';
  if (/^(?:apps\/(?:crm|site)|tools|scripts|docs)\//.test(file)) return 'crm-tools-site';
  // Package/config paths outside src/tests still belong to their app's rename owner.
  if (file.startsWith('apps/api/')) return 'api-core';
  if (!file.includes('/')) return 'infra';
  throw new Error(`No worklist owner for ${file}`);
}

assert.equal(scopeOf('infra/compose/bootstrap.sh', 'comment'), 'infra');
assert.equal(scopeOf('apps/api/src/domain/flow.ts', 'comment'), 'comments');
assert.equal(scopeOf('apps/api/src/domain/flow.ts', 'identifier'), 'api-domain');
assert.equal(scopeOf('apps/management-vite/Dockerfile', 'path'), 'infra');
assert.equal(scopeOf('apps/api/vitest.config.ts', 'identifier'), 'api-core');

const unclassified = rows.filter(row => !row[categoryIndex]);
const buckets = new Map(scopes.map(scope => [scope, [] as string[][]]));
for (const row of unclassified) buckets.get(scopeOf(row[fileIndex], row[kindIndex]))!.push(row);
const summary = readFileSync(`${reports}/std11-classified-scan-summary.md`, 'utf8');
assert.equal(Number(/^Unclassified: (\d+)$/m.exec(summary)?.[1]), unclassified.length);
assert.equal([...buckets.values()].reduce((count, bucket) => count + bucket.length, 0), unclassified.length);
const before = readFileSync(`${reports}/std11-before-scan-summary.md`, 'utf8');
assert.equal(/^Lexicon: (.+)$/m.exec(summary)?.[1], /^Lexicon: (.+)$/m.exec(before)?.[1]);
assert.equal(rows.filter(row => row[kindIndex] === 'identifier' && row[categoryIndex] === 'A').length, 0);
for (const [scope, bucket] of buckets) {
  writeFileSync(`${reports}/std11-worklist-${scope}.csv`, toCsv([headers, ...bucket]));
  console.log(`${scope}=${bucket.length}`);
}
console.log(`total=${unclassified.length} uncovered=0 overlap=0 identifier-A=0 lexicon=unchanged`);

const refIndex = at('exception_ref');
const auditGroups: [string, (row: string[]) => boolean, (row: string[]) => boolean][] = [
  ['ddl', row => row[kindIndex] === 'sql-name' && row[refIndex] === 'D-08', row => row[kindIndex] === 'sql-name'],
  ['quoted-comment', row => row[kindIndex] === 'comment' && row[categoryIndex] === 'A' && row[refIndex] === 'D-17', row => row[kindIndex] === 'comment'],
  ...['string-literal', 'literal-value'].map(kind => [
    `product-${kind}`, (row: string[]) => row[kindIndex] === kind && row[categoryIndex] === 'A' && row[refIndex] === 'STD-10',
    (row: string[]) => row[kindIndex] === kind,
  ] as [string, (row: string[]) => boolean, (row: string[]) => boolean]),
  ['migration-path', row => row[kindIndex] === 'path' && row[refIndex] === 'D-08', row => row[kindIndex] === 'path'],
  ['site-path', row => row[kindIndex] === 'path' && row[refIndex] === 'D-47', row => row[kindIndex] === 'path'],
];
function sample(population: string[][], limit: number): string[][] {
  const files = new Map<string, string[][]>();
  for (const row of population) {
    const bucket = files.get(row[fileIndex]) ?? [];
    bucket.push(row); files.set(row[fileIndex], bucket);
  }
  const result: string[][] = [];
  for (let round = 0; result.length < Math.min(limit, population.length); round++) {
    for (const bucket of files.values()) {
      if (bucket[round]) result.push(bucket[round]);
      if (result.length === limit) break;
    }
  }
  return result;
}
const audit: string[][] = [];
for (const [rule, matches, sameKind] of auditGroups) {
  const selected = rows.filter(matches);
  // Every migration path is its own journal-backed exception, so review all of them.
  for (const row of sample(selected, rule === 'migration-path' ? selected.length : 50)) audit.push([rule, 'classified', ...row]);
  for (const row of sample(unclassified.filter(sameKind), 50)) audit.push([rule, 'excluded', ...row]);
  console.log(`audit ${rule}: matches=${selected.length}`);
}
writeFileSync(`${reports}/std11-audit-sample.csv`, toCsv([['rule', 'selection', ...headers], ...audit]));

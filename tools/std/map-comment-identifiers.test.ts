import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { toCsv } from './lib/csv.ts';
import { MAP_COLUMNS, type MapRow } from './lib/map.ts';
import { mapCommentIdentifiers } from './map-comment-identifiers.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, 'fixtures/comment-identifiers');
function row(id: string, old: string, replacement: string, kind: string, scope = 'api'): MapRow {
  return {
    id,
    scope,
    slice: '2',
    kind,
    old,
    new: replacement,
    declared_at: '',
    consumers: '',
    persisted: 'no',
    category: '',
    decision_ref: 'D-48',
    status: 'approved',
    owner: 'test',
    notes: '',
  };
}
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-ids-'));
  fs.cpSync(fixtureDir, root, { recursive: true });
  const std = path.join(root, 'std');
  const mapDir = path.join(std, 'map');
  fs.mkdirSync(mapDir, { recursive: true });
  const rows = [
    row('run', 'rodarFluxo', 'runFlow', 'symbol'),
    row('near', 'rodarFluxoNaEntrada', 'runFlowAtEntry', 'ts-local'),
    row('flow', 'fluxo', 'flow', 'ts-prop'),
    row('file', 'entrada.ts', 'domain/inbound.ts', 'file'),
    row('dir', 'apps/api/src/dominio', 'apps/api/src/domain', 'dir'),
    row('endpoint', '/v1/fluxos', '/v1/flows', 'endpoint'),
    row('route', '/painel', '/dashboard', 'front-route'),
    row('query', 'fluxo', 'flow', 'query-param'),
    row('queue', 'fila-entrada', 'inbound-queue', 'queue'),
    row('class', 'acoes-em-lote', 'bulk-actions', 'css-class', 'css'),
    row('var', '--cor-antiga', '--old-color', 'css-var', 'css'),
    row('attr', 'data-bloco', 'data-block', 'data-attr', 'css'),
    row('persisted', 'codigo_gravado', 'stored_code', 'symbol'),
    row('amb1', 'modo_antigo', 'oldMode', 'symbol'),
    row('amb2', 'modo_antigo', 'previousMode', 'ts-prop', 'workers'),
  ];
  for (const scope of new Set(rows.map((entry) => entry.scope)))
    fs.writeFileSync(
      path.join(mapDir, `${scope}.csv`),
      toCsv([
        [...MAP_COLUMNS],
        ...rows
          .filter((entry) => entry.scope === scope)
          .map((entry) => MAP_COLUMNS.map((column) => entry[column])),
      ]),
    );
  fs.writeFileSync(path.join(std, 'persisted.csv'), 'id,old\np,codigo_gravado\n');
  fs.writeFileSync(
    path.join(std, 'exceptions.csv'),
    'glob,pattern,kind,category,justification,ref\n**,^codigo_gravado$,literal-value,B,persisted,persisted.csv:p\n',
  );
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '.'], { cwd: root });
  return { root, mapDir };
}
function sample(root: string, name = 'sample.ts') {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

test('dry run reports counts and conflicts without writing', (t) => {
  const { root, mapDir } = setup();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = sample(root);
  const logs: string[] = [];
  const result = mapCommentIdentifiers({
    root,
    mapDir,
    dryRun: true,
    log: (line) => logs.push(line),
  });
  assert.ok(result.replacements > 0);
  assert.equal(sample(root), before);
  assert.deepEqual(result.ambiguous, ['modo_antigo']);
  assert.ok(result.skipped.ambiguous > 0);
  assert.ok(result.skipped.persisted > 0);
  assert.match(logs.join('\n'), /sample\.ts: \d+/);
  assert.match(logs.join('\n'), /top:/);
});

test('write changes comments in all supported extensions and remains idempotent', (t) => {
  const { root, mapDir } = setup();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = mapCommentIdentifiers({ root, mapDir, write: true, log() {} });
  assert.ok(first.replacements > 0);
  const ts = sample(root);
  assert.match(ts, /`runFlow` calls inbound\.ts, not runFlowAtEntry or entrada\.tsx/);
  assert.match(ts, /The fluxo goes through runFlow\(\); fluxo is ordinary prose/);
  assert.match(ts, /fluxo: ordinary prose; `flow`: an identifier/);
  assert.match(ts, /apps\/api\/src\/domain\/inbound\.ts/);
  assert.match(ts, /and \/v1\/flows\./);
  assert.match(ts, /https:\/\/example\.org\/v1\/fluxos\?fluxo=1/);
  assert.match(ts, /\?flow=1 is a local query parameter/);
  assert.match(ts, /\/v1\/fluxos-extra and \/painel-extra stay; \/dashboard is a local route/);
  assert.match(ts, /"runFlow" is quoted as an identifier; `data-block` is an attribute/);
  assert.match(ts, /`codigo_gravado` is persisted/);
  assert.match(ts, /`modo_antigo` is ambiguous/);
  assert.match(ts, /const untouched = "\/\/ rodarFluxo/);
  assert.match(sample(root, 'sample.tsx'), /\{\/\* `runFlow` \*\/\}/);
  assert.match(sample(root, 'sample.mjs'), /\/\/ `runFlow`/);
  assert.match(sample(root, 'sample.cjs'), /\/\* `runFlow`/);
  assert.match(sample(root, 'sample.css'), /\.bulk-actions and --old-color/);
  assert.match(sample(root, 'sample.css'), /\.acoes-em-lote-extra stays/);
  assert.match(sample(root, 'sample.css'), /content: "\/\* \.acoes-em-lote \*\/"/);
  const second = mapCommentIdentifiers({ root, mapDir, write: true, log() {} });
  assert.equal(second.replacements, 0);
});

test('scopes select rows and conflicting mode flags are rejected', (t) => {
  const { root, mapDir } = setup();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = mapCommentIdentifiers({ root, mapDir, scopes: ['css'], dryRun: true, log() {} });
  assert.ok(result.replacements > 0);
  assert.equal(result.ambiguous.length, 0);
  assert.ok(
    result.top.every((entry) => ['css-class', 'css-var', 'data-attr'].includes(entry.kind)),
  );
  assert.throws(
    () => mapCommentIdentifiers({ root, mapDir, write: true, dryRun: true, log() {} }),
    /choose/,
  );
});

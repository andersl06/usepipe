import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from './lib/csv.ts';
import { readMap } from './lib/map.ts';
import { renameSymbols } from './rename-symbols.ts';
import { moveFiles } from './move-files.ts';
import { rewriteLiterals } from './rewrite-literals.ts';

const stdDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(stdDir, 'fixtures/mini');

function copyFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'std-engine-'));
  fs.cpSync(fixtureDir, root, { recursive: true });
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('CSV RFC4180 round-trips quoted commas and newlines byte-identically', () => {
  const csv = 'a,b,c\n1,"two,parts","three\nlines"\n';
  assert.equal(toCsv(parseCsv(csv)), csv);
});

test('renames a symbol across static, type, re-export, shorthand and typeof import uses', () => {
  const root = copyFixture();
  const result = renameSymbols({ root, mapDir: path.join(root, 'map'), log() {} });
  assert.deepEqual(result, { applied: 1, missingIds: [] });
  const all = [
    'packages/core/src/erros.ts',
    'packages/core/src/index.ts',
    'apps/api/src/uso.ts',
    'apps/api/src/dinamico.ts',
  ]
    .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(all, /\bErroPipe\b/);
  assert.match(all, /class PipeError/);
  assert.match(all, /\{ PipeError \}/);
  assert.doesNotMatch(all, /PipeError:\s*ErroPipe/);
  assert.match(all, /typeof import\([^)]*erros\.js'\)\.PipeError/);
});

test('only approved rows are applied and their status becomes applied', () => {
  const root = copyFixture();
  renameSymbols({ root, mapDir: path.join(root, 'map'), log() {} });
  const rows = readMap(path.join(root, 'map'));
  assert.equal(rows.find((row) => row.id === 'CORE-001')?.status, 'applied');
  assert.equal(rows.find((row) => row.id === 'CORE-002')?.status, 'proposed');
});

test('missing declarations fail the CLI and name the row id', () => {
  const root = copyFixture();
  const map = path.join(root, 'map/core.csv');
  fs.appendFileSync(
    map,
    'CORE-003,core,1,symbol,Falta,Missing,packages/core/src/erros.ts:99,,no,,,approved,sonnet,\n',
  );
  const run = spawnSync(
    process.execPath,
    [path.join(stdDir, 'rename-symbols.ts'), '--root', root, '--map', path.join(root, 'map')],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 1);
  assert.match(`${run.stdout}${run.stderr}`, /CORE-003/);
});

test('dry-run lists missing declarations, exits zero and changes nothing', () => {
  const root = copyFixture();
  const map = path.join(root, 'map/core.csv');
  fs.appendFileSync(
    map,
    'CORE-003,core,1,symbol,Falta,Missing,packages/core/src/erros.ts:99,,no,,,approved,sonnet,\n',
  );
  const before = fs.readFileSync(path.join(root, 'packages/core/src/erros.ts'), 'utf8');
  const run = spawnSync(
    process.execPath,
    [
      path.join(stdDir, 'rename-symbols.ts'),
      '--root',
      root,
      '--map',
      path.join(root, 'map'),
      '--dry-run',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0);
  assert.match(`${run.stdout}${run.stderr}`, /CORE-003/);
  assert.equal(fs.readFileSync(path.join(root, 'packages/core/src/erros.ts'), 'utf8'), before);
});

test('wire-key is rejected with rewrite-literals guidance', () => {
  const root = copyFixture();
  const run = spawnSync(
    process.execPath,
    [
      path.join(stdDir, 'rename-symbols.ts'),
      '--root',
      root,
      '--map',
      path.join(root, 'map'),
      '--kinds',
      'symbol,wire-key',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 2);
  assert.match(`${run.stdout}${run.stderr}`, /wire-key rows are applied by rewrite-literals\.ts/);
});

test('moves dirs/files with git mv and preserves each module specifier style', () => {
  const root = copyFixture();
  const result = moveFiles({
    root,
    mapDir: path.join(root, 'map'),
    ids: ['MOVE-001', 'MOVE-002', 'MOVE-003', 'MOVE-004', 'MOVE-005'],
    log() {},
  });
  assert.equal(result.moved, 5);
  assert.ok(fs.existsSync(path.join(root, 'packages/core/src/metrics/index.ts')));
  assert.ok(fs.existsSync(path.join(root, 'packages/core/src/errors.ts')));
  assert.ok(fs.existsSync(path.join(root, 'apps/api/src/usage.ts')));
  assert.ok(fs.existsSync(path.join(root, 'apps/front/src/lib/helper.ts')));
  assert.ok(fs.existsSync(path.join(root, 'apps/api/src/caso.ts')));
  assert.match(
    fs.readFileSync(path.join(root, 'packages/core/src/index.ts'), 'utf8'),
    /\.\/metrics\/index\.js/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'apps/api/src/dinamico.ts'), 'utf8'),
    /import\('\.\/usage\.js'\)/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'apps/api/tests/uso.test.ts'), 'utf8'),
    /\.\.\/src\/usage\.js/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'apps/api/src/dinamico.ts'), 'utf8'),
    /packages\/core\/src\/errors\.js/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'apps/front/src/pagina.tsx'), 'utf8'),
    /\.\/lib\/helper'/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'apps/front/tests/ajuda.test.ts'), 'utf8'),
    /\.\.\/src\/lib\/helper\.ts/,
  );
});

test('moves rewrite package exports and test/build config path strings', () => {
  const root = copyFixture();
  moveFiles({ root, mapDir: path.join(root, 'map'), ids: ['MOVE-001'], log() {} });
  assert.match(
    fs.readFileSync(path.join(root, 'packages/core/package.json'), 'utf8'),
    /dist\/metrics\/index/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'packages/core/tsconfig.json'), 'utf8'),
    /src\/metrics/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'apps/front/vite.config.ts'), 'utf8'),
    /src\/metrics/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'apps/api/vitest.config.ts'), 'utf8'),
    /src\/metrics/,
  );
});

test('move-files dry-run and ids selection make no changes', () => {
  const root = copyFixture();
  const before = fs.readFileSync(path.join(root, 'packages/core/src/index.ts'), 'utf8');
  const result = moveFiles({
    root,
    mapDir: path.join(root, 'map'),
    ids: ['MOVE-001'],
    dryRun: true,
    log() {},
  });
  assert.equal(result.moved, 0);
  assert.ok(fs.existsSync(path.join(root, 'packages/core/src/metricas/index.ts')));
  assert.equal(fs.readFileSync(path.join(root, 'packages/core/src/index.ts'), 'utf8'), before);
  assert.ok(fs.existsSync(path.join(root, 'apps/api/src/uso.ts')));
});

test('subpath-export rewrites package exports and import specifiers', () => {
  const root = copyFixture();
  const result = rewriteLiterals({
    root,
    mapDir: path.join(root, 'map'),
    ids: ['LIT-001'],
    log() {},
  });
  assert.ok(result.rewritten >= 2);
  assert.match(
    fs.readFileSync(path.join(root, 'packages/core/package.json'), 'utf8'),
    /\.\/metrics/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'apps/api/src/uso.ts'), 'utf8'),
    /@mini\/core\/metrics/,
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, 'apps/api/src/uso.ts'), 'utf8'),
    /@mini\/core\/metricas/,
  );
});

test('endpoint rewrite covers templates, decorators, app.use and query keys but not visible text', () => {
  const root = copyFixture();
  rewriteLiterals({ root, mapDir: path.join(root, 'map'), ids: ['LIT-002'], log() {} });
  const source = fs.readFileSync(path.join(root, 'apps/api/src/contracts.ts'), 'utf8');
  assert.match(source, /Controller\('v1\/conversations'\)/);
  assert.match(source, /Get\(':id\/messages'\)/);
  assert.match(source, /app\.use\('\/v1\/conversations\/:id\/messages'/);
  assert.match(source, /`\/v1\/conversations\/\$\{id\}\/messages\?x=1`/);
  assert.match(source, /queryKey: \['api', '\/v1\/conversations'\]/);
  assert.match(source, /'conversas e mensagens'/);
});

test('test titles, queue literals and referenced queue constants are rewritten in technical positions', () => {
  const root = copyFixture();
  rewriteLiterals({ root, mapDir: path.join(root, 'map'), ids: ['LIT-003', 'LIT-004'], log() {} });
  const source = fs.readFileSync(path.join(root, 'apps/api/src/contracts.ts'), 'utf8');
  assert.match(source, /describe\('does a thing'/);
  assert.match(source, /FILA_ENTRADA = 'pipe-input'/);
  assert.match(source, /new Worker\('pipe-input'\)/);
});

test('wire-key only rewrites any/unknown receivers in listed consumers', () => {
  const root = copyFixture();
  rewriteLiterals({ root, mapDir: path.join(root, 'map'), ids: ['LIT-005'], log() {} });
  const source = fs.readFileSync(path.join(root, 'apps/api/src/contracts.ts'), 'utf8');
  assert.match(source, /body\.contactId/);
  assert.match(source, /\{ contactId: 1 \}/);
  assert.match(source, /x\['contactId'\]/);
});

test('literal-value follows its union type without touching a plain string', () => {
  const root = copyFixture();
  rewriteLiterals({ root, mapDir: path.join(root, 'map'), ids: ['LIT-006'], log() {} });
  const source = fs.readFileSync(path.join(root, 'apps/api/src/contracts.ts'), 'utf8');
  assert.match(source, /Painel = 'open' \| 'fechado'/);
  assert.match(source, /painel: Painel = 'open'/);
  assert.match(source, /p === 'open'/);
  assert.match(source, /case 'open'/);
  assert.match(source, /setPainel\('open'\)/);
  assert.match(source, /toast\('aberto'\)/);
});

test('non-approved status requires dry-run for move and literal tools', () => {
  const root = copyFixture();
  assert.throws(
    () => moveFiles({ root, mapDir: path.join(root, 'map'), status: ['proposed'] }),
    (error: any) => error.exitCode === 2,
  );
  assert.throws(
    () => rewriteLiterals({ root, mapDir: path.join(root, 'map'), status: ['proposed'] }),
    (error: any) => error.exitCode === 2,
  );
  assert.doesNotThrow(() =>
    moveFiles({ root, mapDir: path.join(root, 'map'), status: ['proposed'], dryRun: true }),
  );
  assert.doesNotThrow(() =>
    rewriteLiterals({ root, mapDir: path.join(root, 'map'), status: ['proposed'], dryRun: true }),
  );
});

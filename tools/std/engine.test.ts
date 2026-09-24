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
    'packages/core/src/erros.ts', 'packages/core/src/index.ts',
    'apps/api/src/uso.ts', 'apps/api/src/dinamico.ts',
  ].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
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
  fs.appendFileSync(map, 'CORE-003,core,1,symbol,Falta,Missing,packages/core/src/erros.ts:99,,no,,,approved,sonnet,\n');
  const run = spawnSync(process.execPath, [path.join(stdDir, 'rename-symbols.ts'), '--root', root, '--map', path.join(root, 'map')], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(`${run.stdout}${run.stderr}`, /CORE-003/);
});

test('dry-run lists missing declarations, exits zero and changes nothing', () => {
  const root = copyFixture();
  const map = path.join(root, 'map/core.csv');
  fs.appendFileSync(map, 'CORE-003,core,1,symbol,Falta,Missing,packages/core/src/erros.ts:99,,no,,,approved,sonnet,\n');
  const before = fs.readFileSync(path.join(root, 'packages/core/src/erros.ts'), 'utf8');
  const run = spawnSync(process.execPath, [path.join(stdDir, 'rename-symbols.ts'), '--root', root, '--map', path.join(root, 'map'), '--dry-run'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(`${run.stdout}${run.stderr}`, /CORE-003/);
  assert.equal(fs.readFileSync(path.join(root, 'packages/core/src/erros.ts'), 'utf8'), before);
});

test('wire-key is rejected with rewrite-literals guidance', () => {
  const root = copyFixture();
  const run = spawnSync(process.execPath, [path.join(stdDir, 'rename-symbols.ts'), '--root', root, '--map', path.join(root, 'map'), '--kinds', 'symbol,wire-key'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(`${run.stdout}${run.stderr}`, /wire-key rows are applied by rewrite-literals\.ts/);
});

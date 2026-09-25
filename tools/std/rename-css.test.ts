import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from './lib/csv.ts';
import { readMap } from './lib/map.ts';
import { renameCss } from './rename-css.ts';

const stdDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(stdDir, 'fixtures/css-mini');

function copyFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'std-rename-css-'));
  fs.cpSync(fixtureDir, root, { recursive: true });
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  return root;
}
function read(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('CSS class selectors: chained/comma selectors renamed together, adjacent longer class left alone', () => {
  const root = copyFixture();
  renameCss({ root, mapDir: path.join(root, 'map'), log() {} });
  const css = read(root, 'apps/front/src/estilos.css');
  assert.match(css, /\.dk-empty-conversation, \.dk-empty-conversation:hover > \.x \{/);
  assert.match(css, /\.dk-conversa-vazia-2 \{/);
  assert.doesNotMatch(css, /\.dk-empty-conversation-2/);
});

test('custom properties: declaration, var() use, style object key and setProperty() all renamed', () => {
  const root = copyFixture();
  renameCss({ root, mapDir: path.join(root, 'map'), log() {} });
  const css = read(root, 'apps/front/src/estilos.css');
  assert.match(css, /--background-color: #fff;/);
  assert.match(css, /var\(--background-color\)/);
  assert.doesNotMatch(css, /--cor-fundo/);
  const tsx = read(root, 'apps/front/src/componente.tsx');
  assert.match(tsx, /'--background-color': '#000'/);
  assert.match(tsx, /setProperty\('--background-color', '#111'\)/);
});

test('className forms: string, clean template, clsx string/object key, classList.add and querySelector all renamed', () => {
  const root = copyFixture();
  renameCss({ root, mapDir: path.join(root, 'map'), log() {} });
  const tsx = read(root, 'apps/front/src/componente.tsx');
  assert.match(tsx, /className="a dk-empty-conversation b"/);
  assert.match(tsx, /className=\{`dk-empty-conversation \$\{estado\}`\}/);
  assert.match(tsx, /clsx\('dk-empty-conversation', \{ 'dk-conversa-vazia-2': aberto \}\)/);
  assert.match(tsx, /classList\.add\('dk-empty-conversation'\)/);
  assert.match(tsx, /querySelector\('\.dk-empty-conversation'\)/);
});

test('dynamic template construction (`dk-${estado}`) is reported and left untouched', () => {
  const root = copyFixture();
  const result = renameCss({ root, mapDir: path.join(root, 'map'), log() {} });
  const tsx = read(root, 'apps/front/src/componente.tsx');
  assert.match(tsx, /className=\{`dk-\$\{estado\}`\}/);
  assert.equal(result.dynamicSites.length, 1);
  assert.match(result.dynamicSites[0].file, /componente\.tsx$/);
  assert.match(result.dynamicSites[0].snippet, /dk-\$\{estado\}/);
});

test('HTML: class attribute and inline <style> block renamed', () => {
  const root = copyFixture();
  renameCss({ root, mapDir: path.join(root, 'map'), log() {} });
  const html = read(root, 'apps/front/index.html');
  assert.match(html, /<style>\.dk-empty-conversation \{ color: red; \}<\/style>/);
  assert.match(html, /class="hero dk-empty-conversation"/);
});

test('JSX visible text is never touched', () => {
  const root = copyFixture();
  renameCss({ root, mapDir: path.join(root, 'map'), log() {} });
  const tsx = read(root, 'apps/front/src/componente.tsx');
  assert.match(tsx, /<p>dk-conversa-vazia<\/p>/);
});

test('data-attr rows: bare name, mapped value, dataset property and CSS/HTML attribute selectors all renamed', () => {
  const root = copyFixture();
  renameCss({ root, mapDir: path.join(root, 'map'), log() {} });
  const tsx = read(root, 'apps/front/src/componente.tsx');
  assert.match(tsx, /data-panel=\{aberto \? 'open' : 'fechado'\}/);
  assert.match(tsx, /data-unread="true"/);
  assert.match(tsx, /dataset\.unread = 'true';/);
  const css = read(root, 'apps/front/src/estilos.css');
  assert.match(css, /\[data-panel='open'\] \.y/);
  const html = read(root, 'apps/front/index.html');
  assert.match(html, /data-panel="open"/);
});

test('idempotent: re-running the rename against already-renamed text makes no further changes', () => {
  const root = copyFixture();
  const mapDir = path.join(root, 'map');
  renameCss({ root, mapDir, log() {} });
  const afterFirst = {
    css: read(root, 'apps/front/src/estilos.css'),
    tsx: read(root, 'apps/front/src/componente.tsx'),
    html: read(root, 'apps/front/index.html'),
  };
  // simulate a re-run: flip rows back to approved (in real usage `applied` rows
  // are never re-run, but the token-matching logic itself must be idempotent).
  const mapPath = path.join(mapDir, 'css.csv');
  const rows = parseCsv(fs.readFileSync(mapPath, 'utf8'));
  const header = rows[0];
  const statusIndex = header.indexOf('status');
  const reset = [header, ...rows.slice(1).map((row) => row.map((value, index) => (index === statusIndex ? 'approved' : value)))];
  fs.writeFileSync(mapPath, toCsv(reset), 'utf8');
  const result = renameCss({ root, mapDir, log() {} });
  assert.equal(result.totalReplacements, 0);
  assert.equal(read(root, 'apps/front/src/estilos.css'), afterFirst.css);
  assert.equal(read(root, 'apps/front/src/componente.tsx'), afterFirst.tsx);
  assert.equal(read(root, 'apps/front/index.html'), afterFirst.html);
});

test('dry-run reports counts and writes nothing to disk', () => {
  const root = copyFixture();
  const mapDir = path.join(root, 'map');
  const before = {
    css: read(root, 'apps/front/src/estilos.css'),
    tsx: read(root, 'apps/front/src/componente.tsx'),
    html: read(root, 'apps/front/index.html'),
  };
  const result = renameCss({ root, mapDir, dryRun: true, log() {} });
  assert.ok(result.totalReplacements > 0);
  assert.equal(read(root, 'apps/front/src/estilos.css'), before.css);
  assert.equal(read(root, 'apps/front/src/componente.tsx'), before.tsx);
  assert.equal(read(root, 'apps/front/index.html'), before.html);
  assert.deepEqual(readMap(mapDir).map((row) => row.status), Array(readMap(mapDir).length).fill('approved'));
});

test('unmatched rows are empty for the fixture map (every row has a real site)', () => {
  const root = copyFixture();
  const result = renameCss({ root, mapDir: path.join(root, 'map'), log() {} });
  assert.deepEqual(result.unmatchedIds, []);
});

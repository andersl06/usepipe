import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';

const SRC = join(import.meta.dirname, '..', 'src');

/** Class names deliberately defined in more than one stylesheet. */
const SHARED_ON_PURPOSE = new Set<string>([
  // Add `name` with a one-line reason per entry.
]);

/**
 * Collisions that predate this guard and sit outside the broken cf-/ct- screens.
 * The list may only shrink: a new collision fails the test.
 */
const LEGACY_COLLISIONS = new Set<string>([
  'tbl-legenda', 'tbl-search', 'cl-sel', 'pt-obra', 'pt-links-obra', 'ig-interruptor',
  'cr-botao', 'an-bp-btn', 'an-card-titulo', 'fx-column',
  'ph-cabecalho', 'ph-conteudo', 'ph-titulo', 'ph-direita',
]);

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return full.endsWith('.css') ? [full] : [];
  });
}

/** pages/builder/* is one screen family; everything else is its own file. */
function family(file: string): string {
  const rel = relative(SRC, file).split(sep).join('/');
  return rel.startsWith('pages/builder') ? 'pages/builder' : rel;
}

/**
 * Classes a stylesheet styles itself. In `.x .descendant`, `.x` only scopes the rule
 * (how global.css overrides shared controls inside a page wrapper), so only the last
 * compound selector counts as a definition.
 */
function classesOf(css: string): Set<string> {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Set<string>();
  // Selector position: the text before each `{`.
  for (const block of stripped.matchAll(/([^{}]+)\{/g)) {
    for (const selector of block[1]!.split(',')) {
      const last = selector.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() ?? '';
      for (const m of last.matchAll(/\.([a-z]{2,3}-[a-zA-Z0-9_-]+)/g)) out.add(m[1]!);
    }
  }
  return out;
}

test('page-prefixed CSS class names are not defined in unrelated stylesheets', () => {
  const owners = new Map<string, Set<string>>();
  for (const file of cssFiles(SRC)) {
    for (const name of classesOf(readFileSync(file, 'utf8'))) {
      const set = owners.get(name) ?? new Set<string>();
      set.add(family(file));
      owners.set(name, set);
    }
  }
  const collisions = [...owners]
    .filter(([name, files]) => files.size > 1 && !SHARED_ON_PURPOSE.has(name) && !LEGACY_COLLISIONS.has(name))
    .map(([name, files]) => `.${name}: ${[...files].join(', ')}`);
  assert.deepEqual(collisions, [], `Colliding classes:\n${collisions.join('\n')}`);
});

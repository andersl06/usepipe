import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { readMap, resolvePath, type MapRow } from './lib/map.ts';

const std = '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std';
const write = process.argv.includes('--write');
const rows = readMap(path.join(std, 'map')).filter((row) =>
  ['approved', 'applied', 'verified'].includes(row.status) &&
  ['symbol', 'ts-prop', 'ts-local'].includes(row.kind) &&
  /^[A-Za-z_$][\w$]*$/.test(row.old) && /^[A-Za-z_$][\w$]*$/.test(row.new) &&
  row.old !== row.new && row.new !== 'KEEP',
);
const files = execFileSync('git', ['ls-files', '-z', '--', 'apps', 'packages'], { encoding: 'utf8' })
  .split('\0').filter((file) => /\.[cm]?[jt]sx?$/.test(file) && fs.existsSync(file) &&
    !file.startsWith('apps/api/') && !file.startsWith('packages/core/'));

function scopeOf(file: string): string {
  const [, name] = file.split('/');
  return ({ 'management-vite': 'gestao-vite', authentication: 'packages-autenticacao',
    realtime: 'packages-tempo-real', storage: 'packages-armazenamento' } as Record<string, string>)[name] ??
    (file.startsWith('packages/') ? `packages-${name}` : name);
}

const rowsByScope = new Map<string, (MapRow & { localFile?: string })[]>();
for (const row of rows) {
  const list = rowsByScope.get(row.scope) ?? [];
  list.push({ ...row, localFile: row.kind === 'ts-local' ? resolvePath(row.declared_at.split(':')[0], rows) : undefined });
  rowsByScope.set(row.scope, list);
}

const availableByScope = new Map<string, Set<string>>();
for (const file of files) {
  const available = availableByScope.get(scopeOf(file)) ?? new Set<string>();
  const source = fs.readFileSync(file, 'utf8');
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false,
    file.endsWith('tsx') || file.endsWith('jsx') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.Identifier) available.add(scanner.getTokenText());
  }
  availableByScope.set(scopeOf(file), available);
}

function candidates(file: string): Map<string, string> {
  const relevant = (rowsByScope.get(scopeOf(file)) ?? []).filter((row) =>
    (row.kind !== 'ts-local' || row.localFile === file) &&
    availableByScope.get(scopeOf(file))?.has(row.new));
  const byOld = new Map<string, Set<string>>();
  for (const row of relevant) {
    const targets = byOld.get(row.old) ?? new Set<string>();
    targets.add(row.new);
    byOld.set(row.old, targets);
  }
  return new Map([...byOld].filter(([, targets]) => targets.size === 1)
    .map(([old, targets]) => [old, [...targets][0]!]));
}

let changedFiles = 0;
let replacements = 0;
for (const file of files) {
  const names = candidates(file);
  if (!names.size) continue;
  const source = fs.readFileSync(file, 'utf8');
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false,
    file.endsWith('tsx') || file.endsWith('jsx') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, source);
  const edits: { start: number; end: number; text: string }[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const start = scanner.getTokenPos();
    const comment = scanner.getTokenText();
    const updated = comment.replace(/`([A-Za-z_$][\w$]*)`/g, (full, old: string) => {
      const next = names.get(old);
      if (!next) return full;
      replacements++;
      return `\`${next}\``;
    });
    if (updated !== comment) edits.push({ start, end: start + comment.length, text: updated });
  }
  if (!edits.length) continue;
  changedFiles++;
  if (write) {
    let updated = source;
    for (const edit of edits.reverse()) updated = updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
    fs.writeFileSync(file, updated);
  }
}
console.log(`${write ? 'mapped' : 'would map'} ${replacements} comment identifiers in ${changedFiles} files`);

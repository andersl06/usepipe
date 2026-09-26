import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parseCsv } from './lib/csv.ts';
import { readMap, type MapRow } from './lib/map.ts';

const KINDS = new Set([
  'symbol',
  'ts-local',
  'ts-prop',
  'file',
  'dir',
  'endpoint',
  'front-route',
  'query-param',
  'queue',
  'css-class',
  'css-var',
  'data-attr',
]);
const IDENTIFIER = /[\p{L}\p{N}_$]/u;
const SPECIAL = new Set(['KEEP', 'REMOVE', 'STATE']);
type Span = { start: number; end: number };
type Change = { old: string; new: string; kind: string; count: number };
export interface CommentMapOptions {
  root?: string;
  mapDir: string;
  scopes?: string[];
  write?: boolean;
  dryRun?: boolean;
  log?: (line: string) => void;
}
export interface CommentMapResult {
  replacements: number;
  files: { file: string; count: number }[];
  top: Change[];
  ambiguous: string[];
  skipped: Record<string, number>;
}

function trackedFiles(root: string): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((file) => /\.(?:tsx?|mjs|cjs|css)$/.test(file))
    .map((file) => file.replaceAll('\\', '/'))
    .sort();
}

// TypeScript's scanner distinguishes comment trivia from // and /* inside strings,
// regular expressions, and template text. CSS needs its own small string-aware scan.
function commentSpans(source: string, file: string): Span[] {
  if (file.endsWith('.css')) {
    const spans: Span[] = [];
    let quote = '';
    for (let i = 0; i < source.length;) {
      const ch = source[i];
      if (quote) {
        if (ch === '\\') i += 2;
        else {
          if (ch === quote) quote = '';
          i++;
        }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
      } else if (source.startsWith('/*', i)) {
        const end = source.indexOf('*/', i + 2);
        const next = end < 0 ? source.length : end + 2;
        spans.push({ start: i, end: next });
        i = next;
      } else i++;
    }
    return spans;
  }
  const spans: Span[] = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    file.endsWith('.tsx') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    source,
  );
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    )
      spans.push({ start: scanner.getTokenPos(), end: scanner.getTextPos() });
  }
  return spans;
}

function protectedValues(std: string): Set<string> {
  const values = new Set<string>();
  const persisted = path.join(std, 'persisted.csv');
  if (fs.existsSync(persisted)) {
    const rows = parseCsv(fs.readFileSync(persisted, 'utf8'));
    const old = rows[0]?.indexOf('old') ?? -1;
    if (old >= 0) for (const row of rows.slice(1)) if (row[old]) values.add(row[old]);
  }
  const exceptions = path.join(std, 'exceptions.csv');
  if (fs.existsSync(exceptions)) {
    const rows = parseCsv(fs.readFileSync(exceptions, 'utf8'));
    const pattern = rows[0]?.indexOf('pattern') ?? -1;
    const category = rows[0]?.indexOf('category') ?? -1;
    if (pattern >= 0 && category >= 0)
      for (const row of rows.slice(1)) {
        if (row[category] !== 'B') continue;
        const exact = /^\^((?:\\.|[^\\^$*+?()[\]{}|])+)\$$/.exec(row[pattern] ?? '');
        if (exact) values.add(exact[1].replace(/\\(.)/g, '$1'));
      }
  }
  return values;
}

type Entry = { old: string; new: string; kind: string };
type Trie = { children: Map<string, Trie>; entry?: Entry };
function makeTrie(entries: Entry[]): Trie {
  const root: Trie = { children: new Map() };
  for (const entry of entries) {
    let node = root;
    for (const char of entry.old) {
      let next = node.children.get(char);
      if (!next) {
        next = { children: new Map() };
        node.children.set(char, next);
      }
      node = next;
    }
    node.entry = entry;
  }
  return root;
}
function candidates(trie: Trie, text: string, at: number): Entry[] {
  const found: Entry[] = [];
  let node: Trie | undefined = trie;
  for (let i = at; i < text.length; i++) {
    node = node.children.get(text[i]);
    if (!node) break;
    if (node.entry) found.push(node.entry);
  }
  return found.reverse();
}
function delimited(text: string, at: number, length: number, kind: string): boolean {
  const before = text[at - 1] ?? '';
  const after = text[at + length] ?? '';
  if (kind === 'endpoint' || kind === 'front-route')
    return (
      !IDENTIFIER.test(before) &&
      before !== '.' &&
      (after === '' ||
        /[\s/?#`'"),;\]}]/.test(after) ||
        (after === '.' && /\s|$/.test(text[at + length + 1] ?? '')))
    );
  if (kind === 'file' || kind === 'dir')
    return (
      !IDENTIFIER.test(before) &&
      before !== '-' &&
      before !== '.' &&
      (after === '' ||
        /[\s/?#`'"),;\]}]/.test(after) ||
        (after === '.' && /\s|$/.test(text[at + length + 1] ?? '')))
    );
  if (kind === 'css-class' || kind === 'css-var' || kind === 'data-attr')
    return !IDENTIFIER.test(before) && before !== '-' && !IDENTIFIER.test(after) && after !== '-';
  return !IDENTIFIER.test(before) && !IDENTIFIER.test(after);
}
function quoted(text: string, at: number, length: number): boolean {
  const before = text[at - 1] ?? '';
  const after = text[at + length] ?? '';
  return ['`', '"', "'"].includes(before) && before === after;
}
function technical(text: string, at: number, entry: Entry): boolean {
  const { old, kind } = entry;
  if (!delimited(text, at, old.length, kind)) return false;
  const before = text[at - 1] ?? '';
  const after = text[at + old.length] ?? '';
  if (kind === 'endpoint' || kind === 'front-route')
    return old.startsWith('/') && !/[\p{L}\p{N}]/u.test(before);
  if (kind === 'file' || kind === 'dir')
    return old.includes('/') || /\.[cm]?[jt]sx?$/.test(old) || /\.(?:json|css|md)$/.test(old);
  if (kind === 'css-class')
    return before === '.' || quoted(text, at, old.length) || /[-_]/.test(old);
  if (kind === 'query-param')
    return quoted(text, at, old.length) || ((before === '?' || before === '&') && after === '=');
  if (kind === 'ts-local' || kind === 'ts-prop' || kind === 'symbol') {
    if (quoted(text, at, old.length)) return true;
    if (/[a-z][A-Z]|[A-Z][a-z]+[A-Z]|[A-Z]{2}|[_$]/.test(old)) return true;
    return before === '.' || after === '(' || after === '.';
  }
  return quoted(text, at, old.length) || /[-_:]/.test(old) || before === '.';
}
function urlRanges(text: string): Span[] {
  return [...text.matchAll(/\b(?:https?:\/\/|www\.)[^\s`'"<>]+/g)].map((hit) => ({
    start: hit.index,
    end: hit.index + hit[0].length,
  }));
}

export function mapCommentIdentifiers(options: CommentMapOptions): CommentMapResult {
  if (options.write && options.dryRun) throw new Error('choose --write or --dry-run');
  const root = path.resolve(options.root ?? '.');
  const realRoot = fs.realpathSync(root);
  const std = path.dirname(path.resolve(options.mapDir));
  const protectedOld = protectedValues(std);
  const rows = readMap(options.mapDir, {
    status: ['approved'],
    scopes: options.scopes?.includes('all') ? undefined : options.scopes,
  }).filter(
    (row) =>
      KINDS.has(row.kind) &&
      row.old &&
      row.new &&
      row.old !== row.new &&
      !SPECIAL.has(row.new) &&
      row.persisted !== 'yes' &&
      row.category !== 'B',
  );
  const grouped = new Map<string, Map<string, MapRow>>();
  for (const row of rows) {
    const targets = grouped.get(row.old) ?? new Map<string, MapRow>();
    targets.set(row.new, row);
    grouped.set(row.old, targets);
  }
  const ambiguous = [...grouped]
    .filter(([, targets]) => targets.size > 1)
    .map(([old]) => old)
    .sort();
  const ambiguousSet = new Set(ambiguous);
  const entries: Entry[] = [];
  for (const [old, targets] of grouped) {
    if (ambiguousSet.has(old) || protectedOld.has(old)) continue;
    const row = targets.values().next().value!;
    entries.push({
      old,
      new:
        row.kind === 'file' && !old.includes('/')
          ? path.posix.basename(row.new.replaceAll('\\', '/'))
          : row.new,
      kind: row.kind,
    });
  }
  const trie = makeTrie(entries);
  const files: CommentMapResult['files'] = [];
  const counts = new Map<string, Change>();
  const skipped: Record<string, number> = { ambiguous: 0, persisted: 0, prose: 0, url: 0 };
  // A separate trie makes skipped ambiguous and persisted hits visible in the report.
  const blocked = makeTrie(
    [...grouped]
      .filter(([old]) => ambiguousSet.has(old) || protectedOld.has(old))
      .map(([old, targets]) => {
        const row = targets.values().next().value!;
        return { old, new: row.new, kind: row.kind };
      }),
  );
  for (const file of trackedFiles(root)) {
    const absolute = path.resolve(root, file);
    if (
      !absolute.startsWith(`${root}${path.sep}`) ||
      !fs.existsSync(absolute) ||
      !fs.realpathSync(absolute).startsWith(`${realRoot}${path.sep}`) ||
      !fs.statSync(absolute).isFile()
    )
      continue;
    const source = fs.readFileSync(absolute, 'utf8');
    const edits: { start: number; end: number; new: string }[] = [];
    for (const span of commentSpans(source, file)) {
      const text = source.slice(span.start, span.end);
      const urls = urlRanges(text);
      for (let i = 0; i < text.length;) {
        const blockedHit = candidates(blocked, text, i).find((entry) => technical(text, i, entry));
        const candidatesHere = candidates(trie, text, i);
        const entry = candidatesHere.find((candidate) => technical(text, i, candidate));
        if (blockedHit && (!entry || blockedHit.old.length >= entry.old.length)) {
          skipped[ambiguousSet.has(blockedHit.old) ? 'ambiguous' : 'persisted']++;
          i += blockedHit.old.length;
          continue;
        }
        if (!entry) {
          if (
            candidatesHere.length &&
            candidatesHere.some((candidate) =>
              delimited(text, i, candidate.old.length, candidate.kind),
            )
          )
            skipped.prose++;
          i++;
          continue;
        }
        if (urls.some((url) => i >= url.start && i < url.end)) {
          skipped.url++;
          i += entry.old.length;
          continue;
        }
        edits.push({
          start: span.start + i,
          end: span.start + i + entry.old.length,
          new: entry.new,
        });
        const key = `${entry.old}\0${entry.new}\0${entry.kind}`;
        const previous = counts.get(key) ?? { ...entry, count: 0 };
        previous.count++;
        counts.set(key, previous);
        i += entry.old.length;
      }
    }
    if (edits.length) {
      files.push({ file, count: edits.length });
      if (options.write) {
        let changed = source;
        for (const edit of edits.reverse())
          changed = changed.slice(0, edit.start) + edit.new + changed.slice(edit.end);
        fs.writeFileSync(absolute, changed, 'utf8');
      }
    }
  }
  const top = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.old.localeCompare(b.old))
    .slice(0, 20);
  const result = {
    replacements: files.reduce((total, file) => total + file.count, 0),
    files,
    top,
    ambiguous,
    skipped,
  };
  const log = options.log ?? console.log;
  for (const file of files) log(`${file.file}: ${file.count}`);
  log(
    `replacements=${result.replacements} files=${files.length} mode=${options.write ? 'write' : 'dry-run'}`,
  );
  log(
    `top: ${top.map((item) => `${item.old} -> ${item.new} (${item.count})`).join('; ') || '(none)'}`,
  );
  log(
    `ambiguous (${ambiguous.length}, skipped ${skipped.ambiguous}): ${ambiguous.join(', ') || '(none)'}`,
  );
  log(`skipped: persisted=${skipped.persisted} prose=${skipped.prose} url=${skipped.url}`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    if (args.includes('--help'))
      console.log('--map <std/map> [--root .] [--scopes api,css] [--dry-run | --write]');
    else {
      if (!args.includes('--map')) throw new Error('--map is required');
      mapCommentIdentifiers({
        root: args.includes('--root') ? value('--root') : '.',
        mapDir: value('--map'),
        scopes: args.includes('--scopes')
          ? value('--scopes')
              .split(',')
              .map((x) => x.trim())
          : undefined,
        dryRun: args.includes('--dry-run'),
        write: args.includes('--write'),
      });
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

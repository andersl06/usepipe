import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parseCsv, toCsv } from './lib/csv.ts';
import { readMap, resolvePath } from './lib/map.ts';

const COLUMNS = ['id', 'scope', 'file', 'start_line', 'end_line', 'kind', 'pt_score', 'text', 'action', 'new_text', 'sensitivity', 'evidence', 'reviewed_by', 'status'];
const EXCEPTION_COLUMNS = ['glob', 'pattern', 'kind', 'category', 'justification', 'ref'];
type Row = Record<string, string>;
function load(file: string, columns: string[]): Row[] {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (rows[0]?.join(',') !== columns.join(',')) throw new Error(`${file}: invalid header`);
  return rows.slice(1).map((values) => Object.fromEntries(columns.map((column, i) => [column, values[i] ?? ''])));
}
function save(file: string, columns: string[], rows: Row[]): void { fs.writeFileSync(file, toCsv([columns, ...rows.map((row) => columns.map((column) => row[column] ?? ''))])); }
function normalize(text: string): string {
  return text.replace(/^\s*(?:\/\/|\/\*\*?|\*\/|\*|#)\s?/gm, '').replace(/\*\/\s*$/, '').trim().replace(/\s+/g, ' ');
}
function exactPattern(value: string): string { return `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`; }
type Match = { start: number; end: number; raw: string; kind: 'line' | 'hash' | 'block'; prefix: string; suffix: string };
function comments(source: string, file: string): Match[] {
  const matches: Match[] = [];
  const typescriptFile = /\.[cm]?[jt]sx?$/.test(file);
  const tokenStarts = new Set<number>();
  if (typescriptFile) {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) tokenStarts.add(scanner.getTokenPos());
    }
  }
  const pattern = /\/\*[\s\S]*?\*\/|(?:^[ \t]*(?:\/\/|#)[^\r\n]*(?:\r?\n|$))+/gm;
  for (const hit of source.matchAll(pattern)) {
    const lineStart = source.lastIndexOf('\n', hit.index - 1) + 1;
    const blockIndent = hit[0].startsWith('/*') && /^[ \t]*$/.test(source.slice(lineStart, hit.index)) ? source.slice(lineStart, hit.index) : '';
    const raw = blockIndent + hit[0];
    const line = /^([ \t]*)(\/\/|#)/.exec(raw);
    if (typescriptFile && (line?.[2] === '#' || !tokenStarts.has(hit.index + (line ? line[1].length : 0)))) continue;
    matches.push({ start: hit.index - blockIndent.length, end: hit.index + hit[0].length, raw, kind: line ? (line[2] === '#' ? 'hash' : 'line') : 'block', prefix: line ? `${line[1]}${line[2]}` : (/^([ \t]*)/.exec(raw)?.[1] ?? ''), suffix: raw.endsWith('\r\n') ? '\r\n' : raw.endsWith('\n') ? '\n' : '' });
    if (line && raw.trimEnd().split(/\r?\n/).length > 1) {
      let offset = 0;
      for (const piece of raw.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
        const prefix = /^([ \t]*(?:\/\/|#))/.exec(piece)?.[1];
        if (prefix) matches.push({ start: hit.index + offset, end: hit.index + offset + piece.length, raw: piece, kind: line[2] === '#' ? 'hash' : 'line', prefix, suffix: piece.endsWith('\r\n') ? '\r\n' : piece.endsWith('\n') ? '\n' : '' });
        offset += piece.length;
      }
    }
  }
  return matches;
}
function replacement(match: Match, newText: string): string {
  const lines = newText.split(/\r?\n/);
  if (match.kind !== 'block') return lines.map((line) => `${match.prefix}${line ? ` ${line}` : ''}`).join('\n') + match.suffix;
  const jsdoc = match.raw.trimStart().startsWith('/**');
  const open = jsdoc ? '/**' : '/*';
  const indent = /^([ \t]*)/.exec(match.raw)?.[1] ?? '';
  if (!match.raw.includes('\n') && lines.length === 1) return `${indent}${open} ${newText} */`;
  return `${indent}${open}\n${lines.map((line) => `${indent} *${line ? ` ${line}` : ''}`).join('\n')}\n${indent} */`;
}

export function applyComments(options: { comments: string; scopes: string[]; dryRun?: boolean; root?: string; log?: (line: string) => void }): { applied: number; refused: number; notFound: number } {
  const { comments: target, scopes, dryRun = false, log = console.log } = options;
  const std = path.dirname(target);
  const root = options.root ?? path.resolve(std, '../../../../');
  const realRoot = fs.realpathSync(root);
  const map = readMap(path.join(std, 'map'));
  const files = fs.statSync(target).isDirectory() ? fs.readdirSync(target).filter((name) => name.endsWith('.csv')).map((name) => path.join(target, name)) : [target];
  let applied = 0; let refused = 0; let notFound = 0;
  const exceptionsFile = path.join(std, 'exceptions.csv');
  const exceptions = fs.existsSync(exceptionsFile) ? load(exceptionsFile, EXCEPTION_COLUMNS) : [];
  const added: Row[] = [];
  for (const csv of files) {
    const rows = load(csv, COLUMNS);
    for (const row of rows) {
      if (!scopes.includes(row.scope) || row.status !== 'reviewed') continue;
      if (row.sensitivity !== 'other' && row.reviewed_by !== 'sonnet') { refused++; log(`refused ${row.id}: reviewed_by must be sonnet`); continue; }
      const relative = resolvePath(row.file.replaceAll('\\', '/').replace(/:\d+(?::\d+)?$/, ''), map);
      const absolute = path.resolve(root, relative);
      if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) { refused++; log(`refused ${row.id}: path outside root`); continue; }
      if (!fs.existsSync(absolute)) { notFound++; log(`not-found ${row.id}: ${relative}`); continue; }
      if (!fs.realpathSync(absolute).startsWith(`${realRoot}${path.sep}`)) { refused++; log(`refused ${row.id}: resolved path outside root`); continue; }
      const source = fs.readFileSync(absolute, 'utf8');
      const found = comments(source, relative).filter((match) => normalize(match.raw) === normalize(row.text) || match.raw.trim() === row.text.trim());
      if (found.length !== 1) { notFound++; log(`not-found ${row.id}: ${found.length} matching comments`); continue; }
      const match = found[0];
      if (!['translate', 'update', 'remove', 'keep-original'].includes(row.action)) { refused++; log(`refused ${row.id}: invalid action`); continue; }
      if (['translate', 'update'].includes(row.action) && !row.new_text) { refused++; log(`refused ${row.id}: empty new_text`); continue; }
      if (row.action === 'keep-original') {
        const snippet = match.raw.trim().split(/\r?\n/)[0].trim().slice(0, 120);
        if (comments(source, relative).filter((candidate) => candidate.raw.trim().split(/\r?\n/)[0].trim().slice(0, 120) === snippet).length !== 1) { refused++; log(`refused ${row.id}: ambiguous exception snippet`); continue; }
        added.push({ glob: relative, pattern: exactPattern(snippet), kind: 'comment', category: 'C', justification: `Reviewed literal evidence: ${match.raw.trim()}`, ref: 'D-17' });
      } else {
        const next = row.action === 'remove' ? '' : replacement(match, row.new_text);
        if (!dryRun) fs.writeFileSync(absolute, source.slice(0, match.start) + next + source.slice(match.end));
      }
      if (!dryRun) row.status = 'applied';
      applied++;
    }
    if (!dryRun) save(csv, COLUMNS, rows);
  }
  if (!dryRun && added.length) {
    const keys = new Set(exceptions.map((row) => `${row.glob}\0${row.pattern}\0${row.ref}`));
    for (const row of added) if (!keys.has(`${row.glob}\0${row.pattern}\0${row.ref}`)) exceptions.push(row);
    save(exceptionsFile, EXCEPTION_COLUMNS, exceptions);
  }
  log(`applied=${applied} refused=${refused} not-found=${notFound}`);
  return { applied, refused, notFound };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) { console.log('--comments <STD/comments> --scopes a,b [--dry-run]'); process.exit(0); }
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    const result = applyComments({ comments: value('--comments'), scopes: value('--scopes').split(','), dryRun: args.includes('--dry-run') });
    if (result.notFound) process.exitCode = 1;
  } catch (error) { console.error(String(error)); process.exitCode = 2; }
}

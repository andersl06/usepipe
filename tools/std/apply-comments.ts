import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { parseCsv, toCsv } from './lib/csv.ts';
import { readMap, resolvePath } from './lib/map.ts';

const COLUMNS = ['id', 'scope', 'file', 'start_line', 'end_line', 'kind', 'pt_score', 'text', 'action', 'new_text', 'sensitivity', 'evidence', 'reviewed_by', 'status'];
const EXCEPTION_COLUMNS = ['glob', 'pattern', 'kind', 'category', 'justification', 'ref'];
const UNAPPLIED_COLUMNS = ['id', 'file', 'line', 'reason'];
type Row = Record<string, string>;
function load(file: string, columns: string[]): Row[] {
  const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
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
  const nonCommentRanges: { start: number; end: number }[] = [];
  if (typescriptFile) {
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isRegularExpressionLiteral(node) || ts.isJsxText(node)) {
        nonCommentRanges.push({ start: node.getStart(parsed), end: node.end });
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
  }
  const pattern = /\/\*[\s\S]*?\*\/|(?:^[ \t]*(?:\/\/|#)[^\r\n]*(?:\r?\n|$))+/gm;
  for (const hit of source.matchAll(pattern)) {
    const lineStart = source.lastIndexOf('\n', hit.index - 1) + 1;
    const blockIndent = hit[0].startsWith('/*') && /^[ \t]*$/.test(source.slice(lineStart, hit.index)) ? source.slice(lineStart, hit.index) : '';
    const raw = blockIndent + hit[0];
    const line = /^([ \t]*)(\/\/|#)/.exec(raw);
    if (typescriptFile && (line?.[2] === '#' || nonCommentRanges.some((range) => hit.index >= range.start && hit.index < range.end))) continue;
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
function exactComment(source: string, file: string, text: string): Match[] {
  if (!/\.[cm]?[jt]sx?$/.test(file) || !text.trimStart().startsWith('//')) return [];
  const needle = text.trim();
  const matches: Match[] = [];
  for (let at = source.indexOf(needle); at >= 0; at = source.indexOf(needle, at + 1)) {
    const lineStart = source.lastIndexOf('\n', at - 1) + 1;
    const indent = source.slice(lineStart, at);
    if (!/^[ \t]*$/.test(indent)) continue;
    let end = at + needle.length;
    if (end < source.length && source[end] !== '\r' && source[end] !== '\n') continue;
    if (source.startsWith('\r\n', end)) end += 2;
    else if (source[end] === '\n') end += 1;
    const raw = source.slice(lineStart, end);
    matches.push({ start: lineStart, end, raw, kind: 'line', prefix: `${indent}//`, suffix: raw.endsWith('\r\n') ? '\r\n' : raw.endsWith('\n') ? '\n' : '' });
  }
  return matches;
}
function replacement(match: Match, newText: string): string {
  const lines = newText.split(/\r?\n/);
  if (match.kind !== 'block') return lines.map((line) => `${match.prefix}${line ? ` ${line}` : ''}`).join('\n') + match.suffix;
  if (newText.trimStart().startsWith('/*') && newText.trimEnd().endsWith('*/')) {
    const indent = /^([ \t]*)/.exec(match.raw)?.[1] ?? '';
    const newline = match.raw.includes('\r\n') ? '\r\n' : '\n';
    return lines.map((line) => `${indent}${line}`).join(newline);
  }
  const jsdoc = match.raw.trimStart().startsWith('/**');
  const open = jsdoc ? '/**' : '/*';
  const indent = /^([ \t]*)/.exec(match.raw)?.[1] ?? '';
  if (!match.raw.includes('\n') && lines.length === 1) return `${indent}${open} ${newText} */`;
  return `${indent}${open}\n${lines.map((line) => `${indent} *${line ? ` ${line}` : ''}`).join('\n')}\n${indent} */`;
}

export function applyComments(options: { comments: string; scopes: string[]; dryRun?: boolean; root?: string; log?: (line: string) => void; matchByText?: boolean; unapplied?: string }): { applied: number; refused: number; notFound: number } {
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
  const pending = options.unapplied ? load(options.unapplied, UNAPPLIED_COLUMNS) : [];
  const pendingIds = new Set(pending.map((row) => row.id));
  const remaining = new Map(pending.map((row) => [row.id, row]));
  let repoIndex: Map<string, Set<string>> | undefined;
  function findInFile(file: string, needle: string): Match[] {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return [];
    const relative = path.relative(root, file).replaceAll('\\', '/');
    return comments(fs.readFileSync(file, 'utf8'), relative).filter((match) => normalize(match.raw) === needle);
  }
  function findByText(relative: string, text: string): { file: string; matches: Match[] }[] {
    const needle = normalize(text);
    const preferred = path.resolve(root, relative);
    const local = fs.existsSync(preferred) && fs.realpathSync(preferred).startsWith(`${realRoot}${path.sep}`) ? findInFile(preferred, needle) : [];
    if (local.length) return [{ file: preferred, matches: local }];
    if (!repoIndex) {
      repoIndex = new Map();
      const repoFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter((file) => /\.(?:[cm]?[jt]sx?|css|scss|sh|ya?ml)$/.test(file) || /(?:^|\/)(?:Dockerfile|Makefile)$/.test(file));
      for (const file of repoFiles) {
        const absolute = path.resolve(root, file);
        if (!fs.existsSync(absolute)) continue;
        for (const match of comments(fs.readFileSync(absolute, 'utf8'), file)) {
          const key = normalize(match.raw);
          if (!repoIndex.has(key)) repoIndex.set(key, new Set());
          repoIndex.get(key)!.add(absolute);
        }
      }
    }
    const hits: { file: string; matches: Match[] }[] = [];
    for (const absolute of repoIndex.get(needle) ?? []) {
      if (absolute === preferred || !fs.existsSync(absolute)) continue;
      const matches = findInFile(absolute, needle);
      if (matches.length) hits.push({ file: absolute, matches });
    }
    return hits;
  }
  for (const csv of files) {
    const rows = load(csv, COLUMNS);
    for (const row of rows) {
      if (!scopes.includes(row.scope) || (options.unapplied && !pendingIds.has(row.id)) || !['reviewed', 'proposed'].includes(row.status)) continue;
      if (!options.matchByText && ['security', 'architecture', 'integration', 'meta-blip'].includes(row.sensitivity) && row.reviewed_by !== 'sonnet') { refused++; log(`refused ${row.id}: sensitive comment lacks Sonnet review`); continue; }
      const relative = resolvePath(row.file.replaceAll('\\', '/').replace(/:\d+(?::\d+)?$/, ''), map);
      let absolute = path.resolve(root, relative);
      if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) { refused++; log(`refused ${row.id}: path outside root`); continue; }
      if (!options.matchByText && !fs.existsSync(absolute)) { notFound++; log(`not-found ${row.id}: ${relative}`); continue; }
      if (fs.existsSync(absolute) && !fs.realpathSync(absolute).startsWith(`${realRoot}${path.sep}`)) { refused++; log(`refused ${row.id}: resolved path outside root`); continue; }
      if (options.matchByText) {
        const hits = findByText(relative, row.text);
        const count = hits.reduce((total, hit) => total + hit.matches.length, 0);
        if (count !== 1) {
          notFound++;
          const reason = `not-found: ${count} matching comments`;
          if (remaining.has(row.id)) remaining.get(row.id)!.reason = reason;
          log(`not-found ${row.id}: ${count} matching comments`);
          continue;
        }
        absolute = hits[0].file;
      }
      const source = fs.readFileSync(absolute, 'utf8');
      const actualRelative = path.relative(root, absolute).replaceAll('\\', '/');
      const found = comments(source, actualRelative).filter((match) => normalize(match.raw) === normalize(row.text) || match.raw.trim() === row.text.trim());
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
      if (!dryRun) remaining.delete(row.id);
      applied++;
    }
    if (!dryRun && rows.some((row) => scopes.includes(row.scope))) save(csv, COLUMNS, rows);
  }
  if (!dryRun && added.length) {
    const keys = new Set(exceptions.map((row) => `${row.glob}\0${row.pattern}\0${row.ref}`));
    for (const row of added) if (!keys.has(`${row.glob}\0${row.pattern}\0${row.ref}`)) exceptions.push(row);
    save(exceptionsFile, EXCEPTION_COLUMNS, exceptions);
  }
  if (!dryRun && options.unapplied) save(options.unapplied, UNAPPLIED_COLUMNS, [...remaining.values()]);
  log(`applied=${applied} refused=${refused} not-found=${notFound}`);
  return { applied, refused, notFound };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) { console.log('--comments <STD/comments> --scopes a,b [--dry-run] [--match-by-text --unapplied <csv>]'); process.exit(0); }
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    const result = applyComments({ comments: value('--comments'), scopes: value('--scopes').split(','), dryRun: args.includes('--dry-run'), matchByText: args.includes('--match-by-text'), unapplied: args.includes('--unapplied') ? value('--unapplied') : undefined });
    if (result.notFound) process.exitCode = 1;
  } catch (error) { console.error(String(error)); process.exitCode = 2; }
}

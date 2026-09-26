import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Apply the pending half-translated names after the original declared_at paths moved.
// Run from the repository root. The pending CSV may be supplied with --map PATH.
const root = process.cwd();
const phase = '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std';
const outputPath = path.join(root, phase, 'map/fixup.csv');
const tempMap = 'C:/Users/ANDERS~1.LIN/AppData/Local/Temp/fixup-pending.csv';
const requestedMap = process.argv.includes('--map') ? process.argv[process.argv.indexOf('--map') + 1] : undefined;
const dryRun = process.argv.includes('--dry-run');

function parseCsv(source) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && !field) quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (quoted) throw new Error('Unterminated CSV field');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function encodeCsv(rows) {
  return rows.map((row) => row.map((value) => /[",\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"` : value).join(',')).join('\n') + '\n';
}
function readCsv(file) {
  const [header, ...values] = parseCsv(fs.readFileSync(file, 'utf8'));
  return { header, rows: values.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? '']))) };
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function wordPattern(value) {
  return `(?<![\\p{L}\\p{N}_])${escapeRegExp(value)}(?![\\p{L}\\p{N}_])`;
}
function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); }
function eligible(file) {
  if (!/^(apps|packages|infra|tools\/std)\//.test(file)) return false;
  if (file.startsWith('tools/std/.')) return false;
  if (/\/docs\//.test(file) && file.endsWith('.md')) return true;
  return /\.(?:ts|tsx|mts|js|jsx|mjs|cjs|css|html|json|ya?ml)$/.test(file);
}
function enclosingQuote(text, at) {
  // Only use a complete simple quote as a persisted-value guard. Other source
  // positions remain eligible, including identifier-like keys in strings.
  const lineStart = text.lastIndexOf('\n', at - 1) + 1;
  const before = text.slice(lineStart, at);
  for (const quote of ['"', "'", '`']) {
    const start = before.lastIndexOf(quote);
    if (start < 0) continue;
    const actualStart = lineStart + start;
    const end = text.indexOf(quote, at);
    if (end < 0 || text.slice(actualStart + 1, at).includes(quote)) continue;
    return text.slice(actualStart + 1, end);
  }
  return undefined;
}

const pendingPath = requestedMap ?? (fs.existsSync(tempMap) ? tempMap : undefined);
const pending = pendingPath ? readCsv(pendingPath) : (() => {
  const raw = git(['show', `cx/fixup-map:${phase}/map/fixup.csv`]);
  const [header, ...values] = parseCsv(raw);
  return { header, rows: values.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? '']))) };
})();
const existing = fs.existsSync(outputPath) ? readCsv(outputPath) : { header: pending.header, rows: [] };
const previousById = new Map(existing.rows.map((row) => [row.id, row]));
const persisted = new Set(readCsv(path.join(root, phase, 'persisted.csv')).rows.map((row) => row.old));
const exceptions = readCsv(path.join(root, phase, 'exceptions.csv')).rows
  .filter((row) => row.category === 'B' && row.pattern !== '.*')
  .map((row) => { try { return new RegExp(row.pattern); } catch { return null; } }).filter(Boolean);
const groups = new Map();
for (const row of pending.rows) {
  const group = groups.get(row.old) ?? new Set();
  group.add(row.new);
  groups.set(row.old, group);
}
const ambiguous = new Set([...groups].filter(([, values]) => values.size > 1).map(([old]) => old));
const counters = new Map();
const candidates = new Map();
for (const row of pending.rows) {
  const previous = previousById.get(row.id);
  if (['applied', 'verified', 'skipped'].includes(previous?.status) ||
      row.status === 'applied' || row.status === 'verified') continue;
  if (persisted.has(row.old) || exceptions.some((pattern) => pattern.test(row.old))) {
    counters.set(row.id, 'skipped-persisted');
  } else if (ambiguous.has(row.old)) {
    counters.set(row.id, 'skipped-ambiguous');
  } else if (row.old && row.new && row.old !== row.new) {
    candidates.set(row.old, row.new);
  } else counters.set(row.id, 'not-found');
}

const files = git(['ls-files', '-z']).split('\0').filter(eligible);
const routeNames = [...candidates.keys()].filter((old) => old.includes('/'));
const routeExpression = new RegExp(routeNames.map(wordPattern).join('|'), 'gu');
const identifierExpression = /(?<![\p{L}\p{N}_])[\p{L}_$][\p{L}\p{N}_$]*(?![\p{L}\p{N}_])/gu;
const occurrence = new Map();
for (const file of files) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) continue;
  const before = fs.readFileSync(fullPath, 'utf8');
  const replace = (old, offset) => {
    if (!candidates.has(old)) return old;
    const literal = enclosingQuote(before, offset);
    if (literal && (persisted.has(literal) || exceptions.some((pattern) => pattern.test(literal)))) return old;
    occurrence.set(old, (occurrence.get(old) ?? 0) + 1);
    return candidates.get(old);
  };
  const after = before.replace(routeExpression, replace).replace(identifierExpression, replace);
  if (after !== before && !dryRun) fs.writeFileSync(fullPath, after);
}

for (const row of pending.rows) {
  if (counters.has(row.id) || ['applied', 'verified', 'skipped'].includes(previousById.get(row.id)?.status) ||
      row.status === 'applied' || row.status === 'verified') continue;
  counters.set(row.id, occurrence.has(row.old) ? 'applied' : 'not-found');
}
const counts = { applied: 0, 'skipped-ambiguous': 0, 'skipped-persisted': 0, 'not-found': 0 };
for (const value of counters.values()) counts[value]++;
console.log(JSON.stringify({ counts, ambiguous: [...ambiguous].map((old) => ({ old, new: [...groups.get(old)] })),
  notFound: pending.rows.filter((row) => counters.get(row.id) === 'not-found').map((row) => row.old) }, null, 2));
if (!dryRun) {
  const byId = new Map(existing.rows.map((row) => [row.id, row]));
  for (const row of pending.rows) {
    const status = counters.get(row.id);
    if (!status) continue;
    const updated = { ...row, status: status === 'applied' ? 'applied' : 'skipped',
      notes: `${row.notes}${row.notes ? '; ' : ''}fixup: ${status}` };
    byId.set(row.id, updated);
  }
  fs.writeFileSync(outputPath, encodeCsv([existing.header, ...byId.values().map((row) => existing.header.map((key) => row[key] ?? ''))]));
}

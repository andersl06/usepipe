/** Audit D-47 test titles for changed persisted literals and endpoint paths.
 * Run: node tools/std/scan-retranslated-literals.mjs [--json]
 * Read only: never edits CSVs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './lib/csv.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const std = path.join(root, '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std');
const read = (file) => {
  const [headers, ...values] = parseCsv(fs.readFileSync(file, 'utf8'));
  return values.map((cells) => Object.fromEntries(headers.map((header, i) => [header, cells[i]])));
};
const maps = Object.fromEntries(fs.readdirSync(path.join(std, 'map')).filter((name) => name.endsWith('.csv')).map((name) => [name.slice(0, -4), read(path.join(std, 'map', name))]));
const protectedValues = new Set(read(path.join(std, 'persisted.csv')).map((row) => row.old).filter(Boolean));
const categoryB = read(path.join(std, 'exceptions.csv')).filter((row) => row.category === 'B' && row.pattern !== '.*' && row.pattern !== '*');
const canonicalPath = (value) => value.replace(/:[A-Za-z*][A-Za-z0-9]*/g, ':*');
const endpointRows = Object.fromEntries(Object.entries(maps).map(([scope, rows]) => [scope, new Map(rows.filter((row) => row.kind === 'endpoint').map((row) => [canonicalPath(row.old), row.new]))]));
const tokenPattern = /(?<![\w/])(?:\/[\w:./-]+|[A-Za-z_][\w.-]*:[a-z_]+|[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)+|[A-Za-z_][\w]*_[A-Za-z_][\w]*|[A-Z][A-Z0-9_]{2,})(?!\w)/g;
const quotedPattern = /`([^`]+)`|"([^"]+)"|'([^']+)'/g;
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const occurs = (text, token) => new RegExp(`(?<![\\w.:-])${escape(token)}(?![\\w.:-])`).test(text);
const candidates = (text) => {
  const found = new Set(text.match(tokenPattern) ?? []);
  // Queue/job names can be kebab-case and are easy to miss with identifier regexes.
  for (const value of protectedValues) if (/[-._:/]|[A-Z]/.test(value) && occurs(text, value)) found.add(value);
  for (const match of text.matchAll(quotedPattern)) {
    const literal = match[1] ?? match[2] ?? match[3];
    if (literal && !/\s/.test(literal)) found.add(literal);
  }
  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b));
};

const findings = [];
let scanned = 0;
for (const [scope, rows] of Object.entries(maps)) for (const row of rows) {
  if (row.kind !== 'test-title' || !row.notes.includes('D-47 retranslated')) continue;
  scanned++;
  for (const token of candidates(row.old)) {
    if (token.startsWith('/')) {
      const approved = endpointRows[scope].get(canonicalPath(token));
      if (!occurs(row.new, token) && (!approved || !occurs(row.new, approved)))
        findings.push({ id: row.id, scope, kind: approved ? 'endpoint' : 'unmapped-path', old: token, approved, new: row.new });
      continue;
    }
    const isB = categoryB.some((exception) => {
      if (exception.glob !== '**/*' && exception.glob !== row.declared_at.replace(/:\d+$/, '')) return false;
      try { return new RegExp(`^(?:${exception.pattern})$`).test(token); } catch { return false; }
    });
    const syntactic = /^[a-z_.]+:(ler|escrever|gerenciar)$|^[a-z_]+(?:\.[a-z_]+)+$|^[A-Z][A-Z0-9]*_[A-Z0-9_]+$|^[a-z_]+(?:_[a-z_]+)+$/.test(token);
    if ((protectedValues.has(token) || isB || syntactic) && !occurs(row.new, token))
      findings.push({ id: row.id, scope, kind: 'protected', old: token, new: row.new });
  }
}
const result = { scanned, findings };
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`rows scanned: ${scanned}; findings: ${findings.length}`);
  for (const finding of findings) console.log(finding);
}
if (findings.length) process.exitCode = 1;

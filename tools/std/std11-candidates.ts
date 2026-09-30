import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { readMap, MAP_COLUMNS } from './lib/map.ts';
import { parseCsv, toCsv } from './lib/csv.ts';
import { splitIdentifier } from './pt-detect.ts';

const std = '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std';
const reports = `${std}/reports`;
const inventory = readMap(`${std}/out/std11/inventory/map`);
const existing = readMap(`${std}/map`);
const knownIds = new Set(existing.map(row => row.id));
const worklists = ['packages', 'api-domain', 'api-core', 'api-tests', 'mgmt-pages', 'mgmt-rest-desk', 'crm-tools-site', 'infra'];
const findings = worklists.flatMap(worklist => {
  const [header, ...rows] = parseCsv(readFileSync(`${reports}/std11-worklist-${worklist}.csv`, 'utf8'));
  return rows.filter(row => row[header.indexOf('kind')] === 'identifier').map(row => ({
    worklist, file: row[header.indexOf('file')], line: row[header.indexOf('line')],
    token: row[header.indexOf('token')], snippet: row[header.indexOf('snippet')],
  }));
});
const byFile = new Map<string, Set<string>>();
for (const finding of findings) {
  const tokens = byFile.get(finding.file) ?? new Set<string>();
  tokens.add(finding.token.toLowerCase()); byFile.set(finding.file, tokens);
}
const sourceFile = (declared: string) => declared.replace(/:\d+(?::\d+)?$/, '');
const candidateRows = inventory.filter(row => !knownIds.has(row.id)).map(row => {
  const file = sourceFile(row.declared_at);
  const tokens = new Set(splitIdentifier(row.old).map(token => token.toLowerCase()));
  const intersects = [...(byFile.get(file) ?? [])].some(token => tokens.has(token));
  return { row, worklist: intersects ? findings.find(finding => finding.file === file)?.worklist ?? '' : '' };
});
const candidates = candidateRows.filter(({ worklist }) => worklist);
assert.equal(new Set(candidates.map(({ row }) => row.id)).size, candidates.length);
writeFileSync(`${reports}/std11-candidates.csv`, toCsv([[...MAP_COLUMNS, 'worklist'], ...candidates.map(({ row, worklist }) => [...MAP_COLUMNS.map(column => row[column]), worklist])]));
const declarationTokens = new Map<string, Set<string>>();
for (const { row } of candidateRows) {
  const file = sourceFile(row.declared_at);
  const tokens = declarationTokens.get(file) ?? new Set<string>();
  for (const token of splitIdentifier(row.old)) tokens.add(token.toLowerCase());
  declarationTokens.set(file, tokens);
}
const uncovered = findings.filter(({ file, token }) => !declarationTokens.get(file)?.has(token.toLowerCase()));
writeFileSync(`${reports}/std11-identifier-gaps.csv`, toCsv([['worklist', 'file', 'line', 'token', 'snippet'], ...uncovered.map(row => [row.worklist, row.file, row.line, row.token, row.snippet])]));
const globalTokens = new Set([...declarationTokens.values()].flatMap(tokens => [...tokens]));
const globallyUncovered = uncovered.filter(({ token }) => !globalTokens.has(token.toLowerCase()));
writeFileSync(`${reports}/std11-identifier-global-gaps.csv`, toCsv([['worklist', 'file', 'line', 'token', 'snippet'], ...globallyUncovered.map(row => [row.worklist, row.file, row.line, row.token, row.snippet])]));
console.log(`inventory=${inventory.length} candidates=${candidates.length} identifier-findings=${findings.length} local-gaps=${uncovered.length} global-gaps=${globallyUncovered.length}`);

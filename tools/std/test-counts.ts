import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsv } from './lib/csv.ts';
import { readMap, resolvePath, type MapRow } from './lib/map.ts';

export type Counts = Record<string, { passed: number; failed: number; skipped: number; files_failed: string[] }>;
const empty = () => ({ passed: 0, failed: 0, skipped: 0, files_failed: [] as string[] });

export function parseTestCounts(log: string): Counts {
  const result: Counts = {};
  const seen = new Set<string>();
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
  for (const raw of log.replace(ansi, '').split(/\r?\n/)) {
    const prefix = raw.match(/^(@pipe\/[^:\s]+):test:\s?(.*)$/);
    if (!prefix) continue;
    const [, pkg, line] = prefix;
    const item = result[pkg] ??= empty();
    if (/^\s*FAIL\s+/.test(line)) {
      const file = line.replace(/^\s*FAIL\s+/, '').split(/\s+[(>]/)[0]!.replaceAll('\\', '/');
      if (!item.files_failed.includes(file)) item.files_failed.push(file);
    }
    // Vitest emits a single aggregate "Tests" line per invocation. Ignore per-file lines.
    if (/^\s*Tests\s+/.test(line)) {
      for (const [, number, kind] of line.matchAll(/(\d+)\s+(passed|failed|skipped)/g)) {
        const key = `${pkg}:vitest:${kind}`;
        if (!seen.has(key)) { item[kind as 'passed' | 'failed' | 'skipped'] = Number(number); seen.add(key); }
      }
    }
    // node:test prints one summary per invocation. Turbo may replay duplicate log lines.
    const node = line.match(/^[#ℹ]\s+(pass|fail|skipped)\s+(\d+)\s*$/);
    if (node) {
      const kind = node[1] === 'pass' ? 'passed' : node[1] === 'fail' ? 'failed' : 'skipped';
      const key = `${pkg}:node:${kind}`;
      if (!seen.has(key)) { item[kind] = Number(node[2]); seen.add(key); }
    }
  }
  for (const item of Object.values(result)) item.files_failed.sort();
  return result;
}

export function appliedPackageRenames(rows: MapRow[]): Record<string, string> {
  // Only applied|verified rows change baseline package keys.
  return Object.fromEntries(rows.filter(row =>
    ['package', 'app'].includes(row.kind) && ['applied', 'verified'].includes(row.status) && row.old && row.new,
  ).map(row => [row.old, row.new]));
}

export function onlyKnownFlakyFailures(counts: Counts, rows: MapRow[]): boolean {
  const known = knownFlakyPaths(rows);
  const failed = Object.entries(counts).filter(([, value]) => value.failed > 0 || value.files_failed.length > 0);
  return failed.length === 1 && failed[0]![0] === (appliedPackageRenames(rows)['@pipe/api'] ?? '@pipe/api') &&
    failed[0]![1].files_failed.length > 0 && failed[0]![1].files_failed.every(file => known.includes(file.replaceAll('\\', '/')));
}

export function knownFlakyPaths(rows: MapRow[]): string[] {
  return ['instagram.test.ts', 'fluxo.test.ts', 'messenger.test.ts'].map(file =>
    resolvePath(`apps/api/tests/${file}`, rows).replaceAll('\\', '/').replace(/^apps\/api\//, ''),
  );
}

export function compareCounts(current: Counts, baseline: Counts, renames: Record<string, string>, allowedRemovals: Record<string, number> = {}): string[] {
  const failures: string[] = [];
  for (const [oldName, expected] of Object.entries(baseline)) {
    const name = renames[oldName] ?? oldName;
    const actual = current[name];
    if (!actual) { failures.push(`${name}: test output missing`); continue; }
    const allowance = allowedRemovals[oldName] ?? allowedRemovals[name] ?? 0;
    if (actual.passed < expected.passed - allowance) failures.push(`${name}: ${actual.passed} passed, expected at least ${expected.passed - allowance}`);
    if (actual.failed > 0) failures.push(`${name}: ${actual.failed} failed`);
  }
  return failures;
}

function removals(file: string): Record<string, number> {
  if (!fs.existsSync(file)) return {};
  const [header, ...lines] = parseCsv(fs.readFileSync(file, 'utf8'));
  if (header?.join(',') !== 'package,count,decision_ref') throw new Error('invalid allowed-test-removals header');
  const result: Record<string, number> = {};
  for (const [pkg, count, decision] of lines) {
    if (!pkg || !/^\d+$/.test(count ?? '') || !decision) throw new Error('invalid allowed-test-removals row');
    result[pkg] = (result[pkg] ?? 0) + Number(count);
  }
  return result;
}

export function baselineFromMarkdown(markdown: string): Counts {
  const result: Counts = {};
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*(@pipe\/[^|\s]+)\s*\|[^|]*\|\s*(\d+)\s*\|/);
    if (match) result[match[1]!] = { ...empty(), passed: Number(match[2]) };
  }
  return result;
}

function main(args: string[]): void {
  const value = (flag: string) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
  if (args.includes('--api-package')) {
    const map = value('--map'); if (!map) throw new Error('--api-package requires --map');
    console.log(appliedPackageRenames(readMap(map))['@pipe/api'] ?? '@pipe/api');
    return;
  }
  if (args.includes('--resolve-path')) {
    const map = value('--map'); const oldPath = value('--resolve-path');
    if (!map || !oldPath) throw new Error('--resolve-path requires a path and --map');
    console.log(resolvePath(oldPath, readMap(map)));
    return;
  }
  if (args.includes('--list-flaky')) {
    const map = value('--map'); if (!map) throw new Error('--list-flaky requires --map');
    for (const file of knownFlakyPaths(readMap(map))) console.log(file);
    return;
  }
  if (args.includes('--check-flaky')) {
    const log = value('--log'); const map = value('--map');
    if (!log || !map) throw new Error('--check-flaky requires --log and --map');
    if (!onlyKnownFlakyFailures(parseTestCounts(fs.readFileSync(log, 'utf8')), readMap(map))) process.exitCode = 1;
    return;
  }
  const log = value('--log'); const out = value('--out');
  if (!log || !out) throw new Error('usage: --log <log> --out <json> [--compare <json> --map <dir>]');
  const counts = parseTestCounts(fs.readFileSync(log, 'utf8'));
  if (args.includes('--accept-flaky')) {
    const map = value('--map');
    if (!map || !onlyKnownFlakyFailures(counts, readMap(map))) throw new Error('non-exempt flaky failure');
    for (const item of Object.values(counts)) {
      item.passed += item.failed;
      item.failed = 0;
    }
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`);
  const compare = value('--compare');
  const baselineMd = value('--baseline-md');
  if (baselineMd) {
    const failures = compareCounts(counts, baselineFromMarkdown(fs.readFileSync(baselineMd, 'utf8')), {}, {});
    if (failures.length) { for (const failure of failures) console.error(failure); process.exitCode = 1; }
  }
  if (compare) {
    const map = value('--map');
    if (!map) throw new Error('--map required with --compare');
    const failures = compareCounts(counts, JSON.parse(fs.readFileSync(compare, 'utf8')) as Counts,
      appliedPackageRenames(readMap(map)), removals(path.join(path.dirname(map), 'reports/allowed-test-removals.csv')));
    if (failures.length) { for (const failure of failures) console.error(failure); process.exitCode = 1; }
  }
  console.log(`test-counts: ${Object.keys(counts).length} packages`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error); process.exitCode = 2; }
}

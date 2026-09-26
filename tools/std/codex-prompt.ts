import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, toCsv } from './lib/csv.ts';
import { readMap, resolvePath, type MapRow } from './lib/map.ts';

interface Options {
  template: string;
  rows: string;
  filters: Map<string, Set<string>>;
  chunk: number;
  outDir: string;
}

function usage(): never {
  console.error('usage: node tools/std/codex-prompt.ts --template <file> --rows <csv|dir> [--filter key=a|b,key2=c] [--status value] [--chunk 300] --out-dir <dir>');
  process.exit(2);
}

function addFilter(filters: Map<string, Set<string>>, expression: string): void {
  for (const clause of expression.split(',')) {
    const separator = clause.indexOf('=');
    if (separator < 1) usage();
    const key = clause.slice(0, separator);
    const values = clause.slice(separator + 1).split('|').filter(Boolean);
    if (values.length === 0) usage();
    const current = filters.get(key) ?? new Set<string>();
    for (const value of values) current.add(value);
    filters.set(key, current);
  }
}

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>();
  const filters = new Map<string, Set<string>>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) usage();
    index += 1;
    if (flag === '--filter') addFilter(filters, value);
    else if (flag === '--status') addFilter(filters, `status=${value}`);
    else values.set(flag, value);
  }
  const template = values.get('--template');
  const rows = values.get('--rows');
  const outDir = values.get('--out-dir');
  const chunk = Number.parseInt(values.get('--chunk') ?? '300', 10);
  if (!template || !rows || !outDir || !Number.isSafeInteger(chunk) || chunk < 1) usage();
  return { template, rows, filters, chunk, outDir };
}

function findRepoRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, '.git')) && fs.existsSync(path.join(current, '.planning'))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('repository root not found');
    current = parent;
  }
}

function csvFiles(input: string): string[] {
  const resolved = path.resolve(input);
  if (!fs.existsSync(resolved)) throw new Error(`rows path does not exist: ${input}`);
  if (fs.statSync(resolved).isFile()) return [resolved];
  return fs.readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.csv'))
    .map((entry) => path.join(resolved, entry.name))
    .sort();
}

function loadRows(input: string): { columns: string[]; rows: Record<string, string>[] } {
  let columns: string[] | undefined;
  const rows: Record<string, string>[] = [];
  for (const file of csvFiles(input)) {
    const parsed = parseCsv(fs.readFileSync(file, 'utf8'));
    if (parsed.length === 0) continue;
    if (!columns) columns = parsed[0];
    if (parsed[0].join('\0') !== columns.join('\0')) throw new Error(`${file}: CSV header differs from the first input file`);
    for (const values of parsed.slice(1)) {
      if (values.length !== columns.length) throw new Error(`${file}: expected ${columns.length} columns, got ${values.length}`);
      rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ''])));
    }
  }
  if (!columns) throw new Error('no CSV rows files found');
  return { columns, rows };
}

function currentLocation(value: string, mapRows: MapRow[]): string {
  const match = /^(.*?)(:\d+(?::\d+)?)$/.exec(value);
  if (!match) return resolvePath(value, mapRows);
  return `${resolvePath(match[1], mapRows)}${match[2]}`;
}

const options = parseArgs(process.argv.slice(2));
const root = findRepoRoot(process.cwd());
const std = path.join(root, '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std');
const mapDir = path.join(std, 'map');
const mapRows = fs.existsSync(mapDir) ? readMap(mapDir) : [];
const loaded = loadRows(options.rows);
const selected = loaded.rows.filter((row) => [...options.filters].every(([key, allowed]) => allowed.has(row[key] ?? '')));
for (const row of selected) {
  for (const column of ['declared_at', 'file']) {
    if (row[column]) row[column] = currentLocation(row[column], mapRows);
  }
}

fs.mkdirSync(options.outDir, { recursive: true });
const job = path.basename(path.resolve(options.outDir));
const template = fs.readFileSync(options.template, 'utf8').trimEnd();
const count = Math.ceil(selected.length / options.chunk);
for (let index = 0; index < count; index += 1) {
  const rows = selected.slice(index * options.chunk, (index + 1) * options.chunk);
  const csv = toCsv([loaded.columns, ...rows.map((row) => loaded.columns.map((column) => row[column] ?? ''))]).trimEnd();
  const output = `${template}\n\n\`\`\`csv\n${csv}\n\`\`\`\n`;
  fs.writeFileSync(path.join(options.outDir, `${job}-${String(index + 1).padStart(3, '0')}.md`), output, 'utf8');
}
console.log(count);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCsv } from './lib/csv.ts';
import { MAP_COLUMNS, readMap, writeMap, type MapRow } from './lib/map.ts';
import { buildExtraLexicon, isPtToken, splitIdentifier } from './pt-detect.ts';

type Issue = { level: 'error' | 'warning'; ids: string[]; message: string };
const SPECIAL = new Set(['KEEP', 'REMOVE', 'STATE']);
const ACTIVE = new Set(['proposed', 'approved', 'applied', 'verified']);
const WIRE_SCOPES = new Set(['packages-contracts', 'api', 'desk-vite', 'gestao-vite', 'crm', 'packages-tempo-real']);
const STATUS = ['candidate', 'proposed', 'approved', 'applied', 'verified'];

function styleOf(value: string): string {
  if (/^[A-Z][A-Z0-9_]*$/.test(value)) return 'upper';
  if (/^[a-z][a-z0-9_]*$/.test(value) && value.includes('_')) return 'snake';
  if (/^[a-z][a-z0-9-]*$/.test(value) && value.includes('-')) return 'kebab';
  return 'lower';
}
function validStyle(value: string, style: string): boolean {
  if (style === 'upper') return /^[A-Z][A-Z0-9_]*$/.test(value);
  if (style === 'snake') return /^[a-z][a-z0-9_]*$/.test(value);
  if (style === 'kebab') return /^[a-z][a-z0-9-]*$/.test(value);
  return /^[a-z][a-z0-9]*$/.test(value);
}
function segments(value: string): string[] { return value.replaceAll('\\', '/').split('/').filter(Boolean); }
function unprotectedTitleText(row: MapRow): string {
  if (row.kind !== 'test-title' || !row.notes.includes('D-47 retranslated')) return row.new;
  const technical = row.old.match(/\/[\w:./-]+|[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)+|[A-Za-z_][\w.-]*:[a-z_]+|[A-Za-z_][\w]*_[A-Za-z_][\w]*|[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z][A-Z0-9_]{2,}/g) ?? [];
  for (const match of row.old.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\[['"][^'"]+['"]\]/g)) technical.push(match[1]);
  for (const match of row.old.matchAll(/`([^`]+)`|"([^"]+)"|'([^']+)'/g)) {
    const literal = match[1] ?? match[2] ?? match[3];
    if (literal && !/\s/.test(literal)) technical.push(literal);
  }
  let text = row.new;
  for (const token of technical.sort((a, b) => b.length - a.length)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`(?<![\\w.:-])${escaped}(?![\\w.:-])`, 'g'), '');
  }
  return text;
}
function validCase(row: MapRow): boolean {
  const value = row.new;
  if (row.kind === 'data-attr') {
    const [key, content] = value.split('=');
    return /^data-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(key) && (content === undefined || /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(content));
  }
  if (row.kind === 'css-var') return /^--[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
  if (row.kind === 'css-class') return /^[a-z][a-z0-9]*(?:-{1,2}[a-z0-9]+)*$/.test(value);
  if (row.kind === 'literal-value' || ['queue', 'job-name', 'metric', 'cookie'].includes(row.kind)) return validStyle(value, styleOf(row.old));
  if (['file', 'dir', 'package', 'app', 'front-route', 'endpoint'].includes(row.kind)) {
    return segments(value).every((segment) => {
      if (segment.startsWith(':')) return /^:[a-z][A-Za-z0-9]*$/.test(segment);
      if (row.kind === 'package' && /^@[a-z][a-z0-9-]*$/.test(segment)) return true;
      if (['file', 'dir'].includes(row.kind) && /^\[[a-z][A-Za-z0-9]*\]$/.test(segment)) return true;
      return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*)*$/.test(segment);
    });
  }
  if (row.kind === 'symbol') {
    if (styleOf(row.old) === 'upper') return validStyle(value, 'upper');
    return /^[A-Z][A-Za-z0-9]*$/.test(row.old) ? /^[A-Z][A-Za-z0-9]*$/.test(value) : /^[a-z][A-Za-z0-9]*$/.test(value);
  }
  if (['ts-prop', 'ts-local', 'wire-key', 'query-param'].includes(row.kind)) return /^[a-z][A-Za-z0-9]*$/.test(value) || (styleOf(row.old) === 'upper' && validStyle(value, 'upper'));
  return true;
}
function glossaryPairs(file?: string): [string, string][] {
  if (!file) return [];
  if (!fs.existsSync(file)) throw new Error(`glossary not found: ${file}`);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
  const cells = (line: string) => line.split('|').slice(1, -1).map((part) => part.trim());
  const headerIndex = lines.findIndex((line) => {
    const columns = cells(line).map((cell) => cell.toLowerCase());
    return columns.some((cell) => /^(pt|term_pt|português|portugues|portuguese|old)$/.test(cell)) && columns.some((cell) => /^(en|term_en|english|new)$/.test(cell));
  });
  if (headerIndex < 0) throw new Error(`${file}: approved glossary table not found`);
  const header = cells(lines[headerIndex]).map((cell) => cell.toLowerCase());
  const oldAt = header.findIndex((cell) => /^(pt|term_pt|português|portugues|portuguese|old)$/.test(cell));
  const newAt = header.findIndex((cell) => /^(en|term_en|english|new)$/.test(cell));
  const approvedAt = header.findIndex((cell) => /approved|status/.test(cell));
  const pairs = lines.slice(headerIndex + 2).map(cells).filter((row) => row[oldAt] && row[newAt] && (approvedAt < 0 || /^(approved|yes|sim|true)$/i.test(row[approvedAt] ?? ''))).map((row) => [row[oldAt].toLowerCase(), row[newAt].toLowerCase()] as [string, string]);
  if (!pairs.length) throw new Error(`${file}: no approved glossary terms`);
  return pairs;
}

export function checkMap(options: { map: string; scopes?: string[]; requireStatus?: string; glossary?: string; approve?: boolean; sample?: number; seed?: number; out?: string }): { errors: Issue[]; warnings: Issue[]; sampledIds: string[] } {
  const all = readMap(options.map);
  const selected = options.scopes?.length && !options.scopes.includes('all') ? all.filter((row) => options.scopes!.includes(row.scope)) : all;
  const issues: Issue[] = [];
  const add = (level: Issue['level'], rows: MapRow[], message: string) => issues.push({ level, ids: rows.map((row) => row.id), message });
  const extra = buildExtraLexicon(all);
  const pairs = glossaryPairs(options.glossary);
  const required = STATUS.indexOf(options.requireStatus ?? 'candidate');
  if (required < 0) throw new Error('invalid --require-status');
  const collision = new Map<string, MapRow>();
  for (const row of selected) {
    if (STATUS.indexOf(row.status) < required) add('error', [row], `status ${row.status} below ${options.requireStatus}`);
    if (row.persisted === 'yes') add('error', [row], 'persisted row in map');
    if (!ACTIVE.has(row.status)) continue;
    if (!row.new) { add('error', [row], 'empty new'); continue; }
    if (row.new === row.old && row.new !== 'KEEP') add('error', [row], 'new equals old');
    if (SPECIAL.has(row.new)) {
      const allowed = row.new === 'REMOVE' ? ['D-14', 'D-27', 'D-28', 'D-29', 'D-30'] : row.new === 'STATE' ? ['D-29', 'D-30', 'D-31', 'D-34'] : [];
      if (allowed.length && !allowed.some((decision) => new RegExp(`\\b${decision}\\b`).test(row.decision_ref))) add('error', [row], `${row.new} needs decision_ref`);
      continue;
    }
    const pt = splitIdentifier(unprotectedTitleText(row)).filter((token) => isPtToken(token, extra) && !(row.kind === 'test-title' && ['echoes', 'zeroes'].includes(token)));
    if (pt.length) add('error', [row], `PT token: ${pt.join(', ')}`);
    if (!validCase(row)) add('error', [row], 'invalid casing');
    const suffix = Object.entries({ Controlador: 'Controller', Servico: 'Service', Guarda: 'Guard', Erro: 'Error', Filtro: 'Filter', Modulo: 'Module' }).find(([prefix]) => row.old.startsWith(prefix));
    if (row.kind === 'symbol' && suffix && !row.new.endsWith(suffix[1])) add('error', [row], `missing ${suffix[1]} suffix`);
    const file = row.declared_at.replaceAll('\\', '/').replace(/:\d+(?::\d+)?$/, '');
    // symbol/ts-local/ts-prop/front-route/endpoint rows commonly repeat the exact same old->new pair
    // at more than one declaration site within their own scope (a reused local var name across
    // functions; a Next.js layout.tsx + page.tsx sharing one URL; the same public route re-declared
    // per tenant type) — each site is its own row, so that repetition is not a real naming collision.
    // Only flag it when two DIFFERENT source identifiers would land on the same target in the same
    // scope. front-route is additionally scoped by `scope`: each front-end app owns an independent
    // router, so the same path (e.g. the shared /invite/:token route) legitimately recurs across apps.
    const perOccurrenceKind = ['symbol', 'ts-local', 'ts-prop', 'front-route', 'endpoint'].includes(row.kind);
    // `dir` rows carry a full path in `new`, directly comparable. `file` rows carry a bare
    // basename in `old` and an inconsistently-shaped `new` across scopes/generators (bare
    // basename, app-relative fragment, or full path) - only `new`'s basename is trustworthy;
    // the directory always comes from `declared_at` (matching move-files.ts's rowMove).
    const fileDestination = `${file.slice(0, file.lastIndexOf('/'))}/${row.new.replaceAll('\\', '/').split('/').pop()}`;
    const key = row.kind === 'file' ? `path:${fileDestination}` : row.kind === 'dir' ? `path:${row.new.replaceAll('\\', '/')}` : row.kind === 'front-route' ? `route:front-route:${row.scope}:${row.new}` : row.kind === 'endpoint' ? `route:endpoint:${row.new}` : `symbol:${row.kind}:${file}:${row.new}`;
    const previous = collision.get(key);
    const repeatableKind = perOccurrenceKind || ['css-class', 'css-var', 'data-attr'].includes(row.kind);
    if (previous && (previous.old !== row.old || !repeatableKind)) add('error', [previous, row], 'duplicate target');
    else if (!previous) collision.set(key, row);
    if (['endpoint', 'front-route'].includes(row.kind)) {
      const before = segments(row.old); const after = segments(row.new);
      if (before.length !== after.length || before.some((segment, i) => segment.startsWith(':') !== after[i]?.startsWith(':'))) add('error', [row], 'route segment or parameter position changed');
    }
    if (!/glossary-exception:\S+/.test(row.notes)) {
      const oldTokens = splitIdentifier(row.old);
      const newTokens = splitIdentifier(row.new);
      for (const [pt, en] of pairs) if (oldTokens.some((token) => token === pt || token === `${pt}s`) && !newTokens.some((token) => token === en || token === `${en}s`)) add('warning', [row], `glossary ${pt} -> ${en}`);
    }
  }
  const wires = selected.filter((row) => row.kind === 'wire-key' && ACTIVE.has(row.status) && !SPECIAL.has(row.new));
  for (const wire of wires) for (const row of selected) {
    if (row.id === wire.id || !ACTIVE.has(row.status) || !WIRE_SCOPES.has(row.scope) || !['wire-key', 'ts-prop'].includes(row.kind) || row.old !== wire.old || /wire-exception:\S+/.test(row.notes)) continue;
    if (row.new !== wire.new && !issues.some((issue) => issue.message === 'wire mismatch' && issue.ids.includes(row.id) && issue.ids.includes(wire.id))) add('error', [wire, row], 'wire mismatch');
  }
  let sampledIds: string[] = [];
  if (options.sample !== undefined) {
    if (!(options.sample >= 0 && options.sample <= 1) || options.seed === undefined || !options.out) throw new Error('--sample requires fraction, --seed and --out');
    let state = options.seed >>> 0;
    const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
    const sample: MapRow[] = [];
    for (const scope of [...new Set(selected.map((row) => row.scope))].sort()) {
      const rows = selected.filter((row) => row.scope === scope).sort((a, b) => a.id.localeCompare(b.id));
      const shuffled = rows.map((row) => ({ row, rank: random() })).sort((a, b) => a.rank - b.rank).map(({ row }) => row);
      sample.push(...shuffled.slice(0, Math.ceil(rows.length * options.sample)));
    }
    sampledIds = sample.map((row) => row.id);
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, toCsv([[...MAP_COLUMNS], ...sample.map((row) => MAP_COLUMNS.map((column) => row[column]))]));
  }
  const errors = issues.filter((issue) => issue.level === 'error');
  if (options.approve && errors.length === 0) writeMap(options.map, selected.filter((row) => row.status === 'proposed').map((row) => ({ ...row, status: 'approved' })));
  return { errors, warnings: issues.filter((issue) => issue.level === 'warning'), sampledIds };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) { console.log('--map <STD/map> [--scopes a,b|all] [--require-status proposed|approved] [--glossary <file>] [--sample <fraction> --seed <n> --out <csv>] [--approve]'); process.exit(0); }
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    const result = checkMap({ map: value('--map'), scopes: args.includes('--scopes') ? value('--scopes').split(',') : undefined, requireStatus: args.includes('--require-status') ? value('--require-status') : undefined, glossary: args.includes('--glossary') ? value('--glossary') : undefined, sample: args.includes('--sample') ? Number(value('--sample')) : undefined, seed: args.includes('--seed') ? Number(value('--seed')) : undefined, out: args.includes('--out') ? value('--out') : undefined, approve: args.includes('--approve') });
    for (const level of ['errors', 'warnings'] as const) { console.log(`${level}: ${result[level].length}`); for (const issue of result[level]) console.log(`  ${issue.ids.join(',')}: ${issue.message}`); }
    if (result.sampledIds.length) console.log(`sample: ${result.sampledIds.join(',')}`);
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(String(error)); process.exitCode = 2; }
}

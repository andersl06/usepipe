import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsv, toCsv } from './lib/csv.ts';
import { readMap, type MapRow } from './lib/map.ts';

/**
 * Finds string-keyed runtime contracts that survived a mechanical PT->EN rename on only
 * one side: a body/query key read by name, a SQL alias read in camelCase, a data-* attribute,
 * a CSS class, a route string, a queue/job/event name, or a storage key. The TypeScript
 * compiler cannot see any of these — they cross a wire, the DOM, or a plain string boundary.
 */

export type FindingClass =
  | 'request-key'
  | 'response-key'
  | 'sql-alias'
  | 'data-attr'
  | 'css-class'
  | 'route'
  | 'queue-name'
  | 'event-name'
  | 'storage-key'
  | 'env-name'
  | 'other-string';

export interface Finding {
  file: string;
  line: number;
  class: FindingClass;
  old: string;
  new: string;
  snippet: string;
  counterpart: string;
}

const SPECIAL_NEW = new Set(['KEEP', 'REMOVE', 'STATE']);
const EXCLUDED_PATH_RE = /^(?:\.planning\/|referencias-blip\/)|\/dist\/|(?:^|\/)pnpm-lock\.yaml$|\.md$/;

const KEY_KINDS = ['ts-prop', 'wire-key'];
const CSS_KINDS = ['css-class', 'css-var'];
const DATA_ATTR_KINDS = ['data-attr'];
const ROUTE_KINDS = ['front-route', 'endpoint'];
const QUEUE_KINDS = ['queue', 'job-name'];
const STORAGE_KINDS = ['literal-value', 'cookie', 'query-param'];

export interface Pairs {
  keys: Map<string, string>;
  css: Map<string, string>;
  dataAttrs: Map<string, string>;
  routes: Map<string, string>;
  queues: Map<string, string>;
  storage: Map<string, string>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadPersistedOlds(persistedCsvPath: string | undefined): Set<string> {
  if (!persistedCsvPath || !fs.existsSync(persistedCsvPath)) return new Set();
  const [header = [], ...rows] = parseCsv(fs.readFileSync(persistedCsvPath, 'utf8'));
  const oldIndex = header.indexOf('old');
  if (oldIndex === -1) return new Set();
  return new Set(rows.map((row) => row[oldIndex]).filter((value): value is string => Boolean(value)));
}

function buildPairMap(rows: MapRow[], kinds: string[], persistedOlds: Set<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!kinds.includes(row.kind)) continue;
    if (!['applied', 'verified'].includes(row.status)) continue;
    if (row.old === row.new || !row.old || !row.new) continue;
    if (SPECIAL_NEW.has(row.new)) continue;
    if (row.persisted === 'yes') continue;
    if (persistedOlds.has(row.old)) continue;
    if (!map.has(row.old)) map.set(row.old, row.new);
  }
  return map;
}

/** Rows whose scope map file changed since `sinceRev` (coarse: file-level, not line-level). */
function filterRowsSinceRev(mapDir: string, rows: MapRow[], sinceRev: string, cwd: string): MapRow[] {
  let changed: string[];
  try {
    changed = execFileSync('git', ['diff', '--name-only', sinceRev, '--', mapDir], { cwd, encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
      .map((file) => file.replaceAll('\\', '/'));
  } catch {
    return rows;
  }
  if (changed.length === 0) return rows;
  const changedScopes = new Set(changed.map((file) => path.basename(file, '.csv')));
  return rows.filter((row) => changedScopes.has(row.scope));
}

export function buildPairs(
  mapDir: string,
  options: { sinceRev?: string; cwd?: string; persistedCsvPath?: string } = {},
): Pairs {
  const cwd = options.cwd ?? process.cwd();
  let rows = readMap(mapDir, { status: ['applied', 'verified'] });
  if (options.sinceRev) rows = filterRowsSinceRev(mapDir, rows, options.sinceRev, cwd);
  const persistedOlds = loadPersistedOlds(options.persistedCsvPath);
  return {
    keys: buildPairMap(rows, KEY_KINDS, persistedOlds),
    css: buildPairMap(rows, CSS_KINDS, persistedOlds),
    dataAttrs: buildPairMap(rows, DATA_ATTR_KINDS, persistedOlds),
    routes: buildPairMap(rows, ROUTE_KINDS, persistedOlds),
    queues: buildPairMap(rows, QUEUE_KINDS, persistedOlds),
    storage: buildPairMap(rows, STORAGE_KINDS, persistedOlds),
  };
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

function lineText(text: string, lineNumber: number): string {
  return text.split(/\r?\n/)[lineNumber - 1]?.trim() ?? '';
}

function isExcluded(file: string): boolean {
  const normalized = file.replaceAll('\\', '/');
  return EXCLUDED_PATH_RE.test(normalized);
}

interface Candidate {
  identifier: string;
  index: number;
}

function findWordCandidates(text: string, re: RegExp, group = 1): Candidate[] {
  const results: Candidate[] = [];
  let match: RegExpExecArray | null;
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  while ((match = global.exec(text))) {
    const identifier = match[group];
    if (identifier) results.push({ identifier, index: match.index });
    if (match.index === global.lastIndex) global.lastIndex += 1;
  }
  return results;
}

/** Object key (`old:` / `'old':`) whose literal is an argument of a call: `f(x, { old: ... })`. */
function callArgumentKeyCandidates(text: string): Candidate[] {
  const re = /\w+\s*(?:<[^>()]*>)?\s*\(\s*[^{}()]*,\s*\{([^{}]*)\}/g;
  const results: Candidate[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const body = match[1] ?? '';
    // match[0] ends in `{` + body + `}`; the body starts right after that `{`.
    const bodyStart = match.index + match[0].length - body.length - 1;
    const keyRe = /(?:^|[,\s])(['"]?)([A-Za-z_$][\w$]*)\1\s*:/g;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = keyRe.exec(body))) {
      results.push({ identifier: keyMatch[2]!, index: bodyStart + keyMatch.index + keyMatch[0].indexOf(keyMatch[2]!) });
    }
  }
  return results;
}

/** `.old` / `['old']` access on one of the given receiver names. */
function accessCandidates(text: string, receivers: string[]): Candidate[] {
  const receiverAlt = receivers.map(escapeRegExp).join('|');
  const re = new RegExp(`\\b(?:${receiverAlt})\\??\\.([A-Za-z_$][\\w$]*)|\\b(?:${receiverAlt})\\[['"]([A-Za-z_$][\\w$]*)['"]\\]`, 'g');
  const results: Candidate[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const identifier = match[1] ?? match[2];
    if (identifier) results.push({ identifier, index: match.index });
  }
  return results;
}

/** `as old` / `as "old"` inside a `sql\`...\`` tagged template. */
function sqlAliasCandidates(text: string): Candidate[] {
  const templateRe = /\bsql`((?:[^`\\]|\\.)*)`/g;
  const results: Candidate[] = [];
  let templateMatch: RegExpExecArray | null;
  while ((templateMatch = templateRe.exec(text))) {
    const body = templateMatch[1] ?? '';
    const bodyStart = templateMatch.index + templateMatch[0].indexOf('`') + 1;
    const aliasRe = /\bas\s+"?([A-Za-z_][\w]*)"?/g;
    let aliasMatch: RegExpExecArray | null;
    while ((aliasMatch = aliasRe.exec(body))) {
      results.push({ identifier: aliasMatch[1]!, index: bodyStart + aliasMatch.index });
    }
  }
  return results;
}

/** `data-old` in JSX attributes or CSS attribute selectors. */
function dataAttrCandidates(text: string): Candidate[] {
  return findWordCandidates(text, /\bdata-([a-z][\w-]*)/gi);
}

/** CSS class selector `.old` / custom property `--old` in a `.css` file. */
function cssSelectorCandidates(text: string): Candidate[] {
  return [
    ...findWordCandidates(text, /(?<![\w-])\.([a-zA-Z_][\w-]*)/g),
    ...findWordCandidates(text, /--([a-zA-Z_][\w-]*)/g),
  ];
}

/** `className="...old..."` / `className={\`...old...\`}` word list. */
function classNameCandidates(text: string): Candidate[] {
  const results: Candidate[] = [];
  const attrRe = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(text))) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    const valueStart = match.index + match[0].indexOf(value);
    const wordRe = /[\w-]+/g;
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = wordRe.exec(value))) {
      results.push({ identifier: wordMatch[0], index: valueStart + wordMatch.index });
    }
  }
  return results;
}

/** Path segment `/old` inside a quoted string. */
function routeSegmentCandidates(text: string): Candidate[] {
  const results: Candidate[] = [];
  const stringRe = /(['"`])(\/[\w-]*(?:\/[\w:-]*)*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = stringRe.exec(text))) {
    const value = match[2]!;
    const valueStart = match.index + match[0].indexOf(value);
    let offset = 0;
    for (const segment of value.split('/')) {
      if (segment) results.push({ identifier: segment, index: valueStart + offset });
      offset += segment.length + 1;
    }
  }
  return results;
}

/** First string argument of `new Queue(`/`Worker(`/`.emit(`/`.on(`. */
function queueEventCandidates(text: string): { queue: Candidate[]; event: Candidate[] } {
  const queue: Candidate[] = [];
  const event: Candidate[] = [];
  const queueRe = /\bnew\s+(?:Queue|Worker)\(\s*['"]([\w:-]+)['"]/g;
  const eventRe = /\.(?:emit|on)\(\s*['"]([\w:.-]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = queueRe.exec(text))) queue.push({ identifier: match[1]!, index: match.index });
  while ((match = eventRe.exec(text))) event.push({ identifier: match[1]!, index: match.index });
  return { queue, event };
}

/** `(localStorage|sessionStorage).(get|set|remove)Item('old')`. */
function storageCandidates(text: string): Candidate[] {
  return findWordCandidates(text, /\b(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*['"]([\w:.-]+)['"]/g);
}

interface ScanOptions {
  files: string[];
  readFile: (file: string) => string;
}

export function scanRepo(pairs: Pairs, options: ScanOptions): Finding[] {
  const findings: Finding[] = [];
  // counterpart[class] maps a `new` identifier to the first file where it was seen in contract position.
  const counterpart: Record<FindingClass, Map<string, string>> = {
    'request-key': new Map(), 'response-key': new Map(), 'sql-alias': new Map(), 'data-attr': new Map(),
    'css-class': new Map(), route: new Map(), 'queue-name': new Map(), 'event-name': new Map(),
    'storage-key': new Map(), 'env-name': new Map(), 'other-string': new Map(),
  };
  const newSets: Record<Exclude<FindingClass, 'env-name' | 'other-string'>, Set<string>> = {
    'request-key': new Set(pairs.keys.values()),
    'response-key': new Set(pairs.keys.values()),
    'sql-alias': new Set(pairs.keys.values()),
    'data-attr': new Set(pairs.dataAttrs.values()),
    'css-class': new Set(pairs.css.values()),
    route: new Set(pairs.routes.values()),
    'queue-name': new Set(pairs.queues.values()),
    'event-name': new Set(pairs.queues.values()),
    'storage-key': new Set(pairs.storage.values()),
  };

  function record(
    file: string,
    text: string,
    klass: FindingClass,
    candidates: Candidate[],
    oldMap: Map<string, string>,
    newSet: Set<string>,
  ) {
    for (const candidate of candidates) {
      if (newSet.has(candidate.identifier) && !counterpart[klass].has(candidate.identifier)) {
        counterpart[klass].set(candidate.identifier, file);
      }
    }
    for (const candidate of candidates) {
      const renamed = oldMap.get(candidate.identifier);
      if (!renamed) continue;
      findings.push({
        file,
        line: lineOf(text, candidate.index),
        class: klass,
        old: candidate.identifier,
        new: renamed,
        snippet: lineText(text, lineOf(text, candidate.index)),
        counterpart: '',
      });
    }
  }

  for (const file of options.files) {
    if (isExcluded(file)) continue;
    const isCss = file.endsWith('.css');
    const isSql = file.endsWith('.ts') || file.endsWith('.tsx');
    const isFrontend = file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js');
    let text: string;
    try {
      text = options.readFile(file);
    } catch {
      continue;
    }

    if (isFrontend) {
      record(file, text, 'request-key', callArgumentKeyCandidates(text), pairs.keys, newSets['request-key']);
      record(file, text, 'request-key', accessCandidates(text, ['body', 'query', 'params']), pairs.keys, newSets['request-key']);
      record(file, text, 'response-key', accessCandidates(text, ['row', 'rows', 'data', 'payload', 'dataset']), pairs.keys, newSets['response-key']);
      if (isSql) record(file, text, 'sql-alias', sqlAliasCandidates(text), pairs.keys, newSets['sql-alias']);
      record(file, text, 'data-attr', dataAttrCandidates(text), pairs.dataAttrs, newSets['data-attr']);
      record(file, text, 'css-class', classNameCandidates(text), pairs.css, newSets['css-class']);
      record(file, text, 'route', routeSegmentCandidates(text), pairs.routes, newSets.route);
      const { queue, event } = queueEventCandidates(text);
      record(file, text, 'queue-name', queue, pairs.queues, newSets['queue-name']);
      record(file, text, 'event-name', event, pairs.queues, newSets['event-name']);
      record(file, text, 'storage-key', storageCandidates(text), pairs.storage, newSets['storage-key']);
    }
    if (isCss) {
      record(file, text, 'css-class', cssSelectorCandidates(text), pairs.css, newSets['css-class']);
      record(file, text, 'data-attr', dataAttrCandidates(text), pairs.dataAttrs, newSets['data-attr']);
    }
  }

  for (const finding of findings) {
    finding.counterpart = counterpart[finding.class].get(finding.new) ?? '';
  }
  return findings;
}

function readAllowlist(file: string | undefined): Set<string> {
  if (!file || !fs.existsSync(file)) return new Set();
  const [header = [], ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
  const fileIndex = header.indexOf('file');
  const oldIndex = header.indexOf('old');
  const classIndex = header.indexOf('class');
  return new Set(rows.map((row) => `${row[fileIndex] ?? ''}\0${row[oldIndex] ?? ''}\0${row[classIndex] ?? ''}`));
}

export function applyAllowlist(findings: Finding[], allowlist: Set<string>): Finding[] {
  return findings.filter((finding) => !allowlist.has(`${finding.file}\0${finding.old}\0${finding.class}`));
}

// --- env-name check (--env-since) -----------------------------------------------------------

const ENV_FILE_RE = /\.(?:ya?ml|env.*|sh|bash)$|(?:^|\/)Dockerfile[^/]*$/i;

function extractEnvNames(content: string, file: string): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]!);
  for (const match of content.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g)) names.add(match[1]!);
  for (const match of content.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]!);
  if (ENV_FILE_RE.test(file)) {
    for (const match of content.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::[^}]*)?\}/g)) names.add(match[1]!);
    for (const match of content.matchAll(/\$([A-Z][A-Z0-9_]*)\b/g)) names.add(match[1]!);
  }
  return names;
}

export interface EnvSinceOptions {
  cwd: string;
  rev: string;
  changedFiles?: string[];
  readWorkingFile?: (file: string) => string | undefined;
  readRevFile?: (rev: string, file: string) => string | undefined;
}

export function checkEnvSince(options: EnvSinceOptions): Finding[] {
  const changedFiles = (
    options.changedFiles ??
    execFileSync('git', ['diff', '--name-only', options.rev, '--', '.', ':!.planning'], {
      cwd: options.cwd,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter(Boolean)
  ).map((file) => file.replaceAll('\\', '/'));

  const readWorking = options.readWorkingFile ?? ((file: string) => {
    try {
      return fs.readFileSync(path.join(options.cwd, file), 'utf8');
    } catch {
      return undefined;
    }
  });
  const readRev = options.readRevFile ?? ((rev: string, file: string) => {
    try {
      return execFileSync('git', ['show', `${rev}:${file}`], { cwd: options.cwd, encoding: 'utf8' });
    } catch {
      return undefined;
    }
  });

  const findings: Finding[] = [];
  for (const file of changedFiles) {
    if (isExcluded(file)) continue;
    const oldContent = readRev(options.rev, file);
    const newContent = readWorking(file);
    if (oldContent === undefined) continue; // new file, nothing to compare
    const oldNames = extractEnvNames(oldContent, file);
    const newNames = newContent === undefined ? new Set<string>() : extractEnvNames(newContent, file);
    const removed = [...oldNames].filter((name) => !newNames.has(name));
    const added = [...newNames].filter((name) => !oldNames.has(name));
    for (const name of removed) {
      findings.push({
        file, line: 0, class: 'env-name', old: name, new: added[0] ?? '', snippet: '', counterpart: '',
      });
    }
  }
  return findings;
}

// --- CLI ---------------------------------------------------------------------------------------

function printHelp(): void {
  console.log(`Usage: node tools/std/runtime-contracts.ts --map <dir> --out <csv> [options]

Options:
  --map <dir>        Directory of approved rename-map CSVs (required unless --env-since only)
  --out <csv>         Output CSV path for findings (required unless --env-since only)
  --allow <csv>       Allowlist CSV (columns: file,old,class,reason,ref)
  --since <rev>       Only consider map rows whose scope file changed since <rev>
  --env-since <rev>   Fail if any environment variable name changed since <rev> (D-06/D-36)
  --root <dir>        Repository root to scan (default: cwd)
  --persisted <csv>   Path to persisted.csv (identifiers excluded from pair candidates)
  --help              Show this help
`);
}

function allTrackedFiles(root: string): string[] {
  const output = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}

function parseArguments(argv: string[]): Map<string, string | true> {
  const result = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') result.set('--help', true);
    else if (argument?.startsWith('--')) {
      const value = argv[index + 1];
      if (value && !value.startsWith('--')) {
        result.set(argument, value);
        index += 1;
      } else {
        result.set(argument, true);
      }
    }
  }
  return result;
}

function writeFindingsCsv(file: string, findings: Finding[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    toCsv([
      ['file', 'line', 'class', 'old', 'new', 'snippet', 'counterpart'],
      ...findings.map((finding) => [
        finding.file, String(finding.line), finding.class, finding.old, finding.new, finding.snippet, finding.counterpart,
      ]),
    ]),
    'utf8',
  );
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  if (args.has('--help')) {
    printHelp();
    return;
  }

  const root = typeof args.get('--root') === 'string' ? String(args.get('--root')) : process.cwd();
  const allowlist = readAllowlist(typeof args.get('--allow') === 'string' ? String(args.get('--allow')) : undefined);
  let findings: Finding[] = [];

  if (args.has('--map')) {
    const mapDir = String(args.get('--map'));
    const outFile = typeof args.get('--out') === 'string' ? String(args.get('--out')) : undefined;
    const sinceRev = typeof args.get('--since') === 'string' ? String(args.get('--since')) : undefined;
    const persistedCsvPath = typeof args.get('--persisted') === 'string' ? String(args.get('--persisted')) : undefined;
    const pairs = buildPairs(mapDir, { sinceRev, cwd: root, persistedCsvPath });
    const files = allTrackedFiles(root);
    findings = scanRepo(pairs, {
      files,
      readFile: (file) => fs.readFileSync(path.join(root, file), 'utf8'),
    });
    if (outFile) writeFindingsCsv(path.join(root, outFile).startsWith(root) ? outFile : outFile, findings);
  }

  const kept = applyAllowlist(findings, allowlist);

  if (args.has('--env-since')) {
    const envFindings = checkEnvSince({ cwd: root, rev: String(args.get('--env-since')) });
    const keptEnv = applyAllowlist(envFindings, allowlist);
    kept.push(...keptEnv);
  }

  if (kept.length > 0) {
    console.error(`RUNTIME CONTRACT BREAKS: ${kept.length}`);
    for (const finding of kept) {
      console.error(`${finding.file}:${finding.line} [${finding.class}] ${finding.old} -> ${finding.new}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Runtime contracts: clean.');
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tsMorph from 'ts-morph';
import { readMap, writeMap, type MapRow } from './lib/map.ts';

const { Project, SyntaxKind, ts } = tsMorph;
const ALLOWED_KINDS = new Set(['file', 'dir', 'package', 'app']);
const SPECIAL_VALUES = new Set(['KEEP', 'REMOVE', 'STATE']);

export interface MoveFilesOptions {
  root?: string;
  mapDir: string;
  scopes?: string[];
  kinds?: string[];
  status?: string[];
  ids?: string[];
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface MoveFilesResult {
  moved: number;
  rewritten: number;
  report?: string;
}
interface Move {
  row: MapRow;
  oldPath: string;
  newPath: string;
}
interface Specifier {
  importer: string;
  start: number;
  end: number;
  quote: string;
  value: string;
  target: string;
}

function normalize(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}
function relative(root: string, file: string): string {
  return normalize(path.relative(root, file));
}
function isInside(value: string, parent: string): boolean {
  return value === parent || value.startsWith(`${parent}/`);
}

function mapPath(value: string, moves: Move[]): string {
  let current = normalize(value);
  for (const move of moves) {
    if (current === move.oldPath) current = move.newPath;
    else if (isInside(current, move.oldPath))
      current = `${move.newPath}${current.slice(move.oldPath.length)}`;
  }
  return current;
}

function rowMove(row: MapRow): Move {
  if (row.kind === 'package')
    return {
      row,
      oldPath: normalize(`packages/${row.old}`),
      newPath: normalize(`packages/${row.new}`),
    };
  if (row.kind === 'app')
    return { row, oldPath: normalize(`apps/${row.old}`), newPath: normalize(`apps/${row.new}`) };
  // file rows carry a bare basename in `old` (inventory convention) - the real
  // source path is `declared_at`; dir rows already carry a full path in `old`.
  // `new`'s directory portion (when present) is inconsistent across scopes/
  // generators (some full-path, some app-relative, some bare basename) - only
  // its basename is trustworthy; the directory always comes from `declared_at`
  // so mapPath's dir-move chaining translates it the same way as every other kind.
  if (row.kind === 'file') {
    const newValue = `${path.posix.dirname(normalize(row.declared_at))}/${path.posix.basename(row.new)}`;
    return { row, oldPath: normalize(row.declared_at), newPath: normalize(newValue) };
  }
  return { row, oldPath: normalize(row.old), newPath: normalize(row.new) };
}

function trackedFiles(root: string): string[] {
  const output = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean).map(normalize);
}

function resolveModule(root: string, importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = normalize(
    path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier)),
  );
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.js`,
    `${base}.mjs`,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    base.replace(/\.mjs$/, '.mts'),
    `${base}/index.ts`,
    `${base}/index.tsx`,
    base.replace(/\.js$/, '/index.ts'),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(root, candidate)));
}

function collectSpecifiers(root: string, files: string[]): Specifier[] {
  const project = new Project({
    compilerOptions: { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  const sourceFiles = files
    .filter((file) => /\.(?:ts|tsx|mts|js|mjs)$/.test(file))
    .map((file) => project.addSourceFileAtPath(path.join(root, file)));
  const result: Specifier[] = [];
  for (const sourceFile of sourceFiles) {
    const importer = relative(root, sourceFile.getFilePath());
    const add = (literal: {
      getLiteralText(): string;
      getStart(): number;
      getEnd(): number;
      getText(): string;
    }) => {
      const value = literal.getLiteralText();
      const target = resolveModule(root, importer, value);
      if (!target) return;
      const text = literal.getText();
      result.push({
        importer,
        start: literal.getStart(),
        end: literal.getEnd(),
        quote: text[0] ?? "'",
        value,
        target,
      });
    };
    for (const declaration of sourceFile.getImportDeclarations())
      add(declaration.getModuleSpecifier());
    for (const declaration of sourceFile.getExportDeclarations()) {
      const literal = declaration.getModuleSpecifier();
      if (literal) add(literal);
    }
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression().getText();
      if (
        expression === 'import' ||
        expression === 'require' ||
        /^(?:vi|jest)\.(?:mock|importActual)$/.test(expression)
      ) {
        const literal = call.getArguments()[0];
        if (literal && literal.getKind() === SyntaxKind.StringLiteral) add(literal as never);
      }
    }
    for (const importType of sourceFile.getDescendantsOfKind(SyntaxKind.ImportType)) {
      const literalType = importType.getArgument();
      const literal = literalType.getFirstChildByKind(SyntaxKind.StringLiteral);
      if (literal) add(literal as never);
    }
  }
  return result;
}

function styledSpecifier(oldValue: string, importerNew: string, targetNew: string): string {
  const hadIndex = /\/index(?:\.[^.\/]+)?$/.test(oldValue);
  const wasDirectoryStyle = !hadIndex && /\/index\.(?:ts|tsx|js|mts|mjs)$/.test(targetNew);
  let targetForRelative = targetNew;
  if (wasDirectoryStyle)
    targetForRelative = targetNew.replace(/\/index\.(?:ts|tsx|js|mts|mjs)$/, '');
  let result = path.posix.relative(path.posix.dirname(importerNew), targetForRelative);
  if (!result.startsWith('.')) result = `./${result}`;
  const extension = /\.(js|mjs|ts|tsx)$/.exec(oldValue)?.[1];
  if (extension) result = result.replace(/\.(?:ts|tsx|mts|js|mjs)$/, `.${extension}`);
  else result = result.replace(/\.(?:ts|tsx|mts|js|mjs)$/, '');
  return result;
}

function rewriteSpecifiers(
  root: string,
  specifiers: Specifier[],
  moves: Move[],
  dryRun: boolean,
  log?: (message: string) => void,
): number {
  const byFile = new Map<string, Array<Specifier & { replacement: string }>>();
  for (const specifier of specifiers) {
    const importerNew = mapPath(specifier.importer, moves);
    const targetNew = mapPath(specifier.target, moves);
    if (importerNew === specifier.importer && targetNew === specifier.target) continue;
    const replacement = styledSpecifier(specifier.value, importerNew, targetNew);
    if (replacement === specifier.value) continue;
    const list = byFile.get(importerNew) ?? [];
    list.push({ ...specifier, replacement });
    byFile.set(importerNew, list);
    log?.(
      `${dryRun ? 'would rewrite' : 'rewrite'} ${importerNew}: ${specifier.value} -> ${replacement}`,
    );
  }
  if (!dryRun) {
    for (const [file, replacements] of byFile) {
      const fullPath = path.join(root, file);
      let text = fs.readFileSync(fullPath, 'utf8');
      for (const item of replacements.sort((a, b) => b.start - a.start)) {
        text = `${text.slice(0, item.start)}${item.quote}${item.replacement}${item.quote}${text.slice(item.end)}`;
      }
      fs.writeFileSync(fullPath, text, 'utf8');
    }
  }
  return [...byFile.values()].reduce((total, items) => total + items.length, 0);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Replaces oldValue only where it sits as a whole path segment/token (bounded by
// start-of-string, a slash, or a quote, and followed by end-of-string, a slash, a
// quote, or a dot). Bare fragments like a directory's post-"/src/" tail otherwise
// match anywhere the same characters occur, including inside unrelated prose such
// as a package.json "description" field (ponytail: regex boundary, not a full
// tokenizer — revisit if a config ever needs mid-word path fragments).
function replaceAsPathSegment(text: string, oldValue: string, newValue: string): string {
  const pattern = new RegExp(`(^|[/'"])${escapeRegex(oldValue)}(?=$|[/'".])`, 'g');
  return text.replace(pattern, (_match, boundary: string) => `${boundary}${newValue}`);
}

function rewriteConfigPaths(
  root: string,
  files: string[],
  moves: Move[],
  dryRun: boolean,
  log?: (message: string) => void,
): number {
  const configs = files.filter((file) =>
    /(^|\/)(?:vitest|vite|next)\.config\.[^/]+$|(^|\/)tsconfig[^/]*\.json$|(^|\/)package\.json$/.test(
      file,
    ),
  );
  let count = 0;
  for (const originalFile of configs) {
    const file = mapPath(originalFile, moves);
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) continue;
    const original = fs.readFileSync(fullPath, 'utf8');
    let changed = original;
    for (const move of moves) {
      const oldRel = path.posix.relative(path.posix.dirname(originalFile), move.oldPath);
      const newRel = path.posix.relative(path.posix.dirname(file), move.newPath);
      const forms: Array<[string, string]> = [
        [move.oldPath, move.newPath],
        [oldRel, newRel],
        [`./${oldRel}`, `./${newRel}`],
      ];
      const oldSrc = move.oldPath.replace(/(^|\/)src\//, '$1dist/');
      const newSrc = move.newPath.replace(/(^|\/)src\//, '$1dist/');
      forms.push([oldSrc, newSrc]);
      const oldTail = move.oldPath.split('/').slice(-2).join('/');
      const newTail = move.newPath.split('/').slice(-2).join('/');
      if (oldTail !== newTail) forms.push([oldTail, newTail]);
      const oldAfterSrc = move.oldPath.includes('/src/') ? move.oldPath.split('/src/')[1] : '';
      const newAfterSrc = move.newPath.includes('/src/') ? move.newPath.split('/src/')[1] : '';
      if (oldAfterSrc && oldAfterSrc !== newAfterSrc) forms.push([oldAfterSrc, newAfterSrc]);
      for (const [oldValue, newValue] of forms) {
        if (oldValue && oldValue !== newValue && changed.includes(oldValue))
          changed = replaceAsPathSegment(changed, oldValue, newValue);
      }
    }
    if (changed !== original) {
      count += 1;
      log?.(`${dryRun ? 'would rewrite' : 'rewrite'} config ${file}`);
      if (!dryRun) fs.writeFileSync(fullPath, changed, 'utf8');
    }
  }
  return count;
}

function performMoves(
  root: string,
  moves: Move[],
  dryRun: boolean,
  log?: (message: string) => void,
): void {
  const applied: Move[] = [];
  for (const move of moves) {
    const source = mapPath(move.oldPath, applied);
    const destination = mapPath(move.newPath, applied);
    log?.(`${dryRun ? 'would move' : 'move'} ${source} -> ${destination}`);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(path.join(root, destination)), { recursive: true });
      if (source.toLowerCase() === destination.toLowerCase() && source !== destination) {
        const temporary = `${source}.__tmp__`;
        execFileSync('git', ['mv', source, temporary], { cwd: root });
        execFileSync('git', ['mv', temporary, destination], { cwd: root });
      } else {
        execFileSync('git', ['mv', source, destination], { cwd: root });
      }
    }
    applied.push({ ...move, oldPath: source, newPath: destination });
  }
}

function writeLeftovers(root: string, mapDir: string, moves: Move[]): string {
  const lines: string[] = [];
  const files = trackedFiles(root).filter((file) =>
    /(?:^Dockerfile|Dockerfile|\.dockerignore$|\.sh$|\.ya?ml$|\.md$|\.json$)/.test(file),
  );
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const move of moves) {
      text.split(/\r?\n/).forEach((line, index) => {
        if (line.includes(move.oldPath)) lines.push(`${file}:${index + 1}:${line}`);
      });
    }
  }
  const reports = path.join(path.dirname(mapDir), 'reports');
  fs.mkdirSync(reports, { recursive: true });
  const report = path.join(
    reports,
    `move-leftovers-${new Date().toISOString().replaceAll(':', '-')}.txt`,
  );
  fs.writeFileSync(report, lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
  return report;
}

export function moveFiles(options: MoveFilesOptions): MoveFilesResult {
  const root = fs.realpathSync.native(path.resolve(options.root ?? '.'));
  const kinds = options.kinds ?? [...ALLOWED_KINDS];
  const invalid = kinds.filter((kind) => !ALLOWED_KINDS.has(kind));
  if (invalid.length) {
    const error = new Error(`unsupported kinds: ${invalid.join(',')}`) as Error & {
      exitCode?: number;
    };
    error.exitCode = 2;
    throw error;
  }
  const statuses = options.status ?? ['approved'];
  if (!options.dryRun && statuses.some((status) => status !== 'approved')) {
    const error = new Error('non-approved status is allowed only with --dry-run') as Error & {
      exitCode?: number;
    };
    error.exitCode = 2;
    throw error;
  }
  const rows = readMap(options.mapDir).filter(
    (row) =>
      kinds.includes(row.kind) &&
      statuses.includes(row.status) &&
      !SPECIAL_VALUES.has(row.new) &&
      (!options.scopes || options.scopes.includes('all') || options.scopes.includes(row.scope)) &&
      (!options.ids || options.ids.includes(row.id)),
  );
  const moves = rows.map(rowMove).sort((a, b) => {
    const aDir = ['dir', 'package', 'app'].includes(a.row.kind) ? 0 : 1;
    const bDir = ['dir', 'package', 'app'].includes(b.row.kind) ? 0 : 1;
    return aDir - bDir || b.oldPath.length - a.oldPath.length;
  });
  const files = trackedFiles(root);
  const specifiers = collectSpecifiers(root, files);
  performMoves(root, moves, Boolean(options.dryRun), options.log);
  const rewritten =
    rewriteSpecifiers(root, specifiers, moves, Boolean(options.dryRun), options.log) +
    rewriteConfigPaths(root, files, moves, Boolean(options.dryRun), options.log);
  let report: string | undefined;
  if (!options.dryRun) {
    for (const row of rows) row.status = 'applied';
    writeMap(options.mapDir, rows);
    report = writeLeftovers(root, options.mapDir, moves);
  }
  options.log?.(`moved=${options.dryRun ? 0 : moves.length} rewritten=${rewritten}`);
  return { moved: options.dryRun ? 0 : moves.length, rewritten, report };
}

function list(value: string | undefined): string[] | undefined {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
function parseArgs(argv: string[]): MoveFilesOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dry-run') values.set('dry-run', 'true');
    else if (argv[index].startsWith('--')) values.set(argv[index].slice(2), argv[++index]);
  }
  if (!values.get('map')) throw new Error('--map is required');
  return {
    root: values.get('root') ?? '.',
    mapDir: values.get('map')!,
    scopes: list(values.get('scopes')),
    kinds: list(values.get('kinds')),
    status: list(values.get('status')),
    ids: list(values.get('ids')),
    dryRun: values.get('dry-run') === 'true',
    log: console.log,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    moveFiles(parseArgs(process.argv.slice(2)));
  } catch (caught) {
    const error = caught as Error & { exitCode?: number };
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}

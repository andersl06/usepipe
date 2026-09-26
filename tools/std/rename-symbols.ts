import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Node } from 'ts-morph';
import { loadWorkspaceProject } from './lib/project.ts';
import { readMap, resolvePath, writeMap, type MapRow } from './lib/map.ts';

const ALLOWED_KINDS = new Set(['symbol', 'ts-prop', 'ts-local']);
const SPECIAL_VALUES = new Set(['KEEP', 'REMOVE', 'STATE']);

export interface RenameSymbolsOptions {
  root?: string;
  mapDir: string;
  scopes?: string[];
  kinds?: string[];
  status?: string[];
  ids?: string[];
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface RenameSymbolsResult { applied: number; missingIds: string[] }

function declarationLine(row: MapRow): { file: string; line: number } {
  const match = /^(.*):(\d+)$/.exec(row.declared_at);
  if (!match) throw new Error(`row ${row.id}: invalid declared_at ${row.declared_at}`);
  return { file: match[1], line: Number(match[2]) };
}

function namedRenameable(node: Node, name: string): node is Node & { getName(): string | undefined; rename(value: string): unknown } {
  const candidate = node as Node & { getName?: () => string | undefined; rename?: (value: string) => unknown };
  return typeof candidate.getName === 'function' && candidate.getName() === name && typeof candidate.rename === 'function';
}

export function renameSymbols(options: RenameSymbolsOptions): RenameSymbolsResult {
  const root = path.resolve(options.root ?? '.');
  const kinds = options.kinds ?? [...ALLOWED_KINDS];
  const invalid = kinds.filter((kind) => !ALLOWED_KINDS.has(kind));
  if (invalid.length > 0) {
    const wireHint = invalid.includes('wire-key') ? 'wire-key rows are applied by rewrite-literals.ts' : `unsupported kinds: ${invalid.join(',')}`;
    const error = new Error(wireHint) as Error & { exitCode?: number };
    error.exitCode = 2;
    throw error;
  }
  const statuses = options.status ?? ['approved'];
  if (!options.dryRun && statuses.some((status) => status !== 'approved')) {
    const error = new Error('non-approved status is allowed only with --dry-run') as Error & { exitCode?: number };
    error.exitCode = 2;
    throw error;
  }

  const allRows = readMap(options.mapDir);
  const rows = allRows.filter((row) =>
    kinds.includes(row.kind) && statuses.includes(row.status) &&
    (!options.scopes || options.scopes.includes('all') || options.scopes.includes(row.scope)) &&
    (!options.ids || options.ids.includes(row.id)));
  const project = loadWorkspaceProject(root);
  const missingIds: string[] = [];
  const appliedRows: MapRow[] = [];

  for (const row of rows) {
    if (SPECIAL_VALUES.has(row.new)) continue;
    const declared = declarationLine(row);
    const currentPath = resolvePath(declared.file, allRows);
    const normalizedSuffix = `/${currentPath.replaceAll('\\', '/')}`;
    const sourceFile = project.getSourceFile((file) => file.getFilePath().replaceAll('\\', '/').endsWith(normalizedSuffix));
    const candidates = sourceFile?.getDescendants().filter((node) => namedRenameable(node, row.old)) ?? [];
    candidates.sort((left, right) =>
      Math.abs(left.getStartLineNumber() - declared.line) - Math.abs(right.getStartLineNumber() - declared.line));
    const declaration = candidates[0];
    if (!declaration) {
      missingIds.push(row.id);
      options.log?.(`missing ${row.id}: ${currentPath}:${declared.line} ${row.old}`);
      continue;
    }
    options.log?.(`${options.dryRun ? 'would apply' : 'apply'} ${row.id}: ${row.old} -> ${row.new}`);
    if (!options.dryRun) {
      declaration.rename(row.new);
      row.status = 'applied';
      appliedRows.push(row);
    }
  }

  if (!options.dryRun) {
    project.saveSync();
    writeMap(options.mapDir, appliedRows);
  }
  options.log?.(`applied=${options.dryRun ? 0 : appliedRows.length} missing=${missingIds.length}`);
  return { applied: options.dryRun ? 0 : appliedRows.length, missingIds };
}

function list(value: string | undefined): string[] | undefined {
  return value?.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseArgs(argv: string[]): RenameSymbolsOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dry-run') values.set('dry-run', 'true');
    else if (argv[index].startsWith('--')) values.set(argv[index].slice(2), argv[++index]);
  }
  if (!values.get('map')) throw new Error('--map is required');
  return {
    root: values.get('root') ?? '.', mapDir: values.get('map')!, scopes: list(values.get('scopes')),
    kinds: list(values.get('kinds')), status: list(values.get('status')), ids: list(values.get('ids')),
    dryRun: values.get('dry-run') === 'true', log: console.log,
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const result = renameSymbols(parseArgs(process.argv.slice(2)));
    if (result.missingIds.length > 0 && !process.argv.includes('--dry-run')) process.exitCode = 1;
  } catch (caught) {
    const error = caught as Error & { exitCode?: number };
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}

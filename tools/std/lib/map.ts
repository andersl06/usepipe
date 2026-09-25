import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, toCsv } from './csv.ts';

export const MAP_COLUMNS = [
  'id', 'scope', 'slice', 'kind', 'old', 'new', 'declared_at', 'consumers',
  'persisted', 'category', 'decision_ref', 'status', 'owner', 'notes',
] as const;

export type MapColumn = (typeof MAP_COLUMNS)[number];
export type MapRow = Record<MapColumn, string>;

export interface MapFilter {
  scopes?: string[];
  kinds?: string[];
  status?: string[];
  ids?: string[];
}

function isMapRow(values: string[], file: string, line: number): MapRow {
  if (values.length !== MAP_COLUMNS.length) {
    throw new Error(`${file}:${line}: expected ${MAP_COLUMNS.length} columns, got ${values.length}`);
  }
  return Object.fromEntries(MAP_COLUMNS.map((column, index) => [column, values[index] ?? ''])) as MapRow;
}

export function readMap(dir: string, filter: MapFilter = {}): MapRow[] {
  if (!fs.existsSync(dir)) return [];
  const rows = fs.readdirSync(dir)
    .filter((file) => file.endsWith('.csv'))
    .sort()
    .flatMap((file) => {
      const fullPath = path.join(dir, file);
      const parsed = parseCsv(fs.readFileSync(fullPath, 'utf8'));
      if (parsed.length === 0) return [];
      if (parsed[0].join(',') !== MAP_COLUMNS.join(',')) {
        throw new Error(`${fullPath}: invalid map header`);
      }
      return parsed.slice(1).map((values, index) => isMapRow(values, fullPath, index + 2));
    });

  return rows.filter((row) =>
    (!filter.scopes || filter.scopes.includes(row.scope)) &&
    (!filter.kinds || filter.kinds.includes(row.kind)) &&
    (!filter.status || filter.status.includes(row.status)) &&
    (!filter.ids || filter.ids.includes(row.id)));
}

export function writeMap(dir: string, changedRows: MapRow[]): void {
  fs.mkdirSync(dir, { recursive: true });
  const byScope = new Map<string, MapRow[]>();
  for (const row of changedRows) {
    const list = byScope.get(row.scope) ?? [];
    list.push(row);
    byScope.set(row.scope, list);
  }

  for (const [scope, changes] of byScope) {
    const file = path.join(dir, `${scope}.csv`);
    const existing = fs.existsSync(file) ? readMap(dir, { scopes: [scope] }) : [];
    const replacements = new Map(changes.map((row) => [row.id, row]));
    const merged = existing.map((row) => replacements.get(row.id) ?? row);
    const existingIds = new Set(existing.map((row) => row.id));
    merged.push(...changes.filter((row) => !existingIds.has(row.id)));
    fs.writeFileSync(file, toCsv([
      [...MAP_COLUMNS],
      ...merged.map((row) => MAP_COLUMNS.map((column) => row[column])),
    ]), 'utf8');
  }
}

function replacePathPrefix(value: string, oldPath: string, newPath: string): string | undefined {
  const normalized = value.replaceAll('\\', '/');
  const oldNormalized = oldPath.replaceAll('\\', '/').replace(/\/$/, '');
  const newNormalized = newPath.replaceAll('\\', '/').replace(/\/$/, '');
  if (normalized === oldNormalized) return newNormalized;
  if (normalized.startsWith(`${oldNormalized}/`)) return `${newNormalized}${normalized.slice(oldNormalized.length)}`;
  return undefined;
}

export function resolvePath(oldPath: string, rows: MapRow[]): string {
  const applied = rows.filter((row) => ['applied', 'verified'].includes(row.status));
  const dirs = applied.filter((row) => row.kind === 'dir').sort((a, b) => b.old.length - a.old.length);
  const files = applied.filter((row) => row.kind === 'file');
  let current = oldPath.replaceAll('\\', '/');
  for (let pass = 0; pass <= applied.length; pass += 1) {
    const before = current;
    for (const row of dirs) current = replacePathPrefix(current, row.old, row.new) ?? current;
    for (const row of files) {
      const declaredAt = row.declared_at.replaceAll('\\', '/');
      if (current === declaredAt) {
        // `new`'s directory portion is inconsistent across scopes/generators
        // (see move-files.ts rowMove) - only its basename is trustworthy.
        const newBasename = row.new.replaceAll('\\', '/').split('/').pop() ?? row.new;
        current = `${declaredAt.slice(0, declaredAt.lastIndexOf('/'))}/${newBasename}`;
      }
    }
    if (before === current) break;
  }
  return current;
}

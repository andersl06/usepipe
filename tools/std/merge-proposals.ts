import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from './lib/csv.ts';
import { MAP_COLUMNS, readMap } from './lib/map.ts';

const COMMENT_COLUMNS = ['id', 'scope', 'file', 'start_line', 'end_line', 'kind', 'pt_score', 'text', 'action', 'new_text', 'sensitivity', 'evidence', 'reviewed_by', 'status'];
const PERSISTED_COLUMNS = ['id', 'scope', 'kind', 'old', 'declared_at', 'where_persisted', 'decision', 'decision_ref', 'notes'];

function csvRows(file: string, columns: readonly string[]): Record<string, string>[] {
  if (!fs.existsSync(file)) return [];
  const data = parseCsv(fs.readFileSync(file, 'utf8'));
  if (data[0]?.join(',') !== columns.join(',')) throw new Error(`${file}: invalid header`);
  return data.slice(1).map((values) => Object.fromEntries(columns.map((column, i) => [column, values[i] ?? ''])));
}

function saveCsv(file: string, columns: readonly string[], rows: Record<string, string>[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, toCsv([[...columns], ...rows.map((row) => columns.map((column) => row[column] ?? ''))]));
}

function proposalFiles(pattern: string): string[] {
  if (fs.existsSync(pattern) && fs.statSync(pattern).isFile()) return [pattern];
  const normalized = pattern.replaceAll('\\', '/');
  const wildcard = normalized.search(/[?*]/);
  if (wildcard < 0) return [];
  const slash = normalized.lastIndexOf('/', wildcard);
  const base = slash < 0 ? '.' : normalized.slice(0, slash) || '/';
  const relative = normalized.slice(slash + 1);
  return [...fs.globSync(relative, { cwd: base })].map((file) => path.join(base, file)).sort();
}

export function mergeProposals(options: { input: string; target: string; owner: string; job?: string; persistedOnly?: boolean; log?: (line: string) => void }): { updated: number; ignored: number; moved: number } {
  const { input, target, owner, job, persistedOnly = false, log = console.log } = options;
  if (!['codex1', 'codex2', 'sonnet'].includes(owner)) throw new Error('invalid owner');
  const mode = path.basename(target) === 'map' ? 'map' : path.basename(target) === 'comments' ? 'comments' : '';
  if (!mode) throw new Error('target must end in map or comments');
  if (mode === 'map' && !persistedOnly && !job) throw new Error('--job is required for map mode');
  if (job && !/^\d{2}-\d{2}$/.test(job)) throw new Error('invalid job');
  const files = proposalFiles(input);
  if (!files.length) throw new Error(`no proposal files: ${input}`);
  const proposals = files.flatMap((file) => {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { rows?: Record<string, string>[]; items?: Record<string, string>[] };
    const entries = mode === 'map' ? parsed.rows : parsed.items;
    if (!Array.isArray(entries)) throw new Error(`${file}: missing ${mode === 'map' ? 'rows' : 'items'}`);
    return entries;
  });
  let updated = 0; let ignored = 0; let moved = 0;
  if (mode === 'map') {
    const rows = readMap(target);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const std = path.dirname(target);
    const destination = path.join(std, persistedOnly ? 'persisted.csv' : `persisted-candidates-${owner}-${job}.csv`);
    const movedBefore = new Set(csvRows(destination, PERSISTED_COLUMNS).map((row) => row.id));
    const removed = new Set<string>();
    const persisted: Record<string, string>[] = [];
    for (const proposal of proposals) {
      const row = byId.get(proposal.id);
      if (!row) { if (movedBefore.has(proposal.id)) { ignored++; log(`ignored ${proposal.id}: already persisted`); continue; } throw new Error(`unknown map id: ${proposal.id}`); }
      if (['approved', 'applied', 'verified'].includes(row.status) || removed.has(row.id)) { ignored++; log(`ignored ${row.id}: protected`); continue; }
      if (persistedOnly) {
        for (const key of ['persisted', 'decision_ref', 'notes'] as const) row[key] = proposal[key] ?? row[key];
        row.status = 'candidate';
      } else {
        for (const key of ['new', 'persisted', 'category', 'decision_ref', 'notes'] as const) row[key] = proposal[key] ?? '';
        row.owner = owner;
        row.status = 'proposed';
      }
      updated++;
      if (row.persisted === 'yes') {
        removed.add(row.id); moved++;
        persisted.push({ id: row.id, scope: row.scope, kind: row.kind, old: row.old, declared_at: row.declared_at, where_persisted: row.notes, decision: '', decision_ref: row.decision_ref, notes: row.notes });
      }
    }
    if (persisted.length) {
      const file = destination;
      const existing = csvRows(file, PERSISTED_COLUMNS);
      const ids = new Set(existing.map((row) => row.id));
      saveCsv(file, PERSISTED_COLUMNS, [...existing, ...persisted.filter((row) => !ids.has(row.id))]);
    }
    const scopes = new Set(rows.map((row) => row.scope));
    for (const scope of scopes) saveCsv(path.join(target, `${scope}.csv`), MAP_COLUMNS, rows.filter((row) => row.scope === scope && !removed.has(row.id)));
  } else {
    const files = fs.statSync(target).isDirectory() ? fs.readdirSync(target).filter((file) => file.endsWith('.csv')).map((file) => path.join(target, file)) : [target];
    const grouped = new Map(files.map((file) => [file, csvRows(file, COMMENT_COLUMNS)]));
    const byId = new Map([...grouped].flatMap(([file, rows]) => rows.map((row) => [row.id, { file, row }] as const)));
    for (const proposal of proposals) {
      const found = byId.get(proposal.id);
      if (!found) throw new Error(`unknown comment id: ${proposal.id}`);
      const { row } = found;
      if (['reviewed', 'applied'].includes(row.status)) { ignored++; log(`ignored ${row.id}: protected`); continue; }
      for (const key of ['action', 'new_text', 'sensitivity', 'evidence']) row[key] = proposal[key] ?? '';
      row.status = 'proposed'; updated++;
    }
    for (const [file, rows] of grouped) saveCsv(file, COMMENT_COLUMNS, rows);
  }
  log(`updated=${updated} ignored=${ignored} moved=${moved}`);
  return { updated, ignored, moved };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) { console.log('--in <glob> --target <STD/map|STD/comments> --owner codex1|codex2|sonnet [--job NN-NN] [--persisted-only]'); process.exit(0); }
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    mergeProposals({ input: value('--in'), target: value('--target'), owner: value('--owner'), job: args.includes('--job') ? value('--job') : undefined, persistedOnly: args.includes('--persisted-only') });
  } catch (error) { console.error(String(error)); process.exitCode = 2; }
}

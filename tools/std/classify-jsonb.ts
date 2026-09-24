import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseCsv, toCsv } from './lib/csv.ts';
import { MAP_COLUMNS, readMap, type MapRow } from './lib/map.ts';

const STD = '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std';
const COLUMNS = ['id', 'scope', 'kind', 'old', 'declared_at', 'where_persisted', 'decision', 'decision_ref', 'notes'];
const EXCEPTION_COLUMNS = ['glob', 'pattern', 'kind', 'category', 'justification', 'ref'];
const REACH_COLUMNS = ['table', 'column', 'via', 'root_type', 'kind', 'name', 'declared_at'];
type RecordRow = Record<string, string>;

function readCsv(file: string, header: string[]): RecordRow[] {
  const records = parseCsv(fs.readFileSync(file, 'utf8'));
  if (records[0]?.join(',') !== header.join(',')) throw new Error(`Invalid header: ${file}`);
  return records.slice(1).map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])));
}
function writeCsv(file: string, header: string[], rows: RecordRow[]): void {
  fs.writeFileSync(file, toCsv([header, ...rows.map((row) => header.map((name) => row[name] ?? ''))]));
}
function key(row: RecordRow): string { return `${row.kind}\0${row.name ?? row.old}\0${row.declared_at}`; }
function values(document: unknown, keys: Set<string>, strings: Set<string>): void {
  if (typeof document === 'string') { strings.add(document); return; }
  if (Array.isArray(document)) { for (const value of document) values(value, keys, strings); return; }
  if (document && typeof document === 'object') for (const [name, value] of Object.entries(document)) {
    keys.add(name); values(value, keys, strings);
  }
}
function scannerKind(kind: string): string {
  if (kind === 'ts-prop') return 'identifier';
  if (kind === 'literal-value' || kind === 'persisted-value') return 'literal-value';
  return 'string-literal';
}
function exactPattern(value: string): string { return `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`; }

const manifest = JSON.parse(fs.readFileSync('apps/api/tests/fixtures/jsonb/manifest.json', 'utf8')) as { file: string; table: string; column: string; sqlTable: string; sqlColumn: string; field?: string }[];
const fixtures = new Map<string, { file: string; keys: Set<string>; strings: Set<string> }[]>();
for (const item of manifest) {
  const document = JSON.parse(fs.readFileSync(`apps/api/tests/fixtures/jsonb/${item.file}`, 'utf8'));
  const selected = item.field ? (Array.isArray(document) ? document.map((record) => record[item.field!]) : document[item.field]) : document;
  const keys = new Set<string>(), strings = new Set<string>(); values(selected, keys, strings);
  const column = `${item.table}.${item.column}`;
  fixtures.set(column, [...(fixtures.get(column) ?? []), { file: item.file, keys, strings }]);
}

const reach = readCsv(`${STD}/reports/jsonb-reach.csv`, REACH_COLUMNS);
const origins = new Map<string, Set<string>>();
for (const row of reach) {
  const set = origins.get(key(row)) ?? new Set<string>(); set.add(`${row.table}.${row.column}`); origins.set(key(row), set);
}
const map = readMap(`${STD}/map`);
const fresh = fs.existsSync('tools/std/inventory-new.tmp/map') ? readMap('tools/std/inventory-new.tmp/map') : [];
const freshIds = new Set(fresh.map((row) => row.id));
const persisted = readCsv(`${STD}/persisted.csv`, COLUMNS);
const idUpdates = new Map<string, string>();
for (const row of persisted.filter((item) => item.notes.includes('jsonb:'))) {
  const source = row.declared_at.replace(/:\d+(?::\d+)?$/, '');
  const locations = [...new Set(reach.filter((item) => item.kind === row.kind && item.name === row.old && item.declared_at.replace(/:\d+(?::\d+)?$/, '') === source).map((item) => item.declared_at))];
  if (locations.length === 1) {
    row.declared_at = locations[0];
    if (row.id.startsWith(`${row.scope}-${row.kind}-`)) {
      const stableId = `${row.scope}-${row.kind}-${createHash('sha1').update(row.old + row.declared_at).digest('hex').slice(0, 8)}`;
      if (stableId !== row.id) { idUpdates.set(row.id, stableId); row.id = stableId; }
    }
  }
}
const persistedIds = new Set(persisted.map((row) => row.id));
const proposals: RecordRow[] = [];
let fixtureCount = 0, proposalCount = 0, staleCount = 0;
const next: MapRow[] = [];
const menuKeyDeclarations = new Set([
  'api-symbol-cbaf4779', // shorthand { texto, opcoes } written to mensagem.dados
  'api-ts-prop-c7bef9c1', // perguntaDoSelect return shape
  'workers-ts-prop-3de70883', // worker reads dados.pergunta.opcoes
]);
for (const row of map) {
  if (menuKeyDeclarations.has(row.id)) {
    if (row.old !== 'opcoes' || !['apps/api/src/dominio/fluxo.ts', 'apps/workers/src/whatsapp/interativo.ts'].some((file) => row.declared_at.startsWith(`${file}:`))) throw new Error(`Unexpected menu key row: ${row.id}`);
    if (!persistedIds.has(row.id)) persisted.push({ id: row.id, scope: row.scope, kind: row.kind, old: row.old,
      declared_at: row.declared_at, where_persisted: 'Postgres mensagem.dados jsonb (pergunta.opcoes)',
      decision: 'keep', decision_ref: 'D-09', notes: 'fixture-evidence:outbox-message-data.json;writer:apps/api/src/dominio/fluxo.ts:329;reader:apps/workers/src/entrega.ts:305' });
    persistedIds.add(row.id);
    continue;
  }
  if (row.persisted !== 'unknown' || !row.notes.includes('jsonb:')) { next.push(row); continue; }
  const columns = [...(origins.get(key(row)) ?? [])].sort();
  if (!columns.length) {
    staleCount++;
    if (freshIds.has(row.id)) next.push({ ...row, persisted: 'no', new: '', notes: row.notes.split(';').filter((part) => !part.startsWith('jsonb:')).join(';') });
    continue;
  }
  const matching = [...new Set(columns.flatMap((column) => (fixtures.get(column) ?? [])
    .filter((fixture) => (row.kind === 'ts-prop' ? fixture.keys : fixture.strings).has(row.old))
    .map((fixture) => fixture.file)))].sort();
  const decision = row.kind === 'literal-value' ? 'keep-literal' : 'keep';
  const decisionRef = row.kind === 'literal-value' ? 'D-11' : 'D-09';
  const evidence = matching.length ? `fixture-evidence:${matching.join('|')}` : 'jsonb-reach:default-keep';
  if (matching.length) fixtureCount++;
  else { proposalCount++; proposals.push({ id: row.id, new: 'KEEP', persisted: 'yes', category: 'B', decision_ref: decisionRef, notes: `${row.notes};${evidence}` }); }
  if (persistedIds.has(row.id)) throw new Error(`Duplicate persisted id: ${row.id}`);
  persisted.push({ id: row.id, scope: row.scope, kind: row.kind, old: row.old, declared_at: row.declared_at,
    where_persisted: `Postgres jsonb ${columns.join(';')}`, decision, decision_ref: decisionRef, notes: `${row.notes};${evidence}` });
  persistedIds.add(row.id);
}

// Opaque JSONB keys have no TypeScript property declaration for the reach tracer to follow.
// Keep the PT keys explicitly present in the approved fixture baseline.
const fixtureKeys = new Set(['nome', 'id_provedor', 'mensagem_id', 'acoes', 'eventos', 'proximo', 'opcoes', 'pergunta', 'texto', 'telefone_e164', 'plano']);
const baseline = JSON.parse(fs.readFileSync(`${STD}/reports/baseline-jsonb-keys.json`, 'utf8')) as Record<string, { present: string[] }>;
for (const item of manifest) for (const name of baseline[item.file]?.present ?? []) {
  if (!fixtureKeys.has(name)) continue;
  const fixture = (fixtures.get(`${item.table}.${item.column}`) ?? []).find((entry) => entry.file === item.file);
  if (!fixture?.keys.has(name)) continue;
  const file = `apps/api/tests/fixtures/jsonb/${item.file}`;
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).findIndex((text) => text.includes(`"${name}"`)) + 1;
  if (!line) throw new Error(`Fixture key has no source line: ${file}:${name}`);
  const id = `jsonb-key-${createHash('sha1').update(`${item.table}.${item.column}:${name}:${item.file}`).digest('hex').slice(0, 8)}`;
  if (persistedIds.has(id)) continue;
  persisted.push({ id, scope: 'api', kind: 'persisted-value', old: name, declared_at: `${file}:${line}`,
    where_persisted: `Postgres ${item.sqlTable}.${item.sqlColumn} jsonb`, decision: 'keep', decision_ref: 'D-09',
    notes: `fixture-evidence:${item.file};jsonb:${item.table}.${item.column}` });
  persistedIds.add(id);
}

const byScope = new Map<string, MapRow[]>();
for (const row of next) byScope.set(row.scope, [...(byScope.get(row.scope) ?? []), row]);
for (const [scope, rows] of byScope) writeCsv(`${STD}/map/${scope}.csv`, [...MAP_COLUMNS], rows);
writeCsv(`${STD}/persisted.csv`, COLUMNS, persisted);
fs.mkdirSync(`${STD}/out`, { recursive: true });
const proposalFile = `${STD}/out/jsonb-codex1-001.json`;
if (proposals.length || !fs.existsSync(proposalFile)) fs.writeFileSync(proposalFile, JSON.stringify({ rows: proposals }, null, 2) + '\n');
if (idUpdates.size && fs.existsSync(proposalFile)) {
  const document = JSON.parse(fs.readFileSync(proposalFile, 'utf8')) as { rows: RecordRow[] };
  for (const row of document.rows) row.id = idUpdates.get(row.id) ?? row.id;
  fs.writeFileSync(proposalFile, JSON.stringify(document, null, 2) + '\n');
}

const exceptions = readCsv(`${STD}/exceptions.csv`, EXCEPTION_COLUMNS).filter((row) =>
  !row.ref.startsWith('persisted.csv:') && !(row.ref === 'D-40' && row.glob === 'apps/api/src/**'));
const seen = new Set(exceptions.map((row) => `${row.ref}\0${row.glob}\0${row.kind}`));
for (const row of persisted) {
  const declaration = row.declared_at.replace(/:\d+(?::\d+)?$/, '').replaceAll('\\', '/');
  if (!fs.existsSync(declaration) || path.isAbsolute(declaration)) throw new Error(`Invalid declaration path: ${declaration}`);
  const kind = scannerKind(row.kind);
  const ref = `persisted.csv:${row.id}`;
  const index = `${ref}\0${declaration}\0${kind}`;
  if (seen.has(index)) continue;
  seen.add(index);
  exceptions.push({ glob: declaration, pattern: exactPattern(row.old), kind, category: 'B',
    justification: `persisted: ${row.where_persisted}`, ref });
}
writeCsv(`${STD}/exceptions.csv`, EXCEPTION_COLUMNS, exceptions);
const log = `${STD}/reports/codex-log-1-jsonb-codex1.csv`;
if (!fs.existsSync(log)) fs.writeFileSync(log, toCsv([[
  new Date().toISOString(), '1', 'jsonb-codex1 direct (D-40)', 'be6f3dd',
  'direct (D-40)', proposalFile, '0',
]]));
console.log(JSON.stringify({ reached: origins.size, fixtureEvidenceYes: fixtureCount, directYes: proposalCount, directNo: 0, reviewFlips: 0, staleRemoved: staleCount, persisted: persisted.length }));

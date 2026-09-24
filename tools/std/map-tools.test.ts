import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { toCsv, parseCsv } from './lib/csv.ts';
import { MAP_COLUMNS, readMap, type MapRow } from './lib/map.ts';
import { mergeProposals } from './merge-proposals.ts';
import { checkMap } from './check-map.ts';
import { applyComments } from './apply-comments.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const temporaryRoots: string[] = [];
after(() => { for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true }); });
const COMMENT_COLUMNS = ['id', 'scope', 'file', 'start_line', 'end_line', 'kind', 'pt_score', 'text', 'action', 'new_text', 'sensitivity', 'evidence', 'reviewed_by', 'status'];
function fixture() {
  const root = fs.mkdtempSync(path.join(here, '.map-tools-'));
  temporaryRoots.push(root);
  const std = path.join(root, 'std'); const map = path.join(std, 'map'); const comments = path.join(std, 'comments');
  fs.mkdirSync(map, { recursive: true }); fs.mkdirSync(comments);
  return { root, std, map, comments };
}
function row(id: string, fields: Partial<MapRow> = {}): MapRow {
  return { id, scope: 'api', slice: '1', kind: 'symbol', old: 'ControladorAnexos', new: 'AttachmentsController', declared_at: `apps/api/src/${id}.ts:1`, consumers: '1', persisted: 'no', category: '', decision_ref: '', status: 'proposed', owner: 'codex1', notes: '', ...fields };
}
function mapRows(map: string, rows: MapRow[]) {
  for (const scope of new Set(rows.map((r) => r.scope))) fs.writeFileSync(path.join(map, `${scope}.csv`), toCsv([[...MAP_COLUMNS], ...rows.filter((r) => r.scope === scope).map((r) => MAP_COLUMNS.map((c) => r[c]))]));
}
function commentRow(id: string, fields: Record<string, string> = {}) {
  return { id, scope: 'api', file: 'src/example.ts', start_line: '1', end_line: '1', kind: 'comment', pt_score: '2', text: '// Comentario original', action: 'translate', new_text: 'Original comment', sensitivity: 'other', evidence: '', reviewed_by: 'sonnet', status: 'reviewed', ...fields };
}
function commentsFile(dir: string, rows: ReturnType<typeof commentRow>[]) { const file = path.join(dir, 'api.csv'); fs.writeFileSync(file, toCsv([COMMENT_COLUMNS, ...rows.map((r) => COMMENT_COLUMNS.map((c) => r[c as keyof typeof r] ?? ''))])); return file; }
function proposal(file: string, rows: object[], key = 'rows') { fs.writeFileSync(file, JSON.stringify({ [key]: rows })); }

test('approved map rows survive later proposals; persisted rows move to owner/job file', () => {
  const f = fixture(); mapRows(f.map, [row('approved', { status: 'approved' }), row('persisted')]);
  const input = path.join(f.root, 'out.json'); proposal(input, [{ id: 'approved', new: 'WrongController', persisted: 'no' }, { id: 'persisted', new: 'OtherController', persisted: 'yes', category: 'B', decision_ref: 'D-11', notes: 'jsonb field' }]);
  const log: string[] = []; assert.deepEqual(mergeProposals({ input, target: f.map, owner: 'codex1', job: '01-36', log: (s) => log.push(s) }), { updated: 1, ignored: 1, moved: 1 });
  assert.equal(readMap(f.map)[0].new, 'AttachmentsController');
  assert.equal(readMap(f.map).length, 1);
  assert.match(fs.readFileSync(path.join(f.std, 'persisted-candidates-codex1-01-36.csv'), 'utf8'), /persisted/);
  assert.match(log.join(' '), /ignored approved/);
  assert.deepEqual(mergeProposals({ input, target: f.map, owner: 'codex1', job: '01-36', log() {} }), { updated: 0, ignored: 2, moved: 0 });
});
test('map merge requires job and persisted-only keeps candidate status', () => {
  const f = fixture(); mapRows(f.map, [row('p', { status: 'candidate', new: '' })]); const input = path.join(f.root, 'out.json'); proposal(input, [{ id: 'p', new: 'Wrong', persisted: 'yes', decision_ref: 'D-11', notes: 'stored' }]);
  const cli = spawnSync(process.execPath, [path.join(here, 'merge-proposals.ts'), '--in', input, '--target', f.map, '--owner', 'codex1'], { encoding: 'utf8' }); assert.equal(cli.status, 2);
  mergeProposals({ input, target: f.map, owner: 'codex1', persistedOnly: true, log() {} });
  assert.equal(readMap(f.map).length, 0); assert.match(fs.readFileSync(path.join(f.std, 'persisted.csv'), 'utf8'), /D-11/);
});
test('reviewed and applied comment rows survive later model batches', () => {
  const f = fixture(); const file = commentsFile(f.comments, [commentRow('reviewed'), commentRow('applied', { status: 'applied' }), commentRow('candidate', { status: 'candidate' })]);
  const input = path.join(f.root, 'out.json'); proposal(input, ['reviewed', 'applied', 'candidate'].map((id) => ({ id, action: 'remove', new_text: '', sensitivity: 'other', evidence: 'later' })), 'items');
  assert.deepEqual(mergeProposals({ input, target: f.comments, owner: 'codex2', log() {} }), { updated: 1, ignored: 2, moved: 0 });
  const rows = parseCsv(fs.readFileSync(file, 'utf8')); assert.equal(rows[1][8], 'translate'); assert.equal(rows[2][13], 'applied'); assert.equal(rows[3][13], 'proposed');
});
test('PT tokens, suffix, same-file collision, routes, decision refs and persisted flags error', () => {
  const f = fixture(); mapRows(f.map, [row('pt', { new: 'ControladorAnexos' }), row('suffix', { new: 'Attachments' }), row('collision-a', { new: 'SameController', declared_at: 'same.ts:1' }), row('collision-b', { new: 'SameController', declared_at: 'same.ts:2' }), row('route', { kind: 'endpoint', old: '/v1/a/:id', new: '/v1/b/c/:id' }), row('remove', { new: 'REMOVE' }), row('persisted', { persisted: 'yes' })]);
  const errors = checkMap({ map: f.map }).errors; const all = errors.map((e) => `${e.ids.join(',')}: ${e.message}`).join('\n');
  for (const needle of ['pt:', 'suffix:', 'collision-a,collision-b:', 'route:', 'remove:', 'persisted:']) assert.match(all, new RegExp(needle));
});
test('scanner lexicon does not reject English use/get; untranslated useLeitura still errors', () => {
  const f = fixture(); mapRows(f.map, [row('hook', { old: 'useLeitura', new: 'useReading' }), row('getter', { old: 'getConversa', new: 'getConversation' })]);
  assert.equal(checkMap({ map: f.map }).errors.length, 0);
  mapRows(f.map, [row('hook', { old: 'useLeitura', new: 'useLeitura' })]);
  assert.match(checkMap({ map: f.map }).errors.map((e) => e.message).join(' '), /PT token/);
});
test('wire mismatch names both ids; exact match and documented exception pass', () => {
  const f = fixture(); const wire = row('db', { scope: 'packages-db', kind: 'wire-key', old: 'contatoId', new: 'contactId' }); const prop = row('contract', { scope: 'packages-contracts', kind: 'ts-prop', old: 'contatoId', new: 'contactID' });
  mapRows(f.map, [wire, prop]); assert.ok(checkMap({ map: f.map, scopes: ['all'] }).errors.some((e) => e.message === 'wire mismatch' && e.ids.includes('db') && e.ids.includes('contract')));
  mapRows(f.map, [wire, { ...prop, new: 'contactId' }]); assert.equal(checkMap({ map: f.map }).errors.length, 0);
  mapRows(f.map, [wire, { ...prop, notes: 'wire-exception:legacy contract' }]); assert.equal(checkMap({ map: f.map }).errors.length, 0);
});
test('Windows file separators normalize collision scope without confusing other files', () => {
  const f = fixture(); mapRows(f.map, [row('one', { old: 'NomeUm', new: 'SharedName', declared_at: 'apps\\api\\src\\same.ts:1' }), row('two', { old: 'NomeDois', new: 'SharedName', declared_at: 'apps/api/src/other.ts:2' })]);
  assert.equal(checkMap({ map: f.map }).errors.length, 0);
  mapRows(f.map, [row('one', { old: 'NomeUm', new: 'SharedName', declared_at: 'apps\\api\\src\\same.ts:1' }), row('two', { old: 'NomeDois', new: 'SharedName', declared_at: 'apps/api/src/same.ts:2' })]);
  assert.ok(checkMap({ map: f.map }).errors.some((e) => e.message === 'duplicate target'));
});
test('literal values and data attributes obey old casing; glossary warnings are suppressible', () => {
  const f = fixture(); const glossary = path.join(f.std, 'GLOSSARY.md'); fs.writeFileSync(glossary, '| term_pt | term_en | status |\n|---|---|---|\n| conversa | conversation | approved |\n');
  mapRows(f.map, [row('literal', { kind: 'literal-value', old: 'valor-antigo', new: 'new-value' }), row('data', { kind: 'data-attr', old: 'data-valor=valor-antigo', new: 'data-new-value=valid-value' }), row('gloss', { old: 'ListaConversas', new: 'ChatList' })]);
  assert.equal(checkMap({ map: f.map, glossary }).errors.length, 0); assert.ok(checkMap({ map: f.map, glossary }).warnings.some((e) => e.ids.includes('gloss')));
  mapRows(f.map, [row('gloss', { old: 'ListaConversas', new: 'ChatList', notes: 'glossary-exception:domain decision' })]); assert.equal(checkMap({ map: f.map, glossary }).warnings.length, 0);
});
test('requested glossary without an approved term table fails visibly', () => {
  const f = fixture(); const glossary = path.join(f.std, 'GLOSSARY.md'); fs.writeFileSync(glossary, '# Glossary\n| name | value |\n|---|---|\n| a | b |\n');
  mapRows(f.map, [row('a')]); assert.throws(() => checkMap({ map: f.map, glossary }), /approved glossary table not found/);
});
test('real package scope and multi-extension source paths satisfy casing', () => {
  const f = fixture(); mapRows(f.map, [row('pkg', { kind: 'package', old: '@pipe/autenticacao', new: '@pipe/authentication' }), row('file', { kind: 'file', old: 'apps/api/src/fluxo.teste.ts', new: 'apps/api/src/flow.test.ts' })]);
  assert.equal(checkMap({ map: f.map }).errors.length, 0);
});
test('symbol constants keep UPPER_SNAKE casing', () => {
  const f = fixture(); mapRows(f.map, [row('constant', { old: 'NOME_ANTIGO', new: 'NEW_NAME' })]);
  assert.equal(checkMap({ map: f.map }).errors.length, 0);
  mapRows(f.map, [row('constant', { old: 'NOME_ANTIGO', new: 'newName' })]);
  assert.ok(checkMap({ map: f.map }).errors.some((e) => e.message === 'invalid casing'));
});
test('approve requires zero errors; sample ids are deterministic by scope', () => {
  const f = fixture(); mapRows(f.map, [row('a'), row('b'), row('c'), row('d', { scope: 'crm' })]); const out = path.join(f.root, 'sample.csv');
  const first = checkMap({ map: f.map, sample: 0.1, seed: 1, out, approve: true }); assert.equal(first.errors.length, 0); assert.deepEqual(first.sampledIds, checkMap({ map: f.map, sample: 0.1, seed: 1, out }).sampledIds); assert.ok(readMap(f.map).every((r) => r.status === 'approved'));
  mapRows(f.map, [row('bad', { new: 'ControladorAnexos' })]); checkMap({ map: f.map, approve: true }); assert.equal(readMap(f.map)[0].status, 'proposed');
});
test('comment translation preserves framing and location, removal leaves trailing blank, rerun is inert', () => {
  const f = fixture(); fs.mkdirSync(path.join(f.root, 'src')); const source = path.join(f.root, 'src/example.ts'); fs.writeFileSync(source, '  // Comentario original\nconst x = 1;\n  /**\n   * @param id Identificador\n   */\n\n');
  const file = commentsFile(f.comments, [commentRow('one', { text: 'Comentario original', start_line: '99' }), commentRow('two', { text: '@param id Identificador', action: 'remove' })]);
  assert.deepEqual(applyComments({ comments: f.comments, scopes: ['api'], root: f.root, log() {} }), { applied: 2, refused: 0, notFound: 0 });
  const changed = fs.readFileSync(source, 'utf8'); assert.match(changed, /^[ ]{2}\/\/ Original comment/m); assert.match(changed, /const x = 1;\n\n/); assert.deepEqual(applyComments({ comments: f.comments, scopes: ['api'], root: f.root, log() {} }), { applied: 0, refused: 0, notFound: 0 }); assert.match(fs.readFileSync(file, 'utf8'), /applied/);
});
test('sensitive comments require Sonnet; near-miss text and path escapes are refused', () => {
  const f = fixture(); fs.mkdirSync(path.join(f.root, 'src')); fs.writeFileSync(path.join(f.root, 'src/example.ts'), '// Comentario original\n// Comentario original extra\n');
  commentsFile(f.comments, [commentRow('security', { sensitivity: 'security', reviewed_by: 'codex1' }), commentRow('near', { text: 'Comentario origin' }), commentRow('escape', { file: '../outside.ts' })]);
  assert.deepEqual(applyComments({ comments: f.comments, scopes: ['api'], root: f.root, log() {} }), { applied: 0, refused: 2, notFound: 1 });
  assert.match(fs.readFileSync(path.join(f.root, 'src/example.ts'), 'utf8'), /Comentario original extra/);
});
test('JSDoc tags and hash comment framing remain intact', () => {
  const f = fixture(); fs.mkdirSync(path.join(f.root, 'src')); const file = path.join(f.root, 'src/example.ts'); fs.writeFileSync(file, '/**\n * @param id Identificador\n */\n');
  const script = path.join(f.root, 'src/example.sh'); fs.writeFileSync(script, '# Comentario original\n');
  commentsFile(f.comments, [commentRow('doc', { text: '@param id Identificador', new_text: '@param id Identifier' }), commentRow('hash', { file: 'src/example.sh', text: 'Comentario original', new_text: 'Original comment' })]);
  assert.deepEqual(applyComments({ comments: f.comments, scopes: ['api'], root: f.root, log() {} }), { applied: 2, refused: 0, notFound: 0 });
  assert.match(fs.readFileSync(file, 'utf8'), /\* @param id Identifier/); assert.match(fs.readFileSync(script, 'utf8'), /^# Original comment$/m);
});
test('comment-looking text inside a TypeScript string is never edited', () => {
  const f = fixture(); fs.mkdirSync(path.join(f.root, 'src')); const file = path.join(f.root, 'src/example.ts'); fs.writeFileSync(file, 'const snippet = `\n// Comentario original\n`;\n');
  commentsFile(f.comments, [commentRow('string')]);
  assert.deepEqual(applyComments({ comments: f.comments, scopes: ['api'], root: f.root, log() {} }), { applied: 0, refused: 0, notFound: 1 });
  assert.match(fs.readFileSync(file, 'utf8'), /Comentario original/);
});
test('keep-original records the exact snippet once with D-17', () => {
  const f = fixture(); fs.mkdirSync(path.join(f.root, 'src')); const file = path.join(f.root, 'src/example.ts'); fs.writeFileSync(file, '// Comentario original\n');
  commentsFile(f.comments, [commentRow('keep', { action: 'keep-original' })]);
  applyComments({ comments: f.comments, scopes: ['api'], root: f.root, log() {} });
  assert.equal(fs.readFileSync(file, 'utf8'), '// Comentario original\n');
  const exceptions = parseCsv(fs.readFileSync(path.join(f.std, 'exceptions.csv'), 'utf8'));
  assert.ok(new RegExp(exceptions[1][1]).test('// Comentario original')); assert.match(exceptions[1][4], /\/\/ Comentario original/); assert.equal(exceptions[1][5], 'D-17');
  applyComments({ comments: f.comments, scopes: ['api'], root: f.root, log() {} });
  assert.equal(parseCsv(fs.readFileSync(path.join(f.std, 'exceptions.csv'), 'utf8')).length, 2);
});

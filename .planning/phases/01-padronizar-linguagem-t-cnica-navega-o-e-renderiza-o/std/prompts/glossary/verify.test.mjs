import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { checkMap } from '../../../../../../tools/std/check-map.ts';
import { MAP_COLUMNS, readMap } from '../../../../../../tools/std/lib/map.ts';
import { isPtToken, splitIdentifier } from '../../../../../../tools/std/pt-detect.ts';

const std = path.resolve(import.meta.dirname, '../..');
const schema = JSON.parse(fs.readFileSync(path.resolve(std, '../../../../tools/std/schemas/glossary-terms.schema.json'), 'utf8'));
const proposals = [1, 2].map((n) => JSON.parse(fs.readFileSync(path.join(std, `out/glossary-codex${n}.json`), 'utf8')));
const glossary = fs.readFileSync(path.join(std, 'GLOSSARY.md'), 'utf8');
const tableRows = glossary.split('\n').filter((line) => line.startsWith('| ')).slice(1).filter((line) => !line.startsWith('|---')).filter((line) => line.split('|').length === 8);
const cells = (line) => line.split('|').slice(1, -1).map((s) => s.trim());

test('propostas seguem o schema, e toda contagem não nula corresponde ao mapa real', () => {
  const backendScopes = new Set(['packages-db', 'packages-contracts', 'packages-autenticacao', 'packages-armazenamento', 'packages-tempo-real', 'packages-mcp', 'workers', 'api', 'infra']);
  const counts = new Map();
  const mapRows = readMap(path.join(std, 'map'));
  for (const row of mapRows) {
    const group = backendScopes.has(row.scope) ? 'backend' : 'front';
    for (const word of splitIdentifier(row.old)) if (isPtToken(word)) counts.set(group + ':' + word, (counts.get(group + ':' + word) ?? 0) + 1);
  }
  for (const [index, proposal] of proposals.entries()) {
    const group = index === 0 ? 'backend' : 'front';
    assert.deepEqual(Object.keys(proposal), Object.keys(schema.properties));
    for (const term of proposal.terms) {
      assert.deepEqual(Object.keys(term).sort(), schema.properties.terms.items.required.slice().sort());
      assert.ok(['none', 'AMBIGUOUS'].includes(term.ambiguity));
      for (const key of schema.properties.terms.items.required) assert.equal(typeof term[key], 'string', group + ':' + key);
      assert.ok(Number.isInteger(Number(term.occurrences)));
      const expected = term.term_pt.includes(' ') ? mapRows.filter((row) => (backendScopes.has(row.scope) ? 'backend' : 'front') === group).reduce((total, row) => {
        const words = splitIdentifier(row.old), phrase = splitIdentifier(term.term_pt);
        return total + words.filter((_, i) => phrase.every((word, j) => words[i + j] === word)).length;
      }, 0) : counts.get(group + ':' + splitIdentifier(term.term_pt).join('')) ?? 0;
      assert.equal(Number(term.occurrences), expected, group + ':' + term.term_pt);
    }
  }
  assert.ok(tableRows.length >= 60);
  for (const row of tableRows) {
    const [pt,,source,ambiguity,,approved] = cells(row);
    assert.ok(['none', 'AMBIGUOUS'].includes(ambiguity), pt);
    assert.equal(approved, 'no', pt);
    if (['fila', 'ticket', 'roteador'].includes(pt)) assert.ok(source.startsWith('referencias-blip/'), pt);
  }
});

test('conflito entre propostas fica ambíguo e sem aprovação', () => {
  const front = new Map(proposals[1].terms.map((term) => [term.term_pt, term]));
  for (const backend of proposals[0].terms) {
    const other = front.get(backend.term_pt);
    if (other && backend.term_en !== other.term_en) {
      const row = tableRows.find((line) => cells(line)[0] === backend.term_pt);
      assert.ok(row, backend.term_pt);
      assert.equal(cells(row)[3], 'AMBIGUOUS');
      assert.equal(cells(row)[5], 'no');
      assert.match(cells(row)[4], new RegExp(backend.term_en));
      assert.match(cells(row)[4], new RegExp(other.term_en));
    }
  }
});

test('check-map bloqueia vocabulário não aprovado, mas lê somente termos aprovados em tabela mista', () => {
  assert.throws(() => checkMap({ map: path.join(std, 'map'), glossary: path.join(std, 'GLOSSARY.md') }), /no approved glossary terms/);
  const temp = fs.mkdtempSync(path.join(std, 'out', 'glossary-test-'));
  try {
    const map = path.join(temp, 'map');
    fs.mkdirSync(map);
    const row = {
      id: 'test', scope: 'api', slice: '2', kind: 'symbol', old: 'fila',
      new: 'Line', declared_at: 'apps/api/src/test.ts:1', consumers: '0',
      persisted: 'no', category: '', decision_ref: '', status: 'proposed', owner: '', notes: ''
    };
    fs.writeFileSync(path.join(map, 'api.csv'), [MAP_COLUMNS.join(','), MAP_COLUMNS.map((key) => row[key]).join(',')].join('\n') + '\n');
    const mixed = path.join(temp, 'mixed.md');
    fs.writeFileSync(mixed, '| term_pt | term_en | blip_source | ambiguity | decision | approved |\n|---|---|---|---|---|---|\n| fila | Queue | source | none | chosen | yes |\n| fil | Unrelated | source | none | near miss | no |\n');
    const result = checkMap({ map, glossary: mixed });
    assert.equal(result.warnings.filter((issue) => issue.message.includes('glossary fila')).length, 1);
    assert.equal(result.warnings.filter((issue) => issue.message.includes('glossary fil ')).length, 0);
  } finally {
    const target = fs.realpathSync(temp);
    const safeRoot = fs.realpathSync(path.join(std, 'out')) + path.sep;
    assert.ok(target.startsWith(safeRoot), 'temporary test directory stays inside std/out');
    fs.rmSync(target, { recursive: true, force: true });
  }
});

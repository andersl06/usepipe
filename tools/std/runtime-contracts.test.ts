import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyAllowlist,
  buildPairs,
  checkEnvSince,
  scanRepo,
  type Finding,
} from './runtime-contracts.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures', 'runtime-contracts');

function scanFixture(caseName: string): Finding[] {
  const root = path.join(FIXTURES, caseName);
  const pairs = buildPairs(path.join(root, 'map'));
  const files = fs
    .readdirSync(root)
    .filter((entry) => fs.statSync(path.join(root, entry)).isFile());
  return scanRepo(pairs, {
    files,
    readFile: (file) => fs.readFileSync(path.join(root, file), 'utf8'),
  });
}

test('body-key fixture: front posts {nome}, controller reads body[\'name\'] -> one request-key finding', () => {
  const findings = scanFixture('body-key');
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.class, 'request-key');
  assert.equal(findings[0]!.old, 'nome');
  assert.equal(findings[0]!.new, 'name');
  assert.equal(findings[0]!.file, 'front.ts');
  assert.equal(findings[0]!.counterpart, 'controller.ts');
});

test('sql-alias fixture: quoted alias still uses the old name -> one sql-alias finding', () => {
  const findings = scanFixture('sql-alias');
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.class, 'sql-alias');
  assert.equal(findings[0]!.old, 'nomeX');
  assert.equal(findings[0]!.new, 'nameX');
});

test('data-attr fixture: JSX data-estado vs CSS [data-state] -> one data-attr finding', () => {
  const findings = scanFixture('data-attr');
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.class, 'data-attr');
  assert.equal(findings[0]!.old, 'estado');
  assert.equal(findings[0]!.counterpart, 'styles.css');
});

test('css-class fixture: className="cartao" vs .card {} -> one css-class finding', () => {
  const findings = scanFixture('css-class');
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.class, 'css-class');
  assert.equal(findings[0]!.old, 'cartao');
  assert.equal(findings[0]!.counterpart, 'styles.css');
});

test('route fixture: href to an undeclared old path -> one route finding', () => {
  const findings = scanFixture('route');
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.class, 'route');
  assert.equal(findings[0]!.old, 'bem-vindo');
  assert.equal(findings[0]!.counterpart, '');
});

test('queue/event/storage fixture: producer queue name and storage key both flagged', () => {
  const findings = scanFixture('queue-event-storage');
  assert.equal(findings.length, 2);
  const queueFinding = findings.find((f) => f.class === 'queue-name');
  assert.ok(queueFinding, 'expected a queue-name finding');
  assert.equal(queueFinding!.old, 'fila-envio');
  assert.equal(queueFinding!.counterpart, 'consumer.ts');
  const storageFinding = findings.find((f) => f.class === 'storage-key');
  assert.ok(storageFinding, 'expected a storage-key finding');
  assert.equal(storageFinding!.old, 'pipe:filtro');
});

test('clean fixture: both sides fully renamed -> zero findings', () => {
  const findings = scanFixture('clean');
  assert.equal(findings.length, 0);
});

test('env fixture: process.env name swapped since <rev> -> class=env-name', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-env-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmpRoot });
    execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: tmpRoot });
    execFileSync('git', ['config', 'user.name', 'fixture'], { cwd: tmpRoot });
    fs.writeFileSync(path.join(tmpRoot, 'read.ts'), "export const url = process.env['PIPE_X'];\n");
    execFileSync('git', ['add', '.'], { cwd: tmpRoot });
    execFileSync('git', ['commit', '-q', '-m', 'v1'], { cwd: tmpRoot });
    const rev = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpRoot, encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(tmpRoot, 'read.ts'), "export const url = process.env['PIPE_Y'];\n");

    const findings = checkEnvSince({ cwd: tmpRoot, rev });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.class, 'env-name');
    assert.equal(findings[0]!.old, 'PIPE_X');
    assert.equal(findings[0]!.new, 'PIPE_Y');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('a finding covered by --allow does not count towards the exit code', () => {
  const findings: Finding[] = [
    { file: 'front.ts', line: 3, class: 'request-key', old: 'nome', new: 'name', snippet: '', counterpart: '' },
  ];
  const allowlist = new Set(['front.ts\0nome\0request-key']);
  assert.equal(applyAllowlist(findings, allowlist).length, 0);
  assert.equal(applyAllowlist(findings, new Set()).length, 1);
});

test('CLI --help lists the available options', () => {
  const script = path.join(HERE, 'runtime-contracts.ts');
  const output = execFileSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.match(output, /--map/);
  assert.match(output, /--out/);
  assert.match(output, /--allow/);
  assert.match(output, /--since/);
  assert.match(output, /--env-since/);
});

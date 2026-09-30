import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scanner = path.join(root, 'tools/std/scan-pt.ts');
const header = 'glob,pattern,kind,category,justification,ref\n';
const rules = '**/*,@ddl,sql-name,B,DDL,D-08\n' +
  '**/*,@quoted-comment,comment,A,Quote,D-17\n' +
  '**/*,@product-text,*,A,Product,STD-10\n';

function fixture(t: TestContext, files: Record<string, string>) {
  const dir = mkdtempSync(path.join(root, 'tools/std/fixtures/scan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  execFileSync('git', ['init', '--quiet', dir]);
  // Populate only the disposable fixture index: the working repository is never staged.
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '.'], { cwd: dir });
  writeFileSync(path.join(dir, 'ddl.sql'), 'CREATE TABLE "fluxo" ("tenant_id" uuid, "short_name" text);\nCREATE INDEX "fluxo_short_name_vivo_uk" ON "fluxo" ("short_name");');
  writeFileSync(path.join(dir, 'lexicon.txt'), 'tenant\nshort\nfluxo\nnome\nfila\nvivo\n');
  return (exceptions = rules) => {
    writeFileSync(path.join(dir, 'exceptions.csv'), header + exceptions);
    const result = spawnSync(process.execPath, ['--experimental-strip-types', scanner,
      '--out', 'scan.csv', '--summary', 'summary.md', '--exceptions', 'exceptions.csv',
      '--ddl', 'ddl.sql', '--map', 'map', '--lexicon-file', 'lexicon.txt'], { cwd: dir, encoding: 'utf8', timeout: 60_000 });
    const rows = result.status === 0 ? readFileSync(path.join(dir, 'scan.csv'), 'utf8').trim().split('\n').slice(1)
      .map((line) => {
        const cells = [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)]
          .map((m) => m[1]!.replace(/^"|"$/g, '').replaceAll('""', '"'));
        return { file: cells[0], line: Number(cells[1]), kind: cells[2], token: cells[3], category: cells[5], ref: cells[6] };
      }) : [];
    return { ...result, rows, summary: result.status === 0 ? readFileSync(path.join(dir, 'summary.md'), 'utf8') : '' };
  };
}

test('DDL matches whole names, preserves aliases and respects kind and lexicon', (t) => {
  const names = ['tenant_id', 'short_name', 'fluxo', 'fluxo_short_name_vivo_uk', 'nomeCurto', 'total_por_fila', 'fluxoInventado', 'vivo'];
  const run = fixture(t, {
    'packages/db/src/schema/sample.ts': names.map((name) => `text('${name}');`).join('\n'),
    'query.ts': 'const nome = sql`select fluxo, fluxo_inventado, total_por_fila from fluxo`;\n' +
      'const other = sql`select ${fluxo} from fluxo`;\n' +
      'const third = sql`select \'fluxo\' from fluxo`;\n' +
      'const fourth = sql`select "short_name" from "fluxo"`;\n',
  });
  const before = run('');
  const after = run();
  assert.equal(after.status, 0, after.stderr);
  assert.equal(after.summary.match(/^Lexicon:.*$/m)?.[0], before.summary.match(/^Lexicon:.*$/m)?.[0]);
  assert.equal(after.rows.length, before.rows.length);
  const schema = after.rows.filter((row) => row.kind === 'sql-name' && row.file?.includes('/schema/'));
  for (let line = 1; line <= names.length; line++) {
    const rows = schema.filter((row) => row.line === line);
    assert.ok(rows.length, names[line - 1]);
    assert.ok(rows.every((row) => row.category === (line <= 4 ? 'B' : '')), names[line - 1]);
  }
  assert.ok(after.rows.some((r) => r.file === 'query.ts' && r.line === 1 && r.token === 'fluxo' && r.category === 'B'));
  assert.ok(after.rows.some((r) => r.file === 'query.ts' && r.line === 1 && r.token === 'fila' && r.category === ''));
  assert.ok(after.rows.some((r) => r.file === 'query.ts' && r.line === 2 && r.token === 'fluxo' && r.category === 'B'));
  assert.ok(after.rows.some((r) => r.file === 'query.ts' && r.line === 3 && r.kind === 'literal-value' && r.token === 'fluxo' && r.category === ''));
  assert.ok(after.rows.some((r) => r.file === 'query.ts' && r.line === 4 && r.category === 'B'));
  assert.ok(after.rows.filter((r) => r.kind === 'identifier').every((r) => r.category === ''));
});

test('quoted comments use all content including long lines and multiline comments', (t) => {
  const comments = [
    `/* 'Experimente usar outro nome' is the source's literal */`,
    '/* "Já existe um fluxo com este nome." */',
    '/* `Configurações` */',
    '/* «Configurações» */',
    `/* "Configurações" ${'English text '.repeat(20)} nome */`,
    '/* "Configurações"\n nome */',
    '/* "Configurações\n para o fluxo" */',
    '/* Configurações sem aspas */',
    '/* "Configurações" nome */',
    '/* The source\'s literal is "Configurações" */',
    '/* "Configurações \\"para o fluxo\\"" */',
    '/* "Configurações sem fim */',
    '/* `fluxo_id` and `tenant_id` are technical identifiers */',
    '/* The screen says "Excluir chave"; the `revogada_em` field stays persisted. */',
    '/* `docker compose --profile tarefa run --rm migrar` */',
  ];
  const files = Object.fromEntries(comments.map((text, i) => [`comment${i}.ts`, text]));
  files['comment.css'] = '/* "Configurações"\n nome */';
  files['comment.yml'] = '# "Configurações" ' + 'English text '.repeat(20) + 'nome';
  const result = fixture(t, files)();
  assert.equal(result.status, 0, result.stderr);
  for (let i = 0; i < comments.length; i++) {
    const row = result.rows.find((r) => r.file === `comment${i}.ts` && r.kind === 'comment');
    assert.ok(row, `comment ${i} must be detected`);
    assert.equal(row.category, [0, 1, 2, 3, 6, 9, 10].includes(i) ? 'A' : '', `comment ${i}`);
  }
  for (const file of ['comment.css', 'comment.yml']) {
    assert.equal(result.rows.find((r) => r.file === file && r.kind === 'comment')?.category, '');
  }
});

test('product sentences pass while technical strings and test titles remain unclassified', (t) => {
  const sources = [
    `ErroPipe.conflito('Já existe um fluxo com este nome.');`,
    `const label = 'Configurações' as const;`,
    `const label = 'Experimente usar outro nome' as const;`,
    ...['arquivado', 'nome', 'fila-envio', 'select nome from fluxo', '/v1/fila', '${a} ${b}', 'nomeCurto', 'Configurações_id']
      .map((value) => `const value = '${value}' as const;`),
    `test('Já existe um fluxo com este nome.', () => {});`,
    `describe.only('Configurações', () => {});`,
    `const view = <div className={\n 'btn primario' as const\n} />;`,
    `const view = <div class="btn primario" />;`,
    `fetch('Já existe um fluxo com este nome.');`,
    `const config = { className: 'btn primario', path: 'Configurações' } as const;`,
    'ErroPipe.conflito(`Já existe ${nome} no fluxo`);',
    `const SESSAO = 'Configurações';`,
    `new Counter({name: 'Configurações'});`,
    `const query = 'SELECT nome FROM fluxo' as const;`,
    `const value = 'configuraçãoNome' as const;`,
    `test.only('Configurações' as const, () => {});`,
    `const value = 'select nome' as const;`,
  ];
  const run = fixture(t, Object.fromEntries(sources.map((text, i) => [`source${i}.tsx`, text])));
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  for (let i = 0; i < sources.length; i++) {
    const rows = result.rows.filter((r) => r.file === `source${i}.tsx` && ['string-literal', 'literal-value'].includes(r.kind!));
    if (i < 3) assert.ok(rows.length, sources[i]);
    assert.ok(rows.every((r) => r.category === (i < 3 ? 'A' : '')), sources[i]);
  }
  assert.ok(result.rows.filter((r) => r.kind === 'identifier').every((r) => r.category !== 'A'));
});

test('unknown resolvers fail eagerly with the physical CSV line', (t) => {
  const run = fixture(t, { 'sample.ts': 'const value = 1;' });
  const result = run('**/*,^nothing$,identifier,B,"reason\ncontinued",ref\n\nmissing/**,@typo,comment,A,Unknown,ref\n');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown exception resolver @typo at exceptions\.csv:5/);
});

test('cached exceptions retain historical paths, kind filters and first-match order', (t) => {
  const run = fixture(t, {
    'current/sample.ts': `const nome = 'Configurações' as const;\nconst outroNome = 'Configurações' as const;`,
    'map/paths.csv': 'kind,old,new,status\ndir,previous,current,applied\n',
  });
  // Literal rules exercise the same per-file/kind cache as resolver rules.
  const result = run('previous/**,^nome$,identifier,B,First,first\n' +
    '**/*,*,identifier,A,Never identifiers,invalid\n' +
    '**/*,@product-text,literal-value,A,Product,product\n' +
    '**/*,*,*,C,Fallback,last\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.rows.find((r) => r.kind === 'identifier' && r.line === 1)?.ref, 'first');
  assert.ok(result.rows.filter((r) => r.kind === 'literal-value').every((r) => r.ref === 'product'));
  assert.ok(result.rows.filter((r) => r.kind === 'identifier').every((r) => r.category !== 'A'));
});

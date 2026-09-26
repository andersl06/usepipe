import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseCsv } from './lib/csv.ts';
import { readMap } from './lib/map.ts';

const STD = '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std';
function rows(file: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(fs.readFileSync(file, 'utf8'));
  return body.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])));
}

test('real JSONB reach has a persisted decision for each declaration', () => {
  const reach = rows(`${STD}/reports/jsonb-reach.csv`);
  const persisted = rows(`${STD}/persisted.csv`);
  const map = readMap(`${STD}/map`);
  assert.equal(map.filter((row) => row.persisted === 'unknown' || row.persisted === 'yes').length, 0);
  assert.ok(reach.length >= 100);
  for (const row of reach) {
    const match = persisted.find((item) => item.kind === row.kind && item.old === row.name && item.declared_at === row.declared_at && item.notes.includes(`jsonb:${row.table}.${row.column}`));
    assert.ok(match, `${row.name} at ${row.declared_at}`);
    assert.match(match.where_persisted, new RegExp(`\\b${row.table}\\.${row.column}\\b`));
    assert.ok(['keep', 'keep-literal'].includes(match.decision));
  }
  for (const name of ['entrada', 'conteudo', 'saida']) assert.ok(persisted.some((row) =>
    row.kind === 'literal-value' && row.old === name && row.notes.includes('jsonb:processHttpExecucao.contexto')));
  assert.equal(reach.some((row) => row.declared_at === 'packages/core/src/fluxo/contexto.ts:167' && row.name === 'variaveis'), false);
  assert.ok(persisted.some((row) => row.old === 'conversas:ler' && row.decision_ref === 'D-40'));
  assert.ok(persisted.some((row) => row.old === 'parametros_perdidos' && /erro_codigo|ultimo_erro/.test(row.where_persisted)));
  assert.equal(persisted.some((row) => row.old === 'pipe_sessao'), false);
  for (const name of ['nome', 'id_provedor', 'mensagem_id', 'acoes', 'eventos', 'proximo', 'opcoes', 'pergunta', 'texto', 'telefone_e164', 'plano']) {
    assert.ok(persisted.some((row) => row.old === name && row.notes.includes('fixture-evidence:')), name);
  }
  for (const id of ['api-symbol-cbaf4779', 'api-ts-prop-c7bef9c1', 'workers-ts-prop-3de70883']) {
    assert.ok(persisted.some((row) => row.id === id && row.where_persisted.includes('mensagem.dados')));
    assert.equal(map.some((row) => row.id === id), false);
  }
  assert.ok(map.some((row) => row.id === 'api-symbol-36c1fef7' && row.old === 'opcoes'));
});

test('B exceptions use exact files, scanner kinds and anchored names', () => {
  const persisted = rows(`${STD}/persisted.csv`);
  const exceptions = rows(`${STD}/exceptions.csv`).filter((row) => row.ref.startsWith('persisted.csv:'));
  for (const item of persisted) {
    const matches = exceptions.filter((row) => row.ref === `persisted.csv:${item.id}`);
    assert.ok(matches.length, item.id);
    for (const row of matches) {
      assert.equal(row.category, 'B');
      assert.ok(!row.glob.includes('*') && !row.glob.includes('\\') && fs.existsSync(row.glob), row.glob);
      assert.notEqual(row.kind, '*');
      assert.ok(new RegExp(row.pattern).test(item.old));
      assert.equal(new RegExp(row.pattern).test(`${item.old}_near_miss`), false);
      assert.equal(row.glob, item.declared_at.replace(/:\d+(?::\d+)?$/, '').replaceAll('\\', '/'));
    }
  }
  const scope = exceptions.find((row) => row.pattern === '^conversas:ler$');
  assert.ok(scope);
  assert.equal(scope.glob.startsWith('apps/api/src/'), true);
  assert.equal(scope.glob === 'apps/api/src\\autenticacao.ts', false);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseCsv } from './lib/csv.ts';
import { readMap } from './lib/map.ts';

const std = '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std';
const map = readMap(`${std}/map`);
const [header, ...records] = parseCsv(fs.readFileSync(`${std}/persisted.csv`, 'utf8'));
const persisted = records.filter((row) => row.length === header.length)
  .map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])));

test('todos os escopos gravados no banco ficam fora do mapa, inclusive nomes proximos', () => {
  const source = fs.readFileSync('apps/api/src/autenticacao.ts', 'utf8');
  const catalog = source.match(/export const CATALOGO_ESCOPOS = \[([\s\S]*?)\] as const;/)?.[1];
  assert.ok(catalog);
  const scopes = [...catalog.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.equal(scopes.length, 9);
  for (const scope of scopes) {
    assert.ok(persisted.some((row) => row.old === scope && row.where_persisted.includes('chave_api.escopos') && row.decision_ref === 'D-40'), scope);
    assert.equal(map.some((row) => row.old === scope && row.kind === 'literal-value'), false, scope);
  }
  assert.notEqual(scopes.indexOf('conversas:ler'), scopes.indexOf('conversas:escrever'));
  assert.equal(scopes.includes('conversas:ler_extra'), false);
});

test('codigos realmente escritos em erro_codigo e ultimo_erro permanecem; erro HTTP isolado renomeia', () => {
  const worker = fs.readFileSync('apps/workers/src/entrega.ts', 'utf8') + fs.readFileSync('apps/workers/src/whatsapp/midia.ts', 'utf8');
  const codes = new Set([...worker.matchAll(/\bcodigo:\s*'([^']+)'/g)].map((match) => match[1]));
  codes.add('mensagem_sumiu');
  assert.ok(codes.has('parametros_perdidos'));
  for (const code of codes) {
    assert.ok(persisted.some((row) => row.old === code && row.where_persisted.includes('erro_codigo') && row.where_persisted.includes('ultimo_erro')), code);
    assert.equal(map.some((row) => row.kind === 'error-code' && row.old === code), false, code);
  }
  assert.ok(map.some((row) => row.kind === 'error-code' && row.old === 'arquivo_vazio' && row.persisted === 'no'));
});

test('catalogo completo de permissoes semeadas permanece no banco', () => {
  const source = fs.readFileSync('packages/db/src/semente.ts', 'utf8');
  const catalog = source.match(/export const CATALOGO_PERMISSOES = \[([\s\S]*?)\] as const satisfies/)?.[1];
  assert.ok(catalog);
  const codes = [...catalog.matchAll(/^\s*\['([^']+)',/gm)].map((match) => match[1]);
  assert.ok(codes.length > 40);
  for (const code of codes) {
    assert.ok(persisted.some((row) => row.old === code && row.where_persisted.includes('permissao.codigo')), code);
  }
});

test('valores com prefixos semelhantes seguem decisoes diferentes por fronteira real', () => {
  const sessionCookies = map.filter((row) => row.kind === 'cookie' && row.old === 'pipe_sessao');
  assert.equal(sessionCookies.length, 2);
  assert.ok(sessionCookies.every((row) => row.persisted === 'no' && row.decision_ref === 'D-38'));
  assert.ok(map.some((row) => row.kind === 'cookie' && row.old === 'pipe_desafio' && row.persisted === 'no'));
  assert.equal(persisted.some((row) => row.old === 'pipe_sessao'), false);
  assert.ok(persisted.some((row) => row.old === 'pipe-tema' && row.where_persisted.includes('localStorage')));
  assert.ok(map.filter((row) => row.kind === 'metric').every((row) => row.persisted === 'no' && row.decision_ref === 'D-38'));
  assert.ok(map.filter((row) => row.kind === 'queue' || row.kind === 'job-name').every((row) => row.persisted === 'no' && row.decision_ref === 'D-10'));
});

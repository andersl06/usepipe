import assert from 'node:assert/strict';
import test from 'node:test';
import { createJsonbReachProject, traceJsonbReach } from './lib/jsonb-reach.ts';
import { applyJsonbReach, extractSources } from './inventory.ts';

const prelude = `declare function jsonb(name: string): any; declare function pgTable(name: string, columns: any): any; declare const db: any;`;
const names = (source: string) => traceJsonbReach(createJsonbReachProject({ '/x.ts': `${prelude}\n${source}` })).report;

test('$type alcanca propriedades e literais transitivos', () => {
  const report = names(`interface Alvo { canalId: string } interface Acao { tipo: 'enviar' | 'esperar'; alvo: Alvo } interface Bloco { acoes: Acao[] } const bloco = pgTable('bloco', { conteudo: jsonb('conteudo').$type<Bloco>() });`);
  for (const name of ['acoes', 'tipo', 'alvo', 'canalId', 'enviar', 'esperar']) assert.ok(report.some((row) => row.name === name && row.via === '$type' && row.table === 'bloco'), `${name}: ${report.map((row) => row.name).join(',')}`);
});

test('insert values alcanca arrays, unions, Record e wrappers', () => {
  const report = names(`interface Item { nome: string } interface Contexto { itens: Array<Item | null>; mapa: Record<string, Partial<Item>> } const execucao = pgTable('execucao', { contexto: jsonb('contexto') }); const ctx: Contexto = {} as any; db.insert(execucao).values({ contexto: ctx });`);
  for (const name of ['itens', 'mapa', 'nome']) assert.ok(report.some((row) => row.name === name && row.via === 'insert-values'));
});

test('update set e conflito alcancam valores', () => {
  const report = names(`interface Contexto { usuario: string } const execucao = pgTable('execucao', { contexto: jsonb('contexto') }); const novo: Contexto = {} as any; db.update(execucao).set({ contexto: novo }); db.insert(execucao).values({}).onConflictDoUpdate({ set: { contexto: novo } });`);
  assert.ok(report.filter((row) => row.name === 'usuario' && row.via === 'update-set').length >= 1);
});

test('casts e anotacoes de leitura sao alcancados', () => {
  const report = names(`interface Contexto { usuario: string } const execucao = pgTable('execucao', { contexto: jsonb('contexto') }); declare const linha: any; const a = linha.contexto as Contexto; const b: Contexto = linha.contexto;`);
  assert.ok(report.some((row) => row.name === 'usuario' && row.via === 'read-cast'));
});

test('tipo somente em memoria nao e alcancado e chaves de Record nao viram props', () => {
  const report = names(`interface Contexto { mapa: Record<string, string> } interface Memoria { segredo: string } const execucao = pgTable('execucao', { contexto: jsonb('contexto') }); const ctx: Contexto = {} as any; db.insert(execucao).values({ contexto: ctx });`);
  assert.ok(report.some((row) => row.name === 'mapa')); assert.equal(report.some((row) => row.name === 'segredo'), false); assert.equal(report.some((row) => row.name === 'string'), false);
});

test('relatorio fornece chave de declaracao para integracao com inventario', () => {
  const sourceText = `${prelude}\ninterface Contexto { user: string } const execucao = pgTable('execucao', { contexto: jsonb('contexto') }); const ctx: Contexto = {} as any; db.insert(execucao).values({ contexto: ctx });`;
  const result = traceJsonbReach(createJsonbReachProject({ '/x.ts': sourceText }));
  const item = result.report.find((row) => row.name === 'user'); assert.ok(item); assert.match(item.declared_at, /x\.ts:2$/); assert.ok([...result.reached.values()].flat().some((origin) => origin.column === 'contexto'));
  const inventory = extractSources([{ fileName: '/x.ts', sourceText }]); applyJsonbReach(inventory, result.report);
  const persisted = inventory.rows.find((row) => row.old === 'user'); assert.ok(persisted); assert.equal(persisted.persisted, 'unknown'); assert.match(persisted.notes, /jsonb:execucao\.contexto/); assert.equal(persisted.new, 'KEEP');
});

test('nomes iguais em outros arquivos e metodos de Array nao viram chaves persistidas', () => {
  const report = traceJsonbReach(createJsonbReachProject({
    '/schema.ts': `${prelude}\nconst templateMensagem = pgTable('template_mensagem', { variaveis: jsonb('variaveis') }); declare const linha: any; const variaveis: string[] = linha.variaveis;`,
    '/apps/crm/src/lib/leads-visao.ts': 'interface Contexto { proprietarios: string[] }',
  })).report;
  assert.equal(report.some((row) => row.name === 'proprietarios'), false);
  assert.equal(report.some((row) => row.name === 'map' || row.name === 'push'), false);
});

test('literal de alias usa sua linha real, sem capturar alias homonimo de outro arquivo', () => {
  const report = traceJsonbReach(createJsonbReachProject({
    '/x.ts': `${prelude}\ntype Operador = 'em' | 'contem';\ninterface Expressao { operador: Operador }\nconst regra = pgTable('regra', { condicao: jsonb('condicao').$type<Expressao>() });`,
    '/outro.ts': "type Operador = 'errado';",
  })).report;
  assert.ok(report.some((row) => row.name === 'em' && row.declared_at.endsWith('/x.ts:2')));
  assert.ok(report.some((row) => row.name === 'contem' && row.declared_at.endsWith('/x.ts:2')));
  assert.equal(report.some((row) => row.name === 'errado'), false);
});

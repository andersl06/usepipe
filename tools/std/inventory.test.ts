import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSources, type SourceText } from './inventory.ts';

const run = (...sources: SourceText[]) => extractSources(sources);

test('extrai classe, metodo e parametro PT com local de declaracao', () => {
  const result = run({ fileName: 'apps/api/src/anexos.ts', sourceText: 'export class ControladorAnexos { buscarAnexo(idAnexo: string) {} }' });
  for (const [kind, old] of [['symbol', 'ControladorAnexos'], ['symbol', 'buscarAnexo'], ['ts-local', 'idAnexo']]) {
    const row = result.rows.find((item) => item.kind === kind && item.old === old);
    assert.ok(row); assert.match(row.declared_at, /anexos\.ts:1$/);
  }
});

test('ignora identificadores ingleses', () => {
  const result = run({ fileName: 'apps/api/src/x.ts', sourceText: 'const status = useState();' });
  assert.equal(result.rows.some((row) => ['status', 'useState'].includes(row.old)), false);
});

test('registra chave TS Drizzle e preserva nome SQL apenas nas notas', () => {
  const result = run({ fileName: 'packages/db/src/schema/x.ts', sourceText: "export const t = pgTable('t', { contatoId: text('contato_id') });" });
  const item = result.rows.find((row) => row.old === 'contatoId'); assert.ok(item); assert.match(item.notes, /sql=contato_id/);
  assert.equal(result.rows.some((row) => row.old === 'contato_id'), false);
});

test('ids sao estaveis', () => {
  const source = { fileName: 'apps/api/src/x.ts', sourceText: 'export function buscarContato() {}' };
  assert.deepEqual(run(source).rows.map((row) => row.id), run(source).rows.map((row) => row.id));
});

test('extrai comentario PT e ignora diretiva lint', () => {
  const result = run({ fileName: 'apps/api/src/x.ts', sourceText: '// Busca a conversa quando existe\n// eslint-disable-next-line\nconst x = 1;' });
  assert.equal(result.comments.length, 1); assert.match(result.comments[0]!.text, /Busca a conversa/);
});

test('extrai literal union e atributos data', () => {
  const result = run({ fileName: 'apps/gestao-vite/src/x.tsx', sourceText: "type Painel = 'aberto' | 'fechado'; export const x = <div data-painel=\"aberto\" />;" });
  assert.ok(result.rows.some((row) => row.kind === 'literal-value' && row.old === 'aberto' && row.persisted === 'unknown'));
  assert.ok(result.rows.some((row) => row.scope === 'css' && row.old === 'data-painel'));
  assert.ok(result.rows.some((row) => row.scope === 'css' && row.old === 'data-painel=aberto'));
});

test('lista dependentes de rota por arquivo e tipo', () => {
  const result = run(
    { fileName: 'apps/gestao-vite/src/App.tsx', sourceText: 'const x = <Routes><Route path="/fluxo/:id/contatos" element={<div />} /></Routes>;' },
    { fileName: 'apps/gestao-vite/src/nav.ts', sourceText: 'navigate(`/fluxo/${id}/contatos`);' },
    { fileName: 'apps/gestao-vite/tests/nav.test.ts', sourceText: "assert.equal(path, '/fluxo/x/contatos');" },
    { fileName: 'apps/gestao-vite/src/unrelated.ts', sourceText: "const root = '/'; const parent = '/fluxo'; const other = '/configuracoes/api';" },
  );
  assert.deepEqual(result.routeDependents.map((item) => item.kind).sort(), ['navigate', 'test']);
});

test('captura nomes tecnicos em constantes e agendadores sem casar nomes proximos', () => {
  const result = run({ fileName: 'apps/api/src/filas.ts', sourceText: "const FILA_ENTRADA = 'pipe-entrada'; const FILA_GERENCIAR = 'fila.gerenciar'; const FILA_ENTRADA_EXTRA = 'other'; const COOKIE_SESSAO = 'pipe_sessao'; fila.upsertJobScheduler('varredura-outbox', {}, {}); const AJUDA = { pipe_fila_profundidade: 'x' };" });
  for (const [kind, old] of [['queue', 'pipe-entrada'], ['cookie', 'pipe_sessao'], ['job-name', 'varredura-outbox'], ['metric', 'pipe_fila_profundidade']]) {
    assert.ok(result.rows.some((row) => row.kind === kind && row.old === old));
  }
  assert.equal(result.rows.some((row) => row.kind === 'queue' && row.old === 'other'), false);
  assert.equal(result.rows.some((row) => row.kind === 'queue' && row.old === 'fila.gerenciar'), false);
});

test('liga sufixo de rota a construtor com base dinamica sem aceitar prefixo curto', () => {
  const result = run(
    { fileName: 'apps/gestao-vite/src/App.tsx', sourceText: 'const x = <Routes><Route path="/fluxo/:id"><Route path="analise/dicionario-de-dados" element={<div />} /></Route></Routes>;' },
    { fileName: 'apps/gestao-vite/src/nav.ts', sourceText: 'const url = `${baseDoContato("fluxo", id)}/analise/dicionario-de-dados`; const near = "/fluxo";' },
  );
  const route = result.rows.find((row) => row.kind === 'front-route' && row.old.includes('dicionario-de-dados'));
  assert.ok(route);
  assert.equal(result.routeDependents.filter((item) => item.route_row_id === route.id).length, 1);
});

test('nao inclui texto visivel de listas const no mapa de literais tecnicos', () => {
  const result = run({ fileName: 'apps/gestao-vite/src/menu.ts', sourceText: "const ITENS = [{ rotulo: 'Atendimento', descricao: 'Ver conversas da fila', rota: 'atendimento' }] as const;" });
  assert.ok(result.rows.some((row) => row.kind === 'literal-value' && row.old === 'atendimento'));
  assert.equal(result.rows.some((row) => row.kind === 'literal-value' && ['Atendimento', 'Ver conversas da fila'].includes(row.old)), false);
});

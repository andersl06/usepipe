import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { cardsVisible, permissionRequired } from '../src/pages/contract/catalogo.ts';
import { actionErrors, novaAcao, tipoDeAcao, variablesOfField } from '../src/pages/builder/actions-of-block.ts';

test('knowledge bases live in the account configuration catalog, guarded by the API permission', () => {
  const cards = cardsVisible(['automacao.fluxo.editar']);
  const card = cards.find((c) => c.id === 'knowledge-base');
  assert.ok(card, 'Base de conhecimento must be available from the account panel');
  assert.equal(card.rota, '/application/tenant/knowledge-base');
  assert.equal(card.pronto, true);
  assert.equal(permissionRequired(card), 'automacao.fluxo.editar');
  assert.ok(!cardsVisible([]).some((c) => c.id === 'knowledge-base'));
  const routes = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.ok(routes.includes('path="/application/tenant/knowledge-base"'));
});

test('content assistant keeps legacy comma separated tags visible for editing', () => {
  assert.deepEqual(variablesOfField({ type: 'ProcessContentAssistant', settings: { tags: ' vendas, trocas ' } }, 'tags'), ['vendas', 'trocas']);
});

test('knowledge actions expose scope, embeddings secret and engine numeric limits', () => {
  const action = tipoDeAcao('KnowledgeBaseConsult');
  assert.ok(action, 'KnowledgeBaseConsult must appear in the action catalog');
  assert.deepEqual(action.campos.map((f) => f.key), [
    'query', 'catalogs', 'documents', 'tags', 'top_k', 'minimumScore', 'apiKeySecret', 'outputVariable',
  ]);
  const assistant = tipoDeAcao('ProcessContentAssistant')!;
  assert.equal(assistant.campos.find((f) => f.key === 'tags')?.tipo, 'variableList');
  assert.ok(assistant.campos.some((f) => f.key === 'apiKeySecret'));
  assert.match(assistant.info!, /exists/);
  assert.match(actionErrors({ ...novaAcao('KnowledgeBaseConsult'), settings: { top_k: 21 } }).join(' '), /1.*20/);
  assert.match(actionErrors({ ...novaAcao('ProcessContentAssistant'), settings: { text: 'oi', outputVariable: 'r', score: '1.5' } }).join(' '), /0.*1/);
});

test('text ingestion reads supported browser files and normalizes tags before sending', async () => {
  const module = await import('../src/lib/knowledge.ts').catch(() => null);
  assert.ok(module, 'Knowledge management helpers must exist');
  assert.deepEqual(module.knowledgeTags(' Preço, preço, VENDAS, , '), ['preço', 'vendas']);
  const markdown = new File(['# Perguntas\nResposta'], 'FAQ.MD', { type: 'text/markdown' });
  assert.deepEqual(await module.readKnowledgeFile(markdown), { title: 'FAQ', body: '# Perguntas\nResposta' });
  await assert.rejects(module.readKnowledgeFile(new File(['abc'], 'manual.pdf')), /\.txt.*\.md/);
  await assert.rejects(module.readKnowledgeFile(new File([' '], 'vazio.txt')), /texto/);
  await assert.rejects(module.readKnowledgeFile(new File(['x'.repeat(500001)], 'grande.txt')), /500000/);
  assert.deepEqual(module.knowledgeDocumentInput({ title: ' FAQ ', body: ' Texto ', tags: ' A, a ' }), { title: 'FAQ', body: 'Texto', tags: ['a'] });
  assert.throws(() => module.knowledgeDocumentInput({ title: '', body: 'x', tags: '' }), /título/);
  assert.throws(() => module.knowledgeTags(Array.from({ length: 21 }, (_, i) => `t${i}`).join(',')), /20/);
});

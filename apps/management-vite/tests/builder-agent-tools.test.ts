import assert from 'node:assert/strict';
import { test } from 'node:test';
import { knowledgeConsultSettings, knowledgeRequest, converterDoEditor, agentToolbox, agentSettings } from '@pipe/core';
import { newAiAgentBlock, agentSettingsOf, withAgentSettings } from '../src/pages/builder/ai-agent-block.ts';

test('knowledge selection keeps document catalog metadata, tags and secret names on a local tool', async () => {
  const module = await import('../src/pages/builder/ai-agent-tools.ts').catch(() => null);
  assert.ok(module, 'Agent knowledge helpers must exist');
  let block = newAiAgentBlock({}, { top: 0, left: 0 }, 'k1');
  const original = structuredClone(block);
  const tool = module.newKnowledgeTool(block, 'tool1');
  const selected = module.withKnowledgeSelection(tool, {
    catalogs: ['base-1'], documents: [{ id: 'doc-1', baseId: 'base-1', active: true }],
    tags: ['vendas'], topK: 7, minimumScore: 0.4, apiKeySecret: 'EMBEDDINGS_KEY',
  });
  assert.deepEqual(selected.settings?.['documents'], [{ id: 'doc-1', catalog_id: 'base-1', status: 'active' }]);
  assert.equal(selected.$title, 'conhecimento_1');
  assert.ok(selected.$description);
  assert.deepEqual(knowledgeConsultSettings(selected.settings!), {
    topK: 7, bases: ['base-1'], documents: ['doc-1'], tags: ['vendas'], minimumScore: 0.4,
    apiKeySecret: 'EMBEDDINGS_KEY', query: null, outputVariable: null,
  });
  block = { ...block, $localCustomActions: [selected] };
  const engine = converterDoEditor({ flow: { [block.id]: block }, globalActions: {} }, 'bot').states.find((s) => s.id === block.id)!;
  assert.equal(agentToolbox(engine, agentSettings(agentSettingsOf(block))).knowledge.size, 1);
  assert.deepEqual(original.$localCustomActions, []);
  assert.equal(module.newKnowledgeTool(block, 'tool2').$title, 'conhecimento_2');
  assert.deepEqual(module.knowledgeSelection(selected).documents, [{ id: 'doc-1', baseId: 'base-1', active: true }]);
  assert.throws(() => module.withKnowledgeSelection(selected, { ...module.knowledgeSelection(selected), topK: 0 }), /1.*20/);
});

test('MCP lifecycle writes Blip tools format and preserves other imported agent settings', async () => {
  const module = await import('../src/pages/builder/ai-agent-tools.ts').catch(() => null);
  assert.ok(module, 'MCP editor helpers must exist');
  let block = newAiAgentBlock({}, { top: 0, left: 0 }, 'm1');
  block = withAgentSettings(block, { ...agentSettingsOf(block), tools: { legacy: { code: 'legacy', mcp: 'https://legacy.example/mcp', transport: 'sse', unknown: true } }, contentSafety: { custom: true } });
  const original = structuredClone(block);
  const draft = { code: 'catalogo', url: 'https://tools.example/mcp', secretHeaders: { Authorization: 'MCP_TOKEN' } };
  const result = module.saveMcpServer(block, draft);
  assert.ok(result.ok);
  const settings = agentSettingsOf(result.block);
  assert.deepEqual((settings['tools'] as Record<string, unknown>)['catalogo'], { code: 'catalogo', mcp: draft.url, transport: 'streamable-http', secretHeaders: { Authorization: 'MCP_TOKEN' } });
  assert.deepEqual(settings['contentSafety'], { custom: true });
  assert.deepEqual(block, original);
  const renamed = module.saveMcpServer(result.block, { ...draft, code: 'novo' }, 'catalogo');
  assert.ok(renamed.ok);
  assert.deepEqual(module.mcpServers(renamed.block).map((s) => s.code), ['legacy', 'novo']);
  const removed = module.removeMcpServer(renamed.block, 'novo');
  assert.deepEqual(agentSettingsOf(removed)['tools'], agentSettingsOf(original)['tools']);
  assert.equal(module.saveMcpServer(result.block, draft).ok, false, 'duplicate names must not overwrite');
  for (const url of ['http://tools.example/mcp', 'https://localhost/mcp', 'https://127.0.0.1/mcp', 'https://192.168.1.2/mcp', 'https://u:p@tools.example/mcp', 'javascript:alert(1)']) {
    assert.equal(module.saveMcpServer(block, { ...draft, url }).ok, false, url);
  }
  assert.equal(module.saveMcpServer(block, { ...draft, secretHeaders: { 'Bad Header': 'TOKEN' } }).ok, false);
  assert.equal(module.saveMcpServer(block, { ...draft, secretHeaders: { Authorization: 'not a secret name' } }).ok, false);
});

test('whole-base and specific-document gestures switch exclusive scope modes in either order', async () => {
  const module = await import('../src/pages/builder/ai-agent-tools.ts');
  const tool = module.newKnowledgeTool(newAiAgentBlock({}, { top: 0, left: 0 }, 'scope'));
  // Valid, invented UUIDs represent records known to the tenant (resolveScope drops unknown IDs).
  const baseA = '10000000-0000-4000-8000-000000000001';
  const baseB = '10000000-0000-4000-8000-000000000002';
  const documentA = { id: '20000000-0000-4000-8000-000000000001', baseId: baseA, active: true };
  const documentB1 = { id: '20000000-0000-4000-8000-000000000002', baseId: baseB, active: true };
  const documentB2 = { id: '20000000-0000-4000-8000-000000000003', baseId: baseB, active: true };
  const passages = [documentA, documentB1, documentB2];
  // search.ts resolveScope ANDs catalog and document filters; empty filters mean unrestricted.
  const runtimeMatches = (action: typeof tool) => {
    const scope = knowledgeRequest('pergunta', knowledgeConsultSettings(action.settings!));
    return passages.filter((d) => (!scope.bases.length || scope.bases.includes(d.baseId)) &&
      (!scope.documents.length || scope.documents.includes(d.id))).map((d) => d.id);
  };
  const documentThenBase = module.toggleKnowledgeBase(module.toggleKnowledgeDocument(tool, documentA, true), baseB, true);
  assert.deepEqual(runtimeMatches(documentThenBase), [documentB1.id, documentB2.id], 'Selecting a whole base replaces the document scope');
  assert.deepEqual(module.knowledgeSelection(documentThenBase).documents, []);
  assert.deepEqual(module.knowledgeSelection(documentThenBase).catalogs, [baseB]);
  const baseThenDocument = module.toggleKnowledgeDocument(module.toggleKnowledgeBase(tool, baseB, true), documentA, true);
  assert.deepEqual(runtimeMatches(baseThenDocument), [documentA.id], 'Selecting a document replaces the whole-base scope');
  assert.deepEqual(module.knowledgeSelection(baseThenDocument).catalogs, [baseA], 'Document catalogs name only selected document parents');
  const multiDocument = module.toggleKnowledgeDocument(baseThenDocument, passages[1]!, true);
  assert.deepEqual(runtimeMatches(multiDocument), [documentA.id, documentB1.id]);
  assert.deepEqual(module.knowledgeSelection(multiDocument).catalogs, [baseA, baseB]);
  const removeDocument = module.toggleKnowledgeDocument(multiDocument, documentA, false);
  assert.deepEqual(runtimeMatches(removeDocument), [documentB1.id]);
  assert.deepEqual(module.knowledgeSelection(removeDocument).catalogs, [baseB]);
  const removeLastDocument = module.toggleKnowledgeDocument(removeDocument, passages[1]!, false);
  assert.deepEqual(module.knowledgeSelection(removeLastDocument).catalogs, []);
  assert.deepEqual(runtimeMatches(removeLastDocument), passages.map((d) => d.id));
  assert.deepEqual(module.knowledgeSelection(module.toggleKnowledgeBase(documentThenBase, baseB, false)).catalogs, []);
  assert.deepEqual(tool.settings, { top_k: 5, catalogs: [], documents: [], tags: [] });
});

test('explicit scope mode changes clear the previous mode and retain unrelated tool settings', async () => {
  const module = await import('../src/pages/builder/ai-agent-tools.ts');
  assert.equal(typeof module.withKnowledgeScopeMode, 'function', 'Explicit scope switching must exist');
  let tool = module.newKnowledgeTool(newAiAgentBlock({}, { top: 0, left: 0 }, 'mode'));
  tool = module.withKnowledgeSelection(tool, { ...module.knowledgeSelection(tool), catalogs: ['base-A'], tags: ['faq'], apiKeySecret: 'EMBEDDINGS' });
  const documentMode = module.withKnowledgeScopeMode(tool, 'documents');
  assert.deepEqual(module.knowledgeSelection(documentMode).catalogs, []);
  const selected = module.toggleKnowledgeDocument(documentMode, { id: 'doc-B', baseId: 'base-B', active: true }, true);
  const baseMode = module.withKnowledgeScopeMode(selected, 'bases');
  assert.deepEqual(module.knowledgeSelection(baseMode).catalogs, []);
  assert.deepEqual(module.knowledgeSelection(baseMode).documents, []);
  assert.deepEqual(module.knowledgeSelection(baseMode).tags, ['faq']);
  assert.equal(module.knowledgeSelection(baseMode).apiKeySecret, 'EMBEDDINGS');
  const canonical = module.withKnowledgeSelection(selected, { ...module.knowledgeSelection(selected), catalogs: ['base-A'] });
  assert.deepEqual(module.knowledgeSelection(canonical).catalogs, ['base-B'], 'Parent scopes cannot become disjoint after another field edit');
});

test('MCP secret mappings accept existing flow naming rules and reject duplicate HTTP headers', async () => {
  const module = await import('../src/pages/builder/ai-agent-tools.ts');
  const block = newAiAgentBlock({}, { top: 0, left: 0 }, 'names');
  const result = module.saveMcpServer(block, { code: 'meu_servidor', url: 'https://tools.example/mcp', secretHeaders: { Authorization: 'integração.token' } });
  assert.ok(result.ok, 'Existing Unicode/dotted secret names must work');
  const duplicate = module.saveMcpServer(block, { code: 'meu_servidor', url: 'https://tools.example/mcp', secretHeaders: { Authorization: 'TOKEN_1', authorization: 'TOKEN_2' } });
  assert.equal(duplicate.ok, false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { knowledgeConsultSettings, converterDoEditor, agentToolbox, agentSettings } from '@pipe/core';
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

test('scope gestures keep catalog and document filters consistent across bases', async () => {
  const module = await import('../src/pages/builder/ai-agent-tools.ts');
  assert.equal(typeof module.toggleKnowledgeDocument, 'function', 'Document selection gesture must exist');
  const tool = module.withKnowledgeSelection(module.newKnowledgeTool(newAiAgentBlock({}, { top: 0, left: 0 }, 'scope')), {
    catalogs: ['base-1'], documents: [], tags: [], topK: 5, minimumScore: 0, apiKeySecret: '',
  });
  const selected = module.toggleKnowledgeDocument(tool, { id: 'doc-2', baseId: 'base-2', active: true }, true);
  assert.deepEqual(module.knowledgeSelection(selected).catalogs, ['base-1', 'base-2']);
  const removed = module.toggleKnowledgeBase(selected, 'base-2', false);
  assert.deepEqual(module.knowledgeSelection(removed).catalogs, ['base-1']);
  assert.deepEqual(module.knowledgeSelection(removed).documents, []);
  assert.deepEqual(module.knowledgeSelection(module.toggleKnowledgeDocument(selected, { id: 'doc-2', baseId: 'base-2', active: true }, false)).documents, []);
});

test('MCP secret mappings accept existing flow naming rules and reject duplicate HTTP headers', async () => {
  const module = await import('../src/pages/builder/ai-agent-tools.ts');
  const block = newAiAgentBlock({}, { top: 0, left: 0 }, 'names');
  const result = module.saveMcpServer(block, { code: 'meu_servidor', url: 'https://tools.example/mcp', secretHeaders: { Authorization: 'integração.token' } });
  assert.ok(result.ok, 'Existing Unicode/dotted secret names must work');
  const duplicate = module.saveMcpServer(block, { code: 'meu_servidor', url: 'https://tools.example/mcp', secretHeaders: { Authorization: 'TOKEN_1', authorization: 'TOKEN_2' } });
  assert.equal(duplicate.ok, false);
});

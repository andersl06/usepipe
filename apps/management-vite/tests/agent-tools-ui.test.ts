import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { newAiAgentBlock, withAgentSettings, agentSettingsOf } from '../src/pages/builder/ai-agent-block.ts';

// tsx's workspace source loader uses classic JSX for @pipe/ui; use the real React runtime.
Object.assign(globalThis, { React });

test('knowledge picker shows available account bases, selected documents, tags and embeddings key name', async () => {
  const module = await import('../src/pages/builder/knowledge-tools-ui.tsx').catch(() => null);
  assert.ok(module, 'Knowledge picker must be rendered by Pipe components');
  const query = new QueryClient();
  query.setQueryData(['api', '/v1/management/knowledge-bases'], [
    { id: 'base-1', name: 'FAQ da conta', active: true, documents: 1, createdAt: '', updatedAt: null },
  ]);
  query.setQueryData(['api', '/v1/management/knowledge-bases/base-1/documents'], [
    { id: 'doc-1', baseId: 'base-1', title: 'Trocas', tags: ['vendas'], active: true, passages: 3, embedded: 0, version: 1, createdAt: '', updatedAt: null },
  ]);
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: query },
    createElement(module.KnowledgeFields, {
      acao: { type: 'KnowledgeBaseConsult', settings: { catalogs: ['base-1'], documents: [{ id: 'doc-1', catalog_id: 'base-1', status: 'active' }], tags: ['vendas'], apiKeySecret: 'EMBEDDINGS_KEY' } },
      onMudar: () => undefined, secretNames: ['EMBEDDINGS_KEY'],
    })));
  assert.match(html, /FAQ da conta/);
  assert.match(html, /Trocas/);
  assert.match(html, /3 trechos/);
  assert.match(html, /EMBEDDINGS_KEY/);
  assert.match(html, /vendas/);
  assert.match(html, /checked=""/);
  assert.match(html, /Base de conhecimento/);
  assert.match(html, /<input(?=[^>]*name="[^"]+-scope")(?=[^>]*value="documents")(?=[^>]*checked="")[^>]*>/);
  assert.match(html, /Trocar o modo limpa a seleção anterior/);
  assert.doesNotMatch(html, /<legend>Bases<\/legend>/, 'Document mode does not show whole-base selectors');
  query.clear();
});

test('knowledge whole-base mode exposes a mutually exclusive scope choice and no document checkboxes', async () => {
  const module = await import('../src/pages/builder/knowledge-tools-ui.tsx');
  const query = new QueryClient();
  query.setQueryData(['api', '/v1/management/knowledge-bases'], [
    { id: 'base-B', name: 'Base B', active: true, documents: 2, createdAt: '', updatedAt: null },
  ]);
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: query },
    createElement(module.KnowledgeFields, { acao: { type: 'KnowledgeBaseConsult', settings: { catalogs: ['base-B'], documents: [] } }, onMudar: () => undefined, secretNames: [] })));
  assert.match(html, /<input(?=[^>]*name="[^"]+-scope")(?=[^>]*value="bases")(?=[^>]*checked="")[^>]*>/);
  assert.match(html, /<legend>Bases<\/legend>/);
  assert.doesNotMatch(html, /<legend>Documentos<\/legend>/);
  assert.doesNotMatch(html, /Documentos da base/);
  query.clear();
});

test('MCP editor lists connections with an explicit legacy transport warning and secret names', async () => {
  const module = await import('../src/pages/builder/knowledge-tools-ui.tsx').catch(() => null);
  assert.ok(module, 'MCP connections editor must exist');
  const original = newAiAgentBlock({}, { top: 0, left: 0 }, 'agent');
  const block = withAgentSettings(original, { ...agentSettingsOf(original), tools: { crm: { code: 'crm', mcp: 'https://crm.example/mcp', transport: 'sse', secretHeaders: { Authorization: 'CRM_TOKEN' } } } });
  const html = renderToStaticMarkup(createElement(module.McpConnections, { block, onMudar: () => undefined, secretNames: ['CRM_TOKEN'] }));
  assert.match(html, /Conectar MCP/);
  assert.match(html, /crm/);
  assert.match(html, /CRM_TOKEN/);
  assert.match(html, /SSE/);
  assert.match(html, /Streamable HTTP/);
  assert.doesNotMatch(html, /não suportad[oa] no Pipe/);
});

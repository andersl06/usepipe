---
phase: 02-fechar-o-builder
plan: 55
subsystem: flow-engine, ai, mcp, api, db
tags: [P15, KnowledgeBaseConsult, ProcessContentAssistant, IntegrateMCP, pgvector, embeddings, MCP]
requires: [02-53, 02-48]
provides:
  - Tenant knowledge bases with text ingestion (v1/management/knowledge-bases)
  - Knowledge search, semantic (pgvector + flow key) or lexical (Postgres full text)
  - KnowledgeBaseConsult as an AI agent tool and as a standalone action
  - ProcessContentAssistant over the same search, with a real no-match
  - MCP servers of the agent block (settings.tools) as agent tools, with secret auth headers
  - "@pipe/ai/embeddings (OpenAI embeddings over fetch) and the @pipe/mcp client"
key-files:
  created:
    - packages/ai/src/embeddings/embeddings.ts
    - packages/ai/src/embeddings/embeddings.test.ts
    - packages/ai/src/embeddings/index.ts
    - packages/mcp/src/client.ts
    - packages/mcp/src/client.test.ts
    - packages/mcp/tsconfig.tests.json
    - packages/mcp/vitest.config.ts
    - packages/db/drizzle/0058_busca_na_base_de_conhecimento.sql
    - packages/core/src/flow/knowledge.ts
    - packages/core/src/flow/knowledge.test.ts
    - apps/api/src/domain/knowledge/chunking.ts
    - apps/api/src/domain/knowledge/search.ts
    - apps/api/src/domain/knowledge/bases.ts
    - apps/api/src/domain/knowledge/mcp-tools.ts
    - apps/api/src/controllers/management-knowledge.ts
    - apps/api/tests/knowledge-units.test.ts
    - apps/api/tests/knowledge-base.test.ts
  modified:
    - packages/ai/package.json
    - packages/ai/src/index.ts
    - packages/mcp/package.json
    - packages/mcp/src/index.ts
    - packages/mcp/tsconfig.json
    - packages/db/drizzle/meta/_journal.json
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/ai-agent.ts
    - packages/core/src/flow/index.ts
    - apps/api/package.json
    - pnpm-lock.yaml
    - apps/api/src/domain/engine-services.ts
    - apps/api/src/app.modulo.ts
decisions:
  - "Scope is the TENANT, not the flow. Blip's catalogs belong to the account: the Builder lists them per account (`getTenantId()`), and each KnowledgeBaseConsult only selects `catalogs[]`/`documents[]`. Pipe's `base_conhecimento`/`documento_conhecimento`/`trecho_conhecimento` (0000, RLS per tenant) already had this shape and are reused. A catalog is a base and a document is a document."
  - "Embeddings use OpenAI `text-embedding-3-small` at 1536 dimensions, the size of the existing `vector(1536)` column, called over fetch with no new package. The key is a FLOW secret (`OPENAI_API_KEY`, or `apiKeySecret` on the action). An OpenAI agent's own `model.apiKeySecret` also serves its knowledge tools."
  - "Passages are embedded lazily at search time, because ingestion is tenant-level and has no flow key. Each search embeds at most 64 passages of its scope that have no embedding of the model yet, matching passages first. They go in the same provider call as the query and are cached in `trecho_conhecimento.embedding` plus `modelo_embedding` (0058)."
  - "Without a key the search is lexical (Postgres `portuguese` full text), and the score is the share of the query's words found. This covers the Builder test run without secrets, and it behaves the same in production. With a key the test run embeds for real, as production does."
  - "MCP config is Blip's own `ForwardToAgent.settings.tools[code] = {code, mcp, transport, headers}`. Pipe adds `secretHeaders: {Header: SECRET_NAME}`, because `{{secret.*}}` resolves only in HTTP actions. Blip's `grounding-mcp` entry is skipped, since KnowledgeBaseConsult tools replace it."
  - "Only the Streamable HTTP MCP transport is supported. `transport: 'sse'` (legacy) is refused, so that server's tools are left out of the turn. URLs must pass `confirmarUrlSegura`: HTTPS and not a private network."
  - "ProcessContentAssistant keeps Pipe's 0..1 `score` (earlier decision). On no match it now deletes `outputVariable` instead of writing the old 'Não sei responder…' sentence, so a block can take a no-match exit with `exists`/`notExists`."
metrics:
  completed: 2026-09-30
---

# 02-55: P15 knowledge base and MCP Summary

An AI agent block can now search the account's **knowledge bases** (`KnowledgeBaseConsult` tools) and use the tools of the **MCP servers** connected to it (Blip "Conectar MCP"). `ProcessContentAssistant` answers from the same search. The flow's secrets hold the provider keys. Production and the Builder test run share everything through `engineServices`.

## Blip evidence used (D-33: format only, nothing copied)

From zip19 `portal.js`, read only:
- **`createGroundingActionTools` (`:156035`)**: every `KnowledgeBaseConsult` local action of an agent block becomes a grounding tool. The tool has name = `$title` and description = `$description`.
- **`setAgentGroundingToolSetup` (`:156145`)** and **`publishGroundingToolsSetup` (`:254330`)** give the setup shape: `settings.{top_k, catalogs[], documents[{id, catalog_id, status}]}`. Catalogs are per tenant (`getTenantId()`), and the agent only selects them.
- **`addMcpResourceToTools` (`:155943`)**, **`insertGroundingMcpToAgentConfiguration` (`:156075`)** and the custom-MCP sidebar (`:267109`, template `:92412`):
  - `ForwardToAgent.settings.tools[code] = {code, mcp: <url>, transport: 'streamable-http' | 'sse', headers{}}`
  - `IntegrateMCP` is a pseudo-action that only opens that modal (`:249470`)
  - `grounding-mcp` is Blip's own document server
- **ProcessContentAssistant form (`:259845`)** gives the fields `text`, `tags`, `score` (0–100 in Blip; Pipe keeps 0..1) and `outputVariable`.

## What was built

### Storage (migration 0058)
The existing tables are reused: `base_conhecimento` → `documento_conhecimento` → `trecho_conhecimento` with `embedding vector(1536)` and RLS `tenant_isolado`. Migration 0058 (`0058_busca_na_base_de_conhecimento`, journal idx 58, when 1790150000000) adds only:
- `trecho_conhecimento.modelo_embedding text`: the model that produced the embedding. A passage embedded by another model is embedded again before comparison.
- `documento_conhecimento.tags text[] not null default '{}'`: the `tags` filter.
- A GIN index on `to_tsvector('portuguese', texto)` (lexical search).
- An HNSW index `vector_cosine_ops` on `embedding`.

It uses raw SQL, like 0055/0056, so the shared Drizzle schema is untouched.

### Ingestion and management API (`apps/api/src/domain/knowledge/bases.ts`)
All routes are under `v1/management/knowledge-bases`:

| Route | Methods |
|---|---|
| `/` | GET, POST |
| `/:baseId` | PATCH (`name`, `active`), DELETE |
| `/:baseId/documents` | GET, POST `{title, body, tags?}` |
| `/:baseId/documents/:documentId` | GET (with `body`), PATCH (`title`, `body`, `tags`, `active`), DELETE |

- **Permission:** `automacao.fluxo.editar`, because bases belong to the account and any flow can use them.
- **Input:** text only. A `.txt`/`.md` file is read by the client and sent as `body`. PDF and DOCX would need a parser package, so they are not accepted and no package was added.
- **Chunking (`chunking.ts`):** paragraphs are joined up to about 900 characters. A long paragraph is cut at sentence ends (at most 1400 characters), with a hard cut as the last resort.
- **Edits:** a new body raises `versao` and replaces the passages. The new passages are embedded again on the next search.
- **Audit and limits:** create, edit and delete are audited. Limits: body up to 500k characters, up to 2000 passages, up to 20 tags.

### Search (`apps/api/src/domain/knowledge/search.ts`, `knowledgeService`)
`searchKnowledge(request, signal)` returns `{mode: 'semantic' | 'lexical', passages[{id, text, score 0..1, documentId, documentTitle, baseId, baseName}]}`.

- **Scope:**
  - active bases and documents of the tenant
  - optional `bases` (Blip catalogs), `documents` and `tags`
  - ids that don't exist in the tenant, such as Blip catalog ids from an import, are dropped; if none remain, the search covers every base of the tenant
- **Semantic mode** (the flow has the key):
  1. One provider call embeds the query plus up to 64 passages of the scope that are still missing an embedding.
  2. Those embeddings are stored.
  3. The passages are ranked by `1 - (embedding <=> query)`.
- **Lexical mode** (no key): `to_tsquery('portuguese', w1 | w2 …)`. The score is the share of the query's non-stop words that the passage contains.
- **Parameters:** `topK` is 1..20 (default 5), and `minimumScore` is 0..1.
- **Key safety:** the key is masked in every error. `PIPE_OPENAI_BASE_URL` points the embeddings at a stub or gateway, the same variable the agent uses.
- **ProcessContentAssistant:** `respondWithKnowledge` now runs on top of this search (top 1, `minimumConfidence`). The old `ilike` `knowledgeMatch` was removed.

### Engine (`packages/core/src/flow/knowledge.ts`, `ai-agent.ts`, `actions.ts`, `context.ts`)
- **New optional `ServicosDoMotor` methods:** `searchKnowledge`, `listMcpTools` and `callMcpTool`. `respondWithKnowledge` also accepts `apiKeySecret`.
- **`agentToolbox`** now also builds:
  - one knowledge tool per `KnowledgeBaseConsult` local action, with input schema `{query}`, name from `$title` and description from `$description`
  - maps `knowledge`, `mcp` and `names`

  The tool order is: action tools, knowledge tools, handoffs, then MCP tools.
- **`addMcpTools`:** at each turn, `ForwardToAgent` lists the tools of every MCP server in `settings.tools`, skipping `grounding-mcp`. A server that fails to list is skipped for that turn.
- **Tool calls:**
  - A knowledge call returns `{status:'ok', mode, passages[{text, score, document, documentId, base}]}`. The weakest passages are dropped until the result fits in 4 KB.
  - An MCP call returns the tool's text content. `isError` is passed on.
  - Failures go back to the model as tool errors. The block does not fail.
- **`KnowledgeBaseConsult` as a flow action** (a Pipe addition): it searches `settings.query` or the customer's input. It writes the result JSON to `settings.outputVariable`, or deletes that variable when nothing is found. It is now in `PROVEDOR_PADRAO`, so an imported agent block that has a knowledge tool no longer reports `naoSuportado`.
- **`ProcessContentAssistant`:** on no match the variable is removed, and `apiKeySecret` is passed through.

### MCP
- **Client (`packages/mcp/src/client.ts`, `McpClient`):** Streamable HTTP over `fetch`, with no SDK package.
  - `initialize` + `notifications/initialized`, once per client
  - `tools/list` with `nextCursor`, up to 10 pages
  - `tools/call`
  - the response may be JSON or an SSE stream, which is read until the matching id
  - keeps `Mcp-Session-Id` and sends `MCP-Protocol-Version: 2025-06-18`
  - bodies are capped at 1 MB
  - errors never quote headers
- **Service (`apps/api/src/domain/knowledge/mcp-tools.ts`, `mcpService`):**
  - checks the URL with `confirmarUrlSegura`
  - decrypts `secretHeaders` from the flow secrets; a missing secret fails that server
  - keeps one client (session) per server for each input
  - masks secret values in errors

### Embeddings (`@pipe/ai/embeddings`)
`createEmbeddings(inputs, {apiKey, model?, baseUrl?, fetch?, signal?})` sends `POST {base}/embeddings` with `dimensions: 1536`. It checks the vector sizes and returns them in input order, and errors never contain the key. The module also exports `cosineSimilarity`.

## Management UI: not built (what is missing)
There is no Gestão screen for knowledge bases yet. The Builder (`apps/management-vite/src/pages/builder/**`) is being changed by 02-52, and a new page would also touch the app's routing and navigation, so I left the UI out. The API is complete. The UI needs:

1. **Configuração › Base de conhecimento (account level):**
   - list, create, rename, enable and delete bases
   - per base: list documents with the number of passages and how many are embedded, add a document (title, text or a `.txt`/`.md` file read in the browser, tags), edit, and delete
2. **Builder agent sidebar (P14-UI follow-up):**
   - a **"Base de conhecimento"** tool: a `KnowledgeBaseConsult` local action with a base and document picker (`catalogs`, `documents`), `top_k`, and an optional `apiKeySecret`
   - **"Conectar MCP"**: edits `settings.tools[code]` with a name, a URL, a Streamable HTTP transport (SSE marked as unsupported), plain headers, and **secret headers** that pick a flow secret name
3. **Action catalog:** `KnowledgeBaseConsult` as a standalone action (`query`, `outputVariable`, `minimumScore`, bases), and the new `apiKeySecret` field on `ProcessContentAssistant`.

## Verification (worktree)

| Package | Check | Result |
|---|---|---|
| core | `npx vitest run` | 611/611 (25 files; new `knowledge.test.ts`, 8 tests) |
| core | `npx tsc --noEmit -p .`, `npx eslint src/flow` | clean |
| @pipe/ai | `vitest run` | 83/83 (new `embeddings.test.ts`, 3 tests; `fetch` stubbed) |
| @pipe/ai | `tsc` (build + tests), `eslint src` | clean |
| @pipe/mcp | `vitest run` | 3/3 (new, `fetch` stubbed) |
| @pipe/mcp | `tsc` (build + tests), `eslint src` | clean |
| API | `npx tsc -p tsconfig.test.json --noEmit` | clean |
| API | `eslint src tests` | only the known `sla.ts` error |
| API | DB-free run (throwaway config, removed): `knowledge-units`, `engine-services`, `agent-model`, `flow-platform-actions` | 24/24 |
| Gestão | `pnpm test`, `tsc` | 427/427, clean (not modified) |

## DB tests for the orchestrator (not run here)
`apps/api/tests/knowledge-base.test.ts` needs migration **0058** (and 0055 for the secrets). Nothing touches the network and every key is invented:
- OpenAI chat and embeddings are a local HTTP stub, reached through `PIPE_OPENAI_BASE_URL`.
- The MCP server is an in-process `fetch` stub for `https://mcp.exemplo.test/mcp`, installed with `vi.stubGlobal`.

It covers:
- **Management API:** CRUD, ingestion into passages, lowercased tags, a new body making version 2 with its passages replaced, 400, 404 and 403, and audit rows.
- **Search, lexical:** scores, the base filter, the tag filter, the fallback for unknown catalog ids, and `respondWithKnowledge`.
- **Search, semantic:** passages embedded lazily once and cached with the model name, ranking, and `minimumScore`.
- **Production over the WhatsApp webhook:** an agent that has a knowledge tool and an MCP server (plus a `grounding-mcp` entry that is skipped) searches, calls the MCP tool with the secret header, and answers. Neither secret appears in the context, `execucao_passo` or the messages.
- **Builder test run:** `ProcessContentAssistant` with no key answers from the lexical search, and on no match it takes the `exists`-based exit.

Recommended regression: `ai-agent.test.ts`, `builder-test-run.test.ts`, `flow-actions.test.ts`, `flow-secrets.test.ts`, `import.test.ts`.

## Migration
**0058** `0058_busca_na_base_de_conhecimento.sql` (idx 58, when 1790150000000). It is additive, and every statement uses `IF NOT EXISTS`. The HNSW index needs pgvector 0.5 or later; the `pgvector/pgvector:pg16` image has it.

## Merge risks
- **`packages/core/src/flow/context.ts`:** one type-import line, and the `ServicosDoMotor` tail (the `respondWithKnowledge` comment and signature, plus 3 new optional methods).
- **`packages/core/src/flow/actions.ts`** (02-54 edits `executeTemplate` in another region):
  - one import line
  - the `ProcessContentAssistant` no-match (5 lines)
  - one lazy wrapper after `leavingFromAgentAction`
  - one list entry at the end of `ACTIONS_OF_MOTOR`
- **`packages/core/src/flow/ai-agent.ts`:**
  - imports
  - `NOT_TOOLS` comment
  - `AgentSettings.mcpServers`
  - `AgentToolbox` gains three maps
  - the knowledge loop in `agentToolbox`
  - new `addMcpTools`
  - two lines in `forwardToAgent`
  - `runTool` signature and dispatch, plus the new `searchTool`
- **`packages/core/src/flow/index.ts`:** one `export *` line.
- **`apps/api/src/domain/engine-services.ts`:**
  - two imports
  - `knowledgeMatch` removed; no other caller existed
  - the `respondWithKnowledge` line replaced by two spreads (`knowledgeService`, `mcpService`)
- **`apps/api/src/app.modulo.ts`:** one import and one controller entry.
- **`_journal.json`:** entry idx 58.
- **`apps/api/package.json` and `pnpm-lock.yaml`:** the workspace dependency `@pipe/mcp` (not an npm package).
- **`@pipe/mcp`:** tests run with the root `vitest`; no devDependency was added.
- **Management UI:** untouched.
- **Behaviour change:** `ProcessContentAssistant` with no match now leaves `outputVariable` absent instead of writing "Não sei responder com a base de conhecimento disponível.".

## Deviations and provisional points
- **Lazy embeddings.** A large base reaches full semantic coverage only after several searches, because each search embeds at most 64 passages, matching ones first. Until then a passage with no embedding cannot match semantically. A bulk "index now" action (it would need a flow or a tenant key) is future work.
- **Provider.** Embeddings are OpenAI only. An Anthropic-only flow, with no `OPENAI_API_KEY`, searches lexically.
- **Token usage** of embeddings and MCP is not written to `consumo_ia`, the same as in P14.
- **Legacy SSE MCP** is not implemented. MCP resources, prompts and sampling are ignored; only tools are used.
- **Inside the inbound transaction.** MCP calls and embeddings run there, like the agent itself, and are capped by the action's time limit.
- **`KnowledgeBaseConsult` as a standalone action** is a Pipe addition. In Blip it exists only as an agent tool.

## For 02-56 (NLP / AI Answers)
- **`knowledgeService({tenantId, isolate, loadSecret, embed?})`** in `apps/api/src/domain/knowledge/search.ts` is the retrieval service. It is already wired as `ServicosDoMotor.searchKnowledge` and `respondWithKnowledge`:
  - AI Answers (`aianswers.*`) can call `context.services.searchKnowledge(knowledgeRequest(query, knowledgeConsultSettings(settings)))` from `@pipe/core`
  - it can then pass the passages to `callAgentModel` for a grounded answer
- **`@pipe/ai/embeddings` `createEmbeddings`/`cosineSimilarity`** can embed intent examples for a nearest-example classifier, or the lexical path can serve as a no-key stub.
- **`KnowledgeSearchResult.mode`** tells the caller whether the answer came from semantic or lexical search.
- **`input.contentAssistant.*`** is still P16 and is not filled here.

## Self-Check: PASSED

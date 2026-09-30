---
phase: 02-fechar-o-builder
plan: 58
subsystem: management-vite
tags: [P15-UI, KnowledgeBaseConsult, ProcessContentAssistant, MCP, knowledge-base]
requires: [02-55, 02-57]
provides:
  - Account knowledge base and text document management
  - Builder knowledge scope picker and MCP connection editor
  - KnowledgeBaseConsult action catalog and updated content assistant settings
metrics:
  completed: 2026-09-30
---

# 02-58: Knowledge base and agent tools UI

The account panel now exposes **Base de conhecimento** under **Configurações gerais**, at `/application/tenant/knowledge-base`. Its permission is the existing `automacao.fluxo.editar`, matching the management API. This is account scope; it is not nested under a bot or flow.

## Reference and scope

Read 02-55 and 02-57 summaries before implementation. Format and navigation evidence only was read from the reference bundle: `openKnowledgeBase` opens `/application/tenant/knowledge-base` (`referencias-blip/bundles-e-css/portal.js:267219`), and the existing account card catalog documents the reference's knowledge base configuration card. Pipe components, styles and tokens implement the UI; no reference code, CSS, SVG, class names or secret values were copied.

All implementation is in `apps/management-vite`. No API, engine, DB, contracts, migration, dependencies or lockfile changes. No 02-59 model UI changes; the additions to `panel-ai-agent.tsx` are imports and tool components preceding the existing instructions panel.

## Account page

- List/create/rename/delete bases, with explicit confirmation for base deletion including its documents. Bases can also be activated/deactivated.
- List/add/edit/delete documents, with title, text, comma-separated tags, version, passage count and embedded passage count.
- Paste text or select `.txt`/`.md`; the browser reads `File.text()` and sends `{title, body, tags}` JSON. No multipart request or server upload parser.
- Browser validation mirrors the existing API limits: 120-character base names, 200-character titles, 500,000-character document bodies, 20 tags and 50 characters per tag. Tags are trimmed, lowercased and deduplicated.
- Editing fetches the detail endpoint to load the body. Writes invalidate the existing API query cache. Pending operations disable controls; loading, empty and error states are explicit, with retry for failed list reads. Permission-denied direct navigation returns to the account panel.
- The page uses the portal chrome and a responsive base/document layout with existing Pipe tokens.

## Builder

- **Ações** on an AI agent now includes **Adicionar base de conhecimento** and **Conectar MCP**. Knowledge actions can also be selected from the existing action catalog, including in a subflow where supported.
- Knowledge actions live in `$localCustomActions`; names are unique `conhecimento_N` values with a default agent description. Existing action cards still edit the name, description and argument schema.
- The knowledge editor loads tenant bases/documents from the existing API; selected documents are serialized as `{id, catalog_id, status}`. Base/document selection gestures keep the filters consistent when browsing multiple bases. Imported unavailable IDs remain visible and removable.
- The editor includes selectable document tags plus custom comma-separated tags, `top_k` 1–20, minimum score 0–1 and the embeddings secret **name**. Flow secret names are suggestions; missing names get a warning. The account management page is linked from the picker.
- MCP add/edit/rename/remove writes `ForwardToAgent.settings.tools[code] = {code, mcp, transport: 'streamable-http', secretHeaders}`. Each HTTP header maps to a flow secret name. Only names appear in the editor, never secret values.
- The editor checks public HTTPS URLs without URL credentials, server name uniqueness, valid HTTP header tokens, case-insensitive duplicate headers and the existing flow secret naming rule (letters/numbers/underscore/dot, including Unicode). Backend URL/DNS safety and server connectivity remain authoritative at execution time.
- Other imported agent settings, other MCP servers and imported plain headers are preserved. `grounding-mcp` is left untouched and omitted from the custom connection list. Legacy SSE connections are listed with a precise transport warning and can be edited to Streamable HTTP.

## Action catalog

`KnowledgeBaseConsult` is available as a standalone action with query, scope, tags, result count, minimum score, key secret and output variable. The dedicated scope picker replaces raw ID fields in its cards. `ProcessContentAssistant` edits tag arrays (including older comma-separated imports), minimum confidence and `apiKeySecret`. Both action descriptions explain no-match output removal and `exists` / `notExists` exits. Numeric fields use number controls and publish validation checks the engine limits.

## TDD evidence

Before implementation, the initial focused run had **5 assertion failures** for the missing account card/route, action catalog, browser ingestion helpers, knowledge tool setup and MCP lifecycle. The subsequent API test failed for the missing client. The implementation made all six pass.

Before adding the visual tool components, **2 SSR assertions failed** for the absent knowledge picker and MCP editor. Both passed after implementation. A further review cycle first produced **3 failures** for missing scope gestures, rejection of existing Unicode/dotted secret names, and dropped legacy string tags; all three then passed.

Final focused run: **11/11** across:

- `knowledge-ui.test.ts`: account navigation and permission, catalog/limits/no-match guidance, legacy tags, browser file/text/tag validation.
- `knowledge-api.test.ts`: all nine account CRUD requests, JSON wire bodies, detail body reads, 204 deletion, 403 message propagation and validation before any request.
- `builder-agent-tools.test.ts`: engine consumption through `converterDoEditor` / `agentToolbox`, selected document metadata, unique tool names, immutable scope changes, MCP lifecycle/preservation/validation.
- `agent-tools-ui.test.ts`: real React server rendering of a selected knowledge scope and legacy MCP connection, including counts, tags and secret names. Test setup supplies the real React runtime globally because the workspace `tsx` loader compiles `@pipe/ui` sources with classic JSX. It is isolated to this test file; no new dependency or production harness was added.

## Full verification

All commands were run in this task's worktree, under `apps/management-vite`:

| Check | Result |
| --- | --- |
| `pnpm exec tsc --noEmit -p .` | exit 0, clean |
| `pnpm exec eslint .` | exit 0, clean |
| `pnpm test` | 462 tests passed, 0 failed/skipped |
| `pnpm exec vite build` | exit 0; 1,196 modules transformed; standard chunk-size warning |
| `git diff --check` | clean |

Self-review confirmed that changed files are within task ownership, real capture secrets are absent, API inputs match 02-55, local tool actions are executable by the existing engine, and no model configuration behavior was changed.

## Verification limits and merge notes

- Browser clicks, live API/DB persistence, real embeddings and MCP network calls were not exercised in this UI task. API client wire behavior and browser `File` ingestion are automated; picker/MCP display is SSR-tested. Live integration belongs to the existing 02-55 runtime coverage and follow-up browser UAT.
- The Vite bundle retains its existing large-chunk warning; build succeeds.
- Likely overlap with 02-59: the import area and the insertion immediately before `AiAgentInstructionsPanel` in `panel-ai-agent.tsx`. The model section and `ai-agent-block.ts` were not edited.
- Other merge points: one route/import in `App.tsx`, one account catalog card/permission override, the knowledge action and numeric field metadata/validation in `actions-of-block.ts`, and the agent branch / dedicated fields in `panel-actions.tsx`. Remaining modules and CSS are additive.

## Self-check

Implementation complete; focused RED/GREEN evidence observed, all required package checks green, scope preserved.

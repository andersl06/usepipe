---
phase: 02-fechar-o-builder
plan: 18
subsystem: ui
tags: [react, builder, flow-functions, monaco, search]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder (02-17)
    provides: FlowFunctionsController CRUD routes, funcao_do_fluxo schema, ExecuteTemplate/ExecuteBlipFunction engine actions
  - phase: 02-fechar-o-builder (02-16)
    provides: lazy Monaco code-editor.tsx component
  - phase: 02-fechar-o-builder (02-09)
    provides: normalizar/filterVariables accent-insensitive search pattern
provides:
  - Function library management panel (list, search, create/edit, delete) as a Builder Configuration tab
  - ExecuteTemplate and ExecuteBlipFunction now selectable in the "ADICIONAR FERRAMENTAS" menu (closes the two acoes-funcoes catalogue gaps left by 02-17)
  - Function search/insert reused at both call sites: ExecuteBlipFunction's "Definição da função" and a "insert library call" helper over ExecuteScript/ExecuteScriptV2's code field
affects: [02-fechar-o-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "API-calling writes split from pure filter/format logic into a sibling *-gravar.ts file, so node --test can import the pure module without import.meta.env (same split as channels.ts/comunicacao.ts/agents-gravar.ts)"
    - "Function search/insert built as one low-level FlowFunctionSearch reused by both the picker (FlowFunctionSelect) and the code-field insert helper (FlowFunctionInsertPicker)"

key-files:
  created:
    - apps/management-vite/src/pages/builder/flow-functions.ts
    - apps/management-vite/src/pages/builder/flow-functions-gravar.ts
    - apps/management-vite/src/pages/builder/flow-functions-panel.tsx
    - apps/management-vite/tests/builder-functions.test.ts
  modified:
    - apps/management-vite/src/pages/builder/actions-of-block.ts
    - apps/management-vite/src/pages/builder/panel-actions.tsx
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/src/pages/builder/editor.css

key-decisions:
  - "Split flow-functions.ts (pure filter/format) from flow-functions-gravar.ts (API calls) — importing ../../lib/api at module scope crashes node --test outside Vite (import.meta.env undefined), an established constraint already documented in this app for channels.ts/comunicacao.ts/registrations-gravar.ts."
  - "Mounted the function library as a third 'Funções' tab in panel-configuration.tsx (ConfigurationPanel), not merged into panel-variables.tsx — the library is bot-scoped like Configuration's other tabs (Ações Globais/Versões), and ConfigurationPanel already receives flowId with no extra wiring needed in builder.tsx."
  - "Added ExecuteTemplate/ExecuteBlipFunction to actions-of-block.ts's CATALOG_OF_ACTIONS even though that file wasn't in the plan's files_modified list — 02-17-SUMMARY explicitly deferred both action screens to 02-18, and the orchestrator's mandatory success criterion (conferir-catalogo.mjs --slot acoes-funcoes exits 0) requires it."
  - "New CSS lives in editor.css, not panel-block.css (the plan's listed file) — the existing sibling library panels (variables, versions) already keep their classes unscoped in editor.css; panel-block.css is exclusively .bl-panel--block-scoped rules for the right-side block panel."

patterns-established:
  - "Pattern: keep any file with Resultado<T>-returning API calls out of files a *.test.ts imports directly; give it a *-gravar.ts sibling."

requirements-completed: [BUILDER-02]

# Metrics
duration: 35min
completed: 2026-09-27
---

# Phase 02 Plan 18: Function library panel, search and call-site insertion Summary

**Function library CRUD panel (list/search/create/edit/delete, reusing the 02-16 Monaco editor) as a Builder Configuration tab, plus `ExecuteTemplate`/`ExecuteBlipFunction` wired into the actions catalog with an accent/case-insensitive function picker reused at both the action's own field and the script actions' code-insert helper.**

## Base check

```
$ git symbolic-ref --quiet HEAD
refs/heads/worktree-agent-a6a586a144310b270
$ git rev-parse --abbrev-ref HEAD
worktree-agent-a6a586a144310b270
```
Branch matched the per-agent pattern. `git merge-base HEAD 24825da40af1b0c1c2e661a3c614dafa6bc4a265` returned `33435301b29b3ce01eb30366fb33281fd380cef7` (not the expected base) and `apps/management-vite/src/pages/builder` did not exist yet (the worktree was still on the Portuguese `apps/gestao-vite` tree). Per the check protocol this triggered `git reset --hard 24825da40af1b0c1c2e661a3c614dafa6bc4a265` (working tree was clean beforehand, confirmed via `git status --short`). After the reset:
```
$ git rev-parse HEAD
24825da40af1b0c1c2e661a3c614dafa6bc4a265
$ test -d apps/management-vite/src/pages/builder && echo "renamed tree OK"
renamed tree OK
```

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-27T11:01:25-03:00 (base commit) — reset performed immediately after
- **Completed:** 2026-09-27T11:27:48-03:00 (Task 2 commit)
- **Tasks:** 2/2
- **Files modified/created:** 8 (4 created, 4 modified)

## Accomplishments
- Function library management: search (name/description, accent/case-insensitive), create, edit and delete, with an inline empty-library state matching the reference's literal text ("Crie sua primeira função" / "Você ainda não tem funções na sua biblioteca").
- `ExecuteTemplate` and `ExecuteBlipFunction` now appear in the "ADICIONAR FERRAMENTAS" menu with editor fields matching what the already-shipped 02-17 engine reads (`template`/`functionId`/`inputVariables`/`outputVariable`).
- The same search-and-pick logic is reused three times: the library panel's own list, `ExecuteBlipFunction`'s "Definição da função" field (pick existing or create inline), and a new "Inserir função da biblioteca" helper over the script actions' code editor that appends `nome(param1, param2)` to the source.
- `conferir-catalogo.mjs --slot acoes-funcoes` now exits 0 (`OK 2 itens`), closing the two gaps 02-17-SUMMARY left open.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cliente da API e filtro de funções** - `05c0586` (feat)
2. **Task 2: Painel da biblioteca, busca e inserção no ponto de chamada** - `977620f` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `apps/management-vite/src/pages/builder/flow-functions.ts` - Pure `filterFlowFunctions`/`functionCallSnippet`, no `../../lib/api` import so `node --test` can load it directly.
- `apps/management-vite/src/pages/builder/flow-functions-gravar.ts` - `listFlowFunctions`/`createFlowFunction`/`updateFlowFunction`/`deleteFlowFunction` calling the 02-17 `FlowFunctionsController`, `Resultado<T>` pattern, never throwing to the component.
- `apps/management-vite/src/pages/builder/flow-functions-panel.tsx` - `FlowFunctionsPanel` (library management tab), `FlowFunctionSelect` (ExecuteBlipFunction's field), `FlowFunctionInsertPicker` (script code-field helper), plus the shared `FlowFunctionForm`/`FlowFunctionSearch`/`ParametersEditor` internals.
- `apps/management-vite/tests/builder-functions.test.ts` - 5 `functions:` tests covering name/description search, empty search and call-snippet formatting.
- `apps/management-vite/src/pages/builder/actions-of-block.ts` - Added `functionId` to `CampoDaAcao['tipo']`, and `ExecuteTemplate`/`ExecuteBlipFunction` to `CATALOG_OF_ACTIONS`.
- `apps/management-vite/src/pages/builder/panel-actions.tsx` - Renders `FlowFunctionSelect` for the new `functionId` field type and `FlowFunctionInsertPicker` above the code editor for `ExecuteScript`/`ExecuteScriptV2`.
- `apps/management-vite/src/pages/builder/panel-configuration.tsx` - Adds the "Funções" tab mounting `FlowFunctionsPanel`.
- `apps/management-vite/src/pages/builder/editor.css` - New `.bl-functions-*` classes (list, item, form spacing, select, picker), tokens only.

## Decisions Made
- See `key-decisions` in the frontmatter above (file split for testability, tab placement, catalog file touched outside the plan's `files_modified` list, CSS file choice).
- `listFlowFunctions()` takes no `flowId` filter — the library is documented as bot-scoped (D-22: "recurso do bot"), and the server's `GET` endpoint without `flowId` already returns every tenant-scoped and flow-scoped function, matching what the engine's `loadFlowFunctions` makes callable from any flow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Split `flow-functions.ts` into a pure module and a `*-gravar.ts` API module**
- **Found during:** Task 1
- **Issue:** The plan's single `flow-functions.ts` (pure filter + `api.get/post/put/delete` calls in one file) crashes under `node --import tsx --test` the instant `tests/builder-functions.test.ts` imports it: `../../lib/api` reads `import.meta.env` at module-load time, which is `undefined` outside Vite, throwing before any test body runs. This is a documented, pre-existing constraint in this app (see comments in `channels.ts`, `channel-of-flow.ts`, `agents-gravar.ts`, `communication-gravar.ts`, `registrations-gravar.ts`) and it would have broken the entire `tests/*.test.ts` run, not just the new file.
- **Fix:** Kept `filterFlowFunctions`/`functionCallSnippet` (no `./api` import) in `flow-functions.ts`; moved `listFlowFunctions`/`createFlowFunction`/`updateFlowFunction`/`deleteFlowFunction` to a new sibling `flow-functions-gravar.ts`, mirroring how `builder-gravar.ts` sits beside `builder.tsx`.
- **Files modified:** `apps/management-vite/src/pages/builder/flow-functions.ts`, `apps/management-vite/src/pages/builder/flow-functions-gravar.ts`, `apps/management-vite/tests/builder-functions.test.ts`.
- **Verification:** `pnpm --filter @pipe/management-vite test` — 300/300 passing (5 new `functions:` tests).
- **Committed in:** `05c0586` (Task 1 commit).

**2. [Rule 2 - Missing Critical] Added `ExecuteTemplate`/`ExecuteBlipFunction` to `actions-of-block.ts`'s catalog**
- **Found during:** Task 2
- **Issue:** Without a `CATALOG_OF_ACTIONS` entry, neither action is offered in the "ADICIONAR FERRAMENTAS" menu — the two screens 02-17-SUMMARY explicitly deferred to this plan — and the orchestrator's mandatory success criterion (`conferir-catalogo.mjs --slot acoes-funcoes` exits 0) would keep failing (`FALTA tela ExecuteTemplate`, `FALTA tela ExecuteBlipFunction`) even though the engine side (`packages/core/src/flow/actions.ts`) already runs both.
- **Fix:** Added a `functionId` field type (backing `FlowFunctionSelect`) and two catalog entries whose field keys (`template`/`functionId`/`inputVariables`/`outputVariable`) match exactly what the already-shipped engine code reads from `settings`.
- **Files modified:** `apps/management-vite/src/pages/builder/actions-of-block.ts`, `apps/management-vite/src/pages/builder/panel-actions.tsx`.
- **Verification:** `node .planning/phases/02-fechar-o-builder/ref/conferir-catalogo.mjs --slot acoes-funcoes` → `OK 2 itens`, exit 0.
- **Committed in:** `977620f` (Task 2 commit).

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical).
**Impact on plan:** Both were necessary to satisfy the plan's own stated intent and the orchestrator's mandatory catalogue gate; no scope creep beyond what 02-17-SUMMARY already flagged as pending for this plan.

## Assumption Drift (advisory)

- **Found during:** Task 2 (designing `ExecuteBlipFunction`'s fields).
- **Planned assumption:** `ref/inventario-acoes.md` §`ExecuteBlipFunction` states the call site only picks/searches/creates the function — "parâmetros e retorno definidos na função da biblioteca, não no ponto de chamada."
- **Actual:** The 02-17 engine implementation (`packages/core/src/flow/actions.ts`, already committed) reads `settings.functionId`, `settings.inputVariables` and `settings.outputVariable` from the ACTION itself — the same shape as `ExecuteScript`/`ExecuteScriptV2` — not from the library function's own definition.
- **Why:** The UI must match the contract the already-shipped engine actually reads, not the pure-Blip reference capture (which predates the Pipe-specific engine decision made in 02-17). Built the editor fields (`inputVariables`, `outputVariable`) on the action accordingly; documenting here so a future capture/lifecycle plan (C-27) knows this is a deliberate Pipe divergence, not an oversight.

## Issues Encountered
None beyond the two deviations above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None. The panel and both actions are fully wired to the 02-17 API/engine; the only gap is the already-documented C-27 pending item below (not a stub — the current version is functional, just without immutable history/import-export).

## Pendências (carried from 02-17, still open)

- **C-27** (from 02-17-SUMMARY, unchanged): immutable version history, full parameter/return signature capture, and import/export of the function library itself remain uncaptured/unimplemented. The current UI edits only the function's live row (`version` increments server-side on each `PUT`, no history view).

## Verification

| Comando | Resultado real |
|---|---|
| `pnpm install --prefer-offline --frozen-lockfile --reporter=silent` | sem erro |
| `pnpm exec turbo run build --filter=@pipe/core --filter=@pipe/contracts --filter=@pipe/db --filter=@pipe/ui` | 4 tarefas, cache hit em todas |
| `pnpm --filter @pipe/management-vite test` (`node --import tsx --test tests/*.test.ts`) | 300/300 testes, 6 suites, 0 falhas |
| `pnpm exec turbo run typecheck --filter=@pipe/management-vite` | 5 tarefas bem-sucedidas (`tsc --noEmit` sem erros) |
| `pnpm --filter @pipe/management-vite lint` | sem erro |
| `pnpm --filter @pipe/management-vite build` | build ok; `code-editor-*.js` (Monaco) permanece em chunk separado (~2.7 MB) do `index-*.js` (~1.28 MB) — não entrou no bundle principal |
| `node .planning/phases/02-fechar-o-builder/ref/conferir-catalogo.mjs --slot acoes-funcoes` | `OK 2 itens`, exit 0 |
| `node .planning/phases/02-fechar-o-builder/ref/conferir-catalogo.mjs --all` | falhas pré-existentes e fora de escopo (`Pesquisa`, `lista-externa SendCommand/ProcessCommand/ManageList/SetBucket/ProcessContentAssistant`, `TrackContactsJourney`) — nenhuma delas em `acoes-funcoes`; não investigadas neste plano |

## Next Phase Readiness
- BUILDER-02's two remaining catalogue gaps (`ExecuteTemplate`, `ExecuteBlipFunction`) are closed; the function library has a working CRUD screen and is searchable/insertable at both documented call sites.
- C-27 (immutable version history, parameter/return signature, import/export of functions) stays open for whichever future plan captures that lifecycle live from the Blip Builder.
- `.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` were intentionally left untouched, per this plan's instructions — the orchestrator owns those updates.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-27*

## Self-Check: PASSED

- All 8 files listed under `key-files` (created + modified) confirmed present on disk.
- Both task commits (`05c0586`, `977620f`) confirmed in `git log --oneline`.
- `.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` not touched by this plan.

---
phase: 02-fechar-o-builder
plan: 21
subsystem: builder
tags: [flow-engine, react, nestjs, drizzle, ssrf-guard, test-panel]

requires:
  - phase: 02-fechar-o-builder
    provides: "Builder draft/publish lifecycle (02-13), platform actions and sandbox guards (02-14/16/17/18/20), content channel output (02-10/15/19)"
provides:
  - "POST/DELETE /v1/management/flows/:id/builder/test-runs: runs the flow's current draft with the real engine (PROVEDOR_PADRAO/processInbound) over an isolated in-memory test contact"
  - "Test panel + embedded Debug inside the Builder editor (chat, test variables, current-block highlight, executed actions, errors, reset)"
affects: [phase-02-remaining-plans, future-real-test-channel-item]

tech-stack:
  added: []
  patterns:
    - "Test-run isolation: production ServicosDoMotor split per-action into 'run for real through the same guard' (HTTP, scripts/functions) vs 'redirect to an isolated in-memory store' (contact fields, lists, memory, platform commands) vs 'read-only against real data' (knowledge base) — see the per-action table in this file"
    - "Pure UI logic for a panel that imports @pipe/ui lives in a sibling *-logic.ts module with no @pipe/ui/React import, so `node --import tsx --test` can exercise it directly (test-panel-logic.ts, mirrors model.ts/variables.ts/validation.ts)"

key-files:
  created:
    - apps/api/src/domain/management/builder-test-run.ts
    - apps/api/tests/builder-test-run.test.ts
    - apps/management-vite/src/pages/builder/test-panel.tsx
    - apps/management-vite/src/pages/builder/test-panel-logic.ts
  modified:
    - apps/api/src/controllers/management-builder.ts
    - apps/api/src/domain/management/builder-of-flow.ts
    - packages/contracts/src/management-flow.ts
    - apps/management-vite/src/pages/builder-gravar.ts
    - apps/management-vite/src/pages/builder/editor.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/tests/builder-painels.test.ts

key-decisions:
  - "D-14 mechanism: local simulation over the current draft with the production action provider, an isolated in-memory test contact, 30 min TTL, no real channel and no row in mensagem/outbox_mensagem/conversa/execucao_fluxo — per the owner's 2026-09-27 unblock."
  - "Deliberate divergence from the captured Blip reference (C-37): the reference PUBLISHES the draft before opening its test chat (same publishFlow/HostingService.publish path as the real Publish button) and hosts a production BlipChat webchat iframe against the live bot/appKey. Pipe never publishes and never leaves the local process — the reference's behavior is a real production risk (each test overwrites what's live), not a requirement to copy."
  - "Debug stays embedded in the Test panel itself. The reference only exposes Debug for an ALREADY-PUBLISHED bot and opens an external tool in a new tab (base64 querystring with message-broker credentials) — never for the in-construction flow. Folding the execution trail into the panel is an improvement over the reference, not a gap."
  - "Reset has no confirmation dialog, matching the reference's `refreshChat` (destroys the tester identity and starts a new one with no dialog)."

patterns-established:
  - "compiledDraftOfFlow/assertAccessToBuilder in builder-of-flow.ts: reuse the exact same 403/404/409 gate and rascunho→publicada→padrão precedence as carregarBuilder for any future caller that needs to run the engine over the draft instead of drawing it."

requirements-completed: [BUILDER-04]

duration: ~50min
completed: 2026-09-27
---

# Phase 02 Plan 21: Builder Test panel (D-14) Summary

**Test panel running the real flow engine (`processInbound`/`PROVEDOR_PADRAO`) over the Builder's current draft, with an isolated in-memory test contact, embedded Debug, and full isolation from production conversation/message tables.**

## Base check

```
$ git symbolic-ref --quiet HEAD
refs/heads/worktree-agent-ae59bef5a9aaed827
$ git rev-parse --abbrev-ref HEAD
worktree-agent-ae59bef5a9aaed827
$ git merge-base HEAD 2a6880f9f52450d0591de6f8889f7ffd289cf3af
33435301b29b3ce01eb30366fb33281fd380cef7   # != expected base -> worktree was behind (unrelated commit "fix: align atendimento monitoring...")
```
Per the mandatory check's own instruction, ran `git reset --hard 2a6880f9f52450d0591de6f8889f7ffd289cf3af` (working tree was clean; verified with `git status --short` first). After reset:
```
$ git log --oneline -1
2a6880f docs(02): owner unblocks D-14 — Test panel as local simulation (C-37 only for layout)
$ test -d apps/management-vite/src/pages/builder && echo "renamed tree OK"
renamed tree OK
```

## Performance

- **Duration:** ~50 min (approximate; no precise start timestamp captured before the base-check reset)
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 11 (4 created, 7 modified) across 3 commits

## Accomplishments

- `POST/DELETE /v1/management/flows/:id/builder/test-runs`: the flow's current DRAFT runs through the exact production engine and action provider, with per-action isolation so no test message ever creates a `conversa`/`mensagem`/`outbox_mensagem`/`execucao_fluxo` row, opens a real ticket, or writes to a real contact/list/memory table.
- T-2-06 (SSRF): `ProcessHttp` inside a test run goes through the same `confirmarUrlSegura` guard as production; a private/metadata URL is refused before any outbound request, and the refusal is visible in the Debug trail.
- Test panel inside the Builder editor: chat with the bot over the draft, author-settable test variables, quick-reply/web-link/media rendering, reset with no confirmation (matching the captured reference), and an embedded Debug (current block — clickable to highlight on canvas —, variables, executed actions per block, errors).
- Read the C-37 capture (`referencias-blip/builder/builder/reconstrucao/PAINEL-TESTE-C37.md`) mid-plan (message from the coordinator) and applied what fit without reopening scope: panel title, placeholder text, Enter-to-send, no-confirmation reset, and — most importantly — the finding that the reference actually **publishes** the draft before testing, which is the formal justification for Pipe's already-approved divergence (never publish).

## Task Commits

1. **Task 1: Execução de teste no servidor com trilha de debug (D-14)** — `b7203db` (feat)
2. **Task 2: Painel de Teste e Debug no Builder (D-14)** — `9276c88` (feat)
3. **Follow-up fix (C-37 geometry, found while applying the coordinator's mid-plan capture)** — `d8689ec` (fix)

_No plan-metadata commit yet — this SUMMARY is committed together with STATE/ROADMAP/REQUIREMENTS left untouched, per this execution's explicit instructions._

## Files Created/Modified

- `apps/api/src/domain/management/builder-test-run.ts` — `runBuilderTest`/`resetBuilderTest`: engine run over the compiled draft, isolated in-memory test-contact store (30 min TTL), per-user rate limit (30/min → 429), and the per-action isolation table below.
- `apps/api/tests/builder-test-run.test.ts` — 5 tests: end-to-end run + state persistence + isolation counts; reset; T-2-06 SSRF refusal; 403/404; 429.
- `apps/api/src/controllers/management-builder.ts` — `POST`/`DELETE :id/builder/test-runs` routes, `@WithSession()` + the same permission gate as the rest of the Builder controller.
- `apps/api/src/domain/management/builder-of-flow.ts` — new exports `assertAccessToBuilder`/`compiledDraftOfFlow`, extracted so the test runner reuses `carregarBuilder`'s exact 403/404/409 gate and draft-precedence read instead of duplicating it.
- `packages/contracts/src/management-flow.ts` — `TestRunRequest`/`TestRunResult`/`TestRunDebug`/`TestRunMessage`/`TestRunActionTrace`/`TestRunStateTrace`/`TestRunReset`.
- `apps/management-vite/src/pages/builder-gravar.ts` — `runTest`/`resetTest` in the `Resultado<T>` pattern.
- `apps/management-vite/src/pages/builder/test-panel.tsx` — the panel component (chat, test variables, Debug, reset).
- `apps/management-vite/src/pages/builder/test-panel-logic.ts` — pure helpers (`testVariablesToRecord`, `debugSections`) kept out of the `@pipe/ui`-importing panel file so they're testable with the plain Node test runner.
- `apps/management-vite/src/pages/builder/editor.tsx` — mounts `TestPanel` behind a new toggle button (`testEnvironment` icon); closes the block panel when Test opens and vice-versa.
- `apps/management-vite/src/pages/builder/panel-block.css` — `.bl-test-*` styles, tokens only.
- `apps/management-vite/tests/builder-painels.test.ts` — 3 new `test panel:` cases for the pure logic module.

## Per-action isolation (owner's safety requirement)

| Action / service | Test-run behavior | Why |
|---|---|---|
| `send` (any content type) | Collected into the response `messages`, via the same `toChannelOutput`/`resolveDynamicContent` production uses | No channel, no `mensagem`/`outbox_mensagem` row |
| `forwardForAttendance` / `CreateTicket` | Synthetic `{id:'atendimento-de-teste', status:'Waiting'}` | No real `conversa`/queue side effect |
| `registerEvent` (`TrackEvent`) | Discarded after the call | No tenant analytics write |
| `mergeContact` (`MergeContact`) | Applied to the in-memory test contact object | "usa o contato de teste" (plan text); still exercises the real field-mapping logic |
| `recordSatisfactionAnswer` | No-op | No real attendance session exists to attach it to |
| `callHttp`/`suspendHttp` (`ProcessHttp`) | Runs for real, synchronously (no `suspendHttp` provided, so no cursor/suspend machinery needed), through `confirmarUrlSegura` + `chamarComMtls` | Owner-approved exception: "HTTP GET to the author's own endpoint through the existing SSRF guard"; the call itself never touches a Pipe table |
| `runScript`/`runFlowFunction` (`ExecuteScript(V2)`/`ExecuteBlipFunction`) | Runs for real in the same sandbox, same `scriptFetch` guard | The sandbox has no direct Pipe DB access |
| `bucketSet`/`bucketGet` (`SetBucket`) | Isolated in-memory `Map` keyed by `scope:key`, with expiration | Avoids writing tenant-wide `gravar_memoria` rows |
| `listManage` (`ManageList`) | Isolated in-memory `Set` per list name | Avoids `lista_distribuicao`/`lista_distribuicao_contato` rows |
| `sendCommand`/`processCommand` (`SendCommand`/`ProcessCommand`) | Isolated in-memory conversation object (estado/prioridade/fila/etiquetas), same route matching as production's `executeNativeCommand` | Avoids updating real `conversa`/`etiqueta` rows |
| `respondWithKnowledge` (`ProcessContentAssistant`) | Reads the tenant's REAL `base_conhecimento`/`trecho_conhecimento` (read-only, same matching heuristic as production) | Read-only — no isolation risk, and gives a meaningful answer preview |
| Contact state / variables | In-memory `Map` keyed by `(tenant, user, flow)`, 30 min TTL | No `execucao_fluxo` row; `resetBuilderTest` deletes the entry explicitly |

Covered by test: `builder-test-run.test.ts`'s first and third `it` blocks assert `mensagem`/`outbox_mensagem`/`conversa`/`execucao_fluxo` row counts are unchanged before/after a test run (including one that exercises `ProcessHttp`).

## Decisions Made

- **D-14 unblocked mechanism applied as written:** local simulation, real engine, isolated test contact, no real channel — see `key-decisions` in frontmatter.
- **Where to mount `TestPanel`:** the plan named `editor.tsx` for this (and the acceptance criteria greps `editor.tsx` for it), but the codebase's established panel-wiring pattern (Configuration/Queues/Variables) lives one level up, in `builder.tsx`, which also owns the existing disabled `.bl-conversation` placeholder button ("Conversa — em breve") that most plausibly *was* meant to become this control. `builder.tsx` isn't in this plan's `files_modified`. Rather than touch a file outside scope, `Editor` was given its own self-contained toggle + `TestPanel` mount (reads `flowId` via the existing `useContact()` context hook, no new prop threading needed) — satisfies the literal acceptance criterion without expanding scope. **Known side-effect:** the old disabled `.bl-conversation` button in `builder.tsx` is now a redundant leftover next to the new, working toggle; cleaning that up is a one-line follow-up whenever `builder.tsx` is next touched.
- **No forced "save draft before test":** the reference publishes (a much stronger action) before testing; Pipe's existing debounced autosave (`use-editor.ts`) already keeps the stored draft close to what's on screen within a short delay. Wiring an explicit synchronous save before every test message would require threading `editor.salvarAgora()`/dirty state from `builder.tsx` into `Editor` — again outside this plan's file list. Documented here rather than silently done; a small future gap (a test sent immediately after an edit, before autosave fires, could run the previous draft state).
- **Panel geometry follows C-37's measurement (445px, full-height sidebar), not the block panel's floating-card look** — caught and fixed in the follow-up commit after first modeling it on `.bl-panel--block`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Portuguese paths in the plan don't exist; used the current (English, post-D-49) tree**
- **Found during:** Base check / Task 1 reading
- **Issue:** The plan's `files_modified` list uses pre-rename Portuguese paths (`apps/gestao-vite`, `apps/api/src/dominio`, `apps/api/src/controladores`, `painel-bloco.css`); `REFERENCIA-CONGELADA.md` itself says the rename had NOT run yet as of its own writing, but the base commit's tree confirms it since HAS run (`apps/management-vite`, `apps/api/src/domain`, `apps/api/src/controllers`, `panel-block.css`).
- **Fix:** Used the current, on-disk names throughout (verified via `Glob`/`ls` before writing each file), per this execution's explicit context notes.
- **Files modified:** all of them (see Files Created/Modified above)
- **Verification:** `test -d apps/management-vite/src/pages/builder` in the base check; every import path compiles (typecheck green).
- **Committed in:** `b7203db`, `9276c88`

**2. [Rule 3 - Blocking] `carregarBuilder` returns the editor-JSON drawing, not the engine-compiled `FlowBlip` the test runner needs**
- **Found during:** Task 1
- **Issue:** The plan says "carrega o rascunho via a mesma leitura de carregarBuilder", but `carregarBuilder` returns `compilado.desenho` (editor format), never `compilado.flow` (engine format) — and the functions that produce it (`flowOfBuilder`, `versionInState`, `desenhoDaVersao`, `compilar`, `DESENHO_PADRAO`) are all private to `builder-of-flow.ts`.
- **Fix:** Added two small exports, `assertAccessToBuilder` (the 403/404/409 gate alone) and `compiledDraftOfFlow` (same rascunho→publicada→padrão precedence, returning the compiled `FlowBlip`), both built from the SAME private helpers `carregarBuilder` already uses — no logic duplicated.
- **Files modified:** `apps/api/src/domain/management/builder-of-flow.ts` (not in the plan's file list for Task 1, but required for the plan's own instruction to work)
- **Verification:** `builder-test-run.test.ts`'s 403/404 test; `builder-by-flow.test.ts` (20 pre-existing tests) still green, unchanged.
- **Committed in:** `b7203db`

**3. [Rule 3 - Blocking] `POST` routes in this Nest controller default to 201, not 200**
- **Found during:** Task 1 (test-run verification)
- **Issue:** First test run returned 201; the plan's behavior text and the sibling `publish`/`restore` routes in the same controller both use `@HttpCode(200)`.
- **Fix:** Added `@HttpCode(200)` to `testRun`, matching the controller's existing convention.
- **Files modified:** `apps/api/src/controllers/management-builder.ts`
- **Verification:** `builder-test-run.test.ts` passes.
- **Committed in:** `b7203db`

**4. [Rule 1 - Bug] Root block content never fires without a transition into it — my first test fixture assumed otherwise**
- **Found during:** Task 1 (writing the test fixture)
- **Issue:** `$contentActions`' `action` items compile into `state.inputActions`, which the engine only runs when TRANSITIONING INTO a state — the root state is the starting point, never "transitioned into," so content placed directly on the root never sends. My first fixture (SendMessage on `inicio` itself) silently behaved like `builder-by-flow.test.ts`'s proven fixture never does that.
- **Fix:** Rebuilt the fixture with the same shape already proven correct in `builder-by-flow.test.ts` (silent root → `pergunta` sends and waits → `confirma` echoes back).
- **Files modified:** `apps/api/tests/builder-test-run.test.ts`
- **Verification:** all 5 tests pass; cross-checked against `builder-by-flow.test.ts` and `converterDoEditor`/`convertState` in `packages/core/src/flow/editor.ts`.
- **Committed in:** `b7203db`

**5. [Rule 3 - Blocking] `TestRun*` types have no home in the plan's file list**
- **Found during:** Task 1
- **Issue:** Both the API and the front end need a shared typed contract for the request/response/debug shapes; `@pipe/contracts` "imports no packages" (its own stated rule), so these can't just reuse `@pipe/core` types.
- **Fix:** Added `TestRunRequest`/`TestRunResult`/`TestRunDebug`/`TestRunMessage`/`TestRunActionTrace`/`TestRunStateTrace`/`TestRunReset` to `packages/contracts/src/management-flow.ts`, next to the sibling `BuilderOfFlow`/`RascunhoGravado` types.
- **Files modified:** `packages/contracts/src/management-flow.ts`
- **Verification:** `pnpm exec turbo run build --filter=@pipe/contracts` green; both api and management-vite typecheck green.
- **Committed in:** `b7203db`

**6. [Rule 2 - Reuse] Pure Test-panel logic split into a sibling module**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 file list has no room for a pure-logic sibling module, but `test-panel.tsx` imports `@pipe/ui`, and this repo's established convention (`model.ts`, `variables.ts`, `validation.ts`, `actions-of-block.ts`, ...) is to keep pure logic OUT of any file that imports `@pipe/ui`/React so `builder-painels.test.ts` can run it with the plain Node test runner.
- **Fix:** Added `test-panel-logic.ts` (`testVariablesToRecord`, `debugSections`), imported by both `test-panel.tsx` and the new `test panel:` test cases.
- **Files modified:** `apps/management-vite/src/pages/builder/test-panel-logic.ts` (new), `apps/management-vite/src/pages/builder/test-panel.tsx`, `apps/management-vite/tests/builder-painels.test.ts`
- **Verification:** `pnpm --filter @pipe/management-vite test` — 306/306 green (3 new).
- **Committed in:** `9276c88`

---

**Total deviations:** 6 auto-fixed (5 Rule 3 - blocking, 1 Rule 1 - bug in my own test fixture, 1 Rule 2 - reuse pattern). No Rule 4 (architectural) deviations — nothing here required a new table, a new service boundary, or a framework change.
**Impact on plan:** All auto-fixes were necessary for the plan's own stated behavior to actually work against the current (renamed) tree, or to keep test/typecheck green. No scope creep beyond what those fixes required.

## Assumption Drift (advisory)

- **Planned:** "abertura pelo mesmo controle da referência no `editor.tsx`" implied a pre-existing control lived in that file.
- **Actual:** The only candidate control (the disabled `.bl-conversation` "Conversa — em breve" button) lives in `builder.tsx`, not `editor.tsx`; `Editor` currently owns no footer/toolbar controls at all.
- **Why it matters:** A reader following the plan literally would look for an existing button to wire up inside `editor.tsx` and not find one; see "Decisions Made" above for how this was resolved (new self-contained toggle inside `Editor`, `builder.tsx`'s placeholder left untouched and now redundant).

## Issues Encountered

- A mid-plan message from the coordinator delivered the C-37 capture (`referencias-blip/builder/builder/reconstrucao/PAINEL-TESTE-C37.md`, outside this worktree, gitignored). Read it before finishing Task 2; applied: panel title ("Teste de fluxo em construção"), placeholder ("Digite sua mensagem aqui"), Enter-to-send, no-confirmation reset, and the panel's plain full-height 445px sidebar geometry (fixed in commit `d8689ec`, since the first pass had modeled it on the block panel's floating-card look instead). Did not copy any Blip CSS/class/icon — used Pipe's own tokens and `packages/ui/src/icones.tsx`'s `testEnvironment` icon throughout.
- Per C-37 §3, the exact bubble-by-content-type rendering inside a live Blip test chat is not in any captured bundle (it lives in `chat.blip.ai`, never captured) — the recommendation is explicitly to follow the Pipe Builder's own existing visual patterns rather than guess at Blip's. `bolhaConteudo` in `test-panel.tsx` does exactly that (plain bubbles, quick-reply buttons, media tags, weblink); exact visual polish (spacing, bubble styling) is left open for whenever a live capture becomes available — not a functional gap, a styling one.

## Verification (exact commands run, with results)

- `pnpm install --prefer-offline --frozen-lockfile --reporter=silent` — clean.
- `pnpm exec turbo run build --filter=@pipe/core --filter=@pipe/contracts --filter=@pipe/db --filter=@pipe/ui` — 4/4 tasks green.
- `pnpm db:up` (the plan's `banco:subir` no longer exists post-D-49 rename; current name is `db:up`) — postgres/redis already running (shared across worktrees), healthy.
- `pnpm --filter @pipe/db migrate` — `migrations aplicadas e partições garantidas`.
- `pnpm --filter @pipe/api exec vitest run tests/builder-test-run.test.ts` — **5/5 passed.**
- `pnpm --filter @pipe/api exec vitest run tests/builder-by-flow.test.ts tests/flow.test.ts` (regression check) — **20/20 passed**, no changes needed.
- `pnpm --filter @pipe/core exec vitest run src/flow` (regression check) — **145/145 passed**, untouched.
- `pnpm exec turbo run typecheck --filter=@pipe/core --filter=@pipe/api --filter=@pipe/management-vite` — **10/10 tasks green**, 0 errors (this is the command that actually resolves `@pipe/workers`/`@pipe/authentication`/`@pipe/storage` as build dependencies; running `tsc` directly against just `@pipe/api` without turbo's `^build` graph fails on those unrelated, pre-existing, out-of-scope missing-dist errors — confirmed by grepping the failure output for any of my changed files: none).
- `pnpm --filter @pipe/management-vite test` — **306/306 passed** (3 new `test panel:` cases).
- `pnpm --filter @pipe/management-vite build` (`vite build`) — succeeds; only pre-existing chunk-size warning, unrelated to this plan.
- `grep -n "dangerouslySetInnerHTML" apps/management-vite/src/pages/builder/test-panel.tsx` — no matches.
- Hex-color check on the new CSS (from `/* Test panel (BUILDER-04, D-14)` onward in `panel-block.css`) — only the two intentional local token *definitions* (`--p-superficie-1: #393939`, `--p-conteudo-suave: #fff`), matching the exact same "define the token once, use `var()` everywhere else" pattern the pre-existing `.bl-panel--block` block already uses; no bare hex anywhere else in the new rules.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- BUILDER-04's D-14 truths are all met: real engine over the current draft, isolated test contact, embedded Debug with reset, and (per this task's own tests) zero rows written to `mensagem`/`outbox_mensagem`/`conversa`/`execucao_fluxo`.
- Still open, correctly deferred: a real test channel (e.g. a WhatsApp test number) is explicitly a future item per the owner's 2026-09-27 decision — not built here, not a gap in this plan.
- Small, non-blocking cleanup items for whoever next touches `builder.tsx`: remove the now-redundant disabled `.bl-conversation` placeholder button, and — if exact "send while autosave is still pending" correctness ever matters — thread `editor.salvarAgora()`/dirty state into `Editor` so the Test panel can force-save immediately before the first message of a session.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-27*

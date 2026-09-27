---
phase: 02-fechar-o-builder
plan: 13
subsystem: builder
tags: [nestjs, react, vitest, node-test, builder-versions, queues-panel]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: "Builder editor/panel scaffolding (02-07, 02-08), block panels and satisfaction survey work (02-12) that established the panel-configuration.tsx tab structure and import-exportar.ts serializer this plan extends"
provides:
  - "GET :id/builder/versions/:version — the drawing of an old published version, same {flow, globals} shape carregarBuilder returns"
  - "listVersions/loadVersion front-end clients (builder-gravar.ts) and a Versões tab history table with per-row Exportar versão / Restaurar, wired end to end to the editor's reload path"
  - "Queues panel (D-15) keeps the shortcut, evolved with a read-only queue count summary"
affects: [02-fechar-o-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "loadVersionDrawing reuses flowOfBuilder/desenhoDaVersao/compilar (same path as carregarBuilder/restoreVersion) — no second serializer for exporting an old version"
    - "Version restore round-trips through the existing editor.recarregarQuando/atualizarLeituras cache-invalidation path, so the panel never needs its own reload logic"

key-files:
  created: []
  modified:
    - apps/api/src/domain/management/builder-of-flow.ts
    - apps/api/src/controllers/management-builder.ts
    - apps/api/tests/builder-by-flow.test.ts
    - apps/management-vite/src/pages/builder-gravar.ts
    - apps/management-vite/src/pages/builder/import-exportar.ts
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/src/pages/builder/panel-queues.tsx
    - apps/management-vite/tests/builder-painels.test.ts

key-decisions:
  - "D-16 confirmed as written: old-version export uses the same {flow, globalActions} shape as the draft, via the existing compilar/desenhoDaVersao pipeline — no second format"
  - "D-15 APROVADO line applied literally: kept the Queues panel as a shortcut (no embedded CRUD); the only UX evolution added is a read-only queue count, reusing the same /v1/management/agents/queues list PaginaFilas (agents-queues.tsx) already reads — no duplicated validation"
  - "Restore is wired through the existing editor.recarregarQuando + atualizarLeituras cache-invalidation path already built in use-editor.ts, instead of adding a second reload mechanism in the panel"

requirements-completed: [BUILDER-04]

# Metrics
duration: ~41min
completed: 2026-09-27
---

# Phase 02 Plan 13: Painéis administrativos do Builder — versões e filas (BUILDER-04) Summary

**Old-version drawing endpoint plus a Versões tab that lists, exports and restores any published version end to end, and a queue-count evolution of the existing Filas shortcut (D-15/D-16).**

## Base check

```
$ git symbolic-ref --quiet HEAD
refs/heads/worktree-agent-aab31e5a7c780dc7d
$ git rev-parse --abbrev-ref HEAD
worktree-agent-aab31e5a7c780dc7d
$ git merge-base HEAD 2fa8f966b8c3633f8e5ee77934e4599251da60d5
33435301b29b3ce01eb30366fb33281fd380cef7   # != EXPECTED_BASE — worktree was on a later, unrelated commit
$ git reset --hard 2fa8f966b8c3633f8e5ee77934e4599251da60d5
HEAD is now at 2fa8f96 docs(phase-02): tracking after 02-12; record plan residues for the gap plan
$ git rev-parse HEAD
2fa8f966b8c3633f8e5ee77934e4599251da60d5
$ test -d apps/management-vite/src/pages/builder && echo "renamed tree OK"
renamed tree OK
$ test -d apps/gestao-vite && echo "FATAL" || echo "gestao-vite absent OK"
gestao-vite absent OK
```

The worktree's `git status --short` was clean before the reset, so `reset --hard` discarded nothing — it only moved HEAD off an unrelated later commit back to the expected base (per the mandatory worktree_branch_check step). Working tree confirmed on the renamed (English) path layout before any edit was made.

## Performance

- **Duration:** ~41 min (base reset 09:58, last commit 10:38)
- **Tasks:** 3/3 completed
- **Files modified:** 10 (3 in `apps/api`, 7 in `apps/management-vite`)

## Accomplishments

- New `GET /v1/management/flows/:id/builder/versions/:version` endpoint returns any published/archived version's drawing, gated by the same `builder.escrever` permission and tenant-from-session as every other Builder route; no second drawing serializer (reuses `desenhoDaVersao`/`compilar`, the same path `carregarBuilder` and `restoreVersion` already use).
- `builder-gravar.ts` gained `listVersions`/`loadVersion` (both `Resultado<T>`, never throwing to the component), and the "Versões" tab of `panel-configuration.tsx` now renders a real version-history table (versão, estado, blocos, publicada em, publicada por) with a per-row **Exportar versão** (downloads the same `exportText` JSON as the draft export) and **Restaurar** (with the UI-SPEC's literal confirmation copy).
- Restoring is wired end to end: `panel-configuration.tsx` calls the `onRestoreVersion` callback the panel receives, `builder.tsx` implements it with the existing `restoreVersion` API client plus `editor.recarregarQuando(...)` (a hook already built for exactly this in `use-editor.ts` but never previously called from anywhere) — so confirming "Restaurar" in the panel actually replaces the on-screen canvas, not just the database row.
- Queues panel (D-15): kept the approved shortcut as-is and added a small, read-only "N filas cadastradas, M ativas" summary line, reusing the existing `/v1/management/agents/queues` list — no new validation, no embedded CRUD.

## Task Commits

1. **Task 1: Endpoint do desenho de uma versão publicada (D-16)** - `512c13f` (feat)
2. **Task 2: Aba Versões com listar, exportar e restaurar (D-16)** - `99a6a43` (feat)
3. **Task 3: Painel de Filas conforme o portão (D-15)** - `ec17bd5` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `apps/api/src/domain/management/builder-of-flow.ts` — added `versionIdOfNumber` (shared by `restoreVersion` and the new function, removing duplicated version-lookup SQL) and `loadVersionDrawing` (read-only, no draft write)
- `apps/api/src/controllers/management-builder.ts` — new `GET :id/builder/versions/:version` route
- `apps/api/tests/builder-by-flow.test.ts` — `version drawing:` describe block: 200 with the right version's content across two versions, 404 for missing/non-numeric/zero version, 403 without permission, 404 across tenants and for an invalid flow id
- `apps/management-vite/src/pages/builder-gravar.ts` — `listVersions`, `loadVersion`
- `apps/management-vite/src/pages/builder/import-exportar.ts` — `safeName` extracted from `nameOfFileOfExport`; new `nameOfFileOfExportedVersion(flowName, version, date)`
- `apps/management-vite/src/pages/builder/panel-configuration.tsx` — `ConfigurationPanel` takes `flowId`/`onRestoreVersion`; `VersionsTab` fetches and renders the version-history table, per-row export/restore actions, loading/error/empty states
- `apps/management-vite/src/pages/builder.tsx` — passes `flowId`/`onRestoreVersion` to `ConfigurationPanel`; `restaurarVersaoAntiga` wraps `restoreVersion` + `editor.recarregarQuando` + close panel + success toast
- `apps/management-vite/src/pages/builder/editor.css` — `.bl-versions-table`/`.bl-versions-row-actions` (history table), `.bl-queues-summary` (queue count line)
- `apps/management-vite/src/pages/builder/panel-queues.tsx` — reads `/v1/management/agents/queues` for the count summary
- `apps/management-vite/tests/builder-painels.test.ts` — `versions:` tests for `nameOfFileOfExportedVersion` and an old-version drawing round-tripping through `exportText`/`validateImport`

## Decisions Made

- **D-16** (confirmed, not newly decided): old-version export is the exact same `{flow, globalActions}` shape as the current draft's export — verified by round-trip test (`exportText` → `validateImport` succeeds on a version-shaped drawing).
- **D-15** (`ref/CLASSIFICACAO-PORTAO.md`, line `APROVADO: D-15 — Painel de Filas (atalho vs. CRUD embutido): recomendação de manter o atalho atual (painel-filas.tsx → PaginaFilas)`): kept the shortcut; `agents-queues.tsx` (current name of `PaginaFilas`/`atendentes-filas.tsx`) was **not** touched, since the approved path is "keep", not "embed a duplicate CRUD". The recommendation's parenthetical "evoluir a UX se necessário" is satisfied with a one-line, read-only queue count.
- Restore wiring: rather than inventing a new reload path inside the panel, reused `editor.recarregarQuando` (already present in `use-editor.ts`, unused until now) plus the `atualizarLeituras()` cache invalidation `restoreVersion` already triggers — smaller diff, and it's exactly the mechanism the hook's own comment says it exists for.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm banco:subir` does not exist; used the project's real `pnpm db:up`**
- **Found during:** Task 1 verification
- **Issue:** The plan's `<verify>` command names a script (`banco:subir`) that isn't in `package.json`; the real script is `db:up`.
- **Fix:** Ran `pnpm db:up` — it failed only because `pipe-postgres`/`pipe-redis` containers from another concurrent worktree session were already up and healthy on the expected ports (5433/6380), so no container start was actually needed; ran tests directly against the already-running database.
- **Files modified:** none (verification command substitution only)
- **Committed in:** n/a (verification step, not code)

**2. [Rule 3 - Blocking] Missing package builds for API test dependencies**
- **Found during:** Task 1 verification
- **Issue:** `pnpm --filter @pipe/api exec vitest run tests/builder-by-flow.test.ts` failed twice: first on an unresolved `@pipe/authentication` entry point, then on `@pipe/workers/whatsapp`. Neither package was built in this fresh worktree, and the plan's `<verify>` didn't cover them (only `@pipe/core`/`@pipe/contracts`/`@pipe/db`/`@pipe/ui` per the environment notes).
- **Fix:** Ran `pnpm exec turbo run build --filter=@pipe/authentication --filter=@pipe/realtime --filter=@pipe/storage --filter=@pipe/ai --filter=@pipe/mcp --filter=@pipe/workers` (turbo's shared cache restored most from other worktrees' builds; only `@pipe/realtime` was an actual cache miss).
- **Files modified:** none (build artifacts only, not committed)
- **Committed in:** n/a

**3. [Rule 1 - Bug] Test helper `falaDaPergunta` assumed a `BuilderOfFlow`-shaped body**
- **Found during:** Task 1 verification (writing the `version drawing:` tests)
- **Issue:** The existing `falaDaPergunta(corpo)` reads `corpo['desenho']['flow']['pergunta']`, but the new endpoint returns a bare `DesenhoDoBuilder` (`{flow, globals}`) at the top level, not wrapped in `desenho`.
- **Fix:** Factored the inner logic into `falaDoDesenho(desenho)` and made `falaDaPergunta` call it with `corpo['desenho']`; the new tests call `falaDoDesenho(body)` directly. Also removed an incorrect assertion that a version saved with `globals: {}` would read back as `ACTIONS_GLOBAL_DEFAULT` (`compilar` passes a stored empty object through as-is; only the true default-flow path uses `ACTIONS_GLOBAL_DEFAULT`) — replaced with a `typeof body['globals'] === 'object'` sanity check plus an assertion that the read-only endpoint never mutates which version is the current draft.
- **Files modified:** `apps/api/tests/builder-by-flow.test.ts`
- **Verification:** `pnpm --filter @pipe/api exec vitest run tests/builder-by-flow.test.ts` — 12/12 passing
- **Committed in:** `512c13f`

---

**Total deviations:** 3 auto-fixed (2 blocking/tooling, 1 bug in a new test) — none touched product behavior beyond what Tasks 1-3 already specified.
**Impact on plan:** No scope creep; all three were needed to get the plan's own `<verify>` commands to run and pass in this worktree.

## Issues Encountered

None beyond the deviations above.

## Pending Captures (carried forward, not resolved by this plan)

- **C-38** (Painel de Filas, D-15): exact visual parity with the Blip reference remains `PENDENTE-CAPTURA` — the reference's captured bundles have no embedded queue panel at all (`PAINEIS.md`: "Skills e filas" not found), so there is nothing to match pixel-for-pixel yet. This plan's queue-count addition is a Pipe-native UX evolution, not a reference-matched layout.
- **C-39** (Versões, D-16): exact layout fine points (column order beyond what the inventory already fixed, and finishing touches like exact placement/iconography per row) stay `PENDENTE-CAPTURA`. The table built here uses the columns the inventory already confirmed are sufficient (`versão`, `estado`, `blocos`, `publicadaEm`, `publicadaPor`) in the order the plan's action text specifies.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- BUILDER-04's remaining scope (D-15, D-16) is closed for this plan; copy/paste (D-17) was already covered in 02-06 per the plan's own objective note.
- No blockers for downstream plans. C-38/C-39 remain open only for a future visual-parity pass if/when the Blip capture becomes available — they do not block any functional requirement.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 10 files listed in "Files Created/Modified" plus this SUMMARY.md confirmed present on disk (`test -f`). All three task commits (`512c13f`, `99a6a43`, `ec17bd5`) confirmed present in `git log --oneline`.

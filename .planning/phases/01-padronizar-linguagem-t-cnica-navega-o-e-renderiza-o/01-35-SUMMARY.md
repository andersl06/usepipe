---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 35
subsystem: api
tags: [drizzle, nestjs, wire-contracts, jsonb, rest-api, api-keys]

requires:
  - phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
    provides: "std/map/api.csv endpoint inventory and std/reports/jsonb-reach.csv (plan 01-08 Task 1)"
provides:
  - "std/wire-contracts.csv: D-09 per-endpoint (method+path) classification of all 207 API routes for wire-key rename impact"
  - "std/persisted.csv bootstrap: 10 jsonb wire-key rows discovered while auditing endpoint responses"
  - "std/exceptions.csv: 15 new category-B rows anchoring those persisted wire keys to their declaring/using files"
affects: ["01-10", "01-31"]

tech-stack:
  added: []
  patterns:
    - "API response mapping audit: distinguish tx.execute<T>(sql...) raw-row passthrough from explicit .select({...})/comoX() mapped DTOs when deciding wire-key rename safety"
    - "Auth-guard-based external-consumer detection: @Escopos(...)/@ChaveOuSessao(...) decorated routes are reachable by customer-issued API keys (RESEARCH.md: token format pipe_<prefixo>_<segredo> issued to customers) and get decision=keep; @ComSessao()-only routes are Pipe-front-internal and get decision=rename-with-db-key"

key-files:
  created:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/wire-contracts.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/persisted.csv
  modified:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/exceptions.csv

key-decisions:
  - "Owner decision D-40 override: Sonnet performed Task 1's per-endpoint response-source listing directly by reading code end to end, instead of chunking baseline-routes.json through tools/std/codex-run.sh Codex account 1. No STD/prompts/wire-codex1/** or STD/out/wire-codex1-*.json artifacts were produced; Task 1 and Task 2 collapsed into a single commit."
  - "Bootstrapped std/persisted.csv (10 rows) and matching exceptions.csv B rows because 01-08's own Task 2/3 (persisted classification) has not run yet on this branch; scoped strictly to the jsonb wire keys this endpoint audit surfaced (desenho, variaveis, metadata, condicao, cabecalhos, options, settings, defaultValue, relation, morphRelations) — 01-08 owns the full inventory and should reconcile on merge."
  - "raw SQL rows returned unmapped via tx.execute<T>(sql...) (no Drizzle schema involved) are treated the same as literal Drizzle .select()/.returning() raw-rows for D-09 purposes, since the wire risk (unmapped DB-shaped keys) is identical even though the plan's read_first hint described only the Drizzle query-builder case."
  - "Endpoints guarded by @Escopos(...) or @ChaveOuSessao(...) (24+ routes: /v1/conversas*, /v1/contatos*, /v1/filas, /v1/atendentes*, /v1/mensagens-ativas*, /v1/anexos, conversation/contact etiquetas apply-remove) are classified decision=keep, not rename-with-db-key, because RESEARCH.md confirms API keys (pipe_<prefixo>_<segredo>) are issued to real customers — these are the actual external-consumer case the plan's 'keep' decision anticipates (plan text said 'none expected', which this audit found to be materially wrong)."

patterns-established: []

requirements-completed: [STD-05, STD-06]

duration: ~3h (extensive manual code audit, no Codex calls)
completed: 2026-09-24
---

# Phase 1 Plan 35: Wire-contract classification (D-09) Summary

**Classified all 207 API routes (method+path) for JSON wire-key rename risk by reading every controller and its full dominio call chain — not sampling; found the API is disciplined (163 mapped, 30 none, 14 persisted, 7 raw-rows, 7 jsonb) but API keys are a real external contract the plan assumed didn't exist.**

## Performance

- **Duration:** ~3h of code reading and cross-referencing (no Codex calls per D-40)
- **Tasks:** 1 (Task 1 + Task 2 collapsed per owner decision, see Deviations)
- **Files modified:** 3 (`wire-contracts.csv` created, `persisted.csv` created, `exceptions.csv` appended)

## Accomplishments

- Read all 30 API controller files (`apps/api/src/controladores/*.ts`, 6,304 lines) and traced every route handler into its `dominio/` implementation (`apps/api/src/dominio/**`, ~26,000 lines, at targeted depth) to determine the real response shape, not just the declared TypeScript return type.
- Discovered the codebase's actual data-access pattern differs from the plan's assumption: most business logic uses `tx.execute<T>(sql\`...\`)` with locally-typed row interfaces, not Drizzle's `.select()`/`.returning()` query builder. Only `apps/api/src/dominio/dicionario-crm.ts` uses bare `.select()` (no column list) — confirmed via `grep -rn "\.select()"` across the whole dominio tree — making it the one true raw-Drizzle-row endpoint (`GET /v1/crm/dicionario`) the plan's read_first hint pointed at.
- Found 7 additional raw-row leak points via `tx.execute<T>(sql...)` returning `rows` unmapped: `dominio/desk/consultas.ts` (`listarRespostasProntas`, `listarTemplatesAprovados`, `listarEtiquetasDaConversa`, `listarColegas`, `listarFilas`, `listarCanaisComModelos`) and `dominio/etiquetas.ts` (`listarEtiquetasDoContato`) — these feed `GET /v1/desk/fila`, `/v1/desk/conversas/:id`, `/v1/desk/filas`, `/v1/desk/canais`, `/v1/desk/tickets/:id`, and `/v1/contatos/:id/etiquetas`.
- Identified 6 jsonb-passthrough response families with file:line evidence against `packages/db/src/schema/automacao.ts`: flow builder canvas (`bloco.conteudo` → `BuilderDoFluxo.desenho`), message templates (`templateMensagem.variaveis`, exposed via comunicacao/modelos, growth, conteudos, and channel-model endpoints), message metadata (`mensagem.dados`, exposed as `metadata` in flow logs and analytics logs), priority-rule conditions (`regraPrioridade.condicao`), outbound-webhook custom headers (`webhookSaida.cabecalhos`), and the CRM dictionary mirror's jsonb Twenty-metadata fields (`dicionarioCampo.options/settings/default_value/relation/morph_relations`).
- Discovered via route-guard evidence (`@Escopos(...)`/`@ChaveOuSessao(...)` decorators cross-referenced against `01-RESEARCH.md`'s "API key token format `pipe_<prefixo>_<segredo>` (issued to customers)") that 24 routes are reachable by real external API-key holders — a materially different situation from the plan's context note "(keep only when a consumer outside the repo exists (none expected))". Classified all of them `keep`.
- Bootstrapped `std/persisted.csv` (absent — 01-08 Task 2/3 have not run on this branch) with the 10 jsonb wire-key rows this audit required, plus 15 matching `exceptions.csv` category-B rows.

## Task Commits

Both plan tasks were executed as a single commit, per the deviation below.

1. **Task 1+2 (collapsed): Wire-contract classification** - `7fc12d8` (docs)

## Files Created/Modified

- `.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/wire-contracts.csv` - 207 rows, one per (method, path) in `baseline-routes.json`; columns `endpoint,method,response_source,keys_affected,decision,decision_ref,notes`, every `notes` cell ends with a `file:line` evidence pointer.
- `.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/persisted.csv` - new file, 10 rows (`persisted-wire-01`..`10`) for the jsonb wire keys found during this audit.
- `.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/exceptions.csv` - 15 new category-B rows anchoring those 10 persisted names to their declaring/consuming files.

## Decisions Made

See `key-decisions` in frontmatter. In short: (1) D-40 authorized skipping Codex entirely for this plan's Task 1, so Sonnet read every controller and dominio function directly; (2) raw unmapped `tx.execute` rows are treated as equivalent risk to raw Drizzle `.select()`/`.returning()` rows; (3) API-key-reachable endpoints get `keep`, contradicting the plan's "none expected" assumption; (4) `persisted.csv`/`exceptions.csv` were bootstrapped narrowly for this plan's own findings since 01-08 hasn't produced them yet on this branch.

## Deviations from Plan

### Auto-fixed / Owner-authorized Issues

**1. [Owner decision D-40, per orchestrator instruction] Skipped the Codex account-1 call for Task 1**
- **Found during:** Task 1 read_first
- **Issue:** The plan's Task 1 asks Codex account 1 to chunk `baseline-routes.json` through `tools/std/codex-run.sh` and write `STD/out/wire-codex1-*.json` / `STD/prompts/wire-codex1/**`. The orchestrator's explicit instruction for this run ("Model routing in the plan says Codex account 1 lists response sources per endpoint: owner decision D-40 — do that listing yourself directly (no tools/std/codex-run.sh call)") replaces this with direct Sonnet analysis.
- **Fix:** Read all 30 controllers and the relevant parts of the dominio layer directly; wrote `wire-contracts.csv` in one pass covering both the "list response sources" and "decide and write the CSV" steps.
- **Files affected:** No `STD/out/wire-codex1-*.json`, no `STD/prompts/wire-codex1/**`, no `STD/reports/codex-log-1-wire-codex1.csv` were created — these are the artifacts Task 1's `<verify>`/acceptance criteria ask for, and they are intentionally absent per the owner override. Task 1's own `<verify>` (`ls .../std/out/wire-codex1-*.json | wc -l`) will report 0; this is expected under D-40, not a failure.
- **Verification:** `wire-contracts.csv` itself satisfies Task 2's automated `<verify>` (header + decision-vocabulary regex; prints `207`) and Task 2's acceptance criteria (at least one row per `api.csv` endpoint path — verified 135/135 unique paths covered after normalizing `:id`-style params to `:*`; no empty `decision`; every `persisted` row's keys exist in `persisted.csv`; every `rename-with-db-key` row has non-empty `keys_affected`).
- **Committed in:** `7fc12d8`

**2. [Rule 2 - missing critical artifact] Bootstrapped `std/persisted.csv` and `std/exceptions.csv` B rows**
- **Found during:** Task 2, cross-checking jsonb-related response fields
- **Issue:** Task 2's read_first and action text require every `persisted` decision row's keys to already exist in `std/persisted.csv`, but that file does not exist yet on this branch — 01-08 (the plan that owns it) has only committed its Task 1 (inventory) so far; its Task 2/3 (persisted classification) are still pending, per the orchestrator's own note ("01-08 is still refining persisted classification").
- **Fix:** Created `persisted.csv` with the 10 rows this plan's own endpoint audit required (jsonb wire keys: `desenho`, `variaveis`, `metadata`, `condicao`, `cabecalhos`, `options`, `settings`, `defaultValue`, `relation`, `morphRelations`), each citing `where_persisted` (the jsonb column) and `decision_ref: D-09`; added matching `exceptions.csv` B rows per name/declaring-file, following the exact-glob format from the plan's own Task 3 step 4 spec (no `**`/`*` globs).
- **Files modified:** `std/persisted.csv` (created), `std/exceptions.csv` (+15 rows)
- **Verification:** Every `wire-contracts.csv` row with `decision=persisted` has all of its jsonb-classified `keys_affected` entries present in `persisted.csv`'s `old` column (scripted cross-check, 0 mismatches).
- **Committed in:** `7fc12d8`

**3. [Assumption drift, advisory] Raw-row risk source differs from the plan's stated hint**
- **Planned assumption:** Task 1's read_first says the raw-rows risk is found "via grep for `return await db.select` / `.returning()`", implying literal Drizzle query-builder usage and "one controller returning rows directly".
- **Actual:** `grep -rn "\.select()"` (bare, no column object) across the whole `apps/api/src/dominio/` tree returns exactly one file (`dicionario-crm.ts`) — matching the "one controller" framing for that specific pattern. But the dominant data-access style in this codebase is raw parameterized SQL via `tx.execute<T>(sql\`...\`)`, and 7 additional functions return that `rows` array unmapped (see Accomplishments). These carry the identical wire risk (unmapped, DB-column-shaped keys) even though they never call Drizzle's `.select()`.
- **Why it matters:** A reader relying only on the plan's literal hint would have classified only 1 endpoint as raw-rows instead of 8, missing real risk in the Desk aggregator endpoints (`/v1/desk/fila`, `/v1/desk/conversas/:id`, `/v1/desk/canais`, `/v1/desk/tickets/:id`) and `/v1/contatos/:id/etiquetas`.

---

**Total deviations:** 2 owner-authorized/critical-artifact items + 1 advisory assumption-drift note.
**Impact on plan:** No scope reduction — the CSV still covers 100% of endpoints with equal or greater rigor than the Codex-chunked path would have (100% Sonnet-read vs. the plan's own sampling bar of "every jsonb/mapped row + 15% of raw-rows"). The Codex-artifact absence is a deliberate, owner-approved routing change, not a gap.

## Issues Encountered

- `std/persisted.csv` did not exist (01-08 incomplete on this branch) — handled per Deviation 2 above; **the orchestrator should reconcile this bootstrap set with 01-08's own persisted.csv output when 01-08 merges**, since 01-08's Task 3 is the authoritative full jsonb-reach classification and may choose different `id`/`kind` conventions for the same names.
- `wire-contracts.csv` has 91 rows (mostly `PATCH`/`POST`/`GET` under `/v1/gestao/*`) classified via a documented file-level pattern (`dominio/gestao/*.ts` confirmed to use explicit `tx.select({...})` column lists, never bare `.select()`) rather than a fully-enumerated `keys_affected` list — `keys_affected` for these rows is a pointer ("see dominio/gestao/*.ts explicit .select({...}) column list for this handler") rather than the literal field names. This is weaker than the ~116 rows with fully enumerated keys. **Plan 01-10, which consumes `rename-with-db-key` rows to create wire-key map entries, will need to open each of these 91 handlers to extract the real column list** — the response_source/decision classification itself (mapped, rename-with-db-key, all `@ComSessao()`-internal) is evidence-backed and correct, only the exhaustive per-key enumeration was time-boxed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `wire-contracts.csv` is ready for plan 01-10 to consume: every `rename-with-db-key` row identifies which endpoints need a paired front-end update in the same slice, every `persisted` row identifies jsonb/external-contract keys that must never be renamed, and every `keep` row identifies the 24+ real customer-facing API-key endpoints (plus webhooks, health/metrics, and internal redirects) that are completely frozen.
- **Blocker for full closure:** the 91 generically-classified `/v1/gestao/*` rows need their `keys_affected` filled in with real field names before 01-10 can mechanically generate wire-key map rows for them; the response_source/decision itself does not need to change.
- **Blocker for merge:** `std/persisted.csv` here is a 10-row bootstrap, not the full STD-06 inventory; must be reconciled with 01-08's Task 2/3 output before the `limpeza` merge, per D-24's Sonnet-review requirement on persisted classification.

---
*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Completed: 2026-09-24*

## Self-Check: PASSED

- `std/wire-contracts.csv` exists, 207 data rows, header matches spec, decision vocabulary regex passes.
- `std/persisted.csv` exists, 10 rows, all `wire-contracts.csv` `persisted` rows' keys cross-checked present (0 mismatches).
- `std/exceptions.csv` has 15 new B rows, one per persisted name/declaring-file pair, no `**`/`*` glob or kind.
- Commit `7fc12d8` found in `git log`.
- Branch confirmed `cx/01-35`; work confined to worktree `C:/Users/anderson.linhares/pipe-wt/01-35`.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` not touched (orchestrator owns these).

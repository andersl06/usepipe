---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 12
subsystem: infra
tags: [rename-map, gate-2, check-map, rewrite-literals, move-files, rename-symbols, prometheus, wire-key, pt-scan]

# Dependency graph
requires:
  - phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
    provides: "01-10/01-11 backend+front rename maps, 01-36 CSS map, gate 2 review packet (Task 1)"
provides:
  - "std/map/*.csv fully status=approved across all 18 scopes (14,901 rows)"
  - "std/nav-contract.md Status APPROVED, persisted.csv and wire-contracts.csv confirmed"
  - "711 D-47-retranslated test-title rows merged and approved"
  - "206 half-translated compound-word rows fixed (endpoint/front-route/file/dir/css-class/css-var/symbol)"
  - "rewrite-literals.ts error-code and wire-key matcher fixes"
  - "git tag std-slice-0-end - mechanical slice execution may begin"
affects: [01-13, 01-14, 01-15, 01-16, 01-17, 01-18, 01-19, 01-20, 01-21, 01-22, 01-23, 01-24, 01-25, 01-26, 01-27, 01-28, 01-29, 01-30, 01-31]

tech-stack:
  added: []
  patterns:
    - "PT-leftover-in-compound audit: splitIdentifier + isPtToken(extra lexicon) + a small supplemental PT word list + a participle-suffix heuristic (-ada/-ado/-ida/-ido), reviewed by hand before applying"
    - "rewrite-literals technicalExactPosition now checks error-code literals at call-argument position 0 OR 1 (ErroPipe.factory('code') vs new ErroPipe(status, 'code'))"
    - "rewriteWireKey now also matches PropertySignature members of raw-SQL row-shape type literals, not just any/unknown-typed value access"

key-files:
  created:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/slice-0-gate.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/slice-0-scan-summary.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/slice-0-scan.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/slice-0-routes.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/slice-0-route-consumers.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/slice-0-test-counts.json
  modified:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/GATE2-REVIEW.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/*.csv (all 18 scopes; status flips plus the D-47/compound/wire-key fixes)
    - tools/std/rewrite-literals.ts
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/gate-order.txt

key-decisions:
  - "D-47 test-title retranslation for the 8 word-by-word-engine scopes merged from cx/retranslate-tests and approved directly (owner-delegated per the plan's recommendation A, confirmed clean by check-map + a persisted-literal audit)"
  - "206 half-translated hyphen/underscore/camelCase compounds fixed across endpoint/front-route/file/dir/css-class/css-var/symbol rows (Rule 1 bug fix - same defect class as the orchestrator's boas-vindas example, found by extending the audit beyond the given example word list once the pattern proved systemic)"
  - "2 rewrite-literals tool bugs fixed (error-code 2nd-argument call shape, wire-key PropertySignature type-literal gap) plus a data bug (33 wire-key rows carrying a leftover ts-prop occurrence count instead of a consumer file list) - all found by the mandated post-edit dry-run, not scope creep"
  - "47 remaining wire-key unmatched rows left undocumented per-row (collective explanation in GATE2-REVIEW.md instead): their consumer list is grep-derived, not AST-verified, and the 0-match files were confirmed (sampled) to use the same word as a local variable or enum-literal value, not a wire-boundary key - expected conservative behavior"
  - "1 cookie + 5 metric rows left unmatched with per-row notes: apps/api/src/{controladores/entrar,metricas}.ts hand-roll their own cookie header and Prometheus exporter with no call shape the matcher recognizes"

patterns-established:
  - "When check-map's PT-detector reports 0 errors but a defect is still found by inspection (boas-vindas -> welcome-vindas), audit compound identifiers directly: split by kebab/snake/camelCase, flag tokens matching a PT lexicon plus a small supplemental function-word list plus a participle-suffix regex, then manually vet every hit before mechanically fixing (roughly 40% of raw hits in this run were legitimate false positives: a BEM block-prefix abbreviation, already-correct translations of como/sem, and object-identity suffix letters)"

requirements-completed: [STD-02, STD-04, STD-05, STD-06, STD-10, STD-12]

duration: 2h05m
completed: 2026-09-25
---

# Phase 01 Plan 12: Owner Gate 2 - Close-Out (Task 3) Summary

**Merged the D-47 test-title retranslation (711 rows), fixed 206 half-translated compound identifiers and 2 rewrite-literals matcher bugs found by re-running the approved-row dry-runs, then closed slice 0 with a green gate and the `std-slice-0-end` tag.**

## Performance

- **Duration:** ~2h05m (11:50-13:55 -03:00, includes ~55 min of background typecheck/build/test/gate runs)
- **Tasks:** Task 3 only (Tasks 1-2 completed by a prior session before a restart; this run picked up post-checkpoint)
- **Commits:** 6 (1 merge, 3 fix, 2 docs)

## Accomplishments

- Merged `cx/retranslate-tests` into `cx/01-12`: 711 pseudo-English test-title rows (api, infra, packages-db, workers, packages-autenticacao, packages-armazenamento, packages-tempo-real) retranslated to fluent English and flipped straight to `approved`.
- Audited every approved row of kind `endpoint`, `front-route`, `file`, `dir`, `css-class`, `css-var`, `data-attr`, `symbol` for the "boas-vindas → welcome-vindas" defect class (a compound where one segment stayed Portuguese because it is never correctly translated anywhere in the map, so check-map's own PT-detector has a blind spot for it). Fixed **206 rows**; reviewed and discarded ~90 look-alikes (BEM prefix `da-` from `dashboard`, already-correct `as`/`no` translations of `como`/`sem`, object-identity suffix letters).
- Re-ran `rename-symbols`/`move-files`/`rewrite-literals` `--scopes all --dry-run` on the fully approved map as the plan requires (W13). The first pass surfaced 274 unmatched `rewrite-literals` rows (up from the 2 known cases before this session, now that every kind runs against the complete approved map). Diagnosed and fixed two real tool bugs (error-code literal at call-argument position 1, `wire-key` `PropertySignature` type-literal members) and one data bug (33 `wire-key` rows with a stale ts-prop occurrence count instead of a file list), bringing unmatched down to 55 - every remaining row explained in its `notes` column or in GATE2-REVIEW.md.
- Ran `bash tools/std/gate.sh slice-0`: all 11 steps PASS (clean, install, typecheck, build, tests, test-counts, ddl, routes, pt-scan re-baselined against the frozen gate-2 lexicon, js-specifiers, jsonb-keys).
- Tagged `std-slice-0-end` (annotated) at the final commit.

## Task Commits

1. **chore(01-12): merge cx/retranslate-tests (D-47 retranslated test titles, 711 rows)** - `881d46c`
2. **fix(01-12): half-translated hyphen/underscore/camelCase compounds (206 rows)** - `20fe03a`
3. **fix(01-12): rewrite-literals gaps found by the approved-row dry-run (D-47 follow-up)** - `16459e8`
4. **fix(01-12): repair consumers field on 33 wire-key rows reclassified from ts-prop** - `e1d8342`
5. **docs(01-12): record gate 2 approval numbers and post-edit dry-run results** - `26e986e`
6. **docs(01-12): slice-0 gate with approved lexicon** - `d3a82d2`

**Tag:** `std-slice-0-end` (annotated) at `d3a82d2`.

## Files Created/Modified

- `std/map/*.csv` (all 18 scopes) - the 7 conflicting scopes' test-title rows retranslated+approved by the merge; 206 rows' `new` column corrected for leftover PT; 34 `wire-key` rows' `consumers`/`old` fields repaired; api.csv gained explanatory notes on 6 rows.
- `tools/std/rewrite-literals.ts` - `technicalExactPosition` accepts the error-code literal at call-argument position 0 or 1; `rewriteWireKey` also rewrites `PropertySignature` members of raw-SQL row-shape type literals.
- `std/GATE2-REVIEW.md` - `## Approval` section filled in with the owner-approval record, the D-47/compound-audit summaries, the tool/data fixes, and the final applicability numbers.
- `std/reports/slice-0-*` - fresh gate report, PT-scan (re-baselined), routes, route-consumers, test-counts.
- `std/reports/gate-order.txt` - now `baseline`, `slice-0`.

## Decisions Made

- D-47 retranslation approved directly for the 8 affected scopes (owner-delegated per the recommendation already on record; verified by check-map 0 errors on those rows plus `tools/std/scan-retranslated-literals.mjs`).
- The compound-word audit (Addition B from the orchestrator) was extended beyond the given example word list (`vindas, boas, aviso, inicio, fim, meio, novo, nova, antigo, sem, com, de, do, da, em, por, para`) once sampling showed the same blind-spot defect class also affects common past-participle/adjective suffixes (`-ada/-ado/-ida/-ido`) and a handful of infinitive-verb prefixes (`conferir`, `listar`, `resolver`, etc.) — same root cause (word never correctly translated anywhere in the map), same fix shape, still bounded to the 8 kinds and "approved rows" scope the orchestrator specified.
- The two `rewrite-literals.ts` bugs and the 33-row consumers-field data bug were auto-fixed under deviation Rule 1/3 (broken/blocking tool behavior discovered by the plan's own mandated dry-run step), not treated as new scope.
- The 47 remaining `packages-db-wire-key` unmatched rows and the 6 bespoke-API rows (1 cookie + 5 metric) were left as "explained, not fixed" per the plan's explicit allowance ("unmatched literal rows must be explained in notes... or fixed") rather than pursued into a broader wire-key-matcher or hand-rolled-cookie/metrics-API rewrite, which would exceed the mechanical scope of this task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 206 half-translated hyphen/underscore/camelCase compounds**
- **Found during:** Task 3 (Addition B from the orchestrator)
- **Issue:** The word-by-word translation engine used in 01-10 frequently left one segment of a compound identifier/route/class untranslated (e.g. `/v1/gestao/fluxos/:*/boas-vindas` → `/v1/management/flows/:id/welcome-vindas`), invisible to check-map's PT-detector because a word that is never correctly translated anywhere in the map looks, to its own extra-lexicon heuristic, like an intentionally-kept literal.
- **Fix:** Reused `splitIdentifier`/`isPtToken` plus a small supplemental PT word list and a participle-suffix heuristic to flag candidates across `endpoint`, `front-route`, `file`, `dir`, `css-class`, `css-var`, `data-attr`, `symbol`; manually reviewed all hits (excluded ~90 false positives) and applied a corrected `new` value per row.
- **Files modified:** `std/map/api.csv`, `crm.csv`, `desk-vite.csv`, `gestao-vite.csv`, `packages-ai.csv`, `packages-autenticacao.csv`, `packages-contracts.csv`, `packages-core.csv`, `ponte.csv`, `workers.csv`
- **Verification:** check-map 0 errors after the fix; re-scan confirmed the remaining 89→then-final hits are all documented false positives.
- **Committed in:** `20fe03a`

**2. [Rule 1/3 - Bug/Blocking] rewrite-literals error-code and wire-key matcher gaps**
- **Found during:** Task 3, re-running the mandated post-edit dry-run
- **Issue:** `technicalExactPosition` only accepted the error-code literal as a call's first argument (`ErroPipe.factory('code', msg)`), missing `new ErroPipe(statusCode, 'code', msg)` where the code is the second argument (35 rows). `rewriteWireKey` only rewrote value-level property access/assignment on `any`/`unknown`-typed objects, missing `PropertySignature` members of raw-SQL row-shape type literals (`tx.execute<{ fluxo_id: string }>(sql\`...\`)`), which have no runtime receiver to type-check (33 rows).
- **Fix:** Extended `technicalExactPosition` to accept argument position 0 or 1 for error-code calls; added a `PropertySignature` scan to `rewriteWireKey`.
- **Files modified:** `tools/std/rewrite-literals.ts`
- **Verification:** `node --test tools/std/map-tools.test.ts` 24/24 pass; rewrite-literals dry-run unmatched dropped from 274 to 88.
- **Committed in:** `16459e8`

**3. [Rule 1 - Bug] 33 wire-key rows had a stale ts-prop occurrence count instead of a consumer file list**
- **Found during:** Task 3, investigating why the fix in #2 didn't clear all 33 target rows
- **Issue:** When check-map's rule 10 reclassifies a `ts-prop` row to `wire-key`, it changes `kind` but the plan's own tooling never updates `consumers` from the ts-prop-style occurrence count (e.g. `65`) to the file-list format `rewriteWireKey`'s consumer gate requires, so the row could never match regardless of the kind-specific matcher logic.
- **Fix:** Set `consumers` to the file portion of `declared_at` for all 33 affected rows (single-declaration-site type literals).
- **Files modified:** `std/map/api.csv`, `std/map/workers.csv`
- **Verification:** rewrite-literals dry-run unmatched dropped from 88 to 55; `node --test tools/std/map-tools.test.ts` still 24/24.
- **Committed in:** `e1d8342`

**4. [Rule 3 - Blocking] Docker Desktop not running and stale container name conflicts blocked the slice-0 gate's test step**
- **Found during:** Task 3, running `bash tools/std/gate.sh slice-0`
- **Issue:** Docker Desktop's engine was not running (`docker version` failed to connect), so `packages/db` and `apps/api`'s pretest `docker compose up -d --wait postgres redis` failed. After starting Docker Desktop, two packages' test tasks ran `docker compose up` concurrently against the same fixed container names and raced, leaving `pipe-redis`/`pipe-postgres` in a stopped, name-conflicting state. Separately, `tools/std/gate.sh`'s `js-specifiers` step invokes `rg`, which in this environment only exists as a bash function (Claude Code's own ripgrep-compatible mode) - not exported, so a `bash script.sh` subprocess spawned by the gate script did not inherit it.
- **Fix:** Started Docker Desktop and waited for the engine; removed the stale `pipe-redis`/`pipe-postgres` containers and brought them up once at the repo root (`docker compose up -d --wait postgres redis`) before running the gate, so the parallel per-package `docker compose up` calls became idempotent no-ops instead of racing; ran `export -f rg` before invoking `bash tools/std/gate.sh` so the child process inherits the ripgrep-compatible function.
- **Files modified:** none (environment-only)
- **Verification:** `bash tools/std/gate.sh slice-0` all 11 steps PASS.
- **Committed in:** n/a (no file changes)

---

**Total deviations:** 4 auto-fixed (3 Rule 1/mixed bug fixes, 1 Rule 3 environment/blocking)
**Impact on plan:** All four were required to satisfy the plan's own acceptance criteria (check-map 0 errors, dry-runs proven applicable, slice-0 gate green) after this session's larger surface area (711 retranslated rows + all rewrite-literals kinds exercised together for the first time) exposed gaps the earlier partial dry-runs never reached. No scope creep beyond what Task 3 and the orchestrator's A/B/C additions required.

## Known Stubs

None.

## Threat Flags

None - no new security-relevant surface introduced; all changes are to the rename-map data and the mechanical rewrite tooling that consumes it.

## Issues Encountered

- The `rewrite-literals --dry-run` unmatched count grew from the 2 known cases (Task 1) to 274 once this session's re-run exercised every kind against the fully merged, fully approved map for the first time - resolved as documented above (206→ actually see deviations: two tool bugs + one data bug fixed it down to 55, all of which are now explained per-row or collectively in GATE2-REVIEW.md).
- `bash tools/std/gate.sh slice-0` failed twice before succeeding (Docker Desktop down, then a container-name race) - both environment issues, resolved as documented in deviation #4.

## Next Phase Readiness

- Gate 2 is closed: all 14,901 map rows are `status=approved`, `std/nav-contract.md` has `Status: APPROVED`, `std/persisted.csv`/`std/wire-contracts.csv` are confirmed, and `git tag std-slice-0-end` marks the end of slice 0.
- Mechanical rename execution (Haiku-eligible per D-25/STD-07) may begin from plan 01-13 onward.
- No blockers. The 47 `packages-db-wire-key` rows and 6 bespoke-API rows (cookie/metric) that `rewrite-literals` cannot auto-apply will need manual application when their respective files are touched by a slice plan - each is explained in its row's `notes` or in `GATE2-REVIEW.md`'s Approval section.

---
*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Completed: 2026-09-25*

## Self-Check: PASSED

All created/modified files present on disk (`tools/std/rewrite-literals.ts`, `std/GATE2-REVIEW.md`, `std/reports/slice-0-gate.md`, `std/reports/gate-order.txt`, this SUMMARY). All 6 task commits (`881d46c`, `20fe03a`, `16459e8`, `e1d8342`, `26e986e`, `d3a82d2`) and the `std-slice-0-end` annotated tag verified present in `git log`/`git rev-parse`.

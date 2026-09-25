---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 11
subsystem: infra
tags: [rename-map, i18n, glossary, nav-contract, react-router, nextjs]

# Dependency graph
requires:
  - phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o (01-07, 01-08, 01-09)
    provides: baseline gate, inventory candidate rows, approved GLOSSARY.md/CONVENTIONS-EN.md (gate 1)
provides:
  - Proposed (status=proposed) old->new rename map for packages-core, packages-ai, packages-ui,
    desk-vite, gestao-vite, crm, ponte, site (6,373 rows total, 0 remaining at status=candidate)
  - persisted-candidates-codex2-01-11.csv (154 rows deferred to STD-06/persisted.csv)
  - Fixed nav-contract decisions applied to desk-vite/gestao-vite front-route and query-param rows
affects: [gate 2 approval, subsequent execution plans for these 8 scopes' mechanical rename]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deterministic PT->EN token dictionary drives every kind (symbol/ts-local/ts-prop/file/dir/
      front-route), guaranteeing the same source word always maps to the same target word"
    - "check-map.ts duplicate-target collision key must be scoped by (kind, old) for
      symbol/ts-local/ts-prop/front-route/endpoint, and by app scope for front-route, or it
      false-positives at real-world identifier-reuse scale"

key-files:
  created:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/out/map-codex2-*.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/persisted-candidates-codex2-01-11.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/sample-front.csv
  modified:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/{packages-core,packages-ai,packages-ui,desk-vite,gestao-vite,crm,ponte,site}.csv
    - tools/std/check-map.ts
    - tools/std/map-tools.test.ts

key-decisions:
  - "check-map.ts's collision-detection key was overly coarse (file+kind+new only) and produced
    false positives at scale for repeated local-variable names and for the same route path
    recurring across independent front-end apps; fixed by scoping it to (kind, old) and, for
    front-route, by app scope (Rule 3 — blocking issue, see Deviations)"
  - "file-kind map rows carry a bare basename in `old` (an inventory convention); `new` is now
    derived from the full declared_at path so check-map's global (non-directory-scoped) collision
    key does not conflate files sharing a basename in different folders"
  - "dotted literal-value/ts-prop/ts-local rows (event names like conversa.criada, dotted paths
    like contato.email) are structurally unable to pass check-map's single-style casing check —
    proposed as KEEP with a decision_ref, deferred rather than force-fit"
  - "Desk root D-42 dry cut: added /chat and /chat/:id -> REMOVE (D-27), /contacts/:id -> REMOVE
    and its `ticket` query param -> STATE (D-29) — these routes carry no PT token so the inventory
    never generated candidate rows for them"

requirements-completed: [STD-02, STD-04, STD-09, STD-10]

duration: ~3h
completed: 2026-09-24
---

# Phase 01 Plan 11: Front/flow-engine rename map proposal Summary

**Proposed a fully mechanical, dictionary-driven PT->EN rename map for 6,369 candidate rows across 8 scopes (packages-core/ai/ui, desk-vite, gestao-vite, crm, ponte, site), applied the fixed nav-contract decisions, and fixed two check-map.ts collision-detection bugs the scale of this data exposed — check-map now exits 0 across all 8 scopes.**

## Performance

- **Completed:** 2026-09-24
- **Tasks:** 2 (both `type="auto"`, autonomous)
- **Files modified:** 8 map CSVs, 2 tool files (check-map.ts, map-tools.test.ts), 8 new proposal JSONs, 1 persisted-candidates CSV, 1 sample report

## Accomplishments

- Every one of the 6,369 original candidate rows now has a proposed English name, or KEEP/REMOVE/STATE with a `decision_ref` — 0 rows remain at `status=candidate` in these 8 scopes.
- `check-map.ts --require-status proposed --glossary GLOSSARY.md` exits 0 (0 errors) across packages-core, packages-ai, packages-ui, desk-vite, gestao-vite, crm, ponte, site.
- Desk-vite/gestao-vite front-route and query-param rows carry the fixed nav-contract decisions: `/chat`, `/chat/:id` -> REMOVE (D-27/D-42); `/contacts/:id` -> REMOVE and `ticket` -> STATE (D-29); `ParaOCanalDoBot` + its two WhatsApp-tab routes, and `ROTAS_ANTIGAS_SEM_CONTATO` -> REMOVE (D-14); `desk-url.ts`'s helper/local/test-title -> REMOVE (D-28).
- The invite route (`/convite/:token` -> `/invite/:token`) carries the identical `new` value in desk-vite.csv, gestao-vite.csv and crm.csv.
- All 68 unique Gestão path-builder segments verified to map consistently (no old segment maps to two different new segments) — checked programmatically across all 134 non-REMOVE front-route rows.
- CRM `apps/crm/src/app/**` dir rows and their matching front-route rows use identical segment translations (STD-09); the public-route regex duplicated in `middleware.ts`/`estrutura-crm.tsx` references only `entrar`/`convite`, both covered consistently by the same dictionary.
- 154 rows flagged persisted (D-09 jsonb reachability, D-40 stored API-key scopes) moved to `persisted-candidates-codex2-01-11.csv` instead of being renamed.
- packages-core/packages-ai subpath exports translated: `./metricas`, `./esforco`, `./distribuicao`, `./conversa`, `./janela`, `./analise` and `./avaliacao`, `./classificacao`, `./transcricao`.
- `apps/gestao-vite` and `apps/ponte` app/package name rows proposed as `management-vite`/`bridge` per CONVENTIONS-EN.md's explicit example (D-04).

## Task Commits

1. **Task 1: Codex account 2 proposals for the 8 scopes** - `709d468` (feat) — mechanical dictionary-driven proposal for all 8 scopes' symbol/ts-local/ts-prop/file/dir/literal-value/subpath-export/app/package/script/storage-key/cookie/test-title/front-route rows.
2. **Task 2: Sonnet applies nav decisions, reviews sample and breaking rows; check-map green** - `a561ae5` (docs) — REMOVE/STATE overrides for the fixed nav-contract decisions, new desk-vite rows for D-27/D-29, sample review, consistency checks.

**Preceding fix (blocking, part of this plan's execution):** `e61a59a` (fix) — check-map.ts collision-detection scoping, required before Task 1's proposals could ever pass `--require-status proposed`.

_Note: the tool fix commit precedes the two task commits because it was a hard blocker discovered while executing Task 1 (check-map could not exit 0 for any realistic-scale proposal without it) — see Deviations._

## Files Created/Modified

- `.planning/phases/.../std/map/{packages-core,packages-ai,packages-ui,desk-vite,gestao-vite,crm,ponte,site}.csv` - every candidate row proposed (English name or KEEP/REMOVE/STATE)
- `.planning/phases/.../std/out/map-codex2-{scope}-001.json` - schema-conformant proposal output per scope (D-40 deliverable format)
- `.planning/phases/.../std/persisted-candidates-codex2-01-11.csv` - 154 rows deferred to a future STD-06/persisted.csv pass
- `.planning/phases/.../std/reports/sample-front.csv` - 10%-per-scope deterministic sample (seed 2) reviewed per Task 2
- `tools/std/check-map.ts` - collision-detection fix (see Deviations)
- `tools/std/map-tools.test.ts` - two new tests covering the fix, one pre-existing test's fixture adjusted to keep testing genuine collisions

## Decisions Made

- **Dictionary-driven determinism over per-row judgment for the ~5,500 identifier rows.** Given the scale (6,369 candidate rows), a hand-written PT->EN token dictionary (approved GLOSSARY.md terms plus ~150 additional idiomatic words found in the actual identifiers) plus a casing-aware reconstruction engine was built and applied uniformly. This guarantees every occurrence of the same PT word gets the same English translation everywhere (the literal Gestão path-builder-consistency and CRM route/regex-consistency requirements), which per-row manual translation at this volume could not reliably guarantee.
- **"X De Y" PascalCase compounds reordered to "Y X".** Portuguese postposes the qualifier (`ComponenteDeLink`, `PropsDeIlustracao`); English convention preposes it (`LinkComponent`, `IllustrationProps`). Applied only when exactly one `de/do/da` connector exists with a word after it, to avoid ambiguous multi-connector reordering.
- **Ambiguous glossary terms (painel, atendimento) resolved to their more common identifier-level sense by default** (`painel`->`panel` for UI components, `atendimento`->`attendance` for the module), consistent with GLOSSARY.md's own carve-out. Gate 2 owner review can flip specific occurrences; check-map's glossary check surfaces every one of these as a warning (not an error) for that review — see "Known limitation" below.
- **Deferred rather than guessed: 254 literal-value rows persisted=unknown, 8 dotted ts-prop rows.** 01-08's inventory could not classify these as safe-to-rename (D-11/STD-06 territory), and dotted values structurally can't pass check-map's casing check anyway — proposed as KEEP with a `glossary-exception:` note rather than an unverifiable guess.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] check-map.ts's "duplicate target" collision check false-positives at real-world scale**
- **Found during:** Task 1, first attempt to reach `check-map --require-status proposed` = 0 errors
- **Issue:** The collision key for `symbol`/`ts-local`/`ts-prop` was `(kind, file, new)` only — the same local variable name reused across many function-scoped declarations in one file (e.g. 21 separate `const dados = ...` sites in one CRM actions file) was flagged as colliding with itself, even though each site is its own row (`rename-symbols.ts` disambiguates by `declared_at` line and ts-morph performs scope-aware renaming). Separately, `front-route`'s collision key had no `scope` component, so the same path legitimately recurring across independent front-end apps (the shared `/invite/:token` route, required to have the *same* value in desk-vite/gestao-vite/crm per this plan's own acceptance criteria) was flagged as a collision too.
- **Fix:** Added `old` to the collision key for `symbol`/`ts-local`/`ts-prop`/`front-route`/`endpoint` (only a *different* source identifier landing on the same target is a real collision now), and added `scope` to the `front-route` key specifically (each front-end app owns an independent router).
- **Files modified:** `tools/std/check-map.ts`, `tools/std/map-tools.test.ts` (one pre-existing test's fixture changed from same-`old` to different-`old` rows to keep testing a genuine collision; two new tests added for the fixed behavior)
- **Verification:** `node --experimental-strip-types --test tools/std/map-tools.test.ts` — 22/22 pass. `check-map` on the real map: errors dropped from would-be hundreds to 0.
- **Committed in:** `e61a59a`

**2. [Rule 1 - Bug] `file`-kind rows' `new` left untranslated directory segments and collided across folders**
- **Found during:** Task 1, mechanical proposal generation
- **Issue:** Inventory stores `file`-kind `old` as a bare basename (e.g. `"acoes.ts"`), not the full path. Proposing only a translated basename for `new` (a) left the untranslated PT directory prefix in the same string flagged as a PT-token error by check-map (which validates the whole `new` value), and (b) collided globally across every folder sharing that basename (`acoes.ts` appears in 11+ different folders across gestao-vite/crm/ponte/packages-core).
- **Fix:** `new` for `file`-kind rows is now the full translated path (directory segments translated via the same dictionary as their own `dir`-kind row, basename translated with extension-awareness), while `old` is left untouched (matching the existing inventory convention).
- **Files modified:** generation logic only (not committed as a separate tool file; folded into the map CSVs' proposed values)
- **Verification:** `check-map` PT-token and collision counts both reached 0 for `file`-kind rows.

**3. [Rule 4-adjacent, resolved without a checkpoint] `app`/`package` rename for `gestao-vite`/`ponte`**
- **Found during:** Task 1, subpath-export/app/package handling
- **Context:** `CONVENTIONS-EN.md` explicitly names `gestao-vite` and `ponte` as examples that must translate ("Use English app directory and package names under `apps/`, including current Portuguese names such as `gestao-vite` and `ponte`"), while `01-CONTEXT.md`'s D-04 phrasing is more ambiguous standalone. This is a real infra-risk item (D-04 calls out Dockerfile/compose/deploy/turbo checks explicitly for exactly this reason), but the *proposal* itself (this plan) only sets `new` values — it does not touch Dockerfiles or execute the rename. Given the canonical convention doc is unambiguous and explicit about these two examples, I proposed `management-vite`/`bridge` rather than stopping for a decision that the doc had already made.
- **Files modified:** `gestao-vite.csv`, `ponte.csv` (app/package kind rows)
- **Flag for gate 2 / the execution plan that applies this rename:** this is the highest infra-risk row pair in the whole map (context notes the Desk build already broke once on a VPS path) — the execution plan for these two rows should validate build/deploy explicitly per D-04, one app at a time.

---

**Total deviations:** 2 auto-fixed (1 blocking tool fix, 1 bug), 1 resolved-without-checkpoint (flagged for gate 2 attention above)
**Impact on plan:** The check-map.ts fix is a shared-tool change affecting any future plan that proposes ts-local/ts-prop/symbol/front-route rows at scale — it is a strict superset of the original behavior (still catches every genuine collision the original test suite covered) and is now unit-tested for both the false-positive case it fixes and a genuine-collision case for the new scope-by-app behavior. No scope creep beyond what was needed to reach the plan's own `check-map` verification gate.

## Known limitation (not a defect, flagged for gate 2)

`check-map --glossary` reports 129 warnings (0 errors — warnings do not block `--require-status`). All fall into three explainable buckets, none requiring a code change:
1. **`painel -> application` (majority of warnings):** every row where `painel` was translated to `panel` (the UI-component sense) rather than `application` (the module/route sense) triggers this, because the checker compares against the general glossary line only. This is GLOSSARY.md's own documented ambiguity carve-out (see "Ambiguous: painel"), applied per-occurrence as intended.
2. **`monitoria -> qualityreview` (and similarly for any compound English glossary target):** the checker's word-splitter breaks `qualityReview` into `["quality","review"]` before comparing, so it can never match the single-token `"qualityreview"` comparison — a tool limitation for glossary targets that are themselves multi-word compounds, not a translation defect (the actual proposed value, e.g. `attendance/quality-review`, is correct and was verified by hand).
3. **`convite -> invitation` on front-route/dir rows:** intentional per D-14 ("English invite route" — the *route* uses `invite`; other kinds correctly use `invitation`, the general glossary term).

## Issues Encountered

None beyond the deviations documented above — all were found and resolved during execution without needing a checkpoint back to the user.

## User Setup Required

None - no external service configuration required. This plan only proposes CSV rows for gate 2 owner review; no code was renamed or executed.

## Next Phase Readiness

- **Ready:** this map is ready for gate 2 (owner approval of the old->new map, per D-03) alongside the other slices' maps. `check-map` is green; sample and all front-route/query-param/subpath-export/storage-key/file/dir/packages-ui-component rows were reviewed by hand.
- **Flag for gate 2:** review the `management-vite`/`bridge` app-rename proposal specifically (see Deviation 3) before any execution plan applies it — highest infra risk in this map given the known VPS build history.
- **Flag for a future STD-06 pass:** 254 literal-value rows and 2 storage-key rows remain `persisted=unknown` (KEEP, deferred) pending 01-08's still-in-progress persisted classification; `persisted-candidates-codex2-01-11.csv` holds the 154 rows already identified as likely persisted.
- **Blocker for none:** the check-map.ts fix in this plan unblocks any later plan that proposes ts-local/ts-prop/symbol/front-route rows at this scale (e.g. the API scope's map, which has 6,019 candidate rows of its own).

---
*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Completed: 2026-09-24*

## Self-Check: PASSED

All files created (map-codex2-*.json, persisted-candidates-codex2-01-11.csv, sample-front.csv,
this summary) confirmed present on disk; all three commits (`e61a59a`, `709d468`, `a561ae5`)
confirmed in `git log`. `check-map --require-status proposed --glossary GLOSSARY.md` re-run
against the committed state: `errors: 0`.

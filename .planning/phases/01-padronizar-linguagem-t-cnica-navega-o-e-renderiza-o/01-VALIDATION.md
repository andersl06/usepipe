---
phase: 1
slug: padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `01-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.2.4 (api, workers, ponte, packages); node:test + tsx (desk-vite, gestao-vite, crm) |
| **Config file** | per-package `vitest.config.ts`; fronts use `package.json` `test` script |
| **Quick run command** | `pnpm turbo run typecheck --filter=...<changed-pkg>` + that package's `test` |
| **Full suite command** | `pnpm typecheck && pnpm test && pnpm build` |
| **Estimated runtime** | measured at baseline (Wave 0), recorded in `std/baseline.md` |

---

## Sampling Rate

- **After every task commit:** turbo typecheck for touched workspaces and their dependents (`--filter=...<pkg>`) plus that package's tests
- **After every slice (D-20):** clean `dist`; `pnpm install` if a package was renamed; root `pnpm typecheck && pnpm test && pnpm build`; DDL export diff; route-match; std-scan; test-count ≥ baseline; the 3 flaky API tests run isolated
- **Before `/gsd:verify-work`:** full suite + `docker build` of each image (`MSYS_NO_PATHCONV=1`) + manual smoke checklist + owner sign-off
- **Max feedback latency:** per-task quick command; full suite only per slice

---

## Requirement Verification Map

Per-requirement summary below; per-task rows are in "Per-Task Verification Map".

| Requirement | Behavior | Test Type | Command / Gate | File Exists | Status |
|-------------|----------|-----------|----------------|-------------|--------|
| STD-01 | Convention + glossary approved | manual owner gate 1 | `GLOSSARY.md` + English conventions doc marked approved | ❌ W0 | ⬜ pending |
| STD-02 | Route/endpoint inventory + approved map | script + owner gate 2 | inventory script → map CSVs; every endpoint/front-route row approved | ❌ W0 | ⬜ pending |
| STD-03 | All route dependents found | script | route-match script → orphans = 0 at baseline and each slice | ❌ W0 | ⬜ pending |
| STD-04 | URL vs state classification | doc review | nav contract per-screen table; every screen classified or NEEDS VALIDATION | ❌ W0 | ⬜ pending |
| STD-05 | Compat strategy from consumer list | doc | nav contract compat section, consumer list from route-match | ❌ W0 | ⬜ pending |
| STD-06 | Persisted inventory, nothing persisted renamed | script | persisted CSV; sorted `drizzle-kit export` diff = ∅; `git diff limpeza -- packages/db/drizzle` = ∅ | ❌ W0 | ⬜ pending |
| STD-07 | Mechanical rename without regression | automated | per slice: typecheck/test/build green; test counts ≥ baseline; `.js` import specifier check; std-scan count decreasing | partial | ⬜ pending |
| STD-08 | PROJECT.md rule updated | grep | `rg -n "todo em português" .planning/PROJECT.md` → 0 | ✅ | ⬜ pending |
| STD-09 | CRM follows convention without deciding CRM-01 | review + build | `pnpm --filter @pipe/crm build` green; diff limited to renames | ✅ | ⬜ pending |
| STD-10 | Every non-persisted technical identifier (incl. CSS, D-35) in English | script | PT scanner → unclassified = 0 | ❌ W0 | ⬜ pending |
| STD-11 | Full regression + remnants classified A/B/C | script + manual | full suite + image builds + manual smoke checklist + drain runbook log | ❌ W0 | ⬜ pending |
| STD-12 | Nav contract documented + implemented | manual + unit | nav contract doc; node:test for localStorage filter helper (key has tenant+user, invalid value dropped); manual D-32 check | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Per-Task Verification Map

STD = `.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std`. Slice plans (01-13..01-31) all end with `bash tools/std/gate.sh <label>` (clean dist, install, typecheck, build, tests + counts vs baseline, DDL check, route-match compare, PT scan count, .js specifier check). Checkpoint tasks are owner gates; they sit after automated tasks so no 3 consecutive tasks lack automated verification.

| Task ID | Plan | Wave | Requirements | Task | Type | Automated Command | Depends on | Status |
|---------|------|------|--------------|------|------|-------------------|------------|--------|
| 01-01-T1 | 01 | 1 | STD-07, STD-11 | Create branch std/english-rename and fix the root typecheck | automated | `git rev-parse --abbrev-ref HEAD | grep -x std/english-rename && pnpm typecheck` | W0 tools per plan deps | ⬜ pending |
| 01-01-T2 | 01 | 1 | STD-07, STD-11 | Run and record the green baseline | automated | `test -f STD/baseline.md && grep -c "@pipe/" STD/baseline.md` | W0 tools per plan deps | ⬜ pending |
| 01-02-T1 | 02 | 2 | STD-10, STD-11 | PT detector with tests | automated | `node --test tools/std/pt-detect.test.ts` | W0 tools per plan deps | ⬜ pending |
| 01-02-T2 | 02 | 2 | STD-10, STD-11 | STD-11 scanner, exceptions seed, baseline scan | automated | `node tools/std/scan-pt.ts --out STD/reports/baseline-scan.csv --summary STD/reports/baseline-scan-summary.m...` | W0 tools per plan deps | ⬜ pending |
| 01-03-T1 | 03 | 2 | STD-03, STD-06, STD-11 | route-match tool with tests, baseline run, drift allowlist | automated | `node --test tools/std/route-match.test.ts && node tools/std/route-match.ts --emit STD/reports/baseline-rout...` | W0 tools per plan deps | ⬜ pending |
| 01-03-T2 | 03 | 2 | STD-03, STD-06, STD-11 | DDL snapshot script, ddl-before.sql, STD-11 smoke checklist | automated | `bash tools/std/ddl-snapshot.sh check` | W0 tools per plan deps | ⬜ pending |
| 01-04-T1 | 04 | 2 | STD-07 | Install ts-morph, shared map/csv/project libs, rename-symbols with fixture tests | automated | `node --test tools/std/engine.test.ts` | W0 tools per plan deps | ⬜ pending |
| 01-04-T2 | 04 | 2 | STD-07 | move-files (git mv + specifier rewriter) and rewrite-literals with fixture tests | automated | `node --test tools/std/engine.test.ts` | W0 tools per plan deps | ⬜ pending |
| 01-05-T1 | 05 | 3 | STD-02, STD-03, STD-07, STD-11 | Deterministic inventory extractor | automated | `node --test tools/std/inventory.test.ts && node tools/std/inventory.ts --out STD --dry-run` | W0 tools per plan deps | ⬜ pending |
| 01-05-T2 | 05 | 3 | STD-02, STD-03, STD-07, STD-11 | Slice gate script, test-count parser, baseline gate run | automated | `bash tools/std/gate.sh baseline && grep -c "FAIL" STD/reports/baseline-gate.md | grep -x 0` | W0 tools per plan deps | ⬜ pending |
| 01-06-T1 | 06 | 3 | STD-01, STD-02, STD-06, STD-10 | Codex wrapper, prompt chunker, schemas and prompt templates | automated | `grep -c "gpt-5.6-sol" tools/std/codex-run.sh && grep -c "\-s read-only" tools/std/codex-run.sh && for f in ...` | W0 tools per plan deps | ⬜ pending |
| 01-06-T2 | 06 | 3 | STD-01, STD-02, STD-06, STD-10 | merge-proposals, check-map, apply-comments with tests | automated | `node --test tools/std/map-tools.test.ts` | W0 tools per plan deps | ⬜ pending |
| 01-07-T1 | 07 | 4 | STD-04, STD-05, STD-12 | Enumerate and classify every screen/state item (Codex 2 proposal, Sonnet verification) | automated | `node -e "const j=JSON.parse(require('fs').readFileSync('STD/out/codex2-nav.json','utf8'));const apps=new Se...` | W0 tools per plan deps | ⬜ pending |
| 01-07-T2 | 07 | 4 | STD-04, STD-05, STD-12 | Write nav-contract.md (STD-12 rules, STD-04 table, STD-05 compat) | automated | `grep -c "selectedConversationId\|panel: 'conversation'\|coordinated cut\|NEEDS VALIDATION\|pipe:<app>:<scre...` | W0 tools per plan deps | ⬜ pending |
| 01-08-T1 | 08 | 4 | STD-02, STD-03, STD-06 | Run the inventory and review totals | automated | `ls STD/map/*.csv | wc -l && grep -c "Sanity check" STD/inventory-summary.md` | W0 tools per plan deps | ⬜ pending |
| 01-08-T2 | 08 | 4 | STD-02, STD-03, STD-06 | Persisted and wire-contract classification (Codex 1 + Codex 2, Sonnet review) | automated | `node -e "const fs=require('fs'),p='STD/map/';let n=0;for(const f of fs.readdirSync(p))n+=(fs.readFileSync(p...` | W0 tools per plan deps | ⬜ pending |
| 01-09-T1 | 09 | 5 | STD-01 | Term proposals (Codex 1 + 2) and GLOSSARY.md synthesis | automated | `grep -c "^| term_pt | term_en | blip_source | ambiguity | decision | approved |$" STD/GLOSSARY.md && grep -...` | W0 tools per plan deps | ⬜ pending |
| 01-09-T2 | 09 | 5 | STD-01 | CONVENTIONS-EN.md (STD-01) | automated | `grep -c "^## " STD/CONVENTIONS-EN.md` | W0 tools per plan deps | ⬜ pending |
| 01-09-T3 | 09 | 5 | STD-01 | OWNER GATE 1 — approve glossary and convention (D-03) | manual (checkpoint:human-verify) | `grep -c "Status: APPROVED" STD/GLOSSARY.md STD/CONVENTIONS-EN.md` | W0 tools per plan deps | ⬜ pending |
| 01-10-T1 | 10 | 6 | STD-01, STD-02, STD-08, STD-10 | STD-08 — update PROJECT.md language rule | automated | `test "$(grep -c 'todo em português' .planning/PROJECT.md)" = "0" && grep -c "CONVENTIONS-EN.md" .planning/P...` | W0 tools per plan deps | ⬜ pending |
| 01-10-T2 | 10 | 6 | STD-01, STD-02, STD-08, STD-10 | Codex account 1 proposes names for backend, infra and CSS scopes; Sonnet review; check-map green | automated | `node tools/std/check-map.ts --map STD/map --scopes packages-db,packages-contracts,packages-autenticacao,pac...` | W0 tools per plan deps | ⬜ pending |
| 01-11-T1 | 11 | 6 | STD-02, STD-04, STD-09, STD-10 | Codex account 2 proposals for the 8 scopes | automated | `ls STD/out/map-codex2-*.json | wc -l` | W0 tools per plan deps | ⬜ pending |
| 01-11-T2 | 11 | 6 | STD-02, STD-04, STD-09, STD-10 | Sonnet applies nav decisions, reviews sample and breaking rows; check-map green | automated | `node tools/std/check-map.ts --map STD/map --scopes packages-core,packages-ai,packages-ui,desk-vite,gestao-v...` | W0 tools per plan deps | ⬜ pending |
| 01-12-T1 | 12 | 7 | STD-02, STD-04, STD-05, STD-06, STD-10, STD-12 | Reconcile persisted candidates, run dry-runs, write GATE2-REVIEW.md | automated | `node tools/std/check-map.ts --map STD/map --scopes all --require-status proposed --glossary STD/GLOSSARY.md...` | W0 tools per plan deps | ⬜ pending |
| 01-12-T2 | 12 | 7 | STD-02, STD-04, STD-05, STD-06, STD-10, STD-12 | OWNER GATE 2 — approve map, CSS map, persisted, wire contracts, nav contract (D-03, D-35) | manual (checkpoint:human-verify) | `test -f STD/GATE2-REVIEW.md` | W0 tools per plan deps | ⬜ pending |
| 01-12-T3 | 12 | 7 | STD-02, STD-04, STD-05, STD-06, STD-10, STD-12 | Record approval, flip rows to approved, tag std-slice-0-end | automated | `node tools/std/check-map.ts --map STD/map --scopes all --require-status approved --glossary STD/GLOSSARY.md...` | W0 tools per plan deps | ⬜ pending |
| 01-13-T1 | 13 | 8 | STD-06, STD-07, STD-10 | Apply packages-core and packages-db symbol, prop, local and wire-key rows | automated | `bash tools/std/ddl-snapshot.sh check && pnpm typecheck` | W0 tools per plan deps | ⬜ pending |
| 01-13-T2 | 13 | 8 | STD-06, STD-07, STD-10 | Move core/db files and dirs, subpath exports, test files and titles; run slice gate | automated | `bash tools/std/gate.sh slice-1a` | W0 tools per plan deps | ⬜ pending |
| 01-14-T1 | 14 | 9 | STD-07, STD-10 | Apply symbol/prop/local rows for SCOPES | automated | `pnpm typecheck` | W0 tools per plan deps | ⬜ pending |
| 01-14-T2 | 14 | 9 | STD-07, STD-10 | Move files/dirs, subpath exports, test titles, other literals; slice gate | automated | `bash tools/std/gate.sh slice-1b` | W0 tools per plan deps | ⬜ pending |
| 01-15-T1 | 15 | 10 | STD-10, STD-11 | Triage package comments (Codex 1 + 2) and Sonnet review | automated | `node -e "const fs=require('fs'),d='STD/comments/';let bad=0;for(const f of fs.readdirSync(d).filter(f=>f.st...` | W0 tools per plan deps | ⬜ pending |
| 01-15-T2 | 15 | 10 | STD-10, STD-11 | Apply comments, slice 1 gate, tag std-slice-1-end | automated | `bash tools/std/gate.sh slice-1 && git rev-parse -q --verify refs/tags/std-slice-1-end` | W0 tools per plan deps | ⬜ pending |
| 01-16-T1 | 16 | 11 | STD-07, STD-10 | Workers and ponte identifiers, files, test titles | automated | `pnpm typecheck` | W0 tools per plan deps | ⬜ pending |
| 01-16-T2 | 16 | 11 | STD-07, STD-10 | Queues, job names, schedulers, metrics + alert rules; queue-rename.md; gate | automated | `bash tools/std/gate.sh slice-2a` | W0 tools per plan deps | ⬜ pending |
| 01-17-T1 | 17 | 12 | STD-07, STD-10 | API symbols, props, locals | automated | `pnpm typecheck` | W0 tools per plan deps | ⬜ pending |
| 01-17-T2 | 17 | 12 | STD-07, STD-10 | API files/dirs, subpath exports, test titles; guard-preservation gate | automated | `bash tools/std/gate.sh slice-2b` | W0 tools per plan deps | ⬜ pending |
| 01-18-T1 | 18 | 13 | STD-02, STD-03, STD-05, STD-07, STD-10 | Rewrite endpoints and all consumers; invite route; shared query params | automated | `pnpm typecheck && node tools/std/route-match.ts --emit STD/reports/slice-2c-pre-routes.json --consumers STD...` | W0 tools per plan deps | ⬜ pending |
| 01-18-T2 | 18 | 13 | STD-02, STD-03, STD-05, STD-07, STD-10 | Security path strings, callbacks, env value, drift allowlist; gate | automated | `bash tools/std/gate.sh slice-2c && test "$(wc -l < STD/route-drift-allow.csv)" -eq 1` | W0 tools per plan deps | ⬜ pending |
| 01-19-T1 | 19 | 14 | STD-06, STD-07, STD-10 | Error codes, wire keys, WS events | automated | `pnpm typecheck` | W0 tools per plan deps | ⬜ pending |
| 01-19-T2 | 19 | 14 | STD-06, STD-07, STD-10 | Session cookie rename across all sites; gate | automated | `bash tools/std/gate.sh slice-2d && test -z "$(rg -n -F pipe_sessao apps packages --glob '!**/dist/**')"` | W0 tools per plan deps | ⬜ pending |
| 01-20-T1 | 20 | 15 | STD-10, STD-11 | Triage API, workers, ponte comments with Sonnet review | automated | `node -e "const fs=require('fs'),d='STD/comments/';let bad=0;for(const f of ['api.csv','workers.csv','ponte....` | W0 tools per plan deps | ⬜ pending |
| 01-20-T2 | 20 | 15 | STD-10, STD-11 | Apply, slice 2 gate, tag std-slice-2-end | automated | `bash tools/std/gate.sh slice-2 && git rev-parse -q --verify refs/tags/std-slice-2-end` | W0 tools per plan deps | ⬜ pending |
| 01-21-T1 | 21 | 16 | STD-07, STD-10 | Desk identifiers, files, folders | automated | `pnpm typecheck` | W0 tools per plan deps | ⬜ pending |
| 01-21-T2 | 21 | 16 | STD-07, STD-10 | Desk routes, params, storage keys, test titles; gate | automated | `bash tools/std/gate.sh slice-3a` | W0 tools per plan deps | ⬜ pending |
| 01-22-T1 | 22 | 17 | STD-04, STD-12 | panel-history helpers with node:test (RED -> GREEN) | automated | `pnpm --filter @pipe/desk-vite test` | W0 tools per plan deps | ⬜ pending |
| 01-22-T2 | 22 | 17 | STD-04, STD-12 | Desk selection context, remove id routes, rewire pages; gate | automated | `bash tools/std/gate.sh slice-3b && test -z "$(rg -n '/chat/:id|/contacts/:id|\?ticket=' apps/desk-vite/src)"` | W0 tools per plan deps | ⬜ pending |
| 01-23-T1 | 23 | 18 | STD-07, STD-10 | Gestão identifiers, files, folders | automated | `pnpm typecheck` | W0 tools per plan deps | ⬜ pending |
| 01-23-T2 | 23 | 18 | STD-07, STD-10 | Routes, path builders, test titles, D-14/D-28 removals; gate | automated | `bash tools/std/gate.sh slice-3c && test -z "$(rg -n 'ROTAS_ANTIGAS_SEM_CONTATO|ParaOCanalDoBot|urlDaConvers...` | W0 tools per plan deps | ⬜ pending |
| 01-24-T1 | 24 | 19 | STD-04, STD-12 | filter-memory helper with node:test (RED -> GREEN) | automated | `pnpm --filter @pipe/gestao-vite test` | W0 tools per plan deps | ⬜ pending |
| 01-24-T2 | 24 | 19 | STD-04, STD-12 | Apply D-30 to listed screens and gate-2 decisions for D-31/D-29/D-34; gate | automated | `bash tools/std/gate.sh slice-3d` | W0 tools per plan deps | ⬜ pending |
| 01-25-T1 | 25 | 20 | STD-07, STD-10 | rename-css tool with tests | automated | `node --test tools/std/rename-css.test.ts` | W0 tools per plan deps | ⬜ pending |
| 01-25-T2 | 25 | 20 | STD-07, STD-10 | Apply css.csv, fix dynamic classes, verify counts; gate | automated | `bash tools/std/gate.sh slice-3e` | W0 tools per plan deps | ⬜ pending |
| 01-26-T1 | 26 | 21 | STD-09, STD-07, STD-10 | Record rendering baseline; rename CRM identifiers, files, folders | automated | `pnpm typecheck && grep -c "IDENTICAL" STD/reports/slice-3f-use-client.txt` | W0 tools per plan deps | ⬜ pending |
| 01-26-T2 | 26 | 21 | STD-09, STD-07, STD-10 | CRM routes, regex pair, params, test titles; build + gate | automated | `bash tools/std/gate.sh slice-3f` | W0 tools per plan deps | ⬜ pending |
| 01-27-T1 | 27 | 22 | STD-10, STD-11 | Triage front and CSS comments (Codex 2) with Sonnet review | automated | `node -e "const fs=require('fs'),d='STD/comments/';let bad=0;for(const f of ['desk-vite.csv','gestao-vite.cs...` | W0 tools per plan deps | ⬜ pending |
| 01-27-T2 | 27 | 22 | STD-10, STD-11 | Apply, slice 3 gate, tag std-slice-3-end | automated | `bash tools/std/gate.sh slice-3 && git rev-parse -q --verify refs/tags/std-slice-3-end` | W0 tools per plan deps | ⬜ pending |
| 01-28-T1 | 28 | 23 | STD-07, STD-10 | Rename each approved package, one at a time, with docker build after each | automated | `pnpm install --frozen-lockfile && pnpm typecheck` | W0 tools per plan deps | ⬜ pending |
| 01-28-T2 | 28 | 23 | STD-07, STD-10 | Slice 4a gate | automated | `bash tools/std/gate.sh slice-4a` | W0 tools per plan deps | ⬜ pending |
| 01-29-T1 | 29 | 24 | STD-07, STD-10 | Rename the Gestão app and all build/deploy references; build image | automated | `docker compose -f infra/compose/docker-compose.prod.yml --env-file infra/compose/env.prod.exemplo config -q...` | W0 tools per plan deps | ⬜ pending |
| 01-29-T2 | 29 | 24 | STD-07, STD-10 | Desk app rename if mapped; slice 4b gate | automated | `bash tools/std/gate.sh slice-4b` | W0 tools per plan deps | ⬜ pending |
| 01-30-T1 | 30 | 25 | STD-07, STD-10 | ponte app, site files/dirs and config | automated | `pnpm typecheck && test -z "$(rg -n '@pipe/ponte' apps packages package.json 2>/dev/null)"` | W0 tools per plan deps | ⬜ pending |
| 01-30-T2 | 30 | 25 | STD-07, STD-10 | Infra file names, shell identifiers, package.json script keys, command docs | automated | `for f in $(git ls-files 'infra/**/*.sh' 'infra/*.sh'); do bash -n "$f" || exit 1; done && node -e "const p=...` | W0 tools per plan deps | ⬜ pending |
| 01-30-T3 | 30 | 25 | STD-07, STD-10 | Infra and site comments; slice 4 gate; tag std-slice-4-end | automated | `bash tools/std/gate.sh slice-4 && git rev-parse -q --verify refs/tags/std-slice-4-end` | W0 tools per plan deps | ⬜ pending |
| 01-31-T1 | 31 | 26 | STD-10, STD-11 | Stale-reference sweep tool and doc updates; doc file renames | automated | `node tools/std/stale-refs.ts --map STD/map --out STD/reports/slice-5-stale-refs.csv` | W0 tools per plan deps | ⬜ pending |
| 01-31-T2 | 31 | 26 | STD-10, STD-11 | Final scan to zero unclassified; exceptions audit; slice 5 gate; tag | automated | `node tools/std/scan-pt.ts --out STD/reports/slice-5-scan.csv --summary STD/reports/slice-5-scan-summary.md ...` | W0 tools per plan deps | ⬜ pending |
| 01-32-T1 | 32 | 27 | STD-03, STD-06, STD-09, STD-11, STD-12 | Final gate, image builds, invariant review | automated | `bash tools/std/gate.sh final && grep -c "^- \[x\]" STD/FINAL-REVIEW.md` | W0 tools per plan deps | ⬜ pending |
| 01-32-T2 | 32 | 27 | STD-03, STD-06, STD-09, STD-11, STD-12 | Owner local smoke walk (STD-11, STD-12) | manual (checkpoint:human-verify) | `grep -c "| local |" STD/smoke-checklist.md` | W0 tools per plan deps | ⬜ pending |
| 01-33-T1 | 33 | 28 | STD-05, STD-06, STD-11 | Drain CLI with integration test, cutover runbook | automated | `pnpm typecheck && grep -c "removeJobScheduler" apps/api/src/drain-legacy-queues.ts` | W0 tools per plan deps | ⬜ pending |
| 01-33-T2 | 33 | 28 | STD-05, STD-06, STD-11 | Owner executes the production cutover (VPS + Google Cloud Console) | manual (checkpoint:human-action) | `test -f STD/CUTOVER-RUNBOOK.md` | W0 tools per plan deps | ⬜ pending |
| 01-33-T3 | 33 | 28 | STD-05, STD-06, STD-11 | Record cutover, build one-commit-per-slice history, merge into limpeza | automated | `test -z "$(git diff std/english-rename-work std/english-rename --stat)" && git merge-base --is-ancestor std...` | W0 tools per plan deps | ⬜ pending |

---

## Wave 0 Requirements

- [ ] Fix `packages/core/src/fluxo/gerenciador.teste.ts:101` (type annotation) and record green baseline in `std/baseline.md` — plan 01-01
- [ ] PT scanner (01-02), route-match + DDL snapshot + `ddl-before.sql` (01-03), inventory + gate (01-05)
- [ ] `pnpm add -Dw ts-morph@28.0.0` + rename engine (01-04); Codex wrapper + map checker (01-06)
- [ ] Exceptions CSV seeded (01-02; persisted B rows added in 01-08) (all env vars per D-06/D-36, SQL strings, `referencias-blip`, JSX user-facing text, persisted scopes/error codes per D-40)
- [ ] Manual smoke checklist file for STD-11 (01-03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Glossary approval | STD-01 | Owner decision (D-03 gate 1) | Owner reviews glossary with ambiguous terms highlighted, marks approved |
| Old→new map approval (incl. CSS map) | STD-02, STD-10 | Owner decision (D-03 gate 2, D-35) | Owner reviews map per app, marks approved |
| Google OAuth callback | STD-11 | External console | Owner re-registers `/v1/auth/google/callback` in Google Cloud Console (local + VPS); login works |
| SSO callback, `/invite/:token` | STD-11 | End-to-end flow | Log in via SSO; open an invite link |
| Session cookie rename logout | STD-11 | Deploy effect (D-38) | After deploy, existing sessions are logged out; new login works |
| Desk open conversation → F5 → list; back closes conversation | STD-12 | Browser behavior | Open conversation, press F5, confirm list; open again, press back, confirm panel closes |
| Back/forward parity vs live Blip | STD-12 | NEEDS VALIDATION (D-32) | Compare against live Blip Desk when available |
| Queue drain before cutover | STD-11 | Operational | Run drain runbook; log counts reaching zero for every queue |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency acceptable per task
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

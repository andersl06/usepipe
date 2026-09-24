---
phase: 1
slug: padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
status: draft
nyquist_compliant: false
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

Per-task rows are filled in by the planner/executor once PLAN.md files exist.

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

## Wave 0 Requirements

- [ ] Fix `packages/core/src/fluxo/gerenciador.teste.ts:101` (type annotation) and record green baseline in `std/baseline.md`
- [ ] Inventory, PT-scanner, route-match and DDL-snapshot scripts; commit `ddl-before.sql`
- [ ] `pnpm add -Dw ts-morph@28.0.0`
- [ ] Exceptions CSV seeded (all env vars per D-06/D-36, SQL strings, `referencias-blip`, JSX user-facing text, persisted scopes/error codes per D-40)
- [ ] Manual smoke checklist file for STD-11

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency acceptable per task
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

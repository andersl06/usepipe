---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 01
subsystem: tooling/baseline
tags: [baseline, typecheck, crm, ui]
requires: []
provides:
  - "branch std/english-rename with green typecheck/test baseline"
  - "std/baseline.md (per-package test counts, gate commands)"
affects: [all later slice gates in phase 01]
tech-stack:
  added: []
  patterns: ["slice gate build = pnpm turbo run build --filter=!@pipe/crm + crm 'Compiled successfully'"]
key-files:
  created:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/baseline.md
  modified:
    - packages/core/src/fluxo/gerenciador.teste.ts
    - packages/ui/src/componentes/aviso-encerramento.tsx
    - packages/ui/src/componentes/encerramento-ticket.tsx
    - apps/crm/src/lib/configuracoes-comum.ts
decisions:
  - "Baseline code commit is 57ca8d5"
  - "crm standalone build EPERM (Windows symlink privilege) accepted as known environment issue; gates use build --filter=!@pipe/crm plus crm 'Compiled successfully'"
metrics:
  duration: "~45min"
  completed: 2026-09-24
requirements: [STD-07, STD-11]
---

# Phase 01 Plan 01: Branch, typecheck fix and baseline Summary

Root typecheck fixed (`Record<string, string>` annotation), two pre-existing crm failures fixed, and a measured baseline recorded: typecheck 0, tests 0 (21/21 turbo tasks, 1,610 tests + ui tokens), build 0 excluding crm (crm compiles; standalone step fails on Windows symlink EPERM, accepted).

## Tasks

| Task | Name | Commit |
|---|---|---|
| 1 | Branch check + root typecheck fix | 82e0c95 |
| 2 | Run and record baseline | c113500 |

Branch `std/english-rename` was created by the orchestrator from `limpeza`; verified `git merge-base --is-ancestor limpeza HEAD` = 0.

## Verification (observed)

- `pnpm typecheck`: exit 0 (46s)
- `pnpm turbo run test --continue`: exit 0, 21/21 tasks (367s)
- `pnpm build`: exit 1, only `@pipe/crm#build` EPERM symlink after "Compiled successfully"
- `pnpm turbo run build --filter=!@pipe/crm`: exit 0, 14/14 (cached, same code)
- Flaky files (instagram, fluxo, messenger) passed in full run; isolated runs not needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ui components with hooks lacked 'use client'**
- **Found during:** Task 2
- **Issue:** `@pipe/crm` build failed: `aviso-encerramento.tsx` and `encerramento-ticket.tsx` use `useState`/`useEffect`, imported via `@pipe/ui` index into crm `not-found.tsx`.
- **Fix:** added `'use client';` to both files.
- **Commit:** 654ba01

**2. [Rule 1 - Bug] crm event catalog diverged from api**
- **Found during:** Task 2
- **Issue:** crm test "o catálogo de eventos não divergiu de apps/api" failed; missing `modelo.recategorizado`, `sla.alertou`, `sla.estourou`.
- **Fix:** appended the three codes to `CATALOGO_DE_EVENTOS`.
- **Commit:** 57ca8d5

Both fixes approved by owner (option A) before being applied.

### Accepted environment issue

- `@pipe/crm` `output: 'standalone'` fails with `EPERM` creating symlinks on this Windows machine (no Developer Mode). Owner chose to accept (option B); documented in `std/baseline.md` under Known environment issues with the gate substitute.

## Assumption Drift (advisory)

- **Found during:** Task 2. **Planned:** only typecheck was red; build/test green except known flaky. **Actual:** crm build and one crm test were red on `limpeza`, plus a Windows-only standalone EPERM. **Why:** not detected during planning (typecheck-only probe).

## Self-Check: PASSED

- FOUND: std/baseline.md, all modified files
- FOUND commits: 82e0c95, 654ba01, 57ca8d5, c113500

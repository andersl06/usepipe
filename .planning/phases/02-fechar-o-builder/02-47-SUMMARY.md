---
phase: 02-fechar-o-builder
plan: 47
subsystem: db, api, core, management
tags: [P10, D-57, function-library, tenant, ExecuteBlipFunction, migration-0054]
requires: [02-41]
provides: [tenant function library, function usage endpoint, "em uso em outros bots" warning, Blip `source` UUID references]
key-files:
  created:
    - packages/db/drizzle/0054_funcao_da_conta.sql
    - packages/db/tests/function-library-migration.test.ts
    - apps/api/tests/function-library.test.ts
  modified:
    - packages/db/src/schema/automation.ts
    - packages/db/drizzle/meta/_journal.json
    - packages/contracts/src/flow-functions.ts
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/actions.test.ts
    - apps/api/src/domain/management/flow-functions.ts
    - apps/api/src/controllers/flow-functions.ts
    - apps/api/src/domain/engine-services.ts
    - apps/api/tests/flow-functions.test.ts
    - apps/management-vite/src/pages/builder/actions-of-block.ts
    - apps/management-vite/src/pages/builder/panel-actions.tsx
    - apps/management-vite/src/pages/builder/flow-functions.ts
    - apps/management-vite/src/pages/builder/flow-functions-gravar.ts
    - apps/management-vite/src/pages/builder/flow-functions-panel.tsx
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/tests/builder-functions.test.ts
decisions:
  - "The table keeps its name `funcao_do_fluxo`; 0054 drops `fluxo_id` and `escopo` and makes `nome` unique per tenant (`funcao_do_fluxo_tenant_nome_uk`)"
  - "Name clashes: a row that was already tenant-wide keeps the name, otherwise the oldest (criado_em, id); the rest get the first free `<nome>_<n>` (n ≥ 2), a note in `descricao` and a RAISE NOTICE"
  - "Usage is a scan, not a link table: draft/published versions of non-archived flows whose blocks or global actions contain the function UUID (ExecuteBlipFunction) or a call `nome(` (scripts)"
  - "ExecuteBlipFunction stores the UUID in `settings.source` like Blip (its validator requires a UUID there); engine and Builder still read the pre-P10 `functionId`"
  - "Create accepts an optional `id` so a function referenced by an imported Blip flow can be recreated under the same UUID; the Builder offers this when the action points at a missing UUID"
  - "Deletion of a function in use is warned (confirm modal lists the other bots), not blocked"
metrics:
  completed: 2026-09-29
---

# 02-47 — P10: Biblioteca de funções da conta — Summary

The function library is now per account (tenant), end to end, as D-57 asks.

## What was built

- **Migration 0054 (`0054_funcao_da_conta.sql`, journal idx 54, when 1790110000000).** Every per-flow
  function becomes a tenant function with the same id, so actions that reference it keep working.
  Clashes are resolved as described in the decisions above. Scripts in the renamed function's old
  flow that call it by name now reach the surviving function; actions that reference it by id are
  unaffected. Drops `fluxo_id`/`escopo`, and `nome` becomes unique per tenant.
- **API.** `loadFlowFunctions` loads the whole tenant library. Production (`flow.ts`) and the Builder
  test run (`builder-test-run.ts`) call it unchanged, because the flow id parameter stays and is
  ignored. `POST` accepts an optional UUID `id`. The new `GET /v1/management/flow-functions/:id/usage`
  returns `{flowId, flowName, shortName}[]`. A 409 now distinguishes a duplicate name from a
  duplicate id. The engine looks functions up case-insensitively, and its error names "a biblioteca
  da conta".
- **Core.** `ExecuteBlipFunction` reads `source` first and falls back to `functionId`.
- **Builder.** The action field writes `source` (and drops `functionId`). Required-field validation
  accepts either key. The library panel (Configuração → Funções) gets the current `flowId` and, on
  edit or delete, shows "Esta função está em uso em outros bots (…)". The function selector flags a
  UUID missing from the library and offers "Criar função" under that UUID. The list now requests
  `limit=100`.
- **D-55 unchanged.** `{{resource.x}}` injection of shared JS (`createMenuFunction`,
  `utilValidateInputOptions`) was not touched.

## Verification

- core: `npx vitest run` 548/548 (18 files), `tsc --noEmit` clean
- API: `tsc -p tsconfig.test.json --noEmit` clean; eslint has only the 2 known errors (`sla.ts`, `channel-of-flow.test.ts`); DB-free `function-library.test.ts` + `engine-services.test.ts` 18/18
- db: `tsc -p tsconfig.test.json` clean
- Gestão: `tsc --noEmit` clean, `eslint .` clean, `pnpm test` 413/413, `vite build` OK

## DB tests for the orchestrator (not run here: no Docker)

- `packages/db/tests/function-library-migration.test.ts`: scratch database migrated up to (not
  including) 0054, per-flow and tenant fixtures with clashes, 0054 applied by hand. It checks that
  rows and ids are kept, the columns are dropped, the renames are deterministic, the notes are
  written and the name is unique afterwards.
- `apps/api/tests/flow-functions.test.ts`: the existing cases, plus create with a Blip UUID
  (upper-case input comes back lower-case, a bad id returns 400, a repeated id returns 409), the
  same library for any flow, usage by id and by name (archived flows and property calls ignored,
  404 for another tenant, 403 without permission), and a tenant-wide duplicate name returning 409.
- `apps/api/tests/flow-actions.test.ts` (existing CR-07 library call) should still pass.

## Merge notes

- `_journal.json`: 02-46 (0053) and 02-48 (0055) add neighbouring entries. Keep all three in idx order.
- `engine-services.ts`: one 3-line change inside `runFlowFunction`.
- `panel-configuration.tsx`: one prop added (`flowId={flowId}` on `FlowFunctionsPanel`).

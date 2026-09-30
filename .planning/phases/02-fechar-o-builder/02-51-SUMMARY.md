---
phase: 02-fechar-o-builder
plan: 51
subsystem: core, api, contracts
tags: [subflows, engine, currentFlowSession, import, builder-test-run]
requires: [02-44]
provides: [Blip subflows in the engine (P12), subflow storage in the flow version document]
key-files:
  created:
    - packages/core/src/flow/subflows.ts
    - packages/core/src/flow/subflows.test.ts
    - packages/core/src/flow/fixtures/export-with-subflows.json
    - apps/api/tests/subflows.test.ts
  modified:
    - packages/core/src/flow/manager.ts
    - packages/core/src/flow/modelos.ts
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/editor.ts
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/builder-commands.ts
    - packages/core/src/flow/index.ts
    - packages/contracts/src/management-flow.ts
    - apps/api/src/domain/flow.ts
    - apps/api/src/domain/management/builder-of-flow.ts
    - apps/api/src/domain/management/builder-test-run.ts
    - apps/api/src/import-flow.ts
decisions:
  - "Subflows are stored inside the caller's version document, `fluxo_versao.global.subflows[shortName]`, as published Blip `Flow`s (`type: subflow`), plus the editor drawing under `editor` when imported from an editor export. No migration (0058 not used)."
  - "Runtime id of a subflow: `subflow-{shortName}-{flowId}`, Blip's subflow application name pattern. It keys `stateId@{id}` and a nested `currentFlowSession@{id}`."
  - "Position across inputs uses Blip's keys: the caller keeps `stateId@{flow}` = its `subflow:` block; `currentFlowSession@{flow}` = subflow short name (empty/absent = the flow itself); chains nest."
  - "`end` block: skips its exits, forgets the subflow's saved blocks and the caller's session, and the caller's `subflow:` block exits decide the next block. An `end` block without a caller fails, as in Blip."
  - "A subflow calling itself (directly or through a chain) is refused; a stored session whose subflow no longer exists is dropped and the contact stays at the caller block."
  - "`set/get/delete /contexts/{contact}/currentFlowSession@{flow}` are plain context commands (any case normalised to Blip's spelling); they take effect on the next input."
  - "Subflows inherit the bot's `configuration` under their own (`{{config.x}}`, `builder:*`); commands that name the bot (`/configuration/caller`) use the bot's flow id even inside a subflow."
metrics:
  completed: 2026-09-29
---

# Phase 2 Plan 51: Subflows in the engine (P12) Summary

Imported Blip flows that call subflows now run in production and in the Builder test run. A `subflow:` block hands the contact to the subflow named by its `shortNameOfSubflow`. The subflow's `end` block hands it back, and the calling block's exits pick the next block. The engine is shared, so both paths behave the same.

## Blip evidence used (D-33: format only, nothing copied)

- `referencias-blip/pesquisa/catalogo-gatilhos-acoes.md` §2.3 (SDK notes): `IsSubflowState` = id starts with `subflow:`; `shortNameOfSubflow` in `ExtensionData`; `State.End` returns through `RedirectToParentFlowAsync`; subflow requires `Version >= 2`; `MaxTransitionsByInput = 10`.
- `referencias-blip/pesquisa/blip-api-schemas.md` §5.3: `currentFlowSession@{flowId}` holds the subflow short name; empty means the main flow.
- Portal bundle (read only): a subflow block is created as `{ id: 'subflow:<uuid>', shortNameOfSubflow, $contentActions: [input bypass false], $defaultOutput }`. Its default entering actions are `TrackEvent` "Entering subflow" and `MergeContact`. The subflow is a separate application `subflow-{shortName}-{bot}`, with an `end` block (`end: true`). Subflows are exported and imported separately.
- The real export (`Downloads/desk180326…json`) has no subflow. The fixture was built with invented content in the documented format.

## Storage decision

In Blip every subflow is a separate application. A bot's main export has only the `subflow:` block. Pipe stores each subflow **in the caller's version document** (`fluxo_versao.global.subflows`) for three reasons:

- A published version and its subflows can never drift apart. `execucao_fluxo.fluxo_versao_id` pins both, as it already pins blocks.
- `loadFlow` already spreads `global` into the flow, so production needs no new query. The test run reads the same drawing.
- No migration and no new table. Blip subflows are not shared (`isShared = false`), so a subflow belongs to one bot anyway.

Subflow blocks have no `bloco` rows. `execucao_passo` writes them with `bloco_id` null, and `saida` names them as `{ subfluxo, estado }`.

## What imported Blip subflows need

- Import the main export together with each subflow export. The subflows can come:
  - bundled as `json.subflows = { <shortName>: <export> }`, or
  - separately through `importFlowOfBlip({ subflows })`. The CLI takes `--subfluxo <shortName>=<arquivo.json>`, once per subflow.
- Each subflow export can be in any format `lerFluxoDaBlip` reads (editor, `settings.flow`, or direct `Flow`).
- A main flow whose `subflow:` block names a missing subflow fails validation, so it cannot be published: "O subfluxo 'x' chamado pelo bloco '…' não existe neste fluxo." The import report lists it as `subfluxo:<shortName>`.
- The main flow's own `end` blocks stay unsupported (`estado:fim-de-subfluxo`).

## Verification

- core `npx vitest run`: 21 files, 577 tests passing, 11 new in `subflows.test.ts`. They cover the fixture end to end, the default exit, 2-level nesting, currentFlowSession get/delete commands, `stateid@` of an own subflow, a stale session, recursion, `end` without a caller, validation and `flowErrors` attachment, runtime id/config, the import report and the editor drawing.
- core `npx tsc --noEmit -p .` and `npx eslint src/flow`: clean.
- API `npx tsc -p tsconfig.test.json --noEmit`: clean. API eslint shows only the known `sla.ts` error.
- Gestão was not touched. Its `npx tsc --noEmit -p .` is clean against the changed contracts.
- `apps/api/tests/subflows.test.ts` (DB): written, **not run here**. It covers:
  - import storage
  - separate subflow import
  - publishing refused when a subflow is missing
  - production conversation over the webhook (context keys, subflow steps with null `bloco_id`, return)
  - Builder test run parity (`currentSubflow`, step tags)
  - a save without `subflows` keeping the stored ones
  - a broken subflow reported on its calling block

## Deviations

- Across inputs the chain lives in context variables, not in Blip's per-input queue. This matches what Blip persists (`stateid@`, `currentFlowSession@`).
- `get /flow-id` without a short name returns the running flow's id, which is the subflow id inside a subflow. Blip's exact answer there is unknown.
- `process_http_execucao.bloco_id` is null for a ProcessHttp suspended inside a subflow. The resume itself works, because the chain is in the saved context.
- The `ref/INVENTARIO-RUNTIME-BLIP.md` P12 row was not edited.

## For P13 (Builder UI)

- `DesenhoDoBuilder.subflows?: Record<shortName, { flow, globals?, configuration? }>` is already accepted by `PUT /builder` and returned by `GET /builder`. When the field is absent, the stored subflows are kept.
- Errors inside a subflow come back on the calling block, prefixed with "Subfluxo '<nome>':".
- Still to build in P13:
  - the "+ Criar novo subfluxo" flow, which creates `subflow:<uuid>` with `shortNameOfSubflow`
  - a subflow editor tab with its `end` block
  - Blip's subflow-only restrictions (no `Redirect`/`ProcessContentAssistant`)
  - the test-run Debug showing `debug.currentSubflow` and `states[].subflow`

## Self-Check: PASSED

---
phase: 02-fechar-o-builder
plan: 52
subsystem: management-vite (Builder)
tags: [subflows, builder-ui, P13]
requires: [02-51]
provides: [Blip subflows created, edited, tested and published from the Builder]
key-files:
  created:
    - apps/management-vite/src/pages/builder/subflows.ts
    - apps/management-vite/src/pages/builder/subflow-ui.tsx
    - apps/management-vite/tests/builder-subflows.test.ts
  modified:
    - apps/management-vite/src/pages/builder/state.ts
    - apps/management-vite/src/pages/builder/use-editor.ts
    - apps/management-vite/src/pages/builder/editor.tsx
    - apps/management-vite/src/pages/builder/model.ts
    - apps/management-vite/src/pages/builder/import-exportar.ts
    - apps/management-vite/src/pages/builder/actions-of-block.ts
    - apps/management-vite/src/pages/builder/panel.tsx
    - apps/management-vite/src/pages/builder/panel-actions.tsx
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/src/pages/builder/menu-new-block.tsx
    - apps/management-vite/src/pages/builder/canvas.tsx
    - apps/management-vite/src/pages/builder/no.tsx
    - apps/management-vite/src/pages/builder/setas.ts
    - apps/management-vite/src/pages/builder/test-panel.tsx
    - apps/management-vite/src/pages/builder/test-panel-logic.ts
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/src/pages/builder.tsx
decisions:
  - "The editor state holds `subfluxos` (by short name) and `subfluxoAberto`. `aplicar`/`mover` edit the canvas on screen; `aplicarSubfluxos` changes the main map and the subflow list in one step. Undo/redo snapshots cover the main map, configuration and subflows; switching canvas is not a step."
  - "Every save sends `subflows` (an empty object when there are none), so deleting the last subflow reaches the API. No API, core or contracts change; no migration."
  - "Short name = the typed name without accents/symbols, lower case, unique ignoring case (engine runtime id `subflow-{shortName}-{flow}`). Renaming later changes only the calling block's title, never the short name, so contacts inside the subflow are not lost."
  - "Subflows are created from the main flow only. Nested calls that come in an import still open and run."
  - "A new subflow is Início (input with bypass, the engine allows it in a subflow) → Fim (`end: true`). The calling block is Blip's shape: `subflow:<uuid>`, `shortNameOfSubflow`, input, entering `TrackEvent` \"Entering subflow\" (`subflowDefaultAction`), default output to `fallback` if present."
metrics:
  completed: 2026-09-30
---

# Phase 2 Plan 52: Subflows in the Builder (P13) Summary

A subflow can now be created, edited, called, tested and published from the Gestão Builder.

## What the user can do

- **Create**: "Adicionar bloco" → NOVO BLOCO → **Subfluxo** lists the flow's subflows and **"+ Criar novo subfluxo"**. A modal asks for the name ("Novo subfluxo" by default). The calling block lands in the middle of the canvas, open in its panel, and a subflow with Início → Fim is created.
- **Open / edit**: double click the calling block, use "Abrir subfluxo" on its **Subfluxo** tab, or pick the subflow in NOVO BLOCO. The canvas switches to the subflow, where every block tool works as on the main flow: create, link, move, duplicate, paste, panel. A bar at the top shows "‹ Fluxo principal / <nome> · Subfluxo", with **Carregar subfluxo** (replace from a Blip subflow export) and **Baixar subfluxo**. Início and Fim cannot be deleted. Fim has no output dot and cannot be linked onward (Blip's message).
- **Rename**: through the calling block's title.
- **Delete**: deleting the calling block asks "Deletar subfluxo" with Blip's text. The subflow goes with it unless a duplicated block still calls it. Ctrl+Z restores both.
- **Restrictions**: inside a subflow the ADICIONAR FERRAMENTAS menu leaves out `Redirect` and `ProcessContentAssistant`. An imported subflow that has them paints the block red inside the subflow, and paints the calling block red on the main flow.
- **Errors**: a subflow's problems paint its calling block red on the main flow, as in Blip. Those problems are: no drawing, an invalid inner block, a restricted action, or an API error "Subfluxo 'x': …". The Publish gate uses the same set. Inside the subflow canvas, the API's "Subfluxo 'x': …" errors land on the inner block that the message names.
- **Import**:
  - "Carregar fluxo" reads subflows bundled in the file (`subflows: { shortName: export }`).
  - If the flow calls subflows the file did not bring, the toast names them. The calling block's Subfluxo tab offers "Carregar subfluxo" (the Blip subflow file) or "Criar subfluxo vazio".
  - "Baixar fluxo" (current and old versions) bundles the subflows, so a download re-imports whole.
- **Test**: the Debug shows the current block with a "Subfluxo <nome>" tag (`debug.currentSubflow`), and tags each step (`states[].subflow`). Clicking a step opens that subflow's canvas and selects the block.
- **Publish**: a save carries the subflows, so publishing takes them with it (API from 02-51).

## Verification (apps/management-vite)

- `npx tsc --noEmit -p .`: clean.
- `npx eslint .`: clean.
- `pnpm test`: 440/440 passing. 13 are new in `builder-subflows.test.ts`: short names, creation shape, a Builder-made subflow that compiles and passes core `validateFlow`, Fim rules, delete with a shared subflow, reducer edits/undo/drag/`salvo`, read/build round trip, restricted actions, caller/inner error mapping, export/import bundle and missing names, and Debug titles.
- `npx vite build`: passes.
- Core and API were not touched. The DB test `apps/api/tests/subflows.test.ts` (02-51) was not run here, because there is no Docker.

## Differences from Blip

- Blip keeps each subflow as its own application, with separate export/import and publish. Pipe keeps them inside the flow's version (02-51). One Publish covers the flow and its subflows, and "Baixar fluxo" bundles them.
- Blip's "Restaurar versão" text says subflow changes are kept. Pipe's restore brings back the version's subflows too. The text was not changed.
- There is no separate subflow Configuração or Ações globais panel. The Configuração panel always edits the main flow, and subflows inherit its configuration (engine, 02-51). A subflow's own `globals`/`configuration` are kept as imported.
- The `MergeContact` default action Blip may add to the calling block is not created: its settings are unknown. Only the `TrackEvent` is added.
- The node style is Pipe's own (D-33): 225px, radius 6, dashed inner outline, "Subfluxo" caption, and the `roteador` icon.

## Merge risks

- `actions-of-block.ts`: `actionsOfGroup` gained an optional second argument, and `ACTIONS_NOT_IN_SUBFLOW` is new. 02-53/02-54 may add catalog entries next to it.
- `menu-new-block.tsx` (new `subflow` prop), `panel.tsx` (new `subflow` prop and tab label), `editor.tsx` (rewritten around `mapaNaTela`) and `state.ts` (Snapshot now includes `subfluxos`; `antesDoArrasto` is a Snapshot). A 02-53 "Agente" menu item or config panel would conflict textually here.
- `builder.tsx`: `onImport` has a third argument, and the Publish gate uses `canvasInvalidBlocks`.

## Deviations

None from the plan scope.

## Self-Check: PASSED

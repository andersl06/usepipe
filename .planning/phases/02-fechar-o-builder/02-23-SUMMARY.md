---
phase: 02-fechar-o-builder
plan: 23
subsystem: builder-ui
tags: [builder, condicoes-de-saida, css, fidelidade-visual]
dependency-graph:
  requires: ["02-22"]
  provides: ["F-1 exit-condition cards visual parity"]
  affects:
    - apps/management-vite/src/components/selection.tsx
    - apps/management-vite/src/pages/builder/condition.tsx
    - apps/management-vite/src/pages/builder/conditions.ts
    - apps/management-vite/src/pages/builder/panel-outputs.tsx
    - apps/management-vite/src/pages/builder/destination-picker.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder/editor.css
    - packages/ui/src/icones.tsx
tech-stack:
  added: []
  patterns:
    - "removeCondition(block, outputIndex, conditionIndex): removing an output's last condition removes the output, matching Blip on-remove-condition"
    - "Selection rotulo prop draws an internal label (`.bl-campo--interno > .sub` pattern) inside `.selection-control`"
key-files:
  created: []
  modified:
    - apps/management-vite/src/pages/builder/conditions.ts
    - apps/management-vite/tests/builder-editor.test.ts
decisions: []
metrics:
  duration: TBD
  completed: TBD
---

# Phase 2 Plan 23: Cards de condição de saída (F-1) Summary

STATUS: DRAFT — Task 1 concluída e commitada; Task 2 (layout/CSS) em andamento.

## One-liner

Grid Se/Condição de 155x56 com rótulo interno, "E" entre condições, chips e divisor "OU" nos cards da aba Condições de saída, alinhados às medidas ao vivo do Builder da Blip.

(Este é um rascunho intermediário. Será substituído por um resumo final ao término de todas as tasks.)

## Progresso

### Task 1 — Lógica: remover a última condição remove a saída; operador preservado

Concluída. Commits:
- `6569ec75` test(02-23): add failing coverage for removeCondition and flowHasSurvey (RED)
- `f05325b2` feat(02-23): remove the whole output on its last condition; add flowHasSurvey (GREEN)

`removeCondition(block, outputIndex, conditionIndex)` em `conditions.ts` remove uma condição de uma saída; se a saída ficar sem condições, a própria saída é removida de `$conditionOutputs` (paridade com `on-remove-condition` da Blip). `flowHasSurvey(mapa)` verifica se algum bloco do mapa é `survey:` (via `isSurveyBlock`), para o switch condicional da Task 2.

Verificação executada: `pnpm --filter @pipe/management-vite test` — 338 passed, 0 failed. `pnpm -s --filter @pipe/management-vite typecheck` — sem saída (limpo).

### Task 2 — Layout e CSS dos cards (F-1.4 linhas 1-10, 12)

Pendente.

## Deviations from Plan

(a preencher ao final)

## Self-Check

(a preencher ao final)

---
phase: 02-fechar-o-builder
plan: 35
subsystem: management-vite / builder
tags: [builder, fidelity, gap-closure, owner-gate]
requires: ["02-34"]
provides: [regression gates for round F-1..F-6, side-by-side Blip x Pipe measurements, owner approval per area]
key-files:
  modified:
    - .planning/phases/02-fechar-o-builder/ref/GATE-FINAL.md
    - .planning/phases/02-fechar-o-builder/ref/VERIFICACAO-VISUAL.md
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder/floating-sidebar.tsx
decisions:
  - "Owner approved F-1..F-6 on 2026-10-05 (answer: \"aprovado\"); NEEDS VALIDATION lines, \"Nomear versão\" (02-32) and the \"Não disponível no Pipe\" mark remain without a specific owner decision"
metrics:
  completed: 2026-10-05
  tasks: 3
---

# Phase 2 Plan 35: Owner gate for round F-1..F-6 Summary

Regression gates, side-by-side measurement of the Pipe Builder against the live Blip captures, and per-area owner approval.

## Tasks

| Task | Commit | Result |
|---|---|---|
| 1. Regression gates | `16f961a4` | typecheck 25/25; management-vite 529/529; core editor 37/37; API builder-by-flow 17/17; no `dangerouslySetInnerHTML`; no `#4a5d23`/`--bl-verde` literal; no new Blip assets (D-33) |
| 2. Side-by-side measurement | `cd8218dc`, `335d186a` | 55 rows compared: 34 VISUALLY VERIFIED, 21 NEEDS VALIDATION; six fixes (Se/Condição select, "Ir para", action ⋮ 40x40, floating sidebars dark scope, Configuração section titles, global "Adicionar ação") |
| 3. Owner approval | `359d9d21` | F-1..F-6 approved on 2026-10-05 |

## Open items (no specific owner decision)

- "Nomear versão" (needs `fluxo_versao` migration, API and modal).
- "Não disponível no Pipe" mark (breaks Configuração titles, raises Biblioteca rows to 118px vs 103px).
- NEEDS VALIDATION rows in `ref/VERIFICACAO-VISUAL.md` §Rodada F-1..F-6 (Padrão tag on queue card, queue name uppercase, "Ações de entrada" text/link, action selector groups 2 vs 4, usable width 386-396 vs 383, magnifier height/focus ring/(i) shape, toast and invalid content card/danger field not measured live on Blip).

## Self-Check: PASSED

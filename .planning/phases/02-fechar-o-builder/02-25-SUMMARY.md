---
phase: 02-fechar-o-builder
plan: 25
subsystem: ui
tags: [builder, search, react, css, blip-parity]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: builder/model.ts, builder/conteudo.ts, builder/actions-of-block.ts, builder/conditions.ts (block map, content cards, actions, output conditions)
provides:
  - "builder/search.ts: parseSearch/matchBlock/searchMatches (title/tags/output/actions/content prefixes, no id match)"
  - "dark search box matching Blip measurements (440x66, #141414, 368x42 input)"
  - "canvas untouched on no-result search; pill turns X and always clears on close"
affects: [02-35 (formal F-4 visual measurement), builder search/canvas consumers]

# Tech tracking
tech-stack:
  added: []
  patterns: ["pure search module (parse+match+aggregate) mirrored from search.ts", "500ms debounce local to builder.tsx via setTimeout cleared in effect"]

key-files:
  created:
    - apps/management-vite/src/pages/builder/search.ts
    - apps/management-vite/tests/builder-search.test.ts
  modified:
    - apps/management-vite/src/pages/builder/canvas.tsx
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/src/pages/builder.css
    - apps/management-vite/src/pages/builder/editor.css
    - packages/ui/src/icones.tsx

key-decisions:
  - "tags: prefix reads block.$tags labels directly, not the canvas badge helper blockTags() (which also mixes in action types and UserInput) — keeps title/tags/output/actions/content as five distinct fields per the plan's must_haves"
  - "action field search flattens all string values found in an action's settings (recursively), not just the catalog's declared fields, so imported/unknown actions are still searchable by field value"

requirements-completed: [BUILDER-02]

# Metrics
duration: [TBD]
completed: [TBD]
---

# Phase 2 Plan 25: Busca do Builder (lupa) Summary

**DRAFT — Task 1 concluída (lógica de casamento testada); Task 2 (caixa escura, pílula X, canvas intacto) pendente.**

## Performance

- **Started:** ver commit inicial
- **Tasks:** 1/2 concluída

## Accomplishments (até aqui)
- `builder/search.ts` criado com `parseSearch`, `matchBlock` e `searchMatches`, cobrindo os cinco prefixos (`title:`, `tags:`, `content:`, `actions:`, `output:`), busca sem prefixo nos cinco campos, e a regra "nunca casa pelo id".
- 15 testes novos em `builder-search.test.ts`, todos verdes (`pnpm --filter @pipe/management-vite test`).

## Task Commits

1. **Task 1: Casamento de blocos com prefixos (`search.ts`)** - `d7ddddb9` (feat)

_Task 2 ainda não iniciada nesta versão do SUMMARY._

## Files Created/Modified (até aqui)
- `apps/management-vite/src/pages/builder/search.ts` - casamento puro de blocos com prefixos (`parseSearch`/`matchBlock`/`searchMatches`)
- `apps/management-vite/tests/builder-search.test.ts` - testes dos cinco prefixos, sem prefixo, sem id e sem resultado

## Decisions Made
- Ver `key-decisions` no frontmatter.

## Deviations from Plan

None - plan executado como escrito até aqui.

## Issues Encountered

None.

---
*Rascunho gerado após Task 1; será substituído pelo SUMMARY final ao término da Task 2.*

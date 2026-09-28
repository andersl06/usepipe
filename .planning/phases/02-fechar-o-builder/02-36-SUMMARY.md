---
phase: 02-fechar-o-builder
plan: 36
subsystem: management-vite / builder
tags: [builder, chips, queue-rules, gap-closure]
requires: ["02-34"]
provides: [global chips field (free-text + options), inline Blip rule cards in queue-rules mode]
affects: [monitoring filters (SelectionChips), builder exit-condition Valor field]
key-files:
  created:
    - apps/management-vite/src/components/chip-values.ts
  modified:
    - apps/management-vite/src/components/selection-chips.tsx
    - apps/management-vite/src/components/selection-chips.css
    - apps/management-vite/src/pages/builder/condition.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder/queue-rules.tsx
    - apps/management-vite/src/pages/builder/queues-panel.ts
    - apps/management-vite/tests/builder-queues.test.ts
decisions:
  - "SelectionChips is the single chips field: options mode (monitoring) unchanged, free-text mode when options are absent, controlled values/onChange optional"
  - "Several chips on one rule condition map to several API rows; positive comparisons need OU, negated need E; a card mixing that with a different rule combiner is not storable and Confirmar stays disabled"
metrics:
  completed: 2026-09-28
  tasks: 2
---

# Phase 2 Plan 36: Global chips field + inline Blip rule cards Summary

One chips component for the whole product (free-text mode with Enter/`,`/`|`/`;` delimiters, used by Builder conditions and still by monitoring filters) and the Builder queue-rules mode rebuilt as Blip `builder-attendance-rules` inline cards on the existing rules API.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1. Global chips field | df20b4fa | `SelectionChips` gained free-text mode, controlled API, visible `label`, danger `erro` message; `condition.tsx` Valor uses it; dark-panel overrides in `panel-block.css` |
| 2. Inline rule cards | aaf22b98 | `queue-rules.tsx` no longer uses `RuleQueueForm`; header/empty/search/no-result/closed card/open card/footer per README section 1; pure mapping in `queues-panel.ts` |

## Verification (observed)

- `pnpm exec tsc --noEmit -p .` in apps/management-vite: exit 0, no output (after building `@pipe/contracts`, `@pipe/core`, `@pipe/ui`, `@pipe/db` dist in the fresh worktree).
- `pnpm lint`: exit 0, no findings.
- `pnpm test`: 413 tests, 413 pass, 0 fail (8 new tests in `builder-queues.test.ts`: chip delimiters, addChips dedupe, sequential name, confirm-disabled on empty value, Extras requires property, multi-chip OU/E mapping, unrepresentable card, round-trip of stored rules).
- Monitoring: the `SelectionChips` call sites were not changed and the options-mode path (hidden `name` input, dropdown, keyboard) is intact; verified by typecheck and code path only, not in a browser.
- NOT verified: visual rendering in a browser (no app/API/DB started, per instructions). Owner visual checkpoint stays pending.

## API mapping notes (what could not be mapped 1:1)

- The API stores one `value` per condition and one E/OU combiner per rule; the Blip card has a chips list per condition. Mapping: each chip becomes one API row. Several chips on Contém/É igual need OU, on Não contém/Não é igual need E. With a single condition the combiner is picked automatically; with more than one condition the rule's combiner (new rules: E; edited rules: the stored one) must match, otherwise the card is not storable and Confirmar stays disabled (tooltip explains). Example not storable: `Mensagem contém [boleto, pix]` AND `Nome é igual Ana`, which would need `(a OU b) E c`.
- Stored OU rules whose rows all share field and operator load as one condition with many chips; everything else loads one condition per row. Stored combiner is preserved on edit.
- `contato.telefone` (Desk-only field, no Blip option) loads as an extra option labelled by `rotuloDoCampo` so edits round-trip.
- New rule `order` = max order among all rules + 1 (capped at 999); the Blip DOM has no order control.
- Not in the Blip DOM, Pipe-only text added: extra-property field placeholder "Propriedade", delete confirmation `window.confirm("Excluir a regra X?")`, title edit buttons "Cancelar edição"/"Confirmar edição", Confirmar tooltip for the not-storable case.

## Deviations from Plan

- [Rule 3 - Blocking] Built workspace package `dist/` (contracts/core/ui/db) so typecheck/tests could resolve `@pipe/*` in the fresh worktree. No source change.
- Pure chip helpers put in a new `components/chip-values.ts` (the .tsx imports CSS and can't be loaded by the node test runner).
- Dead `.bl-values`/`.bl-value` rules removed from `panel-block.css`; the same selectors in `editor.css` were left alone (parallel search executor owns that file).

## Known Stubs

None.

## Self-Check: PASSED

- chip-values.ts, queue-rules.tsx, queues-panel.ts present; commits df20b4fa and aaf22b98 in `git log`.

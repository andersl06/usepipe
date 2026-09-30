---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 47
status: in-progress
requirements-completed: []
---

# 01-47: residual map proposal — in progress

Merged `limpeza` before this plan. Added proposed rows for eight API endpoints plus the WhatsApp alert frontend route, file, and component; corrected the plan's resend parameter from `:token` to `:id` and included the public invitation GET route. Kept Desk `/activeMessage/send` unchanged with Blip evidence. No proposed row has been approved or applied.

Aligned the inventory detector with the scanner's approved lexicon (`inventory.ts --lexicon-file`): it now has 13,219 rows and 8,715 candidate declarations. Of 15,285 unclassified identifier occurrences, 3,653 lack a declaration match in their own file and 142 lack one globally; the latter include nested object keys and infra shell/YAML names requiring manual tracing. Fixed the validator's duplicate-ID and `skipped`-row handling (25 tests pass): the full map now reports two genuine historical Portuguese-name errors, zero from the new `std11-*` rows. `std/STD11-MAP-PACKET.md` is a draft, **not** the human approval checkpoint. 01-48 and later rename plans remain untouched.

Verification after the merge: `pnpm typecheck` passed 23/23 tasks; the local DDL snapshot check passed. No DB-writing test, Docker, migration, deployment or rename was run.

The first read-only Codex batch returned 300 schema-valid proposals; its sensitive review and seeded sample found a context mistranslation and two one-sided wire translations. It remains unmerged; see `std/reports/std11-proposal-review.md`.

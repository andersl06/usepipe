---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 47
status: in-progress
requirements-completed: []
---

# 01-47: residual map proposal — in progress

Merged `limpeza` before this plan. Added proposed rows for eight API endpoints plus the WhatsApp alert frontend route, file, and component; corrected the plan's resend parameter from `:token` to `:id` and included the public invitation GET route. Kept Desk `/activeMessage/send` unchanged with Blip evidence. No proposed row has been approved or applied.

Generated inventory (3,855 rows), 2,964 candidate declarations, and explicit local/global identifier gap reports. Of 15,285 unclassified identifier occurrences, 11,054 lack a declaration match in their own file and 3,625 lack one globally; these still require manual string/alias/import tracing. The full map validator reports 605 pre-existing errors, zero from the new `std11-*` rows. `std/STD11-MAP-PACKET.md` is a draft, **not** the human approval checkpoint. 01-48 and later rename plans remain untouched.

Verification after the merge: `pnpm typecheck` passed 23/23 tasks; the local DDL snapshot check passed. No DB-writing test, Docker, migration, deployment or rename was run.

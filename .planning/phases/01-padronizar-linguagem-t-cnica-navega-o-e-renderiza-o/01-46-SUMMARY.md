---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 46
status: partial
requirements-completed: []
---

# 01-46: STD-11 classification

Implemented evidence-based `@ddl`, `@quoted-comment`, and `@product-text` resolvers and exact journal/public-path exceptions. Refreshed the local DDL snapshot after both `limpeza` merges and included its 0056 migration. The same-code scans now reduce unclassified findings from 30,603 to 26,066 (lexicon unchanged); nine worklists partition the remainder without overlap. See `std/reports/std11-classification-audit.md` for samples and counts.

Scanner tests: 14/14 passed. Root typecheck: 23/23 passed; selected management build and test suite passed. `git diff --check` passed. The plan is **partial** because the full 11/11 gate requires forbidden DB/Docker operations, route-match sees newer F2 route drift, and the old numeric threshold was measured against a different tree. Do not add `std11-classified` to `gate-order.txt` or claim completion until those gates can be legitimately run. No DB migration was created by this plan.

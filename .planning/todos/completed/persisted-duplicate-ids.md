---
title: Deduplicate 3 repeated ids in std/persisted.csv before gate 2
resolves_phase: 1
created: 2026-09-24
---

01-08 output has 3 ids that appear twice with different descriptions/decision_ref (e.g. packages-core-literal-value-826bc472: D-09 vs D-11 for process_http_execucao.contexto). Also 10 persisted-wire-* rows came from 01-35 (jsonb wire keys 01-08 missed). Reconcile in 01-12 (gate 2 packet) before the map is approved.

Resolved: kept the D-11 row (jsonb-reach:default-keep, same evidence pattern as 66 other default-keep rows) and removed the stale D-09 duplicate for all 3 ids (packages-core-literal-value-826bc472/b0916e54/d49b1b9e); appended a gate2-dedup note to the surviving row. Sanity-checked the 10 persisted-wire-* rows from 01-35: all `keep`/`D-09`, each with a matching `exceptions.csv` category-B row, no id collisions. `persisted.csv` now has 744 data rows (747-3), 0 duplicate ids.

---
title: Deduplicate 3 repeated ids in std/persisted.csv before gate 2
resolves_phase: 1
created: 2026-09-24
---

01-08 output has 3 ids that appear twice with different descriptions/decision_ref (e.g. packages-core-literal-value-826bc472: D-09 vs D-11 for process_http_execucao.contexto). Also 10 persisted-wire-* rows came from 01-35 (jsonb wire keys 01-08 missed). Reconcile in 01-12 (gate 2 packet) before the map is approved.

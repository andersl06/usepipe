---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 08
status: complete
key-files:
  created:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/persisted.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/front-route-dependents.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/jsonb-reach.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/out/jsonb-codex1-001.json
    - tools/std/classify-jsonb.ts
    - tools/std/classify-jsonb.test.ts
  modified:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/inventory-summary.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/exceptions.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/api.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/packages-core.csv
    - tools/std/lib/jsonb-reach.ts
commits:
  - dabdbce
  - ef09612
  - 1460d86
  - b7c593c
  - ffcb722
  - be6f3dd
  - 432cfbd
  - be02227
  - 75690bc
---

The technical inventory and persisted-value classification are complete; stored names are isolated from the rename map.

## What was built

- Inventory for 18 scopes, 18 comment files, 179 endpoint rows, and dependents for all 157 front routes.
- `persisted.csv` with 737 decisions, including API-key scopes, stored error codes, browser keys, 95 distinct JSONB-reached members, and 16 opaque PT keys from the approved JSONB fixtures.
- Exact-file, anchored B exceptions for every persisted row. The API and worker declarations for `mensagem.dados.pergunta.opcoes` leave the rename map; unrelated `opcoes` declarations remain candidates.
- Corrected JSONB reach report: 140 per-column rows. Schema-valid direct proposal output and D-40 call log were recorded.

## Deviations

- The original reach report incorrectly treated the runtime `Contexto` object and `EventoDeAuditoria` wrapper as stored JSONB objects. `apps/api/src/dominio/fluxo.ts:313,383,453,473,681` serializes the `variaveis` map, not `Contexto` property names; `packages/db/src/auditoria.ts` stores cleaned before/after snapshots. Removed 42 stale candidates and refreshed the inventory totals. Therefore `Contexto` properties correctly remain rename candidates instead of false persisted rows.
- D-40 direct classification replaced the plan's Codex wrapper calls; D-41 waived a separate Sonnet review for this plan. The required proposal format, schema validation, and call logs were retained.

## Verification results

- Plan checks: 18 map CSVs, 18 comment CSVs, 0 `persisted=unknown`, `check-map` 0 errors and 0 warnings, 157/157 front routes covered, 737/737 persisted rows with exact-file B exceptions.
- JSONB: 95 reached declarations classified keep; 28 had direct fixture evidence and 67 used the plan's default keep rule. Another 16 fixture keys and 3 stored menu declarations were classified. No JSONB row was marked non-persisted without strip evidence.
- Real repository scan: 105,537 findings; 780 matched persisted B exceptions. Of 737 persisted IDs, 463 matched directly, 83 shared an equivalent same-file rule, and 191 were at verified source lines outside scanner positions, including JSON fixtures.
- 25 focused tests passed; ESLint passed; `pnpm typecheck` passed 23/23 tasks. The 67-row JSON proposal passed `map-rows.schema.json`; all three task logs have exit 0. Re-running the classifier left the tracked diff unchanged.

## Self-Check: PASSED

- Branch `cx/01-08`; all writes and git commands stayed in this worktree.
- No push, deploy, database write, or shared-container operation. Protected planning files were not edited.
- Reviewed the full diff from `cf669f902c058561cb7a2186fc539f4cc0f2938f`; `git diff --check` passed. The review found and fixed the stored menu key and stale inventory totals.

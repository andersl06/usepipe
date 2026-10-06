---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 46
status: complete
requirements-completed: []
completed: 2026-10-06
key-files:
  modified:
    - tools/std/scan-pt.ts
    - tools/std/scan-pt.test.ts
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/exceptions.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/std11-classification-audit.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/std11-worklist-*.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/gate-order.txt
---

# 01-46: STD-11 classification

Evidence-based `@ddl`, `@quoted-comment` and `@product-text` resolvers in `scan-pt`, exact journal/public-path exceptions, the `std11-classified` re-baseline (lexicon hash unchanged, label in `gate-order.txt`), and nine non-overlapping rename worklists whose sum equals the gate scan's unclassified count (26,603).

## Verification on 2026-10-06 (what was actually run)

| Check | Result |
|---|---|
| `node --test tools/std/scan-pt.test.ts tools/std/pt-detect.test.ts` (Node 24 runs TS directly; the plan's `--import tsx` fails with `Cannot find package 'tsx'` at the repo root) | 14 pass, 0 fail |
| Lexicon untouched | `gate2-lexicon.txt`, `pt-detect.ts` and `pt-lexicon.txt` have no commits after the 01-12 freeze; the slice-0, std11-before, std11-classified and today's re-scan summaries all report (baseline predates the lexicon freeze: `none`) `Lexicon: 02edb1d46412ffc806518c8a780b0f51f7909352` |
| `grep -Fxq std11-classified gate-order.txt` | present (order: baseline, slice-0, std11-classified) |
| Rows added to `exceptions.csv` | 894 data rows, 0 with empty category, justification or ref; resolver rows: `@ddl` (sql-name, B, D-08), `@quoted-comment` (comment, A, D-17), `@product-text` (string-literal and literal-value, A, STD-10), plus the pre-existing `@ddl` row for `packages/db/src/schema/**` |
| `identifier` findings with category A in `std11-classified-scan.csv` | 0 |
| Audit tables | one per rule, 0 errors in every sample (limit 2%); see `std11-classification-audit.md` |
| Worklists | regenerated with `node tools/std/classify-worklists.ts` from the committed gate scan: packages 3,847; api-domain 3,374; api-core 1,699; api-tests 3,283; mgmt-pages 6,147; mgmt-rest-desk 2,672; crm-tools-site 2,034; infra 1,079; comments 2,468. Sum 26,603 = `Unclassified:` in `std11-classified-scan-summary.md`; independent count over the nine CSV files: 26,603 rows, 0 duplicate rows |
| `bash tools/std/gate.sh std11-classified` on the current tree | **7/11, exit 1** (below) |

### Gate re-run output

```
PASS 01 clean
PASS 02 install
PASS 03 typecheck
PASS 04 build
FAIL 05 tests
FAIL 06 test-counts
FAIL 07 ddl
FAIL 08 routes
PASS 09 pt-scan
PASS 10 js-specifiers
PASS 11 jsonb-keys
```

The 11/11 PASS recorded for this plan is the run committed in `d28bc996` / merged in `c232e45a` on 2026-09-30 (`std11-classified-gate.md`). It does not reproduce today because the tree moved on (351 commits since, Phase 3 work, plus another executor's uncommitted migration 0094 and builder changes in the same working tree). I restored the committed gate reports after the re-run so the recorded 11/11 evidence is not overwritten by a run on a moving tree. Attribution of the four failures, none related to the classification:

- **07 ddl**: `ddl-before.sql` is the 0057 snapshot; the exported DDL now differs by the columns of later migrations (e.g. `alerta_inatividade_em`, `dia_completo`, `encerramento_automatico`), and the same step's `git diff limpeza -- packages/db/drizzle` check also fails (exit 1) because of those migrations.
- **08 routes**: about 25 routes added by Phase 3 controllers are not in `baseline-routes.json`, and 17 consumer paths in `apps/api/tests/request-log.test.ts` are unmatched.
- **05 tests**: 1 of 1,318 API tests failed (`flow-actions.test.ts`, "fills application, bucket, calendar and random...": expected `fluxoflowactions5d70f90d@msging.net`, received `ações-de-contexto@msging.net`). Run alone it passes (13/13), so it is a full-suite-only failure caused by an unordered `fluxos[0]` read. 1 desk-vite test failed (`tenant-login.test.ts`, `import.meta.env` undefined for `VITE_PIPE_DOMINIO_CONTAS` under `node --test`). Step 06 fails as a consequence.
- **09 pt-scan** passed: lexicon unchanged, unclassified below the `slice-0` floor. The same scan reports 39,026 findings and 31,911 unclassified on today's tree (against 26,603 at gate time).

Steps 09 to 11, which are the ones this plan's changes can influence, pass. Details and the follow-up (DDL snapshot, route baseline, flaky test, desk-vite env) are in `deferred-items.md`.

## Deviations from Plan

1. **[Rule 1 - Bug] Worklists out of sync with the gate scan.** The committed worklists had been generated from the earlier 26,066-row scan, but the committed `std11-classified-scan-summary.md` says 26,603, so "sum of worklists = Unclassified" did not hold (537 rows missing). Regenerated them (and `std11-audit-sample.csv`) from the committed gate scan, re-reviewed the new samples, and rewrote the stale parts of `std11-classification-audit.md` (it still said the gate had not been run).
2. **Absolute target not met literally.** The acceptance criterion `Unclassified < 25,741` is not satisfied by the recorded floor of 26,603. The 25,741 figure was measured on an older, smaller tree; the comparable same-snapshot result is 30,603 to 26,066 (4,537 fewer), and the gate's own invariant (unclassified never rises against the previous scan with the same lexicon) holds. Recorded here rather than silently accepted.
3. **Verify command.** `node --import tsx --test ...` from the plan fails in this repo (`tsx` is not resolvable from the root); `node --test` works.

## Hand-off notes for plans 01-48 to 01-56

- The worklists describe the tree at the gate scan (26,603). Today's tree has 31,911 unclassified, so each rename plan must re-run `node tools/std/scan-pt.ts ...` and `node tools/std/classify-worklists.ts` when it starts, and the next gate will need the DDL/route baselines refreshed first.
- No DB migration was created by this plan; nothing production-related was touched.
- No requirement is marked complete in `REQUIREMENTS.md` (STD-06, STD-11 close with the rename plans).

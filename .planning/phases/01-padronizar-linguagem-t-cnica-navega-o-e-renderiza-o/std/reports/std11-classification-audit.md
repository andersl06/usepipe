# STD-11 classification audit (01-46)

The before and after scans use the same code snapshot and lexicon; only the exceptions file differs. The previous unclassified target of 25,741 came from an older, smaller tree and is not a comparable pass threshold after the `limpeza` merge. Current counts: 31,451 total, 30,335 unclassified before exceptions, 25,926 after (4,409 fewer). Both summaries report lexicon `02edb1d46412ffc806518c8a780b0f51f7909352`.

The reproducible inputs are `std/out/std11/exceptions-before.csv` and `std/ddl-before.sql`; results are `std11-before-scan.csv`, `std11-classified-scan.csv`, and their summaries. `std11-audit-sample.csv` contains the stratified-by-file classified and same-kind excluded rows reviewed below. The classified sample contains only evidence-backed DDL identifiers, product text, journal migration paths, and public site paths. The excluded sample contains aliases, technical strings/comments, and non-public paths; exclusion means the row remains for a later rename review, not that it has been judged safe to keep.

| Rule | Classified population | Reviewed classified | Reviewed excluded | Wrongly classified in sample |
|---|---:|---:|---:|---:|
| `@ddl` SQL name | 4,181 | 50 | 50 | 0 (0%) |
| `@quoted-comment` | 48 | 48 | 50 | 0 (0%) |
| `@product-text` string-literal | 0 | 0 | 50 | 0 (no positive cases) |
| `@product-text` literal-value | 850 | 50 | 50 | 0 (0%) |
| Journal migration path (exact filename) | 103 | 103 | 50 | 0 (0%) |
| Public site path | 29 | 29 | 50 | 0 (0%) |

The quote-only comment sample exposed one Portuguese technical sentence outside a quoted menu label in `actions-of-block.ts`; its sentence was translated while the literal label stayed unchanged, then both scans and the sample were regenerated. No `identifier` finding was assigned category A. There are no CSS KEEP names in the approved CSS map that justify a new exception.

All 25,926 remaining unclassified findings are partitioned into nine non-overlapping worklists: packages 3,793; api-domain 3,324; api-core 1,694; api-tests 3,110; mgmt-pages 5,849; mgmt-rest-desk 2,644; crm-tools-site 2,026; infra 1,079; comments 2,407. The worklist generator asserts sum, coverage, lexicon equality, and zero identifier-A.

The full `std11-classified` gate was **not** run: it invokes DB-writing tests/Docker, outside this handoff's authorization. `gate-order.txt` is therefore unchanged; this is a provisional re-baseline, not an 11/11 PASS. Static scanner tests, worklist assertions, typecheck/build, and targeted tests passed separately. The route-match comparison is also pending because F2 advanced the route baseline and introduced three unmatched WebSocket `/v1/eventos` references. No requirement is marked complete on these grounds.

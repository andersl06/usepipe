# Phase gate preview (non-test steps)

Ran each check directly from the worktree root after `pnpm install --frozen-lockfile --prefer-offline`. No test suite or full gate run was used.

| Step | Before | After | Result |
|---|---|---|---|
| `scan-pt` (frozen gate2 lexicon, exceptions, map) | 27,156 findings; 26,188 unclassified | 27,156 findings; 26,186 unclassified | **FAIL gate trend**: command exits 0, but `gate-order.txt` contains only `baseline` with lexicon `none`; no prior run has frozen lexicon `02edb1d46412ffc806518c8a780b0f51f7909352`. Remaining findings listed below. |
| `route-match --check` vs baseline | 23 API guard scope changes; 16 unmatched references, 3 in fronts | 23 API guard scope changes; 4 unmatched references, all in API tests | **FAIL**: API source/test changes belong to the other agent. Front references now match. |
| `ddl-snapshot.sh check` | SQL export changed persisted tables `fila` → `queue` and `conversa` → `conversation`; two migration comment paths differed from `limpeza` | SQL unchanged; migration comparison clean | **PASS** |
| JS relative specifiers | 1 without `.js`, baseline 1 | 1, baseline 1 | **PASS** |
| `jsonb-keys.ts --check` | No baseline key lost | No baseline key lost | **PASS** |
| `test-counts.ts` vs baseline | No current test log | No current test log | **NOT RUN**: this comparison consumes the test suite log, which is outside this non-test preview. |

## Fixes

- Restored two persisted Drizzle table names and two migration comments. No database write was made.
- Fixed three front API consumers: two Desk contact URLs and the Management team URL. Updated nine existing route exceptions to their renamed file paths and, for the negative flow fixture, its renamed path.
- Applied four uniquely matched triaged comment rows outside api/core. The comment identifier mapper changed 134 code-span mentions in 87 files using approved map rows with a unique target present as code in the same scope.
- CSS rename dry run found two `data-tooltip` `KEEP` values (Portuguese product text), so no CSS change was made.

## Residual for 01-31

- [Full scan CSV](gate-preview-scan.csv) contains all 26,186 unclassified findings. [Grouped outside-api/core list](gate-preview-residual.csv) contains 14,701 findings in 7,139 file/kind/token groups: 6,960 identifiers, 1,411 CSS classes, 1,306 CSS properties, 301 paths, 26 data attributes, 1,309 comments, and 3,388 other literal/SQL/script findings. Existing category A/B/C exceptions remain untouched.
- There are 185 pending triaged comment rows outside api/core with no unique text match (36 from the first application pass and 149 from the second). Their source text or duplicate matches need review before applying.
- `apps/api` has 10,380 unclassified scan findings and 149 pending comment rows; `packages/core` has 1,105 findings and 7 pending rows. Source in these areas was not edited.
- Route comparison still finds 23 API guard scope drifts (`agents`, `contacts`, `conversations`, `messages`, `queues` now use Portuguese scope strings) and four unmatched API test references: `channels.test.ts:486`, `etiquetas.test.ts:176`, `gerar-fixtures-jsonb.helper.ts:286`, and `palavras-proibidas.test.ts:370`.
- The frozen-lexicon scan trend needs a comparable prior gate record; this preview did not change `gate-order.txt` or phase state files.

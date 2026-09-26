# SQL identifier restore

The exported Drizzle DDL matches `std/ddl-before.sql` exactly. `bash tools/std/ddl-snapshot.sh check` prints `SQL unchanged`; no migration was run. Two pre-existing migration comment path edits were reverted so the script's migration-history check also passes.

| Package | Restored |
| --- | ---: |
| `@pipe/db` | 2 SQL table names (`queue` → `fila`, `conversation` → `conversa`); 1 SQL result alias |
| `@pipe/api` | 68 SQL result aliases aligned with existing TypeScript row keys across 5 files |
| `@pipe/workers`, `@pipe/crm`, `@pipe/bridge`, `@pipe/core` | 0 identifier changes needed in inspected SQL contexts |

Examples: `pgTable('fila')` keeps the English TypeScript constant `queue`; `select c.estado as state` reads the frozen `estado` column while preserving the TypeScript row key. SQL table/column/enum/index/constraint names in the Drizzle export match the DDL snapshot. An AST scan of tagged `sql` templates and execute/query string arguments found mapped English words in SQL keywords (`order`), row aliases, and string contents, but no additional mapped SQL table or column names to replace. Dynamic `sql.raw` fragments in API and bridge were inspected separately.

## Checks

| Check | Result |
| --- | --- |
| DDL snapshot | pass (`SQL unchanged`) |
| API build | pass |
| API full suite | 172 passed, 426 failed, 56 skipped / 654; last full run before the final contract test alias fix |
| DB | 31 passed / 31 |
| Workers | 42 passed / 42 |
| CRM | 34 passed / 34 |
| Bridge | 17 passed / 17 |

## Leftovers

The API failures still require a separate mechanical contract repair. Representative cases:

- `apps/api/src/session.ts:17`: `pipe_session` differs from the authentication package's cookie name; contract tests receive 401 (`apps/api/tests/contract.test.ts:185`).
- `apps/api/tests/ponta-a-ponta.test.ts:176`: assertions read English response keys while the controller returns existing Portuguese wire keys; the focused suite has 9 failures after SQL alias fixes.
- `apps/api/tests/growth.test.ts:188`: a code read from an earlier API response is undefined, producing `where codigo = `; this is a response-key mismatch, not a SQL identifier mismatch.

No database objects were renamed or migrated. The remaining API failures should be handled in the contract/wire repair scope, preserving the frozen SQL names.

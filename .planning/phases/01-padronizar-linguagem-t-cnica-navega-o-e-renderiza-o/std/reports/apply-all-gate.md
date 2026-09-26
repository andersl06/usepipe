# Gate apply-all

The aggregated `tools/std/gate.sh apply-all` run was killed by the host at step
03 (typecheck) because the machine ran out of memory, which cascaded FAIL into
every later step of that run's report. Each step was then executed on its own,
serially, at commit `87389eb`. Results below.

| # | Step | Result | Evidence |
|---|---|---|---|
| 01 | clean | PASS | from the killed run (outputs removed) |
| 02 | install | PASS | from the killed run |
| 03 | typecheck | PASS | `pnpm turbo run typecheck --concurrency=1`: 23/23 tasks |
| 04 | build | PASS | `pnpm turbo run build --filter=!@pipe/crm --concurrency=1`: 14/14 tasks (crm excluded per the known EPERM symlink issue, std/baseline.md) |
| 05 | tests | PASS | `pnpm turbo run test --continue --concurrency=1`: 21/21 tasks, no failures |
| 06 | test-counts | PASS | `apply-all-test-counts.json`, every package at or above baseline |
| 07 | ddl | PASS | `ddl-snapshot.sh check`: SQL unchanged |
| 08 | routes | PASS | 207 routes, 662 references, no route-set drift |
| 09 | pt-scan | PASS | 26711 findings, down from 27156 (gate-preview) and 37131 (baseline) |
| 10 | js-specifiers | PASS | 1, baseline 1 |
| 11 | jsonb-keys | PASS | no baseline jsonb key disappeared from the code |

## Test counts against the baseline

| Package | Baseline | Now |
|---|---:|---:|
| @pipe/api | 647 | 654 |
| @pipe/core | 421 | 421 |
| @pipe/ai | 75 | 75 |
| @pipe/management-vite | 237 | 243 |
| @pipe/desk-vite | 27 | 33 |
| @pipe/crm | 34 | 34 |
| @pipe/workers | 42 | 42 |
| @pipe/bridge | 17 | 17 |
| @pipe/db | 31 | 31 |
| @pipe/authentication | 41 | 41 |
| @pipe/storage | 24 | 24 |
| @pipe/realtime | 14 | 14 |
| @pipe/ui | exit 0 | exit 0 |

No package lost a test. The gains come from tests that the rename had made
unrunnable and from cases split while repairing them.

## What the repair found

The suite went from 172 passing to green in three stages. Most of the work was
not stale test names: the rename had broken production behaviour in ways the
compiler cannot see, because each bug crosses a boundary where a name is text
rather than a symbol.

1. **Unaliased SQL projections.** The TypeScript row type was translated while
   the column stayed Portuguese (correctly: the database is frozen, D-08), and
   the query had no alias, so the property was `undefined` at runtime. 86
   aliases were added across 24 files. Outages this caused: conversation
   transfer denied the owning agent, active-message dispatch rejected every
   destination, tracked links 404ed on every call, the contract panel found no
   permission, pulling a conversation from a queue failed, contact list, create
   and edit returned empty fields, outbound webhook signing crashed on every
   delivery, certificate registration answered 500, and flow builder blocks
   were saved under an undefined key so publish and restore never worked.
2. **Keys crossing an untyped boundary.** `packages/core` wrote the ProcessHttp
   cursor as `stateId` while the interface declares `estadoId`, passed with a
   forced cast; resume never matched the cursor, so the next message never went
   out. Login stored the challenge cookie under `origem` while the reader
   expects `origin`, so people did not return to the app they came from.
3. **Test discovery.** `packages/core` and `packages/ai` still globbed
   `src/**/*.teste.ts` after their files became `*.test.ts`, so vitest reported
   no test files and exited: 496 tests silently stopped running, and 28 real
   failures were hiding behind that.

Values that must stay Portuguese were restored where the rename had translated
them: the SLA pill states (`dentro|alerta|estourado|sem_regra`), the
`transicao_invalida` error code, the ProcessHttp inbound jsonb keys, the audit
row shape for forbidden words, and the `valor` key of the model's own JSON
output, which is a contract with the LLM rather than an internal property.

## Follow-ups (not blocking gate 3)

- 38 files carry literal-translation names (`cycle-of-lifetime-of-flow.ts`,
  `channel-of-flow.ts`, and `passos-of-deployment.ts`, which still holds a
  Portuguese word). Natural English is proposed per file in the residual sweep
  notes; this needs new approved map rows.
- Plan 01-31 still owns the residual Portuguese scan (26711 findings, mostly
  user-visible text, which stays Portuguese by design) and the 185 comment rows
  that matched no text.

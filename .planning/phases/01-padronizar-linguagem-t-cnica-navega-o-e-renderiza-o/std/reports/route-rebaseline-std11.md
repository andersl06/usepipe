# Route baseline refresh (std11-classified)

Gate step 08 compares the live Nest route set against `baseline-routes.json`, after translating it
through the `applied`/`verified` endpoint and symbol rows of `std/map`. The file had not changed
since plan 01-03 (commit `9a912f24`, 207 pre-rename routes). Phase 2 work merged into `limpeza`
added 31 endpoints, so the step failed with `ROUTE SET CHANGED` on additions only.

## Proof that the refresh hides no rename drift

Run at `5e8a120a` against the previous baseline:

`node tools/std/route-match.ts --emit <tmp> --compare std/reports/baseline-routes.json --map std/map`

- `+` lines (routes in code, not in the translated baseline): 31, listed below
- `-` lines (baseline routes missing, or present with different guards): **0**

All 207 pre-rename routes still exist, translated, with identical guards.

## Refresh

The file was regenerated with the tool's own generator, not edited by hand:

`node tools/std/route-match.ts --emit std/reports/baseline-routes.json`

It now lists 238 routes, and the comparison against it exits 0. The pre-rename inventory used by
plans 01-08 and 01-35 stays available as `git show 9a912f24:<std>/reports/baseline-routes.json`.
`baseline-route-consumers.csv` (the STD-03 consumer list) is left as it was: the gate does not read
it. Later rename plans keep working: a route whose map row becomes `applied` is translated from its
old path in this file exactly as before.

WebSocket upgrade paths (`/v1/eventos`) are not part of this set. `route-match.ts` now derives them
from the `WebSocketServer` upgrade handler (`collectUpgradeRoutes`, `apps/api/src/eventos-ws.ts`) and
uses them only to resolve consumers, so their `route-drift-allow.csv` rows were removed. Two external
provider URLs in `packages/ai` test fixtures (OpenAI, embeddings gateway) were added to the allow
list, following the existing OIDC fixture rows.

## Routes added since 01-03

| Method | Path | Declared at |
|---|---|---|
| DELETE | `/v1/management/flow-functions/:*` | `apps/api/src/controllers/flow-functions.ts:47` |
| DELETE | `/v1/management/flows/:*/builder/test-runs` | `apps/api/src/controllers/management-builder.ts:137` |
| DELETE | `/v1/management/flows/:*/resources/:*` | `apps/api/src/controllers/management-flow.ts:609` |
| DELETE | `/v1/management/flows/:*/secrets/:*` | `apps/api/src/controllers/management-flow.ts:672` |
| DELETE | `/v1/management/knowledge-bases/:*` | `apps/api/src/controllers/management-knowledge.ts:48` |
| DELETE | `/v1/management/knowledge-bases/:*/documents/:*` | `apps/api/src/controllers/management-knowledge.ts:95` |
| GET | `/v1/management/flow-functions` | `apps/api/src/controllers/flow-functions.ts:14` |
| GET | `/v1/management/flow-functions/:*` | `apps/api/src/controllers/flow-functions.ts:22` |
| GET | `/v1/management/flow-functions/:*/usage` | `apps/api/src/controllers/flow-functions.ts:29` |
| GET | `/v1/management/flows/:*/ai-model` | `apps/api/src/controllers/management-flow.ts:692` |
| GET | `/v1/management/flows/:*/builder/versions/:*` | `apps/api/src/controllers/management-builder.ts:85` |
| GET | `/v1/management/flows/:*/channel/status` | `apps/api/src/controllers/management-flow.ts:304` |
| GET | `/v1/management/flows/:*/resources` | `apps/api/src/controllers/management-flow.ts:566` |
| GET | `/v1/management/flows/:*/secrets` | `apps/api/src/controllers/management-flow.ts:629` |
| GET | `/v1/management/flows/short-name/:*` | `apps/api/src/controllers/management-flow.ts:255` |
| GET | `/v1/management/knowledge-bases` | `apps/api/src/controllers/management-knowledge.ts:30` |
| GET | `/v1/management/knowledge-bases/:*/documents` | `apps/api/src/controllers/management-knowledge.ts:55` |
| GET | `/v1/management/knowledge-bases/:*/documents/:*` | `apps/api/src/controllers/management-knowledge.ts:61` |
| GET | `/v1/management/satisfaction-surveys/responses` | `apps/api/src/controllers/satisfaction-surveys.ts:15` |
| PATCH | `/v1/management/knowledge-bases/:*` | `apps/api/src/controllers/management-knowledge.ts:42` |
| PATCH | `/v1/management/knowledge-bases/:*/documents/:*` | `apps/api/src/controllers/management-knowledge.ts:82` |
| POST | `/v1/management/flow-functions` | `apps/api/src/controllers/flow-functions.ts:35` |
| POST | `/v1/management/flows/:*/builder/test-runs` | `apps/api/src/controllers/management-builder.ts:121` |
| POST | `/v1/management/flows/:*/resources` | `apps/api/src/controllers/management-flow.ts:579` |
| POST | `/v1/management/flows/:*/secrets` | `apps/api/src/controllers/management-flow.ts:642` |
| POST | `/v1/management/knowledge-bases` | `apps/api/src/controllers/management-knowledge.ts:36` |
| POST | `/v1/management/knowledge-bases/:*/documents` | `apps/api/src/controllers/management-knowledge.ts:72` |
| PUT | `/v1/management/flow-functions/:*` | `apps/api/src/controllers/flow-functions.ts:41` |
| PUT | `/v1/management/flows/:*/ai-model` | `apps/api/src/controllers/management-flow.ts:703` |
| PUT | `/v1/management/flows/:*/resources/:*` | `apps/api/src/controllers/management-flow.ts:593` |
| PUT | `/v1/management/flows/:*/secrets/:*` | `apps/api/src/controllers/management-flow.ts:656` |

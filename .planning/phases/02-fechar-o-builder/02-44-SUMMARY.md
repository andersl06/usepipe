---
phase: 02-fechar-o-builder
plan: 44
subsystem: core, api
tags: [commands, builder, contexts, master-state, flow-id, configuration-caller, buckets, contacts, resources]
requires: [02-40, 02-41]
provides: [Builder/core LIME commands in Blip shape, export router chain flow-id → stateid@]
key-files:
  created:
    - packages/core/src/flow/builder-commands.ts
    - packages/core/src/flow/builder-commands.test.ts
    - packages/core/src/flow/fixtures/export-router-flow-ids.json
    - apps/api/src/domain/builder-commands.ts
    - apps/api/tests/builder-commands.test.ts
  modified:
    - packages/core/src/flow/commands.ts
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/index.ts
    - apps/api/src/domain/engine-services.ts
    - apps/api/src/domain/flow.ts
    - apps/api/src/domain/management/builder-test-run.ts
    - apps/api/src/domain/router.ts
decisions:
  - "Commands whose data lives in the execution (context variables, Master-State, buckets, resources, contact, get /flow-id without shortname) run in the engine; only /flow-id?shortname= and /configuration/caller go to the api"
  - "/contexts and /contacts accept only the conversation's own contact (Pipe id or channel identity by phone digits); others answer failure code 1"
  - "`#expirations` and any `#` key are never listed nor returned (get answers 67)"
  - "Blip `stateid@{flow}` maps to Pipe's `stateId@{flow}`"
  - "/buckets are the bot's (scope global in gravar_memoria); `?expiration=` is milliseconds"
  - "/configuration/caller returns the router's Application config as a JSON string with settings.children[{service, shortName, longName, isDefault}] from roteador_servico; a standalone flow gets settings.flow"
  - "Redirect / Master-State set accept the service name or the service flow's short name (`shortName@msging.net`)"
metrics:
  completed: 2026-09-29
---

# Phase 2 Plan 44: Builder and core commands Summary

Imported Blip flows can now run the Builder and core commands listed in row P5 of the inventory. Responses use Blip's shape: `{method, status, type, resource}`, or `status: 'failure'` with a LIME reason (67 = not found, 1 = general error). This matters because flows read the response JSON directly, for example `{{flowIdMain@resource}}`.

## What runs

| Command | Where | Notes |
|---|---|---|
| `get /flow-id` | engine | the current flow id |
| `get /flow-id?shortname=X` | api | the tenant's live flow with that short name (case-insensitive) |
| `get/set/delete /contexts/{id}/{var}` | engine | own contact only; `stateid@` maps to `stateId@` |
| `get /contexts/{id}[?withContextValues=true]` | engine | collection; no `#` keys |
| `get/set /contexts/{id}/Master-State` | engine → `redirect` | get returns `{service}@msging.net`; set redirects by service name or short name |
| `get /configuration/caller` | api | router `Application` config with `settings.children` |
| `get/set/delete /buckets/{id}[?expiration=ms]` | engine → bucket services | new `bucketDelete` in production and the test run |
| `get /resources/{id}` | engine | JSON text returned as `application/json` |
| `get /contacts/{id}`, `set/merge /contacts` | engine → `mergeContact` | own contact only |

`set /contexts/{contact}/stateid@{flow}` keeps its existing D-55 path.

## Export acceptance

`fixtures/export-router-flow-ids.json` holds the verbatim settings of the "Resetar contextos" block (058b9624-…), with no secrets. The chain is: `get /configuration/caller` → the export's own `ExecuteScript` (maps service to shortName) → 10× `get /flow-id?shortname={{serviceNames@X}}` → 10× `set /contexts/{{contact.identity}}/stateid@{{flowIdX@resource}}`. The core test runs the whole chain through `processInbound`. It checks that all 10 `setFlowState` calls reach the resolved flow ids with `onboarding`. The API DB test checks the api half against real tables: the caller's children, then `/flow-id` of a child short name.

## Verification

- core `npx vitest run`: 18 files, 536 tests passing (13 new in `builder-commands.test.ts`)
- core `tsc` (src + tests): clean
- API `npx tsc -p tsconfig.test.json --noEmit`: clean
- API eslint: only the known `sla.ts` and `channel-of-flow.test.ts` errors
- `apps/api/tests/builder-commands.test.ts` (DB): written, **not run here**; the orchestrator runs it after merge

## Deviations

- The resolution of another contact's context (`/contexts/{other}`) is refused instead of looked up. No flow in the export needs it. A DB lookup can be added later.
- `delete /contexts/{id}/Master-State` answers failure. Pipe returns the contact to the main service by `set`.

## Self-Check: PASSED

---
phase: 02-fechar-o-builder
plan: 38
subsystem: flow-engine
tags: [variables, blip-runtime, P1]
requires: []
provides: [calendar-provider, random-provider, application-provider, tunnel-provider, bucket-provider]
affects: [packages/core/src/flow/context.ts, apps/api/src/domain/flow.ts, apps/management-vite/src/pages/builder/system-variables.ts]
key-files:
  modified:
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/context.test.ts
    - packages/core/src/flow/editor.test.ts
    - apps/api/src/domain/flow.ts
    - apps/api/src/domain/management/builder-test-run.ts
    - apps/api/tests/flow-actions.test.ts
    - apps/api/tests/router.test.ts
    - apps/management-vite/src/pages/builder/system-variables.ts
    - apps/management-vite/tests/builder-painels.test.ts
decisions:
  - "application.identifier = flow short_name; domain fixed 'msging.net' so imported `{{application.identifier}}@msging.net` equals `{{application.identity}}`; instance 'pipe'"
  - "tunnel.* only behind a router (as Blip); identity/originator = contact id (Pipe has no tunnel identity), owner = router, destination = service"
  - "bucket.<id> reads the contact-scoped SetBucket document first, then the tenant-global one"
  - "calendar.dayOfWeek returns the English day name, per the Builder catalog text '(Em inglês)'"
completed: 2026-09-28
---

# Phase 02 Plan 38: P1 variable providers Summary

The engine now resolves `calendar.*` (36 names, GMT-0, with `tomorrow`/`yesterday`), `random.guid/integer/string`, `application.*` (flow short name), `tunnel.*` (router services only) and `bucket.<id>` (reads what SetBucket stored). The API loads the bot identity for real inbound runs and for Builder test runs. The UI catalog marks those 49 variables as supported.

## What now runs

- `packages/core/src/flow/context.ts`: five new default providers; `FONTES_SUPORTADAS` includes them, so the import report no longer flags `variavel:calendar|random|application|tunnel|bucket`. `Context.application` is `{ identifier, routerIdentifier? }`.
- `apps/api/src/domain/flow.ts`: `loadApplicationIdentity(tx, flowId, routerId)` reads the `short_name` values, scoped by id and RLS. It is passed into the inbound context and the Builder test-run context. A test run has no router, so `tunnel.*` is null there.
- Export check: `context.test.ts` takes the exported ProcessCommand/SetVariable settings (`tunnel.identity`, `application.identity`, `application.identifier`, `random.guid`) and confirms they resolve. `ownerIdentity: '{{application.identifier}}@msging.net'` comes out equal to `from: '{{application.identity}}'`.

## Tests

- `packages/core`: vitest 493/493 passed; `tsc --noEmit` and the tests tsconfig are clean; eslint is clean.
- `apps/management-vite`: 422/422 node tests passed; typecheck is clean; eslint on the touched files is clean.
- `apps/api`: `tsc -p tsconfig.test.json` is clean; eslint on the touched files is clean. **DB tests were written but not run here**:
  - `tests/flow-actions.test.ts` › "fills application, bucket, calendar and random; tunnel stays empty without a router"
  - `tests/router.test.ts` › "Give a router service its own and the router short names for application.* and tunnel.*" (includes the cross-tenant RLS check)

## Deviations from Plan

- [Rule 1] `editor.test.ts` used `{{calendar.date}}` as its example of an unsupported source. It now uses `{{secret.token}}`, because `calendar` is supported now.

## Deferred

- `calendar.plus/minus <n> <unit>` manipulation (listed in `schemas.md`, not among the 36 catalog names).
- Bot time zone for `calendar.*` stays GMT-0, as the Blip catalog describes; the bot time zone belongs to P2.
- `application.shortName/url/imageUri` (portal-only per the inventory) are not provided.
- `calendar.dayOfWeek`: the catalog says English, `schemas.md` says 0–6. English names were chosen; change it if Blip runtime evidence shows numbers.

## Self-Check: PASSED
Commits c0428bae, 6d693b41 and d405c54c exist on the worktree branch; all listed files exist.

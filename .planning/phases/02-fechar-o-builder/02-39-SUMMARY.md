---
phase: 02-fechar-o-builder
plan: 39
subsystem: flow-engine
tags: [blip-runtime, engine, builder, script-sandbox, desk]
requires: []
provides:
  - SurveyMessage and ForwardMessageToDesk in the action provider
  - SendRawMessage with any channel MIME (import report + channel serialization)
  - SetVariable.expiration persisted
  - builder:stateExpiration and builder:actionExecutionTimeout read by the engine
  - full {{ticket.*}} after ForwardToDesk/CreateTicket
  - LocalTimeZoneEnabled + bot time zone (builder:#localTimeZone) in the script isolate
affects: [02-40 (P3 Desk reads may reuse ticketOfConversation), P5 (/contexts listing must skip the '#expirations' key), P9 (fuso already reaches the sandbox)]
key-files:
  created:
    - packages/core/src/flow/engine-contracts.test.ts
    - apps/api/tests/engine-contracts.test.ts
  modified:
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/manager.ts
    - packages/core/src/flow/editor.ts
    - packages/core/src/flow/actions.test.ts
    - apps/api/src/domain/flow.ts
    - apps/api/src/domain/script-sandbox.ts
    - apps/api/tests/script-sandbox.test.ts
    - apps/management-vite/src/pages/builder/configuration-sections.ts
    - apps/management-vite/src/pages/builder/panel-configuration-variables.tsx
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/tests/builder-painels.test.ts
decisions:
  - Variable expirations live inside the persisted variables map under the reserved key '#expirations' (no migration)
  - builder:stateExpiration expires the saved block via the same mechanism, renewed on every input
  - SurveyMessage is sent as a select menu (1-3/1-5, stars or numbers, or Recomendaria/Não recomendaria)
  - Scripts run with local time pinned to UTC, or to the bot zone when LocalTimeZoneEnabled
metrics:
  completed: 2026-09-28
---

# Phase 02 Plan 39: P2 small engine contracts Summary

This plan adds the engine contracts that imported Blip flows rely on at runtime. `SurveyMessage` and `ForwardMessageToDesk` are now in the provider. `SendRawMessage` takes any MIME the channel can send, and `SetVariable.expiration` persists. The engine also reads `builder:stateExpiration` and `builder:actionExecutionTimeout`, `{{ticket.*}}` carries the full Ticket document, and scripts run in the bot time zone when `LocalTimeZoneEnabled` is on.

## What now runs

| Item (INVENTARIO §5.3 P2) | Where | Behavior |
|---|---|---|
| `ForwardMessageToDesk` | `actions.ts` | No-op that succeeds. Pipe already sends messages from a queued conversation or one with an agent to Desk (`flow.ts` returns before the bot). |
| `SurveyMessage` | `actions.ts` | Sends `surveyContent` as a `select` menu. Options follow `scale` (`OneToThree`/`OneToFive`, stars or `…Number`). The recommendation type gets the two captured answers. The reply arrives as the next input. |
| `SendRawMessage` with any MIME | `editor.ts`, `flow.ts` | The import report no longer flags every type other than text/plain. It flags only literal MIMEs the channel cannot send, and a `{{var}}` type is decided at run time. `toChannelOutput` parses raw JSON text once, so location and web link work through the raw path. |
| `SetVariable.expiration` | `context.ts` | Deadlines are stored in `variables['#expirations']` (JSON), so they persist wherever `variables` is saved: execution, router context and ProcessHttp resume. Expired keys are dropped at the start of each input and on read. The key is hidden from the agent handoff note. |
| `builder:stateExpiration` | `context.ts`, `manager.ts` | `setStateId` saves the block with this TimeSpan as its expiration. Each input renews it. After the idle time the user restarts at the root. `stateSaved` in the API honors it. |
| `builder:actionExecutionTimeout` | `manager.ts` | Replaces the 30 s default per action, capped at the 60 s input limit. |
| `ticket.*` | `flow.ts` `ticketOfConversation` | `forwardForAttendance` returns `id`, `sequentialId` (per tenant), `customerIdentity`, `agentIdentity`, `provider`, `status` (Blip enum mapped from `conversa.estado`), `team`, `storageDate`, `openDate`, `statusDate`, `firstResponseDate`, `closeDate`, `closed`, `priority`, `tags`, `unreadMessages`. |
| `LocalTimeZoneEnabled` + bot time zone | `actions.ts` `botTimeZone`, `script-sandbox.ts` | `ScriptRequest.timeZone` is the bot zone when the setting is on, otherwise `UTC`. The zone comes from `builder:#localTimeZone`: a Windows id is mapped, an IANA id is used as is, and anything else defaults to São Paulo. A prelude in the isolate pins local `Date` methods to that zone whatever the host zone is: getters, setters, `getTimezoneOffset`, `toString`, `toLocale*` and `new Date(y, m, …)`. |
| UI | `configuration-sections.ts`, panel | "Expiração da sessão" and "Tempo limite de ações" are now available and editable. They store TimeSpan text, as Blip does. |

The export's usages covered by P2 are the one `SendRawMessage` with `{{messageComponent@type}}`/`{{messageComponent@content}}` and the 53 × `LocalTimeZoneEnabled:false`. Both resolve in `engine-contracts.test.ts` (fixture excerpt) and in the API DB test.

## Verification (run in the worktree)

- `packages/core`: `vitest run` gave 498/498 passing (15 files); `typecheck` exited 0; `lint` exited 0.
- `apps/api`: `tsc --noEmit` passed for both `tsconfig.json` and `tsconfig.test.json`. `tests/script-sandbox.test.ts` passed 36/36, including 3 new time zone tests; it was run with a throwaway config that skips the DB globalSetup. `lint` found 2 errors, both pre-existing in unrelated files (`sla.ts`, `channel-of-flow.test.ts`), which I left alone.
- `apps/management-vite`: typecheck and lint passed, and 422/422 tests passed.
- **Not run (needs Postgres):** `apps/api/tests/engine-contracts.test.ts`. It covers raw web link delivery, the persisted `#expirations` and the `{{ticket.*}}` document after ForwardToDesk. The orchestrator must run it.

## Deviations from Plan

**1. [Rule 1 - Bug] Raw location and web link failed in channel serialization.** `toChannelOutput` read raw JSON text as an object only for select and media. It now parses the raw content once for every type. Fixed in `flow.ts` (commit 1cf35cc0).

**2. [Rule 2 - Security] Tenant filter on `sequentialId`.** The new ticket query filters the count by `tenant_id` explicitly instead of relying on RLS.

No migration was needed.

## Deferred / known ceilings

- In the sandbox, `new Date('2026-01-01T10:00')` (text without an offset) still parses in the host zone. This is marked with a `ponytail:` comment.
- `SurveyMessage` answers are not stored as satisfaction answers, because Blip's server-side handling of them is not in the bundle. They are only the next input.
- The header comment of `context.ts` still says "variable expiration is not stored". I left it alone to avoid a merge conflict with 02-38, which edits the same line. The orchestrator can drop that phrase after merging.
- The Builder test-run debug view shows the `#expirations` key among the variables.
- `ticketOfConversation` overlaps with what P3 (02-40) may build for `get /tickets/{id}`. It is exported so P3 can reuse it.

## Self-Check: PASSED

- Commits c534a956, 1cf35cc0 and c29a3bfb exist on the worktree branch.
- The created files exist: `packages/core/src/flow/engine-contracts.test.ts` and `apps/api/tests/engine-contracts.test.ts`.

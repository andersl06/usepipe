---
phase: 02-fechar-o-builder
plan: 45
subsystem: api, core
tags: [forward-to-desk, attendance, queue-choice, availability, engine-services, builder-test-run]
requires: [02-40, 02-41]
provides: [ForwardToDesk NoAgentAvailable/OutOfAttendanceHour, queue choice by contact.extras.teams, shared availability checks]
key-files:
  created:
    - apps/api/tests/desk-availability.test.ts
  modified:
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/manager.test.ts
    - packages/core/src/flow/editor.test.ts
    - apps/api/src/domain/queue-entry.ts
    - apps/api/src/domain/engine-services.ts
    - apps/api/src/domain/flow.ts
    - apps/api/src/domain/desk-commands.ts
    - apps/api/src/domain/management/builder-test-run.ts
    - apps/api/tests/engine-services.test.ts
    - apps/api/tests/builder-test-run.test.ts
decisions:
  - "Availability checks run only for the exits the attendance block has (as in Blip): a block without NoAgentAvailable/OutOfAttendanceHour exits keeps opening the ticket, which waits in the queue"
  - "Queue destination = explicit filaId, else first matching regra_fila, else the active queue named by contact.extras.teams (case-insensitive), else the inbox default"
  - "OutOfAttendanceHour (queue horario_id schedule, exceptions included; no schedule = always open) is checked before NoAgentAvailable (online agents of the queue, same query as get /teams/agents-online)"
  - "engineServices owns the checks for production and the Builder test run; each side supplies only queueOfHandoff (which queue a handoff would choose)"
metrics:
  completed: 2026-09-29
---

# Phase 2 Plan 45: P6 full human attendance Summary

`ForwardToDesk` now produces the two Blip statuses the Builder already offered as exits:
`NoAgentAvailable` and `OutOfAttendanceHour`. A handoff also picks its queue from
`contact.extras.teams`, which is how the real export chooses it: it runs `MergeContact extras.teams`
four times before the handoff. Production and the Builder's "Testar" panel run the same checks
through `engineServices`.

## What was built

- **core** (`b3b18760`):
  - `unavailabilityExits` reads which availability exits the current block has. `ForwardToDesk`
    passes them as `unavailableWhen`.
  - A `DeskUnavailable` error from the service sets `desk_forwardToDeskState_status` to its status
    and opens no ticket. Any other failure still sets `Error`.
- **api / queue-entry** (`2975644a`, WIP):
  - `chooseQueue` / `chooseQueueOfConversation` pick the queue in this order: explicit queue, then
    attendance rules, then `extras.teams`, then the inbox default. `enterQueue` uses them.
  - `queueUnavailability` returns the first failed check: the queue schedule (`dentroDoExpediente`),
    then agents online. For agents online it reuses the P3 query `teamsWithAgentsOnline`, now exported
    from `desk-commands.ts`, where it also backs `get /teams` and `get /teams/agents-online`.
- **api / shared path** (`cc3d3792`):
  - `engineServices.forwardForAttendance` runs the checks in `isolate` and throws `DeskUnavailable`
    outside it, so a missing agent is not treated as a database error.
  - The side-specific `EngineEffects.queueOfHandoff` reports which queue a handoff would choose:
    - production: `chooseQueueOfConversation`, which reads the contact after this inbound's
      `MergeContact`;
    - Builder test run: `chooseQueue` over the in-memory test contact, with no inbox default, against
      the tenant's real schedule and online agents (read-only).

## Verification

- core vitest: 17 files, 528 tests passed. This includes the 4 availability-exit tests in
  `manager.test.ts` and the new fixture test in `editor.test.ts`. The fixture test covers the
  export's `MergeContact extras.teams` + `ForwardToDesk {}` handoff: the merge happens before the
  forward, no check is requested, and the flow waits on the desk block.
- API `npx tsc -p tsconfig.test.json --noEmit`: clean. Core `tsc --noEmit`: clean.
- API eslint: only the 2 known pre-existing errors (`sla.ts`, `channel-of-flow.test.ts`).
- DB-backed tests were written but not run (the orchestrator runs them after merge):
  - `apps/api/tests/desk-availability.test.ts` (8 tests):
    - `extras.teams` routes the handoff; an unknown team falls back to the inbox default;
    - `NoAgentAvailable` and `OutOfAttendanceHour` open no ticket and follow the matching exit;
    - an open queue with an agent online opens the ticket;
    - a block without the exits still opens the ticket;
    - direct tests of `chooseQueue` and `queueUnavailability`.
  - `apps/api/tests/builder-test-run.test.ts`: a new test-run case over the same checks.
  - `apps/api/tests/engine-services.test.ts`: 3 new cases with `queueUnavailability` mocked. The
    file has no queries of its own, but the API vitest global setup needs a database.

## Deviations

- The WIP commit `2975644a` ran the checks separately in `flow.ts` and in `builder-test-run.ts`.
  `cc3d3792` moved them into `engineServices` so that "Testar" and production share one path.
- The P3 query stays in `desk-commands.ts` and is exported; it is not duplicated. This touches one
  hunk near `listTeams`, which may conflict slightly with 02-43's work in that file.

## Self-Check: PASSED

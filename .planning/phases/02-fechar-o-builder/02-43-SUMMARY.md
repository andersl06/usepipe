---
phase: 02-fechar-o-builder
plan: 43
subsystem: api, core
tags: [desk-commands, process-command, blip-vocabulary, P4]
requires: [02-40, 02-41]
provides: [Desk write commands in Blip's vocabulary]
key-files:
  created:
    - apps/api/src/domain/desk-write-commands.ts
    - apps/api/tests/desk-write-commands.test.ts
  modified:
    - packages/core/src/flow/commands.ts
    - packages/core/src/flow/commands.test.ts
    - apps/api/src/domain/desk-commands.ts
    - apps/api/src/domain/engine-services.ts
    - apps/api/tests/engine-services.test.ts
decisions:
  - "The bot only changes its own conversation's ticket: an empty id (unset {{ticketId}}), the conversation id or its sequentialId name it; another ticket is a LIME failure 66"
  - "Expected refusals answer LIME failures (64 invalid argument, 66 not allowed, 67 not found) instead of throwing, because imported flows branch on status"
  - "change-status Open (assign an agent) is refused: distribution chooses the agent; /transfer ignores agentIdentity for the same reason"
  - "/close on an already closed ticket applies only the tags (Blip's use: finish a ticket the customer closed)"
  - "set /tickets[/{customerIdentity}] always opens the current contact's ticket through enterQueue (idempotent)"
metrics:
  completed: 2026-09-29
---

# Phase 2 Plan 43: Desk write commands Summary

A bot can now send the Desk write commands of an imported Blip flow to `postmaster@desk.msging.net`, and they run on Pipe data. The commands are `set /tickets[/{customerIdentity}]`, `/tickets/change-status[-without-redirect]`, `/tickets/{id}/close`, `/tickets/{id}/transfer` and `/attendance-survey-answer`. They use Blip's vocabulary and answer with Blip's `{method,status,type,resource}` shape. Successes return the ticket as `application/vnd.iris.ticket+json`.

## What was built

- **Routing (core, `commands.ts`):** five `desk.*` rows are routed only for the Desk recipient with `set`. `change-status` is matched before `/tickets/{customerIdentity}`. `/tickets//close` gets an empty id. The Desk `/transfer` wins over `pipe.tickets.transfer` when the recipient is the Desk. An optional named group that did not match is no longer turned into the string `'undefined'`.
- **Handlers (api, `desk-write-commands.ts`):** these run through the same `TicketEffects` as the `pipe.tickets.*` routes. In production that means `enterQueue`/`transbordar` and `closeInTransaction` on the real conversation. In the Builder test run it means the in-memory conversation.
  - `change-status`:
    - `ClosedClient` → closed by `cliente`
    - `ClosedClientInactivity` → closed by `inatividade`
    - `ClosedAttendant` → closed by `atendente`
    - `Waiting` → enters the queue
    - `Open` → failure 66
  - `/close`: applies `tags` first, then closes as the customer unless `status` says otherwise.
  - `/transfer`: finds the `team` by queue name, ignoring case, among this tenant's active queues only.
  - `/attendance-survey-answer`: accepts a 1-5 `rating`/`score`/`value`/`answer` and a `comment`/`text`. It records through `recordSatisfactionAnswer` into `pesquisa_satisfacao_resposta`, with the same status vocabulary as the native survey block.
- **Wiring:** `executeCommand` checks `DESK_WRITE_COMMANDS` after the reads and passes `recordSatisfactionAnswer` from the effects. `desk-commands.ts` exports `ticketById` so the write responses reuse the same ticket query as the reads.

## Export fixture

The core test `commands.test.ts` covers the "Logica - Atendimento finalizado pelo cliente" block, with its settings copied verbatim from the export: `change-status` by `{{sequentialIdFromTicket}}` and `/tickets/{{ticketId}}/close` with an unset ticket id. It checks that both commands route correctly and that their resources resolve.

The DB test `desk-write-commands.test.ts` runs the full export chain on a published flow: `get /tickets?$filter=customerIdentity…` → `ExecuteScript` → `SetVariable {{ticket@sequentialId}}` → change-status → close. The only difference from the export is `{{tunnel.identity}}` → `{{contact.identity}}`, because Pipe fills `tunnel.*` only when the flow sits behind a router.

## Verification

- `packages/core` vitest: 17 files, 525 tests passed.
- `apps/api` `tests/engine-services.test.ts` (no DB): 11 passed, 5 of them new Desk-write tests.
- `apps/api` `npx tsc -p tsconfig.test.json --noEmit`: clean. Lint on the touched files: clean.
- **Not run here (needs a database):** `apps/api/tests/desk-write-commands.test.ts` (5 tests). The orchestrator runs it after the merge.

## Deviations / left out

- Assigning a specific agent (`change-status Open` + `agentIdentity`, `/transfer` + `agentIdentity`) is not implemented. The queue's distribution chooses the agent.
- The bot cannot change another conversation's ticket.
- The `/attendance-survey-answer` resource shape is not documented by Blip: no public doc and no bundle evidence. The accepted keys are a lenient guess.

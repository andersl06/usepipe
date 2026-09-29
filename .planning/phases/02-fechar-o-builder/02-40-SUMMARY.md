---
phase: 02-fechar-o-builder
plan: 40
subsystem: flow-engine / commands
tags: [blip, desk, process-command, routing]
requires: []
provides: [command-router-by-to, desk-read-commands]
affects: [02-P4 desk writes, 02-P5 builder/core commands, 02-P6 NoAgentAvailable, 02-P7 scheduler/broadcast]
key-files:
  created:
    - packages/core/src/flow/commands.ts
    - packages/core/src/flow/commands.test.ts
    - apps/api/src/domain/desk-commands.ts
    - apps/api/tests/desk-commands.test.ts
  modified:
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/index.ts
    - apps/api/src/domain/flow.ts
    - apps/api/src/domain/management/builder-test-run.ts
    - apps/management-vite/src/pages/builder/actions-of-block.ts
    - apps/management-vite/tests/builder-actions.test.ts
decisions:
  - Command routing is one table (COMMAND_ROUTES in @pipe/core: recipient + method + path regex -> route name) plus handlers keyed by route name in the api. To add a command, add a row and a handler.
  - Pipe-vocabulary /tickets/{id}/... routes accept any recipient. The bare /tickets/{id} route now answers only get.
  - Desk reads return the whole LIME response ({method,status,type,resource}), because exported scripts parse resource.items.
completed: 2026-09-28
---

# Phase 02 Plan 40: P3 — command routing by `to` and Desk read commands

`ProcessCommand` and `SendCommand` now go through a small router keyed by recipient (`to`), method and URI pattern. Desk reads are answered from Pipe data in Blip's shapes: tickets, teams, agents online and attendants.

## What now runs

| Command (`to: postmaster@desk.msging.net`) | Route | Answer |
|---|---|---|
| `get /tickets?$filter=…` | `desk.tickets.list` | collection of `application/vnd.iris.ticket+json`, newest first. Filters: `customerIdentity`, `status`, `team`, `id` (`eq`, joined by `and`, parentheses allowed). Open tickets only unless `$closed=true`. `$take` (default 20, max 100) and `$skip` apply. |
| `get /ticket/{id}` · `get /tickets/{id}` | `desk.tickets.get` | `application/vnd.iris.ticket+json`. If the ticket is missing, not a UUID, or belongs to another tenant, the answer is a LIME failure with reason 67 (no exception). |
| `get /teams` · `get /teams/agents-online` | `desk.teams.list` / `desk.teams.agentsOnline` | collection of `application/vnd.iris.desk.team+json` `{name, agentsOnline}` covering the active queues. `agentsOnline` counts active members whose `status_atendente` is `online`. |
| `get /attendants` | `desk.attendants.list` | collection of `application/vnd.iris.desk.attendant+json` `{identity, fullName, email, teams, status, ticketsInService}` |

Ticket mapping: a conversation is a ticket. `id` is the conversation UUID. `customerIdentity` is the contact id, the same value as `contact.identity`. `status` maps as follows:

- `na_fila` becomes Waiting.
- `atribuida` becomes Assigned.
- `em_atendimento` and `em_espera` become Open.
- `encerrada` depends on who closed it: ClosedAttendant, ClosedClient, ClosedClientInactivity or Transferred. This is the same map the `desk:` block uses.

Other fields: `team` is the queue name; `storageDate`, `openDate`, `firstResponseDate` and `closeDate` come from the conversation timestamps; `closed`, `closedBy` and `tags` are filled too. `agentIdentity` uses the Blip format `email%40domain@blip.ai`. `sequentialId` counts the tenant's conversations, the same approach as the `desk:` block ticket. Fields with no value are left out, so `exists` conditions such as `ticket@openDate` behave as they do in Blip.

`customerIdentity` also accepts a channel identity such as `5511…@wa.gw.msging.net` or the bare number. It is resolved through `contato_identidade`.

Every query filters by `tenant_id` explicitly and also runs under RLS through `noTenant`.

The routing is also used in these places:
- The builder test run answers Desk reads from the tenant's real queues and agents. They are read-only, and the test contact has no tickets. Pipe ticket writes in the test run still go to the in-memory conversation.
- The builder editor no longer marks routed Desk reads as "external dependency". It uses `matchCommand` from `@pipe/core`.

Unchanged: the `pipe.tickets.changeTags/transfer/status/priority` routes, `get /tickets/{id}` without a Desk `to` (it still returns Pipe's conversation row), and `set /contexts/…/stateid@…`. Unknown URIs still fail with `A URI '…' não é executada no Pipe.`

## Export coverage

The three distinct Desk reads in the production export are `get /teams`, `get /tickets?$filter=customerIdentity eq '{{tunnel.identity}}'` (3 uses) and `get /teams/agents-online` (2 uses). `packages/core/src/flow/commands.test.ts` runs their settings verbatim (fixture excerpt) through `processInbound`: each routes to its handler, and the response is stored for the scripts that parse `resource.items`. The test supplies `tunnel`/`application` providers because the real ones come from 02-38 (P1).

## Deviations from Plan

1. **[Rule 1 - Bug] The bare `/tickets/{id}` route only answers `get`.** Before, `set /tickets/change-status` (Desk write, P4) matched `/tickets/{id}` and silently returned the conversation row. It now fails as an unknown URI until P4 registers it. Commit 92ad32f5.
2. **[Rule 1] Stricter matching of the Pipe routes.** The old `endsWith` check accepted `/tickets/a/b/status`. The regex table no longer accepts it.

## Deferred / known gaps

- **`ownerIdentity`, `provider`, `unreadMessages`, `priority` (int) and `parentSequentialId` are not in the ticket.** Pipe has no bot identity yet (P1 adds `application.identity`), and its priority vocabulary differs. Nothing is invented.
- **There is no synthetic "Default" team.** Blip always has one, and the export maps "Outros Assuntos" to "Default". In Pipe the queues are the tenant's real ones. P6 decides how queues are chosen.
- **`/teams/agents-online` returns every active queue, including those with 0 online.** The export's scripts only read `agentsOnline` by name. It is unconfirmed whether Blip filters out the empty ones.
- **`lastAttendance` (the `desk:` block ticket in flow.ts) still sends `agentIdentity` as a raw e-mail.** The export's script `agent.split('@')[0].replace('%40','@')` expects the Blip format that the new commands use. Not changed here (outside the command path).
- **`sequentialId` is a count.** A per-tenant sequence column is the upgrade path (marked `ponytail:` in `desk-commands.ts`).
- Other §3.1 Desk reads (`/tickets/{id}/messages`, `/attendance-queues`, …) are not routed.

## Verification

- `packages/core`: `vitest run` gave 15 files and 491 tests passed; `tsc --noEmit` and eslint `src/flow` were clean.
- `apps/api`: `tsc -p tsconfig.test.json --noEmit` was clean. eslint on the changed files was clean; 2 errors already existed in `sla.ts` and `channel-of-flow.test.ts` and are outside this plan. `vitest run tests/flow-platform-actions.test.ts` (no DB) gave 2 passed.
- `apps/management-vite`: `tsc --noEmit` was clean, and `node --test tests/*.test.ts` gave 422 passed and 0 failed.
- **Not run (needs Postgres):** `apps/api/tests/desk-commands.test.ts` (6 tests: teams and agents-online per tenant, a pause drops the count, attendants, ticket list/filters/`$closed`/channel identity/status, ticket get plus the cross-tenant 67, unsupported filter), and the existing `flow-actions.test.ts` (pipe.tickets routes after the dispatch change). The orchestrator must run both.

## Commits

- 60c8f122 feat(02-40): route bot commands by recipient, method and URI
- 92ad32f5 fix(02-40): bare /tickets/{id} route only answers get
- 1e3a227a feat(02-40): answer Desk read commands from Pipe data in Blip shapes

## Self-Check: PASSED

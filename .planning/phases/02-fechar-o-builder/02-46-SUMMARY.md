---
phase: 02-fechar-o-builder
plan: 46
subsystem: core, api, db
tags: [scheduler, broadcast, event-track, tunnel, clicktracker, delayed-jobs, P7]
requires: [02-43, 02-44]
provides: [P7 LIME commands in Blip shape, reusable delayed-job runner for P8]
key-files:
  created:
    - packages/core/src/flow/scheduling-commands.test.ts
    - packages/core/src/flow/fixtures/active-notification-schedule.json
    - packages/db/drizzle/0053_agendamento_e_eventos.sql
    - apps/api/src/delayed-jobs.ts
    - apps/api/src/domain/scheduling-commands.ts
    - apps/api/src/domain/scheduled-messages.ts
    - apps/api/tests/scheduling-commands.test.ts
    - apps/api/tests/scheduling-commands-memory.test.ts
  modified:
    - packages/core/src/flow/commands.ts
    - packages/core/src/flow/builder-commands.ts
    - packages/db/src/schema/automation.ts
    - packages/db/drizzle/meta/_journal.json
    - apps/api/src/domain/engine-services.ts
    - apps/api/src/domain/flow.ts
    - apps/api/src/domain/management/builder-test-run.ts
    - apps/api/src/servidor.ts
decisions:
  - "The agendamento_mensagem row is authoritative; a BullMQ delayed job (queue pipe-delayed) only wakes the api at `when`, and a 60 s sweep fires overdue rows (lost job, or a job that fired before the inbound transaction committed)"
  - "At most once: the row is claimed (agendada → executada) before sending; per-recipient outcomes go to `resultado`, and all-failed ends as `falhou`"
  - "A scheduled message goes through sendMessage on the contact's open conversation (window rule, outbox, events); a WhatsApp template (Blip `application/json` `type: template`) with no open conversation goes through triggerMessageActive; free text with no open conversation fails for that recipient"
  - "`{lista}@broadcast.msging.net` as `to` sends to every contact of the lista_distribuicao (same tables ManageList writes); lists are stored by bare name"
  - "`set .../recipients` creates the list when missing (like ManageList) and accepts only this tenant's contacts (Pipe id, channel identifier or phone digits)"
  - "get /tunnels/{id} runs in the engine: only the contact's own tunnel resolves; originator is `{phone}@wa.gw.msging.net` when the contact has a phone"
  - "set /entrypoint/encode answers text/plain with the click tracker's short URL, reusing the flow's link for the same destination"
  - "The Builder test run keeps schedules, events and lists in memory and never schedules a real message"
metrics:
  completed: 2026-09-29
---

# Phase 2 Plan 46: P7 scheduling and broadcast Summary

An imported Blip flow can now send the scheduler, broadcast, analytics, tunnel and click tracker
commands. They answer in Blip's `{method, status, type, resource}` shape, with LIME failures
64 (invalid argument), 67 (not found) and 1 (general error). A scheduled message fires later
through Pipe's normal outbound path. This is the native replacement for Blip's hosted active
notification (`sendnotificationblipemployee`).

## What runs

| Command (`to`) | Where | Notes |
|---|---|---|
| `set /schedules` (scheduler) | api | `{when, name?, message:{id?, to?, type, content}}`; upsert by message id (rescheduling replaces the job); `to` defaults to the contact |
| `get/delete /schedules/{id}` | api | `application/vnd.iris.schedule+json`, status `scheduled/executed/canceled/failed`; delete cancels |
| `get/set /lists`, `get/delete /lists/{l}` (broadcast) | api | `lista_distribuicao`; identities `{l}@broadcast.msging.net` |
| `get/set /lists/{l}/recipients`, `get/delete .../recipients/{id}` | api | `$skip/$take`; members answered as `{digits}@wa.gw.msging.net` (or the Pipe id) |
| `set /event-track`, `get /event-track[/{category}]` (analytics) | api | table `evento_rastreado`; daily counts per action, `startDate/endDate/$take` |
| `get /tunnels/{id}` (tunnel) | engine | `application/vnd.iris.tunnel+json {owner, originator, destination}` |
| `set /entrypoint/encode` (clicktracker) | api | short URL from `link_rastreado` (SSRF guard of the click tracker) |

- **Core:** 10 new rows in `COMMAND_ROUTES`. The Builder recognises them automatically through
  `isPipeCommand`, so there are no front-end edits.
- **API:**
  - `scheduling-commands.ts` holds the handlers and the `MessagingEffects` port. It has two
    implementations: `databaseMessagingEffects` for production and `memoryMessagingEffects` for
    the Builder test run.
  - `executeCommand` got one extra optional parameter, `messaging`. `EngineEffects.messaging` is
    wired in `flow.ts` and `builder-test-run.ts`.
- **Delayed jobs (`delayed-jobs.ts`)** are reusable by P8. The API is `registerDelayedJob(kind,
  {run, sweep?})`, `scheduleDelayedJob(kind, key, runAt, data)` and `cancelDelayedJob`, backed by
  a BullMQ queue `pipe-delayed` with a sweep scheduler. In memory mode, process timers replace the
  queue, and the sweep only runs with `PIPE_AGENDADOS_EM_MEMORIA=1`. `servidor.ts` registers the
  scheduled-message kind, starts the consumer and sweep, and closes them on shutdown.
- **Migration 0053** (`0053_agendamento_e_eventos.sql`, journal idx 53, when 1790100000000) creates
  `agendamento_mensagem` and `evento_rastreado`, with RLS `tenant_isolado` (subquery form) and
  grants to `pipe_app`. The Drizzle schema is in `automation.ts`.

## Fixture

`fixtures/active-notification-schedule.json` models the three notification blocks named in the
plan, rebuilt natively:
- add the contact to a list;
- schedule a WhatsApp template to `{{contact.identity}}`;
- record an `event-track`;
- read the schedule back.

The core test checks that every action is a Pipe command, that the four commands route in order,
and that the template and the schedule id resolve. **The data is invented:** reading the real
export was denied by the environment's PII guard, so the settings are not verbatim. According to
the inventory, the export's "[HTTP] Agendar Notificação Ativa" block is a `ProcessHttp` to Blip's
hosted service, not a LIME command. It keeps working as plain HTTP only while the Blip account
exists.

## Verification

- core `npx vitest run`: 19 files, 553 tests passed (7 new). Core `tsc --noEmit`: clean.
- API `npx tsc -p tsconfig.test.json --noEmit`: clean. API eslint: only the known `sla.ts` and
  `channel-of-flow.test.ts` errors.
- `apps/api/tests/scheduling-commands-memory.test.ts`: 7 tests passed, run with a temporary config
  that has no DB global setup. The suite's normal config needs the database.
- **Not run (DB):** `apps/api/tests/scheduling-commands.test.ts`, 6 tests:
  - lists and recipients across tenants;
  - schedule CRUD and rescheduling;
  - a due text send going to `mensagem` + outbox exactly once;
  - a broadcast list send with per-recipient failure;
  - a template opening a conversation;
  - event-track counts and click-tracker link reuse.
  Also run `packages/db` `rls.test.ts`, which checks the new tables' policies.

## Deviations / left out

- The export itself could not be read (permission denied), so the fixture is a reconstruction with
  invented data.
- Blip's exact shapes are not documented locally for three things: the `/entrypoint/encode`
  resource and response, the schedule `failed` status, and the `get /event-track` categories
  shape. Pipe's choices are lenient guesses.
- `TrackEvent` actions still go only to `execucao_passo`. `get /event-track` reads only what
  `set /event-track` wrote.
- A broadcast send exists only as a scheduled message's `to`. The Builder has no action that sends
  a message straight to a list.
- There is no cap on how far ahead `when` can be. In memory mode, delays beyond ~24 days are left
  to the sweep.

## Self-Check: PASSED

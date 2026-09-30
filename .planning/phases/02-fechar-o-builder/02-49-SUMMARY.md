---
phase: 02-fechar-o-builder
plan: 49
subsystem: core, api, db, management
tags: [input-expiration, inactivity, delayed-jobs, builder-test-run, P8]
requires: [02-46]
provides: [P8 input expiration end to end]
key-files:
  created:
    - packages/core/src/flow/input-expiration.ts
    - packages/core/src/flow/input-expiration.test.ts
    - packages/db/drizzle/0056_expiracao_da_entrada.sql
    - apps/api/src/domain/input-expiration.ts
    - apps/api/src/domain/input-expiration-job.ts
    - apps/api/tests/input-expiration.test.ts
    - apps/api/tests/input-expiration-memory.test.ts
    - apps/management-vite/tests/builder-input-expiration.test.ts
  modified:
    - packages/core/src/flow/manager.ts
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/editor.ts
    - packages/core/src/flow/satisfaction-survey.ts
    - packages/core/src/flow/index.ts
    - packages/db/src/schema/automation.ts
    - packages/db/drizzle/meta/_journal.json
    - packages/contracts/src/management-flow.ts
    - apps/api/src/domain/flow.ts
    - apps/api/src/domain/management/builder-test-run.ts
    - apps/api/src/servidor.ts
    - apps/management-vite/src/pages/builder/conteudo.ts
    - apps/management-vite/src/pages/builder/panel-content.tsx
    - apps/management-vite/src/pages/builder/test-panel.tsx
    - apps/management-vite/src/pages/builder/test-panel-logic.ts
    - apps/management-vite/src/pages/builder/panel-block.css
decisions:
  - "The expiration input is an empty text/plain message tagged with the expired block (`metadados['inputExpiration.stateId']`), like Blip's InputExpirationHandler. An empty input skips validation and does not match 'input exists', so the block's default output (or an 'input does not exist' condition) runs"
  - "The engine drops an expiration whose block is not the contact's saved block (IsValidateState)"
  - "Pipe choices: the input variable is not overwritten with the empty content, and a native satisfaction survey block that expires records `sem_resposta`"
  - "The execution row is authoritative (`entrada_expira_em`, `entrada_expira_bloco`, migration 0056). Every processed input rewrites or clears both columns (Blip: an answer cancels, a processed input schedules). The delayed job `expiracao-entrada` is keyed by execution, so re-arming replaces it"
  - "At most once: the job claims the row (clears both columns) only when it is `aguardando`, due, and the row is not locked by a customer message (`for update skip locked`). The engine then runs through `runFlowInInbound`, which keeps the human-ownership, pending-ProcessHttp and outbox rules. `id_provedor` = `expiracao-entrada:{execution}:{armed epoch}`, and `execucao_passo_entrada_uk` rejects a repeat"
  - "The Builder test run has no timer. `expireInput: true` feeds the same expiration input, only when the waiting block has one (otherwise 409). `debug.inputExpiration` tells the panel to show 'Expirar entrada'"
metrics:
  completed: 2026-09-29
---

# Phase 2 Plan 49: P8 input expiration Summary

A block that waits for input can now have an inactivity time (Blip `input.expiration`, stored as
`h:m` text such as `"0:1"` or `"8:0"`). If the customer does not answer in time, the bot continues
through the block's outputs as if no answer came, the way Blip does.

## How it runs

- **Core (`input-expiration.ts`).** It has these helpers:
  - `inputExpirationSeconds(state)` implements `HasInputExpiration`: the block has an input, is not `bypass`, and has a valid TimeSpan.
  - `pendingInputExpiration(flow, stateId)` returns the expiration waiting on the current block.
  - `inputExpirationMessage` / `inputExpirationStateId` build and read the tagged empty input.
  - `minutesToInputExpiration` / `inputExpirationToMinutes` convert between minutes and `h:m` for the editor (1..1380 minutes, as in Blip).

  `InboundMessage` gained an optional `metadados`.

  `manager.ts` changes, all additive:
  - it returns early when the expired block is not the saved block;
  - it skips writing `input.variable` on expiration;
  - it passes `timedOut` to the survey interpreter.

  `editor.ts` no longer reports `entrada:expiracao` as unsupported.
- **API, arming (`domain/input-expiration.ts`).** `runFlowInInbound` calls
  `syncInputExpiration(tx, tenant, execution, flow, waitingStateId)` after every processed input. It
  arms the columns and schedules the job, or clears the columns and cancels the job. It clears them
  on failure, on handoff, or while a ProcessHttp is pending; the resume runs it again.
- **API, firing (`domain/input-expiration-job.ts`).** `fireInputExpiration(tenant, execution)` is
  registered in `servidor.ts` as the delayed-job kind `expiracao-entrada`, with a sweep over overdue
  rows (`dueInputExpirations`). Once it has claimed a row, it:
  - ignores closed conversations;
  - reloads the published flow;
  - runs `runFlowInInbound` with `inputExpiration: { stateId }`.

  After commit it nudges delivery and enqueues any ProcessHttp it suspended. No `mensagem` row is
  written for the expiration. The trail is in `execucao_passo`.
- **Builder test run.** New contract fields:
  - `TestRunRequest.expireInput` fires the expiration at once;
  - `TestRunDebug.inputExpiration` is `{stateId, seconds}` when the waiting block has one.

  Both use the same `pendingInputExpiration` rule production uses to arm.
- **Gestão:**
  - The input card has a "Tempo de inatividade" switch with a "Tempo limite (minutos)" field (1..1380). The value is stored as `h:m`, and an invalid value shows a hint and stores empty text, which the engine ignores.
  - The test panel shows "O bloco expira após … sem resposta." with an **Expirar entrada** button.

## Migration

`0056_expiracao_da_entrada.sql` (journal idx 56, when 1790130000000):
- adds `execucao_fluxo.entrada_expira_em timestamptz` and `entrada_expira_bloco text`;
- adds the partial index `execucao_fluxo_entrada_expira_idx` (`where entrada_expira_em is not null`).

The existing `tenant_isolado` RLS on `execucao_fluxo` already covers it. The Drizzle schema is in
`automation.ts`.

## Verification

- core `npx vitest run`: 21 files, 576 tests passed. That includes `input-expiration.test.ts`, 10 tests: parsing, h:m conversion, default output on expiration, variable kept, a stale block ignored, validation skipped, survey `sem_resposta`, and the import report. Core `tsc --noEmit`: clean.
- API `npx tsc -p tsconfig.test.json --noEmit`: clean. API eslint: only the known `sla.ts` and `channel-of-flow.test.ts` errors.
- `apps/api/tests/input-expiration-memory.test.ts`: 4 tests passed. It ran with a temporary config that has no DB global setup, and covers arm, clear/cancel, the memory timer firing, and re-arming replacing the job.
- Gestão:
  - `tsc --noEmit`: clean.
  - `eslint .`: clean.
  - `pnpm test`: 420 tests passed, including the 4 in `builder-input-expiration.test.ts`.
  - `vite build`: OK.
- **Not run (DB): `apps/api/tests/input-expiration.test.ts`, 6 tests.** The orchestrator should run it with migration 0056 applied:
  - arm → due → exactly one firing under concurrency → re-arm the next block → an answer clears it;
  - an answer before the expiration cancels it;
  - an expiration for a block the contact left is ignored;
  - no firing once an agent owns the conversation (the row is claimed and cleared);
  - tenant isolation;
  - the Builder test run: 409 when nothing is pending, `debug.inputExpiration`, `expireInput`, and no production rows.

## Deviations / left out

- The real export was not read, so the fixtures use invented data shaped like the Blip templates (`"0:1"`, an "input exists" output plus a default output).
- The SDK source is not available locally. The empty `PlainText` input, the `inputExpiration.stateId` metadata name and the `-inputexpirationtime` job id suffix come from knowledge of blip-sdk-csharp. The suffix is visible in `portal.js`, which filters schedules ending in `-inputexpirationtime`.
- Pipe choices that may differ from Blip:
  - the input variable is not cleared on expiration;
  - survey blocks record `sem_resposta`;
  - the claim accepts a 2 s clock tolerance.
- If a ProcessHttp suspends during an expiration run, the resumed input is rebuilt from `process_http_execucao.entrada` without the tag. It is still an empty text, so outputs behave the same. Only the variable-keep rule does not apply after the resume.
- In memory queue mode (`PIPE_FILAS=memoria`), a lost timer is only recovered when `PIPE_AGENDADOS_EM_MEMORIA=1` turns the sweep on, the same as for P7.

## Self-Check: PASSED

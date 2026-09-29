---
phase: 02-fechar-o-builder
plan: 41
subsystem: api, core
tags: [queue-rules, enqueue, engine-services, builder-test-run, closure]
requires: [02-39, 02-40]
provides: [core queue-rule evaluator, enterQueue, engineServices, closure actor]
key-files:
  created:
    - packages/core/src/distribution/queue-rule.ts
    - packages/core/src/distribution/queue-rule.test.ts
    - apps/api/src/domain/queue-entry.ts
    - apps/api/src/domain/engine-services.ts
    - apps/api/tests/queue-entry.test.ts
    - apps/api/tests/engine-services.test.ts
  modified:
    - apps/api/src/domain/flow.ts
    - apps/api/src/domain/inbound.ts
    - apps/api/src/domain/conversation.ts
    - apps/api/src/domain/distribution.ts
    - apps/api/src/domain/management/builder-test-run.ts
    - apps/api/src/domain/management/registrations.ts
    - apps/api/src/domain/management/actions/regras.ts
    - apps/management-vite/src/lib/rule-queue.ts
    - apps/api/tests/builder-test-run.test.ts
  deleted:
    - apps/api/src/domain/management/rule-queue.ts
    - apps/management-vite/tests/rule-queue.test.ts
decisions:
  - "Queue destination = explicit queue, else first matching regra_fila, else inbox default; applies to bot handoff (ForwardToDesk without filaId, /status na_fila, failure fallback) and inbound without bot"
  - "An explicit priority (inherited on transfer or set by the bot) wins over regra_prioridade; rules only fill sem_prioridade"
  - "Bot closure is recorded as encerrada_por=cliente (Blip ClosedClient); /status accepts closedBy='inatividade'"
metrics:
  completed: 2026-09-28
---

# Phase 2 Plan 41: One runtime path Summary

The attendance rules edited in the Builder and in Cadastros now pick the queue at runtime. All three ways into a queue go through one `enterQueue`. Production and the Builder "Testar" panel build their engine services with the same `engineServices`. The bot's closure records the actor, so `ClosedClient` and `ClosedClientInactivity` can now occur.

## What changed

1. **Queue rules evaluated.** The rule module now lives in `@pipe/core` (`distribution/queue-rule.ts`). `destinationQueue` maps `{message, contact:{name,email,phone,extras}}` onto the stored `mensagem` / `contato.nome|email|telefone|atributos.<key>` fields. Both old copies were broken: the API passed English keys and the front passed `name` where the rule expected `nome`. Both copies are deleted. The management-vite `lib/rule-queue.ts` is now just a re-export of core, so no UI caller changed. The NUL bytes in the old API file are gone.
2. **Single enqueue path.** `apps/api/src/domain/queue-entry.ts` exports `enterQueue` and `loadActiveQueueRules`. Order of work: resolve the queue, do a one-shot `update ... where fila_id is null`, apply priority rules, write `criada` plus `enfileirada` or `transferida_fila` (with `regra_fila_id` in `dados` when a rule chose the queue), run the caller's `beforeDistribution` hook, then `distributeConversation`. Callers:
   - bot `transbordar`
   - inbound without bot (the conversation is now born with `fila_id null` and enters immediately)
   - Desk `transferConversation` to a queue

   `distributeConversation` now returns the assigned agent.
3. **Shared engine services.** `apps/api/src/domain/engine-services.ts` exports `engineServices`, `executeCommand`, `TicketEffects`, `contactPatch`, `knowledgeMatch` and `isFlowOfTenant`. One builder owns:
   - callHttp, runScript, runFlowFunction and respondWithKnowledge
   - `pipe.tickets.*` validation, with one route list
   - MergeContact mapping and the SetBucket 64 KB limit

   Each side passes only its effects: SQL for production, the in-memory store for the test run. The 02-40 registry (`commands.ts`, `desk-commands.ts`) is untouched and used as-is. Divergences this closes in the test run:
   - `/transfer` now validates the UUID and the tenant queue.
   - `/status` refuses agent-only states.
   - `setFlowState` is implemented.
   - `forwardForAttendance` honours `filaId` and resolves the rule queue.
4. **Closed-by-client statuses.** `closeInTransaction(..., closedBy)` defaults to the old rule (`atendente`, else `transferencia`). The bot's `/status encerrada` passes `cliente`, or `inatividade` when the resource says `closedBy: 'inatividade'`.

## Behaviour changes

- An attendance rule can now send a bot handoff or a no-bot inbound conversation to a queue other than the inbox default. When nothing matches, the default applies as before.
- A Desk transfer to a queue now runs distribution. The new conversation can come back as `atribuida` (the API returns that state). This includes the transferring agent if they are eligible.
- Priority rules no longer overwrite a priority that is already set: one inherited on transfer, or one set by the bot's `/priority`.
- A bot `/status encerrada` used to become `Transferred`. It is now `ClosedClient`.
- A no-bot inbound conversation is distributed inside the entry, before the inbound message row is written. Previously distribution ran after it, in the same transaction. The redundant second distribution for new conversations is skipped.

## Verification

- `packages/core`: `vitest run` gives 523/523, including the 11 new queue-rule tests. `pnpm run typecheck` (src + tests) is clean. eslint on `distribution/` is clean.
- `apps/api`: `pnpm run typecheck` (`tsconfig.test.json`) is clean. `vitest run tests/engine-services.test.ts` gives 6/6 (no DB). eslint on all touched files is clean. Full `pnpm run lint` fails only on 2 errors in files this plan did not touch (`management/sla.ts:61` `_alvo`, `tests/channel-of-flow.test.ts:487` `_semBot`).
- `apps/management-vite`: `tsc --noEmit` is clean. `tests/builder-queues.test.ts` gives 30/30.
- **Not run (need Postgres; the orchestrator runs them):**
  - `apps/api/tests/queue-entry.test.ts` (new)
  - `apps/api/tests/builder-test-run.test.ts` (new case)
  - regressions: `flow.test.ts`, `flow-actions.test.ts`, `transferencia.test.ts`, `inbound.test.ts`, `priority.test.ts`, `engine-contracts.test.ts`, `desk-commands.test.ts`, `ponta-a-ponta.test.ts`, `registrations-attendance.test.ts`

## Deviations from Plan

- The plan asked for a small "test mode" switch. It is implemented as an effects object (`EngineEffects`), because the whole difference between production and the test run is where writes land.
- Front items from the audit are left to 02-42 or later: the `acaoTemDependenciaExterna` regex in `actions-of-block.ts` and the Desk "Finalizado pelo atendente" label.
- No migration was needed.

## Known Stubs

None.

## Self-Check: PASSED
- Commits 027ddb4c and dd139bee exist on the worktree branch.
- The created files listed above are present.

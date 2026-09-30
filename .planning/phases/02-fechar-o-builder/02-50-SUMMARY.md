---
phase: 02-fechar-o-builder
plan: 50
subsystem: flow-engine, script-sandbox
tags: [P9, blip-runtime, ExecuteScriptV2, script-sandbox, time-zone]
requires: [02-39, 02-47, 02-48]
provides:
  - context.getVariableAsync / setVariableAsync / deleteVariableAsync in ExecuteScriptV2
  - time.parseDate / time.dateToString / time.sleep in ExecuteScriptV2, in the bot time zone
  - request.fetchAsync response with success, headers, getHeader() and jsonAsync()
key-files:
  created:
    - packages/core/src/flow/script-variables.ts
    - packages/core/src/flow/script-variables.test.ts
    - apps/api/src/domain/script-v2-api.ts
    - apps/api/tests/script-v2-api.test.ts
  modified:
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/index.ts
    - apps/api/src/domain/script-sandbox.ts
    - apps/api/src/domain/mtls.ts
    - apps/api/tests/flow-actions.test.ts
    - apps/api/tests/builder-test-run.test.ts
decisions:
  - "The context bridge (`ScriptVariables`) is built in core from the flow `Context` and travels in `ScriptRequest.variables`; `engine-services.ts` is untouched, so production and the Builder test run share it automatically"
  - "`getVariableAsync` reads like `{{...}}` (any source, `@property`) without `VariableOptions`, so `secret.*` is null and `resolveSecret` is never called (P11)"
  - "Names containing `#` (the internal `#expirations` key) and `__proto__` cannot be written or deleted; reading `#...` fails the name parser"
  - "`setVariableAsync` expiration: a number is milliseconds, a text is a .NET TimeSpan; stored like `SetVariable.expiration`"
  - "`time.sleep` blocks only the isolate thread (`applySyncPromise`), 5 s per call, and a sleep past the action deadline never wakes up, so the time limit ends the script"
  - "No migration, no new package"
metrics:
  completed: 2026-09-29
---

# 02-50: P9 Script V2 (without Handlebars) Summary

`ExecuteScriptV2` now has the Blip V2 API that INVENTARIO §2.4 listed as missing: `context.*Async`,
`time.*` and the bot time zone. `request.fetchAsync` also returns the response fields Blip's own
templates use. `ExecuteTemplate` is unchanged and waits on the owner's package approval (see the end
of this summary).

## API surface inside the isolate (V2 only; V1 gets none of it)

| Global | Behaviour |
|---|---|
| `context.getVariableAsync(name)` | Same read as `{{name}}`: any source (`input.content`, `contact.name`, `resource.x`, `config.x`, …) and `@property`. A missing variable returns `null`. `secret.*` returns `null`. |
| `context.setVariableAsync(name, value, expiration?)` | Writes a flow context variable the way `SetVariable` does. A string is stored as is. `null`/`undefined` becomes `''`. A `Date` goes through `time.dateToString`. Objects and arrays become JSON, and anything else goes through `String()`. `expiration` is milliseconds (number) or TimeSpan text (`'01:00:00'`) and persists in `#expirations`. |
| `context.deleteVariableAsync(name)` | Same as `DeleteVariable`, and it also clears the variable's expiration. |
| `time.parseDate(text, { format?, culture?, timeZone? })` | Returns a `Date`. It understands .NET custom formats (`yyyy yy MMMM MMM MM M dddd ddd dd d HH H hh h mm m ss s f… F… tt t K z zz zzz g 'literal' \x`) and the one-letter standard formats. Without `format` it reads ISO text (with or without an offset), then the culture's date/time patterns, then RFC text that carries a zone. Text without an offset is read in `timeZone`, or in the script zone when `timeZone` is not given. `timeZone` accepts IANA or Windows ids (the `WINDOWS_TIME_ZONES` map). Bad text, formats or zones throw a Portuguese error. |
| `time.dateToString(date, { format?, culture?, timeZone? })` | Accepts a `Date`, epoch ms or text. The default format is `yyyy-MM-dd'T'HH:mm:ss.fffffffK`, which gives `Z` in UTC and `-03:00` in São Paulo. Day and month names come from the isolate `Intl`. The d/D/t/T/g/G/f/F/M/Y patterns are built in for `pt-BR`, `en-US` and the invariant culture. |
| `time.sleep(ms)` | Waits synchronously and returns nothing, and `await` also works. It allows at most 5 000 ms per call. |
| Script zone | `request.timeZone` from 02-39: the bot zone (`builder:#localTimeZone`) when `LocalTimeZoneEnabled` is on, otherwise UTC. `Date` and `time.*` share it. |
| `request.fetchAsync` response | Keeps `status` and `body`, and adds `success` (2xx), `headers` (lower-case), `getHeader(name)` and `jsonAsync()`. `RespostaDeSaida` in `mtls.ts` gained an optional `headers`. |

`time` and `context` are frozen. The References to the host (sleep, context bridge) live only in the
prelude closure. The script cannot reach them.

## Limits and security

- All existing isolate limits stay: 100 MB memory, the V2 timeout of 10 s, 8 concurrent isolates,
  10 fetches per run, SSRF/mTLS gate, 64 KB result.
- `context.*Async` allows at most `MAX_CONTEXT_CALLS` = 200 calls per run, and each value may be at most 64 KB.
  Calls made after the run ended (a timed-out script) are refused, so they never touch the context.
- `time.sleep` counts against the action timeout. A script that sleeps past the deadline is killed at
  the deadline (test: 2 × 1 s with a 1.5 s limit fails with "tempo limite").
- P11: the script never sees a secret. Neither form reaches `resolveSecret`: the core test and the API
  test both assert this, and the DB test also checks that the secret value appears nowhere in the
  test-run response.
- A script cannot read or write `#expirations`, and it cannot write names that contain `#` or `__proto__`.

## Verification (worktree)

- core: `npx vitest run` 572/572 (21 files, including 6 new tests in `script-variables.test.ts`); `npx tsc --noEmit -p .` clean.
- API: `npx tsc -p tsconfig.test.json --noEmit` clean. `eslint .` shows only the 2 known errors (`sla.ts`,
  `channel-of-flow.test.ts`). DB-free run: `script-sandbox.test.ts` 36/36, the new
  `script-v2-api.test.ts` 13/13, `engine-services.test.ts` 14/14 and `function-library.test.ts` 4/4.
  I used a throwaway config without the DB globalSetup for this run.
- Gestão: not touched. No UI text referred to the V2 API.

## DB tests for the orchestrator (not run here)

- `apps/api/tests/flow-actions.test.ts`, new case "ExecuteScriptV2 reads and writes the flow
  context and uses time.* in production (P9)". It runs through the WhatsApp webhook and expects the bot message
  `V2: gravado script-v2|||03/02 14:05 []`.
- `apps/api/tests/builder-test-run.test.ts`, new case "ExecuteScriptV2 context.*Async and time.*
  behave as in production, and never reveal secret.* (P9)". It creates a secret through the API
  (needs migration 0055 from 02-48, and the file now sets `PIPE_CHAVES_SEGREDO` like `flow-secrets.test.ts`), runs the same script in the
  test run and checks the debug variables. It also checks that the secret appears nowhere in the response.

## Merge risks

- `packages/core/src/flow/actions.ts`: one import line, one spread line in `runScriptAction`, and
  `WINDOWS_TIME_ZONES` is now `export const`. 02-49 and 02-51 edit other parts of the file.
- `packages/core/src/flow/context.ts`: an additive block after `ScriptRequest` (one new optional field and the
  `ScriptVariables` interface).
- `packages/core/src/flow/index.ts`: one `export *` line after `actions.js`. 02-51 may add a line nearby.
- `engine-services.ts` and `_journal.json` were not touched, and there is no migration.
- `apps/api/tests/flow-actions.test.ts` has 2 more actions in the root block and 1 new test. If 02-49 or 02-51 also extend
  that fixture, keep both.

## Provisional points (no Blip capture yet)

- The exact default format of `dateToString` and the unit of `setVariableAsync`'s expiration are my
  reading of the SDK. The bundle only shows `context.setVariableAsync(name, value)` (14× in templates)
  and `response.jsonAsync()`/`response.headers`. Both are marked `ponytail:` in `script-v2-api.ts`.
- `getVariableAsync` returns `null` for a missing variable, the same way missing input variables arrive.
- `ExecuteBlipFunction` (a library function run as an action) runs as V2, so `time.*` exists there,
  but it has no `context`. If Blip functions turn out to use `context`, pass `variables` in `engine-services.ts`
  `runFlowFunction`. A library function called from inside a V2 script sees the script's `context`.
- `time.parseDate` fills a missing date part with 0001-01-01, where .NET would use today's date. This only
  matters for time-only formats.

## What ExecuteTemplate still needs (blocked on the `handlebars` package)

The current `executeTemplate` in `packages/core/src/flow/actions.ts` only swaps `{{path}}` from
`inputVariables` (JSON-parsed). For Blip parity (`tr.js:836`, "transformação de texto com a
biblioteca Handlebars") it needs:

1. **Owner approval of `handlebars`** (not in the lockfile). Core is pure and runs in the API
   process, so compile it with `Handlebars.create()` (an isolated environment per call, or a cached
   one without globally registered helpers). Set `noEscape: true` because the output is text, not
   HTML, and `strict: false`.
2. **Data**: every `inputVariables` value JSON-parsed when possible (what the current code already
   does), exposed by its full name. `contact.name` must be reachable as `{{contact.name}}`, so dotted
   input names become nested objects, and the raw name must stay as a fallback.
3. **Block helpers**: `#if`, `#unless`, `#each` (with `@index`/`@key`/`this`) and `#with` are built into
   Handlebars. Blip-specific helpers should be registered only once a capture shows them (none
   are in the bundle today).
4. **Safety**: Handlebars compiles templates into JS functions in the host process. Either run the compiled
   template inside the existing isolate by injecting the Handlebars runtime source as a prelude, which reuses the time and memory limits, or cap
   template size and output size (64 KB, like scripts) and forbid prototype access, which is the Handlebars ≥4.6 default
   (`allowProtoPropertiesByDefault: false`). The isolate route is safer and costs one more
   prelude.
5. **Errors**: a compile error must fail the action with a Portuguese message, as the other actions do. The
   Builder's editor for ExecuteTemplate needs no change.
6. **Tests**: `#if`/`#each` over a JSON input, nested paths and a missing variable (renders
   empty), plus the same case in the Builder test run.

## Self-Check: PASSED

- Commits e5e236f3 (core) and 7b54fa8a (API) exist on branch `worktree-agent-a8f1150dd289bbed1`.
- Created files exist: `script-variables.ts`, `script-variables.test.ts`, `script-v2-api.ts`,
  `script-v2-api.test.ts`.

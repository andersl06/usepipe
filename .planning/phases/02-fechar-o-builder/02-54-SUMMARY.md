---
phase: 02-fechar-o-builder
plan: 54
subsystem: flow-engine, script-sandbox
tags: [P9, blip-runtime, ExecuteTemplate, handlebars]
requires: [02-48, 02-50]
provides:
  - ExecuteTemplate rendered with Handlebars (built-in #if/#unless/#each/#with) in production and in the Builder test run
  - ServicosDoMotor.renderTemplate / TemplateRequest (core) and renderFlowTemplate (api)
key-files:
  created:
    - packages/core/src/flow/template.ts
    - packages/core/src/flow/template.test.ts
    - apps/api/src/domain/template-sandbox.ts
    - apps/api/tests/template-sandbox.test.ts
  modified:
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/index.ts
    - apps/api/src/domain/script-sandbox.ts
    - apps/api/src/domain/engine-services.ts
    - apps/api/package.json
    - pnpm-lock.yaml
    - apps/api/tests/flow-actions.test.ts
    - apps/api/tests/builder-test-run.test.ts
decisions:
  - "Handlebars runs inside a fresh isolated-vm isolate per render, not in the API process"
  - "`handlebars@^4.7.9` is a dependency of `@pipe/api` only. Core stays pure and only builds the data"
  - "Objects render the way Handlebars.js renders them (`[object Object]`), no longer as JSON"
  - "No migration. The Builder (Gestão) is not touched"
metrics:
  completed: 2026-09-30
---

# 02-54: P9b ExecuteTemplate with Handlebars Summary

`ExecuteTemplate` now renders the template with Handlebars instead of only replacing `{{path}}`. It
works the same in production (`flow.ts`) and in the Builder test run, because both go through
`engineServices` in `engine-services.ts`.

## How it works

1. **Core** (`template.ts`, `executeTemplate` in `actions.ts`). The engine reads each input variable
   the same way `{{...}}` is read outside an HTTP action (`getVariable` with no `VariableOptions`). It
   JSON-parses each value when it can, and `templateData` builds the data object:
   - every input keeps its raw name, so `{{[contact.name]}}` works;
   - a dotted name also becomes a nested path, so `contact.name` can be written `{{contact.name}}`.
     A more specific input wins over the same field inside a JSON input;
   - a path that crosses a non-object value, or that uses `__proto__`, `constructor` or `prototype`, is
     kept only under its raw name.

   The manager already passes the raw template, without variable substitution. Core then calls
   `services.renderTemplate({ template, data, timeoutMs: 5 000 })`. If that service is missing, the
   action fails with "A ação ExecuteTemplate não está disponível neste fluxo.".
2. **API** (`template-sandbox.ts`, `renderFlowTemplate`):
   - Each render gets a **new isolated-vm isolate** with 64 MB of memory. The time limit is the
     action's 5 s, applied both as the eval timeout and as a wall-clock timer that disposes the isolate.
   - The isolate takes a slot from the same `MAX_ISOLATES` semaphore as scripts. For this,
     `ocuparIsolate`, `liberarIsolate` and `catastrophic` are now exported from `script-sandbox.ts`.
   - The browser build `handlebars/dist/handlebars.min.js` (90 KB) runs as a plain script and defines
     `Handlebars`. It is read from disk once. The V8 code cache from the first compile is reused, so
     later isolates skip parsing it.
   - The template calls `Handlebars.create()` and compiles with `noEscape: true` and `strict: false`.
     It renders with `allowProtoPropertiesByDefault: false` and `allowProtoMethodsByDefault: false`.
   - Only JSON data crosses into the isolate (the template and the data) and only text comes out. The
     isolate has no network, no `context` bridge and no Node globals.
3. **Limits**:
   - The template is at most 64 KB (`MAX_TEMPLATE_BYTES`, checked before a slot is taken).
   - The result is at most 64 KB (`MAX_RESULTADO_BYTES`).
   - Time is limited to 5 s and memory to 64 MB.
   - The isolate slots are shared with scripts.
4. **Errors (Portuguese)**:
   - A Handlebars parse error or a missing helper gives "Não foi possível renderizar o template:
     <Handlebars message>".
   - A timeout gives "O template excedeu o tempo limite de 5 s.".
   - Running out of memory gives "O template excedeu o limite de memória de 64 MB.".
   - Size limits give "O template excede 64 KB." or "O resultado do template excede 64 KB.".
   - In every case the action fails, the same way the other actions do.
5. **P11 (secrets)**: the template never sees a secret. The raw template is not substituted, and an
   input `secret.x` reads `null` without calling `resolveSecret`. The core test, the engine test in
   the API and both DB cases assert this. The DB cases also check that the secret value appears
   nowhere in the test-run response.
6. **Builder**: the Builder had no "não suportado" marker for ExecuteTemplate, and its `info` text
   already said "Renderiza um template Handlebars". The Builder is unchanged.

## Verification (worktree)

- core: `npx vitest run` passed 602/602 tests in 24 files, including the new `template.test.ts` with
  9 tests. `npx tsc --noEmit -p .` is clean.
- API:
  - `npx tsc -p tsconfig.test.json --noEmit` is clean.
  - `eslint .` reports only the known `sla.ts` error.
  - I ran the tests that need no DB with a temporary config without the DB globalSetup, then deleted
    that config. Results: `template-sandbox.test.ts` 10/10 (new; includes an engine case with
    `processInbound` and the real renderer), `script-sandbox.test.ts`, `script-v2-api.test.ts`,
    `engine-services.test.ts` and `function-library.test.ts`. Total 77/77.
- Gestão: not touched.

## DB tests for the orchestrator (not run here)

- `apps/api/tests/flow-actions.test.ts`, new case "ExecuteTemplate renders Handlebars over the input
  variables in production (P9)". It has 3 new root actions for the input `template` and expects the
  bot message `T: template #7: Caneta, Caderno [][]`.
- `apps/api/tests/builder-test-run.test.ts`, new case "ExecuteTemplate renders Handlebars as in
  production and never sees secret.* (P9)". It creates a secret (needs migration 0055), runs the same
  template in the test run and expects `tplSaida = 'template #7: Caneta, Caderno [][]'`. It also checks
  that the secret appears nowhere in the response.

## Merge risks

- `packages/core/src/flow/actions.ts`: one import line after `scriptVariables`, and the body of
  `executeTemplate` only. 02-53 (AI agent) edits other actions in this file.
- `packages/core/src/flow/context.ts`: the new `TemplateRequest` interface goes before
  `ScriptVariables`, and one optional `renderTemplate?` line goes in `ServicosDoMotor` before
  `runFlowFunction`. If 02-53 adds a service in the same place, keep both.
- `packages/core/src/flow/index.ts`: one `export *` line after `script-variables.js`.
- `apps/api/src/domain/engine-services.ts`: one import line and two lines after `runScript`. 02-53
  edits this file too, and both changes are additive.
- `apps/api/src/domain/script-sandbox.ts`: three functions are now `export`ed. No behaviour change.
- `pnpm-lock.yaml` / `apps/api/package.json`: adds `handlebars` and its dependencies (`minimist`,
  `neo-async`, `wordwrap`, optional `uglify-js`; `source-map@0.6.1` was already in the lockfile). If
  another branch changes the lockfile, run `pnpm install` again after the merge rather than merging
  the lockfile by hand.
- `flow-actions.test.ts` / `builder-test-run.test.ts`: the new actions and cases are additive. If
  another plan extends the same root fixture, keep both.

## Provisional points

- Blip's runtime renderer is not captured. It may be Handlebars.Net on the server. I used standard
  Handlebars.js semantics. As a result, an object or array input renders as `[object Object]` or
  `a,b`, while the old Pipe code rendered it as JSON. No Blip-specific helpers are registered, so an
  unknown helper fails with "Missing helper". Add helpers only when a capture shows them.
- Numbers in text (`"007"` → `7`) and `"true"` → `true` come from JSON-parsing each input, which the
  old code already did.

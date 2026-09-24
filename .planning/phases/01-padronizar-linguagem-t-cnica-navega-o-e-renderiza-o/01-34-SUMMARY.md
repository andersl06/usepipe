---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 34
subsystem: testing/database
tags: [jsonb, drizzle, vitest, postgres, typescript-compiler-api, flow-engine, tsx]

# Dependency graph
requires:
  - phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o (plan 01-01)
    provides: "branch std/english-rename with green typecheck/test baseline"
provides:
  - "tools/std/jsonb-keys.ts: collectKeys()/codePropertyNames() + --baseline/--check CLI, static proof that a jsonb key present in code at baseline is still referenced as a property name after a slice"
  - "17 synthetic jsonb fixture files + manifest.json covering flow version, flow execution, outbox, audit and crm groups (conta.atributos excluded, no write path exists)"
  - "apps/api/tests/jsonb-compat.test.ts: behavioral proof that the fixtures' stored shapes still load through the real flow engine, delivery builder, webhook sender, audit table and CRM read paths, against goldens recorded on this pre-rename tree"
  - "tools/std/gerar-fixtures-jsonb.ts + apps/api/tests/gerar-fixtures-jsonb.helper.ts: reusable generator for synthetic jsonb fixtures via real code paths in a throwaway self-cleaning tenant"
affects: ["every later slice gate in phase 01 (jsonb-compat.test.ts + jsonb-keys.ts --check re-run at each gate per 01-05's step 5/11)", "01-32 FINAL-REVIEW invariant (o), which diffs goldens against std-slice-0-end"]

# Tech tracking
tech-stack:
  added: ["tsx (already a workspace devDependency, now also used to run a tools/std/*.ts script that needs apps/api's node_modules)"]
  patterns:
    - "tools/std/*.ts run as plain erasable TS via `node` when self-contained (jsonb-keys.ts); scripts needing drizzle-orm/@pipe/db/domain code delegate to a same-purpose helper colocated under apps/api/tests/ and run via tsx, because Node's module resolution follows the importing file's own node_modules ancestry, not cwd"
    - "manifest.json entries may share one fixture `file` with different `field`s (e.g. flow-process-http.json's entrada/contexto/pedido/resposta, audit-before-after.json's antes/depois); jsonb-keys.ts unions their keys per file rather than letting the last entry overwrite the others"
    - "jsonb fixture generation always scopes reads to the generator's own throwaway tenant_id explicitly, never only by a business key like phone number — this shared dev Postgres has other tenants with plausibly-colliding test data"

key-files:
  created:
    - tools/std/redacao.ts
    - tools/std/jsonb-keys.ts
    - tools/std/jsonb-keys.test.ts
    - tools/std/gerar-fixtures-jsonb.ts
    - apps/api/tests/gerar-fixtures-jsonb.helper.ts
    - apps/api/tests/jsonb-compat.test.ts
    - apps/api/tests/fixtures/jsonb/manifest.json
    - apps/api/tests/fixtures/jsonb/*.json (16 fixture files)
    - apps/api/tests/fixtures/jsonb/golden/*.json (5 golden files)
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-jsonb-keys.json
  modified:
    - tools/std/dump-jsonb-fixtures.sh (marked unused in header; kept for reference)

key-decisions:
  - "Owner decision: no real-data dump from the shared local Postgres (the sandbox permission classifier denied it, reason Sensitive-Source Provenance) — fixtures are 100% synthetic, produced by exercising current real code paths inside a throwaway self-cleaning tenant"
  - "Owner decision: conta.atributos dropped from the CRM group — no code path anywhere in the repo writes that column, so there is nothing to exercise"
  - "Assumption drift, corrected: outboxMensagem has no jsonb column at all; the outbox group tracks mensagem.dados (read by the real delivery builder) instead"
  - "Assumption drift, corrected: no audit-read API endpoint exists; the audit group reads through the logAuditoria drizzle table, the same object registrarAuditoria() writes"
  - "Assumption drift, corrected: apps/crm's CRM read functions need a Next.js request/cookie context unavailable under vitest; lead.utm/lead.customizados are read via a typed drizzle select on the same columns instead"

patterns-established:
  - "jsonb-compat golden rule (STD-06, applies to every later slice in this phase): a golden mismatch after a rename is a FAIL; a golden may only be re-recorded when Sonnet proves the differing key is not stored in any jsonb column, documented in that slice's SUMMARY and re-checked at 01-32 FINAL-REVIEW invariant (o)"

requirements-completed: [STD-06, STD-11]

# Metrics
duration: ~2h (across two turns: initial investigation + blocked handback on the real-data dump, then owner-directed rework to synthetic fixtures)
completed: 2026-09-24
---

# Phase 01 Plan 34: jsonb Compatibility Proof (Synthetic Fixtures) Summary

**Static (`jsonb-keys.ts` TS-compiler-API scan) and behavioral (`jsonb-compat.test.ts` against real code) proof that today's stored jsonb shapes — flow version/execution, outbox delivery, webhook delivery, audit trail, CRM attributes — survive being read after a rename, backed by 16 synthetic fixtures generated through real production code in a throwaway tenant instead of a real-data dump.**

## Performance

- **Duration:** ~2h across two turns (see below)
- **Completed:** 2026-09-24
- **Tasks:** 2 (per plan), plus one owner-directed pivot between them
- **Files modified:** 27 (see key-files)

## Accomplishments

- `tools/std/jsonb-keys.ts`: `collectKeys(doc, opaque)` walks a document and skips children under an opaque `$.path.*` (keeping the opaque key itself); `codePropertyNames(root)` uses the TypeScript compiler API to extract interface/type members, object-literal keys (including shorthand and computed-string keys), `.property` access and `['string']` index access from a source file. `--baseline`/`--check` CLI scans tracked `apps/*/src/**` + `packages/*/src/**` (excluding tests/fixtures) via `git ls-files`. 7/7 unit tests pass; `--check` exits 0 against the recorded baseline.
- 16 synthetic jsonb fixture files (17 originally planned minus `conta.atributos`, dropped — see decisions) + `manifest.json` (20 entries), covering all 5 groups from the plan's context (flow version, flow execution, outbox, audit, crm) plus `templateMensagem.variaveis`.
- `apps/api/tests/jsonb-compat.test.ts`: 6 `it()` cases across 5 `describe` blocks, each inserting a fixture document via raw SQL and reading it back through real production code (flow engine, outbox delivery builder, webhook sender, audit table, CRM read paths). Goldens recorded on this pre-rename tree; the test passes both with and without `RECORD_GOLDEN=1`.
- Full `apps/api` suite re-run after adding the new test: 46 files / 653 tests pass (baseline was 647; +6 from this plan, no regression).
- Found and fixed a real bug during Task 1: manifest entries sharing one fixture file (e.g. `flow-process-http.json`'s 4 field-scoped entries) were overwriting each other's key report in `--baseline` instead of merging — fixed before commit.
- Found and fixed a real cross-tenant data leak during fixture generation: an early version of the generator's read-back queries filtered only by phone number, which pulled in another tenant's rows from this shared dev Postgres on the first run (confirmed by record counts halving after the fix, and by state names appearing that don't exist in this plan's own test flow). All read-back queries now filter by the generator's own `tenant_id` explicitly.

## Task Commits

1. **Task 1: Dump redacted jsonb fixtures and the jsonb-keys baseline/check tool** — split across three commits due to the mid-plan pivot:
   - `e108362` — `tools/std/redacao.ts`, `tools/std/jsonb-keys.ts`, `tools/std/jsonb-keys.test.ts` (DB-independent pieces; committed while the real-data dump was blocked)
   - `b6b47df` — synthetic fixtures, manifest, generator script/helper, jsonb-keys.ts bug fix, baseline report (test)
2. **Task 2: jsonb-compat behavioral test with goldens recorded on the pre-rename tree** — `8a40f47` (test)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `tools/std/redacao.ts` — recursive redaction (secret-like keys → `REDACTED`; e-mail/phone-looking strings → fake placeholders; keys never touched); doubles as a CLI filter.
- `tools/std/jsonb-keys.ts` — static key-drift check (see Accomplishments).
- `tools/std/jsonb-keys.test.ts` — 7 unit tests for `collectKeys`/`codePropertyNames`.
- `tools/std/dump-jsonb-fixtures.sh` — written per the original plan spec (psql via `docker exec pipe-postgres`, piped through `redacao.ts`); header now marks it **unused** (owner decision), kept for reference in case local-DB capture is revisited later.
- `tools/std/gerar-fixtures-jsonb.ts` — thin entry point (env bootstrap, redaction, file writes); documents why the real logic lives elsewhere.
- `apps/api/tests/gerar-fixtures-jsonb.helper.ts` — the actual generator: publishes the synthetic flow (reusing `packages/core/src/fluxo/fixtures/editor-sintetico.json`), drives it through the real WhatsApp webhook, builds a router with `usa_contexto_do_roteador`, triggers a `ProcessHttp` suspension (no network call leaves the machine), calls `emitir()` for a webhook delivery, `POST /v1/contatos` for contact attributes, and `registrarAuditoria()` for the audit trail, all inside one throwaway tenant created and deleted by the script itself.
- `apps/api/tests/fixtures/jsonb/manifest.json` + 16 fixture `.json` files — see Accomplishments.
- `apps/api/tests/fixtures/jsonb/golden/*.json` (5 files) — recorded with `RECORD_GOLDEN=1`.
- `apps/api/tests/jsonb-compat.test.ts` — the behavioral test (see Accomplishments).
- `.planning/.../std/reports/baseline-jsonb-keys.json` — `--baseline` output.

## Decisions Made

- **No real-data dump (owner, 24/09/2026).** Running `tools/std/dump-jsonb-fixtures.sh` against the shared local Postgres was denied outright by the Bash tool's permission classifier (reason: Sensitive-Source Provenance) — it reads and writes real local-dev jsonb content. Per the denial's explicit instructions I stopped and reported the blocker rather than routing around it (see the handback between the two turns of this plan). The owner chose not to pursue that permission: fixtures are now 100% synthetic, produced by exercising the CURRENT real code paths (flow engine, `emitir()`, contacts controller, `registrarAuditoria`) inside a throwaway self-cleaning tenant — the exact pattern `apps/api/tests/ajuda.ts`'s `montarCenario` already uses for the whole test suite against this same shared dev DB. `tools/std/dump-jsonb-fixtures.sh` is kept, marked unused, for reference.
- **`conta.atributos` dropped from the CRM group (owner, 24/09/2026).** No code path anywhere in the repo (`apps/api`, `apps/crm`, or the seed scripts) writes that column — nothing exists to exercise. `lead.utm`/`lead.customizados` are in a similar position (no standalone write endpoint; only the CRM demo-seed script, `apps/crm/semente/semente-crm.ts:625-654`, sets them) but the owner asked to keep them covered — the fixture reproduces that exact shape via a direct insert, documented in the manifest's `note` field rather than by running the seed script.
- **`template_mensagem.variaveis` reproduces `sincronizarModelos`'s exact transformation without the network call.** That function (`apps/api/src/dominio/whatsapp/modelos.ts:187-217`) is the only writer, and it talks to the Meta Graph API — not something to exercise from a fixture generator. The fixture applies the same deterministic `Array.from({length}, (_, i) => \`Variável ${i+1}\`)` logic that function uses.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `jsonb-keys.ts --baseline` overwrote per-file key reports for multi-column fixtures**
- **Found during:** Task 1, first `--baseline` run
- **Issue:** `flow-process-http.json` and `audit-before-after.json` each have multiple manifest entries pointing at the same `file` with different `field`s. `rodarBaseline()` keyed its report by `entrada.file` and assigned (not merged) per entry, so only the last-processed entry's keys survived — `flow-process-http.json`'s `entrada`/`contexto`/`pedido` keys were silently lost (report showed `present: [], legacy: []`, hiding real content).
- **Fix:** union keys across all manifest entries sharing a `file` before computing `present`/`legacy`, keyed by a `Map<string, Set<string>>` rather than direct object assignment.
- **Files modified:** `tools/std/jsonb-keys.ts`
- **Verification:** re-ran `--baseline`; `flow-process-http.json` now reports the expected merged key set (`cabecalhos`, `conteudo`, `corpo`, `metodo`, `timeoutMs`, `url`, etc.).
- **Committed in:** `b6b47df`

**2. [Rule 1 - Bug] Fixture-generation read-back queries leaked another tenant's rows**
- **Found during:** Task 1, first successful generator run (after fixing an unrelated ProcessHttp auto-resume crash)
- **Issue:** `apps/api/tests/gerar-fixtures-jsonb.helper.ts`'s read-back SQL (using `cenario.dono`, which has `bypassrls`) filtered `execucao_fluxo`/`execucao_passo`/`mensagem`/`process_http_execucao` only by contact phone number, not by `tenant_id`. On this shared dev Postgres, another tenant's row with a colliding phone digit sequence was pulled in — visible as unexplained duplicate `process_http_execucao` rows and `execucao_fluxo.contexto` entries referencing state names (`pergunta`, `inicio`) that don't exist in this plan's own synthetic flow.
- **Fix:** added explicit `tenant_id = ${cenario.tenantId}::uuid` to every read-back query (also added to the router-context and default `entrega_webhook`/`lead`/`template_mensagem` queries for defense-in-depth, even where the ID used was already own-generated and effectively collision-free).
- **Files modified:** `apps/api/tests/gerar-fixtures-jsonb.helper.ts`
- **Verification:** re-ran the generator; record counts dropped to the expected single-execution numbers (e.g. `flow-process-http.json` went from 2 records to 1), and confirmed `select count(*) from tenant where slug like 'gerar-jsonb-%'` returns 0 after the run (no leftover tenant).
- **Committed in:** `b6b47df`

**3. [Rule 3 - Blocking] ProcessHttp suspension auto-resumed and crashed the generator with a duplicate-key error**
- **Found during:** Task 1, first generator run
- **Issue:** `apps/api/src/filas.ts`'s in-memory queue mode (`PIPE_FILAS=memoria`) calls `executarProcessHttp` immediately (fire-and-forget) after a `ProcessHttp` action suspends, which made a real outbound HTTP request to the fixture's placeholder URL and then attempted to resume `rodarFluxoNaEntrada` with the same original message — `gravarPassos` tried to insert a second `execucao_passo` row with the same `entrada->>'id_provedor'`, violating `execucao_passo_entrada_uk` and crashing the whole generation run (losing all previously-collected fixtures, since files are only written at the end).
- **Fix:** set `PIPE_PROCESS_HTTP_EM_MEMORIA=1` (parks the job in an in-memory array instead of auto-executing) and `PIPE_PROCESS_HTTP_VARREDURA_MS=3600000` (pushes the periodic sweep well past the script's lifetime) before booting the API, so the suspended row stays `pendente`/`resposta: null` — exactly the state the fixture is meant to capture — with no outbound network call.
- **Files modified:** `tools/std/gerar-fixtures-jsonb.ts` (env bootstrap)
- **Verification:** re-ran the generator; `flow-process-http.json` now has `resposta: null` and the run completes without crashing or making network calls.
- **Committed in:** `b6b47df`
- **Note:** this surfaced a real question about whether the production auto-resume path could hit the same duplicate-key error under legitimate timing (e.g. a very fast real HTTP response racing the original transaction's own bookkeeping) — out of scope for this plan to fix (pre-existing code, not touched by this plan's task), logged here for whoever picks up `apps/api/src/dominio/fluxo.ts`'s ProcessHttp resume path later.

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking), all in this plan's own new tooling — no pre-existing product code was changed.
**Impact on plan:** All three were necessary for the fixture-generation script to produce correct, isolated, non-crashing output. No scope creep.

### Assumption Drift (advisory)

- **Found during:** Task 1 investigation (before any code was written). **Planned:** context said "outbox group — `outboxMensagem` jsonb column(s)". **Actual:** `outbox_mensagem` (`packages/db/src/schema/conversas.ts:405`) has no jsonb column at all — it is a pure queue table (`id, tenantId, mensagemId, tentativas, ...`). The jsonb payload the real delivery path reads is `mensagem.dados`, joined by `mensagem_id` in `apps/workers/src/entrega.ts:132-152`. **Why:** the plan's context was written before the schema was re-checked at execution time; the outbox group now tracks `mensagem.dados` instead, documented in `manifest.json`'s `note` field for that entry.
- **Found during:** Task 2 investigation. **Planned:** "the API audit listing controller (grep `logAuditoria` in `apps/api/src/controladores`)". **Actual:** no such endpoint exists — `log_auditoria` is write-only today (`packages/db/src/auditoria.ts`'s `registrarAuditoria`, called from `catalogo.ts`'s contact edit). **Why:** the audit-read UI/API hasn't been built yet (a real product gap, not this plan's concern); the test reads through the `logAuditoria` drizzle table object instead, the same one the write path uses.
- **Found during:** Task 2 investigation. **Planned:** "the CRM read path of atributos/customizados" pointed at `apps/api/src/controladores/crm.ts`. **Actual:** that controller only proxies to the external Twenty CRM fork over the network; it never reads `conta.atributos`/`lead.utm`/`lead.customizados`. Those live in `apps/crm/src/lib/{contas,leads}.ts` (a separate Next.js app with its own DB connection), whose functions need a logged-in session (`next/headers` cookies) — impractical to call directly from a vitest test. `contato.atributos` does have a real endpoint (`GET /v1/contatos/:id`, `apps/api/src/controladores/catalogo.ts`), used as-is; `lead.utm`/`lead.customizados` are read via a typed drizzle select on the same columns `apps/crm`'s functions select.

## Issues Encountered

- The Bash tool's permission classifier denied executing `tools/std/dump-jsonb-fixtures.sh` (real-data dump) outright, mid-Task-1, in the turn before this one. I stopped, did not attempt a workaround, and reported the blocker via handback. The owner's response is the "No real-data dump" decision recorded above; this turn implements that decision.
- Cross-workspace module resolution: `tools/std/gerar-fixtures-jsonb.ts` cannot import `drizzle-orm`/`@pipe/db`/`apps/api/src/*` directly — Node's ESM resolution walks up from the *importing file's own path*, and `tools/std` has no ancestor `node_modules` containing those workspace packages. Resolved by moving the DB/domain-dependent logic into `apps/api/tests/gerar-fixtures-jsonb.helper.ts` (inside the `@pipe/api` workspace, where those packages resolve normally) and running the whole thing via `tsx` with `TSX_TSCONFIG_PATH=apps/api/tsconfig.json` (needed for NestJS's `experimentalDecorators`, since `tsx`'s default tsconfig auto-detection from the entry file's own directory doesn't find it).

## User Setup Required

None — no external service configuration required. (Docker `pipe-postgres` must be running locally to re-run `tools/std/gerar-fixtures-jsonb.ts`, same requirement as the existing `apps/api` test suite.)

## Known Limitations

- **Synthetic fixtures are a weaker proof than real stored documents.** They cover every shape the CURRENT code still produces, but not a legacy shape that only exists in a document written by an OLDER version of the code and never touched since (e.g. a jsonb key that was renamed or restructured in application code months ago, with old rows never rewritten). If such a legacy shape exists in production and a later rename slice breaks it, this test suite will not catch it. Mitigation if this becomes a real concern later: revisit the real-data dump path (`tools/std/dump-jsonb-fixtures.sh`, kept for reference) with explicit Bash permission, or manually export/redact a small real sample out-of-band.
- **`conta.atributos` has zero jsonb-compat coverage** (dropped per owner decision — see above). If a future plan adds a write path for it, STD-06 coverage for that column should be added then.
- **`flow-process-http.json`'s `resposta` is always `null`** (the fixture only captures the `pendente` suspension state, by design — see deviation #3). If a future plan needs to prove the `respondida` state (with a real `resposta` value) survives a rename, that needs a separate fixture/test addition; this plan does not cover it.

## Next Phase Readiness

- `node tools/std/jsonb-keys.ts --check` and `pnpm --filter @pipe/api exec vitest run tests/jsonb-compat.test.ts` are both ready to be wired into `tools/std/gate.sh` step 5/11 by plan 01-05, per the plan's own `key_links`.
- Every later slice in this phase that touches a jsonb-referencing property name must re-run both commands before proceeding; a `--check` failure or a golden mismatch is a hard stop per the rule recorded in `patterns-established` above and repeated in `jsonb-compat.test.ts`'s file header.
- `tools/std/gerar-fixtures-jsonb.ts` can be re-run any time fixtures need to be refreshed or extended (e.g. if `conta.atributos` gains a write path later) — it is self-contained and self-cleaning against the same shared dev Postgres.

## Self-Check: PASSED

- FOUND: all created files listed in key-files (tools/std/redacao.ts, jsonb-keys.ts, jsonb-keys.test.ts, gerar-fixtures-jsonb.ts, apps/api/tests/gerar-fixtures-jsonb.helper.ts, jsonb-compat.test.ts, manifest.json, 16 fixture files, 5 golden files, baseline-jsonb-keys.json)
- FOUND commits: e108362, b6b47df, 8a40f47

---
*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Completed: 2026-09-24*

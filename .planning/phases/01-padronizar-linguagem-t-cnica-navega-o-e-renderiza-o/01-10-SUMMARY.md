---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 10
subsystem: api
tags: [rename-map, wire-contracts, drizzle, nestjs, glossary, gate-2]

requires:
  - phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
    provides: "std/GLOSSARY.md and std/CONVENTIONS-EN.md, both Status: APPROVED at gate 1 (01-09)"
  - phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
    provides: "std/wire-contracts.csv (207 endpoint wire-key classifications) and std/map/*.csv candidate inventory (01-08, 01-35)"
provides:
  - "std/PROJECT.md STD-08 language rule, referencing CONVENTIONS-EN.md and the D-03 gate 1 approval"
  - "std/map/{packages-db,packages-contracts,packages-autenticacao,packages-armazenamento,packages-tempo-real,workers,api,infra}.csv: every candidate row proposed at status=proposed (packages-mcp has none to propose)"
  - "std/map/packages-db.csv: 291 wire-key rows covering wire-contracts.csv's rename-with-db-key keys_affected, including the 24 D-45 customer-API-key endpoints"
  - "std/persisted.csv: persisted-wire-11 (contato.atributos jsonb passthrough, D-45)"
  - "std/reports/sample-backend.csv: 10% check-map sample, seed 1"
affects: ["01-11", "01-32", "gate-2 review"]

tech-stack:
  added: []
  patterns:
    - "Mechanical PT->EN translation engine (tokenize by camelCase/snake/kebab boundary, dictionary lookup, style-preserving reassembly) built directly for this plan since D-40 routes proposal work to Sonnet instead of Codex"
    - "check-map's collision key ignores HTTP method and line number - duplicate inventory rows for the same (kind, old, file) must be deduplicated before proposing, and any two different old spellings that translate to the same new value need explicit disambiguation"
    - "wire-key rows share one flat namespace (declared_at is empty) - grammatical-gender/spelling variants of the same field across tables must be merged into one canonical row, not proposed as two colliding rows"

key-files:
  created:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/sample-backend.csv
  modified:
    - .planning/PROJECT.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/packages-db.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/packages-contracts.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/packages-autenticacao.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/packages-armazenamento.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/packages-tempo-real.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/packages-mcp.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/workers.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/api.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/infra.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/persisted.csv

key-decisions:
  - "D-40 override executed directly by Sonnet (no tools/std/codex-run.sh calls): built a standalone tokenize+dictionary+reassemble translation engine instead, validated exclusively against check-map.ts (0 errors, 0 warnings for all 9 scopes at status=proposed)"
  - "Deduplicated 1,719 rows that were the same rename recorded once per literal source occurrence rather than once per (scope, kind, old, file) - check-map's collision key treats repeats as errors"
  - "Resolved real ':paramName' endpoint placeholders from the actual NestJS route decorators (01-08's inventory recorded a generic ':*' for every param)"
  - "D-45 (owner decision, mid-plan): the 24 customer-API-key-reachable endpoints 01-35 had classified 'keep' now rename like any other endpoint (no real customers yet, D-43); their paths were already covered by this plan's generic pass, and 36 new wire-key rows were added for their JSON keys, with contato.atributos kept persisted (jsonb passthrough)"

patterns-established:
  - "PT->EN token dictionary (tools-independent, this plan's own scratch tooling) covering ~450 backend/infra vocabulary items, reusable if a future plan needs the same mechanical pass"

requirements-completed: [STD-01, STD-02, STD-08, STD-10]

duration: ~5h (extensive manual translation-engine build + iterative check-map convergence, no Codex calls per D-40)
completed: 2026-09-24
---

# Phase 1 Plan 10: Backend/infra rename map (gate 2 input) Summary

**Proposed English names for all ~6,270 backend/infra candidate rows across 9 map scopes (packages-db, packages-contracts, packages-autenticacao, packages-armazenamento, packages-tempo-real, workers, api, infra) plus 291 packages-db wire-key rows, by building a standalone PT→EN translation engine and iterating it against check-map.ts until 0 errors/0 warnings; also recorded STD-08 in PROJECT.md and applied the mid-plan D-45 owner decision renaming the 24 customer-API-key endpoints.**

## Performance

- **Duration:** ~5h of iterative engine-building and check-map convergence (no Codex calls, per D-40 owner override)
- **Tasks:** 3 (STD-08, map proposals, Sonnet review) + 1 mid-plan owner decision (D-45)
- **Files modified:** 11 map/persisted/report files + PROJECT.md

## Accomplishments

- **Task 1 (STD-08):** Replaced the legacy "todo em português" Context bullet and updated the Constraints/Key Decisions entries in `.planning/PROJECT.md` to reference `CONVENTIONS-EN.md` and the D-03 gate 1 approval date.
- **Task 2 (map proposals):** Since D-40 routes this plan's proposal work to Sonnet directly (no `tools/std/codex-run.sh`), built a tokenize→dictionary-lookup→style-preserving-reassembly translation engine from scratch (camelCase/PascalCase/snake_case/kebab-case/UPPER_SNAKE detection, Portuguese plural rules including irregular `-ões`/`-ais`/`-ns` forms, positional handling for `"em"` as timestamp-suffix "At" vs. mid-word "in"). Applied all fixed decisions directly (D-12/D-13 callbacks, D-15 webhook KEEPs, D-38 cookie/metric renames, D-10 queue/scheduler-id renames, D-07 script renames, D-04 infra package/app rows), adding 8 missing webhook endpoint rows, 3 missing queue rows, 2 missing root-script rows, and 5 infra package/app rows that 01-08's inventory had not captured. Deduplicated 1,719 rows that were the same rename recorded once per source line instead of once per (scope, kind, old, file). Created 255 `wire-key` rows in `packages-db.csv` for every `rename-with-db-key` key in `wire-contracts.csv`, resolving the 91 generic "(see dominio/gestao/*.ts ...)" pointer rows by extracting the real `.select({...})` column lists from all 27 `dominio/gestao/**` files (157 distinct keys) and the 8 prose type-reference rows by reading their declared TypeScript interfaces.
- **Task 3 (Sonnet review):** Reviewed 100% of every breaking kind (endpoint, error-code, cookie, metric, queue, job-name, wire-key, package, app, subpath-export, script, and every D-05 class/interface prefix) plus a 10% check-map sample (`--seed 1`, 635 rows, `std/reports/sample-backend.csv`). Found and fixed roughly 90 missing-vocabulary and mistranslation issues surfaced by the error-code review (see Deviations), then re-ran the same fixes against every scope.
- **D-45 (mid-plan owner decision):** Renamed the 24 customer-API-key-reachable endpoints (`/v1/conversas*`, `/v1/contatos*`, `/v1/filas`, `/v1/atendentes*`, `/v1/mensagens-ativas*`, `/v1/anexos*`) that 01-35 had classified `keep`. Their endpoint paths were already renamed by Task 2's scope-wide pass (endpoint-kind translation never consulted `wire-contracts.csv`'s decision column). Added 36 new `packages-db` wire-key rows for their JSON keys; `contato.atributos` (jsonb passthrough) stays persisted per the new `persisted-wire-11` row.

## Task Commits

1. **Task 1: STD-08 — PROJECT.md language rule** - `e940a82` (docs)
2. **Task 2: Codex-routed map proposals (executed directly by Sonnet, D-40)** - `4d9ae9d` (docs)
3. **Task 3: Sonnet review + D-45 endpoint renames** - `bdcf87b` (docs)

## Files Created/Modified

- `.planning/PROJECT.md` - STD-08 language rule wording, Constraints and Key Decisions entries
- `.planning/phases/.../std/map/packages-db.csv` - 619 proposed rows (after dedup) + 291 wire-key rows
- `.planning/phases/.../std/map/packages-contracts.csv` - 220 proposed rows
- `.planning/phases/.../std/map/packages-autenticacao.csv` - 97 proposed rows
- `.planning/phases/.../std/map/packages-armazenamento.csv` - 46 proposed rows
- `.planning/phases/.../std/map/packages-tempo-real.csv` - 34 proposed rows
- `.planning/phases/.../std/map/packages-mcp.csv` - 0 candidate rows (01-08's inventory found none; `packages/mcp` is still a skeleton per PROJECT.md)
- `.planning/phases/.../std/map/workers.csv` - 241 proposed rows
- `.planning/phases/.../std/map/api.csv` - 4,622 proposed rows
- `.planning/phases/.../std/map/infra.csv` - 137 proposed rows
- `.planning/phases/.../std/persisted.csv` - +1 row (`persisted-wire-11`, `contato.atributos`)
- `.planning/phases/.../std/reports/sample-backend.csv` - 635-row 10% sample (created)

## Decisions Made

See `key-decisions` in frontmatter. In short: (1) D-40 authorized building a direct translation engine instead of chunking through Codex, validated purely against `check-map.ts`; (2) inventory rows that were the exact same rename recorded multiple times (same file, same old value, different line) were deduplicated rather than proposed as colliding duplicates; (3) `:*` param placeholders were resolved to their real names from the NestJS route decorators; (4) D-45 (owner, mid-plan) renamed the 24 previously-frozen customer-API-key endpoints.

## Row counts per scope (why some kinds are zero)

| Scope | Total rows | Candidate → proposed | Sampled (10%) | Notes |
|---|---|---|---|---|
| packages-db | 909 | 619 (+291 wire-key, incl. new rows) | 91 | wire-key rows have no `declared_at` by design (flat namespace); 1,395 duplicate occurrence-rows deduped away |
| packages-contracts | 220 | 220 | 22 | no `endpoint`/`queue`/`cookie` kind (contracts package has none) |
| packages-autenticacao | 97 | 97 | 10 | — |
| packages-armazenamento | 46 | 46 | 5 | — |
| packages-tempo-real | 34 | 34 | 4 | — |
| packages-mcp | 0 | 0 | 0 | 01-08's inventory found no candidate rows; package is still a skeleton (PROJECT.md, deferred to a later product phase) |
| workers | 241 | 241 | 25 | — |
| api | 4,622 | 4,622 | 463 | includes 179 pre-existing + 8 new webhook `endpoint` rows, 310 `error-code` rows, 5 `metric`, 1 `cookie` |
| infra | 137 | 137 | 14 | includes 5 new `package`/`app` rows (D-04) and 2 new `script` rows (D-07) |

**check-map** (`--scopes <all 9> --require-status proposed --glossary GLOSSARY.md`): **0 errors, 0 warnings.**

## Breaking-kind review (100%, per Task 3)

| Kind | Rows reviewed | Rows changed from the mechanical first pass |
|---|---|---|
| endpoint | 187 (+8 new webhook rows) | 3 (etiquetas nested-controller mismatches; 5 `:*` param resolutions needed a manual fallback) |
| error-code | 271 | ~85 (missing vocabulary: credencial, atalho, conexao, cor, tamanho, desenho, senha, uso, plurals of past participles that had picked up a wrong trailing "s", 2 "e"/"é" collisions) |
| cookie | 2 | 0 (fixed decision, D-38) |
| metric | 5 | 0 (fixed decision, D-38) |
| queue | 10 (7 existing + 3 new) | 0 (fixed decision, D-10) |
| job-name | 7 | 0 (fixed decision, D-10) |
| wire-key | 291 (255 + 36 D-45) | ~15 (contextual overrides: casaComUsuario, clienteId, contaComoProdutivo, entrarEm, erroDeWebhove, modeloClassificacao, nomeExibicao, ultimaMensagemDe; plus the same past-participle-plural fixes as error-code) |
| package | 6 (3 pre-existing package.json rows + 3 new infra rows) | 3 (the 3 new infra rows initially fell into the wrong translation path - fixed) |
| app | 2 | 0 |
| subpath-export | 5 | 0 (hand-translated directly, D-05-adjacent) |
| script | 12 (10 existing + 2 new) | 0 (fixed decision, D-07) |
| D-05 class/interface prefixes (Controlador\|Servico\|Guarda\|Erro\|Filtro\|Modulo) | 53 + 13 duplicate ts-local references to the same classes | 66 (100% hand-translated, D-05 suffix relocation) |

**Sample error rate:** 0% failing check-map by construction (errors are fixed before commit); no scope's manual-review pass found translation problems above a spot-check level once the error-code-driven dictionary expansion was applied everywhere, so no scope needed a full re-review beyond what was already 100%-mandatory.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking] Endpoint `:*` param placeholders needed real names**
- **Found during:** Task 2, first check-map run (412 "invalid casing" errors)
- **Issue:** 01-08's inventory recorded every route parameter as a generic `:*`, which fails check-map's `:[a-z][A-Za-z0-9]*` shape requirement.
- **Fix:** Parsed every `@Get/@Post/@Patch/@Put/@Delete` decorator in `apps/api/src/controladores/*.ts` (tracking each class's own `@Controller(prefix)`, since one file can hold several controllers) to reconstruct the real path with its real param names, then substituted those into the `:*` positions before translating.
- **Files affected:** `std/map/api.csv`
- **Verification:** check-map casing errors for `endpoint` kind dropped from ~4 to 0.
- **Committed in:** `4d9ae9d`

**2. [Rule 1 - bug] 1,719 duplicate inventory rows**
- **Found during:** Task 2, first check-map run (1,770 of 2,230 errors were "duplicate target")
- **Issue:** check-map's collision key for most kinds is `(kind, declared_at-file-without-line, new)` - it expects one map row per rename decision, but 01-08's inventory recorded one row per literal source-line occurrence (e.g. the same field name appearing 7 times in one file).
- **Fix:** Deduplicated by `(kind, old, file-without-line)` before proposing, keeping the first occurrence.
- **Verification:** duplicate-target errors dropped from 1,770 to 37 (the residual being genuine same-file, different-spelling collisions, fixed separately - see #3).
- **Committed in:** `4d9ae9d`

**3. [Rule 1 - bug] Grammatical-gender/spelling variants of the same field collided**
- **Found during:** Task 2, second check-map run (37 residual duplicate-target errors)
- **Issue:** Snake_case raw-SQL-shaped keys (e.g. `atendente_id`) and their camelCase TS-interface siblings (`atendenteId`) in the same file both translated to `agentId`, colliding under check-map's collision key. Similarly `ativa`/`ativo` -> `active`, `criadaEm`/`criadoEm` -> `createdAt`, file basenames repeated across different directories (`canais.ts` in both `controladores/` and `dominio/`).
- **Fix:** Reclassified snake_case ts-prop siblings to `wire-key` (a different kind = a different collision key, and semantically correct - they're the raw-row wire-adjacent form per 01-35's finding); merged true spelling-variant wire-key rows into one canonical row with combined consumers; disambiguated colliding file basenames with a directory-derived qualifier (deepened progressively until unique, never reaching into the `.planning/phases/<phase-name>` bookkeeping ancestry).
- **Files affected:** `std/map/api.csv`, `std/map/infra.csv`, `std/map/packages-db.csv`
- **Verification:** 0 duplicate-target errors.
- **Committed in:** `4d9ae9d`

**4. [Rule 2 - missing critical] Package-kind rows for `package`/`app` used the wrong translation path**
- **Found during:** Task 2 acceptance-criteria check (infra.csv `package`/`app` rows all showed `new=KEEP`, wrong)
- **Issue:** `package` kind (scoped npm names like `@pipe/autenticacao`) was routed through the bare-identifier translator, which cannot parse the `@scope/name` shape and left it untouched.
- **Fix:** Moved `package` into the path-translation group (same as `file`/`dir`/`app`), which correctly preserves the `@pipe/` prefix and translates the name segment.
- **Verification:** `infra.csv` now shows `@pipe/autenticacao -> @pipe/authentication`, etc.; `packages-autenticacao.csv`'s own package row fixed the same way.
- **Committed in:** `4d9ae9d`

**5. [Rule 1 - bug] ~90 missing-vocabulary and mistranslation issues found during the error-code review**
- **Found during:** Task 3, 100% error-code review (271 rows)
- **Issue:** Words like `credencial`, `atalho`, `conexao`, `cor`, `tamanho`, `desenho`, `senha`, `uso`, `provedor`, `plano`, `prazo` etc. were missing from the translation dictionary and passed through untranslated (some rows fell back to `KEEP` because the whole identifier ended up unchanged); several past-participle/adjective plurals (`ativas`, `criados`, `recusadas`, `removidos`...) picked up an incorrect English plural `-s` from the generic noun-pluralization fallback (e.g. `actives`, `createds`); `"em"` was mistranslated in mid-word position (`em_uso` -> `at_uso` instead of `in_use`) after an earlier fix aimed at the `criadoEm`/`atualizadoEm` timestamp-suffix pattern; two error codes (`ja_e_membro`, `nao_e_roteador`) used the verb "é" (is), which collides with the conjunction "e" (and) once diacritics are stripped.
- **Fix:** Added ~50 missing dictionary entries, added direct plural entries for adjective/participle forms (bypassing the generic pluralizer), made `"em"` translation positional (last chunk = "At", mid-word = "in"), and added two explicit overrides for the "é"/"e" collisions.
- **Files affected:** all 9 scope CSVs (re-generated end to end with the corrected dictionary)
- **Verification:** re-reviewed the full 271-row error-code list after the fix; check-map still 0/0.
- **Committed in:** `bdcf87b`

**6. [Rule 1 - bug] Context-dependent mistranslations found during the wire-key review**
- **Found during:** Task 3, 100% wire-key review (291 rows)
- **Issue:** `casaComUsuario` ("matches an existing user") mistranslated via the "house" sense of "casa"; `clienteId` (OAuth client, from the SSO provider record) mistranslated via the "customer" sense of "cliente"; `contaComoProdutivo` (a pause-reason flag meaning "counts as productive") mistranslated via the "account" sense of "conta" instead of the verb "contar"; `entrarEm` (when an invitee joined) mistranslated via the "login" sense of "entrar"; `modeloClassificacao` (an ML/sentiment classification model) mistranslated via the "template" sense of "modelo".
- **Fix:** Added explicit contextual overrides for these 6 wire keys, propagated the same value to every `ts-prop` row sharing that `old` name (check-map's rule 10 requires them to match), and added `glossary-exception:contextual` notes since these deliberately diverge from the general glossary term.
- **Files affected:** `std/map/packages-db.csv`, `std/map/api.csv`, `std/map/packages-contracts.csv`
- **Verification:** check-map 0 errors, 0 warnings after the fix.
- **Committed in:** `bdcf87b`

---

**Total deviations:** 6 auto-fixed (2 blocking, 2 bugs in the collision-avoidance logic, 1 missing-critical classification bug, 2 bugs found during the mandated breaking-kind review).
**Impact on plan:** All fixes were necessary for check-map correctness or translation quality; none reduced scope. The dictionary/engine fixes found during the Task 3 error-code and wire-key reviews were re-applied across all 9 scopes (not just the sampled rows), so their benefit is map-wide, not confined to the reviewed sample.

## D-45: customer-API-key endpoints now rename (owner decision, mid-plan)

01-35 classified 24 endpoints `keep` because they are reachable by real customer API keys (`/v1/conversas*`, `/v1/contatos*`, `/v1/filas`, `/v1/atendentes*`, `/v1/mensagens-ativas*`, `/v1/anexos*`). The owner decided (D-45, no real customers exist yet per D-43) that these rename like any other endpoint. Concretely:

- **Endpoint paths:** already renamed - this plan's Task 2 translated every `/v1/*` endpoint row uniformly, without consulting `wire-contracts.csv`'s decision column (endpoint-kind rows and wire-key rows are two independent axes in the map). No further action needed there.
- **Wire keys:** added 36 new `packages-db` wire-key rows for the 48 previously-uncovered JSON keys these 24 endpoints expose (19 of their 67 distinct keys already had a wire-key row from other endpoints). `contato.atributos` (jsonb passthrough) is excluded and recorded as `persisted-wire-11` in `persisted.csv` instead, per the owner's "keep persisted keys that are jsonb/db-backed as persisted" instruction.
- **`std/wire-contracts.csv`:** **not yet updated.** The owner instruction asks for the `decision` column on these 24 rows to change from `keep` to `rename-with-db-key` (with a note referencing D-45 instead of "API-key endpoint"), but the write was denied by the auto-mode permission classifier ("Modify Shared Resources" - `wire-contracts.csv` is a cross-plan artifact). Per the tool's own guidance, this is left for the owner/orchestrator to apply or to grant explicit permission for, rather than attempting a workaround. The exact patch needed:
  - For these 24 `(endpoint, method)` pairs, change `decision` from `keep` to `rename-with-db-key`.
  - Replace the `"API-key endpoint..."` notes prefix with something referencing D-45 (e.g. `"D-45 (owner decision, no real customers yet per D-43): customer API-key endpoint renames like any other"`), keeping the rest of each note's file:line evidence.
  - On the two `/v1/contatos` rows (`GET` and `POST`) whose `keys_affected` includes `atributos`, append a note that `atributos` stays persisted (`persisted.csv` `persisted-wire-11`).
  - The 24 rows (by endpoint+method): `/v1/contatos/:id/etiquetas/:etiquetaId DELETE`, `/v1/conversas/:id/etiquetas/:etiquetaId DELETE`, `/v1/atendentes GET`, `/v1/contatos/:id/etiquetas GET`, `/v1/contatos/:id GET`, `/v1/contatos GET`, `/v1/conversas/:id/mensagens GET`, `/v1/conversas/:id GET`, `/v1/conversas GET`, `/v1/filas GET`, `/v1/mensagens-ativas/limites GET`, `/v1/mensagens-ativas GET`, `/v1/anexos POST`, `/v1/atendentes/status POST`, `/v1/contatos/:id/etiquetas POST`, `/v1/contatos POST`, `/v1/conversas/:id/encerrar POST`, `/v1/conversas/:id/espera POST`, `/v1/conversas/:id/etiquetas POST`, `/v1/conversas/:id/mensagens/:mensagemId/reenviar POST`, `/v1/conversas/:id/mensagens/anexos POST`, `/v1/conversas/:id/mensagens POST`, `/v1/conversas/:id/transferir POST`, `/v1/mensagens-ativas POST` (rows already at `rename-with-db-key` - `contatos/importacoes*`, `contatos/:id PATCH` - needed no change).
  - `/v1/anexos/:id GET` (binary stream, no JSON body) and `/v1/contatos/importacoes/:id/falhas GET` (CSV text stream) were matched by the same path prefixes but are **not** part of the 24 - their `keep` is for a content-type reason unrelated to D-45 and is unchanged.

No other "needs owner decision at gate 2" items remain from this plan - D-45 resolved the one the orchestrator flagged.

## Issues Encountered

- The scratchpad helper module `csv.js` was found with unexpectedly different content partway through the session (matching `tools/std/lib/csv.ts` instead of this plan's own `readCSVFile`/`writeCSVFile` helpers) - rewritten back to its original form before continuing; no impact on already-completed, already-verified work since every prior run had already produced and validated its output before this was noticed.
- `std/wire-contracts.csv` could not be updated for D-45 (see above) - a real, undischarged blocker for gate 2, not a deviation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The backend/infra map is proposed, mechanically valid (`check-map` 0 errors/0 warnings for all 9 scopes at `status=proposed`), and 100%-reviewed on every breaking kind, ready for gate 2 (D-03) approval.
- **Blocker for gate 2:** `std/wire-contracts.csv`'s `decision` column still needs the D-45 patch described above applied by the owner/orchestrator (or an explicit permission grant for a follow-up write). The map itself (the actual renaming input) does not depend on this - it is a documentation/audit-trail update to a different file.
- CSS map (D-35, plan 01-36) and front-end scopes (desk-vite, gestao-vite, crm, ponte, site) are out of this plan's scope and remain for their own plans.

---
*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Completed: 2026-09-24*

## Self-Check: PASSED

- All 9 scope CSVs exist, 0 rows at `status=candidate`, `check-map --require-status proposed --glossary GLOSSARY.md` exits 0 (0 errors, 0 warnings).
- `/v1/auth/google/callback` and `/v1/auth/sso/callback` present in `api.csv`; `pipe-entrada`/`pipe_session` renamed with non-KEEP values; `infra.csv` has `package` rows for `@pipe/autenticacao`/`@pipe/armazenamento`/`@pipe/tempo-real` and `app` rows for `gestao-vite`/`ponte`.
- `std/reports/sample-backend.csv` exists (635 rows, seed 1).
- `std/persisted.csv` has 11 rows (10 from 01-35 + `persisted-wire-11`).
- Commits `e940a82`, `4d9ae9d`, `bdcf87b` found in `git log --oneline`.
- Branch confirmed `cx/01-10` (worktree `C:/Users/anderson.linhares/pipe-wt/01-10`).
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` not touched by this agent (per orchestrator instruction for this run).
- `std/wire-contracts.csv` intentionally left unmodified for D-45 - documented above as an open blocker, not silently skipped.

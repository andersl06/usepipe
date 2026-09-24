# Canonical English naming convention (STD-01)

Status: APPROVED 2026-09-24 (approver: owner via chat)

## Scope

Use English for technical identifiers covered by STD-10: non-persisted file and directory names, TypeScript symbols and properties, package and app names, frontend routes, API endpoints, technical string contracts selected by the approved map, test names, scripts, and technical comments. Apply the approved glossary to the concept in context; do not translate an ambiguous Portuguese word mechanically. Drizzle TypeScript exports and property names follow this convention while their explicit SQL table and column names remain unchanged (D-08).

Keep user-visible text in Portuguese. Keep SQL names and persisted values and contracts in Portuguese until their individual STD-06 decision in `persisted.csv` authorizes a different handling. This includes jsonb keys, stored API-key scopes such as `conversas:ler`, and stored error codes (D-40). Keep every environment variable **name and value**, including `PIPE_*`, `VITE_*`, and `GOOGLE_URL_RETORNO`; the sole exception is the **value** of `GOOGLE_URL_RETORNO`, which points to `/v1/auth/google/callback` (D-06, D-36). Literal Blip/Meta evidence and external payloads retain their original spelling (D-17). The glossary and this document require owner approval at D-03 gate 1 before map proposals.

## Files and directories

Use English kebab-case for file and directory paths. Use plural nouns for collections, such as `controllers/`, `pages/`, `components/`; use the established singular layer names `domain/` and `context/`. File names describe their domain responsibility. Tests use `*.test.ts` everywhere, including core's current `*.teste.ts`; update Vitest include/exclude patterns with that rename.

## Packages and apps

Use `@pipe/<kebab-english>` for package names and matching English directory names under `packages/`. Use English app directory and package names under `apps/`, including current Portuguese names such as `gestao-vite` and `ponte` (D-04, D-39). Map every Dockerfile, Compose, deploy, Turborepo, script, import, and workspace reference in the same app or package rename. Keep the CRM's Next App Router and Server Components architecture (D-33).

## Symbols

Use PascalCase for classes, types, interfaces, and React components. Put the idiomatic role suffix at the end: `*Controller`, `*Service`, `*Guard`, `*Error`, `*Filter`, `*Module`, `*Decorator` (D-05). Examples: `ControladorAnexos` → `AttachmentsController`, `GuardaSessao` → `SessionGuard`, `ErroPipe` → `PipeError`. Functions use camelCase verb phrases, hooks use `useX`, and ordinary variables/properties use camelCase. Keep UPPER_SNAKE for constants only where that style is already used; do not introduce it for ordinary values. IDs retain the `Id` suffix.

## Routes and endpoints

Use `v1/<plural-resource>` for API resources, with English kebab-case path segments, nested resources, and `:camelCaseParam` parameters. Use `callback` for Google OAuth and SSO callback segments (D-12, D-13). Meta webhook paths already in English remain untouched (D-15). Frontend route segments use English kebab-case, except Blip route names intentionally mirrored by the Desk, including `/activeMessage/send` and `/bulk-ticket`. Update all route constructors and consumers atomically; invitation links and screen bookmarks take the D-14 direct cut without Portuguese redirects. Navigation state decisions follow STD-12 and are not inferred from a route translation.

Owner decision (gate 1, 2026-09-24): Portal/Gestão front routes follow the Blip path shape, since Blip itself uses `<tenant>.blip.ai/application`, `.../application/detail/<tenant>/attendance/...`, and `.../application/detail/<tenant>/analytics/dashboard.html`. Concretely: the Portal/Gestão module or main portal screen is `/application`; attendance-module routes nest under `/attendance/...` (`/application/attendance/...` where the Desk mirrors the module); active-message routes stay `/application/activeMessage`. This is the glossary's `painel` → `application` decision (module/route sense; UI panel components use `panel` instead, see `GLOSSARY.md`).

Per-tenant subdomains (`<tenant>.usepipe.ai`, `<tenant>.desk.usepipe.ai`) are **out of scope for phase 1** — a later phase addresses tenant-subdomain routing. Route constructors and consumers renamed in this phase must not assume a fixed host; keep the host resolution mechanism as-is and only change path segments.

## Query params, storage keys, cookies, metrics, queues

Use camelCase query parameter names when the approved map selects them for change. Do not rename an existing persisted query contract without its STD-06 decision. New or reset browser storage keys follow `pipe:<app>:<screen>:<name>:v1[...]`; include tenant/user identity in the bracketed suffix where screen state is per identity, as required by D-30. Existing browser keys remain governed by `persisted.csv`.

Cookie names use snake_case `pipe_*`, including the D-38 session-cookie rename and accepted logout at deploy. Prometheus metrics use `pipe_<noun>_<unit>` with snake_case components; D-38 accepts discontinuity of historical series. BullMQ queue and job names use kebab-case `pipe-<noun>` (D-10), with the planned queue drain at deploy. Stored outbox payloads and other persisted job data follow their STD-06 classification.

## CSS

CSS classes use English kebab-case while preserving existing app prefixes such as `dk-` (D-35). Custom properties use `--<prefix>-<kebab>`. Map selectors and every consumer together; do not replace a bare Portuguese substring inside unrelated prose or values. `data-*` attributes follow the same approved technical-name map when their values are not persisted.

## Tests

Use English sentence-style `describe` and `it` titles that state observable behavior. Test file names end in `*.test.ts` across the monorepo. Change any test runner include/exclude glob when renaming test files, and confirm the runner still discovers the tests.

## Comments

D-16: Classify every existing Portuguese technical comment. Translate a necessary and current comment into English while preserving its exact technical meaning. Remove a redundant, obvious, or code-narrating comment. Remove or update an outdated or contradictory comment only after validating actual behavior. Do not translate blindly.

D-17: Review comments about reasons, security, architecture, Meta, Blip, and integrations for semantic accuracy. Keep literal quotations, official names, payloads, external messages, and captured Blip/Meta text in their original language when they are literal evidence. Do not simplify away the meaning of historical decisions or translate word for word.

D-18: The final goal is no unjustified Portuguese technical comment. STD-11 finds and classifies anything that remains.

## Remaining PT categories (STD-11)

Classify remaining Portuguese text as A: product text visible to the user; B: deferred persisted data or contract, with its `persisted.csv` ID; or C: documented exception, with its `exceptions.csv` row. An unclassified finding blocks the phase gate. Environment variable names and values are category C under D-06/D-36; SQL names and stored codes are category B.

## Approval and enforcement

The owner closed D-03 gate 1 on 2026-09-24 (approved via chat): this document and `GLOSSARY.md` are both `Status: APPROVED`. Only owner-approved glossary rows may be consumed by `tools/std/check-map.ts --glossary`; D-03 gate 2 separately approves each old→new map before mechanical renaming. Exceptions to the glossary need an explicit decision and evidence in the map, not a silent alternative spelling.

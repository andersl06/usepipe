---
phase: 02-fechar-o-builder
plan: 59
subsystem: management-vite
tags: [P16-UI, ai-model, intents, entities, ProcessAnswers, aianswers]
requires: [02-56, 02-57, 02-58]
provides:
  - Structured per-flow AI model editor over the existing GET/PUT contract
  - Builder AI Answers block and action creation with assistant selection
  - Intent/entity conditions with model suggestions
  - Missing-key lexical simulation notice in the Test panel
completed: 2026-09-30
---

# 02-59 — AI model and AI Answers UI

## Delivered

The bot menu's overflow now includes **Inteligência artificial**, opening
`/application/detail/:shortName/ai/model`. The existing first five items keep their order.
The entry uses the **Builder** read/write permission because the existing AI model endpoints
require `builder.ler` / `builder.escrever`; the form is disabled for a reader.

The new screen reads `GET /v1/management/flows/:id/ai-model` and saves the complete document
with `PUT` using `FlowAiModelInput`. There are structured add/edit/remove controls for:

- provider (automatic, Anthropic, OpenAI), model, and the **name** of its key secret;
- intents: name, description, individual examples and answers;
- entities: name, values and individual synonyms;
- contents: name, result, intent/entity-value combinations and optional `minEntityMatch`;
- AI Answers assistants: name, company name, profile, guidelines, fallback answer and Q&A.

Each list keeps existing IDs, and text answers/examples remain separate fields, so punctuation
and embedded line breaks do not become list separators. Renaming an intent updates references
in content combinations. Deleting a referenced intent leaves an explicit validation error until
the combination is corrected. Unknown entity values in imported combinations remain selected.

The screen offers Save / Discard, unsaved-change status, loading and retry states, API error
messages, and client feedback for missing/duplicate names, invalid intent/entity names,
invalid content combinations/minimum match and incomplete Q&A. The API remains authoritative
for all document/text size limits. Only secret **metadata names** are read; no secret value is
loaded or stored in the model editor. A new-tab link opens the Builder where Variáveis sensíveis
is managed. Saving changes the live model; it is separate from publishing the Builder draft,
and the success message explains this behavior.

Builder **Adicionar bloco → AI Answers** creates an input block with a leaving `ProcessAnswers`
action, `UserInput: {{input.content}}`, `ContactId: {{contact.identity}}`, an empty `AssistantId`,
and the fallback default output. The block's first tab configures its assistant/input/contact,
and its Actions/Outputs tabs retain the existing behavior. The generic action menu offers
`ProcessAnswers` too, including inside subflows. Missing AssistantId is flagged by the existing
action validation/publish gate. Copy/duplicate preserves the AI Answers block prefix.

The shared assistant picker reads the flow's model, displays assistant names, and writes the
assistant **ID** to `settings.AssistantId` through `comCampo`. Imported unknown IDs stay in a
selected option, with a warning, until explicitly replaced. Selection preserves unrelated
settings/actions. A tested panel callback verifies the ID survives JSON persistence. The picker
links to **Editar assistente** in a new tab, preserving the current Builder canvas. It explains
`aiAnswers.response` and `aiAnswers.statusCode` and that the action sends no response itself.

The condition editor now enables the engine's `intent` and `entity` sources. Intent values have
name suggestions; entity conditions have an editable name field with a datalist of entity names
and matching-value suggestions. Suggested values append to the existing chips; free text and
imported values/operators remain available.

The Test panel explains the lexical intent/example and Q&A stand-ins with `[Simulação]` only
when NLP/AI Answers applies **and** secret metadata confirms the effective provider key is absent.
It covers custom key names, provider defaults and provider inference; loading/errors do not
imply a missing key. ProcessAnswers in subflows is included. The existing AI-agent note remains.

## Files

Created:

- `src/lib/flow-ai-model.ts`
- `src/pages/flow/ai-model-{page,form}.tsx`
- `src/pages/flow/ai-model-logic.ts` and `ai-model.css`
- `src/pages/builder/ai-answers-block.ts`
- `src/pages/builder/ai-model-context.tsx`
- `src/pages/builder/panel-ai-answers.tsx`
- `tests/flow-ai-model.test.ts` (15 tests)

Updated: `App.tsx`, bot menu `flow/itens.ts`, `builder.tsx`, and Builder action catalog,
condition editor/sources, block menu/factory wiring/copy, block/action panels, Test panel and
one suggestion CSS rule. Updated existing bot-navigation expectations for the newly enabled menu.

No contracts, API, engine, DB, migrations, package dependencies, lockfiles or deployment changes.
`panel-ai-agent.tsx` is untouched. The 02-58 additions are preserved: `actions-of-block.ts` has
only the new catalog/default additions; `panel-actions.tsx` keeps KnowledgeToolFields and its
knowledge field filtering; its new picker branch handles ProcessAnswers only. Existing
knowledge/MCP CSS remains, with one appended suggestion rule.

## Reference evidence and design

Read-only evidence: `referencias-blip/bundles-e-css/portal.js` `createAiAnswersState` around
line 250656 confirms input, leaving ProcessAnswers settings and fallback output; the AI command
inventory in `referencias-blip/pesquisa/blip-api-schemas.md` line 271 confirms intentions,
entities and contents. Upstream 02-56/57 summaries describe assistant profile/guidelines/fallback
and Q&A. No captured secrets, Blip implementation code, CSS, SVG or class names were copied.
New fields use Pipe Campo/Botao/Select/ChipsInput and existing Pipe surface/line tokens.

## Verification

TDD evidence: initial focused run had **11/11 expected failures** for absent functionality;
the entity-condition UI test separately failed for its missing name/suggestions before wiring;
the key-availability refinement separately failed before its helper was implemented. Node SSR
tests use real React/Pipe components and ignore CSS imports only; fetch is replaced only at the
HTTP boundary for PUT/error assertions.

| Command | Final result |
|---|---|
| `node --import tsx --test tests/flow-ai-model.test.ts tests/flow-detalhe.test.ts` | 36/36 passed (15 new + 21 navigation) |
| `pnpm exec tsc --noEmit -p .` (management-vite) | exit 0 |
| `pnpm exec eslint .` (management-vite) | exit 0 |
| `pnpm --filter @pipe/management-vite test` (worktree root) | 479/479 passed, 6 suites, 0 skipped; 13.00 s |
| `pnpm exec vite build` (management-vite) | exit 0; 1204 modules; 37.12 s |
| `git diff --check` | no whitespace errors |

The build retains the existing warning about chunks larger than 500 kB (including Monaco).
Initial full-suite failures were three old menu expectations that intentionally excluded AI;
they now assert its discovery and Builder permission. An initial typecheck caught an unsupported
button variant, corrected to Pipe's `padrao`. All final checks passed.
Self-review also corrected the entity-value addition cap to the API's existing 200-value limit,
with a separately observed RED/GREEN regression test.

## Known limits / follow-up

- No authenticated browser/API/DB visual or live persistence run was performed in this isolated
  worktree. SSR, callback, adapter, full regression, typecheck, lint and build checks ran.
- This editor manages the existing per-flow model/Q&A contract; it does not introduce model
  training, files, semantic retrieval, or the unrelated account knowledge catalog.
- This API has whole-document replacement without a version field: simultaneous editors have
  the API's existing last-save-wins behavior. Unsaved edits remain local and do not auto-save.
- Entity value and intent renames move content references automatically (see review
  corrections below); deletions leave references in place and block save until they are fixed.
- Secret metadata availability, rather than the secret value, drives the missing-key notice.
  The browser cannot inspect server environment keys.

Self-review completed; no blocking concern found. Task scope and 02-58 ownership boundaries preserved.

## Review corrections

An independent review of `b4b3bf2c` found four important issues; each was fixed with focused tests.

1. **Entity edits silently broke content matching** (`14d82eae`). Renaming a value such as
   `camisa` (synonym `blusa`) to `camiseta` left combinations on `camisa`, validation returned
   `[]`, and input `blusa` stopped matching. `renameEntityValue` now moves combination references
   using the runtime's own text normalization, but only when the old value is unambiguous: if
   another entity value still has that text, references keep matching it and are left alone.
   `aiModelErrors` flags any combination value no entity value can produce (deleted values or
   entities included), which blocks save; the form marks such values as `(ausente)` with an
   inline warning. The regression test runs the real engine matcher
   (`apps/api/src/domain/nlp-model.ts` `findEntities` / `matchContentInModel`) before and after
   the keystroke-by-keystroke rename.
2. **Clearing an intent while renaming broadened matching** (`19f7d95f`). `trocas → '' → devolucao`
   used to leave `{ intent: '' }`, i.e. any intent. Renames now keep references on the last
   non-empty name while the field is empty (a per-editor `RenameMemory`), so the next keystroke
   moves them; the cleared state is a validation error. A combination with a blank (not null)
   intent is now always an error, and the select shows it as `(intenção em branco)` so the user
   can pick "Qualquer intenção" explicitly. The test replays the real backspace/typing sequence.
3. **Builder assistant picker went stale** (`da15fea5`). The Builder's AI model and secret-name
   reads now use `staleTime: 0` and `refetchOnWindowFocus: true` (the app default disables focus
   refetch with a 30 s stale time), so assistants saved in the "Editar assistente" tab appear on
   return. The picker also has an **Atualizar assistentes** button and a refreshing status.
4. **A failed background GET discarded unsaved edits** (`5d3167d1`). `AiModelReadView`
   (`src/pages/flow/ai-model-read-view.tsx`) keeps the editor mounted at a fixed position whenever
   data exists and shows the refresh error beside it with a retry; the load error replaces the
   page only when nothing has loaded. The draft is still initialized only on mount, so a later
   successful refetch does not reset it.

`7283d087` only switches the new tests to `import type`.

| Command (management-vite) | Result after corrections |
|---|---|
| `npx tsc --noEmit -p .` | exit 0 |
| `npx eslint .` | exit 0 |
| `pnpm test` | 485/485 passed, 0 failed/skipped (`flow-ai-model.test.ts` 21/21) |
| `npx vite build` | exit 0; 1205 modules; existing chunk-size warning |

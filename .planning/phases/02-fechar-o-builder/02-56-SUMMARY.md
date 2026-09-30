---
phase: 02-fechar-o-builder
plan: 56
subsystem: flow-engine, api, db, management
tags: [P16, NLP, intent, entity, minimumIntentScore, ProcessAnswers, aianswers, contentAssistant]
requires: [02-48, 02-53]
provides:
  - input.intent.* / input.entity.* and the intent/entity condition sources, analysed lazily once per input
  - builder:minimumIntentScore honoured (default 0.5) and editable in the Builder configuration
  - input.contentAssistant.{id,name,result}
  - AI Answers (ProcessAnswers) with aianswers.{response,statusCode}
  - the flow's AI model (modelo_ia_do_fluxo, migration 0080) with GET/PUT /v1/management/flows/:id/ai-model
  - ServicosDoMotor.analyzeInput / matchContent / processAnswers
key-files:
  created:
    - packages/core/src/flow/nlp.ts
    - packages/core/src/flow/ai-answers.ts
    - packages/core/src/flow/nlp.test.ts
    - packages/contracts/src/flow-ai-model.ts
    - packages/db/drizzle/0080_modelo_ia_do_fluxo.sql
    - apps/api/src/domain/nlp-model.ts
    - apps/api/src/domain/management/flow-ai-model.ts
    - apps/api/tests/nlp-model.test.ts
    - apps/api/tests/nlp-ai-answers.test.ts
  modified:
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/condition.ts
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/editor.ts
    - packages/core/src/flow/index.ts
    - packages/core/src/flow/context.test.ts
    - packages/contracts/src/index.ts
    - packages/db/drizzle/meta/_journal.json
    - apps/api/src/domain/engine-services.ts
    - apps/api/src/controllers/management-flow.ts
    - apps/management-vite/src/pages/builder/configuration-sections.ts
    - apps/management-vite/src/pages/builder/panel-configuration-variables.tsx
    - apps/management-vite/src/pages/builder/system-variables.ts
    - apps/management-vite/tests/builder-painels.test.ts
decisions:
  - "The AI model is stored per flow (a Blip bot is a Pipe flow), one row in modelo_ia_do_fluxo with JSON lists: settings {provider, model, apiKeySecret}, intents {name, description, examples, answers}, entities {name, values[{name, synonyms}]}, contents {name, combinations[{intent, entities, minEntityMatch}], result}, assistants {id, name, companyName, profile, guidelines, invalidAnswer, knowledge[{question, answer}]}. Shapes follow Blip's public AI extension (/intentions, /entities, /content/analysis) and AI Answers assistant config seen in portal.js; nothing copied."
  - "Intents are classified by the flow's provider through the AI agent's callAgentModel (Anthropic or OpenAI, D-58), JSON-only reply, unknown names dropped. Entities are deterministic (value or synonym as whole words, accents/case ignored): no model call and no cost."
  - "Analysis is lazy and cached per input, like Blip's LazyInput: only a flow that reads an intent/entity (variable or condition) pays for a call. Only text/plain inputs are analysed. A failed analysis reads as no intent (Blip's behaviour)."
  - "minimumIntentScore: best intent with score >= builder:minimumIntentScore (0..1 text, default 0.5 like the Builder template)."
  - "ProcessAnswers never throws (except on the engine deadline): it writes {response, statusCode} under the engine key #aianswers; 200 answered, 400 missing input/assistant, 404 unknown assistant, 422 provider refusal, 500 failure (e.g. no key in production), 503 no service. The block sends nothing itself, as in Blip (the flow reads aiAnswers.response)."
  - "Keys: same flow secrets as P14 (ANTHROPIC_API_KEY / OPENAI_API_KEY or settings.apiKeySecret). Without a key, production reads no intent and AI Answers returns 500; the Builder test run uses lexical stand-ins (example similarity for intents, best Q&A passage prefixed with [Simulação] for answers)."
metrics:
  completed: 2026-09-30
---

# 02-56: P16 NLP and AI Answers Summary

A flow can now route on **intents and entities**, read `input.intent.*`, `input.entity.<name>.*` and
`input.contentAssistant.*`, and answer with an **AI Answers** block (`ProcessAnswers`,
`aiAnswers.response` / `aiAnswers.statusCode`). The configuration is the flow's **AI model**, stored per
flow. Production and the Builder test run share the same services through `engineServices`.

## Blip evidence used (D-33: format only, nothing copied)

- `builder:minimumIntentScore` is stored as `"0.5"` in the Builder templates (`portal.js:822-824`) and shown
  ×100 in a slider (`portal.js:254102-254118`).
- The AI Answers block factory (`createAiAnswersState`, `portal.js:250744`): an input block with the leaving
  action `ProcessAnswers` and settings `UserInput: {{input.content}}`, `ContactId: {{contact.identity}}`,
  `AssistantId`. Its sidebar says the flow reads `aiAnswers.response` and `aiAnswers.statusCode`.
- AI Answers assistant configuration (`portal.js:298290-298450`): `companyName`, `profile`, `agentType: faq`,
  `invalidAnswer`, `guidelines`, `redirectGuidelines`, answering from the knowledge-base files.
- The content assistant (`set /content/analysis` with `{intent, entities, minEntityMatch}`, `portal.js:255041`)
  and `input.contentAssistant.{id,name,result}` in the variable list (`portal.js:264780`).
- The AI extension URIs `/intentions`, `/entities`, `/content`, `/analysis` (`blip-api-schemas.md`, `portal.js:217011`).

## What was built

### Core (`@pipe/core`)
- `nlp.ts`:
  - `analyzeInbound(inbound, context)` asks `services.analyzeInput({text})` at most once per input (WeakMap
    cache). It runs only for `text/plain`, with the text capped at 2 000 characters. It keeps
    `bestIntent(intentions, minimumIntentScore(flow))` and all entities.
  - An input that arrived with an intent or entities already set keeps them.
  - A failure reads as no intent.
  - `inboundContentAssistant` calls `services.matchContent({intent, entities})` at most once per input.
- `context.ts`:
  - `inboundProvider` is now async: `intent.*` and `entity.*` go through `analyzeInbound`, and there is a new `contentAssistant.*` branch.
  - `aianswers` is in `FONTES_SUPORTADAS`, with a provider that reads `#aianswers`.
  - Three optional services: `analyzeInput`, `matchContent` and `processAnswers`.
- `condition.ts`: the `intent` and `entity` sources go through `analyzeInbound`.
- `ai-answers.ts`: the `ProcessAnswers` action, wired in `actions.ts` through a lazy wrapper (the same import-cycle reason as the agent).
- `editor.ts`: the import report no longer counts `condicao:fonte:intent` / `condicao:fonte:entity` as unsupported.

### API
- `domain/management/flow-ai-model.ts`:
  - `normalizeAiModel` validates the model, with Portuguese errors and limits: 200 intents, 100 entities, 200 contents, 20 assistants, 500 Q&A per assistant, and 1 MB in total.
  - Intent and entity names must be usable in conditions and variables: letters, digits, `_` and `-` only.
  - A content combination must name an intent that exists in the model.
  - `getFlowAiModel` / `saveFlowAiModel` read and write the model, with `builder.ler` / `builder.escrever` permission.
  - `loadFlowAiModel` is the engine's read.
- Routes: `GET` and `PUT /v1/management/flows/:id/ai-model`. `PUT` replaces the whole document.
- `domain/nlp-model.ts`, used through `nlpServices` in `engineServices`:
  - The model is loaded once per input, and only when the flow uses NLP.
  - `callModel` is `agentModelService({stubWhenNoKey: false})`, so the provider call and key handling are the same as P14 (the key is masked in errors).
  - Classifier: a JSON-only prompt with the intent catalogue (up to 20 examples per intent), 512 max tokens and a 15 s timeout.
  - Entities come from `findEntities` and need no model call.
  - `matchContentInModel`: a combination with a named intent ranks above one with "any intent"; after that, more matching entities rank higher. `minEntityMatch` defaults to all of the combination's entities.
  - AI Answers:
    1. `AnswersRetriever.retrieve` gets the passages. The default is `lexicalAnswersRetriever`: the assistant's Q&A ranked by word overlap, top 6.
    2. The prompt is grounded only on those passages, with the assistant's profile and guidelines, and tells the model to reply with `invalidAnswer` when the passages do not answer.
    3. If the assistant has no knowledge, it returns `invalidAnswer` without calling the model.

### Gestão (small, not in the canvas)
- Configuração › "CONFIABILIDADE DE IA" is available now. The slider shows the stored 0..1 value as a percentage and writes `"0.7"` for 70%. The old slider read the raw value as a percentage and was disabled.
- The variable library marks `aiAnswers.*` and `input.contentAssistant.*` as filled by the engine.

## Switching AI Answers to the 02-55 retrieval

`nlpServices` takes an optional `retriever: AnswersRetriever`, whose shape is
`retrieve({assistant, query, limit}) → [{question, answer, score}]`. When 02-55's semantic knowledge search
lands:
1. Write an adapter that runs 02-55's query over the knowledge base. It can scope the search by the
   assistant, for example with a knowledge-base id or tag added to `FlowAiAssistant`, which would be a
   contract change. It maps each passage to `{question: <title or source>, answer: <passage text>, score}`.
2. Pass the adapter in the `nlpServices({...})` call in `engine-services.ts`, wrapping the DB access in `isolate`.
   You can keep the lexical Q&A as a fallback, or merge both lists.

Nothing else changes: the prompt, the statuses and the test-run stub already work on the passages. The
same applies if `ProcessContentAssistant` (02-55) should fill `input.contentAssistant.*`. Today that
variable comes from the model's contents, which follows Blip's content assistant.

## What the Builder UI still needs (not done: 02-52 is editing `pages/builder/**`)

1. **An "IA" (AI model) screen** for intents (name, description, examples, answers), entities (values and
   synonyms), contents (combinations and result) and assistants (profile, guidelines, invalid answer, Q&A).
   It also needs the provider, model and API key secret name, with a link to Variáveis sensíveis.
   The API is ready: `GET`/`PUT /v1/management/flows/:id/ai-model`, typed as `FlowAiModel` in `@pipe/contracts`.
   Until the screen exists, the model can be set only through the API.
2. **AI Answers block creation** in the canvas: an input block, leaving action `ProcessAnswers`
   `{UserInput:'{{input.content}}', ContactId:'{{contact.identity}}', AssistantId}` and `$defaultOutput`
   fallback. The sidebar needs an assistant select (from the model's `assistants`), the text "Para consultar
   a resposta e o status da chamada use as variáveis aiAnswers.response e aiAnswers.statusCode", and an
   "Editar assistente" link. Imported AI Answers blocks already run.
3. **Condition editor**: check that the `intent`/`entity` sources offer the model's intent and entity names as
   suggestions. They run today, and the editor already accepts the sources.
4. **Test panel note**: without a key, intents come from the lexical stand-in and answers are prefixed with `[Simulação]`.

## Verification (worktree)

| Package | Check | Result |
|---|---|---|
| core | `npx vitest run` | 621/621 (26 files; new `nlp.test.ts`, 9 tests) |
| core | `npx tsc --noEmit -p .`, `npx eslint src/flow` | clean |
| @pipe/ai | not touched | — |
| API | `npx tsc -p tsconfig.test.json --noEmit` | clean |
| API | `eslint src tests` | only the known `sla.ts` error |
| API | DB-free run (throwaway config, removed): `nlp-model.test.ts`, `agent-model.test.ts`, `engine-services.test.ts` | 30/30 (12 + 4 + 14) |
| Gestão | `tsc`, `eslint .` | clean |
| Gestão | `pnpm test` | 428/428 |
| Gestão | `vite build` | ok |

## DB tests for the orchestrator (not run here)

`apps/api/tests/nlp-ai-answers.test.ts` needs migrations **0055** (secrets) and **0080** (this plan) applied.
It stubs OpenAI with a local HTTP server through `PIPE_OPENAI_BASE_URL` and uses an invented key, so it
makes no network calls. It covers:
- **Production (WhatsApp webhook):**
  - intent routing with the provider's classification plus `input.contentAssistant.result`
  - entity routing through a synonym, with no model call
  - AI Answers grounded on the Q&A
  - exactly 4 provider calls
  - the key only in `authorization`, and absent from `execucao_fluxo` and `execucao_passo`
  - without a key: no intent ("Não entendi"), entities still work, AI Answers takes the default exit (500), and there are 0 calls
- **Builder test run:**
  - PUT and GET of the model, including a 400 for an unknown intent in a combination
  - without a key: the lexical stand-ins and `[Simulação]` answer, with 0 calls
  - with a secret created through the API: the same as production, with the key absent from the response

Recommended regression: `ai-agent.test.ts`, `builder-test-run.test.ts`, `flow-actions.test.ts`,
`flow-secrets.test.ts`, and the `packages/db` suite (to confirm the migration applies).

## Migration

**0080** `0080_modelo_ia_do_fluxo.sql`, journal idx 80, `when` 1790160000000. It creates the table
`modelo_ia_do_fluxo`, a unique index on `(tenant_id, fluxo_id)`, a 2 MB size check, the RLS policy
`tenant_isolado`, and a grant to `pipe_app`.

The Drizzle schema (`schema/automation.ts`) is untouched: access is raw SQL, as in `flow-secrets.ts`. Journal
idx 58 to 79 are not present in this branch. The Drizzle migrator orders the entries by `when`, so this is
fine, but the merge must keep 0058 (02-55) before 0080.

## Merge risks

- `packages/core/src/flow/context.ts`, all additive:
  - two import lines
  - the header comment
  - `'aianswers'` in `FONTES_SUPORTADAS`
  - 3 optional services at the end of `ServicosDoMotor`
  - `AI_ANSWERS_VARIABLES_KEY`
  - `inboundProvider` is now `async`, with its intent and entity branches changed and a `contentassistant.` branch added
  - an `aianswers` provider after `aiagent`

  If 02-55 edits `respondWithKnowledge` or adds services in the same place, keep both.
- `condition.ts`: one import and the `intent`/`entity` cases.
- `actions.ts`: one import, `processAnswersAction` before `ACTIONS_OF_MOTOR`, and one list entry at the end.
  02-55 is likely to rewrite `processContentAssistant`, which is a different region.
- `editor.ts`: two lines removed in `viewConditions`.
- `index.ts`: two `export *` lines after `ai-agent.js`.
- `engine-services.ts`:
  - two imports
  - the `aiModel` cache variable after `loadSecret`
  - one spread entry after `respondWithKnowledge`

  02-55 will edit `respondWithKnowledge`/`knowledgeMatch` next to it.
- `management-flow.ts` (controller): one import, two type imports, and two routes at the end of the class.
- `_journal.json`: one entry appended after 0057. Keep 0058 from 02-55 before it.
- `packages/contracts/src/index.ts`: one `export *` line.
- Gestão: `configuration-sections.ts` (a flag plus helpers at the end), `panel-configuration-variables.tsx` (the slider branch and one import) and `system-variables.ts` (5 flags plus a comment). These are Builder files; 02-52 works in the same directory but probably not on these files.
- No new npm package. No lockfile change.

## Deviations and provisional points

- **Classifier instead of a trained NLP model.** Blip trains a model on the intents' questions. Pipe asks the LLM
  with the examples in the prompt, so the scores are the model's calibrated confidence, not Blip's. In the test
  run without a key, the scores come from lexical similarity.
- **Entities are dictionary-only.** Pipe does not extract entities that are not in the catalogue (Blip's
  built-in `@sys` entities such as numbers and dates are not reproduced).
- **`input.intent.answer`** is a random entry of the intent's `answers`, as text.
- **`input.analysis`** still reads null.
- **AI Answers statuses** are Pipe's own mapping, because Blip's HTTP statuses are not captured. The
  assistant's `redirectGuidelines` is not modelled.
- **No model usage** is written to `consumo_ia`, as in P14.
- **Router context.** Subflows use the bot flow's `builder:minimumIntentScore` (`rootFlow`). The AI model
  belongs to the flow that runs as the bot, so a router service uses its own flow's model.

## Self-Check: PASSED

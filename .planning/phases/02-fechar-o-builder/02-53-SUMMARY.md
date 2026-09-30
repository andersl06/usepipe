---
phase: 02-fechar-o-builder
plan: 53
subsystem: flow-engine, ai, api
tags: [P14, D-58, ForwardToAgent, LeavingFromAgent, aiagent, secrets]
requires: [02-48, 02-50, 02-51]
provides:
  - AI agent block (ForwardToAgent/LeavingFromAgent) running in production and in the Builder test run
  - Provider chosen per agent, Anthropic or OpenAI (D-58)
  - aiagent.* variables
  - ServicosDoMotor.callAgentModel and ActionDeadline.runActions
key-files:
  created:
    - packages/core/src/flow/ai-agent.ts
    - packages/core/src/flow/ai-agent.test.ts
    - packages/ai/src/agente/agente.ts
    - packages/ai/src/agente/agente.test.ts
    - packages/ai/src/agente/index.ts
    - apps/api/src/domain/agent-model.ts
    - apps/api/tests/agent-model.test.ts
    - apps/api/tests/ai-agent.test.ts
  modified:
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/manager.ts
    - packages/core/src/flow/editor.ts
    - packages/core/src/flow/index.ts
    - packages/core/src/flow/context.test.ts
    - packages/ai/package.json
    - packages/ai/src/index.ts
    - apps/api/package.json
    - pnpm-lock.yaml
    - apps/api/src/domain/engine-services.ts
    - apps/api/src/domain/management/builder-test-run.ts
    - apps/management-vite/src/pages/builder/system-variables.ts
    - apps/management-vite/tests/builder-painels.test.ts
decisions:
  - "The agent's configuration is the Blip block's own ForwardToAgent settings (model.provider/model/maxTokens/temperature, prompt[], handoffs[], output). Pipe adds only model.apiKeySecret. No migration: 0058 is not used."
  - "Provider per block: provider `anthropic`/`openai`. Anything else (Blip's `blip`, or no provider) is inferred from the model name: gpt-*/o*/chatgpt means OpenAI, otherwise Anthropic. Default models: claude-sonnet-5 (the model @pipe/ai already pins) and gpt-4.1."
  - "Keys are flow secrets (02-48). The default secret names are ANTHROPIC_API_KEY and OPENAI_API_KEY, and model.apiKeySecret can name another one. There is no fallback to a platform environment key."
  - "OpenAI goes through its Chat Completions REST endpoint with fetch, so no new npm package. Anthropic uses @anthropic-ai/sdk, which @pipe/ai already has."
  - "One agent turn runs inline for each input, because Pipe has no external AI platform. A handoff replaces the current input with the handoff document and sets the status to `Handoff` (a Pipe-only value), so the block's named exit is taken in the same input."
  - "Memory is stored in the contact's flow context under `#aiagent-memory@{blockId}` (≤ short-term-memory length, ≤ 100 messages, ≤ 32 KB). It expires with builder:stateExpiration, and LeavingFromAgent clears it."
metrics:
  completed: 2026-09-30
---

# 02-53: P14 AI agent (engine) Summary

A flow can now forward the contact to an **AI agent block** (`ai-agent:<uuid>`, Blip's
`ForwardToAgent`/`LeavingFromAgent`). The agent talks on **Anthropic or OpenAI**, and the provider is chosen per block (D-58). Its tools are the block's
local actions, and the handoffs leave through the block's named exits. The provider key stays a secret. Production and the Builder test run use the same
engine and the same `engineServices`.

## Blip evidence used (D-33: format only, nothing copied)

From `portal.js` (zip19), read only:
- **Block factory** (`:218150-218185`): the block has
  - the entering action `ForwardToAgent`, and `LeavingFromAgent` in `$afterStateChangedActions`
  - an input that waits only while `agent_forwardToAgentState_status == Success`
- **Status enum** (`:218979`): `Error`, `Success`, `NoAgentAvailable`.
- **Outputs** (`:222945-222990`, `:266725`):
  - `Error` goes to the fallback
  - a handoff output tests `input.content@content.type == application/vnd.iris.aiplatform.handoff+json` plus `input.content@content.value.name == <handoff>`
  - input forwarding tests `…@content.value.type`
  - the default output returns to the block itself
- **Tools** (`createActionTools`, `:156016`): local actions other than ForwardToAgent and KnowledgeBaseConsult become tools. A tool has name = `$title`, description = `$description` and `inputSchema` = `$inputSchema`.
- **Example block** (`:255035`): used for the settings shape only:
  - `model{provider,model,maxTokens,temperature}`
  - `prompt[{role:system}, {role:'short-term-memory', config:{length}}]`
  - `handoffs[{name,description,parameters}]`
  - `output{forward,variable,contentTypes}`
  - `tools{<mcp>}`
- **`aiAgent.*` meanings**: taken from the Builder variable library already in the Gestão (`system-variables.ts`).

## What was built

### Config model (`agentSettings`, core)
- `provider`/`model` are chosen per block, with provider inference and defaults as described in the decisions.
- `maxTokens` defaults to 1024 and is capped at 8192.
- `temperature` is passed only where the model accepts it:
  - Anthropic: the Claude 3/4 families up to opus-4-6. Claude 5 rejects sampling parameters with a 400.
  - OpenAI: gpt-4* and gpt-3.5 only. Reasoning models reject it.
- The system prompt is every `system`/`instructions` entry of `prompt[]`, joined. `{{...}}` has already been substituted by the engine, as in any other setting.
- Memory size comes from `short-term-memory.config.length`. Without that entry there is no memory.
- `output.forward.enabled` defaults to true: it sends the agent's text to the customer. `output.variable.{enabled,name}` stores the turn's text in a variable.
- `model.apiKeySecret` (new, optional) names the flow secret that holds the key.

### Runtime loop (`forwardToAgent`, core)
1. Each input that reaches the block runs one turn:
   - user message
   - model call
   - if the model calls tools, run them and send the results back
   - further model calls, capped at 6 in total
2. Each text the agent says is sent as `text/plain`, when forward is on.
3. The turn ends with status `Success`, so the block waits. The next input comes back through the block's default self-exit and runs the next turn.
4. A handoff tool call does two things:
   - it replaces `context.inbound` with `{content:{type: handoff+json, value:{name, parameters}}}`
   - it sets the status to `Handoff`

   The input condition then fails, and the handoff exit matches in the same input. If the handoff document comes back to the block (no matching exit), the block just waits, with no model call.
5. Failures set status `Error` plus `aiagent.errorCode`, and the block takes the fallback exit. The action never throws. The failure codes are:
   - `model_error`: the provider or network failed, or the flow has no key
   - `refusal`
   - `too_many_tool_calls`
   - `unavailable`: no agent service
6. The engine's time limit still applies. The action uses the default 30 s, or `timeout`/`builder:actionExecutionTimeout`. An abort past the deadline fails the action, as any other action does.

### Tools
- Tool names are sanitised to `^[a-zA-Z0-9_-]{1,64}$` and made unique. For example, `$title` "salvar e-mail" becomes `salvar_e-mail`.
- Each handoff becomes a tool named `handoff_<name>`. Its schema comes from `parameters`: either a JSON Schema object, or a name → description map, which becomes string properties.
- Execution uses the engine's own runner through the new `ActionDeadline.runActions`. `processActions` is re-entered in the same block and the same trace, so conditions, `{{...}}`, secrets masking (HTTP only) and time limits apply as usual.
  - `suspendHttp` is removed for the call, so a ProcessHttp tool calls the network inline instead of suspending the input halfway.
  - The tool's `continueOnError` is forced off.
  - Before the run, `aiagent.name`, `aiagent.parameters` and `aiagent.toolCall_id` are set, so a tool's settings can read `{{aiagent.parameters@x}}`.
- The model gets the result `{status:'ok', variables:{<changed context vars>}}`, capped at 4 KB, or `{status:'error', message}` with `isError`.
- KnowledgeBaseConsult, ForwardToAgent and LeavingFromAgent are not tools.

### Handoffs and LeavingFromAgent
- On a handoff the memory is cleared at once. `LeavingFromAgent` (in `afterStateChanged`, so it runs only when the block really changes) deletes the memory and the status. `aiagent.*` stays readable in the next blocks.

### Memory
- Stored in the context variable `#aiagent-memory@{blockId}`, as JSON messages.
- `#` keys are engine-only: flows and scripts cannot read or write them.
- Trimmed to the last N messages, cut at a user message so no tool result is orphaned, and kept within 32 KB.
- Its expiration follows `builder:stateExpiration`.
- Anthropic assistant turns keep the provider's raw blocks (`raw`), replayed unchanged to the same model. Thinking blocks are included.

### `aiagent.*` variables
- The provider is now in `FONTES_SUPORTADAS`. It reads JSON under the engine key `#aiagent`.
- Filled fields:
  - `agentResponse`: a JSON list of the turn's texts
  - `message`: the `{type,content}` envelope of the last text, or of the error
  - `errorCode`
  - `redirect`: `handoff` or `error`
  - `name`: the tool or handoff
  - `parameters`: JSON
  - `toolCall_id`
  - `userMessage`
  - `userMessage_id`
- Empty: `skill_id`, `skillName`, `task_id` and `taskName` belong to Blip's AI platform.
- The Gestão variable library now marks the nine filled fields as available.

### Providers (`@pipe/ai/agente`, new export)
- `callAgentModel(request, {apiKey, signal, anthropic?, fetch?, openAiBaseUrl?})` translates one provider-neutral request per provider:
  - **Anthropic** uses the SDK's `messages.create`:
    - tool results are merged into one user message
    - Claude 5 models get `output_config.effort: 'low'` and at least 4096 `max_tokens`, because thinking is always on
    - `refusal` is mapped to `stopReason: 'refusal'`
  - **OpenAI** uses `POST {base}/chat/completions` over `fetch`, with the key only in `authorization`:
    - `max_completion_tokens` is sent
    - tool calls are function tools
    - both `refusal` and `content_filter` map to `refusal`
- Errors become `AgentProviderError` with the status only, and never contain the key.

### Secrets (API, `agent-model.ts`)
- `agentModelService` reads the secret named by `apiKeySecret`, or by the default for the provider. It uses the same per-input cache `engineServices` already had for `resolveSecret`.
- It passes the key only to the provider call and masks it with `maskSecrets` in any error message.
- The key never enters the engine, the context, `execucao_passo`, a message or the test-run response. `apiKeySecret` in the settings is only a name.
- Without a key:
  - **production** throws, so the block takes the `Error` exit with `aiagent.errorCode = model_error`
  - **the Builder test run** (`agentStub: true`) answers with a stub `[Simulação] …`, and `/handoff <nome>` makes the stub call that handoff so the exits can be tested
- With a key, the test run calls the provider for real, the same as production.
- `PIPE_OPENAI_BASE_URL` (optional) points OpenAI at a compatible gateway. The DB test uses it to stub the provider locally.

### Import report
- In a block that has `ForwardToAgent`, the local actions count as real actions (tools) instead of `semEfeito: acao-local:*`.
- `ForwardToAgent`/`LeavingFromAgent` are now in `PROVEDOR_PADRAO`, so imported Blip agent blocks no longer show as `naoSuportado`.
- The importer keeps `$description` and `$inputSchema` on local actions.

## What the Builder UI (P14-UI) still needs

Nothing in `apps/management-vite/src/pages/builder/**` draws the agent block today; only the icon mapping exists. I left the Builder alone because 02-52 (Codex) is changing the same files right now. Imported agent blocks keep their editor drawing, round-trip through `PUT /builder`, and run.

P14-UI needs:
1. **"Agente de IA" block creation.** The block's shape is:
   - id `ai-agent:<uuid>`
   - entering `ForwardToAgent`
   - content input `{bypass:false, conditions:[status == Success]}`
   - `$conditionOutputs`: `[Error → fallback]` plus one output per handoff (the two conditions above)
   - `$defaultOutput` = the block itself
   - `$afterStateChangedActions: [LeavingFromAgent]`
2. **A sidebar with:**
   - a **provider** select (Anthropic/OpenAI) and a **model** field with suggestions (claude-sonnet-5, claude-opus-5, gpt-4.1, gpt-5-mini …)
   - max tokens and temperature, with a note that recent models ignore temperature
   - the **API key secret** name, defaulting to `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, with a link to Configuração › Variáveis sensíveis
   - the system prompt
   - a short-term memory length
   - forward on/off and the output variable
3. **Handoffs editor.** It edits name, description and parameters, and adds or removes the matching exit on the block.
4. **Tools list.** It works on `$localCustomActions` and edits each tool's `$title`, `$description` and `$inputSchema`. Tool action types come from the existing "Ações" catalog.
5. **Test panel note.** Without a key the test run answers `[Simulação]`, and `/handoff <nome>` walks an exit.
6. **Publish validation (optional).** It could warn when a block has no key secret configured.

## Verification (worktree)

| Package | Check | Result |
|---|---|---|
| core | `npx vitest run` | 603/603 (24 files; new `ai-agent.test.ts`, 10 tests) |
| core | `npx tsc --noEmit -p .`, `npx eslint src/flow` | clean |
| @pipe/ai | `vitest run` | 80/80 (new `agente.test.ts`, 5 tests; SDK and `fetch` stubbed) |
| @pipe/ai | `tsc` (build + tests config), `eslint src` | clean |
| API | `npx tsc -p tsconfig.test.json --noEmit` | clean |
| API | `eslint src tests` | only the known `sla.ts` error |
| API | DB-free run (throwaway config): `agent-model.test.ts`, `engine-services.test.ts` | 18/18 (4 + 14) |
| Gestão | `tsc`, `eslint .` | clean |
| Gestão | `pnpm test` | 427/427 |
| Gestão | `vite build` | ok |

## DB tests for the orchestrator (not run here)

`apps/api/tests/ai-agent.test.ts` needs migration 0055 (secrets) applied. It sets `PIPE_CHAVES_SEGREDO` and stubs OpenAI with a local HTTP server through `PIPE_OPENAI_BASE_URL`, so it makes no network calls and uses an invented key. It covers:
- **Production over the WhatsApp webhook:**
  - an agent conversation with memory, a tool (SetVariable from `aiagent.parameters`) and a handoff to the named exit
  - the key only in the provider's `authorization` header, and absent from `execucao_fluxo.contexto` and `execucao_passo`
  - with no key, the Error exit
- **The Builder test run:**
  - the stub plus `/handoff` without a key
  - with a secret created through the API, the same conversation as production, and the key absent from the response

Recommended regression: `builder-test-run.test.ts`, `flow-actions.test.ts`, `flow-secrets.test.ts`, `subflows.test.ts`.

## Migration

None. 0058 is still free. The configuration lives in the flow document and the memory lives in the contact's flow context.

## Merge risks

- `packages/core/src/flow/context.ts`: all additive:
  - type import line
  - `'aiagent'` in `FONTES_SUPORTADAS`
  - `ActionDeadline.runActions`
  - `ServicosDoMotor.callAgentModel`
  - `AI_AGENT_VARIABLES_KEY`
  - the `aiagent` provider
  - a header comment phrase
- `packages/core/src/flow/actions.ts`:
  - one import line
  - two lazy wrapper actions before `ACTIONS_OF_MOTOR`
  - two list entries at the end of that list

  02-54 (ExecuteTemplate) edits `executeTemplate` in the same file, in a different region.
- `packages/core/src/flow/manager.ts`: 3 lines in `processActions`' deadline object, plus the new `inlineHttp` helper before `processarSaidas`.
- `packages/core/src/flow/editor.ts`:
  - `converterAcao` now delegates to `convertAction`
  - `convertLocalAction`
  - the local-action branch in `importReport`
- `packages/core/src/flow/index.ts`: one `export *` line after `actions.js`.
- `apps/api/src/domain/engine-services.ts`:
  - one import
  - the `agentStub` option
  - the `resolveSecret` cache moved into `loadSecret` (same behaviour)
  - one `callAgentModel` entry
- `builder-test-run.ts`: one `agentStub: true` line.
- `apps/api/package.json` + `pnpm-lock.yaml`: the workspace dependency `@pipe/ai` (not an npm package). The API Dockerfile already copies `packages/` whole.
- `_journal.json` is untouched.

## Deviations and provisional points

- **Inline turn instead of an external platform.** In Blip the handoff arrives as a later input. Pipe takes the exit within the same input. The `Handoff` status value is Pipe's own.
- **Handoff document shape.** `{content:{type,value:{name,parameters}}}` is my reading of the paths the outputs test. The real wrapper Blip's platform sends is not captured.
- **Input forwarding is not implemented.** Blip exits on `…@content.value.type` values such as `audioForward`/`pdfForward`/`unsupportedContent`, but Pipe does not do this. A non-text input goes to the model as its JSON text.
- **MCP tools (`settings.tools`) are ignored.** That includes `grounding-mcp` and the Blip model-context server. This is P15.
- **The first input is answered at once.** The message that brought the contact into the block is sent to the agent immediately, so the agent answers on arrival.
- **Usage is not stored.** Token usage comes back in the response but is not written to `consumo_ia`. OpenAI prices are not in `PRECOS`.
- **The agent runs inside the inbound transaction,** like ProcessHttp's test-run path and scripts. A long tool loop can hit the action time limit.

## For P15 (knowledge base / MCP) and P16 (NLP / AI Answers)

- **P15:**
  - `agentToolbox` is the single place where tools are built. `KnowledgeBaseConsult` local actions can become a retrieval tool whose result is the matching passages. `respondWithKnowledge`/`knowledgeMatch` already exist, but a semantic search is still to build.
  - `settings.tools` (MCP entries `{mcp, headers, transport}`) can be mapped to remote tools in the same box.
  - `callAgentModel` already carries tool calls and results for both providers.
- **P16:**
  - `@pipe/ai/agente` `callAgentModel` is a general provider-neutral chat call, usable with no tools.
  - An intent/entity classifier, or AI Answers (`aianswers.*`), can reuse it with the same flow-secret key resolution (`agentModelService`), or reuse `@pipe/ai`'s structured `createCall` for Anthropic.
  - The `aiagent` provider pattern (JSON under an engine `#` key) is the model for an `aianswers` provider.

## Self-Check: PASSED

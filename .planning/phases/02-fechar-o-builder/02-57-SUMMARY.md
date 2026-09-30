---
phase: 02-fechar-o-builder
plan: 57
subsystem: management-vite (Builder)
tags: [P14, P14-UI, D-58, ai-agent, ForwardToAgent, builder-ui]
requires: [02-53, 02-52, 02-48]
provides: [AI agent block created, configured, tested (stub) and published from the Builder]
key-files:
  created:
    - apps/management-vite/src/pages/builder/ai-agent-block.ts
    - apps/management-vite/src/pages/builder/panel-ai-agent.tsx
    - apps/management-vite/tests/builder-ai-agent.test.ts
  modified:
    - apps/management-vite/src/pages/builder/model.ts
    - apps/management-vite/src/pages/builder/actions-of-block.ts
    - apps/management-vite/src/pages/builder/error-marks.ts
    - apps/management-vite/src/pages/builder/validation.ts
    - apps/management-vite/src/pages/builder/panel.tsx
    - apps/management-vite/src/pages/builder/panel-actions.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder/menu-new-block.tsx
    - apps/management-vite/src/pages/builder/editor.tsx
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/src/pages/builder/no.tsx
    - apps/management-vite/src/pages/builder/test-panel.tsx
    - apps/management-vite/src/pages/builder.tsx
decisions:
  - "The block is Blip's editor shape (format only, D-33): `ai-agent:<uuid>`, entering ForwardToAgent with the agent settings, input waiting on `agent_forwardToAgentState_status == Success`, `LeavingFromAgent` in `$afterStateChangedActions`, the exception output (`Error` → fallback, `$isAgentDefaultOutput`), default output = the block itself, `$localCustomActions: []`. Title \"Novo Agente\" (Blip's `defaultAiAgentTitle`)."
  - "Default settings follow Blip's `getDefaultConfiguration` (maxTokens 2048, temperature 0.7, one empty system instruction, short-term memory 50, forward on, `tools: {}`) with Pipe's provider/model: Anthropic, `claude-sonnet-5`."
  - "Prompt entries are written with both `role` (what core's `agentSettings` reads) and `type` (what newer Blip blocks use); the panel reads either. The output variable is written to `output.variable.{enabled,name}` (engine) and mirrored to `output.forward.outputVariable` (Blip)."
  - "The key secret is stored only when it differs from the provider default (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`), so it follows a provider switch. The key value never touches the block."
  - "A handoff is kept in two places, as Blip does: `settings.handoffs[]` and a named output (`input.content@content.type == handoff+json` and `input.content@content.value.name == <name>`, `$isAgentCustomOutput`). Add/rename/remove/destination edit both in one gesture (one undo step)."
  - "Tools are `$localCustomActions` edited with the existing action cards; each card gains Blip's \"ORIENTAÇÕES PARA O AGENTE\" (description) and the argument JSON Schema. New tools are named `ferramenta_N`."
  - "The model settings live as sections at the top of the \"Instruções\" tab instead of Blip's \"CONFIGURAR AGENTE\" dialog."
metrics:
  completed: 2026-09-30
---

# Phase 2 Plan 57: AI agent block in the Builder (P14-UI) Summary

The Gestão Builder can now create, configure, test (stub) and publish the **Agente de IA** block that 02-53 made run. Each agent picks **Anthropic or OpenAI** (D-58).

## What the user can do

- **Create**: "Adicionar bloco" → NOVO BLOCO → **Agente de IA**. This works on the main flow and inside a subflow. The block "Novo Agente" lands in the middle of the canvas with its panel open. On the canvas it shows a robot icon, the caption "Agente de IA" and a brand-colored left edge.
- **Instruções tab** (Blip's "Instruções" tab; the model settings from its "CONFIGURAR AGENTE" dialog are sections here):
  - **Modelo da LLM**:
    - Provedor: Anthropic or OpenAI.
    - Modelo: free text with suggestions such as `claude-sonnet-5`, `claude-opus-5`, `gpt-4.1` and `gpt-5-mini`.
    - Temperatura: disabled, with a note, when the model does not accept it. This is the same rule `@pipe/ai` uses.
    - Max tokens.
    - **Chave do provedor (variável sensível)**: suggests the flow's secret names and shows the name in effect. The default is `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`. A warning appears when the flow has no secret with that name, and **"Abrir Variáveis sensíveis"** opens Configuração › Variáveis.
  - **Histórico de mensagens**: a switch and "Quantidade de mensagens" (1 to 100).
  - **Resposta**: "Enviar resposta ao contato", and "Salvar resposta em variável" with the variable name.
  - **Instruções para o agente**: one or more system instructions, with "+ Adicionar instrução" and delete. Other prompt entries that came in an import (examples, history variables) are kept and counted.
  - A note on how the test run behaves without a key.
- **Condições de saída tab** (Blip's "Direcionar para bloco"):
  - One card per handoff:
    - Nome: lower case, digits and `_`, at least 3 characters, unique.
    - "Instruções para o agente": the description the model sees.
    - "Schema dos parâmetros": JSON. Invalid JSON is shown but not saved.
    - "Direcionar usuário para": the destination.
  - **"+ Adicionar direcionamento"** creates the handoff and its named exit. Deleting a handoff removes its exit.
  - **Saída de exceção**: where the contact goes when the agent fails (`aiagent.errorCode`).
  - Outputs imported from Blip that Pipe does not generate (input forwarding, `requestTimeout`) are listed with their destinations and kept.
  - The default output always returns to the block. The panel says so.
- **Ações tab**:
  - **Ferramentas** ("Inclua ferramentas que serão executadas pelo agente durante o atendimento.", "Adicionar ferramenta") takes the place of the entering actions.
  - The menu is the same "ADICIONAR FERRAMENTAS" catalog. Inside a subflow, ProcessContentAssistant and Redirect are left out.
  - Each tool card adds "ORIENTAÇÕES PARA O AGENTE" (Descrição) and "Editar variável (JSON Schema)" above the action's own fields.
  - The action's name is the tool name, with Blip's rules: at least 3 characters; lower case, digits, `-` and `_`; unique per agent.
  - "Ações de Saída" stays as on any block.
- **Validation**: the block paints red, and blocks Publish, when:
  - the model is missing
  - max tokens is outside 1–8192
  - the temperature is out of range for the provider
  - there are no instructions
  - the memory length is outside 1–100
  - the output variable has no name, or an invalid one
  - a handoff has a bad or duplicate name, no description, or no destination
  - a tool has a bad or duplicate name, no description, a non-object schema, or a missing required field

  The Instruções tab lists these messages at the top.
- **Test**: when the flow, or any of its subflows, has an agent, the Test panel explains the no-key stub (`[Simulação] …`) and `/handoff <nome>`. With the key configured, the test calls the provider for real.
- **Publish / import / export**: the block is saved in the flow document. Blip `ForwardToAgent` blocks import and export unchanged; the test covers `type` prompts, `forward.outputVariable`, `contentSafety`, `input`, `stateVersion` and `$toolActionsMapping`. Duplicate and paste keep the `ai-agent:` prefix and the self default output.

## Blip evidence used (D-33: format and wording only, nothing copied)

- `portal.js`:
  - `createAiAgentState` / `getDefaultConfiguration` (:156314, :250898): block shape and defaults
  - agent outputs and `ensureOutputConditionsForHandoffs` (:156240, :222945, :266058): handoff exit conditions and the `$isAgent*Output` flags
- Translations (pt-BR): `aiOutputs` (Direcionar para bloco, Adicionar direcionamento, name rules, Schema error), `aiAgent`/`ai-agent-actions` (Ferramentas, ORIENTAÇÕES PARA O AGENTE, tool name rules), `modelConfiguration` (MODELO DA LLM, Temperatura, Max tokens), `roles.short-term-memory`, `prompt.placeholder.system`, `defaultAiAgentTitle`, `aiAgent` ("Agente de IA").
- No Blip values or secrets were copied from the captures.

## Verification (apps/management-vite)

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| `npx eslint .` | clean |
| `pnpm test` | 450/450 (10 new in `builder-ai-agent.test.ts`) |
| `npx vite build` | ok (the usual chunk-size warning only) |

The new tests cover:
- the block shape
- provider switch, model and key secret
- temperature rules and number validation
- instructions and memory
- output variable (engine and Blip keys)
- the handoff and exit lifecycle, including exits missing from an import and the exception exit
- tool name, description and schema rules
- a Builder-made agent that compiles through core `converterDoEditor`, passes `validateFlow`, and is read by core `agentSettings`/`agentToolbox` with the configured provider, model, system prompt, memory, handoffs and tools
- Blip import/export round trip
- duplicate

Not run here: a visual check in the browser. It needs the API and a DB (no Docker in this worktree). There are no API/DB tests for this plan; for the engine side see 02-53's `ai-agent.test.ts`.

## Differences from Blip

- **Model settings are inline**, not in the "CONFIGURAR AGENTE" dialog. There are no "Interpretação" (audio/PDF/image forwarding) or "Filtros" (content safety) tabs, because the engine does not implement them (02-53). Imported values are kept untouched.
- **No "Gerar/Otimizar instruções com IA"**, guardrails, history-variable instructions or dynamic model mode. Only system instructions are edited; other prompt entries are kept.
- **No "Conhecimento" tab / MCP tools** (P15, 02-55). `settings.tools` is kept as imported.
- **Handoff editing is inline on the card**, not in Blip's separate "Definições / Propriedades / Schema" detail view. Deleting a handoff does not ask for confirmation; Ctrl+Z undoes it.
- **Provider per agent** (D-58), and the key is a flow "Variável sensível". Blip uses its own platform provider.
- **Temperature is disabled** for models that reject it (Claude 5, OpenAI reasoning models) instead of being sent.

## Engine gaps found (core, out of scope here)

- `agentSettings` reads prompt entries by `role` only. Newer Blip blocks use `type` (`{type:'system'}`, `{type:'short-term-memory'}`), so an **imported** Blip agent runs without its instructions and memory until it is edited in the Builder, which rewrites `role`. The fix is one line in `packages/core/src/flow/ai-agent.ts`: read `p.role ?? p.type`.
- The engine reads the output variable from `output.variable.{enabled,name}`. Blip's current field is `output.forward.outputVariable`, so imported blocks do not save the variable until they are edited.

## Merge risks

- `panel-actions.tsx`:
  - `ListOfActionsOfBlock` gained the optional `criarAcao`/`extraDoCard` props
  - `ActionCard` gained the optional `extra` prop
  - there is an agent branch in `ActionsPanel`
- `actions-of-block.ts`:
  - `ActionsList` includes `$localCustomActions`
  - `ACTIONS_OF_SYSTEM` includes `ForwardToAgent`/`LeavingFromAgent`
- `panel.tsx`: the `onAbrirVariaveis` prop, the agent tab label, and body branches. 02-56 may add an intent/AI Answers branch next to it.
- `menu-new-block.tsx`: the optional `onAgente` item after "Pesquisa de satisfação".
- `editor.tsx`: `createAgent`, the `onAbrirVariaveis` prop, the import line.
- `builder.tsx`: one `onAbrirVariaveis` prop on `<Editor>`.
- `error-marks.ts`/`validation.ts`: one `aiAgentErrors` call each.
- `model.ts`: `PREFIX_OF_AI_AGENT`, `Block.$localCustomActions`, and the `blockCopy` prefix branch.
- `no.tsx`, `test-panel.tsx`, `editor.css`, `panel-block.css`: additive.
- No API, core, contracts or DB change. No migration, no new npm package.

## Self-Check: PASSED

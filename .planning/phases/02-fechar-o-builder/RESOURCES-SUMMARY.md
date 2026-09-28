# Recursos (bot resources) — Blip parity

Correção sob demanda do dono, motivada por uma falha real em produção: um fluxo importado da Blip
(estado `onboarding`) falhava em `ExecuteScript` com "Não há provedor para a fonte de variável
'resource'." O fluxo lê `resource.simpleResources`, `resource.objectResources@<prop>`,
`resource.createMenuFunction` (fonte JS injetada num script) e `resource.TimeZoneAttendance`, tanto
em `{{resource.X}}` quanto em `inputVariables` de `ExecuteScript`.

## O que foi construído

1. **Storage** — `recurso_do_fluxo` (tenant_id, fluxo_id, nome, tipo, valor, timestamps), migração
   manual `0052_recurso_do_fluxo.sql`, RLS igual a `funcao_do_fluxo`, único `(tenant_id, fluxo_id,
   nome)`.
2. **API** — CRUD em `/v1/management/flows/:id/resources` (`GET`, `POST`, `PUT :id`, `DELETE :id`),
   gated por `requirePermissionInFlow(..., 'resources.ler'|'resources.escrever')` — a MESMA chave de
   permissão `resources` que a Blip usa para esta tela (já existia em `RESOURCES_OF_FLOW`,
   `team-of-flow.ts:49`, sob o título "Recursos"). Validação: nome precisa bater com a gramática de
   variável do motor (`[\p{L}\p{N}_.]{1,190}`, sem hífen/espaço/emoji — senão o recurso nunca seria
   lido de volta como `{{resource.nome}}`) e conteúdo precisa ser JSON válido quando o tipo termina
   em `json`.
3. **Engine** — `resource` virou uma fonte de variável com provedor real em
   `packages/core/src/flow/context.ts`: `Context.resources` (um `Record<nome, valor>`) é carregado
   pela `api` no mesmo lugar em que `contact` é carregado (`domain/flow.ts`, dentro de `rodar()`) e
   também no sandbox de teste do Builder (`builder-test-run.ts`). `resource.<nome>@<prop>` em valor
   JSON não precisou de código extra: o `propertyJson` genérico do `getVariable` já cobre qualquer
   fonte.
4. **UI** — nova tela "Recursos" no menu do bot (`apps/management-vite/src/pages/flow/itens.ts`),
   com listar/criar/editar/excluir e um modal de "Importar recursos" (aceita o formato de exportação
   da Blip `key/type/content` ou um objeto simples `{ nome: valor }`).
5. **Biblioteca de variáveis do Builder** — `resource.?` passou de `suportada: false` para `true`
   (`system-variables.ts:133`), e "Minhas variáveis" agora lista `resource.<nome>` de cada recurso
   do fluxo (carregado só quando o painel abre).

## Fatos da Blip usados (arquivo:linha)

Todos em `referencias-blip/builder/builder/zip19/supernova.blip.ai/`, exceto onde indicado.

- **Modelo do recurso** (chave/tipo/conteúdo) e catálogo de tipos de conteúdo (`text/plain`,
  `application/json`, etc.): `portal.js:271004` (`const nO = JSON.parse('{"en":[...`).
- **CRUD via comandos LIME** `/resources/{key}`: `portal.js:272958-272993` (`getResource`,
  `deleteResource`, `setResource`, `getResources` com `$skip`/`$take`/`keyFilter`/`documentFilter`).
- **Fluxo de salvar/editar** (`saveResource`), com checagem de chave duplicada e modal de
  confirmação: `portal.js:271256-271310`. **Excluir**: `portal.js:271312-271324`.
- **Regra de chave**: sem emojis (`emojiRegex`, `portal.js:271159`) e toast de erro em
  `portal.js:271261-271263` (`keyNameError`).
- **Validação de conteúdo JSON** ao trocar o tipo/conteúdo: `portal.js:271171-271177`
  (`resourceContent` setter tenta `JSON.parse` e liga `this.error`).
- **O item de menu "Conteúdos" É a tela de Recursos na Blip**: `portal.js:214788` —
  `"resources" === a && (n.title = "contents.title")`. Pipe já usa "Conteúdos" para outra coisa
  (modelos de WhatsApp), então Recursos ganhou item próprio em vez de substituir (documentado em
  `apps/management-vite/src/pages/flow/itens.ts`).
- **Textos pt-BR da tela** ("Recursos", "Chave", "Conteúdo", "Tipo", "Novo recurso", "Pesquise por
  um recurso", mensagens de duplicidade/erro): bundle
  `vendor-app_modules_translate_translationLoaders_sync_recursive_js_.fd90eba8615af397.js:3136`
  (objeto `"resources":{...}` em pt-BR).

## Decisões e itens documentados (não implementados)

- **Contexto do roteador (`usa_contexto_do_roteador`)**: quando um serviço compartilha contexto com
  o roteador, Pipe continua carregando os recursos do PRÓPRIO fluxo (`fluxo_id` do serviço), nunca
  os do roteador — documentado em `apps/api/src/domain/flow.ts` (comentário acima de
  `loadFlowResources`). Não implementado porque recursos são uma tabela por-fluxo nova, cada serviço
  atrás de um roteador já é seu próprio "bot" em Pipe, e a falha relatada era num fluxo direto (não
  atrás de um roteador) — YAGNI até aparecer um caso real de contexto compartilhado.
- **"Conteúdos" vs "Recursos"**: ver acima; ambos ficam acessíveis, sob a mesma permissão `resources`.

## Commits (branch `worktree-agent-a3de730fc3da7701e`, a partir de `43bce5d6`)

| Commit | Descrição |
|---|---|
| `bc578bb5` | `feat(db)`: tabela `recurso_do_fluxo` + schema Drizzle |
| `faf6c353` | `feat(contracts)`: `FlowResource`/`FlowResourceInput` |
| `5afa2e79` | `feat(core)`: provedor da fonte `resource` + testes unitários |
| `8c50b985` | `feat(api)`: CRUD `/v1/management/flows/:id/resources` + wiring do `Context.resources` |
| `94e7e6df` | `feat(management-vite)`: tela "Recursos" + item de menu + modal de importação |
| `81c4189f` | `feat(management-vite)`: `resource.<nome>` em "Minhas variáveis" |

## Testes executados

- `pnpm --filter @pipe/core test` — **485/485 passaram** (inclui os 5 novos testes de
  `packages/core/src/flow/context.test.ts`, cobrindo: resolução de recurso texto, `@property` em
  recurso JSON, recurso inexistente retorna `null` sem lançar, fonte sem provedor (`secret`) ainda
  lança como antes, e interpolação de `{{resource.createMenuFunction}}`).
- `pnpm --filter @pipe/management-vite test` — **412/412 passaram** (`node --test`; inclui os novos
  `tests/flow-resources-regras.test.ts`, o ajuste em `tests/flow-detalhe.test.ts` — que travava a
  lista exata do menu do bot e precisou ganhar "Recursos" — e o novo caso em
  `tests/builder-painels.test.ts` para `userVariables`).
- `pnpm --filter @pipe/management-vite typecheck` e `lint` — limpos.
- `pnpm --filter @pipe/management-vite build` (tsc + vite build) — build completo, sem erros (aviso
  de chunk grande é pré-existente, não relacionado a esta mudança).
- `pnpm --filter @pipe/api typecheck` (`tsc -p tsconfig.test.json --noEmit`, inclui os testes) —
  limpo.
- `pnpm --filter @pipe/api lint` — 2 erros pré-existentes e fora de escopo (`src/domain/management/sla.ts:61`,
  `tests/channel-of-flow.test.ts:487`), nenhum nos arquivos tocados por este trabalho.
- `pnpm --filter @pipe/db build` e `pnpm --filter @pipe/contracts build` — limpos.

**Não executado** (exige Postgres e não pode rodar de um worktree — o setup global dos testes de API
sobe docker compose, que conflita com os containers do dono):

- `apps/api/tests/flow-resources.test.ts` (novo — CRUD completo: lista vazia, criação
  text/plain e application/json com validação de JSON, rejeição de chave com hífen/espaço/emoji,
  conflito de chave duplicada, editar/excluir por id, 403 sem permissão, 404 cross-tenant, e
  `loadFlowResources` alimentando `Context.resources`).

Como `domain/flow.ts` e `domain/management/builder-test-run.ts` (compartilhados pelo motor de
produção e pelo "Testar" do Builder) foram tocados para acrescentar o carregamento de recursos, o
orquestrador deve rodar também as suítes de regressão que já cobrem esses dois caminhos, ainda no
mesmo comando `pnpm --filter @pipe/api test` (sobe Postgres via `docker compose`, fora de um
worktree):

- `apps/api/tests/flow.test.ts`
- `apps/api/tests/flow-actions.test.ts`
- `apps/api/tests/flow-content.test.ts`
- `apps/api/tests/builder-test-run.test.ts`

## Known Stubs

Nenhum. A tela de Recursos lista/cria/edita/exclui contra a API real; não há dado mockado.

# Auditoria de ligações — Builder × Gestão × Desk × API × core

Data: 2026-09-28. Branch `limpeza`, checkout principal. Auditoria somente leitura: nenhum arquivo de código foi alterado.

Durante a auditoria o merge `2d3c9eed` (02-38, provedores de variáveis) entrou no checkout. Ele mexeu em `packages/core/src/flow/context.ts`, `apps/api/src/domain/flow.ts`, `builder-test-run.ts` e `system-variables.ts`. As linhas citadas desses arquivos foram reconferidas depois do merge. Em `context.ts` e `flow.ts` elas podem andar de novo quando os três executores em paralelo fizerem merge.

Severidade: **alta** quer dizer que o produto promete algo que não acontece em runtime. **Média** é duplicação que já diverge, ou um endpoint/opção ociosa relevante. **Baixa** é higiene. Tamanho da correção: **P** (menos de ~1 h, um arquivo), **M** (alguns arquivos ou testes novos), **G** (muitos pontos de chamada).

## Resposta curta

1. **O motor é um só.** A produção (`runFlowInInbound`), o botão "Testar" do Builder e a retomada de ProcessHttp rodam `processInbound` de `@pipe/core` com o mesmo provedor de ações `PROVEDOR_PADRAO`. Os workers não executam fluxo.
2. **As bordas de serviço do motor (`ServicosDoMotor`) estão copiadas** entre `flow.ts` e `builder-test-run.ts`, e já existe pequena divergência entre as cópias.
3. **O Builder usa os mesmos endpoints e tabelas** do resto do produto para filas, regras, recursos, funções e variáveis de configuração. Não há CRUD paralelo.
4. O problema maior é outro: **várias coisas que o Builder e os Cadastros deixam configurar nunca são lidas pelo runtime.** São elas as regras de fila, as saídas `OutOfAttendanceHour`/`NoAgentAvailable` e dois dos três status de ticket.
5. Há lógica pura copiada entre front e API. Os dois casos principais são o avaliador de regra de fila e a allowlist de comandos.
6. Há código, CSS e endpoints ociosos, todos listados abaixo.

---

## 1. Motor único

### 1.1 OK: os três caminhos de runtime usam o mesmo motor
- **Produção:** `apps/api/src/domain/flow.ts:665-668` chama `processInbound(context, retomada ? {...} : {})`. Sem `actions`, o motor usa `PROVEDOR_PADRAO` (`packages/core/src/flow/manager.ts:161`).
- **Builder "Testar":** `apps/api/src/domain/management/builder-test-run.ts:336` chama `processInbound(context, { actions: PROVEDOR_PADRAO })` sobre o rascunho compilado (`compiledDraftOfFlow`, `:317`).
- **Retomada de ProcessHttp:** `executarProcessHttp` (`flow.ts:774`, chamado por `apps/api/src/queues.ts`) volta por `runFlowInInbound`.
- **Workers:** `apps/workers/src/*` não importam o motor. Eles só entregam o que o bot gravou (`delivery.ts:292,320`).
- **Validação no front** reaproveita o core: `validateCondition`, `ehUnaria` e `COMPARISONS` (`builder/conditions.ts:1`); `engineContentErrors` (`panel-content.tsx:3`); `PROVEDOR_PADRAO` para marcar ação sem suporte (`actions-of-block.ts:358`); `ehExportDoEditor` (`import-exportar.ts:1`). Isso está certo.

### 1.2 MÉDIA: `ServicosDoMotor` copiado entre produção e teste (tamanho M)
Os serviços do motor existem em duas cópias quase idênticas:
- `flow.ts:400-647` (produção)
- `builder-test-run.ts:197-294` (teste)

Trechos duplicados literalmente:

| Trecho | Produção (`flow.ts`) | Teste (`builder-test-run.ts`) |
|---|---|---|
| `callHttp` (guarda SSRF, mTLS, limite de bytes, 503/504 sintético) | `:471-495` | `:231-252` |
| `runFlowFunction` (checa aridade e chama `runFlowScript`) | `~:499-513` | `:254-264` |
| `respondWithKnowledge` (mesma SQL `ilike` e mesma fórmula de confiança) | `:591-606` | `:159-180` |
| Parser da allowlist `/tickets/...` com as mesmas mensagens de erro (`executeNativeCommand`) | `:183-254` | `:112-156` |
| Limite de 64 KB do `SetBucket` | `bucketSet` | `:266` |
| Mapeamento de campos do `mergeContact` | `:427-455` | `:215-227` |

Divergências que já existem entre as cópias:
- No teste, `/transfer` não valida UUID nem se a fila existe no tenant. A produção valida (`flow.ts:216-221`).
- No teste, `/status na_fila`, `em_atendimento` e similares são aceitos. A produção recusa estados que exigem atendente (`flow.ts:237-239`).
- O teste não implementa `setFlowState`. O motor chama `setFlowState?.()` (`core/flow/actions.ts:91`), então um `set /contexts/.../stateid@<outro fluxo>` vira no-op silencioso no Testar.
- `forwardForAttendance` do teste ignora `settings.filaId` (`builder-test-run.ts:211`).

**Correção:** extrair helpers puros em `flow.ts` ou num módulo irmão:
- `parseNativeCommand(uri, resource)`, que devolve a rota e o payload validado
- `callHttpService(tid)`
- `runFlowFunctionService(tid, lib)`
- `knowledgeMatch(tx, tid, req)`

Os dois lados passam a só aplicar o efeito (SQL ou memória).

### 1.3 MÉDIA: allowlist de comandos nativos em 4 lugares (tamanho P)
- **Core:** `ALLOWED_COMMAND_URIS` e `commandKind` em `packages/core/src/flow/actions.ts:30-60`, mais `CONTEXT_STATE_URI` em `:64`.
- **API produção:** a regex e a lista `['', '/change-tags', '/transfer', '/status', '/priority']` em `flow.ts:192-194`.
- **API teste:** a mesma coisa em `builder-test-run.ts:119-121`.
- **Front:** `acaoTemDependenciaExterna` em `apps/management-vite/src/pages/builder/actions-of-block.ts:361-372`, com a regex `/^\/tickets\/[^/]+(?:\/change-tags|\/transfer|\/status|\/priority)?$/` e a regex `stateid@`.

Correção: exportar do core um `commandRoute(uri)` e um `isPipeCommand(settings)` e usar nos três consumidores.

### 1.4 MÉDIA: `EXTERNAL_DEPENDENCY_ACTIONS` duplicado, e a cópia do core é código morto (tamanho P)
- `packages/core/src/flow/actions.ts:39` não tem nenhum uso, nem dentro do próprio core.
- `apps/management-vite/src/pages/builder/actions-of-block.ts:41` tem a mesma lista e é a cópia de fato usada (`:362`, mais o teste `builder-actions.test.ts:79`).

Correção: o front importar a do core e apagar a própria.

### 1.5 BAIXA: helpers de condição com o mesmo nome e comportamento diferente (tamanho P)
- No front, `comparisonOf` e `fonteDe` (`builder/conditions.ts:66,70`) são versões tolerantes: default `equals`/`input`, sem exceção.
- O core exporta funções homônimas que lançam exceção para valor inválido (`core/flow/condition.ts:63-64`).

É intencional (a tela precisa ler JSON importado inválido sem quebrar), mas o nome igual confunde. Correção: renomear para `comparisonOrDefault` e `sourceOrDefault`, ou exportar a versão tolerante do core.

### 1.6 BAIXA: mensagens de erro de destino duplicadas (tamanho P)
- `"O estado de destino '…' da saída não existe."` aparece em `builder/validation.ts:39`, `builder/conditions.ts:~191`, `core/flow/modelos.ts:195` e `modelos.ts:248`. O comentário de `validation.ts` diz "never two texts for the same problem", mas o texto é repetido em vez de importado.
- A regex de nome de variável `^[a-zA-Z0-9.]+$` aparece em `actions-of-block.ts:~521` e `core/flow/modelos.ts:93`.

Correção: exportar as constantes do core.

### 1.7 BAIXA: regex de UUID duplicada no mesmo arquivo (tamanho P)
`flow.ts:573` repete a regex literal quando já existe `const UUID` em `flow.ts:175`.

---

## 2. Builder ↔ outros módulos

### 2.1 OK: mesmos endpoints
- **Regras de atendimento:** o Builder (`queue-rules.tsx:63`) e os Cadastros (`registrations/rules-attendance.tsx:85`) leem `/v1/management/rules/attendance`. As escritas passam pelos mesmos helpers: `lib/registrations-gravar.ts:13,80,164,180` e `lib/actions.ts:38-41`, que chamam `domain/management/actions/regras.ts:233`.
- **Filas:** o Builder (`panel-queues.tsx:30`) e os Cadastros (`agents-queues.tsx:70`, `agents-queues-edit.tsx:36`) usam `/v1/management/agents/queues`.
- **Recursos:** `pages/flow/resources/gravar.ts:13-44` e o Builder (`pages/builder.tsx:91`, que alimenta `variables.ts:62`) usam `/v1/management/flows/:id/resources`. O motor lê a mesma tabela `recurso_do_fluxo`: `flow-resources.ts:165-172`, depois `flow.ts:360`, depois `core/flow/context.ts` (`resources`).
- **Funções:** um único controller (`controllers/flow-functions.ts:10`). O Builder é o único cliente (`flow-functions-gravar.ts:14-44`) e não existe outro editor de funções.
- **Variáveis `config.*`:** fluxo completo, do `PUT /flows/:id/builder` a `builder-of-flow.ts:250-318`, `core/flow/editor.ts:116-123`, `fluxo_versao.global` e `context.ts`.
- **Prioridade:** CRUD em `rules-priority.ts`, avaliada por `priority-engine.ts` (`avaliarExpressao` do core), chamada em `flow.ts:1064` e `inbound.ts:553`. Os rótulos no front vêm de `NIVEIS_ATRIBUIVEIS` do core.
- **Encerramento:** o bot usa `closeInTransaction` de `conversation.ts` (`flow.ts:236`). Não há SQL de encerramento paralela.

### 2.2 ALTA: regras de fila (`regra_fila`) nunca são avaliadas em runtime (tamanho M)
- A tabela só é tocada pelo CRUD em `apps/api/src/domain/management/registrations.ts` (linhas ~700-1062).
- O avaliador `queueOfDestination` (`apps/api/src/domain/management/rule-queue.ts:157`) não tem nenhum chamador. `registrations.ts:30` e `actions/regras.ts:8` importam só `campoValido` e `operadorValido`.
- Origem real da fila:
  - Handoff do bot: `settings.filaId` ou, na falta dele, `conversation.queueDefaultId` (`flow.ts:419-420`). O Builder cria o ForwardToDesk com `settings: {}` (`builder/model.ts:294`) e nenhum arquivo do Builder grava `filaId`, então na prática o destino é sempre a fila padrão.
  - Conversa sem bot: `inbox.queueDefaultId` (`inbound.ts:500`).
- Consequência: toda regra editada no painel de filas do Builder (`queue-rules.tsx`, `queues-panel.ts`) ou em Cadastros › Regras › Atendimento não tem efeito.

Correção: um único avaliador (ver 2.3) chamado dentro de `transbordar` (`flow.ts:1044`) e em `inbound.ts:500`, carregando as regras ativas e suas condições como `loadRulesOfPriorityActive` já faz.

### 2.3 MÉDIA: avaliador de regra de fila copiado entre front e API, e as duas cópias estão erradas (tamanho P–M)
- `apps/api/src/domain/management/rule-queue.ts` (209 linhas) e `apps/management-vite/src/lib/rule-queue.ts` (210 linhas) diferem só por renomes e por uma diferença real.
- **Cópia da API:** passa `context` com chaves em inglês (`message`/`contact`) direto para `avaliarExpressao` (`:163`). Os campos das regras são `mensagem` e `contato.*` (`:49-54`), então nada casa.
- **Cópia do front:** `destinationQueue` (`lib/rule-queue.ts:157`) mapeia `{ mensagem, contato: context.contact }` (`:161`). Só que `contact` traz `name`/`phone`, não `nome`/`telefone`. Além disso, essa função só é usada por `tests/rule-queue.test.ts`.
- O front de verdade usa `ordenarRegras`, `descreverRegra` e `regrasInalcancaveis` (`queues-panel.ts:2`, `rules-attendance.tsx:5`).

Correção: mover o módulo, que já é puro, para `packages/core` (por exemplo `core/src/distribution/queue-rule.ts`), corrigir o mapeamento de contexto e apagar as duas cópias.

- Nota extra (baixa): o arquivo da API tem bytes NUL literais num template string (`rule-queue.ts:202`). Por isso o git e o ripgrep o tratam como binário (`file` responde "data"), e grep e diff não o enxergam. Trocar pelo escape `\u0000`.

### 2.4 ALTA: saídas `OutOfAttendanceHour` e `NoAgentAvailable` nunca disparam (tamanho M)
- O motor só grava `desk_forwardToDeskState_status` como `'Success'` ou `'Error'` (`packages/core/src/flow/actions.ts:321-338`).
- `forwardForAttendance` sempre devolve `status: 'Waiting'`, tanto na produção (`flow.ts:422`) quanto no teste (`builder-test-run.ts:211`).
- As saídas oferecidas no painel (`builder/panel-outputs.tsx:126-127,153`) são opções ociosas. Fora do expediente, ou sem atendente disponível, a conversa entra na fila mesmo assim.

Correção: `forwardForAttendance` consultar o expediente (core `sla` e `/rules/schedules`) e os candidatos da fila (`distribution`), devolver o status, e `forwardToDesk` mapear esse status para a variável.

### 2.5 MÉDIA: dois dos três status de ticket são inalcançáveis (tamanho M)
- O Builder oferece `ClosedAttendant`, `ClosedClient` e `ClosedClientInactivity` (`builder/model.ts:119-123`).
- A tradução de `encerrada_por` para status Blip está em `flow.ts:266-271`.
- Mas só `'atendente'` e `'transferencia'` são gravados (`conversation.ts:119,381`). Nada grava `'cliente'` ou `'inatividade'`.
- `failByInactivity` (`desk/actions.ts:73`) coloca o atendente offline e não encerra conversa.
- Um `/status encerrada` feito pelo bot encerra com `agentId = null`. Isso é gravado como `'transferencia'`, vira `Transferred`, e esse status não tem saída no Builder.
- No Desk, `desk-vite/src/pages/contacts/page.tsx:356-367` rotula todo `encerrada` como "Finalizado pelo atendente".

Correção: `closeInTransaction` receber o ator real (atendente, cliente, inatividade ou bot).

### 2.6 MÉDIA: três caminhos de "entrar na fila" com comportamentos diferentes (tamanho M)
- **Bot:** `transbordar` (`flow.ts:1044-1104`) faz SQL direta, avalia prioridade (`:1064`), registra eventos e chama `distributeConversation` (`:1104`). Não passa pela máquina de estados `transitar` do core, que `conversation.ts:2,134` usa.
- **Desk:** `transferConversation` (`conversation.ts:281-445`) cria uma conversa nova com evento `transferida_fila` e não chama distribuição nem prioridade.
- **Inbound sem bot:** `inbound.ts:305,500-553` faz distribuição e prioridade por conta própria.

Correção: uma função de domínio `enterQueue(tx, conversa, fila, origem)`, com update, eventos, regra de fila, prioridade e distribuição, usada pelos três caminhos.

### 2.7 MÉDIA: biblioteca de funções — o que o Builder lista não é o que o motor carrega (tamanho P)
- Sem `flowId`, a listagem devolve as funções de todos os fluxos, com filtro literal `fluxo_id is null or fluxo_id is not null` (`domain/management/flow-functions.ts:56`), e limite default de 50 (`:47`) sem paginação no Builder.
- Com `flowId`, acontece o contrário: some a biblioteca do tenant.
- O motor carrega `fluxo_id is null or fluxo_id = <fluxo>` (`:122-126`, usado em `flow.ts:356` e `builder-test-run.ts:320`).
- Resultado: o seletor oferece funções de outro fluxo, que falham em runtime ("não existe neste fluxo").

Correção: a listagem com `flowId` usar o mesmo predicado de `loadFlowFunctions`, o Builder passar o `flowId`, e paginar. Confirmar antes contra a decisão D-57 (biblioteca no nível do tenant), porque ela pode mudar o predicado.

### 2.8 BAIXA: configurações exibidas que ninguém lê (tamanho P para esconder, M para ligar)
- `builder:minimumIntentScore`, `builder:stateTrack`, `builder:useTunnelOwnerContext`, `builder:stateExpiration` e `builder:actionExecutionTimeout` (`builder/configuration-sections.ts:46-83`) não têm leitor em api nem em core. Estão marcadas `disponivel: false` e aparecem desabilitadas.
- O mesmo vale para o identificador do fluxo (`:88`) e as variáveis sensíveis (`:104`).
- O limite de tempo das ações vem de `CONFIGURATION_DEFAULT` (`core/flow/manager.ts:38,160`) e não de `builder:actionExecutionTimeout`.
- `fluxo.configuracao` (tela de boas-vindas e menu persistente: `configuration-of-flow.ts`, `management-flow.ts:328-360`) também não tem leitor em runtime.

### 2.9 BAIXA: recursos (tamanho P)
- Os nomes de recursos só são buscados quando o painel de variáveis abre (`builder.tsx:91`).
- `validation.ts` não valida referências `resource.<nome>`.
- Comentário em `context.ts` cita `resources.<name>` quando o certo é `resource.<name>`.

### 2.10 BAIXA: Desk × API/core
- A janela de 24h vem do core (`desk-vite/src/lib/order.ts:2,57`). Não foram achadas cópias de elegibilidade, transições ou rótulos de prioridade.
- Os limites de anexo foram copiados de `@pipe/storage` (`desk-vite/src/lib/attachments.ts:17-22`, comparar com `packages/storage/src/limites.ts:10-22`). A cópia é deliberada porque o pacote importa `node:fs`. Correção P: exportar `limites.ts` por um subpath seguro para o browser.

---

## 3. Código ocioso

Nem knip nem ts-prune estão instalados. O levantamento foi feito com varredura por nome de export em `git ls-files` (sem `dist`) e confirmado com `git grep -w`: cada item "morto" tem exatamente um hit, a própria definição.

### 3.1 Exports sem nenhum uso (MÉDIA, tamanho P: apagar)
**Builder (management-vite):**
- `builder/conditions.ts:92` `addValue` e `:99` `removeValue`
- `builder/model.ts:154` `raizDe` e `:373` `renameBlock`
- `builder/validation.ts:50` `errorsLocal` e `:59` `joinErrors`. O comentário do arquivo descreve a junção dos erros locais com os da API, mas ninguém a chama. Conferir se o card do bloco ainda soma as duas listas por outro caminho.
- `pages/flow/analytics/pecas.tsx:178` `urlPeriod`

**API:**
- `api/domain/management/rule-queue.ts:157` `queueOfDestination` (ver 2.2)
- `colors-of-queue.ts:20,24` `colorOfQueue` e `rotuloDaCor`
- `communication.ts:68` `offsetOfHeader`
- `monitoring.ts:690` `countClosedsInPeriod`
- `domain/twenty.ts:137` `linkDaEmpresa`

**Core:**
- `packages/core/src/flow/actions.ts:39` `EXTERNAL_DEPENDENCY_ACTIONS` (ver 1.4)

### 3.2 Usados só por testes (MÉDIA, tamanho P: decidir se ligam na tela ou saem)
- `builder/actions-global.ts:43,53,63,72`: `adicionarAcaoGlobal`, `substituirAcaoGlobal`, `removerAcaoGlobal`, `moverAcaoGlobal`. `panel-configuration.tsx` só usa `pseudoBlockOfGlobal`/`globalOfPseudoBlock`, então a tela reimplementa essas operações por outro caminho.
- `builder/configuration-sections.ts:115` `secondsToTimeSpan`
- `pages/flow/contents/regras.ts:58` `tiposDisponiveis`
- `pages/flow/growth/regras.ts:3` `resumirEnvios`
- `pages/flow/integrations/webhook/regras.ts:37` `interruptorDesabilitado`
- `lib/rule-queue.ts:157` `destinationQueue` (ver 2.3)
- `desk-vite/src/lib/order.ts:61` `horasRestantes`
- `api/domain/management/monitoring.ts:352` `sortQueueOfWait`
- Seams legítimos de teste, que podem ficar: `definirFabricaGraph*`, `attachment.ts:33` `useStorage`, `media.ts:41` `defineSearchOfMedia`.

### 3.3 `export` desnecessário: usado só no próprio arquivo (BAIXA, tamanho P)
- **Builder:**
  - `actions-of-block.ts`: `ACTIONS_OF_SYSTEM:350` e tipos
  - `conteudo.ts:16-97`: constantes `TIPO_*` e `LIMITE_DE_CONTEUDOS`
  - `model.ts:93-146`
  - `setas.ts:12-62`
  - `search.ts:10-13`
  - `use-editor.ts:17-28`
- **Core:**
  - `context.ts`: `getStatePreviousId`, `readVariableName`, `escaparTexto`
  - `modelos.ts:95-139`: `validarAcao`, `validarSaida`, `validateState`
  - `condition.ts`: `OPERADORES`, `distanciaDeLevenshtein`
  - `actions.ts:30` `ALLOWED_COMMAND_URIS`
  - `editor.ts:185` `ACTIONS_WITHOUT_EFFECT`
  - `manager.ts:38` `CONFIGURATION_DEFAULT`
- **API:** cerca de 40 casos, por exemplo `flow.ts:1122,1187,1203`, `whatsapp/modelos.ts:86-354`, `distribution.ts:22,117`.

### 3.4 Arquivos não importados
Nenhum, fora os pontos de entrada:
- os `main.tsx`
- `apps/api/src/main.ts` e `index.ts`
- `import-flow.ts` (script `import:flow`)
- `domain/assumir.ts` (exportado em `package.json:34` e usado pelo bridge)

### 3.5 CSS sem uso (BAIXA, tamanho P)
- **`editor.css`:**
  - `.bl-values` (`:664`, `:737`, `:745`, e o descendente `:570`)
  - `.bl-values-field` (`:533`, `:745`)
  - `.bl-value` (`:532`)
  - `.bl-queues-body` (`:377`), `.bl-queues-summary` (`:384`), `.bl-panel-id` (`:413`)
- **`panel-block.css`:** `.bl-recado-titulo` (`:1274`)
- **`desk-vite/src/estilos/global.css`:** `.dk-menu-titulo` (`:290`), `.dk-chip-error` (`:926`), `.dk-contador` (`:985`), `.dk-card-info-icon` (`:1109`), `.dk-alerta` (`:1860`), `.dk-soltar` (`:1884`), `.dk-drop-card` (`:1895`)

### 3.6 ALTA (visual): classe renomeada só pela metade no Desk (tamanho P)
- `desk-vite/src/estilos/global.css:1487,1491` estiliza `.dk-group-inbound`.
- `desk-vite/src/pages/attendances/thread.tsx:98` emite `dk-grupo-entrada`.
- A contraparte `.dk-grupo-saida` bate.
- Efeito: os cantos do balão de mensagem recebida nunca são aplicados. É uma regressão do rename da Fase 1, não apenas CSS morto.

### 3.7 Endpoints que nenhum front chama (MÉDIA, a decidir: ligar ou remover)
Busca feita em management-vite, desk-vite, crm, site, bridge e workers. Os controllers do Builder (`management-builder.ts`, `flow-functions.ts`), `desk.ts` e `conversations.ts` não têm endpoint ocioso.

**Sem chamador:**
- `management-flow.ts:419` `GET /v1/management/flows/:id/logs`
- `management-registrations.ts:121` `GET /v1/management/channels`
- `management-registrations.ts:263,277` `PATCH`/`DELETE rules/schedules/ranges/:id`, e `:288,302` o mesmo para `exceptions/:id`
- `management-registrations.ts:354-389` CRUD `settings/words-forbidden`
- `management-operations.ts:117` `GET /v1/management/header`
- `satisfaction-surveys.ts:15` `GET .../satisfaction-surveys/responses`
- `sso.ts:53,63,77,104` (config de SSO, sem tela)

**Possivelmente externos (API pública, MCP, Twenty), conferir:**
- `catalogo.ts:269,335,363`
- `crm.ts:30,45,55`
- `convites.ts:82,99,119`
- `attachments.ts:52`

**Externos esperados:** `/auth/*` callbacks e `webhooks-*`.

### 3.8 Sobras de nomes em português após a Fase 1 (BAIXA)
- O código versionado não tem pares duplicados PT/EN.
- Há caminhos antigos em comentários: `dominio/` em cerca de 124 linhas de 98 arquivos, `controladores/` em 14, `paginas/` em 12, `gestao-vite` em 2. Exemplo: `desk-vite/src/lib/actions.ts:50` cita `apps/api/src/dominio/desk/acoes.ts`. Tamanho P (codemod de comentário).
- Os `dist/` não versionados guardam nomes antigos ao lado dos novos: `apps/api/dist` (`dominio/`, `controladores/`, `autenticacao.*`), `packages/core/dist` (`fluxo/`, `metricas/`…), `apps/workers/dist` (`agregacao.*`, `entrega.*`). Não afeta a build atual. Tamanho P: limpar e reconstruir.

---

## 4. UI duplicada entre apps (só listagem)

`@pipe/ui` exporta Botao, BotaoDeIcone, Etiqueta, Campo, Seletor, Abas, EmptyState, Carregando, Avatar, Card, Tabela e as peças de shell. A gestão o importa em cerca de 74 arquivos, o crm em cerca de 32, o desk em só 2. `Abas` tem zero usos.

| # | Item | Severidade | Tamanho |
|---|---|---|---|
| 4.1 | `icones-portal.tsx` (~220 KB) copiado em `management-vite/src/components/` e `desk-vite/src/components/`. Só o cabeçalho difere. | alta | P |
| 4.2 | Retorno pós-login divergiu: `management-vite/src/lib/inbound.ts` recusa `//` e `/\`; o `desk-vite/src/lib/inbound.ts` só recusa `//`, então aceita `/\evil` (possível open redirect). Conferir e alinhar. | alta | P |
| 4.3 | Cliente de API copiado: `lib/api.ts`, `query.ts`, `cliente-de-consultas.ts`, `navigation.ts`, `actions.ts` (`acaoRemota`), `components/link.tsx`, `exigir-session.tsx`. Management lê `corpo.mensagem` (`api.ts:45`) e Desk lê `error.message`: um dos dois está errado. | alta | M |
| 4.4 | Cerca de 9 famílias de modal (`registrations/_modal.tsx:9,43`, `mon-modal`, `an-modal`, `gr-modal`, `cf-modal`, `dk-modal`…). `window.confirm` segue em `builder/queue-rules.tsx:167`, contra a regra do próprio Builder. | média | G |
| 4.5 | Paginação: 3 versões (`components/pagination.tsx:49`, `lista-regras.tsx:53`, `pages/portal.tsx:150`). | média | M |
| 4.6 | Toast: 3 versões. O `builder/toast.tsx` + `toast-queue.ts` é o mais completo e serve de base. | média | M |
| 4.7 | Seletores e listbox feitos à mão (`components/selection.tsx:35`, `destination-picker.tsx:19`, `members/tabela.tsx:412`…). O desk usa `<select>` cru. | média | M |
| 4.8 | Cerca de 11 menus `role="menu"` feitos à mão. `bl-menu-actions` se repete em `panel-actions.tsx:312` e `panel-content.tsx:223`. | média | M |
| 4.9 | Chips removíveis em cerca de 10 variantes. Falta um `onRemover` em `Etiqueta`. | média | P + M |
| 4.10 | Seletor de período em cerca de 8 versões. Lógica duplicada entre `desk-vite/src/lib/period.ts` e `management-vite/src/lib/periodos.ts`. | média | M |
| 4.11 | Abas: cerca de 14 tablists locais (Builder: `panel.tsx:183`, `panel-configuration.tsx:105`, `panel-variables.tsx:108`); `Abas` não tem variante por estado. | média | M |
| 4.12 | Formatadores de duração: 4 cópias (`management-vite/lib/format.ts:4`, `monitoring-detailed.tsx:46`, `desk-vite/lib/format.ts:80`, `desk-vite/lib/period.ts:88`), mais `numero`/`percentual`/`dataHora` duplicados entre management e crm. | média | P |
| 4.13 | Avatar e `initials` duplicados no desk (`components/avatar.tsx:7`, `lib/format.ts:90`) em relação a `@pipe/ui`. | baixa | P |
| 4.14 | Painéis laterais, empty states (cerca de 40 `div.empty` crus), tooltips (3 `Dica`), loaders, busca (`flow-functions-panel.tsx:195` e `:281` repetem o mesmo bloco) e color picker. | baixa | M |

---

## Ordem sugerida de ataque
1. **2.2 + 2.3** (alta, M): avaliador de regra de fila no core e ligado em `transbordar` e no inbound.
2. **2.4** (alta, M): `OutOfAttendanceHour` e `NoAgentAvailable` de verdade.
3. **3.6** e **4.2** (alta, P): CSS `dk-grupo-entrada` e validação do retorno pós-login no desk.
4. **1.2 + 1.3** (média, M): extrair os serviços e a allowlist compartilhados entre produção e Testar.
5. **2.5** e **2.6** (média, M): ator real do encerramento e função única `enterQueue`.
6. **2.7** (média, P): escopo da listagem de funções.
7. Limpeza mecânica, sem risco: **3.1, 3.2, 3.5, 3.8, 1.4**.

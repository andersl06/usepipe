# Inventário de runtime do Builder da Blip × motor do Pipe

**Data:** 2026-09-28 · **Branch:** `limpeza` · **Tipo:** pesquisa só de leitura (nenhum código alterado)

**Objetivo.** Listar tudo o que um fluxo do Builder da Blip consegue fazer em tempo de execução e dizer,
item por item, se o motor do Pipe já faz. A lista serve de base para planejar a implementação do resto.
Este documento complementa `inventario-acoes.md` (26/09), que partiu das 19 actions do SDK. Aqui o ponto
de partida é o enum real de tipos de ação do bundle congelado e um fluxo exportado de produção.

**Fontes e abreviações usadas nas colunas de evidência**

| Abreviação | Arquivo |
|---|---|
| `portal.js` | `referencias-blip/builder/builder/zip19/supernova.blip.ai/portal.js` (20 MB, bundle do Builder) |
| `tr.js` | `referencias-blip/builder/builder/zip19/supernova.blip.ai/vendor-app_modules_translate_translationLoaders_sync_recursive_js_.fd90eba8615af397.js` |
| `export` | `C:/Users/anderson.linhares/Downloads/desk180326kgc0psrfuschzbsnvea (1).json` (45 blocos + ações globais) |
| `schemas.md` | `referencias-blip/pesquisa/blip-api-schemas.md` (catálogo de extensões `postmaster@…`, tirado da doc oficial) |
| `actions.ts` | `packages/core/src/flow/actions.ts` |
| `context.ts` | `packages/core/src/flow/context.ts` |
| `manager.ts` | `packages/core/src/flow/manager.ts` |
| `condition.ts` | `packages/core/src/flow/condition.ts` |
| `editor.ts` | `packages/core/src/flow/editor.ts` |
| `flow.ts` | `apps/api/src/domain/flow.ts` |
| `sandbox.ts` | `apps/api/src/domain/script-sandbox.ts` |
| `ui/…` | `apps/management-vite/src/pages/builder/…` |

**Marcas de procedência:** `[BUNDLE]` visto no bundle congelado · `[EXPORT]` visto no fluxo exportado ·
`[DOC]` doc oficial já sintetizada em `schemas.md` · `[SDK]` comportamento do `takenet/blip-sdk-csharp`,
de memória ou de `catalogo-gatilhos-acoes.md` (confirmar antes de implementar) · `[PIPE]` código atual.

**Legenda de status:** **suportado** = o motor executa com o mesmo efeito observável · **parcial** = executa,
mas falta parte do contrato (campo, variante, resposta no formato da Blip) · **ausente** = o motor recusa
(`A ação do tipo 'X' não existe no Pipe`, `Não há provedor para a fonte…`, `A URI … não é executada no Pipe`)
ou ignora sem efeito.

---

## 0. Achados que mudam o plano

1. **O fluxo exportado de produção não roda inteiro no Pipe hoje.** Ele usa `{{tunnel.identity}}` (4×),
   `{{application.identity}}` (9×), `{{application.identifier}}` (3×) e `{{random.guid}}` (1×). Nenhuma
   dessas fontes tem provedor (`context.ts:30-38`), e `getVariable` lança erro (`context.ts:426`).
   Das 35 `ProcessCommand` do export, só as 13 `set /contexts/{contact}/stateid@…` têm caminho no
   Pipe (D-55). Mesmo essas dependem de `{{flowIdX@resource}}`, que vem de `get /flow-id?shortname=`
   (ausente). As outras 22 caem em `A URI … não é executada no Pipe` (`actions.ts:59`).
2. **O enum real de ações do Builder tem 26 tipos, não 19** (`portal.js:157130`, repetido em `portal.js:284215`).
   Os 9 que ficam fora do SDK são `ForwardMessageToDesk`, `ForwardToDesk`, `LeavingFromDesk`,
   `SurveyMessage`, `ProcessAnswers`, `ExecuteBlipFunction`, `ForwardToAgent`, `LeavingFromAgent` e
   `KnowledgeBaseConsult`.
   `SetBucket` **não aparece** no bundle (0 ocorrências); é só do SDK. `SendCommand` também não entra
   em nenhum menu do Builder.
3. **O menu "ADICIONAR FERRAMENTAS" atual** (`portal.js:6891`; rótulos em `tr.js:1037`) tem 4 grupos.
   Consultar: Base de conhecimento (só dentro de agente de IA) e Assistente de conteúdo. Executar: Função da
   biblioteca, Redirecionar para serviço, Executar script, Executar script 2.0 e Processar comando.
   Integrar: Conectar MCP (só agente) e Requisitar HTTP. Manipular: Definir variável, Gerenciar lista de
   distribuição, Registrar eventos e Definir contato. O menu clássico (`portal.js:208821`) ainda oferece
   `ExecuteTemplate`, atrás da flag `builder-execute-template-action` (`portal.js:86372`).
   A tradução já traz "Executar pipeline" e "Conectar OpenAPI" (`tr.js:84`), mas o bundle não liga
   nenhum dos dois a um tipo: estão fora do snapshot.
4. **Ações "internas"** (`portal.js:256409`, `ignoredActions`) são postas pelo próprio bloco, e o usuário
   não as adiciona pelo menu: `SendMessage`, `ForwardMessageToDesk`, `ForwardToDesk`, `LeavingFromDesk`,
   `CreateTicket`, `ForwardToAgent`, `LeavingFromAgent` e `KnowledgeBaseConsult`.
5. **O Pipe já tem as peças para quase tudo o que falta.** Estão lá o cliente de LLM (`packages/ai/src/cliente/cliente.ts`,
   Anthropic), o horário por fila (`fila.horarioId`, `apps/api/src/domain/management/settings.ts:84`),
   a memória chave-valor (`gravar_memoria`, `flow.ts:513`), as listas (`flow.ts:543`), o rastreador de
   cliques (`apps/api/src/domain/rastreador-de-cliques.ts`) e as mensagens ativas (`apps/api/src/domain/message-active.ts`).
   O trabalho que falta é, na maior parte, **traduzir o contrato da Blip** para essas peças.

---

## 1. Tipos de ação

Contagem no export: TrackEvent 77, ExecuteScript 53, TrackContactsJourney 45, ProcessCommand 35,
SetVariable 34, SendMessage 21, ExecuteScriptV2 8, MergeContact 6, ProcessHttp 3, Redirect 2,
ForwardToDesk 1, SendRawMessage 1.

| # | Tipo (Blip) | Rótulo na UI (pt-BR) | Onde aparece na Blip | Status no Pipe | Evidência Blip | Evidência Pipe / lacuna |
|---|---|---|---|---|---|---|
| 1 | `SendMessage` | cards de conteúdo (Texto, Mídia, Menu…) | interna (conteúdo) | **suportado** (16 de 18 conteúdos; Carrossel e Solicitar ligação bloqueados, ver `GATE-FINAL.md`) | `portal.js:157130` | `actions.ts:203`; `editor.ts:144-156` |
| 2 | `SendRawMessage` | Conteúdo dinâmico | card de conteúdo | **parcial**: o editor marca como não suportado todo `type` diferente de `text/plain` | `portal.js:157130` | `actions.ts:220`; `editor.ts:374-376` |
| 3 | `SendMessageFromHttp` | Conteúdo HTTP | card de conteúdo | **suportado** | `portal.js:249020` (validador) | `actions.ts:263` |
| 4 | `TrackEvent` | Registrar eventos / Registro de eventos | menu Manipular | **suportado** (grava em `execucao_passo`; relatório de eventos é outra fase) | `portal.js:6891`, `tr.js:836` | `actions.ts:241`; `flow.ts:423` |
| 5 | `ProcessHttp` | Requisitar HTTP / Requisição HTTP | menu Integrar | **suportado** (retomada assíncrona D-25). `{{secret.*}}` nos cabeçalhos é ausente (ver §2) | `portal.js:6891` | `actions.ts:368`; `flow.ts:470` |
| 6 | `ManageList` | Gerenciar lista de distribuição | menu Manipular | **parcial**: grava contato em `lista_distribuicao`; não há envio broadcast a partir da lista | `portal.js:6891` | `actions.ts:111`; `flow.ts:543` |
| 7 | `MergeContact` | Definir contato | menu Manipular | **suportado** (nome, email, telefone, documento, cidade/gênero/extras em `atributos`). Campos como `address`, `culture` e `timezone` vão a `atributos`, não a colunas | `portal.js:6891`, `tr.js:836` | `actions.ts:297`; `flow.ts:426-457` |
| 8 | `Redirect` | Redirecionar para serviço | menu Executar | **parcial**: só funciona atrás de roteador, e o `context` não é entregue como primeira entrada do destino | `portal.js:6891` | `actions.ts:352`; `flow.ts:634-647` |
| 9 | `ExecuteScript` | Executar script | menu Executar | **suportado** (V8 no lugar de Jint; limites do Jint não reproduzidos, e reproduzi-los não faz sentido) | `portal.js:6891` | `actions.ts:449`; `sandbox.ts` |
| 10 | `ExecuteScriptV2` | Executar script 2.0 | menu Executar (flag `builder-execute-script-v2-action`) | **parcial**: só `request.fetchAsync`. Faltam `context.getVariableAsync/setVariableAsync/deleteVariableAsync` (os templates da própria Blip usam `context.setVariableAsync`, 14× em `portal.js`, ex. `portal.js:250450`) e `time.*`. `LocalTimeZoneEnabled` é repassado e ignorado | `portal.js:6891` | `actions.ts:450`; `sandbox.ts:58` (só fetch); `grep localTimeZone sandbox.ts` = 0 |
| 11 | `ExecuteTemplate` | Executar template | menu clássico, flag `builder-execute-template-action` | **parcial**: a Blip usa Handlebars (`tr.js:836`, "transformação de texto com a biblioteca Handlebars"). O Pipe só troca `{{caminho}}`, sem `#if`/`#each`/helpers | `portal.js:208821`, `portal.js:86372` | `actions.ts:453-475` |
| 12 | `ExecuteBlipFunction` | Selecionar função da biblioteca / Função da biblioteca | menu Executar | **parcial**: na Blip a biblioteca é **do contrato** e compartilhada entre bots (`tr.js:836`: "funções globais … nos chatbots do seu contrato"; modal "função em uso em outros bots"), com `source` = UUID (`portal.js:249000`). No Pipe ela é por fluxo | `portal.js:6891`, `portal.js:248995-249004` | `actions.ts:478`; `flow.ts:498` |
| 13 | `ProcessCommand` | Processar comando | menu Executar | **parcial**: executa só `/tickets/{id}[/change-tags\|/transfer\|/status\|/priority]` com vocabulário do Pipe, mais `set /contexts/…/stateid@…`. O campo `to` é ignorado. Ver §3 | `portal.js:6891`, `tr.js:836` ("Utilizar contexto do chatbot") | `actions.ts:81-109`; `flow.ts:182-257` |
| 14 | `SendCommand` | sem rótulo (só SDK/import) | nenhum menu | **parcial**: mesmo subconjunto de `ProcessCommand` | só templates (`portal.js:822`) | `actions.ts:160` |
| 15 | `SetVariable` | Definir variável | menu Manipular | **parcial**: `expiration` não é persistida (`context.ts:251`) | `portal.js:6891`, `tr.js:836` | `actions.ts:173` |
| 16 | `DeleteVariable` | sem rótulo no menu | nenhum menu (só import) | **suportado** | `portal.js:157130` | `actions.ts:191` |
| 17 | `ProcessContentAssistant` | Assistente de conteúdo / Consultar Assistente de conteúdo | menu Consultar (fora de subfluxo) | **parcial**: busca lexical `ilike` na base de conhecimento, sem modelo, sem `input.contentAssistant.*` | `portal.js:6891`, `tr.js:836` | `actions.ts:144`; `flow.ts:590-604` |
| 18 | `TrackContactsJourney` | invisível (posto em todo bloco no export) | automática | **suportado** (no-op; a jornada sai de `execucao_passo`) | `export` (45×) | `actions.ts:503` |
| 19 | `CreateTicket` | interna | interna | **suportado** | `portal.js:256409` | `actions.ts:307` |
| 20 | `ForwardToDesk` | interna do bloco Atendimento humano | interna | **parcial**: grava só `Success`/`Error` em `desk_forwardToDeskState_status`. A Blip ainda tem `NoAgentAvailable` e `OutOfAttendanceHour` (`portal.js:249536`), e a UI do Pipe já oferece essas duas saídas (`ui/panel-outputs.tsx:126-127`) que o motor nunca produz. A fila vem de `settings.filaId` ou da fila padrão, não de `contact.extras.teams`/regras (o export faz `MergeContact extras.teams` 5× antes de transbordar) | `portal.js:249536` | `actions.ts:327-339`; `flow.ts:417-421` |
| 21 | `LeavingFromDesk` | interna | interna | **suportado** (no-op; o Pipe encerra pelo Desk) | `portal.js:157130` | `actions.ts:344`; `editor.ts:185` |
| 22 | `ForwardMessageToDesk` | interna do bloco de atendimento (encaminha mensagens a ticket aberto) | interna | **ausente** no provedor, embora o efeito já exista (mensagem de conversa com atendente não passa pelo bot, `flow.ts:281`). Fluxo importado com essa ação falha | `portal.js:251110`, `portal.js:249050` | `actions.ts:507-530` (não listada) |
| 23 | `SurveyMessage` (`SurveyType`) | Pesquisa (card) | card de conteúdo | **parcial**: o Pipe reconhece a pesquisa pelo MIME `application/vnd.lime.satisfaction-survey+json` via `SendMessage`, mas o **tipo** `SurveyMessage` não está no provedor | `portal.js:249059`, `portal.js:253194` | `packages/core/src/flow/satisfaction-survey.ts`; `actions.ts:507` |
| 24 | `ProcessAnswers` | interna do bloco "AI Answers" (`UserInput`, `ContactId`, `AssistantId`) | interna | **ausente** | `portal.js:250744-250770` | — |
| 25 | `ForwardToAgent` | bloco Agente de IA (`settings.model{provider,model,maxTokens,temperature}`, `prompt[]`, saídas por `input.content@content.value.name`, `$handoff`) | interna do bloco | **ausente** | `portal.js:157130`; exemplos embutidos (gpt-4.1, gpt-5.1, gpt-5-mini) | `editor.ts:396-399` conta `localCustomActions` como "sem efeito" |
| 26 | `LeavingFromAgent` | interna do bloco Agente de IA | interna | **ausente** | `portal.js:157130` | — |
| 27 | `KnowledgeBaseConsult` | Base de conhecimento (ferramenta do agente) | menu Consultar, só agente com grounding | **ausente** | `portal.js:6891`, `portal.js:254330` | — |
| 28 | `IntegrateMCP` (pseudo-ação, abre modal) | Conectar MCP | menu Integrar, só agente | **ausente** (servidor MCP da Blip: `model-context-server.blip.ai`) | `portal.js:249470`, `portal.js:156185` | — |
| 29 | `SetBucket` | nenhum (só SDK) | não existe no bundle | **parcial**: grava em `gravar_memoria`, mas `{{bucket.x}}` não tem provedor (`bucketGet` existe em `flow.ts:533` e ninguém chama) | 0 ocorrências em `portal.js` | `actions.ts:123`; `context.ts:30-38` |
| — | "Executar pipeline", "Conectar OpenAPI" | só tradução | nenhum tipo no bundle | fora do snapshot (D-02) | `tr.js:84` | — |

**Contagem da tabela 1 (29 tipos com comportamento):** 10 suportados · 12 parciais · 7 ausentes.

---

## 2. Recursos de bloco, entrada, variáveis e condições

### 2.1 Bloco e entrada do usuário

| Recurso | Blip | Status no Pipe | Evidência |
|---|---|---|---|
| Ações de entrada / saída / pós-troca de estado, por bloco e globais | `$enteringCustomActions`, `$leavingCustomActions`, `globalActions` | **suportado** | `manager.ts:2` (ordem de execução), `manager.ts:295-333` |
| Condição por ação | `conditions[]` na ação | **suportado** | `condition.ts`; `editor.ts:365` |
| `continueOnError`, `timeout` por ação | envelope comum `[SDK]` | **suportado** | `manager.ts:419-420`, `manager.ts:467` |
| Limite de transições por entrada | 10 `[SDK]` | **suportado** | `manager.ts:39`, `manager.ts:338` |
| Entrada que aguarda (`bypass:false`) ou passa direto | `input.bypass` | **suportado** | `manager.ts:225`, `manager.ts:352` |
| Validação de entrada `text` / `number` / `date` / `regex` / `type` + mensagem de erro | enum `portal.js:1223` | **suportado** | `manager.ts:516-591` |
| Salvar entrada em variável (`input.variable`) | | **suportado** | `manager.ts:2` |
| **Expiração da entrada** (inatividade, ex. `"8:0"` no export) | `input.expiration` | **ausente**: o editor só conta como não suportado | `editor.ts:402`; `export` (1×) |
| Saídas condicionais, saída padrão, destino `{{variavel}}` | `$conditionOutputs`, `$defaultOutput` | **suportado** | `modelos.ts` (`contextEhVariable`), `manager.ts` |
| Bloco de Atendimento humano (`desk:<uuid>`) com saídas por status do ticket (`input.type = application/vnd.iris.ticket+json`, `input.content@status` ∈ `ClosedAttendant`/`ClosedClient`/`ClosedClientInactivity`) | `portal.js:249519-249536`; `export` | **suportado** (mapa de encerramento em `flow.ts:266-271`) | `flow.ts:731` |
| Saídas de atendimento `NoAgentAvailable`, `OutOfAttendanceHour` | `portal.js:249536` | **parcial**: a UI existe, o motor não gera | `ui/panel-outputs.tsx:126-127` |
| Bloco de pesquisa de satisfação | BAH 3.0 | **suportado** (timeout C-31 ausente) | `satisfaction-survey.ts`; `GATE-FINAL.md` |
| **Subfluxo** (`subflow:<id>`, fluxo `type: subflow`, `currentFlowSession@{flowId}`, blocos `end`) | "+ Criar novo subfluxo" | **ausente**: lança `BuildFlowError` | `manager.ts:310-314`; `editor.ts:387-388` |
| Bloco **Agente de IA** (`$localCustomActions` como ferramentas, handoffs, grounding) | `portal.js:156016-156640` | **ausente** | `editor.ts:396-399` |
| Bloco **AI Answers** (`ProcessAnswers`) | `portal.js:250744` | **ausente** | — |
| Configurações do fluxo: `builder:minimumIntentScore`, `builder:stateTrack`, `builder:useTunnelOwnerContext`, `builder:stateExpiration`, `builder:actionExecutionTimeout`, `builder:#localTimeZone`/`dateTimeOffset` | `portal.js` (`"builder:*"`), template `portal.js:822` | **ausente** (todas marcadas `disponivel:false` na UI), exceto variáveis de configuração `config.*` | `ui/configuration-sections.ts:42-110` |

### 2.2 Fontes de variável

O Pipe declara as 16 fontes do SDK (`context.ts:9-26`) e dá provedor a 7 delas (`context.ts:30-38`).
A lista de 118 variáveis de sistema da Blip já está em `ui/system-variables.ts:25-143`, com `suportada`.

| Fonte | Variáveis (Blip) | Status no Pipe | Nota / evidência |
|---|---|---|---|
| `context` | `{{nome}}`, `{{nome@prop}}` | **suportado** | `context.ts:421` |
| `input` | `content`, `message`, `type`, `length`, `message.id/from/to/fromidentity/toidentity`, `intent.*`, `entity.*` | **suportado** (`intent`/`entity` só se vierem preparados; não há NLP) | `context.ts:346-377` |
| `input` (resto) | `input.message.pp`, `ppidentity`, `input.contentAssistant.id/name/result`, `input.analysis` | **ausente** | `ui/system-variables.ts:112-114,121-122` |
| `state` | `id`, `name`, `previous.id`, `previous.name`, `current.*` | **suportado** | `context.ts:380-397` |
| `contact` | `identity`, `name`, `extras.*`, `serialized`, `phoneNumber`, `email`, … (26 nomes) | **suportado** (depende do mapeamento do contato do Pipe) | `context.ts:400-408` |
| `config` | `config.<chave>` | **suportado** | `context.ts:414` |
| `resource` | `resource.<chave>`, `@prop` | **suportado** | `context.ts:417` |
| `ticket` | `ticket.id`, `status`, `sequentialId`, `team`, `agentIdentity`, `queueTime`, `firstResponseTime`… | **parcial**: `forwardForAttendance` só devolve `{id, status}` | `flow.ts:421`; `portal.js` (`{{ticket.sequentialId}}`, `{{ticket.team}}`…) |
| `calendar` | `date`, `datetime`, `day`, `dayOfWeek`, `hour`, `minute`, `second`, `month`, `year`, `time`, `unixTime`, `unixTimeMilliseconds`, com as variantes `tomorrow.*` e `yesterday.*` (36 nomes, GMT-0) | **ausente** | `ui/system-variables.ts:51-86` |
| `random` | `guid`, `integer`, `string` | **ausente** (o export usa `random.guid`) | `ui/system-variables.ts:128-130` |
| `application` | `identity`, `identifier`, `domain`, `instance`, `node` (+ `shortName`, `url`, `imageUri` no portal) | **ausente** (o export usa 12×) | `ui/system-variables.ts:45-49` |
| `tunnel` | `identity`, `owner`, `originator`, `destination` | **ausente** (o export usa `tunnel.identity` 4×) | `ui/system-variables.ts:139-142` |
| `bucket` | `bucket.<id>` | **ausente** (dado existe em `gravar_memoria`) | `flow.ts:533` sem uso |
| `secret` | `secret.<nome>` (só em ações HTTP) | **ausente** | `ui/system-variables.ts:132`; `ui/configuration-sections.ts:105-110` |
| `aiagent` | `agentResponse`, `errorCode`, `message`, `name`, `parameters`, `redirect`, `skill_id`, `skillName`, `task_id`, `taskName`, `toolCall_id`, `userMessage`, `userMessage_id` | **ausente** (depende do bloco Agente) | `ui/system-variables.ts:30-42` |
| `aianswers` | `response`, `statusCode` | **ausente** (depende do AI Answers) | `ui/system-variables.ts:43-44` |
| `blipfunction` | (fonte declarada no SDK) | **ausente**, sem uso visto no bundle | `context.ts:24` |
| `agent.*` | `email`, `firstName`, `fullName`, `identity`, `phoneNumber` | **não se aplica ao bot** (só em respostas prontas do Desk) | `ui/system-variables.ts:25-29` |
| `user.*` | `email`, `fullName`, `photoUri` | **não se aplica ao bot** (usuário do portal) | `portal.js` (`{{user.*}}`) |

### 2.3 Condições

| Recurso | Blip | Status no Pipe | Evidência |
|---|---|---|---|
| Fontes `input`, `context`, `intent`, `entity` | `portal.js:100939` | **suportado** (`intent`/`entity` sem NLP ficam nulos) | `condition.ts:31`, `condition.ts:226-240` |
| 13 comparações: `equals`, `notEquals`, `contains`, `startsWith`, `endsWith`, `greaterThan`, `lessThan`, `greaterThanOrEquals`, `lessThanOrEquals`, `matches`, `approximateTo`, `exists`, `notExists` | `portal.js:100942` | **suportado** | `condition.ts:9-22`, `condition.ts:154-210` |
| Operadores `or` / `and` | `portal.js:100945` | **suportado** | `condition.ts:26` |
| Uso no export | equals 90, exists 52, notEquals 9, notExists 5, contains 3; fontes context 125 e input 34 | coberto | `export` |

### 2.4 Datas, horas e funções de script

| Recurso | Blip | Status no Pipe |
|---|---|---|
| `{{calendar.*}}` (GMT-0) | variáveis de sistema | ver §2.2 (não contado de novo) |
| Fuso do bot (`builder:#localTimeZone`, `dateTimeOffset: "-3"` nos templates) | `portal.js:822` | **ausente** |
| `LocalTimeZoneEnabled` em scripts | campo das ações de script | **parcial**: aceito e ignorado (`actions.ts:439`; `sandbox.ts`) |
| `time.parseDate`, `time.dateToString`, `time.sleep` no V2 `[SDK]` | V8/ClearScript | **ausente** |
| `context.getVariableAsync` / `setVariableAsync` / `deleteVariableAsync` no V2 `[SDK]` | usado pelos templates da Blip (`portal.js:250450`) | **ausente** |
| `request.fetchAsync` no V2 | | **suportado** (`sandbox.ts:58-141`, com SSRF gate e mTLS) |
| `{{...}}` substituído dentro do `source` do script | Blip faz | **suportado** (D-55) |

**Contagem da tabela 2 (42 itens com status, sem os dois "não se aplica" e sem a linha informativa de uso no export):** 21 suportados · 3 parciais · 18 ausentes.

---

## 3. Comandos LIME que um bot envia (`ProcessCommand` / `SendCommand`)

O Pipe ignora o `to` e aceita só dois formatos de URI: `/tickets/{id}[/change-tags|/transfer|/status|/priority]`,
com recurso no vocabulário do Pipe (`queueId`, `status: 'encerrada'`, `priority: 'alta'`), e
`set /contexts/{contato}/stateid@{flowId}` (`actions.ts:30-36`, `actions.ts:64`; `flow.ts:182-257`). Mesmo nas
URIs aceitas, **o corpo e a resposta não seguem o formato da Blip**: `/transfer` espera `queueId`, não
`team`; `/status` espera o status do Pipe, não `Open`/`ClosedAttendant`; `GET /tickets/{id}` devolve a
linha da conversa, não um `application/vnd.iris.ticket+json`.

Origem: **E** = usado no fluxo exportado · **T** = usado em template/fluxo embutido do bundle · **D** = documentado (`schemas.md` §2) e citado pela ajuda do painel "Processar comando".

### 3.1 `postmaster@desk.msging.net` (Desk)

| Método + URI | O que faz | Origem | Status no Pipe |
|---|---|---|---|
| `get /tickets?$filter=customerIdentity eq '{id}'` (e `status eq …`, `$closed=true`) | busca tickets do cliente | E (3×), T (4×) | **ausente** (URI sem `/{id}` não casa) |
| `get /ticket/{id}` (singular) | lê um ticket | T | **ausente** |
| `get /tickets/{id}` | lê um ticket | D | **parcial**: devolve a conversa do Pipe |
| `set /tickets` · `set /tickets/{customerIdentity}` (`text/plain`) | abre ticket (transbordo programático) | T, D | **ausente** como comando (o efeito existe em `CreateTicket`/`ForwardToDesk`) |
| `set /tickets/change-status` `{id, status: Open\|ClosedAttendant\|ClosedClient, agentIdentity}` | muda status / atribui / encerra | E, D | **ausente** (o Pipe tem `/tickets/{id}/status` com outro vocabulário) |
| `set /tickets/change-status-without-redirect` | encerra sem devolver ao bot | T | **ausente** |
| `set /tickets/{id}/close` `{closedBy, tags}` | finaliza ticket fechado pelo cliente | E, D | **ausente** |
| `set /tickets/{id}/transfer` `{team[, agentIdentity]}` | transfere para fila/atendente | D | **parcial**: aceita só `queueId` UUID do Pipe |
| `set /tickets/{id}/change-tags` `{tags}` | etiquetas do ticket | D | **suportado** |
| `get /tickets/{id}/messages` | histórico do cliente | D | **ausente** |
| `get /teams` | lista filas | E | **ausente** |
| `get /teams/agents-online` | filas com atendentes online (base do `NoAgentAvailable`) | E (2×) | **ausente** |
| `get /attendants` | lista atendentes e status | T | **ausente** |
| `set /attendance-survey-answer` | grava resposta de pesquisa de satisfação | T (2×) | **ausente** como comando (o bloco nativo grava em `pesquisa_satisfacao_resposta`) |
| `get /attendance-queues`, `/rules`, `/priority-rules`, `/replies`, `/tags/active`, `/monitoring/*` | configuração e monitoria do Desk | D | **ausente**; bot quase não usa (baixo valor) |

### 3.2 `postmaster@builder.msging.net` (Builder)

| Método + URI | O que faz | Origem | Status no Pipe |
|---|---|---|---|
| `set /contexts/{identity}/stateid@{flowId}` | põe o contato num bloco de outro fluxo | E (13×), D | **suportado** (D-55; `actions.ts:85-95`, `flow.ts:571-588`). Com id de fluxo da Blip, o Pipe ignora em silêncio |
| `get /flow-id` · `get /flow-id?shortname={serviço}` | id do fluxo atual ou de um serviço do roteador | E (10×) | **ausente**. Bloqueia os 10 `set stateid@{{flowIdX@resource}}` do export |
| `get/set/delete /contexts/{identity}/{variavel}` | lê/escreve variável de contexto de um contato | D | **ausente** |
| `get /contexts/{identity}[?withContextValues=true]` | lista variáveis do contato | D | **ausente** |
| `set/delete /contexts/{identity}/currentFlowSession@{flowId}` | entra/sai de subfluxo | D | **ausente** (depende de subfluxo) |
| `/buckets/blip_portal:builder_working_flow`, `/subflows/{shortname}/…` | armazenamento do editor | D | **sem sentido no bot** (o bridge de laboratório já emula: `apps/bridge/src/rotas.ts:90-92`) |

### 3.3 `postmaster@msging.net` (núcleo) e `postmaster@crm.msging.net` (contatos)

| Método + URI | O que faz | Origem | Status no Pipe |
|---|---|---|---|
| `get /configuration/caller` | lê a configuração da aplicação chamadora (usada para descobrir dados do roteador) `[INFER: conteúdo exato a confirmar]` | E (3×) | **ausente** |
| `merge /contacts` (`application/vnd.lime.contact+json`) | atualiza contato (ex.: identidade do túnel) | T | **ausente** como comando (o efeito existe em `MergeContact`) |
| `get/set/delete /contacts/{identity}` | lê/grava contato | D | **ausente** |
| `get/set/delete /buckets/{id}[?expiration=ms]`, `get /buckets` | chave-valor do bot | T (`/buckets/checkout-secret`, `portal.js:250461`), D | **ausente** como comando (tabela `gravar_memoria` pronta) |
| `get /resources/{id}` | lê recurso do bot | D | **ausente** como comando (`{{resource.x}}` funciona) |
| `get/set /contexts/{identity}/Master-State` | escolhe o serviço do roteador | D | **ausente** (o roteador do Pipe tem `redirectInRouter`, `flow.ts:638`) |
| `get /profile`, `/delegations`, `/account/keys` | conta do bot | D | **sem sentido no bot** |

### 3.4 Demais extensões

| `to` | Método + URI | O que faz | Origem | Status no Pipe |
|---|---|---|---|---|
| `postmaster@analytics.msging.net` | `set /event-track` · `get /event-track/{categoria}` | grava/lê eventos | D | **ausente** como comando (grava via `TrackEvent`) |
| `postmaster@broadcast.msging.net` | `set /lists`, `set/delete /lists/{lista}@broadcast.msging.net/recipients[/{id}]`, envio para `{lista}@broadcast.msging.net` | listas de distribuição e disparo 1→N | D | **ausente** como comando (tabelas prontas, `flow.ts:543`) |
| `postmaster@scheduler.msging.net` | `set /schedules` · `get/delete /schedules/{id}` | agenda mensagem futura | D | **ausente** |
| `postmaster@tunnel.msging.net` | `get /tunnels/{id}` | resolve túnel → identidade real | D | **ausente** |
| `postmaster@ai.msging.net` | `set /analysis`, `/intentions`, `/entities`, `/content/analysis`, `/models` | NLP e assistente de conteúdo | D, `portal.js` (`/content/analysis`) | **ausente** |
| `postmaster@wa.gw.msging.net` | `get /wabas/details` · `/message-templates` · `/profile` | dados da WABA e templates | T (Smart Sales, `portal.js:249587`), D | **ausente** (o Pipe tem WhatsApp próprio) |
| `postmaster@activecampaign.msging.net` | `set /campaign/full[/v2]`, `/dispatch/v2`… | disparo de template WhatsApp | D | **ausente** como comando (`message-active.ts` existe) |
| `postmaster@threads.msging.net` | `get /threads/{identity}`, `/messages`, `/notifications` | histórico | D | **ausente** |
| `postmaster@media.msging.net` | `/refresh-media-uri`, `/upload-media-uri` | mídia | D | **ausente** (baixo valor) |
| `postmaster@clicktracker.msging.net` | `set /entrypoint/encode` | encurtar/rastrear link | D | **ausente** como comando (`rastreador-de-cliques.ts` existe) |
| `postmaster@stripe.msging.net`, `postmaster@copilot.msging.net`, `lime://{canal}/accounts/{id}` | pagamentos, relatórios do copiloto, perfil no canal | D | **ausente**; fora de escopo |

**Contagem da tabela 3 (39 linhas):** 2 suportados · 2 parciais · 32 ausentes · 3 sem sentido/fora de escopo.

---

## 4. Serviços HTTP hospedados pela Blip (fora do Pipe)

Estes endereços aparecem em `ProcessHttp` de fluxos reais ou dos templates da Blip. Não são comandos LIME,
são **serviços web da Blip ou do time de CS**. O Pipe consegue chamá-los por `ProcessHttp`
(`flow.ts:470`, com `confirmarUrlSegura`), mas não consegue reproduzi-los.

| Endereço | Onde | O que faz | Situação no Pipe |
|---|---|---|---|
| `https://sendnotificationblipemployee.cs.blip.ai/api/SendNotification` | `export` (bloco "[HTTP] Agendar Notificação Ativa") | agenda notificação ativa (template WhatsApp) para o contato | **fora do Pipe**. Continua funcionando só enquanto a conta Blip existir. O equivalente nativo é `message-active.ts` + agendamento (plano P7 abaixo) |
| `{{resource.urlFuzzyMatch}}/v2/fuzzy-match/map` | `export` (2×, escolha de fila e de interesse) | casamento aproximado da entrada do usuário com um mapa | **fora do Pipe** (URL vem de recurso). Alternativa nativa: função de biblioteca ou `approximateTo` |
| `https://http.msging.net/commands` | template embutido (`portal.js:255038`) | gateway HTTP de comandos LIME, com a chave do bot (`resource.packs.authorizationkey.router` no export) | **sem sentido no Pipe**: no Pipe, o comando deveria ir para o próprio motor (§3), não para a Blip |
| `https://model-context-server.blip.ai` | `portal.js:156185` (`mcpUrl`) | servidor MCP das ferramentas do Agente de IA | **fora do Pipe** (entra só se o plano de MCP for aprovado) |
| `https://take-plugin-marketplace.cs.blip.ai` | `portal.js` | marketplace de plugins | **fora do Pipe** |
| `${kh}/Bot/catalog` (Smart Sales) | `portal.js:249568` | catálogo de produtos da Blip | **fora do Pipe** |
| `parsemetadata.azurewebsites.net` | `portal.js` | parser de metadados de link | **fora do Pipe** |

---

## 5. Tamanho das lacunas e planos propostos

Tamanhos: **P** ≈ meio dia, 1–2 arquivos · **M** ≈ uma execução de executor, 3–8 arquivos, com testes · **G** = precisa de mais de uma execução ou de decisão de produto antes.

### 5.1 Lacunas por tamanho

| Lacuna | Tamanho | Observação |
|---|---|---|
| Provedores `calendar`, `random`, `application`, `tunnel`, `bucket` | M | puros, exceto `bucket` (lê `gravar_memoria`) e `tunnel`/`application` (mapear roteador/tenant) |
| Provedor `secret` + UI "Variáveis sensíveis" | M | exige guardar segredo cifrado e não vazar em trace/log |
| `ticket.*` completo | P | enriquecer o retorno de `forwardForAttendance` |
| `ForwardMessageToDesk` e `SurveyMessage` no provedor | P | apelido de ações que já têm efeito |
| `SendRawMessage` para qualquer MIME | P | liberar no `editor.ts:374` e testar a serialização no canal |
| `SetVariable.expiration` persistida | P | timestamp por chave no contexto (`context.ts:251`) |
| `builder:stateExpiration`, `builder:actionExecutionTimeout`, fuso do bot | P | ler as chaves da configuração no motor |
| `ForwardToDesk` → `NoAgentAvailable` / `OutOfAttendanceHour` e fila por `extras.teams` | M | o horário por fila já existe (`horarioId`) |
| Expiração da entrada (inatividade) | M | job atrasado (BullMQ) que injeta a entrada de expiração `[SDK: InputExpiration]` |
| Comandos Desk no formato Blip (§3.1) | G → dividido em 2 M | leitura (tickets/teams/attendants) e escrita (change-status/close/transfer/create) |
| Comandos Builder/núcleo (§3.2, §3.3): `flow-id`, `/contexts/*`, `Master-State`, `configuration/caller`, `/buckets`, `/contacts`, `/resources` | M | reaproveitam tabelas existentes |
| Comandos analytics/broadcast/tunnel/clicktracker | P–M | reaproveitam `registerEvent`, listas, rastreador |
| Scheduler (`/schedules`) e disparo broadcast | M | fila atrasada + envio fora da janela de conversa |
| API do script V2 (`context.*Async`, `time.*`, fuso) | M | dentro de `sandbox.ts` |
| `ExecuteTemplate` com Handlebars | P–M | `handlebars` não está no lockfile: exige o checkpoint de pacote novo |
| Biblioteca de funções no nível do tenant | M | decisão de produto: hoje é por fluxo |
| Subfluxos | G | motor (pilha de sessões, `currentFlowSession`, blocos `end`) + Builder (criar/editar subfluxo) |
| Agente de IA (`ForwardToAgent`, `LeavingFromAgent`, ferramentas locais, handoffs, `aiagent.*`) | G | `packages/ai` já tem cliente Anthropic; a Blip usa modelos OpenAI, então a troca de provedor é decisão do dono |
| `KnowledgeBaseConsult` (RAG) e `ProcessContentAssistant` real | M | trocar o `ilike` por busca semântica na base existente |
| `IntegrateMCP` | M | cliente MCP chamando servidor externo configurado |
| NLP (`intent`/`entity`, `minimumIntentScore`) e AI Answers (`ProcessAnswers`, `aianswers.*`) | G | classificador sobre `packages/ai`; decisão de produto |

### 5.2 O que não vale fazer (impossível ou sem sentido no Pipe)

- **Chamar a Blip de dentro do Pipe** (`http.msging.net/commands`, `postmaster@…` reais, `sendnotificationblipemployee`, fuzzy-match da CS, `model-context-server.blip.ai`): depende da conta Blip. O caminho é mapear cada comando para o equivalente do Pipe (§3) e deixar os serviços HTTP como `ProcessHttp` comum, que funciona enquanto o serviço existir.
- **Reproduzir os limites do Jint** (1000 statements, recursão 50) no `ExecuteScript` V1: seria reproduzir limitação, não recurso (mesmo critério do D-10).
- **`builder:stateTrack`** (tracking automático): o Pipe já registra cada bloco em `execucao_passo`. Tratar como no-op.
- **`builder:useTunnelOwnerContext` / `Master-State`**: o roteador do Pipe compartilha contexto nativamente (`sharesContext`, `flow.ts:58`). Aceitar e mapear, sem criar um segundo mecanismo.
- **Armazenamento do editor** (`/buckets/blip_portal:*`, `/subflows/{shortname}/publish`), `/profile`, `/delegations`, `/account/keys`: são do portal, não do bot.
- **`postmaster@copilot`, `postmaster@stripe`, perfil de canal `lime://…/accounts`**: fora do produto do Pipe.
- **`agent.*` e `user.*`**: só existem em respostas prontas do Desk e no portal, nunca no motor do bot.
- **"Executar pipeline" e "Conectar OpenAPI"**: não estão ligados a tipo nenhum no snapshot congelado (D-02). Ficam para o delta futuro.

### 5.3 Planos executáveis (um executor por plano)

| Plano | Conteúdo | Tamanho | Depende de |
|---|---|---|---|
| **P1 — Provedores de variável puros** | `calendar.*` (36 nomes, GMT-0, com `yesterday`/`tomorrow`), `random.guid/integer/string`, `application.*` (identidade do bot no Pipe), `tunnel.*` (roteador → serviço), `bucket.*` (usa `bucketGet`). Atualiza `FONTES_SUPORTADAS` e `suportada` em `ui/system-variables.ts`. Teste: o export resolve as 4 fontes. | M | — |
| **P2 — Pequenos contratos do motor** | `ForwardMessageToDesk` e `SurveyMessage` no provedor; `SendRawMessage` com qualquer MIME; `SetVariable.expiration`; `builder:stateExpiration` e `builder:actionExecutionTimeout`; `ticket.*` completo; `LocalTimeZoneEnabled` + fuso do bot. | M | — |
| **P3 — Comandos Desk: leitura** | Roteamento por `to`. `get /tickets?$filter=…`, `get /ticket/{id}`, `get /tickets/{id}` (resposta `vnd.iris.ticket+json`), `get /teams`, `get /teams/agents-online`, `get /attendants`. | M | — |
| **P4 — Comandos Desk: escrita** | `set /tickets` e `/tickets/{identity}`, `set /tickets/change-status[-without-redirect]` com status da Blip, `set /tickets/{id}/close`, `/transfer` por `team` (nome da fila), `/attendance-survey-answer`. Reusa `transbordar`, `closeInTransaction` e `pesquisa_satisfacao_resposta`. | M | P3 (roteamento por `to`) |
| **P5 — Comandos Builder e núcleo** | `get /flow-id[?shortname]` (serviço do roteador → fluxo), `/contexts/{identity}/{var}` (get/set/delete e listagem), `Master-State`, `get /configuration/caller`, `/buckets/{id}`, `/contacts[/{identity}]` (get/set/merge), `/resources/{id}`. Teste: os 10 pares `flow-id` → `set stateid@` do export. | M | P3 (roteamento por `to`) |
| **P6 — Atendimento humano completo** | `ForwardToDesk` produz `NoAgentAvailable` (atendentes online na fila) e `OutOfAttendanceHour` (`fila.horarioId`); fila escolhida por `contact.extras.teams`/regras de fila. | M | P3 (consulta de agentes online reaproveitável) |
| **P7 — Agendamento e broadcast** | `postmaster@scheduler` `/schedules`; envio para lista `{lista}@broadcast`; `/lists/*`; `set /event-track`; `get /tunnels/{id}`; `/entrypoint/encode` sobre o rastreador de cliques. Base para substituir `sendnotificationblipemployee`. | M | P5 (roteador de comandos) |
| **P8 — Expiração da entrada** | `input.expiration`: job atrasado que reentra no bloco com a entrada de expiração do SDK. Some o aviso de `editor.ts:402`. | M | P7 (mesma infraestrutura de job atrasado) |
| **P9 — Script V2 e template** | `context.getVariableAsync/setVariableAsync/deleteVariableAsync`, `time.parseDate/dateToString/sleep`, fuso do bot no isolate; `ExecuteTemplate` com Handlebars (checkpoint de pacote novo). | M | P2 (fuso) |
| **P10 — Biblioteca de funções do tenant** | Funções compartilhadas entre fluxos do tenant, referência por UUID como na Blip, aviso "em uso em outros bots". | M | decisão do dono |
| **P11 — Secrets** | fonte `secret.*` restrita a ações HTTP, armazenamento cifrado, painel "Variáveis sensíveis", máscara em `execucao_passo`. | M | — |
| **P12 — Subfluxos (motor)** | `type: subflow`, estados `subflow:`, `currentFlowSession@`, retorno por blocos `end`, `set/delete currentFlowSession` como comando. | G | P5 |
| **P13 — Subfluxos (Builder)** | criar/editar/publicar subfluxo, "+ Criar novo subfluxo". | G | P12 |
| **P14 — Agente de IA (motor)** | `ForwardToAgent`/`LeavingFromAgent`, prompt/modelo, saídas por handoff (`input.content@content.value.name`), ferramentas = `$localCustomActions`, `aiagent.*`. | G | decisão do dono (provedor/modelo) |
| **P15 — Conhecimento e MCP** | `KnowledgeBaseConsult` e `ProcessContentAssistant` com busca semântica; `IntegrateMCP`. | M | P14 |
| **P16 — NLP e AI Answers** | `input.intent/entity` preenchidos, `builder:minimumIntentScore`, `ProcessAnswers`, `aianswers.*`, `input.contentAssistant.*`. | G | P14 |

**Ordem sugerida.** P1, P2 e P3 podem rodar em paralelo e já fazem o fluxo exportado passar por
variáveis e leituras de ticket. Depois P4, P5 e P6. Depois P7 e P8. P9 e P11 entram em qualquer ponto.
P10, P12–P16 dependem de decisão do dono e ficam para depois.

---

## 6. Resumo das contagens

| Tabela | Suportado | Parcial | Ausente | Sem sentido / não se aplica |
|---|---|---|---|---|
| 1 — Tipos de ação (29) | 10 | 12 | 7 | 2 fora do snapshot (pipeline, OpenAPI) |
| 2 — Bloco, variáveis, condições, datas (42) | 21 | 3 | 18 | 2 (`agent.*`, `user.*`) |
| 3 — Comandos LIME (39 linhas) | 2 | 2 | 32 | 3 |
| 4 — Serviços HTTP da Blip (7) | — | — | — | 7 fora do Pipe (chamáveis via `ProcessHttp`) |
| **Total com status (107)** | **33** | **17** | **57** | |

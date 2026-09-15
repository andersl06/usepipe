# Blip — Portal de Gestão (supernova.blip.ai): regras de negócio TÉCNICAS

> Complemento técnico de `blip-gestao-funcoes.md` e `blip-gestao-medidas.md` (que descrevem as telas
> pela ótica do usuário). Aqui estão **nomes de campo, enums, validações e os comandos LIME que a
> Gestão dispara para gravar**.
>
> **Fonte:** engenharia reversa dos bundles JS das páginas salvas em
> `C:\Users\anderson.linhares\Downloads\blip\*.zip` (21 capturas, uma por tela do módulo Atendimento).
> Os zips **não são aninhados** — cada um é uma captura independente de uma rota diferente.
> Descompactados em `C:\Users\anderson.linhares\desk-clone\capturas\portal-gestao\`.

---

## 0. Anatomia do front-end (o que dá para ler e o que não dá)

O portal tem **dois** front-ends que convivem:

| Bundle | Caminho no zip | Cópia local | Tecnologia | Estado |
|---|---|---|---|---|
| Portal legado | `supernova.blip.ai/portal.js` | `.../portal-gestao/bundle/portal.js` | AngularJS 1.x (`$ctrl`, `ng-if`, `$inject`) | 20,3 MB / 312.923 linhas, **minificado mas embelezado** |
| Desk MFE (novo) | `portalmfe.blip.ai/beagle/portal-fragment-desk-mfe/latest/main.js` | `.../portal-gestao/mfe/main.js` | React + `@remix-run/router` | 10,8 MB / 183.137 linhas, **minificado mas embelezado** |

**Ambos estão minificados** (nomes de variável e função reduzidos a uma/duas letras). **Não** ficaram
legíveis como o bundle do Desk. Porém:

- **Nomes de propriedade de objeto, literais de string, URIs, MIME types e enums sobreviveram intactos.**
- O webpack manteve os `n.d(t, { NOME_EXPORTADO: () => x })`, o que dá o **nome real de cada constante**.
- Os templates AngularJS estão inline como strings HTML (com `data-test`, `ng-if`, chaves de i18n).
- O MFE carrega **todo o i18n (pt/en/es) embutido**, o que revela regra de negócio por texto.

Ou seja: enums, nomes de campo, comandos e validações estão **todos recuperáveis**. O que se perde é
o nome das variáveis locais e a lógica de negócio *do servidor*.

Cada zip capturou uma rota diferente (todos carregam o **mesmo** `main.js` do MFE — não há chunk
lazy separado por tela):

| zip | rota capturada |
|---|---|
| (sem número) | `application.html` |
| (1) | `home` |
| (2) | `templates/builder` |
| (3) | `attendance/desk/monitoring` |
| (4) | `attendance/desk/history` |
| (5) | `attendance/desk/survey-dashboard` |
| (6) | (sem HTML — só assets) |
| (7) | `attendance/desk/report` |
| (8) | `attendance/desk/message-template` |
| (9) | `attendance/desk/calls-dashboard` |
| (10) | `attendance/desk/sales-dashboard` |
| (10 — sem parêntese de fechamento) | `attendance/desk/replies` |
| (11) | `attendance/desk/sla-policy` |
| (12) | `attendance/desk/rules` |
| (13) | `attendance/desk/team` |
| (14) e (19) | `attendance/desk/attendance-hours` |
| (15) | `attendance/desk/queue-management` |
| (16) | `attendance/desk/channels` |
| (17) | `attendance/desk/personalizedbreaks` |
| (18) | `attendance/desk/general-settings` |

---

## 1. OS COMANDOS QUE A GESTÃO ESCREVE

### 1.1 Configuração do bot (as OwnerProps)

O Desk **lê** com `get lime://{bot}/configuration/caller?owner=postmaster@desk.msging.net`.
A Gestão **escreve** com `set` sobre `lime://postmaster@desk.msging.net/configuration`.

**Portal legado** — `bundle/portal.js:17556` (classe `ConfigurationsService`, módulo webpack `11756`):

```js
generateUri(node, caller, name) {
  let uri = `lime://${node}/configuration`;
  const qs = new URLSearchParams;
  if (caller) qs.append("caller", caller);
  if (name)   qs.append("name",   name);
  if (qs.toString()) uri += `?${qs}`;
  return uri;
}
set(node, resource, caller, useConfigDomain = false) {
  const cmd = {
    method:  "set",
    uri:     this.generateUri(node, caller),
    type:    "application/json",
    resource: resource                      // { NomeDaProp: valor }
  };
  if (useConfigDomain) cmd.to = `postmaster@configurations.${MESSAGINGHUBDOMAIN}`;
  return this.MessagingHubService.sendCommand(cmd);
}
```

Métodos da mesma classe: `get`, `getSingle(node, caller, name)`, `getGateways`,
`delete(node, caller)`, `deleteSingle(node, name, caller)`.

**Comando concreto** (o que sai do portal para gravar `AgentSlots = 5`):

```json
{
  "id":   "<uuid>",
  "to":   "postmaster@msging.net",
  "from": "{bot}@msging.net",
  "method": "set",
  "uri":  "lime://postmaster@desk.msging.net/configuration?caller={bot}@msging.net",
  "type": "application/json",
  "resource": { "AgentSlots": 5 }
}
```

O `?caller=` **não é escrito pelo serviço** — é injetado automaticamente pelo
`MessagingHubService.addParametersCommandRequest` quando a delegação está ligada
(`bundle/portal.js:114426`):

```js
const caller = `${this.instanceName}@${this.MESSAGINGHUBDOMAIN}`;
const uri = (e.method !== "set" && e.method !== "delete") || !e.uri.endsWith("/configuration")
          ? e.uri
          : `${e.uri}?caller=${caller}`;
```

Só vale quando a feature `messaging-hub-command-with-delegation` está ativa; caso contrário o `uri`
vai sem `caller`. Se `useConfigurationsDomain*` estiver ligado (flags
`use-configurations-domain-on-desk-mfe-operations-get` / `...-set`), o comando é redirecionado para
`to: postmaster@configurations.msging.net`.

**Um `set` por propriedade** no portal legado — `bundle/portal.js:239225`:

```js
async saveDeskConfiguration(key, value, showToast = true) {
  if (key && value !== null)
    await this.ConfigurationsService.set("postmaster@desk.msging.net", { [key]: value });
}
```

**MFE (React)** — `mfe/main.js:69148` (`ConfigurationsService`) e `mfe/main.js:22999`
(`GeneralSettingsProvider`). Aqui a gravação é **em lote**, várias chaves num único `set`:

```js
async setWithCaller(caller, resource) {
  return client.sendCommand({
    method: "set",
    uri: `lime://postmaster@desk.msging.net/configuration?caller=${caller}`,
    type: "application/json",
    resource
  });
}
// GeneralSettingsProvider:
const resource = flags.filter(f => f.key && f.value !== null)
                      .reduce((acc, f) => ({ ...acc, [f.key]: f.value }), {});
await ConfigurationsService.setWithCaller(`${ownerIdentity}@msging.net`, resource);
```

Apagar uma propriedade: `delete lime://postmaster@desk.msging.net/configuration?name={Prop}`
(`mfe/main.js:69166`, `deleteSingle`).

### 1.2 Tipagem dos valores — armadilha real

Os valores voltam do servidor como **string**, inclusive booleanos. Ambos os fronts fazem coerção no
cliente (`mfe/main.js:72455`, helper `qK`; `bundle/portal.js:239219`):

```js
if (typeof cfg[key] === "string") {
  if (cfg[key].toLowerCase() === "true")  cfg[key] = true;
  if (cfg[key].toLowerCase() === "false") cfg[key] = false;
}
```

E, para **limpar** um valor numérico, o portal grava a **string literal `"null"`**, não `null`
(`bundle/portal.js:239075`, `239163`):

```js
await this.saveDeskConfiguration("AgentMaxResponseDelay",
  show && value ? value * unity : "null");
```

A leitura (`getDeskConfiguration`) trata `"null"` (case-insensitive) como ausente.

### 1.3 Catálogo de OwnerProps confirmadas no bundle

Do módulo de constantes do portal legado (`bundle/portal.js:102143`, export `X` do módulo `47979`):

| Constante | Nome da OwnerProp | Observações |
|---|---|---|
| `POSTMASTER` | `postmaster@desk.msging.net` | node alvo |
| `AGENT_SLOTS_ENABLED` | `AgentSlotsEnabled` | bool |
| `AGENT_SLOTS` | `AgentSlots` | int > 0 |
| `REDIRECT_WHEN_NO_AGENTS_ON_QUEUE` | `RedirectWhenNoAgentsOnQueue` | bool |
| `CAN_SEND_EMOJI` | `CanSendEmojis` | bool, default `true` |
| `CAN_SEND_ATTACHMENT` | `CanSendAttachment` | bool, default `true` |
| `BLOCK_EXTERNAL_ATTACHMENT` | `BlockExternalAttachment` | bool, default `false` |
| `CAN_SEND_AUDIO_RECORDING` | `CanSendAudioRecording` | bool |
| `ACTIVE_MESSAGE_ENABLED` | `ActiveMessageEnabled` | bool |
| `ACTIVE_MESSAGE_SETTINGS_PROGRESS` | `ActiveMessageSettingsInProgress` | bool |
| `ACTIVE_MESSAGE_CONFIGURATION_CONTACT_FIELDS` | `ActiveMessageContactFieldsSearch` | |
| `ACTIVE_MESSAGE_CONFIGURATION_SEARCH_SOURCE` | `ActiveMessageSearchSource` | |
| `ACTIVE_MESSAGE_CONFIGURATION_ROUTER_IDENTITY` | `RouterIdentityActiveCampaign` | |
| `AGENT_RESPONSE_DELAY_ENABLED` | `AgentResponseDelayEnabled` | bool |
| `AGENT_MAX_RESPONSE_DELAY` | `AgentMaxResponseDelay` | **segundos** |
| `CUSTOMER_RESPONSE_DELAY_ENABLED` | `CustomerResponseDelayEnabled` | bool |
| `CUSTOMER_MAX_RESPONSE_DELAY` | `CustomerMaxResponseDelay` | **segundos** |
| `CUSTOMER_WARNING_RESPONSE_DELAY` | `CustomerWarningResponseDelay` | **segundos** |
| `IGNORE_CREATE_TICKET_ON_USER_MESSAGE` | `IgnoreCreateTicketOnUserMessage` | bool |
| `AUTOMATIC_CLOSED_TICKET_ALLOWED` | `AutomaticClosedTicketIsAllowed` | bool (liberado pelo contrato) |
| `AUTOMATIC_CLOSED_TICKET_ENABLED` | `AutomaticClosedTicketIsEnabled` | bool |
| `MAX_CLIENT_MINUTES_DOWNTIME` | `MaxClientMinutesDowntime` | **minutos** |
| `EXPECT_INTERACTION_AGENT` | `ExpectInteractionAgent` | bool |
| `USE_INACTIVITY_TAGS` | `UseInactivityTags` | bool |
| `INACTIVITY_TAGS` | `InactivityTags` | JSON stringificado |
| `REMOVE_TICKET_CLOSED_ATTENDANCE` | `SetTicketClosedByClientAsClosed` | bool |
| `USE_MESSAGE_BEFORE_AUTO_CLOSED_TICKET` | `UseInactivityMessage` | bool |
| `MESSAGE_BEFORE_AUTO_CLOSED_TICKET` | `InactivityMessage` | texto |
| `MESSAGE_BEFORE_AUTO_CLOSED_TICKET_DOWNTIME` | `InactivityMessageDowntime` | **minutos** |
| `WAITING_TICKETS_COUNT_HIDDENNESS` | `WaitingTicketsCountHiddenness` | bool |
| `ITEMS_PER_PAGE_DESK_MONITORING` | `ItemsPerPageDeskMonitoring` | int |
| `RESET_CLIENT_INACTIVITY_TIMER_ON_AGENT_INTERACTION` | `ResetClientInactivityTimerOnAgentInteraction` | bool |
| `RESET_CLIENT_INACTIVITY_TIMER_ON_FIRST_AGENT_INTERACTION` | `ResetClientInactivityTimerOnFirstAgentInteraction` | bool |
| `CLOSE_TICKET_ON_LEAVING_FROM_DESK_SETTING` | `CloseTicketOnLeavingFromDeskSetting` | bool |
| `TENANT_BOT_BLIP_COPILOT_ENABLED` | `TenantBotBlipCopilotEnabled` | bool |
| `CARE_COPILOT_ENABLED` | `CareCopilotEnabled` | bool |
| `ATTENDANCE_SATISFACTION_SURVEY_ENABLED` | `AttendanceSatisfactionSurveyEnabled` | bool |

Do módulo de transferência/distribuição (`bundle/portal.js:10380`, export `J` do módulo `10375`):

| Constante | Valor |
|---|---|
| `TRANSFER_DIRECTLY_CONFIG` | `CanTransferDirectly` |
| `TRANSFER_WITHOUT_AGENTS_CONFIG` | `CanTransferWithoutAgents` |
| `DISTRIBUTION_TYPE` | `DistributionType` |
| `CALLS_VOICE_INBOUND_ENABLED` | `CallsVoiceInboundEnabled` |
| `ORLEANS_DISTRIBUTION` | `"Orleans"` |
| `REDIS_DISTRIBUTION` | `"Redis"` |
| `DIRECT_TRANSFER_TEAM` | `"DIRECT_TRANSFER"` |
| `DEFAULT_DIRECT_TRANSFER_REQUESTED_NUMBER_OF_AGENTS` | `200` |

Do módulo de constantes do MFE (`mfe/main.js:10597` — exports ofuscados, valores literais intactos):

`RedirectWhenNoAgentsOnQueue`, `CanTransferWithoutAgents`, `CanTransferDirectly`,
`CanSendAudioRecording`, `CanSendEmojis`, `WaitingTicketsCountHiddenness`, **`HasTags`**,
`AgentSlotsEnabled`, `AgentSlots`, `ActiveMessageEnabled`, `ActiveMessageSettingsInProgress`,
**`ActiveMessageTicketPriorityEnabled`**, **`ActiveMessageCanSendWithOpenTicket`**,
`ActiveMessageSearchSource`, `RouterIdentityActiveCampaign`, **`ActiveMessageLimitEnabled`**,
**`ActiveMessageLimitCount`**, `AgentResponseDelayEnabled`, `AgentMaxResponseDelay`,
**`AgentInactivityAlertCount`**, `CustomerResponseDelayEnabled`, `CustomerMaxResponseDelay`,
`CustomerWarningResponseDelay`, **`DeskSellPaymentEnabled`**, **`TransferTicketEnabled`**,
`CallsVoiceInboundEnabled`, **`CallsVoiceOutboundEnabled`**, **`CallsVideoEnabled`**,
**`CallsCreateTicketEnabled`**, **`CallsFlowStateId`**, **`ManualDistributionEnabled`**,
**`HistoryEnabled`**, **`ActiveMessageCheckOpeningHours`**, **`BlockAwayAgentDeskUsage`**,
**`HasForbiddenWords`**, **`DistributionMode`**, **`AgentNewTicketSlots`**, **`ExportTicketEmail`**,
**`AllowDirectTransferToAnyAgentOnline`**, **`TicketStandbyModeEnabled`**.

E do parser de defaults (`mfe/main.js:72428`) mais estas, com seus valores default:

```js
{
  DefaultProvider: "", AgentSlots: undefined, AgentSlotsEnabled: false,
  SalesDashboardConfiguration: "{}", AttendanceSatisfactionSurveyEnabled: false,
  CareCopilotEnabled: false, CopilotTicketAnalysisEnabled: false,
  TenantBotBlipCopilotEnabled: false, LeadScoreConfiguration: "[]",
  CallsVideoEnabled: false, CallsVoiceOutboundEnabled: false, CallsVoiceInboundEnabled: false,
  Plugins: "", TicketStandbyModeEnabled: false, AutomaticClosedTicketIsAllowed: false,
  "Lime.IsActive": false, "Salesforce.CreateContact": false, "Salesforce.CreateCase": false,
  "Webhook.HasBlipTeams": false
}
```

Canal de atendimento (tela Canais, `mfe/main.js:35894`): `DefaultProvider` ∈
`Lime` (Blip Desk) | `Salesforce` | `SalesforceMessaging` (MIAW) | `Webhook` (canal customizado)
— mapeamento em `mfe/main.js:72481`. Chaves auxiliares: `Lime.IsActive`,
`Salesforce.ApiEndpoint|ButtonId|DeploymentId|OrganizationId|CreateCase|CreateContact|ContactEntityMap`,
`SalesforceMessaging.ApiEndpoint|AppName|DeploymentId|OrganizationId|SseEndpoint|Queues|RoutingAtributtes|InitialMessageTemplate`
(o typo `RoutingAtributtes` é do produto).

### 1.4 O que NÃO é configuration: as tags gerais ficam num bucket

`bundle/portal.js:238691` + `:239142`. A lista de tags do Desk **não** é OwnerProp; é um bucket:

```js
const KEY = "blip:desk:tags";
await BucketService.set(KEY, JSON.stringify({
  tags: [{ text: "..." }, ...],
  hasTags: bool,
  isTagsRequired: bool
}), "text/plain");
```

Comando do bucket (`bundle/portal.js:235235`): `set /buckets/{key}` (`type` livre, aqui `text/plain`),
`get /buckets/{key}?$take=100`, `delete /buckets/{key}`. Existe a OwnerProp `HasTags` em paralelo
(usada pelo MFE), o que sugere duplicidade entre os dois fronts.

### 1.5 Configuração POR FILA (owner-team-configurations)

Descoberta importante: além da configuração global do bot, existe override por fila.
`mfe/main.js:69182`:

```js
async getByTeam(teamName) {
  return client.sendCommand({ method: "get",
    to: "postmaster@desk.msging.net",
    uri: `/owner-team-configurations/${encodeURIComponent(teamName)}` });
}
async setByTeam(teamName, resource) {
  return client.sendCommand({ method: "set",
    to: "postmaster@desk.msging.net",
    uri: `/owner-team-configurations/${encodeURIComponent(teamName)}`,
    type: "application/json", resource });
}
```

Usado pela aba "Encerramento automático" dentro de **editar fila**
(`mfe/main.js:50437`, componente `EditQueueAutoClosingTickets`), com o mesmo conjunto de chaves de
inatividade (`AutomaticClosedTicketIsEnabled`, `MaxClientMinutesDowntime`, `ExpectInteractionAgent`,
`UseInactivityTags`, `InactivityTags`, `SetTicketClosedByClientAsClosed`, `UseInactivityMessage`,
`InactivityMessage`, `InactivityMessageDowntime`, `ResetClientInactivityTimerOnAgentInteraction`,
`ResetClientInactivityTimerOnFirstAgentInteraction` — lista em `mfe/main.js:10430`).
O enum de origem é `AutoClosingTicketsOriginType = { GeneralSettings, OwnerTeamSettings }`
(`mfe/main.js:71845`).

---

## 2. REGRAS DE FILA E ROTEAMENTO (regras de atendimento)

### 2.1 Endpoint e MIME

`bundle/portal.js:243167` (constantes de URI) e `mfe/main.js:70287`:

```
ATTENDANCE_QUEUES        = "/attendance-queues"
ATTENDANCE_QUEUES_QUEUE  = "/attendance-queues/queue/"
RULES                    = "/rules"
RULES_QUEUE              = "/rules/queue/"
PRIORITIES               = "/priority-rules"
PRIORITIES_QUEUE         = "/priority-rules/queue/"
```

Node destino sempre `postmaster@desk.msging.net`.
MIME da regra: **`application/vnd.iris.desk.rule+json`**.

### 2.2 Gravação

`bundle/portal.js:242210` (classe `RulesService`):

```js
async set(application, rule) {
  const resource = { ownerIdentity: `${application.shortName}@msging.net` };
  Object.assign(resource, this.mapConditionExtraProperty(rule));
  return MessagingHubService.sendCommand({
    method: "set",
    to:     "postmaster@desk.msging.net",
    type:   "application/vnd.iris.desk.rule+json",
    uri:    "/rules",
    resource
  });
}
async delete(rule) { /* delete /rules/{rule.id} */ }
```

No MFE (`mfe/main.js:29411`) o objeto montado antes do `set` é:

```js
rule.title      = title;      // string
rule.conditions = conditions; // array
rule.operator   = operator;   // "And" | "Or"
rule.team       = queueName;  // NOME da fila (não id)
// rule.id (uuid), rule.isActive (bool) já estavam no objeto
await RulesService.set(rule);
```

**Estrutura da regra:**

```jsonc
{
  "id": "<guid>",
  "ownerIdentity": "{bot}@msging.net",
  "title": "Nome da regra",
  "team": "NomeDaFila",              // string, casa com attendance-queue.name
  "isActive": true,
  "operator": "Or",                  // "Or" | "And"
  "conditions": [
    { "id": "<guid>", "property": "Message", "relation": "Contains", "values": ["boleto","2via"] }
  ]
}
```

Default de nova regra (`mfe/main.js:10391`, `ATTENDANCE_RULES_LOAD`):
`{ team: "Default", conditions: [{ id:"", property:"Message", relation:"Contains", values:[] }], operator:"Or" }`.

### 2.3 Enums de condição

`mfe/main.js:72091` (módulo `3269`) — idêntico ao portal legado (`bundle/portal.js:242376`):

```js
Properties = { Message: "Message", Name: "Contact.Name", Email: "Contact.Email", Extras: "Contact.Extras" }
Relations  = { Contains: "Contains", NotContains: "NotContains", Equals: "Equals", NotEquals: "NotEquals" }
Operators  = { Or: "Or", And: "And" }
```

Rótulos pt-BR (`mfe/main.js:7443`):

| Enum | Rótulo |
|---|---|
| `Message` | Mensagem |
| `Contact.Name` | Nome Contato |
| `Contact.Email` | Email Contato |
| `Contact.Extras` | Extras Contato |
| `Contains` | Contém |
| `NotContains` | Não contém |
| `Equals` | É igual |
| `NotEquals` | Não é igual |
| `And` | "todas as condições abaixo" |
| `Or` | "qualquer uma das condições abaixo" |

**São só 4 operadores de comparação.** Não existe regex, greater/less, startsWith, in, etc.

### 2.4 Extras: a serialização do campo

`bundle/portal.js:242012` e `mfe/main.js:29316`. Na UI, "Extras Contato" é `Contact.Extras` + um
campo texto extra (`extrasProperty`). Ao gravar, os dois viram **um único** `property`:

```js
serializeExtrasProperies(extrasProperty) { return `Contact.Extras.${extrasProperty}`; }
// leitura: property.split(".").slice(2).join(".")   →  "Contact.Extras.cpf" → "cpf"
```

### 2.5 Validações do formulário de regra

`mfe/main.js:29325` (o "podeSalvar"):

- toda condição precisa ter `values.length > 0`;
- se `property` começa com `Contact.Extras`, `extrasProperty` não pode ser vazio;
- `team` precisa existir na lista de filas carregada.

Título novo é gerado como `"Nova regra"` + contador quando já existe (`mfe/main.js:29256`).

### 2.6 Ordem de avaliação — NÃO ENCONTRADO

**Não existe campo de ordem/prioridade/peso na regra.** Não há `order`, `sequence`, `weight`,
`index` nem drag-and-drop de reordenação em nenhum dos dois bundles. As listagens usam
`?$skip=&$take=` e, na visão por fila, `&$ascending=true` — ordenação de *exibição*, não de
avaliação. **A ordem de avaliação é decidida no servidor e não é observável a partir do front.**

### 2.7 Consultas (OData sobre LIME)

```
get /rules?$skip=0&$take=100
get /rules?$filter=(substringof('termo'%2CTitle))&$skip=&$take=
get /rules/queue/{nomeDaFila}?$skip=&$take=&$ascending=true
get /rules/{id}
delete /rules/{id}
```

### 2.8 Enum de tipos de distribuição

Há **dois** conceitos distintos, com nomes parecidos:

**(a) `DistributionType`** — infraestrutura de distribuição, não escolhida pela Gestão.
`bundle/portal.js:8593`: valores `"Orleans"` e `"Redis"`. O portal só **lê**
(`bundle/portal.js:238941`) para decidir se libera a transferência direta:

```js
const isOrleans = await DeskConfigurationService.getDeskConfiguration("DistributionType") === "Orleans";
const isRedis   = await DeskConfigurationService.getDeskConfiguration("DistributionType") === "Redis";
this.isDirectTransferEnabled = featureToggle && (isOrleans || isRedis);
```

Nenhum ponto do bundle **grava** `DistributionType`. É provisionado fora do portal.

**(b) `DistributionMode`** — este sim é escolhido na tela Configurações gerais
(`mfe/main.js:37998`), atrás da flag `enable-ticket-distribution-mode-select`:

| Valor | Rótulo pt-BR |
|---|---|
| `AgentWithFewestAssignment` | "Priorizar atendentes com menos tickets ativos (Padrão)" |
| `AgentWithOldestAssignment` | "Priorizar atendentes que estão há mais tempo sem receber novos tickets" |

Payload de gravação do bloco de distribuição (`mfe/main.js:38139`) — um único `set` com várias chaves:

```js
[
  { key: "AgentSlots",                          value: agentSlots },
  { key: "AgentSlotsEnabled",                   value: "true" },        // só se ainda vazio
  { key: "ManualDistributionEnabled",           value: !doNotAllowPullTicketManually },
  { key: "DistributionMode",                    value: "AgentWithFewestAssignment" },
  { key: "AgentNewTicketSlots",                 value: maxNewTicketSlots },
  { key: "AllowDirectTransferToAnyAgentOnline", value: bool }
]
```

Validações: `AgentSlots` e `AgentNewTicketSlots` precisam ser `> 0` e numéricos
(botão salvar fica desabilitado); no portal legado, `agentSlots < 0` gera
`modules.application.detail.attendance.team.form.invalidAgentSlots`
(`bundle/portal.js:236273`).

---

## 3. SLA — o lado técnico

A tela de SLA é **exclusiva do MFE** (`portal.js` só tem o item de menu, `bundle/portal.js:108684`).
Rota `/sla-policy`, atrás da flag LaunchDarkly **`desk-sla-policy-mfe`** (`mfe/main.js:68053`).

### 3.1 Endpoints e MIME

`mfe/main.js:11005` e `mfe/main.js:70320`:

```
MIME  = "application/vnd.iris.desk.sla-policy-container+json"
uri   = "/sla-policy"                     (CRUD da regra)
uri   = "/sla-policy/available-queues"    (filas ainda sem regra)
uri   = "/analytics/reports/sla-policy-tickets-metrics"  (indicadores)
to    = postmaster@desk.msging.net
```

Comandos herdados de `LimeService` (`mfe/main.js:69597`):

```js
set(resource, uri)  → { method:"set", to, uri, type: MIME, resource }
delete(id, uri)     → { method:"delete", to, uri: `${uri}/${encodeURI(id)}` }
get({skip,take,orderAscending,oDataFilter,subPathUri,queryParams})
  → get `${uri}${subPath}?$skip=&$take=&$ascending=&$filter=(...)&...`
```

### 3.2 Estrutura da regra de SLA

`mfe/main.js:55409` (documento vazio) + `mfe/main.js:55549` (montagem antes do save):

```jsonc
{
  "slaPolicy": {
    "id": "<guid>",                       // só na edição
    "title": "SLA Padrão",                // maxlength 100, obrigatório, único
    "isMain": false,                      // regra padrão da operação
    "ownerIdentity": "{bot}@msging.net",
    "modifyDate": "2026-09-09T12:00:00.000Z"   // ISO, gravado pelo cliente
  },
  "queues": [ { "id": "<queueUniqueId>" } ],   // vazio quando isMain = true
  "metrics": [
    { "metric": "AWT",  "enabled": true,  "value": 300 },
    { "metric": "AFRT", "enabled": true,  "value": 120 },
    { "metric": "AST",  "enabled": false, "value": 0   }
  ]
}
```

### 3.3 Enum de métricas

`mfe/main.js:72113` (módulo `94232`):

```js
SLAPolicyMetric = {
  AverageWaitingTime:       "AWT",   // Tempo de espera (TME) — espera na fila após o transbordo
  AverageFirstResponseTime: "AFRT",  // Tempo de 1ª resposta (TMR1)
  AverageServiceTime:       "AST"    // Tempo de atendimento (TMA)
}
```

Definições pt-BR (`mfe/main.js:55210`):
- AWT — "Meta de tempo de espera do cliente após o transbordo"
- AFRT — "Meta de tempo que um cliente pode esperar para receber a primeira resposta de um atendente"
- AST — "Meta de tempo para a conclusão de um atendimento"

### 3.4 Unidade

**`value` é sempre em SEGUNDOS.** A UI oferece um seletor de unidade e multiplica antes de gravar.
`mfe/main.js:26615` (`useTimeUnities`) e `mfe/main.js:11011` (`TIME_IN_SECONDS`):

```js
UnitOfTime = { Second: "Second", Minute: "Minute", Hour: "Hour", Day: "Day" }   // mfe/main.js:72230
opções = [ {1,"Segundos"}, {60,"Minutos"}, {3600,"Horas"}, {86400,"Dias"} ]
getConvertTimeForSeconds(valor, unidade) => valor * unidade
getTimeUnity(segundos) => maior unidade que divide exatamente  // p/ reexibir
```

### 3.5 Validações (`mfe/main.js:55997` e `:56024`)

1. `title` não vazio;
2. `isMain === true` **ou** `queues.length > 0` — ou é padrão, ou tem fila;
3. cada métrica **habilitada** precisa de valor não vazio e `parseInt(valor) > 0`;
4. **pelo menos uma** das três métricas habilitada (senão abre alerta "Configure ao menos uma meta");
5. `title` único: `getSLAPolicyByName(title)` com filtro OData `Title eq '...'` — se achar outra com
   id diferente → "Nome da regra já existe";
6. só pode existir **uma** regra `isMain`: `getDefaultSLAPolicy()` com filtro `IsMain eq true` — se
   achar outra → "Já existe uma regra definida como padrão de operação regular";
7. ao marcar `isMain`, o array `queues` é esvaziado e o seletor de filas é desabilitado.

Filtros OData usados: `SlaPolicyId eq guid'{id}'`, `Title eq '{titulo}'`, `IsMain eq true`,
`substringof('{termo}', Title)`.

### 3.6 Como a violação é marcada

O ticket devolvido pelo monitoramento carrega **três flags booleanas** (`mfe/main.js:43419`):

```js
ticket.hasQueueTimeExceeded          // tooltip: "O tempo de espera na fila excedeu o SLA"
ticket.hasFirstResponseTimeExceeded  // "O tempo de 1ª resposta excedeu a meta de SLA"
ticket.hasAttendanceTimeExceeded     // "O tempo de atendimento excedeu a meta de SLA"
```

Quando `true`, a célula do grid troca o texto por um `<bds-badge color="danger" icon="warning">`.
**A marcação é feita pelo servidor** — o front só lê a flag; não há cálculo de violação no bundle.

### 3.7 Indicadores de SLA (relatório)

`get /analytics/reports/sla-policy-tickets-metrics?...` (`mfe/main.js:68389`).
Campos do recurso de resposta (`mfe/main.js:54206`):

```
waitingTimeAchievedCount / waitingTimeNotAchievedCount
firstResponseTimeAchievedCount / firstResponseTimeNotAchievedCount
serviceTimeAchievedCount / serviceTimeNotAchievedCount
slaAchievedCount, slaAppliedCount, ticketCount
avgExceededTimeInSeconds
```

Regras derivadas dos textos: "Atingimento geral" = tickets que cumpriram **todas** as metas;
"Não atingidos" = `slaAppliedCount - slaAchievedCount` (falhou em **ao menos uma**);
"Tickets com regra atribuída" = `slaAppliedCount`.
Limite de janela: **atrasos de SLA não são exibidos em períodos maiores que 90 dias**
(`mfe/main.js:67441`).

---

## 4. PRIORIDADE

### 4.1 Endpoint e MIME

`bundle/portal.js:243812` (`PriorityRulesService`) e `mfe/main.js:70106`:

```
uri  = "/priority-rules"        |  "/priority-rules/queue/{filaId}"
MIME = "application/vnd.iris.desk.priority-rules+json"
to   = postmaster@desk.msging.net
```

Gravação (portal legado, `bundle/portal.js:243814`):

```js
async set(application, priorityRule) {
  const resource = { ownerIdentity: `${application.shortName}@msging.net`, ...priorityRule };
  return sendCommand({ method:"set", to:"postmaster@desk.msging.net",
                       type:"application/vnd.iris.desk.priority-rules+json",
                       uri:"/priority-rules", resource });
}
delete → delete /priority-rules/{id}
get    → get /priority-rules/queue/{filaId}?$skip=&$take=
```

### 4.2 Estrutura

`mfe/main.js:51109`:

```jsonc
{
  "id": "<guid>",
  "queueId": "<queueUniqueId>",
  "ownerIdentity": "{bot}@msging.net",
  "title": "Clientes VIP",
  "urgency": 3000,
  "isActive": true,
  "applyConditions": true,
  "operator": "Or",
  "conditions": [ { "property":"Contact.Extras.plano", "relation":"Equals", "values":["ouro"] } ]
}
```

Quando `applyConditions === false`, o cliente grava **`conditions: []`** — a regra vale para a fila
inteira. Default de nova regra: `urgency = TicketUrgency.Low` (`mfe/main.js:50947`).

### 4.3 Enum de níveis

**`TicketUrgency`** (`mfe/main.js:72219`) — valores numéricos, espaçados de 1000:

| Nome | Valor |
|---|---|
| `None` | `0` |
| `Low` | `1000` |
| `Medium` | `2000` |
| `High` | `3000` |
| `Maximum` | `4000` |

O formulário de regra de priorização só oferece **Low / Medium / High** (`mfe/main.js:50985`;
mesmo conjunto no portal legado, `bundle/portal.js:242857`, com os valores como **string**
`"1000"|"2000"|"3000"`).

`None` e `Maximum` aparecem só na **exibição** do ticket ("grau de prioridade":
Sem prioridade / Baixa / Média / Alta / Máxima — `bundle/portal.js:242868`). `Maximum` (4000) é
atingido por outra via, provavelmente `ActiveMessageTicketPriorityEnabled` (mensagem ativa entra
com prioridade máxima) — **não confirmado no bundle**.

Normalização (`mfe/main.js:46513`): o valor bruto é rebaixado para a faixa imediatamente inferior —
`urgency >= 4000 → Maximum`, `>= 3000 → High`, `>= 2000 → Medium`, `>= 1000 → Low`, senão `None`.
Ou seja, o servidor pode devolver valores intermediários (ex.: 2500) e o front arredonda para baixo.

### 4.4 Validação

`mfe/main.js:51066` — botão salvar exige `queueUniqueId` presente e, se `applyConditions`, que
nenhuma condição esteja com `values` vazio (`priority.valuesEmpty` no template legado,
`bundle/portal.js:733`).

---

## 5. HORÁRIO DE ATENDIMENTO

### 5.1 Endpoint e MIME

`bundle/portal.js:244513` e `mfe/main.js:68434`:

```
MIME = "application/vnd.iris.desk.attendance-hour-container+json"
to   = postmaster@desk.msging.net
set    /attendance-hour
delete /attendance-hour/{id}
get    /attendance-hour?$skip=0&$take=999          → lista de regras (só o cabeçalho)
get    /attendance-hour-container/{id}             → schedule + exceções da regra
```

### 5.2 Estrutura do recurso gravado

`mfe/main.js:22690` (`setAttendanceHourContainer`):

```jsonc
{
  "attendanceHour": {
    "id": "<guid>",            // ausente na criação
    "title": "Comercial",
    "description": "…",
    "isMain": false            // regra padrão (vale para tudo que não tem regra própria)
  },
  "queues":      [ { "id": "<queueUniqueId>", "description": "NomeDaFila" } ],
  "attendants":  [ { "id": "<agentIdentity>", "description": "email@dominio" } ],
  "attendanceHourScheduleItems": [
    { "id":"<guid>", "dayOfWeek": "Monday", "startTime":"08:00", "endTime":"12:00", "scheduleId":1 }
  ],
  "attendanceHourOffItems": [
    { "id":"<guid>", "reason":"Feriado", "startDate":"2026-12-25T00:00:00.000Z",
                                          "endDate":"2026-12-25T23:59:00.000Z" }
  ]
}
```

Quando `isMain === true`, o cliente envia `queues: []` e `attendants: []`.

**`dayOfWeek` — atenção à divergência entre os dois fronts.** O portal legado grava **número**
(`bundle/portal.js:1081`, criação do horário default do bot):

```js
const n = Array.from(Array(5), (_, i) => i + 1)      // 1..5
         .map(d => ({ startTime: "08:00:00", endTime: "18:00:00", dayOfWeek: d }));
```

isto é, `System.DayOfWeek` do .NET (Sunday=0 … Saturday=6), 1..5 = seg–sex, com hora `HH:mm:ss`.
Já o MFE indexa a tradução por **nome** (`weekDay[dayOfWeek]` com chaves `Monday`…`Sunday`,
`mfe/main.js:10093`) e usa `HH:mm`. O `DayOfWeekNumber` do MFE (`mfe/main.js:71787`) é
**só para ordenação de tela** e começa em Monday=0 — não é o valor da API. Concluindo: a API
provavelmente serializa o enum como **nome**, e o portal legado ainda envia número. Vale confirmar
com uma chamada real antes de escrever.

Constantes de horário (`mfe/main.js:10364`):
`SCHEDULE_START_TIME="08:00"`, `SCHEDULE_END_TIME="18:00"` (defaults de um novo turno),
`SCHEDULE_START_TIME_DAY="00:00"`, `SCHEDULE_END_TIME_DAY="23:59"` (limites do dia),
`ATTENDANCE_HOUR_TAKE=8` (paginação da lista).

### 5.3 Faixas (turnos) e suas validações

`mfe/main.js:10008` — cada dia tem N turnos; validação turno a turno:

| Regra | Mensagem |
|---|---|
| `startTime.length < 5` ou `endTime.length < 5` | "Campo de horário vazio ou inválido" |
| `startTime >= endTime` | "A hora de início não pode ser maior ou igual à hora de término" |
| `startTime <= endTime` do turno anterior | "…não pode ser maior ou igual ao horário final anterior" |
| `endTime >= startTime` do turno seguinte | "…não pode ser maior ou igual ao próximo horário inicial" |
| sobreposição | "Os horários não podem se sobrepor" |
| último turno já chega a 23:59 | "Não é possível inserir um horário. O último horário deve ser menor que 23:59" |

Comparação é **lexicográfica sobre a string `HH:mm`** — funciona porque os campos são zero-padded.
Ao adicionar turno, o novo começa em `últimoFim + 1min` e termina em `últimoFim + 1h`
(ou 23:59 se estourar) — `mfe/main.js:9972`.

### 5.4 Exceções (períodos sem atendimento)

`mfe/main.js:28100`. Novo período nasce com o dia de hoje, `00:00`–`23:59`, `allDay: true` e
`reason` = texto default. `startDate`/`endDate` são montados assim:

```js
new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0)).toJSON()
```

Ou seja: **pega a data/hora de parede local e grava como se fosse UTC**. `allDay`, `startTime`,
`endTime` e `danger` são campos **só de tela** (recalculados na leitura, `mfe/main.js:22583`), não
fazem parte do contrato.

Validações de exceção (`mfe/main.js:28879`): sem `startDate` → "Data inicial vazia"; sem `endDate` →
"Data final vazia"; `startDate > endDate` → "Data inicial maior que a final"; nenhuma das duas →
"Período inválido".

### 5.5 Validações do formulário inteiro (`mfe/main.js:28874`)

1. se **não** é `isMain`, precisa ter `queues.length > 0` **ou** `attendants.length > 0`;
2. só pode haver **uma** regra com `isMain === true` (checado contra a lista carregada);
3. `attendanceHourScheduleItems.length > 0`;
4. nenhum turno com `danger`;
5. `title` não vazio.

Ao salvar a **primeira** regra, abre modal avisando que os blocos de atendimento humano do Builder
precisam ter **condição de saída** configurada — sem ela o horário é ignorado e um novo atendimento é
iniciado (`mfe/main.js:28820`, texto do produto).

### 5.6 Fuso horário — NÃO ENCONTRADO na tela

Não existe seletor de fuso na tela de horário de atendimento. Os turnos são `HH:mm` "nus" e as
exceções são gravadas com o truque `Date.UTC` acima. O que existe no portal é o fuso **da conta/bot**,
gravado como configuração do Builder (`bundle/portal.js:256909`):

```js
this.configuration["builder:#localTimeZone"] = this.account.timeZoneName || "E. South America Standard Time";
```

com a lista de fusos em formato Windows (`getTimezoneByAccount` / `loadTimezones`,
`bundle/portal.js:17601`). **É plausível — mas não comprovado pelo bundle — que o servidor avalie o
horário de atendimento contra esse `builder:#localTimeZone`.**

### 5.7 Vínculo fila ↔ horário e atendente ↔ horário

Tanto `attendance-queue` quanto `agent` carregam **`attendanceHourId`** (`mfe/main.js:22668`):

```js
// só oferece filas/atendentes livres ou já pertencentes a esta regra
queues.filter(q => !q.attendanceHourId || q.attendanceHourId === current.id)
agents.filter(a => !a.attendanceHourId || a.attendanceHourId === current.id)
```

Logo: **uma fila/atendente pertence a no máximo uma regra de horário**. O vínculo é gravado pelo
próprio container de horário (arrays `queues`/`attendants`), não editando a fila.
O horário por atendente está atrás da flag **`desk-attendance-hour-attendant`**.

---

## 6. FILAS E ATENDENTES

### 6.1 Fila (attendance queue)

MIME **`application/vnd.iris.desk.attendancequeue+json`**, node `postmaster@desk.msging.net`
(`bundle/portal.js:244168`, `mfe/main.js:68515`).

```
set    /attendance-queues                      (cria e edita — id vazio = cria)
delete /attendance-queues/{id}
get    /attendance-queues?$skip=&$take=&$ascending=true
get    /attendance-queues/{id}
get    /attendance-queues?$filter=(substringof('termo'%2CName))&$skip=&$take=
get    /attendance-queues?$filter=Name eq '{nome}'
```

Campos observados:

| Campo | Tipo | Nota |
|---|---|---|
| `id` | guid | string vazia na criação |
| `uniqueId` | guid | é o id usado como `queueId` em priority-rules e como `queues[].id` no SLA |
| `name` | string | mínimo **3** caracteres (`QUEUE_NAME_INPUT_MIN_LENGTH = 3`, `mfe/main.js:51432`) |
| `isActive` | bool | liga/desliga a fila |
| `ownerIdentity` | string | `{bot}@msging.net` |
| `numberAttendants` | int | somente leitura |
| `attendanceHourId` | guid? | regra de horário vinculada |

Fila criada junto com o bot (`bundle/portal.js:1073`):
`{ id:"", isActive:true, name:"Default", numberAttendants:0 }`.
`DEFAULT_ATTENDANCE_QUEUE_NAME = "Default"` (`mfe/main.js:11157`); apagar a Default depende da flag
`can-delete-default-attendance-queue`.

**Nome duplicado:** o cliente verifica antes de gravar, comparando `name.toLowerCase().trim()`
contra o resultado de `filterQueues` (`bundle/portal.js:243938`). É validação **só de cliente**.

Fila especial **`DIRECT_TRANSFER`** (`bundle/portal.js:8592`) — usada pela transferência direta entre
atendentes; a UI mostra rótulo traduzido no lugar do nome cru. Erro conhecido do servidor:
`"Error: Cód. 64: Unable to allocate an agent to the direct transfer queue"`.

**Tags da fila** — MIME `application/vnd.iris.desk.attendancequeuetag+json`
(`bundle/portal.js:243529`):

```js
set    /attendance-queues/{queueId}/tags
       resource: { ownerIdentity, tag, AttendanceQueueId }   // note o A maiúsculo
delete /attendance-queues/{queueId}/tags/{tagId}
get    /attendance-queues/{queueId}/tags
get    /attendance-queues/name/{queueName}/tags
```

O item lido tem `{ id, tag, ownerIdentity, attendanceQueueId }` (a maiúscula só aparece na escrita —
provável inconsistência do produto). O MFE tem uma variante em lote
(`setAttendanceQueueTags`, `mfe/main.js:68549`) que envia uma coleção
`application/vnd.lime.collection+json` mas declara `itemType` como **`attendancequeue+json`** em vez
de `attendancequeuetag+json` — **parece bug do produto**.

### 6.2 Atendente

MIME do item **`application/vnd.iris.desk.attendant+json`**; a gravação é sempre em **coleção**
(`bundle/portal.js:237613`):

```js
async set(attendants, userCulture = "") {
  const uri = "/attendants" + (userCulture ? `?userCulture=${userCulture}` : "");
  return sendCommand({
    method: "set", to: "postmaster@desk.msging.net",
    type: "application/vnd.lime.collection+json",
    uri,
    resource: { total: attendants.length,
                itemType: "application/vnd.iris.desk.attendant+json",
                items: attendants }
  });
}
delete /attendants/{identity}
delete postmaster@msging.net /delegations/{identity}?envelopeTypes=command
get    /attendants?$filter=…&$skip=&$take=
get    /attendants/queue/{fila}?$skip=&$take=
get    /attendants/queue/{fila}?$filter=(substringof('termo'%2CIdentity))&$skip=&$take=
get    /teams
get    /teams/agents-online
```

Item do atendente (`bundle/portal.js:236764`, `formatAttendants`):

```jsonc
{
  "identity":   "usuario%40dominio.com@blip.ai",   // e-mail URL-encoded + @blip.ai
  "teams":      ["Default","Vendas"],              // NOMES de fila
  "agentSlots":  5,                                // undefined quando == AgentSlots global
  "isEnabled":   true,
  "email":       "…",   // leitura
  "fullName":    "…",   // leitura
  "attendanceHourId": "<guid>"   // leitura
}
```

**`agentSlots` é a capacidade individual.** A regra é explícita
(`bundle/portal.js:236526` e `:236767`): se o valor digitado for **igual** ao `AgentSlots` global,
grava-se `undefined` — o atendente volta a herdar o global. Não existe "0 = ilimitado";
`agentSlots < 0` é rejeitado no cliente.

Vincular atendente a fila = **reescrever o array `teams` do atendente** e mandar o `set` da coleção.
Não há endpoint de vínculo. Edição em massa (`bundle/portal.js:236541`) faz um `set` por atendente,
serializado por um lock.

API nova (MFE, `mfe/main.js:68737`): `get /agents/v2?...&nameOrEmailFilterLike=&teams=&includeStatus=`
com MIME `application/vnd.iris.desk.agent+json`, e `get /agents/allowed-domains`.
Flags: `desk-attendant-mfe`, `agent-bulk-insert`.

### 6.3 Permissões do atendente

MIME `application/vnd.iris.desk.agentspermissions+json` (item:
`application/vnd.iris.desk.agentpermission+json`) — `mfe/main.js:68619`:

```js
get /agent/{identity}/permission
set /agent/permissions
    type: "application/vnd.lime.collection+json"
    resource: { itemType: "application/vnd.iris.desk.agentspermissions+json",
                items: [ { agents: [identity,…],
                           permissions: [ { ownerIdentity, name, isActive } ] } ] }
```

Enum `AgentPermission` (`mfe/main.js:71817`) — 17 valores:

```
canEditContact, canCreateAndEditCustomReplies, canSendActiveMessage,
canViewAndCreatePaymentLink, canAttendantTransfer, canCallsVoiceInbound,
canCallsVoiceOutbound, canCallsVideo, canCareCopilotSummary,
canCareCopilotSuggestions, canAccessContactHistory, canCareCopilotSpeech,
canCareCopilotScore, canMultipleTicketTransfer, canSendTicketThreadEmail,
canPutTicketOnStandbyMode, canCreateFolders
```

### 6.4 Pausas personalizadas

MIME **`application/vnd.iris.desk.custom-pause+json`** (`mfe/main.js:10936`), node
`postmaster@desk.msging.net` — `mfe/main.js:70027`:

```js
set    /custom-pauses                 type: custom-pause+json
       resource: { id?: "<guid>", reason: "Almoço", timeMinutes: 60 }
delete /custom-pauses/{id}
get    /custom-pauses?$skip=0&$take=25
get    /custom-pauses/reason/{reason}     // usado só para checar duplicidade
```

Estrutura: **três campos** — `id` (só na edição), `reason` (string) e `timeMinutes` (int, minutos).

Validações (`mfe/main.js:6839` criar, `mfe/main.js:46745` editar):

- `reason` obrigatório ("Qual será o nome desta nova pausa?");
- `reason` com **maxlength 30**;
- unicidade **case- e acento-insensitive**:
  ```js
  a.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  === b.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  ```
  → "Já existe uma pausa personalizada com este nome";
- botão salvar bloqueado enquanto não houver alteração (`reason` e `timeMinutes` iguais aos originais).

Paginação `PERSONALIZED_BREAKS_TAKE = 5` (`mfe/main.js:10940`).
Eventos Segment: `helpdesk-personalizedbreak-added|edited|deleted`.

Status do atendente (`mfe/main.js:71828`): `AgentStatus = { Online, Pause, Invisible, Offline }`.
Relatório de pausas: `get /analytics/reports/attendants/pauses-history/{identity}?$filter=startDate ge datetimeoffset'…' and startDate le datetimeoffset'…'`
(`mfe/main.js:68381`) — devolve uma **URL** de arquivo, não os dados.

---

## 7. OUTROS ENUMS DE DOMÍNIO ENCONTRADOS

Todos em `mfe/main.js`, faixa 71780–72245 (módulo de typings do MFE).

```js
// 72205
TicketStatus = { Waiting:"Waiting", Open:"Open", ClosedAttendant:"ClosedAttendant",
                 ClosedClient:"ClosedClient", Transferred:"Transferred", Assigned:"Assigned" }

// 72219
TicketUrgency = { None:0, Low:1000, Medium:2000, High:3000, Maximum:4000 }

// 71828
AgentStatus = { Online:"Online", Pause:"Pause", Invisible:"Invisible", Offline:"Offline" }

// 71780
AttendanceChannel = { Desk:"Desk", Salesforce:"Salesforce",
                      SalesforceMiaw:"SalesforceMiaw", Custom:"Custom" }

// 36017
SalesforceMiawMode = { Miaw:"Miaw", LiveAgent:"LiveAgent", Both:"Both" }

// 30972
SalesforceMiawPropertyType = { Static:"static", Ticket:"Ticket",
                               Contact:"Contact", ContactExtras:"ContactExtras" }

// 46012
TransferTargetType = { Team:"Team", Attendant:"Attendant" }

// 71845
AutoClosingTicketsOriginType = { GeneralSettings:"GeneralSettings",
                                 OwnerTeamSettings:"OwnerTeamSettings" }

// 72230
UnitOfTime = { Second:"Second", Minute:"Minute", Hour:"Hour", Day:"Day" }

// 72244
ActiveMessageSourceType = { Router:"router", Chatbot:"chatbot" }

// 10875
PermissionLevel = { None:"None", Read:"Read", Write:"Write" }

// 31932
PageName = { AttendanceHours, AttendanceRules, Attendants, BlipCopilotMfe, CallsDashboard,
             CareCopilot, Channels, GeneralSettings, LeadScore, MessageTemplate,
             MetadataManagement, Monitoring, PersonalizedBreaks, QualityAssurance,
             QueueManagement, Replies, Report, SalesDashboard, SlaPolicy,
             SurveyDashboard, TicketHistory }

// 88581 — rotas internas do MFE
PageNameInternal = { Attendants, CreateAttendant, EditAttendant, AttendantPermissions,
                     AttendanceRules, CreateAttendanceRule, EditAttendanceRule,
                     QueueManagement, EditQueue, SLAPolicy, CreateSLAPolicy, EditSLAPolicy,
                     Replies, Channels, DeskChannel, SalesforceChannel,
                     SalesforceMiawChannel, CustomChannel, EditCategory }

// 72042 — agrupamento do menu
MenuGroup = { Reports, Messaging, Rules, Agents, Settings }

// 71901
ChannelName = { Blipchat:"blipchat", BusinessMessages:"businessmessages", Instagram:"instagram",
                Mailgun:"mailgun", Messenger:"messenger", Telegram:"telegram", WhatsApp:"wa",
                Workplace:"workplace", AppleBusinessChat:"businesschat", Facebook:"facebook" }

// 92099
ThreadMessageDirection = { Sent:"sent", Received:"received" }

// 774
TicketHistoryPageToRender = { PortalOnly:"portal-only", Both:"both", MfeOnly:"mfe-only" }

// 71948
Culture = { PtBr:"pt-BR", EnUs:"en-US", EsEs:"es-ES" }

// 9695 — filtros de período dos dashboards
PeriodFilter = { today, yesterday, last7days, last15days, last30days, last60days,
                 last90days, last120days, last180days, personalized }

// 53498
ProductivityReportType = { AttendantProductivity, AttendantPauses }
```

**Permissão por página do usuário** (`mfe/main.js:22474`): a chave lida do objeto de permissões é
`desk{PageName}Page` (ex.: `deskSlaPolicyPage`) e vale `Write` para poder editar. No portal legado a
verificação é `PermissionsService.hasPermissions("write", "desk")`.

**Constantes globais do MFE** (`mfe/main.js:11135`): `DESK_APPLICATION_DOMAIN =
postmaster@desk.msging.net`, `PORTAL_APPLICATION_DOMAIN = postmaster@portal.blip.ai`,
`CONFIGURATIONS_APPLICATION_DOMAIN = postmaster@configurations.msging.net`,
`TUNNEL_POSTMASTER_NODE = postmaster@tunnel.msging.net`, `DEFAULT_MAX_TAKE = 9999`,
`DEFAULT_TIME_OUT = 250`, `TICKET_MIME_TYPE = application/vnd.iris.ticket+json`,
`DEFAULT_ATTENDANCE_QUEUE_NAME = "Default"`, `DIRECT_TRANSFER_TEAM = "DIRECT_TRANSFER"`.

**Códigos de erro LIME vistos no tratamento:** `67` = recurso não encontrado
(`COMMAND_RESOURCE_NOT_FOUND`, tratado como lista vazia em quase todo lugar), `66` = acesso negado
ao bot, `62`, `42`, `11` = erros não reportados ao Sentry (`bundle/portal.js:114400`),
`64` = falha ao alocar agente na fila de transferência direta.

**Feature toggles (LaunchDarkly) que governam estas telas** (`mfe/main.js`, `isFeatureEnabled("…")`):

```
desk-sla-policy-mfe, desk-attendance-hour-attendant, desk-queue-management-mfe,
desk-attendant-mfe, desk-monitoring-mfe, desk-report-mfe, attendance-menu-mfe,
enable-ticket-distribution-mode-select, enable-agent-max-new-ticket-slots,
allow-pull-manually-ticket, enable-direct-transfer-to-any-agent-online,
enable-multiple-ticket-transfer, ticket-transfer-attendant-permissions,
block-away-agent-desk-usage, ticket-stand-by-mode-feature, forbidden-words-setting,
can-delete-default-attendance-queue, agent-bulk-insert,
desk-active-message-limit, desk-active-message-multiple-routers,
active-message-opening-hours, active-message-any-flux,
active-message-allow-send-to-contact-in-attendance,
messaging-hub-command-with-delegation,
use-configurations-domain-on-desk-mfe-operations-get / -set,
desk-consider-closed-tickets-on-metrics, attendance-monitoring-use-cache,
allow-only-specific-types-on-attachments, insert-external-attachment-into-desk-chat,
enable-blip-desk-authenticated-media, send-ticket-thread-email[-settings],
desk-metadata-management, desk-lead-score-config, desk-payment-link,
desk-inbound-calls-create-ticket, desk-video-calls,
desk-receive-calls-permission-and-config, desk-attendant-calls-permission-and-config,
desk-calls-dashboard-reject-reasons, desk-sales-dashboard-funnel,
desk-sales-dashboard-team-metrics, attendance-survey-dashboard[-v2],
blip-copilot-mfe, audio-transcription-copilot, monitoring-internal-chat,
create-and-edit-custom-replies-agent-permission, allow-agent-add-ticket-folders,
show-identities-names-ticket-history-page, menu-tree-sidebar, use-footer-with-blip-status,
widget-blip-chat-help-center
```

**Outros MIME types `vnd.iris.desk.*` encontrados** (podem virar trabalho futuro):
`custom-reply+json` (respostas rápidas), `messagetemplateparams+json`,
`attendance-survey-answer+json`, `thread-summary+json`, `ticket-history-request+json`,
`attendantdisconnectionrequeststart+json`.

---

## 8. COMO A GESTÃO GRAVA USUÁRIOS E PERMISSÕES

> Complementa `blip-identidade-tenant-permissao.md`, que descreve o lado **lido** pelo Desk
> (`GET /agent/permissions/all`, content type `...ownerpermissioncache+json`). Aqui está a **fonte
> da verdade**: o que o portal escreve.
>
> Tudo desta seção sai do **portal legado** (`bundle/portal.js`) — o Desk MFE não mexe em usuário
> nem em permissão de portal. O bundle está minificado; nomes de método e de campo sobreviveram,
> nomes de variável local não. As telas de "Membros do contrato" e "Atendentes do contrato"
> **não foram capturadas** nestes zips (só o módulo Atendimento), então o que segue vem do código
> dos serviços e dos textos de i18n, não de HTML renderizado.

### 8.1 O mapa em uma tela

```
IDENTIDADE (global, Blip)          {email-urlencoded}@blip.ai
   │
   ├── TENANT (contrato)           set /tenants/{id}/users        → papel: admin|member|guest
   │     │                         set /tenants/{id}/agents       → licença de atendente (plano pago)
   │     └── BOT (application)      set /applications/{bot}/users  → membro do bot
   │           │                    set /applications/{bot}/permissions → 33 claims × read/write
   │           │
   │           └── FILA (team)      set /attendants (coleção)     → attendant.teams = ["Fila"]
   │                                                              → attendant.agentSlots
   └── 17 flags do Desk            set /agent/permissions (postmaster@desk)
```

São **três camadas independentes de permissão**, e todas precisam ser satisfeitas:

| Camada | Onde vive | Quem grava | Granularidade |
|---|---|---|---|
| Papel no contrato | `postmaster@portal.blip.ai` `/tenants/{id}/users` | admin do contrato | `admin` / `member` / `guest` |
| Permissão de portal por bot | `postmaster@portal.blip.ai` `/applications/{bot}/permissions` | quem tem claim `team` (112) no bot | 33 claims × `none`/`read`/`write` |
| Permissão de agente no Desk | `postmaster@desk.msging.net` `/agent/permissions` | quem tem `deskAttendantsPage` write | 17 flags booleanas |

### 8.2 Papéis do contrato (tenant) — o único "perfil" real do produto

Enum em `bundle/portal.js:221619` (módulo `91221`, export `o6`):

```js
TenantRole = { Guest: "guest", Member: "member", Admin: "admin" }
```

Descrições oficiais (i18n `inviteMemberModal`, pt-BR):

| `roleId` | Rótulo pt-BR | O que implica (texto do produto) |
|---|---|---|
| `admin` | "Admin" | "Edita todos os dados do contrato, gerencia membros, cria e edita chatbots." |
| `member` | "Pode editar" | "Cria e edita chatbots, mas **não gerencia os membros** do contrato." |
| `guest` | "Pode visualizar" | "Apenas visualiza informações do contrato." |

Ícones associados (`bundle/portal.js:307617`): admin → `avatar-user`, member → `edit`, guest → `eye-open`.

Onde o papel é checado no código:

```js
isContractAdmin(identity)                  // roleId === "admin"   (portal.js:221913)
hasRequiredTenantRole(identity, tenantId, [Admin])              // portal.js:221815
currentUserHasRequiredTenantRole(tenantId, [Admin, Member])     // portal.js:221824
canCreateChatBot = hasRequiredTenantRole(..., [Admin, Member])  // portal.js:226334
mover bots entre contratos: opção desabilitada se roleId !== Admin  (portal.js:77584, 78590)
setMemberAccounts() só roda se roleId === Admin                 // portal.js:307580
```

**Só `admin` pode:** convidar/gerenciar membros do contrato, licenciar atendentes
(`/tenants/{id}/agents`), mover chatbots entre contratos, definir contrato padrão,
e ver a lista de membros no setup inicial. `admin` e `member` podem criar chatbot; `guest` não.

### 8.3 Convite e cadastro de usuário

**O convidado precisa já existir na Blip.** A identidade é global
(`{email-urlencoded}@blip.ai`); o portal não cria conta. Antes de adicionar alguém a um bot, a tela
consulta `getTenantUser(tenantId, identity)` e trata o erro 67:

`bundle/portal.js:214266`

```js
try {
  if (await TenantService.getTenantUser(tenantId, `${encodeURIComponent(email)}@blip.ai`))
    return userForm.$setValidity("emailNotOnTenant", true);
} catch (e) {
  const err = JSON.parse(e);
  if (err.reason.code === 67 && err.reason.description.startsWith("User not found"))
      → "Essa pessoa não possui cadastro ou ainda não ativou sua conta no Blip.
         Verifique se esse e-mail possui um cadastro completo e tente novamente."
  else → "Essa pessoa não faz parte do contrato. O administrador deve incluir a pessoa
          no contrato antes de adicioná-la ao chatbot."
     // se o usuário logado É admin do contrato, a mensagem vira só um aviso:
     // "Atenção! Apenas membros do contrato podem ser adicionados a um chatbot.
     //  Ao prosseguir, esta pessoa terá o status de permissão 'Pode Visualizar' no contrato."
}
```

Portanto o portal distingue **três casos**: (a) e-mail sem conta Blip → bloqueia;
(b) tem conta mas não está no contrato e quem convida **não** é admin → bloqueia;
(c) tem conta, não está no contrato e quem convida **é** admin → deixa passar e cria como `guest`.

**Comando de convite ao contrato — em lote** (`bundle/portal.js:221765`):

```js
inviteMany(emails, tenantId, roleId) {
  const items = emails.map(email => ({
    tenantId,
    userIdentity: `${encodeURIComponent(email)}@blip.ai`,
    roleId                                   // "admin" | "member" | "guest"
  }));
  return BlipService.sendCommand({
    method: "set",
    to: "postmaster@portal.blip.ai",
    uri: `/tenants/${tenantId}/users`,
    type: "application/vnd.lime.collection+json",
    resource: { items, itemType: "application/vnd.iris.portal.tenant-user+json", total: items.length }
  });
}
```

**Convite individual / auto-adesão** (`bundle/portal.js:221750`):

```js
joinTenant(tenantId) {
  return sendCommand({ method:"set", to:"postmaster@portal.blip.ai",
    uri: `/tenants/${tenantId}/users`,
    type: "application/vnd.iris.portal.tenant-user+json",
    resource: { tenantId, userIdentity: `${encodeURIComponent(me.email)}@blip.ai` } });
}
```

Note que `joinTenant` **não manda `roleId`** — o servidor decide o default.

Na tela de convite (`bundle/portal.js:303907`) os e-mails são agrupados **por papel** e o portal
dispara **um `inviteMany` por papel**:

```js
const byRole = {};
Object.values(TenantRole).forEach(role => {
  const emails = invitedAccounts.filter(a => a.roleId === role).map(a => a.email);
  if (emails.length) byRole[role] = emails;
});
for (const role of Object.keys(byRole))
  await TenantService.inviteMany(byRole[role], tenant.id, role);
```

Validações do formulário de convite:
- regex de e-mail própria (`bundle/portal.js:307494`, RFC-ish);
- e-mail já na lista ou já membro → "Esse e-mail já foi adicionado";
- importação por CSV: **máximo 30 linhas** (`this.maximumContact = 30`,
  `bundle/portal.js:303805`) → "Quantidade de e-mail maior que o permitido! Limite de e-mails 30";
- o CSV ignora a primeira linha se começar com `sep=`;
- aviso quando há repetidos: "Existem pessoas que já fazem parte desse contrato. Para editar o
  permissionamento desses membros clique aqui".

**Estados do convite** — enum em `bundle/portal.js:221623` (módulo `91221`):

```js
TenantUserStatus = { PendingTenant: "PendingTenant", PendingUser: "PendingUser",
                     Accepted: "Accepted", Rejected: "Rejected" }
```

O campo no objeto do usuário é `userStatus`. Semântica pelos usos:

- `PendingUser` — o contrato convidou, falta a pessoa aceitar. É o estado depois de `inviteMany`.
- `PendingTenant` — a pessoa pediu para entrar, falta o contrato aprovar (pelo nome; **não há uso
  no bundle capturado**).
- `Accepted` / `Rejected` — resolvido.

**Aceite** (`bundle/portal.js:226316`): o convite chega por e-mail com um link que traz
`?tenant-invitation={tenantId}&tenantName={nome}`. Ao abrir a home, o portal faz:

```js
this.userTenant = await TenantService.getTenantUser(tenantId, myIdentity);
if (this.userTenant.userStatus === "PendingUser")
    await TenantService.setMemberStatus(tenantId, myIdentity, "accepted");
window.location.href = TenantService.getTenantUrl(tenantId, true);   // https://{tenantId}.blip.ai
// erro 67 aqui → alerta "não permitido"
```

Comando de mudança de status (`bundle/portal.js:221782`):

```js
set  /tenants/{tenantId}/users/{userIdentity}/user-status
     to:   postmaster@portal.blip.ai
     type: "application/vnd.iris.portal.tenant-user-status"     // sem "+json"
     resource: "accepted"                                        // string crua
```

Em outro ponto (`bundle/portal.js:77231`) o portal, ao detectar `PendingUser`, manda o usuário para
`auth.application.move` — o fluxo de mover chatbots para o novo contrato.

**Prazo de expiração do convite: NÃO ENCONTRADO.** Não há nenhuma menção a validade, dias ou
expiração de convite em nenhum dos bundles nem no i18n (a única string com "expira" é o código OTP
de 10 minutos, de outro fluxo). O portal oferece "Convite reenviado" (`resentInvite`) e "Cancelar
convites" na tela de membros, mas **os comandos de reenvio e cancelamento não estão em `portal.js`**
— provavelmente vivem no micro-frontend da tela de membros, que não foi capturado.

### 8.4 Gravação de permissão

Existem **duas** APIs de permissão distintas, com donos diferentes. Não confundir.

#### (a) Permissões de portal por bot — `postmaster@portal.blip.ai`

É o que controla quais **telas do portal** a pessoa vê naquele chatbot, inclusive todas as telas da
Gestão do Atendimento.

`bundle/portal.js:109318` (`ApplicationTeamService`):

```js
// grava a lista inteira de permissões de VÁRIOS usuários de uma vez
async setApplicationPermissions(botShortName, irisPermissions) {
  const delegation = await GetMessagingHubCommandWithDelegation();
  const uri = delegation
    ? `/applications/${bot}@msging.net/permissions?messagingHubCommandWithDelegation=${delegation}`
    : `/applications/${bot}@msging.net/permissions`;
  return sendCommand({
    to: "postmaster@portal.blip.ai", method: "set",
    type: "application/vnd.lime.collection+json",
    uri,
    resource: { itemType: "application/vnd.iris.portal.user-permission+json", items: irisPermissions }
  });
}

// grava UMA permissão de UM usuário
async setApplicationUserPermission(bot, email, { permissionId, actions }) {
  return sendCommand({
    to: "postmaster@portal.blip.ai", method: "set",
    type: "application/vnd.iris.portal.user-permission+json",
    uri: `/applications/${bot}@msging.net/users/${encodeURIComponent(encodeURIComponent(email)+"@blip.ai")}/permissions`,
    resource: { permissionId, actions }
  });
}

async deleteApplicationUserPermission(bot, email, permissionId) {
  // delete /applications/{bot}/users/{userIdentity}/permissions/{permissionId}
}
```

Leitura: `get /applications/{bot}@msging.net/permissions?$skip=&$take=9999`
(`bundle/portal.js:90697`) e `get /applications/{bot}/users/{identity}/permissions`
(`bundle/portal.js:109257`).

**Item `user-permission+json`** (`bundle/portal.js:109386`, classe construída por
`fromMessagingHubPermission`):

```jsonc
{
  "permissionId": "desk-slaPolicy",          // o "id" do catálogo, string
  "actions": ["read", "write"],              // [] | ["read"] | ["read","write"] | ["none"]
  "userIdentity": "email%40dominio.com@blip.ai"
}
```

Conversão bidirecional (`bundle/portal.js:109276` e `:109386`):

```js
getPermissionAction(actions) {          // actions → bitmask
  let n = 0;
  if (actions.includes("read"))  n += 1;
  if (actions.includes("write")) n += 2;
  return n;                              // 0 = sem permissão, 1 = ver, 3 = ver e editar
}
fromMessagingHubPermission(p, userIdentity, deskGranularityEnabled) {
  const actions = [];
  if (p.permissionAction & 1) actions.push("read");
  if (p.permissionAction & 2) actions.push("write");
  // só para os filhos de "desk", quando a granularidade está ligada:
  if (deskGranularityEnabled && p.parent != null && actions.length === 0) actions.push("none");
  return { permissionId: p.id, actions, userIdentity };
}
```

`permissionAction` é uma **máscara de bits**: `0` = sem permissão, `1` = read, `3` = read+write.
`2` (write sem read) existe na matemática mas a UI nunca produz.

**Catálogo completo de claims** — está embutido como JSON no bundle,
`bundle/portal.js:114067` (módulo `114067`, um `JSON.parse` de string). São 33 entradas:

| `id` (permissionId) | `claim` | Rótulo pt-BR | `parent` |
|---|---|---|---|
| `payments` | 101 | Integrações | — |
| `ai-providers` | 102 | Provedores de IA | — |
| `ai-model` | 103 | Modelo de IA | — |
| `ai-enhancement` | 104 | Aprimoramento | — |
| `channels` | 105 | Canais | — |
| **`desk`** | **106** | **Atendimento** | — |
| `desk-channels` | 10601 | Canais de atendimento | `desk` |
| `desk-monitoring` | 10602 | Monitoramento | `desk` |
| `desk-metadataManagement` | 10603 | Gestão de metadados | `desk` |
| `desk-report` | 10604 | Relatório de atendimento | `desk` |
| `desk-surveyDashboard` | 10605 | Relatório de satisfação | `desk` |
| `desk-qualityAssurance` | 10606 | Relatório do Score | `desk` |
| `desk-ticketHistory` | 10607 | Histórico | `desk` |
| `desk-salesDashboard` | 10608 | Relatório de vendas | `desk` |
| `desk-callsDashboard` | 10609 | Relatório do Calls | `desk` |
| `desk-attendanceHours` | 10610 | Regras de horários | `desk` |
| `desk-slaPolicy` | 10611 | Regras de SLA | `desk` |
| `desk-quickReplies` | 10612 | Respostas prontas | `desk` |
| `desk-messageTemplate` | 10613 | Modelos de mensagens | `desk` |
| `desk-queueManagement` | 10614 | Filas de atendimento | `desk` |
| `desk-attendants` | 10615 | Gestão de atendentes | `desk` |
| `desk-personalizedBreaks` | 10616 | Pausas personalizadas | `desk` |
| `desk-attendanceRules` | 10617 | Regras de atendimento | `desk` |
| `desk-leadScore` | 10618 | Lead Score | `desk` |
| `desk-blipCopilotMfe` | 10619 | Blip Copilot | `desk` |
| `desk-generalSettings` | 10620 | Configurações gerais | `desk` |
| `users` | 107 | Usuários do bot | — |
| `scheduler` | 108 | Growth | — |
| `config-basicConfigurations` | 109 | Configurações básicas | — |
| `config-connectionInformation` | 110 | Informações de conexões | — |
| `resources` | 111 | Recursos | — |
| **`team`** | **112** | **Equipe** | — |
| `logMessages` | 113 | Log de mensagens | — |
| `builder` | 114 | Builder | — |
| `analysis` | 115 | Análise | — |

Observações que importam:

- **A chave do objeto (`deskSlaPolicyPage`, `deskMonitoringPage`, …) é exatamente o que o Desk MFE
  lê** como `desk{PageName}Page` (`mfe/main.js:22474`). Ou seja: o portal grava por `id`
  (`desk-slaPolicy`), e a projeção que chega ao MFE vem chaveada pelo nome da entrada
  (`deskSlaPolicyPage`) com valor `None`/`Read`/`Write`.
- `hideInTemplate` esconde a claim conforme o template do bot
  (`operator`, `master`, `faq`, `faq2`). Todo o bloco `desk` some em bots `faq`, `faq2`,
  `operator` e `master`.
- Existem agrupamentos visuais (`bundle/portal.js:214675`): claims 102/103/104/117 caem sob "ia" e
  109/110 sob "configurations".
- A granularidade do Desk (as 21 sub-claims `10601`–`10620`) está atrás da feature toggle
  `isAttendancePermissionsGranularityEnabled`. Com ela desligada existe só a claim `desk` (106).

**Herança pai/filho** (`bundle/portal.js:214660`, `updateCorrelationPermissions`):

```js
// mexer no PAI ("desk") propaga o mesmo permissionAction para todos os filhos
// mexer num FILHO acima do pai eleva o pai ao mesmo nível
// zerar TODOS os filhos zera o pai
```
Texto do produto na tela: *"Aplique uma permissão única aos menus abaixo. Novos menus herdarão essa
permissão."*

#### (b) Permissões do agente no Desk — `postmaster@desk.msging.net`

É o **outro** conjunto: as 17 flags de `AgentPermission` que o Desk lê como
`ownerpermissioncache+json`. Quem grava é a tela de Atendentes do MFE
(`mfe/main.js:68619`), já documentada em §6.3:

```js
set /agent/permissions
    to:   postmaster@desk.msging.net
    type: "application/vnd.lime.collection+json"
    resource: {
      itemType: "application/vnd.iris.desk.agentspermissions+json",
      items: [ { agents: ["email%40dom.com@blip.ai", ...],       // vários agentes de uma vez
                 permissions: [ { ownerIdentity: "{bot}@msging.net",
                                  name: "canSendActiveMessage",  // enum AgentPermission
                                  isActive: true } ] } ]
    }
get /agent/{identity}/permission
```

Cada chamada grava **uma** flag para **N** agentes (a UI é um switch por linha,
`mfe/main.js:29726`). Não há gravação em lote de várias flags.

**Este é o `set` correspondente ao `GET /agent/permissions/all` do Desk.** O `all` é a projeção
cacheada de todos os bots; o `set` acima é por bot (`ownerIdentity` no item).

#### (c) Existe "papel" acima das flags?

**No Desk, não.** As 17 flags são independentes, sem perfil agregador.

**No portal por bot, sim — mas é um preset de UI, não um papel persistido.** A tela "Adicionar
membro" tem um slider de 4 posições (`bundle/portal.js:214229`):

| Posição | `permissionCode` | Rótulo pt-BR | O que grava |
|---|---|---|---|
| 1ª | `1` | Visualizar | todas as claims (menos `team`) com `permissionAction = 1` |
| 2ª | `0` | Customizado | abre a tela de edição claim a claim |
| 3ª | `3` | Visualizar e editar | todas as claims (menos `team`) com `3` |
| 4ª | `4` | Admin | todas as claims com `3` **incluindo `team`** |

`bundle/portal.js:214379`:

```js
const action = Math.min(permissionCode, 3);
if (action) {
  if (permissionCode === 4)                       // Admin: acrescenta a claim "team"
    permissions.push({ ...catalog.team, permissionAction: action });
  permissions.push(...Object.keys(catalog)
      .filter(k => k !== "team" && !hiddenForTemplate(k))
      .map(k => ({ ...catalog[k], permissionAction: action })));
}
```

E a leitura reconstrói o rótulo (`bundle/portal.js:214627`, `setSelect`/`checkSelect`):

```
todas as claims === 3            → "admin"
todas (exceto team) === 0        → "none"      ("Sem permissão")
todas (exceto team) === 1        → "read"      ("Visualizar")
todas (exceto team) === 3        → "readWrite" ("Ver e editar")
qualquer outra combinação        → "custom"    ("Customizado")
```

**O que separa "Admin" de "Ver e editar" no bot é exatamente uma claim: `team` (112, "Equipe").**
Quem tem `team` com write gerencia os membros daquele chatbot. Nada mais.

Textos de cada nível (i18n, pt-BR):
- `none` — "O usuário não vê este menu nem acessa seu conteúdo."
- `read` — "O usuário consegue visualizar as informações, mas não pode fazer alterações."
- `readWrite` — "O usuário pode visualizar e também alterar as informações desta página."

### 8.5 Vínculo usuário × tenant × bot × fila

**Pessoa → contrato:** `set /tenants/{tenantId}/users` (§8.3). Também
`set /tenants/{id}/tenant-user-external-login` (`type: text/plain`) libera login externo/SSO para os
usuários do contrato (`bundle/portal.js:221871`).

**Pessoa → bot:** dois comandos, nesta ordem (`bundle/portal.js:214289`):

```js
setApplicationUser(bot, email, tenantId) {
  return sendCommand({
    to: "postmaster@portal.blip.ai", method: "set",
    type: "application/vnd.lime.identity",                    // o recurso é a identidade crua
    uri: `/applications/${encodeURIComponent(bot+"@msging.net")}/users${tenantId ? `?tenantId=${tenantId}` : ""}`,
    resource: `${encodeURIComponent(email)}@blip.ai`
  });
}
// depois: setApplicationPermissions(bot, [...])
```

Há um `getOrCreateApplicationUser` (`bundle/portal.js:109285`) que tenta `get` e, no erro
67 + `"The requested resource was not found"`, faz o `set`.

**Remoção do bot** (`bundle/portal.js:109303`):

```js
delete /applications/{bot}/users/{userIdentity}
       [ ?messagingHubCommandWithDelegation={valor} ]
```
Confirmação na UI: *"Deseja realmente remover {email} do seu chatbot?"*. Trava:
`get /applications/{bot}@msging.net/islastadmin` (`bundle/portal.js:90824`) devolve a **string**
`"True"` quando o usuário é o último admin do bot — o portal então bloqueia a saída e manda para a
tela de Equipe (`bundle/portal.js:270666`).

**Pessoa → fila (team do Desk):** não existe endpoint de vínculo. Reescreve-se o array `teams` do
próprio atendente e manda a coleção inteira (§6.2):

```js
set /attendants   type: application/vnd.lime.collection+json
    items: [ { identity, teams: ["Default","Vendas"], agentSlots, isEnabled } ]
```

**Bot → contrato:** `set /tenants/{tenantId}/applications` com
`type: "application/vnd.lime.identity"` e recurso `"{bot}@msging.net"`; em lote,
`/tenants/{id}/applications` (ou `/applications-contract-admin`) com coleção de identidades
(`bundle/portal.js:221831`). Validação prévia:
`get /tenants/{id}/validate-applications?applications={lista}` devolve os bots **inválidos** para
mover. Migração de filas: `set /queue-migration/tenants/{id}/queue[?originTenantId=]`.

### 8.6 Plano e limite de usuários

Não há quota numérica no front. O que existe é um **gate por tipo de plano**
(`bundle/portal.js:221934`):

```js
async isBillablePlan(tenantId) {
  const metrics = await sendCommand({ to: "postmaster@billing.blip.ai",
                                      uri: `/tenants/${tenantId}/subscription/plan/metrics` });
  return metrics?.items.some(m => m.metricId === "Agent");
}
checkIfBillableContract() → isBillablePlan(tenantIdDaUrl)
```

Se o plano tem a métrica **`Agent`** (contrato "novo", cobrado por atendente), a tela de Atendentes
do Desk muda de comportamento (`bundle/portal.js:236289` e o template em `:1689`):

- o campo de e-mail livre (`bds-input-chips#chips-emails`) **some** e vira um select
  (`bds-select-chips#chips-emails-contract`) alimentado por
  `get /tenants/{id}/agents?skip=0&$take=999` (`bundle/portal.js:237720`);
- aviso para admin: *"Abaixo estão listados os atendentes cadastrados no contrato. Caso o atendente
  que procura não esteja na lista, verifique sua disponibilidade na página de **atendentes do
  contrato**"* (link para `/application/tenant/agent`);
- aviso para não-admin: *"…entre em contato com um administrador do contrato."*;
- atendentes com `isEnabled === false` ganham um chip "Desabilitado" com tooltip *"Esta configuração
  é feita no painel do contrato"*.

Ou seja: **em plano cobrado por atendente, a Gestão do bot não cria atendente — ela só escolhe entre
os que o admin do contrato já licenciou.** O licenciamento é (`bundle/portal.js:221977`):

```js
saveAgents(emails, tenantId) {
  const items = emails.map(email => ({ tenantId, userIdentity: `${encodeURIComponent(email)}@blip.ai` }));
  return sendCommand({ method:"set", to:"postmaster@portal.blip.ai",
    uri: `/tenants/${tenantId}/agents`,
    type: "application/vnd.lime.collection+json",
    resource: { items, itemType: "application/vnd.iris.portal.tenant-agent-user+json", total: items.length } });
}
```

Aviso do produto depois de licenciar: *"Para iniciar a operação você precisa associar estes
atendentes a uma fila de atendimento."*

Outros contadores disponíveis: `get /applications/{bot}@msging.net/users/accounts/total`
(`bundle/portal.js:222026`) e o plano em si
(`get /tenants/{id}/subscription` → `get /plans?$filter=Id eq '{planId}'`,
`bundle/portal.js:21597`). Nome do plano é normalizado para minúsculas com default `"standard"`, e
`"partner"` vira `"business"` (`bundle/portal.js:221954`).

### 8.7 O dono

**Não existe "dono do tenant" gravável pelo portal.** O objeto de tenant que o portal escreve
(`bundle/portal.js:221636`) é magro:

```js
set /tenants/{id}        type: application/vnd.iris.portal.tenant+json   resource: tenant
set /tenant/create       type: application/vnd.iris.portal.tenant+json   resource: tenant
set /tenants/{id}/default-contract
```

O tenant pessoal é criado com só dois campos (`bundle/portal.js:221885`):

```js
const { id, name } = await getValidId(me.email, me.fullName);   // get /tenant-valid-id?email=&name=
await this.set({ id, name });
await this.setTenantUserDefaultContract({ id, name });
```

O `ownerIdentity` que aparece na **leitura** do tenant (documentado em
`blip-identidade-tenant-permissao.md`) **não é escrito em lugar nenhum do bundle**, e não há
comando de transferência de propriedade. Na prática, o papel que manda é `roleId === "admin"`, e
**pode haver vários admins** — nada no código limita a um.

**"Dono" existe, sim, mas do BOT.** O objeto de application tem `emailOwner`, usado no alerta de
acesso negado (`bundle/portal.js:77264`, i18n): *"Você precisa de um convite para acessar o chatbot
**{applicationShortName}**. Entre em contato com o administrador(a) pelo e-mail **{emailOwner}** e
solicite seu acesso."* A tela de Equipe rotula essa pessoa como **"Dono do bot"** (`botOwner`).
Também não há comando de transferência de `emailOwner` no bundle.

O que o portal trata como "só o último não pode sair" é o **admin do bot**, via
`/applications/{bot}/islastadmin` (§8.5) — não o dono.

### 8.8 Auditoria

**Não existe tela de auditoria/histórico de permissão no portal.** Nenhum endpoint de log,
nenhuma listagem de "quem alterou o quê". O que existe é infraestrutura de rastro:

1. **Metadados injetados em TODO comando** (`bundle/portal.js:127744`, `MessagingHubService` e
   `BlipService`):

```js
injectAuthenticationMetadata(cmd) {
  cmd.metadata["blip_portal.email"] = AuthenticationService.email;    // quem está agindo
}
injectSaveCommandMetadata(cmd) {
  if (["set","delete","merge"].includes(cmd.method))
    cmd.metadata["server.shouldStore"] = "true";                       // o servidor persiste o comando
}
injectSentryTraceMetadata(cmd) { cmd.metadata["sentry-trace"] = ...; }
```

Ou seja: **toda escrita sai carimbada com o e-mail de quem a fez e com ordem de persistir.** O
histórico existe do lado do servidor (é o que alimenta a "Central de comandos"/log de comandos do
Blip), mas o portal não o expõe nestas telas.

2. **Metadata `#audit.*` explícita** existe, mas só num módulo (FAQ/talkservice,
   `bundle/portal.js:283554`):

```js
metadata: { "#audit.id": referenceName, "#audit.identity": auth.email }
```
Nenhuma escrita de usuário ou permissão usa esse par.

3. **Eventos de produto (Segment)** — analytics, não auditoria, e não consultável pelo cliente:

```
invite-member, team-opened, team-member-searched, team-member-opened,
team-member-invited, team-member-deleted,
initial-setup-members-add-guest / -remove-guest / -skip / -skip-confirm / -send-invites,
portal-leave-project-only-admin-go-to-team, portal-cancel-leave-project-only-admin
```

### 8.9 Resumo dos comandos desta seção

| Ação | Comando |
|---|---|
| Convidar N pessoas ao contrato | `set postmaster@portal.blip.ai /tenants/{id}/users` · coleção de `tenant-user+json` · item `{tenantId, userIdentity, roleId}` |
| Entrar num contrato (auto) | `set /tenants/{id}/users` · `tenant-user+json` · `{tenantId, userIdentity}` |
| Aceitar convite | `set /tenants/{id}/users/{identity}/user-status` · `application/vnd.iris.portal.tenant-user-status` · `"accepted"` |
| Ler membros do contrato | `get /tenants/{id}/users` · `get /tenants/{id}/users/{identity}` · `get /tenant-users-mine` · `get /tenants-mine` |
| Licenciar atendentes (plano pago) | `set /tenants/{id}/agents` · coleção de `tenant-agent-user+json` |
| Ler atendentes licenciados | `get /tenants/{id}/agents?skip=0&$take=999` |
| Adicionar pessoa a um bot | `set /applications/{bot}/users[?tenantId=]` · `application/vnd.lime.identity` · `"{email}@blip.ai"` |
| Remover pessoa de um bot | `delete /applications/{bot}/users/{identity}` |
| Gravar permissões (lote) | `set /applications/{bot}@msging.net/permissions` · coleção de `user-permission+json` |
| Gravar 1 permissão | `set /applications/{bot}/users/{identity}/permissions` · `user-permission+json` · `{permissionId, actions}` |
| Apagar 1 permissão | `delete /applications/{bot}/users/{identity}/permissions/{permissionId}` |
| Ler permissões do bot | `get /applications/{bot}@msging.net/permissions?$skip=&$take=9999` |
| Ler permissões de 1 usuário | `get /applications/{bot}/users/{identity}/permissions` |
| Último admin do bot? | `get /applications/{bot}@msging.net/islastadmin` → `"True"`/`"False"` |
| Flags do agente no Desk | `set postmaster@desk.msging.net /agent/permissions` · coleção de `agentspermissions+json` |
| Vincular agente a fila | `set postmaster@desk.msging.net /attendants` · coleção de `attendant+json` (reescreve `teams`) |
| Convidar via MFE | `set postmaster@portal.blip.ai /auth-permissions` · `application/vnd.iris.portal.guest-user+json` |
| Vincular bot ao contrato | `set /tenants/{id}/applications` · `application/vnd.lime.identity` |
| Plano/cobrança | `get postmaster@billing.blip.ai /tenants/{id}/subscription/plan/metrics` |

---

## 9. O QUE NÃO FOI ENCONTRADO (dito claramente)

1. **Ordem de avaliação das regras de atendimento.** Não existe campo de ordem/prioridade na regra
   nem UI de reordenação. A decisão é do servidor e não é observável pelo front.
2. **Quem grava `DistributionType`** (`Orleans`/`Redis`). O portal só lê. Deve ser provisionamento
   interno da Blip.
3. **Fuso horário do horário de atendimento.** Não há seletor na tela. Só existe
   `builder:#localTimeZone` no nível do bot/Builder; a ligação com a avaliação do horário é
   plausível mas **não comprovada**.
4. **Regra de cálculo de violação de SLA.** O front só lê as flags `hasQueueTimeExceeded`,
   `hasFirstResponseTimeExceeded`, `hasAttendanceTimeExceeded` já prontas do servidor.
5. **Como um ticket chega a `TicketUrgency.Maximum` (4000).** O formulário de priorização só
   oferece até `High` (3000). Suspeita: `ActiveMessageTicketPriorityEnabled` — não confirmado.
6. **Schema/valores aceitos de `ActiveMessageSearchSource`, `ActiveMessageContactFieldsSearch`,
   `LeadScoreConfiguration`, `SalesDashboardConfiguration`, `Plugins`.** São strings/JSON opacos no
   bundle; o formato interno teria que vir de uma chamada real.
7. **`dayOfWeek`: número (portal legado) vs. nome (MFE).** Divergência real entre os dois fronts;
   qual é o formato canônico da API precisa ser confirmado com uma chamada.
8. **Limites do servidor** (máximo de filas, de condições por regra, de turnos por dia, faixa de
   `timeMinutes` da pausa). O cliente não impõe nenhum; se existem, são do servidor.
9. **Validação de nome duplicado de fila e de pausa é só no cliente.** Nada garante que o servidor
   rejeite — corrida entre duas abas grava duplicata.

Sobre usuários e permissões (§8), especificamente:

10. **Prazo de expiração do convite.** Nenhuma menção a validade, dias ou expiração em nenhum dos
    bundles nem no i18n. Se existe, é regra do servidor.
11. **Comandos de reenviar e cancelar convite.** Os textos existem no i18n (`resentInvite`,
    "Cancelar convites", "Quer mesmo cancelar esses convites?") mas os comandos **não estão em
    `portal.js`** — a tela de Membros do contrato provavelmente é um micro-frontend que não foi
    capturado nestes zips (só o módulo Atendimento foi).
12. **Comando de remover pessoa do contrato / trocar o `roleId` de um membro existente.** Só achei
    `set /tenants/{id}/users` (convite) e o `user-status`. Remoção e mudança de papel devem estar na
    mesma tela não capturada. O texto "Você não faz mais parte daquele contrato" confirma que a
    remoção existe.
13. **Payload do `guest-user+json`** (`set /auth-permissions`, `bundle/portal.js:21647`). O objeto
    chega pronto de um micro-frontend por `postMessage` (`InviteUser`); o formato dos campos não
    aparece no bundle do portal.
14. **`PendingTenant` e `Rejected`** aparecem no enum mas não têm nenhum uso no bundle capturado.
    Só `PendingUser` → `"accepted"` é exercitado.
15. **Transferência de dono** — nem do tenant (`ownerIdentity` nunca é escrito), nem do bot
    (`emailOwner` nunca é escrito). Se é possível, é por outro canal.
16. **Quota numérica de usuários por plano.** O front só distingue "plano com métrica `Agent`" de
    "plano sem". O número contratado, se existe, é validado no servidor.
17. **Tela de auditoria de permissão.** Não existe. Há apenas o carimbo
    `blip_portal.email` + `server.shouldStore` em toda escrita (§8.8) — o rastro fica no servidor,
    fora do alcance destas telas.

---

## 10. Como reproduzir

```bash
# não altera os originais em Downloads
mkdir -p ~/desk-clone/capturas/portal-gestao
cd ~/desk-clone/capturas/portal-gestao
unzip -o -j "/c/Users/anderson.linhares/Downloads/blip/supernova.blip.ai (12).zip" \
      "supernova.blip.ai/portal.js" "supernova.blip.ai/settings.json" -d bundle
unzip -o -j "/c/Users/anderson.linhares/Downloads/blip/supernova.blip.ai (11).zip" \
      "portalmfe.blip.ai/beagle/portal-fragment-desk-mfe/latest/main.js" -d mfe
# i18n do portal legado (pt/en/es) — de onde saem as regras em texto da §8
unzip -o -j "/c/Users/anderson.linhares/Downloads/blip/supernova.blip.ai (12).zip" \
      "supernova.blip.ai/vendor-app_modules_translate_translationLoaders_sync_recursive_js_.72f884b49ebf5fef.js" -d i18n
```

Não extraia o zip inteiro: há entradas com nome longo demais para o Windows
(contextos do LaunchDarkly em base64 no nome do arquivo) e uma colisão de nome em
`unpkg.com/blip-chat-widget@1.11.0` (é arquivo e diretório ao mesmo tempo).
Extraia só os arquivos de que precisa, com `-j`.

Buscas úteis depois de extrair:

```bash
# todos os MIME types do produto
grep -oE 'application/vnd\.iris\.[a-z0-9._-]+\+json' bundle/portal.js | sort -u
# todos os enums do MFE
grep -nE 'return e\.[A-Za-z]+ = ' mfe/main.js
# todas as URIs LIME
grep -oE 'uri: ["`][^"`]+' bundle/portal.js | sort -u
# catálogo de permissões de portal (JSON inteiro, uma linha só)
sed -n '114067p' bundle/portal.js
# textos de regra em pt-BR (cuidado: o arquivo é uma linha gigante, use grep -o, nunca sed -n)
grep -oE '"inviteMemberModal":\{.{0,2200}' i18n/vendor-*.js
```

Armadilha do i18n: o chunk é **uma linha só de 1,7 MB**. `sed -n 'N,Mp'` devolve o arquivo inteiro
e estoura qualquer buffer. Use sempre `grep -o -E` com janela limitada.

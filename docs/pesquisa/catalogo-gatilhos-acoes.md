# Catálogo de gatilhos e ações do builder do Pipe

> **O que este documento é.** A lista de peças que a empresa cliente pode encaixar no builder do
> Pipe, e — mais importante — **o texto que a IA do Pipe vai ler para escolher a peça certa** quando
> alguém pedir "monte um fluxo que qualifica lead e joga no CRM". Cada descrição é escrita para ser
> lida por um modelo, não por um humano: diz o que a peça faz, quando ela serve, e qual a armadilha.
>
> Nasce do cruzamento de duas implementações reais: o **motor de workflow do Twenty** (lido no
> código-fonte) e o **motor de fluxo da Blip** (lido no SDK C# e na documentação oficial).
>
> **Procedência.** Toda afirmação carrega marca. Não misture os níveis:
>
> | Marca | Origem |
> |---|---|
> | `[TW-CÓDIGO]` | arquivo lido em `twentyhq/twenty@main`, clone raso de 2026-09-09 |
> | `[BLIP-SDK]` | código-fonte de `takenet/blip-sdk-csharp@master`, `src/Take.Blip.Builder/` |
> | `[BLIP-DOC]` | `docs.blip.ai` / `help.blip.ai` |
> | `[PIPE]` | já existe no schema do Pipe (`packages/db/src/schema/`) |
> | `[DECISÃO]` | escolha de desenho deste documento — não é fato observado |
> | `[INFER]` | dedução; **verificar antes de usar** |
>
> Complementa, sem repetir: `twenty.md`, `blip-api-schemas.md`, `blip-desk-regras-tecnicas.md`,
> `blip-gestao-regras-tecnicas.md`, `chatwoot.md`.

---

## 0. Os dois motores do Pipe, e por que a distinção não é acadêmica

`[PIPE]` `packages/db/src/schema/automacao.ts` já separa duas máquinas, e o comentário de topo do
arquivo diz por quê ("três peças distintas que costumam ser confundidas").

| | Motor de **conversa** (`fluxo`) | Motor de **sistema** (`workflow`) |
|---|---|---|
| Tabelas | `fluxo` → `fluxo_versao` → `bloco` + `transicao`; execução em `execucao_fluxo` / `execucao_passo` | `workflow` → `gatilho` + `acao`; execução em `execucao_workflow` / `execucao_acao` |
| Quem dispara | uma mensagem de um contato num canal | um evento do sistema, um relógio, um webhook ou um clique |
| Tem interlocutor? | **sim** — existe uma `conversa` e alguém do outro lado esperando | **não** — roda sozinho, ninguém esperando |
| Pode esperar? | sim, é a natureza dele (`estado = 'aguardando'`, `bloco.tipo = 'pergunta'`) | só por tempo (`aguardar`), nunca por resposta humana no meio de conversa |
| Grafo | `transicao(de_bloco, para_bloco, condicao, ordem)` — grafo dirigido, condição na aresta | `acao.ordem` — **hoje é lista linear, não grafo** (§6, lacuna 1) |
| Equivalente Blip | Builder (`Flow`/`State`/`Output`) | **não existe** — a Blip não tem automação sem conversa |
| Equivalente Twenty | **não existe** — o Twenty não tem conversa | `Workflow`/`WorkflowVersion`/`WorkflowRun` |

**Consequência para a IA.** "Quando o lead entrar com score acima de 70, mande para a fila Comercial"
é **workflow**. "Pergunte o CNPJ e depois transfira" é **fluxo**. A IA precisa acertar o motor antes
de escolher a peça — por isso `motor` é a primeira coluna de cada tabela deste catálogo.

**Peças que valem nos dois** existem (`chamar_http`, `executar_script`, `condicao`,
`definir_variavel`) e são exatamente as que devem ter **implementação única** compartilhada pelos dois
executores. Onde a implementação diverge, diverge o nome — nunca o contrário.

---

## 1. Referência A — o motor de workflow do Twenty, lido no código

Tudo nesta seção é `[TW-CÓDIGO]`, do clone raso de `github.com/twentyhq/twenty@main` de 2026-09-09.
Onde `twenty.md` §4 dizia "~15 tipos de ação", aqui está a lista fechada, com os campos.

### 1.1 A estrutura

`packages/twenty-server/src/modules/workflow/common/standard-objects/workflow-version.workspace-entity.ts`:

```ts
name: string | null;
trigger: WorkflowTrigger | null;   // UM gatilho por versão
steps: WorkflowAction[] | null;    // array PLANO de steps
```

Três entidades: `workflow` (container), `workflowVersion` (conteúdo versionado — status `DRAFT`,
`ACTIVE`, `DEACTIVATED`, `ARCHIVED`), `workflowRun` (execução).

**O grafo não é uma tabela de arestas: é `nextStepIds` dentro de cada passo.**
`packages/twenty-shared/src/workflow/schemas/base-workflow-action-schema.ts`:

```ts
id: z.uuid(),                                          // UUID, único no workflow
name: z.string(),
valid: z.boolean(),                                    // o builder marca se a config está completa
nextStepIds: z.array(z.uuid()).optional().nullable(),  // vazio/null = último passo
position: { x: number, y: number },
```

O gatilho tem o **mesmo** campo `nextStepIds` (`base-trigger-schema.ts`) — é o nó de entrada do
grafo, e nas ferramentas de IA é endereçado pelo id literal `"trigger"`.

É um grafo dirigido com múltiplas saídas **e múltiplas entradas** por nó (`findParentSteps` existe e é
usado no controle de execução). Não é uma lista.

### 1.2 Gatilhos — os quatro, com os campos reais

Enum em `base-trigger-schema.ts`: `'DATABASE_EVENT' | 'MANUAL' | 'CRON' | 'WEBHOOK'`.

| Tipo | `settings` |
|---|---|
| `DATABASE_EVENT` | `eventName` — **regex imposta**: `/^[a-z][a-zA-Z0-9_]*\.(created\|updated\|deleted\|upserted)$/`. Mais `objectType?`, `fields?: string[]` (quais campos observar num `updated`), `filter?: {stepFilterGroups, stepFilters}` — a doc do schema diz: *"o workflow só roda quando o registro casa; eventos que não casam são descartados **antes** de criar um run"*. O registro fica em `{{trigger.object.<campo>}}` |
| `MANUAL` | `availability` (união discriminada): `GLOBAL` (com `locations[]`), `SINGLE_RECORD` (`objectNameSingular`), `BULK_RECORDS` (`objectNameSingular`). Mais `icon?`, `isPinned?`. Havendo registro selecionado ele fica em `{{trigger.record.<campo>}}`; **sem registro selecionado não há dado nenhum no contexto** |
| `CRON` | união discriminada por `type`: `MINUTES` (`schedule.minute` 1..60), `HOURS` (`schedule.hour` ≥1, `.minute` 0..59), `DAYS` (`schedule.day` ≥1, `.hour`, `.minute`), `CUSTOM` (`pattern`, cron string livre) |
| `WEBHOOK` | união discriminada por `httpMethod`: `GET` → `{authentication: 'API_KEY' \| null}`; `POST` → `+ expectedBody`, `expectedOutputSchema?`. **A única autenticação é `API_KEY` — não há HMAC** |

**Não existe** gatilho de mensagem recebida, de conversa criada, de SLA estourado, nem evento
`restored`. O Twenty não tem conversa; a lacuna é estrutural, não esquecimento.

### 1.3 Ações — os 19 tipos, com `settings.input`

`packages/twenty-shared/src/workflow/types/WorkflowActionType.ts` (enum fechado) +
`schemas/*-action-settings-schema.ts`. Todas herdam de `baseWorkflowActionSettingsSchema`.

| `type` | `settings.input` |
|---|---|
| `CREATE_RECORD` | `objectName` (minúsculo, singular), `objectRecord` (objeto livre; relação via `{"company":{"id":"{{...}}"}}`) |
| `UPDATE_RECORD` | `objectName`, `objectRecordId`, `objectRecord`, **`fieldsToUpdate: string[]`** — a lista branca de campos que serão de fato gravados |
| `UPSERT_RECORD` | `objectName`, `objectRecord` |
| `DELETE_RECORD` | `objectName`, `objectRecordId` |
| `FIND_RECORDS` | `objectName`, `limit?`, `offset?`, `filter?{recordFilterGroups, recordFilters}`, `orderBy?{recordSorts, gqlOperationOrderBy}`. Saída: `{{<id>.all}}` e `{{<id>.first.id}}` |
| `PICK_RECORD` | `objectName`, `recordIds: string[]`, `strategy: 'RANDOM'\|'ROUND_ROBIN'\|'LOAD_BALANCED'`, `loadBalance?{objectNameSingular, fieldName}` — **obrigatório** quando `LOAD_BALANCED` (há `superRefine` que rejeita sem ele) |
| `SEND_EMAIL` | `connectedAccountId`, `fromHandle?`, `recipients{to,cc,bcc}` (strings), `subject?`, `body?`, `files[]`, `inReplyTo?` |
| `DRAFT_EMAIL` | idem, mas grava rascunho em vez de enviar |
| `CREATE_CALENDAR_EVENT` | `connectedAccountId`, `title`, `description?`, `location?`, `startsAt`, `endsAt`, `isFullDay`, `timeZone?`, `attendees`, `sendInvitations`, `addConferencing` |
| `HTTP_REQUEST` | `url`, `method: GET\|POST\|PUT\|PATCH\|DELETE`, `headers?: Record<string,string>`, `body?` (objeto ou string), `expectedOutputSchema?` |
| `CODE` | `logicFunctionId` (**gerado pelo servidor — a descrição da ferramenta manda não preencher à mão**), `logicFunctionInput: Record<string,any>` |
| `LOGIC_FUNCTION` | mesmos campos do `CODE`; é a função nomeada reutilizável |
| `AI_AGENT` | **só dois campos**: `agentId?`, `prompt?`. Modelo, ferramentas e system prompt vivem no agente (`AgentEntity`), não no passo |
| `FILTER` | `stepFilterGroups[]`, `stepFilters[]`. **Não casou → `shouldEndWorkflowRun: true`** — encerra o run inteiro, não só o ramo |
| `IF_ELSE` | `stepFilterGroups[]`, `stepFilters[]`, `branches[]: {id, nextStepIds[], filterGroupId?}`; ramo sem `filterGroupId` é o "senão" |
| `ITERATOR` | `items` (array **ou** string de variável), `initialLoopStepIds[]`, `shouldContinueOnIterationFailure?`. Item corrente em `{{<id>.currentItem}}` |
| `DELAY` | `delayType: 'SCHEDULED_DATE'\|'DURATION'`, `scheduledDateTime?`, `duration?{days,hours,minutes,seconds}` |
| `FORM` | **`input` é um array**, não objeto: `{id, name, label, type, placeholder?, settings?, value?}[]`, com `type ∈ {TEXT, NUMBER, DATE, SELECT, MULTI_SELECT, 'RECORD'}`. Pausa o run esperando um humano preencher |
| `EMPTY` | `input: {}`. Placeholder do builder |

### 1.4 Variáveis — a sintaxe, e o que ela NÃO faz

`packages/twenty-shared/src/utils/variable-resolver.ts`:

```ts
const VARIABLE_PATTERN = RegExp('\\{\\{([^{}]+)\\}\\}', 'g');
```

- `{{<stepId>.caminho}}` — **`stepId` é o UUID do passo, não o nome**. Dito com todas as letras na
  descrição da ferramenta de IA: *"step-id is the step's UUID, not its name"*.
- `{{trigger.object.<campo>}}` no `DATABASE_EVENT`; `{{trigger.record.<campo>}}` no `MANUAL`.
- **Não há wrapper `result`**: é `{{<id>.all}}`, não `{{<id>.result.all}}`.
- Se a string é **só** a variável, devolve o valor **com o tipo original** (número continua número).
  Se está no meio de um texto, tudo vira string e objeto vira `JSON.stringify`.
- Resolve recursivamente em array, em objeto — **e na chave do objeto**.
- A resolução é `evalFromContext`. **Não existe catálogo de funções ou filtros**: nada de
  `{{x | upper}}`, nada de formatação de data, nada de aritmética declarada. Cálculo é `CODE`.

### 1.5 Erro e retry — o que existe de verdade

`base-workflow-action-settings-schema.ts`:

```ts
errorHandlingOptions: {
  retryOnFailure: { value: number },   // 0..3 — 0 desliga
  continueOnFailure: { value: boolean },
}
```

- `STEP_RETRY_DELAYS_MS = [1000, 5000, 15000]` — **backoff fixo de até três tentativas, não
  configurável**. `retryOnFailure.value` só escolhe quantas dessas três usar.
- `utils/step-should-continue-on-failure.util.ts`:
  `!isWorkflowIfElseAction(step) && ...continueOnFailure.value` — **`IF_ELSE` nunca continua em
  falha**, a opção é ignorada nele.
- `StepStatus`: `NOT_STARTED | RUNNING | SUCCESS | STOPPED | FAILED | FAILED_SAFELY | PENDING | SKIPPED`.
  `FAILED_SAFELY` = "falhou, mas `continueOnFailure` estava ligado". E `shouldFailSafely` **propaga**:
  filho de um passo que falhou-com-continuação também nasce `FAILED_SAFELY`.
- `WorkflowRunStatus`: `NOT_STARTED | RUNNING | COMPLETED | FAILED | ENQUEUED | STOPPING | STOPPED`.
- Cada passo guarda `{result, error, status, retryAttempt, history[]}` — **o histórico de tentativas
  fica no run**, que é exatamente o que a IA precisa para responder "por que esse fluxo falhou".
- **Não há timeout por passo** no schema do Twenty. A Blip tem (`Action.Timeout`, default 30 s).

### 1.6 Condições — o vocabulário de filtro

`step-filter-schema.ts` + `packages/twenty-shared/src/types/StepFilters.ts`:

```ts
StepFilter      = { id, type, stepOutputKey, operand, value, stepFilterGroupId,
                    positionInStepFilterGroup?, fieldMetadataId?,
                    compositeFieldSubFieldName?, isFullRecord? }
StepFilterGroup = { id, logicalOperator: 'AND'|'OR', parentStepFilterGroupId?,
                    positionInStepFilterGroup? }
```

Grupos aninháveis por `parentStepFilterGroupId` → dá para expressar `(A e B) ou C`.

Operandos (`ViewFilterOperand` — **os mesmos das views do CRM**, reuso deliberado):
`IS`, `IS_NOT`, `IS_NOT_NULL`, `IS_EMPTY`, `IS_NOT_EMPTY`, `CONTAINS`, `DOES_NOT_CONTAIN`,
`GREATER_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL`, `IS_BEFORE`, `IS_AFTER`, `IS_RELATIVE`,
`IS_IN_PAST`, `IS_IN_FUTURE`, `IS_TODAY`, `VECTOR_SEARCH`.

> Note o que **falta**: não há `>` nem `<` estritos, não há `STARTS_WITH`/`ENDS_WITH`, não há regex.
> A Blip tem os três. Ver §5.4.

### 1.7 O achado que muda o desenho do Pipe: o Twenty já expõe o motor para uma IA

`packages/twenty-server/src/modules/workflow/workflow-tools/tools/` — 22 ferramentas, entre elas
`create_complete_workflow`, `create_workflow_version_step`, `update_workflow_version_trigger`,
`create_workflow_version_edge`, `validate_workflow`, `compute_step_output_schema`,
`update_logic_function_source`, `update_agent`, `list_workflow_runs`, `get_workflow_run`.

A descrição de `create_complete_workflow` é um documento escrito **para o modelo**, e vale ler como
espelho do que este catálogo precisa ser. Metade do texto é erro comum:

> *"NEVER use `RECORD_CREATED` — this is invalid. Use `DATABASE_EVENT` instead."*
> *"Common mistakes to avoid: … Using `fieldsToUpdate` instead of `objectRecord` in CREATE_RECORD …"*
> *"Including CODE steps in this tool — this tool does NOT create the underlying logic function."*
> *"An ITERATOR with an empty loop body does not fail: it completes immediately and
> `{{<iterator-id>.currentItem}}` resolves to undefined for every step downstream."*

Quatro lições, adotadas aqui `[DECISÃO]`:

1. **Descrição de peça inclui o erro que a IA comete.** Não basta dizer o que a peça faz.
2. **Peça que depende de recurso lateral (função, agente) não se cria em bloco.** No Pipe, `funcao` e
   `agente_ia` exigem duas etapas: criar o recurso, depois apontar o passo para ele.
3. **Tem que existir `validar_fluxo` separado de `criar_fluxo`**, e a IA chama uma vez no fim — não a
   cada edição.
4. **Silêncio é pior que erro.** O iterador vazio que "completa e resolve `undefined`" é o tipo de
   comportamento que precisa estar escrito no catálogo, senão a IA monta e o cliente descobre em
   produção.

---

## 2. Referência B — as Actions do Builder da Blip

`[BLIP-SDK]` A lista de verdade não é a pasta, é o registro de DI em
`src/Take.Blip.Builder/Hosting/ContainerExtensions.cs` (`RegisterBuilderActions`), e ela bate 1-para-1
com as 19 pastas de `src/Take.Blip.Builder/Actions/`:

`ExecuteScript`, `ExecuteScriptV2`, `SendMessage`, `SendMessageFromHttp`, `SendRawMessage`,
`SendCommand`, `ProcessCommand`, `TrackEvent`, `ProcessHttp`, `ManageList`, `MergeContact`,
`SetVariable`, `SetBucket`, `Redirect`, `CreateTicket`, `DeleteVariable`, `ProcessContentAssistant`,
`TrackContactsJourney`, `ExecuteTemplate`.

**São exatamente 19 — não existe `Forward`, `ForwardToDesk`, `Subflow` nem `Stop` como Action.**
Essas quatro suspeitas foram verificadas no código e negadas: encaminhar é `Redirect`, atendimento
humano é `CreateTicket` + estado com id prefixado `desk:`, e subfluxo/parada são propriedades do
`State`/`Flow` (§2.3).

### 2.1 Mecânica comum

`[BLIP-SDK]` `ActionBase<TSettings>`: o `settings` (JObject) é desserializado no `TSettings` e
`Validate()` roda **antes** de executar; qualquer `ValidationException`/`ArgumentException` aborta.

**Cinco actions não herdam de `ActionBase` e portanto não têm classe `Settings` nem `Validate()`** —
o JSON inteiro é desserializado direto num tipo LIME: `SendMessage`, `SendCommand`, `ProcessCommand`,
`Redirect`, `MergeContact`.

Envelope comum do bloco (`Models/Action.cs`): `id`, `$title`, `order:int`, `conditions:Condition[]`,
**`timeout:double?`** (segundos, default 30 s via `DefaultActionExecutionTimeout`),
**`continueOnError:bool`**, `executeAsynchronously:bool` (marcado TODO no código), `type`, `settings:JRaw`.

> **Delta relevante:** a Blip tem `timeout` por ação e o Twenty não. O Twenty tem `retryOnFailure` e a
> Blip **não tem retry nenhum**. As duas peças são complementares — o Pipe precisa das duas (§4.4).

### 2.2 As 19 actions, com parâmetros

`[BLIP-SDK]` **Obr.** = obrigatório porque `Validate()` lança exceção.

| Action | O que faz | Parâmetros (obr. em **negrito**) |
|---|---|---|
| `SendMessage` | Envia mensagem LIME ao usuário | **`type`** (MediaType), **`content`**, `metadata`. Se `type` = ChatState, **não gera Id e faz `Task.Delay(interval)`** — é assim que o "digitando…" bloqueia o fluxo |
| `SendRawMessage` | Envia conteúdo já serializado como string | **`Type`** (MIME válido), **`RawContent`**, `Metadata` |
| `SendMessageFromHttp` | Busca conteúdo por HTTP **GET** e envia como mensagem | **`Uri`**, **`Type`**, `Headers`, `RequestTimeout` (default 60 s). Método sempre GET; `EnsureSuccessStatusCode()` → erro HTTP quebra a action |
| `SendCommand` | Dispara Command LIME sem esperar resposta | `method`, `uri`, `to`, `type`, `resource`. `Id` é sobrescrito; fire-and-forget |
| `ProcessCommand` | Dispara Command e **guarda a resposta** | idem + `variable`. A variável recebe o **envelope de resposta inteiro** (com `status`, `reason`, `resource`), não só o `resource` |
| `ProcessHttp` | Requisição HTTP a API externa | **`Uri`**, **`Method`**, `Headers`, `Body`, `ResponseBodyVariable`, `ResponseStatusVariable`, `RequestTimeout` (default 60 s), `currentStateId`, `SecretUrlBlip` (declarado e **não usado**) |
| `ExecuteScript` | JavaScript no engine Jint (V1) | **`Source`**, **`OutputVariable`**, `Function` (default `"run"`), `InputVariables[]`, `LocalTimeZoneEnabled`. Limites: recursão 50, **máx. 1000 statements**, memória 100 MB, **timeout 5 s** |
| `ExecuteScriptV2` | JavaScript no V8/ClearScript | idem + `CaptureExceptions`, `ExceptionVariable`. **Timeout 10 s**, heap 100 MB, `AllowReflection=false`, promises awaitadas, funções nativas `request`/`time`/`context`/`botTimeZone` |
| `ExecuteTemplate` | Renderiza template Handlebars | **`OutputVariable`**, `Template`, `InputVariables[]`. Input que for JSON válido é **desserializado** antes → dá `{{minhaVar.campo}}` |
| `SetVariable` | Grava variável de contexto | **`Variable`**, `Value`, `Expiration` (**segundos**) |
| `DeleteVariable` | Apaga variável de contexto | **`Variable`** |
| `SetBucket` | Grava documento no bucket do bot | **`Id`**, **`Type`** (MIME), `Document`, `Expiration` (segundos) |
| `MergeContact` | Atualiza o contato (agenda) | JSON inteiro vira `Contact` LIME. **Usa sempre `context.UserIdentity` como alvo** — o `identity` do JSON é ignorado (há um `contact.Identity = contact.Identity` no código, provável bug histórico) |
| `ManageList` | Adiciona/remove o usuário de lista de distribuição | **`ListName`**, `Action` = `Add`\|`Remove` (default `Add`). No `Add`, cria a lista se não existir (2 tentativas); no `Remove`, engole erro de lista inexistente |
| `TrackEvent` | Registra evento no Analytics | **`Category`**, **`Action`**, `Label`, `Value` (parse `InvariantCulture` — **ponto decimal**, vírgula vira null), `Extras`, `FireAndForget` (default **true**) |
| `TrackContactsJourney` | Registra jornada do contato entre blocos | **`StateId`**, **`StateName`**, `PreviousStateId`, `PreviousStateName`, `FireAndForget` (default true) |
| `CreateTicket` | Abre ticket de atendimento humano no Desk | **`Validate()` é vazio: nada é obrigatório.** `OwnerIdentity` (default `context.OwnerIdentity`), `CustomerIdentity` (default `context.UserIdentity`), `RoutingOwnerIdentity`, `RoutingCustomerIdentity`, `Variable` (recebe o `ticket.Id`), `CustomerInput` (default `context.Input.Content`). Também faz `context.SetTicket(...)`, alimentando `{{ticket.*}}` |
| `Redirect` | Handover para outro bot/serviço | `address` (Node), `context` (DocumentContainer). O `RedirectManager` só faz `SendMessageAsync(redirect, context.Input.Message.From)` — **o bot manda uma mensagem `redirect` de volta ao canal e quem age é o roteador** |
| `ProcessContentAssistant` | Consulta a base de conteúdo/NLP da Blip | **`Text`**, **`OutputVariable`**, `Tags` (CSV), `V2:bool`, `Score` (**dividido por 100**; null usa `builder:#MinimumIntentScore`) |

**Armadilhas de `ProcessHttp` que valem para o Pipe** `[BLIP-SDK]`:
- Headers passam pelo substituidor de variáveis → dá para pôr `{{secret.token}}` no valor do header.
- `X-Blip-User` só é enviado se `processHttpAddUserToRequestHeader = true`; `X-Blip-Bot` só se
  `processHttpAddBotIdentityToRequestHeader = true`. Em URIs internas, manda `X-Blip-Bot` +
  `X-Blip-StateId` incondicionalmente. (Corrige o `blip-api-schemas.md` §5.1, que dava os três headers
  como sempre injetados.)
- **Não lança em erro HTTP**: status ≥400 só vira `Warning` no trace. `HttpRequestException` vira
  status sintético **495** (erro SSL/TLS) ou **503**, com body JSON `{error, message, url, sslError,
  untrustedRoot, details}`. Timeout também não lança.

### 2.3 Como o fluxo da Blip para para o atendente humano — a resposta

`[BLIP-SDK]` **Não existe action de "parar". É um estado com prefixo de id.** A mecânica está em
`Samples/Builder.Console/BuilderMessageReceiver.cs` e `BuilderDeskNotificationReceiver.cs`:

```csharp
var stateId = await _stateManager.GetStateIdAsync(context, cancellationToken);
if (stateId == null || !stateId.StartsWith("desk:")) return null;
```

1. O bloco de atendimento é um `State` normal cujo `Id` começa com **`desk:`** (mesma convenção de
   `subflow:`). Suas `inputActions` incluem `CreateTicket`.
2. O state tem `Input` **sem bypass** ⇒ o laço `do { … } while (!stateWaitForInput)` do `FlowManager`
   para ali e o `stateId` fica persistido. **O bot "não responde" porque está parado num estado cujas
   condições de saída só são satisfeitas por eventos do Desk.**
3. Enquanto está em `desk:`, o roteamento muda: mensagens do agente chegam do domínio
   `desk.msging.net` e são **encaminhadas direto ao cliente sem passar pelo fluxo** (`fwd:<id>`).
4. `ChatState` normalmente é descartado — **só é processado se o estado atual começar com `desk:`**.
   É por isso que o "digitando" do atendente chega ao cliente.
5. **Fim do atendimento:** só duas coisas voltam a entrar no fluxo vindas do desk — um documento
   `Ticket` (status `Transferred` é ignorado) ou um `Redirect`. O `Redirect` é desembrulhado
   (`inputMessage.Content = redirect.Context.Value`) e alimentado no `FlowManager`, satisfazendo a
   condição de saída do bloco `desk:` e destravando o fluxo.

`[BLIP-DOC]` A doc confirma o conceito: *"Os blocos de atendimento são utilizados para transferir a
conversa do Builder para um atendente humano. A regra de transferência da conversa pode ser
customizada através das condições de saída do bloco."*

`[INFER]` **Não li literalmente** qual campo do `Ticket` as condições de saída testam
(`status == ClosedAttendant`?). Confirmar exportando um fluxo com bloco de atendimento.

### 2.4 Subfluxo e encerramento

`[BLIP-SDK]`
- `Models/FlowType.cs`: `Flow | Subflow`. Subflow exige `Version >= 2`.
- `Models/State.cs` tem **`End:bool`** — comentário literal: *"Indicates if this is the end state of
  flow (used in subflows)"*.
- `FlowManager`: `IsSubflowState(state) => state.Id.StartsWith("subflow:")`. Ao entrar, empilha o id
  numa `Queue<string>`, lê o `shortNameOfSubflow` do `ExtensionData`, carrega o subfluxo pelo
  `IFlowLoader` e troca `context.Flow`. **Subfluxo é recursivo e a pilha é por input.**
- `End == true` ⇒ pula o cálculo de outputs e chama `RedirectToParentFlowAsync(...)` com o id
  desempilhado — volta ao fluxo pai.
- **Encerrar o fluxo principal é outra coisa:** quando `ProcessOutputsAsync` devolve `state == null`,
  o manager chama `DeleteStateIdAsync(context)` — o usuário perde o estado e o próximo input cai no
  root. `[INFER]` é isso que o bloco de encerramento do Builder produz.
- Travas: `MaxTransitionsByInput = 10` lança `FlowConstructionException`; `InputProcessingTimeout = 1 min`.
- Validação: exatamente **um** state `Root`, root precisa esperar input e não pode ter conditions, ids
  únicos, todo `output.stateId` precisa existir (ou ser `{{variável}}`), loop sem input é rejeitado.

### 2.5 IA na Blip: não é action, é variável

`[BLIP-SDK]` A única action de IA é `ProcessContentAssistant`. Não existe `ProcessLLM`, `AiAgent` nem
`Copilot` em `master`. **O agente moderno entra por outro lugar:** existe
`Variables/AiAgentVariableProvider.cs` com `VariableSource.AiAgent`, expondo `{{aiagent.*}}` —
`redirect`, `userMessageId`, `skill_id`, `task_id`, `taskName`, `skillName`, `toolCall_id`, `name`,
`parameters`, `userMessage`, `agentResponse`, `errorCode`. Também existem `VariableSource.AiAnswers` e
`VariableSource.BlipFunction`.

`[INFER]` O padrão da plataforma hoje é: o agente/LLM roda **fora** do Builder e injeta resultado no
contexto; o fluxo consome via variável e ramifica com `conditions`. **O Pipe não deve copiar isso** —
é a razão pela qual o cliente não consegue entender o próprio fluxo de IA (§6, lacuna 6).

---

## 3. Convenções que todo parâmetro do catálogo respeita

`[DECISÃO]` Quatro regras. Elas não são preferência de estilo; cada uma existe porque a alternativa
já quebrou em algum dos dois sistemas de referência.

### 3.1 Nada de campo hardcoded — tudo sai do dicionário de dados

`[PIPE]` `dicionarioObjeto(tenantId, codigo, rotulo, descricao)` e
`dicionarioCampo(tenantId, objetoCodigo, codigo, rotulo, tipo, descricao, consultavel, agregavel)`.

Quando um parâmetro deste catálogo diz **"objeto do `dicionarioObjeto`"**, significa: a UI oferece
`dicionario_objeto.rotulo` como texto e grava `dicionario_objeto.codigo` no `config`. Quando diz
**"campo do `dicionarioCampo` do objeto escolhido"**, o mesmo, filtrado por `objetoCodigo`.

Isso é o que permite a mesma peça `criar_registro` funcionar num tenant que tem `oportunidade` com 8
campos e noutro que tem 40 — **nenhum nome de campo aparece no código do Pipe**.

### 3.2 Casar por `name`, nunca por `label`

`[TW-CÓDIGO]` O Twenty devolve `labelSingular`/`labelPlural` **traduzidos** (o repositório tem
`pt-BR.po` completo em server, front e e-mails). O mesmo objeto se chama "Company" para um usuário e
"Empresa" para outro. O que não muda é `nameSingular`/`namePlural` e o `name` do campo.

Portanto: `dicionarioObjeto.codigo` recebe `nameSingular`; `dicionarioObjeto.rotulo` recebe
`labelSingular` **e serve só para exibir**. Toda comparação, toda chave de `config`, todo `eventName`
usa `codigo`.

Reforço vindo do próprio Twenty `[TW-CÓDIGO]`: o `eventName` do `DATABASE_EVENT` tem regex
`/^[a-z][a-zA-Z0-9_]*\./` — **começa obrigatoriamente com minúscula**, e a descrição de
`CREATE_RECORD` diz *"must be lowercase"*. Um `label` traduzido ("Oportunidade") nunca passaria nessa
regex. A plataforma já força a decisão; o catálogo só a torna explícita.

### 3.3 O Twenty não tem campo FORMULA — cálculo é do Pipe

`[TW-CÓDIGO]` `twenty-shared/src/types/FieldMetadataType.ts` não tem `FORMULA`. E o resolvedor de
variáveis (§1.4) não tem funções nem aritmética. No Twenty, qualquer conta é `CODE`/`LOGIC_FUNCTION`.

`[DECISÃO]` No Pipe isso vira duas peças distintas, e a IA precisa saber escolher:
- **`calcular_score`** — para a conta que o produto já modela (`regraScore` → `faixaScore` →
  `scoreLead` com `explicacao`). É declarativa, auditável, versionada. **É a resposta certa para
  "calcule o score do lead".**
- **`executar_script`** — para conta que o produto não modela. É a saída de emergência, e o catálogo
  diz isso: *"use só quando nenhuma peça declarativa serve; script não é auditável pela IA"*.

Se a IA responder "script" a um pedido de score, o catálogo falhou.

### 3.4 A variável é `{{...}}`, e o alvo é o `codigo` do bloco — não o UUID

`[DECISÃO]` Copiar a sintaxe `{{...}}` do Twenty é gratuito e reduz atrito (é a mesma do Handlebars
que a Blip usa em `ExecuteTemplate`). **Mas o Twenty endereça o passo pelo UUID e isso é um erro de
produto** — a própria descrição da ferramenta de IA precisa avisar *"step-id is the step's UUID, not
its name"*, o que é a definição de armadilha.

`[PIPE]` `bloco` já tem `codigo` com `uniqueIndex(versaoId, codigo)`. Use-o:
`{{pergunta_cnpj.resposta}}`, não `{{a3f1c8e2-….resposta}}`. Legível para o cliente, legível para a
IA, e único por versão.

Contexto disponível, por motor `[DECISÃO]`:

| Prefixo | Motor | Conteúdo |
|---|---|---|
| `{{gatilho.*}}` | ambos | payload que disparou (`execucao_workflow.payload_gatilho`) |
| `{{contato.*}}` | ambos | campos de `contato` + customizados |
| `{{conversa.*}}` | fluxo | `estado`, `fila`, `atendente`, `prioridade`, `janela_expira_em` |
| `{{<codigo_do_bloco>.*}}` | ambos | saída do passo anterior (`execucao_passo.saida`) |
| `{{registro.*}}` | workflow | registro do CRM que disparou o gatilho de evento |
| `{{secreto.*}}` | ambos | credencial cifrada; **nunca aparece em trace nem em log** |

---

## 4. O catálogo

Colunas: **nome** (vocabulário do Pipe) · **motor** (`fluxo` / `workflow` / `ambos`) · **o que faz**
(frase para a IA decidir) · **parâmetros** · **equiv. Blip** · **equiv. Twenty** · **observação**.

### 4.1 Gatilhos

`[PIPE]` `gatilho.tipo` já é restrito a `['evento','agendado','manual','webhook']`. Os nomes abaixo
são **apresentações** desses quatro tipos, com `config` distinta — não são novos valores do enum.

| nome | motor | o que faz | parâmetros | equiv. Blip | equiv. Twenty | observação |
|---|---|---|---|---|---|---|
| `mensagem_recebida` | fluxo | Começa o fluxo quando um contato manda mensagem num canal. É o gatilho padrão de toda conversa automática. | `canalId` (uuid, opt — vazio = todos), `apenasPrimeiraMensagem` (bool, default false), `filtro` (condição, opt) | entrada no `State` root do `Flow` | **não existe** | `[PIPE]` `fluxo.canalId` já existe; o gatilho só o materializa. Um `fluxo` publicado por canal — não empilhe dois fluxos no mesmo canal sem condição, a ordem de avaliação vira acidente |
| `conversa_criada` | workflow | Dispara quando uma conversa nova entra no sistema, antes de qualquer atendente. Serve para roteamento e SLA. | `inboxId` (uuid, opt), `filaId` (uuid, opt), `filtro` (condição, opt) | não existe | `DATABASE_EVENT` em objeto custom | `[PIPE]` mapeia `evento_atendimento.tipo = 'criada'`. Note que **`criada` e `enfileirada` são eventos diferentes** — quem quer "entrou na fila" usa `evento_atendimento` |
| `evento_atendimento` | workflow | Dispara num evento do ciclo de vida da conversa: atribuída, transferida, primeira resposta, espera, SLA, encerrada, reaberta, avaliada. | **`tipo`** (enum de `TIPOS_EVENTO_ATENDIMENTO` — 16 valores), `filaId` (opt), `filtro` (opt) | não existe (a Blip só notifica fechamento, via mensagem `Redirect`) | **não existe** | `[PIPE]` catálogo fechado em `comum.ts`. **Esta é a peça de maior valor competitivo do Pipe**: nem Blip nem Twenty a têm, e é ela que permite "avise o gestor quando o SLA estourar" sem polling |
| `registro_criado` | workflow | Dispara quando um registro novo aparece num objeto do CRM (lead, conta, oportunidade…). | **`objeto`** (do `dicionarioObjeto`), `filtro` (condição sobre campos do `dicionarioCampo`) | não existe | `DATABASE_EVENT` `<obj>.created` | Sempre `codigo`, nunca `rotulo` (§3.2). O filtro roda **antes** de criar a execução — evento que não casa não vira linha em `execucao_workflow` (copiado do Twenty, que é explícito nisso) |
| `registro_atualizado` | workflow | Dispara quando um registro muda. Pode observar só campos específicos. | **`objeto`**, `campos` (lista do `dicionarioCampo`, opt — vazio = qualquer campo), `filtro` (opt) | não existe | `DATABASE_EVENT` `<obj>.updated` + `settings.fields` | **Armadilha:** sem `campos`, todo `atualizado_em` dispara — inclusive o que o próprio workflow escreveu. Fluxo que atualiza o objeto que o dispara **entra em laço**; o Pipe precisa de guarda de reentrância, que o Twenty não tem |
| `registro_removido` | workflow | Dispara quando um registro é apagado. | **`objeto`**, `filtro` (opt) | não existe | `DATABASE_EVENT` `<obj>.deleted` | O Twenty não tem evento `restored` — se o Pipe usar exclusão lógica (`excluido_em`), decidir se apagar é `removido` ou `atualizado`. **Hoje não está decidido** |
| `agendado` | workflow | Roda de tempos em tempos, sem ninguém disparar. Para digest, cobrança, limpeza, relatório. | **`modo`** (`minutos`\|`horas`\|`dias`\|`cron`), `minuto`/`hora`/`dia` conforme o modo, `cron` (string, só no modo `cron`), `fusoHorario` (default do tenant) | não existe (a Blip tem `postmaster@scheduler` para **mensagem** agendada, não para automação) | `CRON` com a mesma união discriminada | Copiar a união discriminada do Twenty: ela evita o cliente escrever cron inválido em 90% dos casos e mantém a saída de emergência |
| `manual` | workflow | Um humano dispara pelo botão, com ou sem registro selecionado. | `disponibilidade` (`global`\|`um_registro`\|`varios_registros`), **`objeto`** (obrigatório nos dois últimos), `icone`, `fixado` (bool) | não existe | `MANUAL` | **Armadilha do Twenty, herdada:** em `global` sem registro selecionado **não há dado nenhum** no contexto. A IA precisa saber disso antes de montar um passo que lê `{{registro.*}}` |
| `webhook_recebido` | workflow | Um sistema externo chama uma URL do Pipe e dispara o workflow. | `metodo` (`GET`\|`POST`), `corpoEsperado` (schema, só POST), **`autenticacao`** (`api_key`\|`hmac`) | não existe | `WEBHOOK` (**só `API_KEY`**) | `[DECISÃO]` **Divergir do Twenty aqui.** O Pipe já tem HMAC de saída (`webhookSaida.segredo`); ter HMAC só na saída e não na entrada é assimetria sem razão. O Chatwoot assina `sha256=HMAC(secret, "ts.body")` — copiar, inclusive o timestamp anti-replay |

**Regra de cardinalidade** `[DECISÃO]`: **um gatilho por workflow**, como no Twenty
(`workflowVersion.trigger` é singular). `[PIPE]` A tabela `gatilho` hoje permite N por workflow — ou
se impõe unicidade, ou se documenta o que fazer quando dois disparam junto. **Não está decidido.**

### 4.2 Mensagem

| nome | motor | o que faz | parâmetros | equiv. Blip | equiv. Twenty | observação |
|---|---|---|---|---|---|---|
| `enviar_mensagem` | fluxo | Manda texto (ou mídia) para o contato na conversa corrente. Não espera resposta. | **`tipo`** (`texto`\|`imagem`\|`arquivo`\|`audio`\|`video`), **`conteudo`** (texto com `{{variáveis}}`), `anexoId` (uuid, opt) | `SendMessage` / `SendRawMessage` | **não existe** | **Só existe no motor de conversa.** Workflow que "quer mandar mensagem" na verdade quer `enviar_template` (§ abaixo) — porque fora da conversa a janela de 24 h está fechada |
| `enviar_template` | ambos | Manda mensagem de template aprovado (WhatsApp). **É o único jeito de iniciar conversa fora da janela de 24 h.** | **`templateId`** (de `templateMensagem`), **`parametros`** (mapa posição→valor), `contatoId` (obrig. no workflow; implícito no fluxo) | `SendMessage` com `type` de template (a Blip usa Active Campaign para disparo em massa) | `SEND_EMAIL` é o análogo estrutural, não funcional | `[PIPE]` `conversa.janelaExpiraEm` é o teste. **Armadilha registrada na memória do projeto:** imagem no cabeçalho do template desloca todos os parâmetros em +1. O catálogo tem que dizer isso, senão a IA monta o mapa errado |
| `perguntar` | fluxo | Manda uma pergunta e **para o fluxo até o contato responder**, guardando a resposta numa variável. | **`pergunta`** (texto), **`variavel`** (nome), `validacao` (`texto`\|`numero`\|`data`\|`email`\|`cpf`\|`cnpj`\|`regex`), `regex` (só se `validacao=regex`), `mensagemErro`, `tentativas` (int, default 3), `expiraEm` (duração, opt) | `State.Input` com `InputValidation` + `Variable` | `FORM` (mas o `FORM` do Twenty é um formulário de N campos para um operador interno, não uma pergunta ao cliente) | `[BLIP-SDK]` `Input.Variable` aceita **só letras, números e pontos**. Copiar a restrição — nome de variável com espaço ou hífen quebra o resolvedor. `expiraEm` vem de `Input.Expiration` |
| `enviar_menu` | fluxo | Manda uma lista de opções e espera a escolha. Melhor que `perguntar` quando as respostas são fechadas. | **`texto`**, **`opcoes[]`** (`{rotulo, valor}`), **`variavel`**, `escopo` (`transiente`\|`persistente`) | `SendMessage` com `application/vnd.lime.select+json` | não existe | O `scope` transiente/persistente é da spec LIME e muda se o menu some depois de respondido. Sem isso o cliente clica numa opção velha três mensagens depois |
| `mostrar_digitando` | fluxo | Mostra "digitando…" por um tempo antes da próxima mensagem. | **`duracaoMs`** (int) | `SendMessage` com `ChatState` — **e a action faz `Task.Delay(interval)`, bloqueando o fluxo** | não existe | `[BLIP-SDK]` O bloqueio é o ponto: é um `aguardar` disfarçado. Se a IA quiser só pausar, use `aguardar`; se quiser pausar **e** sinalizar, use este |
| `enviar_email` | workflow | Manda e-mail por uma conta conectada. | **`contaConectadaId`**, **`para`**, `cc`, `cco`, `assunto`, `corpo`, `anexos[]`, `emRespostaA` | não existe (a Blip trata e-mail como canal, não como ação) | `SEND_EMAIL` | Manter `DRAFT_EMAIL`? `[DECISÃO]` **Não** — rascunho de e-mail é feature de CRM de vendas, não de plataforma de atendimento. Cortar até alguém pedir |
| `adicionar_nota_interna` | ambos | Escreve uma nota que só a equipe vê, na conversa ou no registro. | **`texto`**, `conversaId` (implícito no fluxo), `mencionar[]` (usuários) | não existe | não existe | `[PIPE]` `notaInterna` já existe. É a peça que faz "IA resumiu o atendimento" virar algo que o atendente lê sem sair da tela |

### 4.3 Dados / CRM

Todos os parâmetros de objeto e campo saem do dicionário (§3.1) e casam por `codigo` (§3.2).

| nome | motor | o que faz | parâmetros | equiv. Blip | equiv. Twenty | observação |
|---|---|---|---|---|---|---|
| `criar_registro` | ambos | Cria um registro num objeto do CRM (lead, conta, oportunidade, ou objeto do cliente). | **`objeto`** (do `dicionarioObjeto`), **`valores`** (mapa campo→valor, campos do `dicionarioCampo`) | não existe | `CREATE_RECORD` | Relação se preenche pelo id: `{"contaId": "{{buscar_conta.primeiro.id}}"}`. **A IA erra aqui**: manda o nome do relacionado em vez do id |
| `atualizar_registro` | ambos | Muda campos de um registro existente. | **`objeto`**, **`registroId`**, **`valores`**, **`camposParaAtualizar`** (lista branca) | não existe | `UPDATE_RECORD` | `[TW-CÓDIGO]` A lista branca separada de `valores` existe para não zerar campo omitido. **Erro comum documentado pelo próprio Twenty:** mandar `camposParaAtualizar` no lugar de `valores` no `criar_registro` |
| `buscar_registros` | ambos | Procura registros por filtro e devolve a lista. | **`objeto`**, `filtro` (condição), `ordenacao`, `limite` (int, default 20), `deslocamento` | não existe | `FIND_RECORDS` | Saída: `{{<codigo>.todos}}` e `{{<codigo>.primeiro.<campo>}}`. **Sem wrapper `resultado`** — copiado do Twenty, que precisou documentar isso explicitamente porque os modelos erravam |
| `remover_registro` | workflow | Apaga um registro. | **`objeto`**, **`registroId`** | não existe | `DELETE_RECORD` | Exclusão lógica ou real? `[PIPE]` `comum.ts` diz "exclusão lógica só onde o histórico importa". **A peça precisa dizer qual das duas ela faz** — hoje não está decidido |
| `escolher_registro` | workflow | Escolhe um entre vários por rodízio, sorteio ou menor carga. É como se distribui lead entre vendedores. | **`objeto`**, **`registroIds[]`**, **`estrategia`** (`sorteio`\|`rodizio`\|`menor_carga`), `campoDeCarga` (obrig. em `menor_carga`) | não existe | `PICK_RECORD` | `[PIPE]` `faixaScore.estrategiaProprietario` já tem `rodizio`/`menor_carga`/`fixo`/`nenhuma` — **usar o mesmo vocabulário**, não inventar um segundo |
| `atualizar_contato` | ambos | Grava dados no contato (nome, e-mail, documento, campos customizados). | **`valores`** (mapa campo→valor) | `MergeContact` | `UPDATE_RECORD` em `person` | `[BLIP-SDK]` **Armadilha da Blip a não copiar:** o `MergeContact` ignora o `identity` do payload e escreve sempre no usuário corrente. No Pipe, `contatoId` deve ser explícito no workflow e implícito no fluxo |
| `adicionar_etiqueta` / `remover_etiqueta` | ambos | Põe ou tira etiqueta da conversa ou do contato. | **`etiquetaId`**, `alvo` (`conversa`\|`contato`) | `/tickets/{id}/change-tags` via `SendCommand` | não existe | `[PIPE]` `etiqueta.escopo` já é `conversa`\|`contato`\|`ambos` — a peça precisa validar contra isso, não aceitar qualquer combinação |
| `calcular_score` | ambos | Recalcula o score do lead pelas regras cadastradas e devolve valor, faixa e a explicação de como chegou lá. | **`leadId`**, `versaoRegra` (int, opt — default: ativa) | não existe | **não existe** (sem FORMULA; seria `CODE`) | **A peça que substitui o campo calculado.** `[PIPE]` `scoreLead.explicacao` guarda `[{regra, versão, pontos}]` — é isso que faz a IA responder *"tirou 74 porque…"* em vez de só devolver 74 |
| `definir_variavel` | ambos | Guarda um valor para usar mais adiante no mesmo fluxo. | **`nome`**, **`valor`**, `expiraEm` (segundos, opt) | `SetVariable` | não existe (o Twenty usa a saída do passo) | `[BLIP-SDK]` `Expiration` em **segundos**. Nome com letras, números e ponto só (§4.2) |
| `apagar_variavel` | ambos | Apaga uma variável do contexto. | **`nome`** | `DeleteVariable` | não existe | Peça pequena mas necessária: sem ela, dado sensível coletado no meio do fluxo fica no `execucao_fluxo.contexto` até o fim |
| `gravar_memoria` | ambos | Guarda um dado que sobrevive ao fim da conversa, chaveado por contato. | **`chave`**, **`valor`**, `expiraEm` (segundos) | `SetBucket` | não existe | `[BLIP-SDK]` O bucket da Blip é global do bot, não por contato — e o namespace `blip_portal:` é reservado. No Pipe, **chavear por contato por padrão** e exigir opção explícita para memória global |

### 4.4 Controle de fluxo

| nome | motor | o que faz | parâmetros | equiv. Blip | equiv. Twenty | observação |
|---|---|---|---|---|---|---|
| `condicao` | ambos | Divide o caminho: se a condição bate vai por um lado, senão por outro. | **`grupos[]`** (`{id, operador: e\|ou, paiId?}`), **`condicoes[]`** (`{campo, operador, valor, grupoId}`), **`ramos[]`** (`{id, proximosBlocos[], grupoId?}` — ramo sem `grupoId` é o "senão") | `Output.Conditions` na aresta + `Condition{Source, Variable, Comparison, Operator, Values}` | `IF_ELSE` | **Divergência de forma que importa:** na Blip a condição vive **na aresta** (`transicao.condicao`, como no Pipe hoje); no Twenty vive **num nó**. `[DECISÃO]` Manter a condição na aresta no motor de conversa (é o que `transicao` já modela e é o que o cliente desenha) e usar nó no motor de sistema |
| `filtrar` | workflow | Para a execução inteira se a condição não bater. Serve para "só continue se…". | **`grupos[]`**, **`condicoes[]`** | não existe | `FILTER` | `[TW-CÓDIGO]` **Atenção:** encerra o **run inteiro**, não só o ramo. Quem quer parar só um caminho usa `condicao`. O catálogo tem que dizer isso, é a confusão nº 1 |
| `repetir_para_cada` | workflow | Roda os passos de dentro uma vez para cada item de uma lista. | **`itens`** (lista ou `{{variável}}`), **`blocosDoLaco[]`**, `continuarSeFalhar` (bool) | não existe | `ITERATOR` | Item corrente em `{{<codigo>.itemAtual}}`. `[TW-CÓDIGO]` **Duas armadilhas do Twenty, herdadas:** (a) o último passo do laço precisa ligar de volta ao iterador, senão roda uma vez só; (b) laço vazio **não falha** — completa e `itemAtual` fica `undefined` para todos os passos seguintes |
| `aguardar` | workflow | Espera um tempo ou até uma data antes de continuar. | **`modo`** (`duracao`\|`data`), `duracao{dias,horas,minutos,segundos}`, `dataHora` | não existe (o `ChatState` bloqueia, mas é outra coisa) | `DELAY` | `[PIPE]` `execucaoWorkflow.estado` já tem `aguardando`. Chatwoot tem `execution_delay` de 10 min a 30 dias — o limite superior é uma pergunta em aberto no Pipe |
| `chamar_subfluxo` | fluxo | Chama outro fluxo publicado e volta quando ele terminar. | **`fluxoId`**, `passarContexto` (bool, default true) | `State.Id` com prefixo `subflow:` + `End=true` para voltar | não existe | `[BLIP-SDK]` Na Blip é recursivo, com pilha por input, e `Version >= 2` obrigatório. **Trava anti-laço é obrigatória** — a Blip usa `MaxTransitionsByInput = 10`; sem isso o cliente monta recursão infinita no primeiro dia |
| `encerrar_fluxo` | fluxo | Termina a conversa automática. O próximo contato recomeça do início. | `motivo` (texto, opt), `encerrarConversa` (bool, default false) | `ProcessOutputs` devolve null → `DeleteStateIdAsync` | não existe | **Duas coisas diferentes num nome só, e é intencional:** terminar o *fluxo* (bot para, conversa continua) e terminar a *conversa* (`conversa.estado = 'encerrada'`). O booleano separa. Sem ele, o cliente encerra a conversa achando que só saiu do fluxo |
| `executar_script` | ambos | Roda um trecho de JavaScript para transformar dado. Saída de emergência. | **`codigo`**, **`variavelSaida`**, `variaveisEntrada[]`, `capturarErro` (bool), `variavelErro` | `ExecuteScript` (Jint, 5 s, 1000 statements) / `ExecuteScriptV2` (V8, 10 s) | `CODE` | **Escrever no catálogo, para a IA:** *"use só quando nenhuma peça declarativa serve. Script não é auditável — a IA não consegue explicar o que ele faz nem verificar que continua correto."* `[BLIP-SDK]` Copiar os limites da Blip (timeout, teto de statements, sem reflexão) |
| `chamar_funcao` | ambos | Roda uma função nomeada e reutilizável do tenant. | **`funcaoId`**, **`entrada`** (mapa) | não existe | `LOGIC_FUNCTION` | `[TW-CÓDIGO]` **Criar em duas etapas** (§1.7, lição 2): a peça só aponta para uma função que já existe. A IA que tenta criar as duas coisas de uma vez produz workflow inválido |
| `preencher_formulario` | workflow | Para o workflow e espera um humano preencher campos antes de continuar. | **`campos[]`** (`{codigo, rotulo, tipo, placeholder?, opcoes?}`), `atribuidoA` (usuário/fila) | não existe | `FORM` | É aprovação humana no meio da automação — "só crie a oportunidade depois que o gestor confirmar". Distinto de `perguntar`: o interlocutor é interno, não é o cliente |

### 4.5 Atendimento humano

Este é o grupo onde **fluxo e atendente competem pela mesma conversa**, e onde o catálogo precisa ser
mais explícito. `[BLIP-SDK]` A Blip resolve isso estacionando o fluxo num estado `desk:` (§2.3); o
Twenty não tem o problema porque não tem conversa.

| nome | motor | o que faz | parâmetros | equiv. Blip | equiv. Twenty | observação |
|---|---|---|---|---|---|---|
| `entregar_ao_humano` | fluxo | **Passa a conversa para um atendente e cala o bot.** Enquanto durar o atendimento, o fluxo não responde nada; ele volta a rodar quando o atendimento terminar. | **`filaId`** (ou `atendenteId`), `mensagemAoCliente` (texto, opt), `passarContexto` (bool, default true), `aoRetornar` (`continuar`\|`encerrar`\|`ir_para_bloco`), `blocoDeRetorno` (se `ir_para_bloco`) | `CreateTicket` + estado `desk:` — **as duas coisas juntas**; a action sozinha não cala o bot | não existe | **A peça mais importante deste grupo, e a que não existe em nenhum dos dois como peça única.** `[DECISÃO]` No Pipe é **uma peça só** que faz as três coisas (cria atribuição, muda `conversa.estado`, marca o fluxo como estacionado). Expor `CreateTicket` e "estado `desk:`" separados como a Blip faz é a receita para o bot responder por cima do atendente |
| `retomar_bot` | fluxo | Devolve a conversa ao fluxo automático depois do atendimento humano. | `blocoDestino` (opt — default: o bloco de retorno de `entregar_ao_humano`) | mensagem `Redirect` vinda do desk destrava o estado `desk:` | não existe | `[BLIP-SDK]` Na Blip isso é implícito e frágil: só um `Ticket` ou um `Redirect` destravam, e `status = Transferred` é **silenciosamente ignorado**. No Pipe tem que ser peça explícita e o retorno tem que ser um evento, não um efeito colateral |
| `transferir_para_fila` | ambos | Move a conversa para outra fila. | **`filaId`**, `motivo` (opt), `notificarCliente` (bool) | `/tickets/{id}/transfer` com `{team}` via `SendCommand` | não existe | `[PIPE]` `evento_atendimento.tipo = 'transferida_fila'` já existe. **Não há transferência em lote na Blip** (URI por ticket) — se o Pipe quiser, é feature nova |
| `atribuir_atendente` | ambos | Coloca a conversa com um atendente específico, ou pela estratégia da fila. | `atendenteId` (uuid) **ou** `estrategia` (`rodizio`\|`menor_carga`\|`fixo`), `filaId` | `/tickets/change-status` com `agentIdentity` | `PICK_RECORD` é o análogo estrutural | Reusar o vocabulário de `ESTRATEGIAS_PROPRIETARIO` `[PIPE]`. **Armadilha:** atribuir a atendente sem slot livre — a Blip tem `agentSlots`/`ticketsInService`; o Pipe precisa da mesma guarda ou a atribuição some |
| `definir_prioridade` | ambos | Muda a prioridade da conversa na fila. | **`prioridade`** (de `NIVEIS_PRIORIDADE`) | `/priority-rules` (recurso separado, não ação) | não existe | `[PIPE]` `conversa.prioridade` nasce `sem_prioridade` **de propósito** — o comentário no schema diz que o default `media` fazia a fila ordenar por dado que ninguém escolheu. A peça não deve ter default |
| `colocar_em_espera` | ambos | Pausa o relógio de inatividade da conversa sem devolvê-la à fila. | `motivoPausaId` (opt) | `/tickets/{id}/pause-inactivity` | não existe | `[BLIP-SDK]` Na Blip isto **não** libera o slot do atendente nem devolve à fila — é só uma pausa de timer, e o cliente não recebe nada. Escrever isso no catálogo: a IA senão usa "em espera" como se fosse "devolver para a fila" |
| `encerrar_conversa` | ambos | Fecha a conversa. | `motivo` (texto), `etiquetas[]` (opt) | `/tickets/change-status` `ClosedAttendant`/`ClosedClient` | não existe | `[PIPE]` `conversa.ultimaMensagemDe` sustenta a trava: **não fechar se quem deve resposta é o atendente**. A peça tem que respeitar a trava, não contorná-la |
| `disparar_pesquisa` | ambos | Manda a pesquisa de satisfação (CSAT ou NPS) ao contato. | **`pesquisaId`** (de `pesquisa`), `atrasoSegundos` (int, opt) | não é ação do Builder (é config do Desk) | não existe | `[PIPE]` `pesquisa.tipo` é `csat`\|`nps`. Como ação explícita, o cliente escolhe **quando** disparar — o que na Blip é configuração global e por isso inflexível |

### 4.6 IA

`[DECISÃO]` Este grupo é onde o Pipe deve **divergir de propósito** dos dois. A Blip empurra IA para
fora do fluxo e devolve `{{aiagent.*}}` (§2.5); o Twenty tem `AI_AGENT` mas com só dois campos, tudo
escondido no `AgentEntity`. Nos dois casos **o cliente não consegue ler o próprio fluxo e entender o
que a IA faz** — e este produto é vendido com "a IA explica seus fluxos".

| nome | motor | o que faz | parâmetros | equiv. Blip | equiv. Twenty | observação |
|---|---|---|---|---|---|---|
| `responder_com_base` | fluxo | Responde a pergunta do cliente usando a base de conhecimento do tenant (RAG). Se não achar resposta confiável, não inventa: segue pelo caminho de "não sei". | **`pergunta`** (default `{{gatilho.texto}}`), **`baseId`** (de `baseConhecimento`), `confiancaMinima` (0..1, default 0.7), `variavelSaida`, `variavelConfianca` | `ProcessContentAssistant` (`Text`, `OutputVariable`, `Tags`, `Score`) | não existe | `[BLIP-SDK]` **Armadilha da Blip a não copiar:** o `Score` é dividido por 100 dentro da action — parâmetro em escala diferente da que o usuário digita é bug esperando acontecer. Usar 0..1 e ponto final. `[PIPE]` `trechoConhecimento` já existe para o RAG |
| `classificar` | ambos | Classifica um texto numa lista fechada de categorias que o cliente define. | **`texto`**, **`categorias[]`** (`{codigo, descricao}`), `variavelSaida`, `permitirNenhuma` (bool, default true) | `ProcessContentAssistant` com intenções | não existe | **Categorias como parâmetro, não como config escondida.** É o que permite a IA responder "esse fluxo classifica em 5 categorias, são estas". `[PIPE]` `classificacaoConversa` e `SENTIMENTOS` já existem para o caso de sentimento |
| `extrair_dados` | ambos | Lê um texto livre e devolve campos estruturados (CNPJ, valor, data, intenção de compra). | **`texto`**, **`campos[]`** (`{codigo, tipo, descricao, obrigatorio}`), `variavelSaida` | não existe | não existe | A peça que evita 6 blocos de `perguntar` em sequência. Os `campos` saem do `dicionarioCampo` quando o destino é o CRM — mantém a regra do §3.1 |
| `resumir_conversa` | ambos | Escreve um resumo do atendimento, para nota interna, ticket ou CRM. | `conversaId` (implícito no fluxo), `estilo` (`curto`\|`detalhado`\|`acoes`), `variavelSaida` | não existe (é o Copilot, produto separado) | não existe | `[PIPE]` `monitoria.ts` já modela `consumoIa` — **toda peça deste grupo tem que registrar tokens ali**, senão o custo de IA por tenant é invisível. `execucao_passo.tokens` também já existe |
| `agente_ia` | ambos | Roda um agente que decide sozinho quais ações usar, dentro de um limite que o cliente define. | **`agenteId`**, `instrucao` (texto com variáveis), `acoesPermitidas[]` (subconjunto deste catálogo), `maxPassos` (int, default 5) | não existe | `AI_AGENT` (**só `agentId` e `prompt`**) | `[DECISÃO]` **Divergir do Twenty:** `acoesPermitidas` e `maxPassos` ficam **no passo**, não escondidos no agente. Um agente sem teto declarado é um fluxo que ninguém consegue auditar — e a IA que explica fluxos não conseguiria explicar este. `[TW-CÓDIGO]` Criar em duas etapas (§1.7, lição 2) |

### 4.7 Integração externa

| nome | motor | o que faz | parâmetros | equiv. Blip | equiv. Twenty | observação |
|---|---|---|---|---|---|---|
| `chamar_http` | ambos | Chama uma API externa e guarda a resposta. | **`url`**, **`metodo`** (`GET`\|`POST`\|`PUT`\|`PATCH`\|`DELETE`), `cabecalhos` (mapa), `corpo`, `variavelResposta`, `variavelStatus`, `timeoutSegundos` (default 30), `formatoEsperado` (schema, opt) | `ProcessHttp` | `HTTP_REQUEST` | **Divergência de comportamento que precisa de decisão explícita:** `[BLIP-SDK]` a Blip **não lança** em status ≥400 — só grava warning e devolve 495/503 sintéticos em erro de rede. O Twenty trata como falha do passo. `[DECISÃO]` **Falha explícita por padrão** (Twenty), com `tratarErroComoSucesso` para quem quer o comportamento da Blip. Silêncio por padrão é como se produz workflow que "funciona" e não faz nada |
| `disparar_webhook` | workflow | Manda um evento do Pipe para um sistema externo, assinado. | **`webhookId`** (de `webhookSaida`), **`evento`** (nome), `payload` (mapa) | não existe (a Blip não tem assinatura de eventos — §8 do `blip-api-schemas.md`) | Webhooks do workspace | `[PIPE]` `webhookSaida` + `entregaWebhook` já modelam retentativa (`tentativas`, `proximaTentativaEm`, `ultimoErro`). **É o oposto do `chamar_http`**: aqui a entrega é garantida com fila; lá é síncrona e pode falhar |
| `registrar_evento` | ambos | Registra um evento de negócio para relatório e análise. | **`categoria`**, **`acao`**, `rotulo`, `valor` (número), `extras` (mapa) | `TrackEvent` (`Category`, `Action`, `Label`, `Value`, `Extras`, `FireAndForget`) | não existe | `[BLIP-SDK]` `Value` da Blip usa `InvariantCulture` — **vírgula decimal vira null silenciosamente**. Num produto pt-BR isso é uma mina. Aceitar os dois separadores e normalizar na entrada |
| `enviar_comando_canal` | fluxo | Envia um comando cru ao canal (marcar como lida, reagir, ações específicas do WhatsApp). | **`comando`**, **`parametros`** | `SendCommand` / `ProcessCommand` | não existe | Saída de emergência do grupo de mensagem, como `executar_script` é do de controle. Mesmo aviso no catálogo: **não é auditável pela IA** |

---

## 5. Vocabulário: onde Blip e Twenty divergem, e o que o Pipe adota

`[DECISÃO]` A regra que decide todos os casos: **o nome do cliente ganha do nome do fornecedor.** Quem
usa o builder do Pipe é uma pessoa de operação de atendimento, não um engenheiro de plataforma. Onde
os dois fornecedores discordam, o desempate é qual palavra a pessoa já usa na reunião de segunda.

| Conceito | Blip | Twenty | **Pipe** | Por quê |
|---|---|---|---|---|
| A unidade que faz algo | `Action` | `Step` / `WorkflowAction` | **`acao`** | `[PIPE]` já é o nome da tabela. "Passo" descreve posição, "ação" descreve efeito — e o cliente monta pensando em efeito |
| A unidade que espera | `State` (com `Input`) | (não existe) | **`bloco`** | `[PIPE]` já é o nome da tabela. "Estado" é vocabulário de autômato; o cliente vê caixas na tela |
| A ligação entre unidades | `Output` (com `Order` + `Conditions`) | `nextStepIds` (array no nó) | **`transicao`** | `[PIPE]` já é o nome da tabela, e é o único dos três que é substantivo do que o cliente desenha: uma seta |
| O que dispara | (não existe — é a entrada do root) | `Trigger` | **`gatilho`** | `[PIPE]` já é o nome da tabela. A Blip não tem palavra porque não tem o conceito |
| A execução | (`FlowContext`) | `WorkflowRun` | **`execucao`** | `[PIPE]` `execucaoFluxo`/`execucaoWorkflow`. "Run" não traduz e "rodada" soa a jogo |
| Versão publicada | `builder_working_flow` vs. publicado | `workflowVersion` com `DRAFT`/`ACTIVE` | **`fluxoVersao` / `versao` do workflow** | `[PIPE]` já copiado da Blip, e o comentário no schema diz por quê: *"copiado da Blip porque está certo"* |
| Fila de atendimento | `team` (no Ticket) **e** `attendance-queue` (no cadastro) | (não existe) | **`fila`** | `[PIPE]` A Blip tem **dois nomes para a mesma coisa** — `team` no ticket, `attendance-queue` no cadastro, ligados por `queueId`. Isso é dívida da Blip, não modelo a copiar. Um nome só |
| Atendente | `attendant` / `agent` (usa os dois) | (não existe) | **`atendente`** | Idem: a Blip alterna `attendant` e `agent` no mesmo produto. `[PIPE]` `filaAtendente`, `statusAtendente` já fixam |
| A conversa | `Ticket` | (não existe) | **`conversa`** | **A divergência mais cara de errar.** "Ticket" é vocabulário de suporte técnico; o produto atende venda, cobrança e pós-venda. `[PIPE]` `conversa` já está no schema, e `Ticket` não aparece em lugar nenhum. Manter |
| Contato | `Contact` (extensão CRM) | `Person` | **`contato`** | "Pessoa" colide com `usuario` (quem trabalha). `[PIPE]` `contato` + `contatoIdentidade` já resolvem a multiplicidade de canais |
| Objeto do CRM | (não tem) | `objectMetadata`, `nameSingular` | **`objeto`**, chave `codigo` | §3.2. `codigo` deixa claro que é a chave, não o texto — `rotulo` é o texto |
| Campo | `extras` (só string) | `fieldMetadata`, `name` | **`campo`**, chave `codigo` | `[BLIP-DOC]` Os `extras` da Blip são **só string**, o que joga toda tipagem para a aplicação. `[PIPE]` `dicionarioCampo.tipo` existe justamente para não repetir esse erro |
| Condição | `Condition{Source, Comparison, Operator}` | `StepFilter` + `StepFilterGroup` | **`condicao`** + **`grupo`** | Adotar a **forma** do Twenty (grupos aninháveis por `parentStepFilterGroupId`) com o **nome** em português. A forma da Blip não aninha: `Operator` é `And`/`Or` achatado, não dá `(A e B) ou C` |
| Variável de saída | `OutputVariable` (por action) | saída implícita do passo, `{{id.campo}}` | **saída implícita**, `{{codigo_do_bloco.campo}}` | O modelo da Blip obriga nomear variável em toda action — ruído. O do Twenty é implícito, mas endereça por UUID (§3.4). O Pipe fica com implícito + `codigo` legível |
| Handover ao humano | `CreateTicket` + estado `desk:` (duas peças) | (não existe) | **`entregar_ao_humano`** (uma peça) | §4.5. Duas peças que **precisam** andar juntas são uma peça só |
| Sair do fluxo | `End=true` (subfluxo) vs. `state == null` (principal) | (não existe) | **`encerrar_fluxo`** com booleano `encerrarConversa` | Dois mecanismos diferentes para a mesma intenção do cliente. Um nome, um parâmetro que separa |
| Continuar após erro | `continueOnError` (por action) | `continueOnFailure.value` | **`aoErro`** = `parar`\|`continuar`\|`repetir` | `[PIPE]` `POLITICAS_ERRO` já existe e é **melhor que os dois**: um enum de três valores em vez de dois booleanos que se contradizem. Manter |

**Três termos a banir explicitamente no Pipe** `[DECISÃO]`:

1. **"Skill"** — `[BLIP-DOC]` não é vocabulário oficial nem da Blip (o termo dela é "serviço" ou
   "subbot"); circula em blog e comunidade. Importar palavra que nem a origem usa é dívida grátis.
2. **"Ticket"** — ver acima.
3. **"Step"/"Passo" para a unidade de conversa** — colide com `execucao_passo`, que é registro de
   execução, não peça do desenho. Peça é `bloco` (conversa) ou `acao` (sistema).

---

## 6. Lacunas: o que a IA vai precisar e não existe em nenhum dos dois

Ordenadas por quanto bloqueiam o produto.

### Lacuna 1 — o motor de sistema do Pipe é uma lista, não um grafo `[PIPE]`

`acao.ordem` com `uniqueIndex(workflowId, ordem)` é uma **sequência linear**. Mas `TIPOS_ACAO` não tem
nem `condicao` nem `filtrar` nem `repetir_para_cada` — ou seja, o motor de sistema hoje **não sabe
ramificar**. Tudo que este catálogo põe em §4.4 para o motor `workflow` não tem onde encaixar.

O Twenty resolve com `nextStepIds` no próprio passo (§1.1) — sem tabela de arestas, sem `ordem`.

**Sem decidir isso, metade do catálogo é ficção.** As opções:
- (a) copiar o Twenty: trocar `acao.ordem` por `acao.proximasAcoes uuid[]`;
- (b) reusar o que já existe: dar ao motor de sistema a mesma `transicao` do motor de conversa;
- (c) manter linear e aceitar que workflow não ramifica (aí `condicao` e `repetir_para_cada` saem do
  catálogo para o motor `workflow`, e a IA precisa saber disso).

`[DECISÃO]` (b) é a mais barata e a mais consistente — mas **é decisão de arquitetura, não deste
documento**. Registrada como bloqueio.

### Lacuna 2 — não existe teste de fluxo antes de publicar

Nem Blip nem Twenty deixam rodar um fluxo com dado falso sem tocar em produção. `[BLIP-DOC]` A Blip é
pior: *"este comando só altera o JSON do fluxo, mas você ainda precisa ir ao Builder e publicá-lo
manualmente"* — **não há publicação por API**.

Se a IA monta o fluxo, o cliente precisa poder dizer "roda isso com um lead fictício e me mostra o que
acontece" **antes** de publicar. Sem isso, "a IA monta fluxos" é uma promessa que ninguém aceita em
produção. Peça necessária: `simular_execucao(fluxoVersaoId, entradaFalsa)` devolvendo a trilha de
`execucao_passo` sem efeito colateral — o que exige que toda ação declare se é idempotente.

### Lacuna 3 — não existe "explique este fluxo"

É requisito explícito do produto ("a IA tira dúvidas sobre fluxos") e **não existe em nenhum dos
dois**. Não é uma peça do catálogo: é uma função de leitura sobre `bloco` + `transicao` + `acao`.

O que ela precisa e ainda não tem: **descrição por peça em linguagem natural gerada do `config`
resolvido**, não do template. "Envia template X" é inútil; "manda o template de boas-vindas com o
nome do contato e o link do onboarding" é resposta. Isso obriga cada peça deste catálogo a ter uma
**função de renderização para texto** além do schema de parâmetros. Não está previsto em lugar nenhum.

### Lacuna 4 — reentrância e laço entre workflows

`[TW-CÓDIGO]` O Twenty não tem guarda: um workflow com gatilho `registro_atualizado` que atualiza o
mesmo registro **entra em laço**, e o único freio é o `retryOnFailure` acabar. `[BLIP-SDK]` A Blip tem
`MaxTransitionsByInput = 10` **dentro** de um fluxo, mas nada entre fluxos.

O Pipe precisa dos dois: teto de transições por execução **e** detecção de cadeia
workflow→evento→workflow. `[PIPE]` `execucaoWorkflow.payloadGatilho` é o lugar natural para carregar a
profundidade da cadeia.

### Lacuna 5 — nenhum dos dois tem catálogo de funções de transformação

`[TW-CÓDIGO]` `{{x}}` resolve caminho e nada mais (§1.4). `[BLIP-SDK]` O `ExecuteTemplate` tem
Handlebars, mas é ação separada, com variável de saída própria — o cliente precisa criar um bloco só
para trocar uma data de formato.

Resultado nos dois: **toda formatação vira script**. Formatar data, mascarar CPF, juntar nome, virar
maiúscula, arredondar. `[DECISÃO]` Um conjunto pequeno e fechado de funções na própria variável —
`{{contato.nome | primeiro_nome}}`, `{{valor | moeda}}`, `{{data | formato:"DD/MM"}}` — tira dezenas de
`executar_script` do caminho e devolve auditabilidade à IA. Não existe hoje.

### Lacuna 6 — orçamento e teto de IA por peça

`[PIPE]` `consumoIa` e `execucaoPasso.tokens` existem, mas **nenhum dos dois sistemas tem teto**. O
`AI_AGENT` do Twenty não declara limite de passos nem de custo; a Blip empurra o LLM para fora do
fluxo. Um fluxo com `agente_ia` num laço é uma fatura de API sem limite superior.

O `maxPassos` proposto em §4.6 é o mínimo. Falta ainda teto por execução e por tenant/mês, e a decisão
do que fazer ao estourar (parar, degradar para resposta fixa, transbordar para humano).

### Lacuna 7 — versionamento do que a IA construiu

`[PIPE]` `fluxoVersao` versiona o fluxo. Mas quando a IA edita um fluxo existente, ninguém sabe **o
que ela mudou e por quê**. O Twenty tem `create_draft_from_workflow_version` (rascunho a partir de
versão ativa) — bom começo, mas não guarda a intenção.

Falta: registrar, junto da versão, o pedido em linguagem natural que a originou. É o que permite
"volte para como estava antes de eu pedir para adicionar o desconto".

### Lacuna 8 — decisões em aberto do próprio Pipe

Achadas ao montar o catálogo, todas sem resposta hoje:

1. **Um gatilho por workflow ou vários?** `gatilho` permite N; o Twenty impõe 1 (§4.1).
2. **`remover_registro` apaga ou marca?** `comum.ts` diz "exclusão lógica só onde o histórico
   importa", mas não diz onde importa.
3. **Teto de `aguardar`.** Chatwoot limita a 30 dias; o Pipe não tem limite.
4. **Ordem de avaliação de dois fluxos no mesmo canal.** `fluxo.canalId` não impede dois publicados.
5. **`registro_atualizado` deve ignorar a própria escrita?** Sem isso, laço garantido (lacuna 4).

---

## 7. A IA respondendo sobre métricas — o desenho serve?

**Resposta curta: a fundação está certa e é melhor que a dos dois sistemas de referência. Falta a
camada do meio — e falta inteira, não pela metade.**

### 7.1 O que está certo, e por quê

`[PIPE]` Três decisões do schema que quase ninguém toma cedo:

1. **`evento_atendimento` é imutável e é a fonte de tudo.** O comentário do `gestao.ts` diz:
   *"Toda métrica é derivada de `evento_atendimento`, nunca de campo mutável da conversa: é isso que
   permite recalcular o passado quando a definição de uma métrica muda."* Isso é exatamente o que a
   Blip **não** tem — `blip-api-schemas.md` §8 registra que só o fechamento chega por evento, o resto é
   polling. E é o que o Chatwoot tem pela metade (`reporting_events` existe, mas o catálogo de eventos
   é menor: sem SLA, sem espera, sem reabertura).

2. **`metricaDiaria` guarda soma e contagem separadas** (`esperaFilaSeg` + `esperaFilaN`), com o
   comentário *"a média é a soma dividida pela contagem, na hora de exibir"*. É o que permite a IA
   responder "TMR da fila Comercial na semana passada" reagregando três dias — média de médias não
   reagrega, e é o erro clássico.

3. **`dicionarioCampo` tem `consultavel` e `agregavel`.** O comentário é preciso: *"Não é
   documentação: é o que a linguagem de consulta lê para decidir o que é permitido."* Isso resolve
   sozinho o problema de segurança de "IA que gera SQL": não há SQL cru, há um dicionário que declara
   o permitido, e `consultaSalva.texto` diz *"nunca vira SQL cru vindo do cliente, e o `tenant_id` é
   imposto pelo servidor"*.

Para "qual meu TMR essa semana?", o caminho existe: `dicionarioObjeto` → `dicionarioCampo` (agregável)
→ consulta estruturada → `metricaDiaria`.

### 7.2 O que falta — cinco itens, em ordem

**(a) O dicionário não tem métricas, só campos.** `dicionarioCampo` descreve *colunas*. "TMR" não é
coluna: é `primeiraRespostaSeg / primeiraRespostaN` restrito a `dimensaoTipo = 'fila'`. Nada no schema
diz isso. A IA teria que reinventar a fórmula a cada pergunta — e vai inventar diferente a cada vez.

**Falta um `dicionarioMetrica`**: `codigo`, `rotulo`, `descricao`, `formula` (estruturada: numerador,
denominador, filtro), `unidade` (`segundos`\|`contagem`\|`percentual`\|`moeda`), `dimensoesValidas[]`,
`sinonimos[]`. Sem `sinonimos`, "TMR", "tempo médio de resposta" e "quanto demoro pra responder" são
três perguntas diferentes para a IA. **Este é o item que mais falta.**

**(b) Não há definição de janela nem de fuso.** "Essa semana" começa domingo ou segunda? O tenant é
de qual fuso? `metricaDiaria.dia` é `date` sem fuso — o que é correto para armazenar e ambíguo para
perguntar. Falta um vocabulário de período (`hoje`, `ontem`, `essa_semana`, `semana_passada`,
`esse_mes`, `ultimos_30_dias`) resolvido **no servidor**, com o fuso do tenant. `[TW-CÓDIGO]` O Twenty
já tem `IS_RELATIVE`, `IS_IN_PAST`, `IS_TODAY` nos operandos de filtro — o conceito está lá, falta
trazer.

**(c) `consultaSalva.texto` é `text` sem gramática declarada.** O comentário diz "consulta
estruturada, analisada contra o dicionário de dados", mas o formato não existe em lugar nenhum. Sem
gramática escrita, a IA gera três dialetos diferentes e o parser vira arqueologia. **Ou o campo vira
`jsonb` com schema, ou a gramática é especificada.** Não decidir é a pior opção.

**(d) Nada liga métrica a explicação.** A IA vai responder "seu TMR é 4m12s" e a pergunta seguinte é
sempre "por quê?" ou "comparado com quando?". Faltam três coisas que o schema já quase tem:
comparação com período anterior, abertura por dimensão (`metricaDiaria.dimensaoTipo` já suporta
`fila`\|`atendente`\|`equipe`\|`inbox`\|`etiqueta` — só falta a IA saber que pode), e ligação com o
evento cru (`evento_atendimento` tem `conversaId`, então "quais foram as 5 conversas piores" é
respondível — mas ninguém declarou isso).

**(e) Não há métrica de fluxo nem de workflow no dicionário.** `execucaoFluxo`, `execucaoPasso`,
`execucaoWorkflow` e `execucaoAcao` registram tudo (inclusive `duracaoMs`, `erro` e `tokens`), mas o
dicionário não os expõe. Consequência: **a IA que monta fluxos não consegue responder se eles
funcionam.** "Quantos leads passaram por esse fluxo?", "onde as pessoas desistem?", "quanto esse
fluxo me custou em IA?" — os dados existem, o vocabulário não. `[TW-CÓDIGO]` O Twenty tem
`list_workflow_runs` e `get_workflow_run` como ferramentas de IA justamente por isso.

### 7.3 Veredito

O desenho **serve como base** e é mais sólido que Blip (que não tem evento) e Chatwoot (que tem
evento mais pobre). O que falta não é conserto: é uma camada nova por cima — o `dicionarioMetrica` com
sinônimos e fórmula, o vocabulário de período com fuso, e a gramática de consulta escrita.

Enquanto essa camada não existir, a IA responde sobre **dados** (quantos leads, quais conversas) mas
não sobre **métricas** (TMR, TMA, taxa de resolução) — porque métrica é definição, e definição que não
está escrita a IA inventa. Inventar TMR diferente em duas respostas seguidas destrói a confiança no
produto inteiro mais rápido do que qualquer bug de fluxo.

---

## 8. O que não encontrei

Registro explícito, para ninguém tratar suposição como fato:

- **O JSON exportado de um fluxo real do Builder da Blip.** `[BLIP-SDK]` Tudo em §2 vem do C#. Os
  nomes no JSON serializado *provavelmente* são camelCase dos nomes C#, **não confirmado**. Confirmar
  exportando um fluxo do Builder da AUVP.
- **As condições de saída de um bloco `desk:` real.** `[INFER]` A convenção do prefixo está provada
  pelos receivers de exemplo, mas qual campo do `Ticket` a condição testa
  (`status == ClosedAttendant`?) não foi lido literalmente.
- **`help.blip.ai` bloqueia acesso automatizado (403).** A lista de ações da doc oficial que foi
  possível ler está **desatualizada** — 8 ações contra 19 no código — e não descreve campos. As
  páginas "Setting up Desk Human Service in Builder" e "Ação redirecionar a serviço" não abriram.
- **Para que serve `SecretUrlBlip`** em `ProcessHttpSettings`. `[BLIP-SDK]` Está declarado e **não é
  lido em lugar nenhum** do `ProcessHttpAction`.
- **Assinaturas exatas das funções nativas do `ExecuteScriptV2`** (`request.fetchAsync`, `time`,
  `context`, `botTimeZone`). Listadas, não lidas linha a linha.
- **Como o Twenty registra o gatilho `DATABASE_EVENT` em objetos custom** e se há limite de workflows
  por objeto. O módulo `workflow-trigger/automated-trigger/` foi listado, não lido a fundo.
- **Se o Twenty tem timeout por passo em algum lugar fora do schema.** Não aparece em
  `baseWorkflowActionSettingsSchema`; pode existir no executor.
- **Nada foi verificado contra uma instância viva** — nem Twenty nem Blip. Tudo aqui é código e
  documentação. Antes de implementar `criar_registro`, vale um teste contra a Metadata API real: os
  scripts em `C:/Users/anderson.linhares/twenty-crm/*.mjs` já fazem esse caminho.

---

## 9. Fontes

| Fonte | O que forneceu |
|---|---|
| `github.com/twentyhq/twenty@main`, clone raso 2026-09-09 — `packages/twenty-shared/src/workflow/` | Enums `WorkflowActionType`, `StepStatus`, `WorkflowRunStatus`; os 4 schemas de gatilho; os 19 schemas de `settings`; `stepFilter`/`stepFilterGroup`; `STEP_RETRY_DELAYS_MS` |
| idem — `packages/twenty-shared/src/utils/variable-resolver.ts` | `VARIABLE_PATTERN`, semântica de resolução |
| idem — `packages/twenty-shared/src/types/{ViewFilterOperand,StepFilters,FieldMetadataType}.ts` | Operandos de filtro, `StepLogicalOperator`, ausência de `FORMULA` |
| idem — `packages/twenty-server/src/modules/workflow/` | Entidades `workflow*`; executor (`should-execute-step`, `should-fail-safely`, `step-should-continue-on-failure`); `filter.workflow-action.ts`; `ai-agent.workflow-action.ts`; as 22 ferramentas de IA em `workflow-tools/tools/` |
| `github.com/takenet/blip-sdk-csharp@master` — `src/Take.Blip.Builder/` | `ContainerExtensions.RegisterBuilderActions` (as 19 actions); cada `*Settings.cs` com `Validate()`; `Models/{Action,State,Flow,Input,Output,Condition}.cs`; `FlowManager`; `Variables/AiAgentVariableProvider.cs` |
| idem — `Samples/Builder.Console/Builder{Message,DeskNotification}Receiver.cs` | A mecânica do estado `desk:`, o encaminhamento `fwd:`, o destrave por `Ticket`/`Redirect` |
| `github.com/takenet/lime-csharp` — `src/Lime.Messaging/Contents/Redirect.cs` | Campos de `Redirect` |
| `hmg-help.blip.ai` (mirror; o `help.blip.ai` retorna 403) | Blocos de atendimento, "Redirecionar a um serviço" |
| `pipe/packages/db/src/schema/{automacao,comum,conversas,crm,gestao,monitoria}.ts` | Todo o `[PIPE]`: tabelas, enums, e os comentários que registram as decisões já tomadas |
| `pipe/docs/pesquisa/{twenty,blip-api-schemas,blip-desk-regras-tecnicas,chatwoot}.md` | Base que este documento estende sem repetir |

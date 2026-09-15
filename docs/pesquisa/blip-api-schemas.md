# Contrato da API da Blip — protocolo, extensões e schemas dos recursos

> **O que este documento é:** o contrato da Blip levantado a partir da **documentação pública**
> (`docs.blip.ai`, `limeprotocol.org`, `help.blip.ai`) e do **código-fonte dos SDKs oficiais**
> (`github.com/takenet`). Complementa — não repete — o que já está em `apis.md` (endpoints e
> armadilhas de produção) e em `blip-schema-real.md` (schema observado ao vivo em 2 tenants).
>
> **Procedência.** Cada afirmação carrega uma marca de origem. Não misture os níveis:
>
> | Marca | Origem | Confiança |
> |---|---|---|
> | `[DOC]` | `docs.blip.ai` — referência oficial da API | alta (mas ver §9: a doc erra/omite) |
> | `[LIME]` | `limeprotocol.org` — especificação do protocolo | alta (é a spec, não a implementação) |
> | `[HELP]` | `help.blip.ai` — central de ajuda oficial | alta para procedimento, baixa para schema |
> | `[SDK]` | código-fonte em `github.com/takenet` | alta para tipos, **é implementação, não contrato** |
| `[SDK-PY]` | `blip_flowanalysis` (PyPI, pacote oficial da Take) — parser de fluxos exportados reais | alta para nomes de chave do JSON |
> | `[REAL]` | já confirmado contra tenant real em `blip-schema-real.md` | máxima |
> | `[INFER]` | dedução minha, explicitamente marcada | **verificar antes de usar** |
>
> Levantamento em duas rodadas: **2026-09-09** (`docs.blip.ai` + `limeprotocol.org` + SDK C#) e
> **2026-09-10** (central de ajuda via API do Zendesk + parser oficial de fluxos). `docs.blip.ai` é
> uma página única (Slate, ~3 MB) baixada inteira e processada localmente — nada aqui veio de resumo
> de busca.
>
> **A 2ª rodada corrigiu uma conclusão importante da 1ª:** a Blip **tem** webhook de dados
> (Integrações → Webhook), e por ele chegam abertura, fechamento e transferência de ticket. A §8 foi
> reescrita. Se você leu a versão anterior deste arquivo, releia a §8.

---

## 1. Protocolo LIME — o modelo de mensageria

A Blip não é uma API REST com um recurso por endpoint. É um **barramento LIME** (Lightweight
Messaging Protocol), especificado em `limeprotocol.org` e implementado pela Take/Blip. Entender os
envelopes é o que separa "chamar endpoint" de "modelar o produto".

### 1.1 Os quatro envelopes

`[LIME]` A spec define **quatro** tipos de envelope, não três. A Blip expõe três deles por HTTP
(`/messages`, `/notifications`, `/commands`); o quarto (`Session`) só existe no transporte
persistente (WebSocket/TCP dos SDKs).

#### Propriedades comuns a todos os envelopes `[LIME]`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | string | Identificador do envelope. Ver obrigatoriedade por tipo abaixo. |
| `from` | Node | Remetente. Omitido pelo originador → o servidor preenche. |
| `to` | Node | Destinatário. Omitido → endereçado ao próprio nó. |
| `pp` | Node | *Per procurationem* — envio em nome de outra identidade (requer `delegation`). |
| `metadata` | `Dictionary<string,string>` | Contexto genérico. É por aqui que a Blip trafega quase tudo que não cabe no schema (ver §3.5). |

#### Message `[LIME]` `[DOC]`

Obrigatórios: **`type`** e **`content`**. `to` é obrigatório para quem envia; `from` é obrigatório
no destino (preenchido pelo servidor).

```json
{
  "id": "65603604-fe19-479c-c885-3195b196fe8e",
  "from": "551199991111@0mn.io/182310923192",
  "to": "mycontact@msging.net",
  "type": "text/plain",
  "content": "Hello World"
}
```

`[DOC]` **`id` é opcional e isso tem consequência de produto:** omitir o `id` coloca a mensagem em
modo *fire-and-forget* — o originador declara que não quer notificação nenhuma, **nem de falha**.
Se o Pipe for espelhar mensagens para a Blip, todo envio precisa de `id` (UUID novo, nunca
reaproveitado — o `id` é a chave de correlação das notificações).

`[DOC]` `type` pode ser qualquer MIME **discreto** (`text`, `application`, `image`, `video`,
`audio`). Tipos compostos (`message`, `multipart`) **não são suportados**.

#### Notification `[LIME]` `[DOC]`

Obrigatórios: **`id`** (referencia a Message correspondente) e **`event`**.

`[LIME]` Eventos válidos, em ordem de ciclo de vida:

| Evento | Significado |
|---|---|
| `accepted` | Recebida e aceita pelo servidor |
| `validated` | Validada (aparece na lista de `receipt`, não no fluxo básico) |
| `authorized` | Autorizada (idem) |
| `dispatched` | Despachada ao destino |
| `received` | O destino recebeu |
| `consumed` | O destino processou |
| `failed` | Erro no processamento — vem com `reason` |

```json
{
  "id": "65603604-fe19-479c-c885-3195b196fe8e",
  "from": "postmaster@msging.net/server1",
  "to": "mycontact@msging.net",
  "event": "failed",
  "reason": { "code": 42, "description": "Destination not found" }
}
```

`[DOC]` **Obrigação do integrador:** para cada mensagem processada, o chatbot **deve** devolver
`consumed` (ou `failed`) em `POST /notifications`. Sem isso o histórico da conversa não é exibido
corretamente. Nota derivada: `unreadMessages` do Ticket é definido como *"mensagens sem notificação
`consumed`"* `[DOC]` — ou seja, um integrador que não emite `consumed` infla essa métrica para
sempre.

#### Command `[LIME]` `[DOC]`

Obrigatórios: **`id`** (exceto no método `observe`) e **`method`**.

`[LIME]` Métodos válidos — **sete**, não quatro como o `apis.md` registra:

| Método | Uso |
|---|---|
| `get` | Obtém recurso |
| `set` | Define/substitui |
| `merge` | Mescla com o existente |
| `delete` | Remove |
| `subscribe` | Assina mudanças de um recurso |
| `unsubscribe` | Cancela assinatura |
| `observe` | Notifica mudança (one-way, **sem `id`, sem resposta**) |

Campos adicionais: `uri` (obrigatório em requisição — formato `lime://user@domain/recurso?param=v`),
`type` (MIME do `resource`), `resource` (o corpo), e **na resposta**: `status` (`success`/`failure`)
e `reason`.

`[DOC]` **O timeout do servidor para devolver a resposta de um comando é 60 segundos.** Passou
disso, o HTTP devolve `504 Gateway Timeout`. Isso dá um número concreto para o timeout de cliente
que o `apis.md` recomendava por intuição (20s) — 20s continua sendo uma escolha defensável do lado
cliente, mas saiba que a Blip pode legitimamente demorar até 60s.

`[DOC]` Códigos HTTP de transporte (aplicam-se aos três endpoints):

| Código | Significado |
|---|---|
| `202 Accepted` | Envelope aceito pelo servidor |
| `400 Bad Request` | Problema de formato/campos do envelope |
| `401 Unauthorized` | Header `Authorization` ausente ou inválido |
| `429` | Rate limit estourado (ver §7) |
| `504 Gateway Timeout` | Servidor não respondeu em 60s |

Sobre `200 OK` com `"status": "failure"` no corpo: já documentado em `apis.md` e reconfirmado
`[REAL]`. A doc oficial **não avisa** sobre isso em lugar nenhum — só mostra exemplos de sucesso.

#### Session `[LIME]`

Não trafega por HTTP. Só existe no transporte persistente dos SDKs (WebSocket porta 8081, ou TCP).
Campo obrigatório: **`state`**.

Estados: `new` → `negotiating` → `authenticating` → `established` → `finishing` → `finished`, mais
`failed` como estado terminal de erro.

Handshake completo `[LIME]`:

1. Cliente: `{"state": "new"}`
2. Servidor: `{"state":"negotiating","encryptionOptions":["none","tls"],"compressionOptions":["none","gzip"]}`
3. Cliente escolhe: `{"state":"negotiating","encryption":"tls","compression":"none"}`
4. Servidor: `{"state":"authenticating","schemeOptions":["guest","plain","transport"]}`
5. Cliente: `{"from":"user@domain/device","state":"authenticating","scheme":"plain","authentication":{"password":"<base64>"}}`
6. Servidor: `{"state":"established","to":"user@domain/device"}`

Campos de Session: `id` (obrigatório exceto no primeiro `new`), `encryptionOptions`/`encryption`,
`compressionOptions`/`compression`, `schemeOptions`/`scheme`, `authentication`, `reason`.

**Relevância para o Pipe:** nenhuma imediata — se falarmos com a Blip por HTTP, não há sessão. Mas
explica por que a chave HTTP é `base64(identidade:accessKey)`: é literalmente o esquema `plain` do
LIME serializado no header.

### 1.2 Endereçamento: identity, node, instance

`[LIME]` `[DOC]` Formato canônico: **`name@domain/instance`** — chamado de **Node**. Cada parte tem
até 1023 caracteres.

| Parte | O que é | Obrigatório |
|---|---|---|
| `name` | Identificador do cliente **no canal**. Muda por canal: telefone em SMS/WhatsApp, id interno em Messenger, UUID em Blip Chat. | sim |
| `domain` | Canal de origem, sempre um FQDN. | sim |
| `instance` | Conexão específica, quando o cliente pode ter mais de uma ativa (celular, PC). | não |

`name@domain` sem instância chama-se **Identity**. `name@domain/instance` é o **Node** completo.

`[DOC]` Tabela oficial de canais (o `domain` de cada um):

| Canal | FQDN |
|---|---|
| Blip Chat | `0mn.io` |
| WhatsApp | `wa.gw.msging.net` |
| Messenger | `messenger.gw.msging.net` |
| Instagram | `instagram.gw.msging.net` |
| Telegram | `telegram.gw.msging.net` |
| Skype | `skype.gw.msging.net` |
| Workplace | `workplace.gw.msging.net` |
| Google RCS | `googlercs.gw.msging.net` |
| Microsoft Teams (AzureBotService) | `abs.gw.msging.net` |
| Apple Business Chat | `businesschat.gw.msging.net` |
| E-mail | `mailgun.gw.msging.net` |
| Take.IO (SMS) | `take.io` |
| Tangram (SMS) | `tangram.com.br` (**deprecado**) |
| **Bots da própria Blip** | `msging.net` |
| **Tunnel** | `tunnel.msging.net` |

`[DOC]` **Ciclo de vida do endereço varia por canal** e isso é um requisito de modelagem, não um
detalhe: em SMS e WhatsApp o endereço é **persistente** (sempre válido); em Messenger é **escopado**
(só vale para um originador específico). Um CRM que trate todo endereço como chave estável de
pessoa vai errar em Messenger/Instagram.

`[DOC]` **A convenção de `%40`** (já registrada em `apis.md`) está documentada oficialmente em dois
lugares: no encaminhamento ao Desk (`{node-do-usuário-ascii-encoded}@desk.msging.net`) e no tunnel
(`[receiver]@tunnel.msging.net/[originator com %40]`). Não é um detalhe de implementação — é
endereçamento aninhado: um Node inteiro vira o `name` de outro Node.

### 1.3 Content types `application/vnd.lime.*` — o catálogo da spec

`[LIME]` Tipos de **conteúdo de mensagem** (o que vai em `Message.type`/`Message.content`):

| MIME | Para que serve | Campos (obrigatório em **negrito**) |
|---|---|---|
| `text/plain` | Texto puro | o próprio `content` é a string |
| `application/vnd.lime.chatstate+json` | "digitando…" | **`state`**: `starting`\|`composing`\|`paused`\|`deleting`\|`gone` |
| `application/vnd.lime.collection+json` | Coleção de documentos | **`itemType`**, **`items[]`**, `total` |
| `application/vnd.lime.media-link+json` | Link para mídia externa | **`uri`**, `type`, `size`, `aspectRatio`, `previewUri`, `previewType`, `title`, `text` |
| `application/vnd.lime.web-link+json` | Link para página web | **`uri`**, `previewUri`, `previewType`, `title`, `text`, `target` (`blank`\|`self`\|`selfCompact`\|`selfTall`) |
| `application/vnd.lime.location+json` | Geolocalização | **`latitude`** (−90..90), **`longitude`** (−180..180), `altitude`, `course`, `accuracy`, `speed` |
| `application/vnd.lime.select+json` | Menu de opções com resposta textual | **`options[]`** (`order`, **`text`**, `type`, `value`), `text`, `scope` (`transient`\|`persistent`\|`immediate`) |
| `application/vnd.lime.document-select+json` | Menu cujas opções são documentos | **`options[]`** (`order`, **`label{type,value}`**, `value{type,value}`), `header{type,value}`, `scope` |
| `application/vnd.lime.input+json` `[DOC]` | Pede entrada validada do usuário | `label{type,value}`, `validation{rule}` |
| `application/vnd.lime.redirect+json` `[DOC]` | Handover entre bots — ver §5.4 | `address`, `context{type,value}` |
| `application/vnd.lime.reply+json` `[DOC]` | Resposta citando outra mensagem | `replied` (DocumentContainer), `inReplyTo` |
| `application/vnd.lime.reaction+json` `[DOC]` | Reação (emoji) | — |
| `application/vnd.lime.sensitive+json` `[DOC]` | Envelope de conteúdo sensível (senha, link de pagamento) — **não é armazenado** | `value` (o documento real) |
| `application/vnd.lime.copy-and-paste+json` `[DOC]` | Conteúdo copiável | — |
| `application/vnd.lime.list+json` `[DOC]` | Lista (Messenger) | — |
| `application/vnd.lime.container+json` `[DOC]` | Container genérico de documento | `type`, `value` |
| `application/vnd.lime.document+json` `[DOC]` | Documento genérico | — |
| `application/vnd.lime.payment-receipt+json` `[DOC]` | Recibo de pagamento | — |

`[LIME]` Tipos de **recurso** (o que vai em `Command.type`/`Command.resource`), com a URI canônica:

| MIME | URI | Campos principais |
|---|---|---|
| `application/vnd.lime.account+json` | `/account` | `fullName`, `email`, `phoneNumber`, `cellPhoneNumber`, `photoUri`, `address`, `city`, `gender`, `timezone`, `culture`, `password`/`oldPassword` (base64), `isTemporary`, `inboxSize`, `allowGuestSender`, `allowUnknownSender`, `storeMessageContent`, `encryptMessageContent`, `extras` |
| `application/vnd.lime.contact+json` | `/contacts[/{identity}]` | ver §3.2 |
| `application/vnd.lime.presence+json` | `/presence` | `status` (`unavailable`\|`available`\|`busy`\|`away`), `message`, `routingRule` (`instance`\|`identity`\|`identityByPriority`\|`promiscuous`\|`domain`), `priority`, `instances[]` |
| `application/vnd.lime.receipt+json` | `/receipt` | `events[]` — **quais notificações o nó quer receber** |
| `application/vnd.lime.capability+json` | `/capability` | `contentTypes[]`, `resourceTypes[]` |
| `application/vnd.lime.ping+json` | `/ping` | objeto vazio |
| `application/vnd.lime.group+json` | `/groups[/{groupIdentity}]` | `identity`, `name`, `photoUri`, `creator`, `created`, `type` (`temporary`\|`public`\|`private`), `members` (URI) |
| `application/vnd.lime.groupmember+json` | `/groups/{g}/members[/{m}]` | `identity`, `role` (`listener`\|`member`\|`moderator`\|`owner`) |
| `application/vnd.lime.delegation+json` | `/delegations` | `target`, `envelopeTypes[]`, `messages[]`, `notifications[]`, `commands[]` |
| `application/vnd.lime.quota+json` | `/quota` | `throughput` (envelopes/s), `maxEnvelopeSize` |

**Nota de leitura:** nem tudo que a spec LIME define está implementado na Blip. `presence`,
`groups`, `quota` e `receipt` **não aparecem** na documentação da Blip — a Blip implementa `account`,
`contact`, `delegation`, `capability` e `ping`, e substitui o resto pelas extensões `iris.*` (§2).

---

## 2. Extensões (`postmaster@…`) — o catálogo oficial

`[DOC]` Cada extensão é um nó com endereço próprio. O `to` do comando é o que decide **qual serviço
processa a URI**. Lista completa extraída da doc (contagem de ocorrências indica o peso de cada uma
na documentação):

| `to` | Extensão | Do que trata | URIs principais |
|---|---|---|---|
| `postmaster@desk.msging.net` | **Desk** | Atendimento humano | `/tickets`, `/tickets/change-status`, `/tickets/{id}/transfer`, `/tickets/{id}/close`, `/tickets/{id}/messages`, `/tickets/{id}/change-tags`, `/tickets/history/metadata`, `/ticket/{id}`, `/attendants`, `/teams`, `/teams/agents-online`, `/rules`, `/priority-rules`, `/attendance-queues`, `/replies`, `/tags/active`, `/monitoring/*`, `/analytics/reports/*`, `/attendance-history/send-by-email` |
| `postmaster@msging.net` | **Núcleo do bot** | Buckets, recursos, perfil, segurança, contexto do roteador | `/buckets/{id}`, `/resources/{id}`, `/profile`, `/delegations`, `/account/keys`, `/contexts/{identity}/Master-State` |
| `postmaster@crm.msging.net` | **Contacts (CRM)** | Contatos e comentários | `/contacts`, `/contacts/{identity}`, `/contacts/{identity}/comments[/{commentId}]` |
| `postmaster@builder.msging.net` | **Builder** | Estado do usuário no fluxo, variáveis de contexto, publicação de fluxo | `/contexts/{identity}/{variableName}`, `/contexts/{identity}/stateid@{flowId}`, `/contexts/{identity}/currentFlowSession@{flowId}`, `/buckets/blip_portal:builder_working_flow`, `/subflows/{shortname}/publish`, `/ping` |
| `postmaster@ai.msging.net` | **Artificial Intelligence** | Modelos NLP, intenções, entidades, análise, base de conteúdo | `/analysis`, `/analysis/{id}/feedback`, `/intentions[/{id}]`, `/intentions/{id}/questions`, `/intentions/{id}/answers`, `/entities[/{id}]`, `/models`, `/models/summary`, `/model/{id}`, `/content[/{id}]`, `/content/analysis`, `/analytics/confusion-matrix` |
| `postmaster@analytics.msging.net` | **Analytics** | Eventos e métricas | `/event-track[/{categoria}]`, `/reports[/{id}]`, `/reports/{id}/charts[/{chartId}]`, `/metrics/{indicador}/{intervalo}` |
| `postmaster@activecampaign.msging.net` | **Active Campaign** | Disparo ativo (template WhatsApp) | `/campaign/full`, `/campaign/full/v2`, `/campaign/v2`, `/audiences/v2/{campaignId}`, `/dispatch/v2`, `/campaigns/{id}/reports`, `/campaigns/{id}/summaries`, `/campaigns/summaries` |
| `postmaster@broadcast.msging.net` | **Broadcast** | Listas de distribuição (envio 1→N sem template) | `/lists`, `/lists/{lista}@broadcast.msging.net`, `/lists/{lista}@broadcast.msging.net/recipients[/{id}]` |
| `postmaster@scheduler.msging.net` | **Schedule** | Agendamento de mensagens | `/schedules[/{messageId}]` |
| `postmaster@tunnel.msging.net` | **Tunnel** | Resolve tunnel → identidade real | `/tunnels/{tunnelId}` |
| `postmaster@threads.msging.net` | **Threads** | Log de mensagens/notificações | `/messages`, `/notifications`, `/notifications?id={messageId}`, `/log-configurations` |
| `postmaster@media.msging.net` | **Media** | Upload e renovação de link expirado | `/refresh-media-uri`, `/upload-media-uri?secure=true` |
| `postmaster@copilot.msging.net` | **Copilot** | Relatórios do copiloto de IA | `/copilot/report/summary`, `/copilot/report/summary/consolidated`, `/copilot/report/transcription`, `/copilot/report/suggestion`, `/copilot/reports/combined/export` |
| `postmaster@clicktracker.msging.net` | **Click Tracker** | Encurtador/rastreador de link | `/entrypoint/encode` |
| `postmaster@stripe.msging.net` | **Payments (Stripe)** | Pagamentos | `/payment/{contactIdentity}/session`, `/payment/{contactIdentity}/payment-intent`, `/payment-methods`, `/payment-intents/{id}/events` |
| `postmaster@wa.gw.msging.net` | **Gateway WhatsApp** | Perfil, WABA, templates | `/profile`, `/whatsapp-business-account`, `/message-templates` |
| `postmaster@messenger.gw.msging.net`<br>`postmaster@telegram.gw.msging.net` | **User info** | Dados do cliente no canal | `lime://{canal}/accounts/{id}` |

**Delta importante vs. `apis.md`:** o `apis.md` registra contatos em `postmaster@msging.net`. A
documentação oficial usa **`postmaster@crm.msging.net`** para `/contacts`. `[INFER]` A hipótese mais
provável é que o `postmaster@msging.net` roteie internamente para o CRM por compatibilidade (o
`blip-schema-real.md` chamou `/contacts/{identity}` em `@msging.net` e recebeu "resource not
found", não "processor not available" — ou seja, o processador existe). **Vale testar as duas
formas antes de escolher.**

**Delta 2:** `/contexts` está documentado em `postmaster@builder.msging.net`, não em
`postmaster@msging.net` como `apis.md` registra. Mas o artigo `[HELP]` de Master-State usa
`postmaster@msging.net` para `/contexts/{identity}/Master-State`. As duas formas circulam.

---

## 3. Schemas dos recursos

### 3.1 Ticket — `application/vnd.iris.ticket+json`

`[DOC]` Schema oficial. Comparado lado a lado com o que foi observado ao vivo `[REAL]`:

| Campo | Tipo `[DOC]` | Descrição `[DOC]` | Visto ao vivo? `[REAL]` |
|---|---|---|---|
| `id` | string | id do ticket | ✅ 123/123 |
| `sequentialId` | int | sequencial **por bot** | ✅ 123/123 |
| `sequentialSuffix` | string | sufixo opcional do sequencial (se configurado) | ❌ nunca |
| `ownerIdentity` | Identity | identidade do bot dono | ✅ 123/123 (**ausente da tabela de schema da doc; só aparece na tabela do `GET /tickets`**) |
| `routingOwnerIdentity` | Identity | **se presente, usado no lugar de `ownerIdentity`** | ❌ nunca |
| `customerIdentity` | Identity | identidade do cliente | ✅ 123/123 (**também ausente da tabela de schema da doc**) |
| `customerDomain` | string | domínio do cliente | ✅ (só `wa.gw.msging.net`) |
| `agentIdentity` | Identity | identidade do atendente | ✅ 105/123 |
| `provider` | string | nome do provedor de atendimento | ✅ (só `Lime`) |
| `status` | TicketStatusEnum | ver enum abaixo | ✅ `Waiting`, `Open` |
| `storageDate` | DateTimeOffset | criação | ✅ |
| `expirationDate` | DateTimeOffset | expiração do ticket | ❌ nunca |
| `openDate` | DateTimeOffset | abertura | ✅ 100/123 |
| `closeDate` | DateTimeOffset | fechamento | ✅ só no histórico |
| `statusDate` | DateTimeOffset | data do último status | ✅ 100/123 |
| `externalId` | string | id do ticket no provedor | ✅ 74/123 |
| `rating` | int | avaliação do atendente | ✅ (sempre 0) |
| `team` | string | fila | ✅ (51% `DIRECT_TRANSFER`) |
| `unreadMessages` | long | **mensagens sem notificação `consumed`** | ✅ |
| `queuePosition` | int | posição na fila | ❌ nunca (não vem em `/tickets`) |
| `closed` | boolean | fechado ou não | ✅ |
| `closedBy` | Identity | quem fechou | ✅ só no histórico |
| `tags` | string[] | tags | ✅ 3/100 |
| `averageAgentResponseTime` | double | tempo médio de resposta | ✅ só no histórico (**a doc lista como campo do Ticket; ao vivo não vem**) |
| `firstResponseDate` | DateTimeOffset | primeira resposta | ✅ 97/123 |
| `parentSequentialId` | int | sequencial do ticket original numa transferência | ✅ 49/123 |
| `customerInput` | **DocumentContainer** | **entrada do cliente que abriu o ticket** | ✅ (só dentro do evento de ticket no thread) |
| `priority` | int | nível de prioridade | ✅ (valores `0..7` reais) |

**Campos vistos em produção que a documentação oficial NÃO tem:** `CampaignId` (38/123),
`isAutomaticDistribution`, `distributionType`, `folderId`, `metadata[]` (no histórico). Nenhum deles
aparece em `docs.blip.ai`. Trate-os como não-contratuais — podem sumir sem aviso.

`[DOC]` **TicketStatusEnum — a lista oficial completa:**

| Valor | Significado |
|---|---|
| `None` | Não definido |
| `Waiting` | Aguardando atendente |
| `Open` | Reivindicado por um atendente |
| `Assigned` | **Atribuído a um atendente, aguardando a notificação `consumed` dele** |
| `ClosedAttendant` | Fechado pelo atendente |
| `ClosedClient` | Fechado pelo cliente |
| `Transferred` | Transferido |

**Duas correções ao que temos:**
1. **`Assigned` existe e não estava documentado em nenhuma fonte local.** É um estado intermediário
   real: o ticket foi atribuído mas o atendente ainda não confirmou recebimento. Um contador de
   "abertos" que ignore `Assigned` perde tickets.
2. **`ClosedClientInactivity` NÃO existe na documentação oficial.** `regras-blip.md` e
   `blip-schema-real.md` o listam como um dos quatro estados terminais. A doc oficial lista sete
   valores e esse não é um deles. `[INFER]` Ou é um valor de outra camada (portal/relatório), ou é
   um sinônimo de `ClosedClient` gerado por timeout. **Não confie nele até ver ao vivo.**

#### Comandos de Ticket `[DOC]`

Todos com `to: postmaster@desk.msging.net`, `type: application/vnd.iris.ticket+json`.

```jsonc
// Criar ticket (transbordo programático)
{ "method": "set", "uri": "/tickets",
  "resource": { "customerIdentity": "{customerIdentity}" } }

// Criar ticket já direcionado a atendente + fila
{ "method": "set", "uri": "/tickets",
  "resource": { "customerIdentity": "...", "agentIdentity": "...", "team": "{teamName}" } }

// Criar ticket a partir de uma mensagem do cliente (type é text/plain!)
{ "method": "set", "uri": "/tickets/{customerIdentity}",
  "type": "text/plain", "resource": "I need a human!" }

// Atribuir a um atendente
{ "method": "set", "uri": "/tickets/change-status",
  "resource": { "id": "{ticketId}", "status": "Open", "agentIdentity": "{agentIdentity}" } }

// Fechar como atendente / como cliente
{ "method": "set", "uri": "/tickets/change-status",
  "resource": { "id": "{ticketId}", "status": "ClosedAttendant" } }   // ou "ClosedClient"

// Finalizar um ticket já fechado pelo cliente (com tags)
{ "method": "set", "uri": "/tickets/{ticketId}/close",
  "resource": { "closedBy": "agent%40email.net@blip.ai", "tags": ["TestTag"] } }

// Transferir para fila  /  para atendente + fila
{ "method": "set", "uri": "/tickets/{ticketId}/transfer", "resource": { "team": "{teamName}" } }
{ "method": "set", "uri": "/tickets/{ticketId}/transfer",
  "resource": { "agentIdentity": "{agentIdentity}", "team": "{teamName}" } }

// Alterar tags
{ "method": "set", "uri": "/tickets/{id}/change-tags",
  "resource": { "id": "{id}", "tags": ["tag1","tag2"] } }
```

`[DOC]` **`GET /ticket/{ticketId}` (singular!) existe** — a doc registra `uri: "/ticket/{ticketId}"`,
sem `s`. Isso é uma pista concreta para o problema registrado em `apis.md` ("`GET /tickets/{id}`
direto não é suportado"): o caminho de um ticket é **singular**. Vale testar `/ticket/{id}` antes de
recorrer ao `$filter=id eq`.

`[DOC]` **`GET /tickets/{ticketId}/messages`** — a doc é explícita: *"as mensagens retornadas não
são só as do ticket, são **todas** as mensagens recebidas e enviadas do cliente"*. Query strings:
`$take` (máx. 100), `$ascending`, e **`getFromOwnerIfTunnel`** — descrito como *"pegar todas as
mensagens do roteador dono"*, default `false`, **obrigatório `true` quando se usa Roteador**.
Confirma a regra do `apis.md` e dá a razão. Nota extra `[DOC]`: **um ticket expira em um mês**;
depois disso as mensagens só saem por `/threads`.

`[DOC]` `GET /tickets?$filter=...` — a doc documenta dois filtros que funcionam:
`status eq 'waiting'` e `(CustomerIdentity eq '{id}')&$closed=true`. **Note o `$closed=true` como
parâmetro separado, não como valor de `status`** — é exatamente o motivo pelo qual
`status eq 'closed'` falha sempre `[REAL]`. Lacuna nossa preenchida.

`[DOC]` `GET /tickets/history/metadata` aceita `$filter` com `sequentialId eq 1080` e com
`storageDate ge datetimeoffset'2025-11-01T00:00:00.000Z' and storageDate le datetimeoffset'…'` —
note a sintaxe **`datetimeoffset'…'`**, obrigatória para comparar data em OData na Blip.

### 3.2 Contact — `application/vnd.lime.contact+json`

`[DOC]` Este é o schema que `blip-schema-real.md` não conseguiu confirmar ao vivo. Aqui está,
oficial. Todos os campos são **opcionais exceto `identity`**.

| Campo | Tipo | Descrição | Exemplo `[DOC]` |
|---|---|---|---|
| `identity` | string | **obrigatório** — identidade no canal (`name@domain`) | `11121023102013021@messenger.gw.msging.net` |
| `name` | string | nome | `"Rafael Pacheco"` |
| `email` | string | e-mail | |
| `phoneNumber` | string | telefone | `"5531000000000"` |
| `cellPhoneNumber` | string | celular | `"5531999999999"` |
| `address` | string | endereço | |
| `city` | string | cidade | |
| `gender` | string | `male`/`female` | |
| `photoUri` | uri | foto | |
| `timezone` | int | GMT relativo | `-3` |
| `culture` | string | IETF language tag | `"pt-br"` |
| `group` | string | tag de grupo | `"testers"` |
| `extras` | object | **par chave/valor livre, só strings** | `{"customerExternalId":"41231","cpf":"00000000000"}` |
| `lastMessageDate` | datetimeoffset | última interação | |
| `taxDocument` | string | documento de identificação | `"12345678910"` |
| `source` | string | canal de origem | `"Facebook Messenger"` |
| `isPending` | boolean | pendente de aceitação pelo dono do roster | |
| `sharePresence` | boolean | compartilhar presença (default `true`) | |
| `shareAccountInfo` | boolean | compartilhar dados da conta (default `true`) | |
| **`WhatsappWaId`** | string | identificação interna na Blip | |
| **`WhatsappBsuid`** | string | **identificação do contato no canal WhatsApp da Meta** | |
| **`WhatsappUserName`** | string | nome/apelido no WhatsApp | |
| **`WhatsappParentId`** | string | identificação dentro de um grupo de BMs vinculadas | |

**Os quatro campos `Whatsapp*` são a resposta oficial à preocupação de BSUID registrada em
`regras-blip.md`.** Eles estão no contrato do Contact — não é feature futura, é campo documentado.
Note a inconsistência de nomenclatura: **PascalCase** enquanto todo o resto do objeto é camelCase
(mesmo padrão do `CampaignId` do Ticket).

`[DOC]` **Substituição de variável em mensagem** — recurso que não estava em nenhuma fonte local:
se a mensagem tiver `metadata["#message.replaceVariables"] = "true"`, qualquer trecho no formato
`${contact.<propriedade>}` é substituído pelo valor do contato, **inclusive de dentro de `extras`**
via `${contact.extras.<chave>}`. Se o valor não existir, o trecho é simplesmente removido (não dá
erro, não deixa placeholder). Isso importa para o Pipe: é um mecanismo de personalização que roda
**do lado da Blip**, então uma mensagem "montada" no Pipe pode ser reescrita em trânsito.

Comandos `[DOC]` (`to: postmaster@crm.msging.net`, `type: application/vnd.lime.contact+json`):

```
set    /contacts                                 → criar (resource = objeto contact)
merge  /contacts                                 → atualizar parcialmente
get    /contacts/{identity}                      → um contato
get    /contacts?$skip=0&$take=3                 → lista
set    /contacts/{identity}/comments             → adicionar comentário
get    /contacts/{identity}/comments             → listar
delete /contacts/{identity}/comments/{commentId} → apagar
```

Comment: `application/vnd.iris.crm.comment+json`.

### 3.3 Attendant — `application/vnd.iris.desk.attendant+json`

`[DOC]`

| Campo | Tipo | Descrição |
|---|---|---|
| `identity` | Identity | identidade do atendente |
| `fullName` | string | nome |
| `email` | string | e-mail |
| `teams` | string[] | filas às quais pertence |
| `status` | AttendantStatusEnum | ver abaixo |
| `lastServiceDate` | DateTimeOffset | data do último ticket |
| `agentSlots` | int | número de slots simultâneos de atendimento |
| **`ticketsInService`** | int | **número de tickets abertos com esse atendente** |

`[DOC]` **AttendantStatusEnum com os valores numéricos** — a doc dá o mapeamento, que nenhuma fonte
local tinha:

| Valor | Numérico |
|---|---|
| `Offline` | 0 |
| `Pause` | 1 |
| `Online` | 2 |
| `Invisible` | 3 |

Note: `Pause` (singular), não `Paused` como `blip-desk-funcoes.md` registra.

`ticketsInService` não apareceu na sondagem ao vivo `[REAL]` (104 atendentes, 7 campos). É o campo
que faltava para calcular ocupação (`ticketsInService / agentSlots`) sem varrer tickets.

Comandos `[DOC]`:
```jsonc
// Adicionar um agente
{ "to":"postmaster@desk.msging.net", "method":"set", "uri":"/attendants",
  "type":"application/vnd.iris.desk.attendant+json",
  "resource": { "identity":"{identity}", "teams":["{team1}"] } }

// Adicionar vários (coleção) — este é o padrão de escrita em lote da Blip
{ "method":"set", "uri":"/attendants", "type":"application/vnd.lime.collection+json",
  "resource": { "total":1, "itemType":"application/vnd.iris.desk.attendant+json",
                "items":[ { "identity":"…", "teams":["…"] } ] } }

{ "method":"delete", "uri":"/attendants/{agentId}" }
{ "method":"get",    "uri":"/attendants" }
```

**Achado relevante para o Pipe:** existe escrita em lote — embrulhar N recursos num
`application/vnd.lime.collection+json`. `apis.md` registra "não existe transferência em lote", o que
continua verdade para `/tickets/{id}/transfer` (URI por ticket), mas **não** é uma regra geral da
plataforma.

`[DOC]` Documento irmão **AttendantTeam** (`application/vnd.iris.desk.attendant-team+json`):
`ownerIdentity`, `identity`, `teams`, `lastServiceDate`, `agentSlots`.

### 3.4 Team (fila) e Attendance Queue

`[DOC]` **Team** — `application/vnd.iris.desk.team+json`. Confirma exatamente o que a sondagem ao
vivo viu `[REAL]`: só dois campos.

| Campo | Tipo |
|---|---|
| `name` | string |
| `agentsOnline` | int |

`GET /teams` → coleção de `team`. `GET /teams/agents-online` → atendentes online.

`[DOC]` **O cadastro de fila é outro recurso: `attendance-queue`** —
`application/vnd.iris.desk.attendancequeue+json`. Isto **preenche a lacuna** que
`blip-schema-real.md` registrou ("`/teams` não tem `id` nem `capacity`; cadastro provavelmente só
existe via portal"). Existe via API:

```jsonc
{ "to": "postmaster@desk.msging.net", "method": "set", "uri": "/attendance-queues",
  "type": "application/vnd.iris.desk.attendancequeue+json",
  "resource": { "ownerIdentity": "demobot@msging.net", "name": "Queue name",
                "isActive": true, "Priority": 0 } }
```
`GET /attendance-queues/{queueId}` lê uma. O `queueId` é o mesmo UUID que aparece em
`Rule.queueId` `[REAL]` — é assim que regra e fila se ligam.

### 3.5 Rule (regra de atendimento) — `application/vnd.iris.desk.rule+json`

`[DOC]` Schema oficial (magro; a doc está claramente desatualizada aqui):

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | id da regra |
| `ownerIdentity` | Identity | dono |
| `title` | string | título |
| `isActive` | bool | ativa ou não |
| `Conditions` | Condition | condições a satisfazer |
| `Priority` | int | **"a ordem de criação da regra"** |

`[DOC]` Payload real de criação — note que ele traz campos **fora do schema documentado** (`team`,
`property`, `relation`, `values`) **e** o array `conditions`, ou seja, existem duas formas
sobrepostas (formato antigo achatado + formato novo com `conditions`):

```jsonc
{ "to":"postmaster@desk.msging.net", "method":"set", "uri":"/rules",
  "type":"application/vnd.iris.desk.rule+json",
  "resource": {
    "id":"rt5aax7a8a9-8as4da", "isActive":true, "title":"City Rule",
    "team":"Default",
    "property":"Contact.Extras.City", "relation":"Equals",
    "values":["Belo Horizonte","BH","Minas Gerais","MG"],
    "conditions":[ { "property":"Contact.Extras.City", "relation":"Equals",
                     "values":["Belo Horizonte","BH","Minas Gerais","MG"] } ]
  } }
```

**A definição de `Priority` como "ordem de criação" `[DOC]` fecha a questão aberta em
`blip-schema-real.md`**: os 26 valores sequenciais sem repetição observados não são uma
coincidência — `Priority` **é** o índice de criação. O que a doc continua **não** dizendo é se a
avaliação percorre em ordem crescente e para na primeira que casa. Isso continua sem confirmação.

`[DOC]` `conditions[].property` observado na doc: `Contact.Extras.<chave>` e **`Message`** (regra de
prioridade compara o texto da mensagem). `relation`: `Equals`, `Contains`.

`[DOC]` **Priority Rule é um recurso separado** — `application/vnd.iris.desk.priority-rules+json`,
URI `/priority-rules`. Não é o campo `priority` da regra normal:

```jsonc
{ "method":"set", "uri":"/priority-rules",
  "type":"application/vnd.iris.desk.priority-rules+json",
  "resource": { "ownerIdentity":"mybot@msging.net", "id":"837d926f-…",
                "queueId":"4DR00045-…", "title":"regra com prioridade",
                "conditions":[ { "property":"Message","relation":"Contains",
                                 "values":["Prioridade 1"] } ] } }
```
`GET /priority-rules`, `GET/DELETE /priority-rules/{id}`.

`[INFER]` Isso é provavelmente a origem do campo `priority` do Ticket com valores `0..7` `[REAL]`:
não é um enum de níveis, é **o resultado da avaliação das priority-rules cadastradas**, e o
intervalo depende de quantas existem no tenant. Testável: contar as priority-rules do tenant e
comparar com o valor máximo de `priority` observado.

#### O que a regra é do ponto de vista do produto `[HELP]`

A central de ajuda descreve a mesma regra em vocabulário de negócio, e isso preenche os buracos que
o schema deixa. **Uma regra de atendimento é estritamente formada por quatro partes:**

| Parte (rótulo na tela) | Valores possíveis | Campo no JSON |
|---|---|---|
| **Fonte de dados** ("Se") | Conteúdo da **mensagem**; **Nome** do usuário; **E-mail** do usuário; **Extras** do usuário | `property`: `Message`, `Contact.Name`, `Contact.Email`, `Contact.Extras.<chave>` `[INFER]` no mapeamento exato |
| **Operador** ("Condição") | Contém; Não contém; É igual; Não é igual | `relation`: `Contains`, `NotContains`, `Equals`, `NotEquals` `[INFER]` nos dois negativos |
| **Valor esperado** | **obrigatoriamente alfanumérico** | `values[]` |
| **Equipe alvo** ("Encaminhar atendimento para") | uma fila já criada | `team` |

> `[HELP]` **Comportamento de fallback, literal:** *"Se nenhuma regra for satisfeita, o usuário será
> enviado para a equipe **Default**."*

Isso não estava registrado em nenhuma fonte local e é o que explica por que a fila `Default` existe
sempre. Também significa que **`Default` não é uma fila comum**: é o destino de tudo que não casou
com regra nenhuma, e o volume dela é a métrica direta de cobertura das regras.

`[HELP]` **Regra de priorização** tem os mesmos quatro componentes, mais um **Grau de Urgência**:
**baixa, média ou alta**. Duas notas oficiais que mudam a leitura:
- *"um ticket com prioridade **baixa** ainda é mais prioritário que um ticket **sem prioridade
  alguma**"* — ou seja, "sem prioridade" é um quarto nível, o de baixo. Isso explica o `0`.
- A caixa *"Aplicar condições a esta regra de priorização"* é **opcional**: se não for marcada,
  **todo ticket que chegar naquela fila herda a prioridade escolhida, indiscriminadamente**.

`[HELP]` Regras de priorização são **por fila** ("no painel de fila"). Combinado com o intervalo
`0..7` observado `[REAL]`, a leitura mais plausível `[INFER]` é que o inteiro do ticket **não** é o
grau de urgência direto (que só tem 4 níveis) — ou codifica fila+grau, ou é uma escala interna maior
que a UI expõe em três faixas. Continua sem confirmação.

`[HELP]` **Permissão necessária** para mexer em filas e regras: `Help Desk > Ver e editar`.

#### O caminho oficial de "cliente escolhe assunto → cai na fila certa" `[HELP]`

Vale registrar porque é o padrão que a Blip recomenda e casa exatamente com o que o Pipe precisa
replicar:

1. No Builder, no bloco de escolha, salvar a resposta numa **variável de contexto** (ex.: `opcao`).
2. Adicionar uma **ação de saída `MergeContact`** ("Definir contato") gravando um **atributo extra**
   — `Key` = nome fixo (ex.: `Equipe`), `Value` = `{{opcao}}`.
3. Publicar o fluxo.
4. Em *Atendimento → Regras → Atendimento*, criar uma regra por fila com fonte
   `Contact.Extras.Equipe` e a equipe alvo correspondente.

Ou seja: **a fila não é escolhida por comando; é escolhida por um campo `extras` do contato que uma
regra lê no momento do transbordo.** É por isso que o disparo de campanha precisa setar `extras`
antes (`apis.md` §1.8) — e por isso setar dos dois lados (bot e roteador) importa: `[HELP]` *"cada
bot em uma estrutura de roteador tem sua respectiva representação de contato"*.

### 3.6 Bucket — armazenamento chave/valor do bot

`[DOC]` Não tem MIME próprio: o bucket armazena **qualquer documento**, e o `type` do comando é o
tipo do que se guarda. `to: postmaster@msging.net`.

```
set    /buckets/{id}                      type: qualquer   → guardar
set    /buckets/{id}?expiration=30000     → guardar com TTL em ms
get    /buckets/{id}                      → ler um
get    /buckets                           → listar (coleção de ids)
delete /buckets/{id}                      → apagar
```

O `{id}` é URL-encoded (a doc usa `abcd%c3%a9%201234` como exemplo — acentos e espaços permitidos).

**O bucket é onde o Builder guarda o fluxo:** `/buckets/blip_portal:builder_working_flow` (§5.2).
Ou seja, "bucket" não é só cache do bot — é o storage genérico da plataforma, e o namespace
`blip_portal:` é reservado. `[INFER]` Cuidado ao escrever em bucket com prefixo desconhecido.

Recurso irmão: **Resources** (`postmaster@msging.net`, `/resources/{id}`,
`application/vnd.iris.resource+json`) — mesma ideia, mas voltado a **conteúdo de mensagem
reutilizável** (texto, media-link) com suporte a variável de substituição.

### 3.7 Thread e ThreadMessage

`[DOC]` **Thread** — `application/vnd.iris.thread+json`. *"Uma thread de conversa. Tem a limitação
de só retornar mensagens armazenadas nos últimos 3 meses. Toda thread precisa ter um Account ou
Contact associado."*

| Campo | Tipo |
|---|---|
| `ownerIdentity` | Identity |
| `identity` | Identity |
| `lastMessages` | ThreadMessage |
| `unreadMessages` | long |
| `serviceIdentity` | Identity |

`[DOC]` **ThreadMessage** — `application/vnd.iris.thread-message+json`:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | id único |
| `peerIdentity` | Identity | identidade do interlocutor |
| `direction` | ThreadMessageDirection | `sent` / `received` |
| `type` | MediaType | MIME do conteúdo |
| `content` | Document | conteúdo |
| `date` | DateTimeOffset | última atualização |
| `status` | Event | evento de notificação (`consumed`, `received`, …) |
| `reason` | Reason | motivo, quando `failed` |
| `metadata` | `Dictionary<string,string>` | metadata da mensagem |

**Retenção de 3 meses é um requisito de arquitetura, não um detalhe.** Se o Pipe quiser histórico
completo, precisa espelhar continuamente — não dá para "buscar depois".

`GET /threads/{identity}?refreshExpiredMedia=true` devolve
`application/vnd.lime.collection+json` com `itemType: application/vnd.iris.thread-message+json`.

### 3.8 Outros documentos do Desk que valem conhecer `[DOC]`

Existem ~110 documentos declarados na doc. Os relevantes para atendimento:

| Documento | MIME | Para que serve |
|---|---|---|
| CustomReply | `application/vnd.iris.desk.custom-reply+json` | Resposta rápida: `id`, `category`, `name`, `document`, `type`, `isDynamicContent` |
| TicketsSummary | `…desk.ticketssummary+json` | `date`, `waiting`, `open`, `closed`, `closedAttendant`, `closedClient`, `transferred`, **`missed`** |
| TicketsMetricsSummary | `…desk.tickets-metrics-summary+json` | `maxQueueTime`, `maxFirstResponseTime`, `avgQueueTime`, `avgWaitTime`, `avgResponseTime`, `avgAttendanceTime`, `ticketsPerAttendant` |
| TeamTicketsSummary | `…desk.teamticketssummary+json` | `name`, `waitingTickets`, `openedTickets` |
| AttendantTicketsSummary | `…desk.attendantticketssummary+json` | `identity`, `status`, `openedTickets` |
| OpenTicketSummary | `…desk.open-ticket-summary+json` | `id`, `sequentialId`, `agentIdentity`, `customerIdentity`, … |
| TagTicketsSummary | `…desk.tag-tickets-summary+json` | tickets por tag |
| AttendanceTimeSummary | `…desk.attendancetimesummary+json` | tempo de atendimento |
| ServiceTimeSummary | `…desk.servicetimesummary+json` | `serviceTime` |
| AgentProductivitySummary | `…desk.agentproductivitysummary+json` | produtividade |
| Tunnels | `application/vnd.iris.tunnel+json` | `owner`, `originator`, `destination` — confirmado `[REAL]` |
| Schedule | `application/vnd.iris.schedule+json` | `name`, `when`, `message`, `status` (`scheduled`\|`executed`\|`canceled`) |

**`missed` em TicketsSummary é uma métrica que nenhuma fonte local tinha.** Tickets perdidos são
provavelmente o número mais importante de um relatório de fila e não aparece no schema de ticket.

### 3.9 Message Template (WhatsApp) `[HELP]`

`docs.blip.ai` **não documenta** o catálogo de templates. A central de ajuda documenta, e traz o
endpoint enriquecido que `apis.md` já citava — agora com o schema da resposta:

```jsonc
{ "id": "{{$guid}}", "to": "postmaster@wa.gw.msging.net", "method": "get",
  "uri": "/message-templates-enriched?templateName={TEMPLATE_NAME}" }
```
`templateName` é **opcional** — sem ele, lista todos.

Resposta (exemplo oficial, campos relevantes):
```json
{
  "id": "<id do template na Meta>",
  "name": "eventos_conversas",
  "category": "MARKETING",
  "previous_category": "UTILITY",
  "status": "APPROVED",
  "rejected_reason": "NONE",
  "language": "pt_BR",
  "last_updated_time": "2025-03-20T20:25:51.000Z",
  "components": [ { "type": "BODY", "text": "Olá, {{1}}! ..." } ]
}
```

| Campo | O que é |
|---|---|
| `category` | categoria atual — `MARKETING`, `UTILITY`, … |
| `previous_category` | **categoria anterior**; preenchido ⇒ o template foi **recategorizado** pela Meta |
| `status` | `APPROVED`, … |
| `rejected_reason` | `NONE` quando aprovado |
| `language` | idioma |
| `components[]` | conteúdo: `type` (`BODY`, `HEADER`, …) + `text` com os placeholders `{{1}}`, `{{2}}`… |
| `last_updated_time` | última alteração |

**Regra oficial de recategorização:** `previous_category` preenchido = recategorizado; `null` = não.
É exatamente o que a coluna *"Recategorized"* do Portal mostra. A Blip **notifica por e-mail** os
usuários administradores dos bots vinculados à WABA sempre que a categoria muda.

**Por que isso importa mais do que parece:** recategorização de `UTILITY` para `MARKETING` muda
custo e regra de entrega sem ninguém mexer no template. `[HELP]` A recomendação oficial é
monitorar `previous_category` e criar alertas internos. Para o Pipe: **um job periódico sobre
`/message-templates-enriched` guardando `category` e `previous_category` por template** é barato e
pega uma classe inteira de surpresa de custo.

**Sobre o deslocamento de parâmetro por mídia no cabeçalho** (a armadilha mais cara do `apis.md`):
o campo `components[]` com `type` explícito (`HEADER` vs `BODY`) é **a fonte de verdade para
calcular o offset**. Se existe um componente `HEADER` com formato de mídia, os `{{n}}` do `BODY`
deslocam. Isso continua `[INFER]` — a doc não afirma a regra de deslocamento — mas confirma que o
dado necessário para calculá-la está disponível por API, o que sustenta a recomendação já feita em
`apis.md` de derivar o offset automaticamente em vez de numerar à mão.

---

## 4. Endpoints de monitoramento e relatório do Desk `[DOC]`

Duas famílias distintas, e a diferença importa:

**`/monitoring/*` — tempo real, sem parâmetro de data.** Todos com `?version=2`:
```
/monitoring/tickets?version=2            → tickets ativos / contadores
/monitoring/waiting-tickets?version=2    → métricas de espera
/monitoring/open-tickets?version=2       → métricas de abertos
/monitoring/ticket-metrics?version=2     → métricas gerais
/monitoring/teams?version=2              → métricas por fila
/monitoring/attendants?version=2         → métricas por atendente
/monitoring/tickets-per-hour?version=2   → distribuição horária
```

**`/analytics/reports/*` — histórico, com `beginDate`/`endDate`:**
```
/analytics/reports/tickets?beginDate=&endDate=
/analytics/reports/teams?beginDate=&endDate=
/analytics/reports/attendants?beginDate=&endDate=
/analytics/reports/attendants/productivity?beginDate=&endDate=
/analytics/reports/attendancetime?beginDate=&endDate=
/analytics/reports/timings?beginDate=&endDate=
/analytics/reports/tags?beginDate=&endDate=
```
Formato de data nesses: `YYYY-MM-DD` puro (não `datetimeoffset'…'`). **A Blip usa três formatos de
data diferentes dependendo do endpoint** — `YYYY-MM-DD` aqui, ISO 8601 completo nos filtros de
campanha, e `datetimeoffset'…'` no `$filter` de `/tickets/history/metadata`.

`[DOC]` Nenhum desses endpoints aparece com `/attendance-survey-answer/summary`. **O endpoint de
CSAT que usamos hoje não está na documentação oficial** — o que reforça a leitura 2 da seção 8 de
`blip-schema-real.md` (doc local descreveu uma variação não-pública ou antiga).

---

## 5. Builder / Fluxo

### 5.1 Estrutura de um fluxo `[SDK]`

A documentação pública **não** publica o schema do fluxo. Ele está declarado no código do motor,
em `takenet/blip-sdk-csharp`, `src/Take.Blip.Builder/Models/`. **Isto é implementação, não
contrato** — mas é a fonte mais fiel disponível, já que é o mesmo código que executa o fluxo.

**`Flow`:**
```csharp
string Id                          // identificador do fluxo (= flowId)
int Version = 1
FlowType Type = Flow               // Flow | Subflow  (subflow exige Version >= 2)
string SessionState = "default"
Action[] InputActions              // ações antes de processar a entrada, no fluxo inteiro
State[] States
Action[] OutputActions
Action[] AfterStateChangedActions
Dictionary<string,string> Configuration
Flow Parent                        // fluxo pai, quando subflow
TraceSettings TraceSettings
```

**`State` (o "bloco" do Builder):**
```csharp
string Id                          // = stateId, o que se copia com "Copiar ID" no Builder
bool Root                          // exatamente UM state é root por fluxo
bool End = false
Action[] InputActions              // executadas ao ENTRAR no bloco
Input Input                        // o que o bloco espera do usuário
Action[] OutputActions             // executadas ao SAIR
Action[] AfterStateChangedActions
Output[] Outputs                   // transições
Dictionary<string,JToken> ExtensionData
Action[] LocalCustomActions
```

**Regras de validação impostas pelo motor `[SDK]`** — são o contrato real de um fluxo válido:
- **exatamente um** state com `Root = true`;
- o state root **tem que esperar uma entrada** (`Input != null`, e `Input.Bypass` proibido exceto em
  subflow);
- o state root **não pode ter condições** de entrada;
- subflow com `Version < 2` é rejeitado.

**`Input`:**
```csharp
bool Bypass                        // não espera entrada, segue direto
Condition[] Conditions
InputValidation Validation         // rule: text | number | date | regex | type | ...
TimeSpan? Expiration               // expiração da espera
string Variable                    // onde guardar — só letras, números e pontos
```

**`Output` (a transição):**
```csharp
int Order                          // ordem de avaliação
Condition[] Conditions
string StateId                     // destino
```

**`Action`:**
```csharp
string Id, Title
int Order
Condition[] Conditions
double? Timeout
bool ContinueOnError
bool ExecuteAsynchronously
string Type                        // ver lista abaixo
JRaw Settings                      // payload livre, específico do tipo
```

**`Condition`:**
```csharp
ValueSource Source                 // Input | Context | Intent | Entity
string Variable                    // obrigatório se Source = Context
string Entity                      // obrigatório se Source = Entity
ConditionComparison Comparison
ConditionOperator Operator         // Or | And
string[] Values
```

`ConditionComparison`: `Equals`, `NotEquals`, `Contains`, `StartsWith`, `EndsWith`, `GreaterThan`,
`LessThan`, `GreaterThanOrEquals`, `LessThanOrEquals`, `Matches` (regex), `ApproximateTo` (fuzzy),
`Exists`, `NotExists`. As duas últimas são **unárias** — o motor rejeita se vierem com `Values`; as
outras são binárias e rejeitam `Values` vazio.

**Tipos de Action registrados no motor `[SDK]`** (diretório `Take.Blip.Builder/Actions/`):

| Action | O que faz |
|---|---|
| `SendMessage` / `SendRawMessage` / `SendMessageFromHttp` | Envia mensagem |
| `SendCommand` / `ProcessCommand` | Dispara comando LIME (fire-and-forget / com resposta) |
| `ProcessHttp` | Requisição HTTP externa |
| `ExecuteScript` / `ExecuteScriptV2` | JavaScript no fluxo |
| `ExecuteTemplate` | Template de texto |
| `SetVariable` / `DeleteVariable` | Variável de contexto |
| `SetBucket` | Escreve em bucket |
| `MergeContact` | Atualiza o contato |
| `CreateTicket` | Abre ticket no Desk |
| `Redirect` | **Handover para outro bot/serviço** (§5.4) |
| `TrackEvent` / `TrackContactsJourney` | Analytics |
| `ManageList` | Lista de distribuição (broadcast) |
| `ProcessContentAssistant` | Base de conteúdo de IA |

`[SDK]` Headers que o motor injeta em `ProcessHttp`: `X-Blip-User`, `X-Blip-Bot`, `X-Blip-StateId`.
Útil se o Pipe for receber chamadas HTTP vindas de um fluxo — dá para identificar bot, usuário e
bloco de origem sem combinar nada.

### 5.1.1 O JSON exportado de verdade `[SDK-PY]`

O modelo C# acima é o que o **motor** carrega. O JSON que o **portal** exporta tem um envelope em
volta dele. Isso está confirmado pelo parser oficial da Take, `blip_flowanalysis` (PyPI, pacote
`blip_flowanalysis-0.6.1`, módulo `core/flow.py`) — que lê fluxos reais exportados, então os nomes
de chave abaixo são **ground truth**, não tradução minha do C#.

**Onde achar o JSON do fluxo** (documentado no docstring do parser): `portal.blip.ai` → o chatbot →
*Configurações* → *Configurações básicas* → *Configurações avançadas* → tabela com colunas
`Owner` / `Caller` / **`Value`** — a coluna `Value` é o fluxo. Internamente a tabela se chama
`OwnerCallerValue`.

```jsonc
{
  "identifier": "<identidade do bot>",
  "settings": {
    // ou "flow" (bot comum e serviço) ou "children" (roteador) — nunca os dois
    "flow": {
      "configuration": {
        "builder:useTunnelOwnerContext": "true"   // ← "Utilizar o contexto do Roteador"
      },
      "states": [
        {
          "id": "<stateId>",
          "name": "<nome do bloco>",              // existe no JSON, NÃO existe no modelo C#
          "inputActions":  [ { "type": "TrackEvent", "settings": { "category": "...", "action": "..." } } ],
          "outputActions": [ { "type": "ProcessHttp", "settings": { "method": "POST", "uri": "...",
                                "headers": {}, "body": "...",
                                "responseStatusVariable": "...", "responseBodyVariable": "..." } } ],
          "outputs": [ { "stateId": "<destino>",
                         "conditions": [ { "source": "context", "variable": "x",
                                           "comparison": "equals", "values": ["y"] } ] } ]
        }
      ]
    },
    "children": [ /* só em roteador: a lista de subbots/serviços */ ]
  }
}
```

**Como o parser oficial classifica um bot `[SDK-PY]`** — tabela-verdade literal do código:

| `settings.children` existe? | `settings.flow.configuration["builder:useTunnelOwnerContext"]` existe? | Tipo |
|---|---|---|
| não | não | **standalone** |
| não | sim | **service** (subbot de roteador) |
| sim | não | **router** |
| sim | sim | **unknown** (estado inválido) |

Duas consequências práticas:
1. **Dá para descobrir programaticamente se um bot é roteador, subbot ou avulso** — basta ler o JSON
   do fluxo e olhar essas duas chaves. Não precisa perguntar a ninguém nem inferir por tentativa e
   erro de chave.
2. **`builder:useTunnelOwnerContext` é a chave técnica por trás da opção "Utilizar o contexto do
   Roteador"** que o artigo de Master-State `[HELP]` exige como pré-requisito (§5.3). Auditável.

`[SDK-PY]` **Sintaxe de interpolação de variável dentro do fluxo** — o parser reconhece quatro
formas equivalentes ao procurar uso de uma variável:
```
{{nomeVariavel}}     ${nomeVariavel}     {{context.nomeVariavel}}     ${context.nomeVariavel}
```

`[SDK-PY]` Convenções de `stateId` observadas no material oficial: blocos de sistema usam prefixo —
`desk:<uuid>` para o bloco de atendimento humano, e ids literais como `onboarding`, `welcome`,
`fallback` para blocos padrão do template.

### 5.1.2 Variáveis do Builder — os cinco namespaces `[HELP]`

Nenhuma fonte local mapeava isto, e é o vocabulário que qualquer integração com fluxo precisa falar.
Regra geral: nome de variável é **só alfanumérico**, sem caractere especial, e **case-sensitive**.

| Namespace | Sintaxe | O que é | Escrita? |
|---|---|---|---|
| **Contexto** | `{{nome}}` ou `{{context.nome}}` | Variável da conversa. Preenchida por entrada do usuário, requisição HTTP, script, `SetVariable` ou `ProcessCommand`. | sim |
| **Contato** | `{{contact.nome}}` | Campos do Contact (§3.2) | via `MergeContact` |
| **Configuração** | `{{config.nome}}` | Variáveis globais do bot (Builder → Configurações → Variáveis de configuração) | só no portal |
| **Sistema** | `{{nome}}` | Ver tabela abaixo | **não — read-only** |
| **Secreta** | `{{secret.nome}}` | Valor sigiloso (token de API). Suprimido depois de salvo; para trocar o nome é preciso reinserir o valor. | só no portal |

`[HELP]` Variáveis de contato disponíveis: `name`, `address`, `city`, `email`, `source`,
`phoneNumber`, `photoUri`, `cellPhoneNumber`, `gender`, `timezone`, `culture`, `extras`, `identity`,
`group`. **Aviso oficial:** *"alguns canais não fornecem nenhuma informação de contato além do
identificador, definido pela variável `{{contact.identity}}`"*.

`[HELP]` Variáveis de sistema, agrupadas:

| Grupo | Variáveis |
|---|---|
| **Aplicação** | `application.domain`, `application.identifier`, `application.identity`, `application.instance`, `application.node` |
| **Calendário** | `calendar.datetime`, `.date`, `.day`, `.month`, `.year`, `.time`, `.hour`, `.minute`, `.second`, `.unixTime`, `.unixTimeMilliseconds`, `.dayOfWeek` (0=domingo, 6=sábado) — **todos GMT-0**. Mesmas chaves sob `calendar.tomorrow.*` e `calendar.yesterday.*`. Manipulação: `calendar.plus/minus <n> <milisseconds\|seconds\|minutes\|hours\|days\|weeks\|months\|years\|dayOfWeek>` |
| **Entrada** | `input.content`, `input.length`, `input.type`, `input.message`, `input.message.from`, `.fromidentity`, `.id`, `.pp`, `.ppidentity`, `.to`, `.toidentity` |
| **NLP** | `input.intent.id`, `.name`, `.score`, `.answer`; `input.entity.<nome>.id`, `.name`, `.value` |
| **Estado** | `state.id`, `state.name`, `state.previous.id`, `state.previous.name` |
| **Tunnel** | `tunnel.owner`, `tunnel.identity`, `tunnel.originator`, `tunnel.destination` — **só existem em mensagem que veio por tunnel** (ou seja, sempre que há roteador) |
| **Aleatório** | `random.guid`, `random.string`, `random.integer` |
| **Desk** (só em resposta rápida) | `agent.identity`, `agent.fullName`, `agent.firstName`, `agent.email`, `agent.phoneNumber` |

**Achado que importa para o Pipe:** `tunnel.originator` está disponível **dentro do fluxo**, como
variável. `[DOC]` define: *"nó originador do tunnel, que é o identificador do cliente no dono do
tunnel. Num roteador, é o identificador original do cliente."* Ou seja — **o telefone real do cliente
pode ser carimbado em `extras` do contato pelo próprio fluxo**, sem nenhuma chamada a
`/tunnels/{uuid}`. Isso contorna a armadilha central documentada em `apis.md` §1.7 (cruzar campanha
por telefone contra `customer_identity` dá zero) **na origem**, em vez de resolver depois. Custo:
uma ação `MergeContact` num bloco de entrada.

### 5.2 Manipular o fluxo pela API `[DOC]`

```jsonc
// Substituir o JSON do fluxo principal
{ "to":"postmaster@builder.msging.net", "method":"set",
  "uri":"/buckets/blip_portal:builder_working_flow",
  "type":"application/json", "resource": { /* o fluxo */ } }

// Substituir o JSON de um subflow
{ "to":"postmaster@builder.msging.net", "method":"set",
  "uri":"/subflows/{shortname}/configurations/edited-flow",
  "type":"application/vnd.lime.document+json",
  "resource": { "name":"edited-flow", "document": { /* fluxo */ } } }
```

`[DOC]` **Aviso explícito da própria doc:** *"este comando só altera o JSON do fluxo, mas você ainda
precisa ir ao Builder e publicá-lo manualmente."* Não existe publicação por API para o fluxo
principal. (Há uma URI `/subflows/{shortname}/publish` num exemplo de SDK, mas a própria doc repete
o aviso do passo manual — tratar como não confiável.)

### 5.3 Estado do usuário: `state`, `subflow`, `masterState` `[DOC]` `[HELP]`

Três variáveis de contexto distintas controlam onde o usuário está. Confundir as três é a fonte
clássica de "mudei o estado e não aconteceu nada".

| Variável | URI | `to` | Resource | O que controla |
|---|---|---|---|---|
| **state** | `/contexts/{identity}/stateid@{flowId}` | `postmaster@builder.msging.net` `[DOC]` ou `postmaster@msging.net` `[HELP]` | `{stateId}` (`text/plain`) | Em qual **bloco** o usuário está |
| **subflow** | `/contexts/{identity}/currentFlowSession@{flowId}` | `postmaster@builder.msging.net` | `{shortname-do-subflow}` (`text/plain`) | Em qual **subfluxo**. **Valor vazio = fluxo principal** |
| **masterState** | `/contexts/{identity}/Master-State` | `postmaster@msging.net` | `{idDoSubbot}@msging.net` (`text/plain`) | Em qual **subbot/serviço** do roteador |

`[DOC]` `get`/`set`/`delete` funcionam nas três. `GET /contexts/{identity}` lista as variáveis;
`GET /contexts/{identity}?withContextValues=true` traz os valores junto.

`[HELP]` **Regras práticas oficiais para mover um usuário entre subbots** (artigo de 12/01/2026):

1. Use o **token do Roteador**, não o do subbot.
2. `contact.identity` é o identificador do usuário **no roteador** (ex.: `5511…@wa.gw.msging.net`).
3. **Pré-requisito não óbvio:** a opção *"Utilizar o contexto do Roteador"* precisa estar ativada
   nas configurações de fluxo de **todos** os subbots vinculados. Sem isso, o Master-State não
   surte efeito.
4. Faça o Master-State **primeiro**, o Change-User-State **depois**.
5. **Armadilha documentada:** o bloco para o qual o usuário é direcionado **não exibe seu
   conteúdo** — executa apenas as condições e ações de saída, avaliadas depois da próxima resposta
   do usuário. Por isso o padrão recomendado é apontar para um bloco vazio, só com entrada de
   usuário, e tratar a resposta nas condições de saída.

### 5.4 Redirect — como um fluxo chama outro `[DOC]`

`application/vnd.lime.redirect+json`. Duas formas:

```jsonc
// (a) por nome de serviço, definido nas configurações do modelo mestre
{ "to": "{tunnelId}@tunnel.msging.net", "type": "application/vnd.lime.redirect+json",
  "content": { "address": "atendimento" } }

// (b) por identificador do bot, com contexto
{ "content": { "address": "mysdkbot@msging.net",
               "context": { "type": "<mime>", "value": { /* documento */ } } } }
```

`[DOC]` Restrição explícita: *"redirecionamento só é suportado em chatbots configurados como
serviços no modelo mestre (master template)"*. E: *"nesse caso todas as mensagens terão o domínio
`@tunnel.msging.net`, já que o modelo mestre usa a extensão tunnel para se comunicar com os
serviços (subbots)"*.

**Conclusão de arquitetura, oficial:** o tunnel não é uma esquisitice de configuração da AUVP — é
**o mecanismo pelo qual o modelo mestre funciona**. Se há roteador, há tunnel, sempre. A armadilha
do `customerIdentity` ser UUID de tunnel `[REAL]` é estrutural, não acidental.

`[HELP]` **Armadilha de teste, oficial e literal:** *"O redirecionamento funciona apenas no Bot
Router. Se você realizar testes nos Subbots, o redirecionamento não funcionará e você será
direcionado ao bloco de exceções."* Ou seja: um Redirect que "não faz nada" e cai na exceção
normalmente não é bug do fluxo — é teste no bot errado. `[HELP]` O identificador do serviço tem que
ser exatamente o mesmo cadastrado nas configurações de **Serviços** do roteador.

`[DOC]` **O Redirect é também o canal de retorno do Desk:** quando o atendente humano fecha o
atendimento, o bot recebe uma mensagem `application/vnd.lime.redirect+json` cujo `content.context`
carrega o Ticket completo:

```json
{ "to": "54f1dd2e-…@tunnel.msging.net",
  "type": "application/vnd.lime.redirect+json",
  "content": { "context": { "type": "application/vnd.iris.ticket+json",
    "value": { "id":"…", "sequentialId":0, "sequentialSuffix":"SFX",
               "ownerIdentity":"bot@msging.net",
               "customerIdentity":"1654804277843415@messenger.gw.msging.net",
               "agentIdentity":"ravpacheco%40gmail.com@blip.ai",
               "status":"ClosedAttendant", "storageDate":"2018-03-20T20:41:54.330Z",
               "externalId":"3cf18133-…", "rating":0, "team":"Default",
               "unreadMessages":0 } } } }
```

**É assim que se detecta fechamento de atendimento em tempo real dentro do fluxo** — registrar um
receiver para `application/vnd.lime.redirect+json`. Confirma também o formato
`email%40dominio@blip.ai` do `agentIdentity`/`closedBy` `[REAL]`. (Há um segundo caminho, por
webhook — ver §8.)

### 5.5 Roteador e "skills" — o que a documentação oficial diz

`docs.blip.ai` **não usa a palavra "roteador"**. Aparece só como `masterstate` (marcado
`//only for router` no payload de campanha) e como o parâmetro `getFromOwnerIfTunnel`. A doutrina
oficial está na central de ajuda `[HELP]`:

| Termo oficial | Definição `[HELP]` |
|---|---|
| **Bot Router** | Bot responsável por gerenciar os subbots. **É o bot que o cliente vê** — é ele que se publica e testa nos canais. **O roteador não tem regras nem conteúdo**, só a referência de todos os subbots. Precisa ter no mínimo 1 subbot. |
| **Main SubBot** | Quando um usuário fala com o roteador pela primeira vez, é direcionado ao subbot principal. É ele que decide, na primeira vez, qual subbot vai atender. Com um único subbot, ele é o principal. |
| **Subbot** | Qualquer bot pertencente à hierarquia de um roteador. |
| **Service (serviço)** | **Todo subbot é reconhecido como um "serviço" do roteador.** O nome de serviço existe para permitir que subbots de mesmo nome coexistam num roteador — é esse nome que o `Redirect` usa. |
| **Redirection expiration** | Tempo (em segundos) durante o qual um subbot permanece ativo na conversa em relação à última interação do cliente. |

**"Skill" não é terminologia oficial da Blip.** Nem `docs.blip.ai` nem os artigos de ajuda
consultados usam a palavra no sentido de "sub-bot especialista" — o termo oficial é **serviço** ou
**subbot**. Aparece em material de blog/comunidade, não na referência. Se o Pipe for expor esse
conceito, use "serviço" para casar com o vocabulário do portal.

**Consequência prática do "o roteador não tem conteúdo":** um integrador que só tenha a chave do
roteador consegue endereçar (Master-State, campanha) mas não consegue ler `/attendants` nem
`/rules`. Isso **explica** a descoberta de `blip-schema-real.md` §0: não é permissão, é que esses
recursos pertencem ao subbot, e o roteador por definição não tem conteúdo próprio.

---

## 6. Autenticação `[DOC]`

- Header: `Authorization: Key <chave>` — a palavra `Key` é literal.
- A chave é `base64(identificador:accessKey)`. A doc dá um exemplo decodificável:
  `bWVzc2FnaW5naHViQHRha2VuZXQuY29tLmJyOjEyMzQ=` → `messaginghub@takenet.com.br:1234`.
  Confirma o formato `identidade:accessKey` sem margem para dúvida.
- **Como obter:** Portal Blip → o chatbot → *Configurações* (engrenagem) → *Informações de conexão*.
  Existem **duas** seções distintas nessa tela:
  - **Conexão SDK** — dá `identifier` + `accessKey` separados (usados por WebSocket/TCP).
  - **HTTP Endpoints** — dá o token de `Authorization` já montado.
  São a mesma credencial em formatos diferentes.
- Host: `https://{{contract_id}}.http.msging.net/{messages|notifications|commands}`. A doc define
  `contract_id` como *"parte da sua URL"*. (Nota nossa: `apis.md` registra que pode existir um
  `command_host` divergente cadastrado por bot — a doc oficial não menciona essa possibilidade.)
- Nos SDKs C#, a credencial vai em `application.json` (`identifier` + `accessKey`).

---

## 7. Limites de taxa e paginação `[DOC]`

### 7.1 Throughput — a tabela completa

`apis.md` registra só a linha de comandos. A tabela oficial tem três:

| Tipo de envelope | Free | Paid |
|---|---|---|
| **Mensagens** (por segundo) | **3** | **50** |
| **Notificações** (por segundo) | **6** | **100** |
| **Comandos** (por segundo) | 48 | 200 |

`[DOC]` Ao exceder, *"as próximas requisições recebem automaticamente um retorno 429 por um período
de 2 minutos"*. Recomendação oficial: implementar controle de fila. **Não há orientação de
retry/backoff** — o cliente que se vire.

**Observação de produto:** 3 mensagens/s no free e 50/s no pago é *ordens de grandeza* mais
apertado que os comandos. Um espelhamento de conversa que reenvie mensagens satura muito antes de
saturar leitura. A relação notificação:mensagem é exatamente 2:1 nos dois planos — coerente com o
padrão de emitir `received` + `consumed` por mensagem.

### 7.2 Paginação

`[DOC]` Confirmado: `$skip` e `$take`, **`$take` máximo 100**. Reconfirmado ao vivo com a mensagem
de erro exata `[REAL]` (`"The take parameter can not be greater than 100"`).

Outros parâmetros de query documentados:
- `$ascending=true` (ordem alfabética ascendente) — em `/tickets/{id}/messages`.
- `getFromOwnerIfTunnel=true` — obrigatório com roteador.
- `refreshExpiredMedia=true` — em `/threads/{identity}`, renova URLs de mídia expiradas.
- `withContextValues=true` — em `/contexts/{identity}`.
- `?version=2` — em todos os `/monitoring/*`.
- `?expiration={ms}` — em `/buckets/{id}` (TTL).
- `?secure=true` — em `/upload-media-uri`.

`[DOC]` Não há paginação por cursor documentada em lugar nenhum. `/threads` pagina por
`storageDate` `[REAL]`, mas isso não está na documentação oficial.

---

## 8. Webhooks e eventos

**Existem dois mecanismos distintos, e eles não estão no mesmo lugar da documentação.** O primeiro
está em `docs.blip.ai` e é o canal do *bot*; o segundo está só na central de ajuda, é um produto de
integração à parte, e é o que de fato interessa ao Pipe.

### 8.1 Endpoints HTTP do bot `[DOC]`

Portal → o chatbot → *Configurações* → *Informações de conexão* → *HTTP Endpoints*:

| Configuração | O que recebe |
|---|---|
| *Url to receive messages* | `POST` com cada **Message** endereçada ao bot |
| *Url to receive notification* | `POST` com cada **Notification** |

Requisito: endpoint **HTTPS público**. Pode ser a mesma URL para as duas ou uma para cada. É o
caminho de quem **implementa o bot** por HTTP em vez de SDK — o endpoint *substitui* o motor do bot,
não observa ele.

### 8.2 Webhook de dados — Portal → **Integrações → Webhook** `[HELP]`

Este é um recurso separado, com documentação própria (seção "Webhook" da central de ajuda), e
**é o mais próximo de um webhook de eventos que a Blip tem**. Com ele ligado, *"todas as informações
de mensagens, eventos e contatos trafegadas na plataforma serão enviadas para as URLs definidas"*.

**Configuração:** Portal → o bot → módulo **Integrações** → **Webhook** → cadastrar ao menos uma URL
→ **ativar a chave no canto superior direito** (fácil de esquecer). Por URL, dá para configurar:

| Opção avançada | O que faz |
|---|---|
| **Tipos de envio** | Escolher se aquela URL recebe só **Contatos**, só **Eventos**, só **Mensagens** — ou combinações. Permite uma URL por tipo. |
| **OAuth 2.0** | Só o fluxo **Client Credentials** (servidor-a-servidor). |
| **Cabeçalhos customizados** | Pares chave/valor anexados a toda requisição — o caminho oficial para um "segredo compartilhado" quando OAuth não serve. |

Requisito do seu lado `[HELP]`: URL pública, `POST`, corpo JSON, e *"recomendamos responder aos
envios com HTTP 200 OK"*. Mudanças de configuração **levam alguns minutos para valer** (cache).

#### Os três tipos de item e como distingui-los `[HELP]`

**Não existe um campo que diga o tipo do item.** A heurística é oficial e é esta:

| Se o item tem… | …é |
|---|---|
| campo `type` | **Mensagem** |
| campo `category` | **Evento** |
| campo `lastMessageDate` | **Contato** |

A própria doc recomenda, como alternativa, *"configurar uma URL específica para cada tipo de envio"*
— o que é claramente o que o Pipe deve fazer: três rotas, zero adivinhação.

**Mensagem** — campos: `type` (obrigatório), `content` (obrigatório, string **ou** objeto), `id`
(obrigatório), `from`, `to`, `metadata` (obrigatório). A data/hora sai de
`metadata["#envelope.storageDate"]` (UTC-0). Valores de `type` que a doc lista: `text/plain`,
`application/json`, `application/vnd.iris.ticket+json`, `application/vnd.lime.collection+json`,
`.media-link+json`, `.reaction+json`, `.redirect+json`, `.reply+json`, `.select+json`.

> **A frase mais importante deste documento inteiro** `[HELP]`: *"Por razões históricas, [as
> mensagens] também incluem **algumas atualizações de tickets, como abertura, fechamento e
> transferência**."*
>
> Ou seja: **abertura, fechamento e transferência de ticket chegam por webhook**, como item do tipo
> Mensagem com `type: "application/vnd.iris.ticket+json"` e o objeto Ticket inteiro em `content`.
> Isso **derruba a conclusão anterior** de que só o fechamento seria observável e o resto exigiria
> polling. O exemplo oficial ("Ticket puxado pelo atendente") traz `status: "Waiting"`, `team`,
> `customerInput`, `priority` — o mesmo shape do `GET /tickets`.

Metadata útil que a doc exemplifica em mensagem real: `#messageEmitter: "Human"` (**distingue
mensagem de atendente humano de mensagem do bot** — não estava em nenhuma fonte local),
`#stateId`/`#stateName`/`#previousStateId`/`#previousStateName`, `#tunnel.owner`,
`#tunnel.originator`, `#tunnel.originalFrom`, `#tunnel.originalTo`, `#messageKind: "Response"`,
`#wa.timestamp`, `#wa.voice: "true"` (áudio gravado vs. arquivo enviado), `#uniqueId`,
`#date_processed`, `date_created`, `traceparent`. Confirma e amplia o levantamento de
`blip-schema-real.md` §2.4.

**Evento** (*event-track*) — disparado pela ação "Registro de eventos", pelo "Tracking automático"
do Builder, ou pela API HTTP:

| Campo | Tipo | Obrigatório | O que é |
|---|---|---|---|
| `ownerIdentity` | string | sim | bot ao qual o evento pertence |
| `identity` | string | não | **[obsoleto]** contato que disparou |
| `contact` | objeto | não | `{ "Identity": "…" }` — o substituto de `identity` |
| `messageId` | string | não | mensagem que originou (uma mensagem pode gerar vários eventos) |
| `storageDate` | string | sim | UTC-0 |
| `category` | string | sim | hierarquia **mais alta** |
| `action` | string | sim | subcategoria / hierarquia **mais baixa** |
| `extras` | objeto | não | metadados automáticos (`stateId`, `#stateName`, `#stateId`, `#messageId`, `#previousStateId`, `#previousStateName`) + campos personalizados da ação |

`[HELP]` O *tracking automático* do Builder emite `category: "flow"` com `action` = nome do bloco, e
`extras.stateId` com prefixo de sistema (ex.: `desk:<uuid>` no bloco de atendimento humano). **É um
rastro de navegação por bloco, de graça, sem instrumentar nada** — a base natural de um funil.

**Contato** — *"sempre que qualquer campo de um contato é atualizado, a versão mais recente do
contato completo é enviada"*. Schema = §3.2. Campo âncora: `lastMessageDate`.

> `[HELP]` **Aviso de ordenação, literal:** *"devido à natureza assíncrona e paralela do Blip, não
> há garantia de que as atualizações serão recebidas em ordem estritamente cronológica."* Um
> consumidor que aplique updates de contato na ordem em que chegam **vai regredir campos**. Exige
> comparar `lastMessageDate` (ou um relógio próprio) antes de gravar.

#### Entrega, latência e bloqueio `[HELP]`

- **Fila, não entrega síncrona.** Os dados entram numa fila logo após serem gerados. *"Durante
  períodos de alto tráfego, o processamento dos envios pode demorar mais, chegando até cerca de
  **2 horas**."* Webhook da Blip **não é tempo real** — é eventual, com cauda longa.
- **Bloqueio por falha consecutiva**, e as duas fontes oficiais divergem no número:
  - artigo *"Enviando dados para análise através de Webhooks"*: *"grande volume de falhas
    consecutivas no envio do mesmo tipo de dado (contatos, eventos, mensagens **ou tickets**) →
    integração bloqueada por **4 horas**"*;
  - artigo *"Regra de bloqueio de URLs inválidas no Webhook"*: *"20.000 vezes CONSECUTIVAS →
    bloqueada por **3 dias**"*, e ao fim do bloqueio a contagem recomeça.

  `[INFER]` Provavelmente são dois mecanismos em camadas (um circuit-breaker curto e um bloqueio
  longo), ou a doc de um dos dois está desatualizada. **Trate o pior caso: uma URL que fica fora do
  ar perde dados por dias, sem replay.** Note também que o primeiro artigo lista **tickets** como um
  quarto tipo de item — o segundo lista só três.
- **O bloqueio é por tipo de item.** Mensagens podem estar bloqueadas enquanto eventos e contatos
  seguem chegando. Um monitoramento que olhe "o webhook está recebendo?" no agregado não detecta.
- **Não há reenvio nem replay documentado.** O que é bloqueado, some.

### 8.3 O que continua não existindo

- **Nenhuma assinatura HMAC do payload.** A autenticidade se prova por OAuth 2.0 ou por header
  customizado secreto — e **nenhum dos dois protege contra replay** (não há timestamp assinado,
  ao contrário do Chatwoot).
- **Nenhum `delivery_id` nem dedupe do lado da Blip.** O `id` do envelope é a única chave de
  idempotência — o que reforça a regra de nunca reaproveitar `id`.
- **Nenhum catálogo de eventos de negócio assinável** (`ticket.transferred`, `agent.status_changed`
  etc.). O que chega é o *dado bruto* (mensagem/evento/contato), não um evento semântico. Derivar
  "transferência" é trabalho do consumidor.
- **`subscribe`/`unsubscribe` do LIME** `[LIME]` existe no protocolo, mas `docs.blip.ai` não
  documenta nenhuma URI que aceite. Sem evidência de implementação.

### 8.4 Consequências para o Pipe

1. **O desenho certo é híbrido, não polling puro.** Webhook (Integrações) para o fluxo contínuo de
   mensagens/eventos/contatos + reconciliação periódica por `GET` para fechar buracos de bloqueio e
   de ordenação. Webhook sozinho não é confiável o bastante (2h de latência, bloqueio de 3 dias, sem
   replay); polling sozinho é caro e perde o `#messageEmitter`.
2. **Uma URL por tipo de item**, sempre — a heurística de `type`/`category`/`lastMessageDate` é
   frágil e a própria Blip recomenda separar.
3. **Exigir header secreto ou OAuth, e validar antes de processar.** Sem HMAC, o header é a única
   prova de origem.
4. **Update de contato precisa de guarda de ordem** (comparar `lastMessageDate` com o que já está
   gravado antes de sobrescrever), porque a Blip avisa que não garante ordem.
5. **Monitorar a saúde do webhook por tipo**, não no agregado, e alarmar em queda de volume — o
   bloqueio é silencioso do lado de quem recebe.

---

## 9. Onde a documentação oficial diverge do que sabemos

Registro explícito, porque a doc oficial **não** é a última palavra:

| # | Item | `docs.blip.ai` diz | Realidade / outra fonte |
|---|---|---|---|
| 1 | `ClosedClientInactivity` | **não existe** — o enum tem 7 valores e esse não é um | `regras-blip.md` e `blip-schema-real.md` o listam como estado terminal |
| 2 | `Assigned` | existe, é estado intermediário aguardando `consumed` do atendente | **nenhuma fonte local o registrava** |
| 3 | Contatos | `postmaster@crm.msging.net` | `apis.md` usa `postmaster@msging.net` (e a sondagem real não deu erro de processador) |
| 4 | `/contexts` | `postmaster@builder.msging.net` | `apis.md` usa `postmaster@msging.net`; `[HELP]` usa `@msging.net` para Master-State |
| 5 | `GET /ticket/{id}` | existe, **singular** | `apis.md` afirma que "GET /tickets/{id} não é suportado" — provavelmente pluralização errada |
| 6 | Fechados | `$closed=true` como parâmetro separado | `status eq 'closed'` falha sempre `[REAL]` — agora se sabe por quê |
| 7 | `/tickets/{id}/full-data` | **não existe na documentação** | `apis.md` e a skill o descrevem; ao vivo devolve "no processor available" `[REAL]` |
| 8 | `/attendance-survey-answer/summary` | **não existe na documentação** | usado hoje; ao vivo devolve `{closedTicketsCount, answersCount}` `[REAL]` |
| 9 | Schema do Ticket | não lista `ownerIdentity`/`customerIdentity` na tabela de schema (só na tabela de filtro) | ambos vêm 123/123 ao vivo |
| 10 | Campos reais fora do contrato | `CampaignId`, `isAutomaticDistribution`, `distributionType`, `folderId` **não existem na doc** | todos observados ao vivo `[REAL]` |
| 11 | `Priority` da Rule | "a ordem de criação da regra" | fecha a lacuna de `blip-schema-real.md`, mas **não** diz a ordem de avaliação |
| 12 | Cadastro de fila | existe: `/attendance-queues` | `blip-schema-real.md` supôs que só existisse via portal |
| 13 | `command_host` divergente por bot | **não mencionado** | `apis.md` registra que existe |
| 14 | `200 OK` com `status: failure` | **nunca mencionado** — só exemplos de sucesso | armadilha nº 1 do `apis.md`, reconfirmada `[REAL]` |
| 15 | `Pause` vs `Paused` | `Pause` (=1) | `blip-desk-funcoes.md` escreve `Paused` |
| 16 | **Webhook de dados** | **`docs.blip.ai` não menciona** o módulo Integrações → Webhook | existe, documentado só em `[HELP]`, e entrega mensagens/eventos/contatos + abertura/fechamento/transferência de ticket (§8.2) |
| 17 | Fila `Default` | não mencionada | `[HELP]`: é o destino de todo ticket que não casa com nenhuma regra |
| 18 | Nível de prioridade | `priority` é `int`, sem enum | `[HELP]`: a UI só oferece baixa/média/alta, e "sem prioridade" é o nível de baixo — 4 níveis, mas `0..7` observado `[REAL]` |
| 19 | Bloqueio de webhook por falha | — | duas fontes `[HELP]` divergem: "4 horas" num artigo, "20.000 falhas consecutivas → 3 dias" no outro |
| 20 | Tipos de item do webhook | — | um artigo `[HELP]` lista 3 (mensagens/eventos/contatos), outro lista 4 (inclui **tickets**) |

---

## 10. Não consegui

- **A ordem de avaliação das regras de atendimento** (crescente por `Priority`? primeira que casa
  vence?). A doc define `Priority` como ordem de criação e `[HELP]` define o fallback (`Default`),
  mas nenhuma das duas descreve o algoritmo de escolha entre regras que casam.
- **Como `Ticket.priority` (0..7) é preenchido.** `[HELP]` confirma que a UI só expõe
  baixa/média/alta (+ "sem prioridade"), o que **não** explica os seis valores distintos observados.
  A hipótese de codificar fila+grau é `[INFER]`.
- **A regra de deslocamento de parâmetro por mídia no cabeçalho, afirmada por fonte oficial.** O
  schema de `components[]` (§3.9) mostra que o dado existe (`type: "HEADER"` vs `"BODY"`), mas
  nenhuma documentação afirma que a presença de mídia no header desloca os `{{n}}` do body. A regra
  continua apoiada só no payload real de `apis.md`.
- **Qual dos dois números de bloqueio de webhook vale** (4 horas vs. 3 dias / 20.000 falhas) e se
  **tickets** são mesmo um quarto tipo de item separado. Dois artigos oficiais se contradizem.
- **Se existe replay/reenvio de webhook** após um bloqueio. Nenhuma fonte menciona; presumo que não.
- **Confirmar o JSON do fluxo contra um export real da AUVP.** §5.1.1 vem do parser oficial
  `[SDK-PY]`, que lê fluxos reais — é forte, mas não é um export nosso. Barato de fechar: exportar
  um fluxo e comparar as chaves.
- **A lista completa de `Action.type` como aparecem no JSON.** §5.1 traz os nomes das pastas do
  código C#; `[SDK-PY]` confirma três literais no JSON (`TrackEvent`, `ProcessHttp`,
  `ExecuteScript`), o que sugere que os nomes batem 1:1, mas não confirmei todos.
- **Se a Blip implementa `subscribe`/`unsubscribe` do LIME em algum recurso.** A spec define; a doc
  da Blip não menciona nenhuma URI que aceite. Não testei (exigiria `subscribe` contra produção).
- **`/attendance-survey-answer/*` sem `/summary`.** Continua sem confirmação de que exista uma
  variação que devolva respostas individuais.
- **`help.blip.ai` bloqueia WebFetch (403).** Contornado usando a **API pública do Zendesk**:
  `https://help.blip.ai/api/v2/help_center/{locale}/articles/search.json?query=…` para buscar e
  `…/articles/{id}.json` para o corpo. Fica registrado como método — é muito mais barato que raspar
  HTML, e a central tem 423 artigos só para "regras de atendimento". **Há bastante material ainda
  não lido lá** (Desk Actions em beta, Agente de IA, Copilot, Queue Assistant, bibliotecas de
  blocos, Marketing Messages Lite API).

---

## 11. Fontes

| URL | O que forneceu |
|---|---|
| https://docs.blip.ai/ | Referência oficial completa (página única, ~3 MB, baixada e processada localmente): conceitos, envelopes, endereçamento, canais, content types, ~110 documentos com schema, todas as extensões e URIs, throughput, autenticação, HTTP/webhooks |
| https://limeprotocol.org/ | Especificação do protocolo: quatro envelopes, campos obrigatórios, estados de sessão, handshake, endereçamento |
| https://limeprotocol.org/content-types.html | Content types `application/vnd.lime.*` com schema e exemplo |
| https://limeprotocol.org/resources.html | Resource types `application/vnd.lime.*` com URI canônica e campos |
| https://help.blip.ai/hc/pt-br/articles/37613972353687-Como-direcionar-usuários-para-um-subbot-e-bloco-específico-via-API | Master-State, Change-User-State, pré-requisito do contexto do roteador, armadilha do bloco sem conteúdo |
| https://help.blip.ai/hc/en-us/articles/4474398386711-Undestanding-bot-and-subbot-hierarchy-or-architecture | Definições oficiais de Bot Router, Main SubBot, Subbot, Service, Redirection expiration |
| https://github.com/takenet/blip-sdk-csharp — `src/Take.Blip.Builder/Models/` (`Flow.cs`, `State.cs`, `Input.cs`, `Output.cs`, `Action.cs`, `Condition.cs`, `ConditionComparison.cs`, `ConditionOperator.cs`, `ValueSource.cs`, `FlowType.cs`, `Constants.cs`) | Estrutura do fluxo, regras de validação, enums de condição, headers injetados |
| https://github.com/takenet/blip-sdk-csharp — `src/Take.Blip.Builder/Actions/` | Catálogo de tipos de Action do Builder |
| https://pypi.org/project/blip-flowanalysis/ — pacote `blip_flowanalysis-0.6.1`, `core/flow.py`, `analysis/*` | **Estrutura real do JSON exportado do fluxo**: `identifier`/`settings`/`flow`/`children`/`states`/`outputs`, `builder:useTunnelOwnerContext`, tabela-verdade router/service/standalone, sintaxe de interpolação de variável, onde achar o JSON no portal (`OwnerCallerValue`) |
| https://help.blip.ai/hc/pt-br/articles/29187147295767-Formato-dos-envios-no-webhook | **Schema dos três tipos de item do webhook** (mensagem/evento/contato), heurística de identificação, metadata real, `#messageEmitter`, aviso de ordem não garantida, e a frase sobre atualizações de ticket |
| https://help.blip.ai/hc/pt-br/articles/4474381206423-Enviando-dados-para-análise-através-de-Webhooks | Configuração do webhook (Integrações → Webhook), tipos de envio por URL, OAuth 2.0 client credentials, cabeçalhos customizados, fila com até 2h de latência, bloqueio de 4h |
| https://help.blip.ai/hc/pt-br/articles/4474381014807-Regra-de-bloqueio-de-URLs-inválidas-no-Webhook | Regra de bloqueio: 20.000 falhas consecutivas → 3 dias, por tipo de item |
| https://help.blip.ai/hc/pt-br/articles/4474425334423-Como-gerenciar-filas-e-regras-de-atendimento-no-Blip | Componentes oficiais da regra de atendimento e da regra de priorização, fila `Default` como fallback, graus de urgência, permissão `Help Desk > Ver e editar` |
| https://help.blip.ai/hc/pt-br/articles/26889243832471-Como-direcionar-usuários-para-filas-utilizando-os-extras-de-contato | O caminho oficial "escolha do cliente → `extras` do contato → regra → fila" |
| https://help.blip.ai/hc/pt-br/articles/39316925291671-Como-consultar-templates-e-identificar-recategorização-via-API | `/message-templates-enriched`, schema da resposta, `previous_category` e recategorização |
| https://help.blip.ai/hc/en-us/articles/4474417686039-Builder-variables | Os cinco namespaces de variável e a tabela completa de variáveis de sistema, contato e Desk |
| https://help.blip.ai/hc/pt-br/articles/4474414030359-Ação-Redirecionar-a-um-serviço | Ação de redirecionamento; aviso de que só funciona no Bot Router (no subbot cai no bloco de exceções) |
| https://help.blip.ai/hc/en-us/articles/14563872354071--What-they-are-and-how-to-use-Builder-subflows | Subflows: criação, configuração, exportação/importação |
| https://help.blip.ai/api/v2/help_center/articles/search.json | **Método**: API pública do Zendesk da central de ajuda — busca e leitura de artigos em JSON, contorna o 403 do WebFetch |
| https://community.blip.ai/router-150/voce-sabe-o-que-e-um-roteador-2031 | (apenas confirmação de que "roteador" é vocabulário de comunidade, não da referência) |

Documentos locais consultados para não duplicar: `apis.md`, `blip-schema-real.md`,
`regras-blip.md`, `blip-desk-regras-tecnicas.md`, `blip-gestao-regras-tecnicas.md`.
</content>
</invoke>

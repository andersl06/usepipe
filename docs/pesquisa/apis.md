# Catálogo de APIs de referência para o Pipe

> Objetivo: entender o que Blip, Chatwoot e Twenty expõem de fato (autenticação, endpoints,
> paginação, limites, armadilhas) e usar isso para desenhar a API do Pipe (CRM + atendimento +
> monitoria com IA). Salesforce entra só como inspiração conceitual (SOQL), sem acesso ao ambiente.
>
> Fontes: `C:/Users/anderson.linhares/blip-dash/CLAUDE.md`, `docs/referencias/README.md` e `lib/blip/desk.ts`;
> skill `blip-onboarding` (`SKILL.md` + `referencias/*.md`); clone `chatwoot` (`swagger/`,
> `app/controllers/`, `app/models/`, `lib/webhooks/`); clone `twenty` (`packages/twenty-server`,
> `packages/twenty-shared`) e os scripts reais `C:/Users/anderson.linhares/twenty-crm/*.mjs`;
> `docs.blip.ai` (rate limit) via WebFetch.

---

## 1. Blip

### 1.1 Modelo mental: não é REST, é um barramento LIME

Não existem endpoints por recurso. Existe **um único** `POST /commands`; o que muda é o campo `to`
(extensão/domínio de destino) e o `uri` (caminho + filtro OData). Cadeia real de uma conversa:
canal (WhatsApp/Instagram) → **roteador** (bot de entrada, decide para onde manda) → cria um
**tunnel** ao encaminhar → **bot filho** (roda o fluxo do Builder) → bloco de transbordo → **Desk**
(tickets, filas, atendentes, CSAT) → encerramento.

### 1.2 Autenticação

- Header: `Authorization: Key <chave>` — a palavra `Key` é literal (não é `Bearer` nem `Basic`).
- Formato da chave: `base64(identidade:accessKey)`. Decodificar em base64 revela o dono
  (`echo "<CHAVE>" | base64 -d` → `auvpescolaprd:AbC123...`) — é como se descobre se a chave é do
  **roteador** ou do **bot filho** quando um `401` aparece sem motivo aparente.
- **Roteador e bot filho têm chaves diferentes e enxergam dados diferentes.** Um ticket pode estar
  registrado sob a identidade de um ou de outro; `/tunnels/{uuid}` só resolve com a chave do bot que
  participa daquele tunnel específico.
- Host: `https://<identidade>.http.msging.net/commands` por padrão, mas se existir um
  `command_host` cadastrado para aquele bot, ele prevalece — não montar a URL só pela identidade.

### 1.3 Anatomia do comando LIME

```json
{
  "id": "b7c9c1a2-uuid-v4",
  "to": "postmaster@desk.msging.net",
  "method": "get",
  "uri": "/tickets?$filter=status eq 'waiting'&$skip=0&$take=100",
  "type": "application/vnd.iris.ticket+json",
  "resource": {}
}
```

| Campo | Regra |
|---|---|
| `id` | UUID v4 novo a cada chamada |
| `to` | extensão de destino (ver tabela abaixo) |
| `method` | `get`, `set`, `delete`, `merge` |
| `uri` | caminho + OData (`$filter`, `$skip`, `$take`) |
| `type` | obrigatório em `set`/`merge`; MIME do `resource` |
| `resource` | corpo, quando aplicável |

**Armadilha nº 1 — `HTTP 200` não é sucesso.** A resposta sempre vem com `status: 200` no
transporte; o sucesso real está em `body.status === 'success'`. Falha vem em
`body.reason.code`/`body.reason.description`, mesmo com HTTP 200.

**Armadilha nº 2 — a Blip pode nunca responder.** Ela às vezes aceita a conexão TCP e trava sem
devolver nada — sem timeout explícito (`AbortSignal.timeout()`), o `await` fica pendurado para
sempre. Um incidente real prendeu um lock de sincronização por 35 minutos porque só o processo
filho tinha timeout configurado; o processo pai (dentro do servidor web) não tinha e segurou o
ciclo inteiro. Recomendação adotada: 20s de timeout padrão em todo cliente HTTP que fala com a Blip.

### 1.4 Extensões (`to`) e domínios

| `to` | Domínio |
|---|---|
| `postmaster@desk.msging.net` | Atendimento humano: tickets, filas, atendentes, CSAT |
| `postmaster@msging.net` | Contatos e recursos do bot (`/contacts`, `/threads`, `/buckets`, `/contexts`) |
| `postmaster@tunnel.msging.net` | Resolve tunnels (UUID → identidade real do canal) |
| `postmaster@wa.gw.msging.net` | Gateway WhatsApp: perfil, WABA, templates |
| `postmaster@activecampaign.msging.net` | Campanhas / disparo ativo em lote |
| `postmaster@analytics.msging.net` | Eventos e métricas |

### 1.5 Tickets, filas, atendentes (Desk)

| URI | Método | Uso |
|---|---|---|
| `/tickets?$filter=status eq 'waiting'&$skip=0&$take=100` | get | Lista (`waiting`, `open`, `closed`); teto 100/página |
| `/tickets?$filter=id eq '<uuid>'&$take=1` | get | Um ticket por id — `GET /tickets/{id}` direto **não é suportado** (retorna erro) |
| `/tickets/{id}/full-data` | get | Endpoint certo para enriquecimento: tags resolvidas, contato com e-mail/CPF/conta |
| `/tickets/{id}/messages?$skip=0&$take=100&getFromOwnerIfTunnel=true` | get | Mensagens do ticket; se o cliente veio por tunnel, esse parâmetro é necessário — sem ele, refazer sem o parâmetro como fallback |
| `/threads/{customerIdentity}?$take=100&storageDate=<iso>&direction=desc&getFromOriginator=true&refreshExpiredMedia=true` | get | Alternativa por cursor temporal (`storageDate`), renova URLs de mídia expiradas. **`to` aqui é `postmaster@msging.net`, não `@desk.msging.net`** |
| `/tickets/{id}/transfer` | set | Transfere para fila ou atendente (payloads abaixo) |
| `/tickets/history/metadata` | get | Histórico agregado (base de sincronização diária) |
| `/attendance-survey-answer/summary` | get | CSAT, já com `agentEmail` resolvido |
| `/attendants?$take=200` | get | Atendentes, filas (`teams`) e status online |
| `/rules` | get | Regras de roteamento do Desk |
| `/contexts/{identity}?$take=200` | get | Chaves de contexto do fluxo em que o contato está |

Transferir para fila:
```json
{ "method": "set", "uri": "/tickets/{id}/transfer",
  "type": "application/vnd.iris.ticket+json",
  "resource": { "team": "Suporte" } }
```

Transferir para atendente específico:
```json
{ "method": "set", "uri": "/tickets/{id}/transfer",
  "type": "application/vnd.iris.ticket+json",
  "resource": { "agentIdentity": "<identidade%40normalizada>", "team": "DIRECT_TRANSFER" } }
```

Identidades LIME usam `%40` para diferenciar o `@` do e-mail do `@` do domínio; `/attendants` às
vezes devolve a forma decodificada (dois `@` literais) — é preciso normalizar antes de mandar no
`transfer`.

### 1.6 Armadilhas de transferência (conhecimento caro, validado em produção)

- **`team = 'DIRECT_TRANSFER'` é uma fila sintética.** Transferir para um atendente específico grava
  esse valor no campo fila, não o nome da fila real. Numa medição real, ~74% das transferências
  chegaram assim — contar atendimento por fila nomeada perdeu 93% dos tickets.
- **Transferência pode fechar o ticket e abrir um novo.** Comparar o `id` da resposta com o id
  enviado: diferente = ticket novo (atualizar registros); igual = só re-enfileiramento.
- **Não existe transferência em lote.** Cada ticket é um comando individual; "lote" só existe como
  concorrência limitada do lado cliente.
- **Status muda entre a leitura e o comando.** Revalidar o status do ticket imediatamente antes de
  transferir — um ticket que saiu de `waiting` devolve um erro confuso, não um "não encontrado".
- **`401` geralmente é bot errado, não chave inválida.** Decodificar a chave em base64 revela de
  quem ela é antes de investigar credenciais.

### 1.7 Tunnels — o que são e a armadilha central

- Quando o roteador encaminha a conversa a um bot filho, esse bot passa a ver o cliente como
  `<uuid>@tunnel.msging.net`, **não** o telefone real.
- Consulta: `{ "method": "get", "uri": "/tunnels/<uuid>" }` para `postmaster@tunnel.msging.net`. A
  resposta traz `owner`, `originator` e `destination`; o campo que importa é **`originator`**
  (`<numero>@wa.gw.msging.net`), a identidade real do canal.
- **A armadilha:** o `customer_identity` do ticket é o UUID de tunnel, não o telefone. Cruzar uma
  campanha/planilha/CRM por telefone contra essa coluna dá **zero** silenciosamente — "zero" parece
  resultado válido, não erro.
- **Tunnel é por bot** — o mesmo UUID não existe em outro contrato/bot; é preciso ter a chave do bot
  que efetivamente participa daquele tunnel (às vezes é necessário varrer os bots ativos até um
  resolver).
- **Tunnel não funciona em `/threads` nem em `/contacts`** — esses exigem a identidade do canal
  (a que vem do evento do builder), não a do tunnel.
- UUIDs de tunnel não mudam — vale cachear em disco.

### 1.8 Disparo de template (broadcast/notify)

Endpoint: `to: postmaster@activecampaign.msging.net`, `method: set`, `uri: /campaign/full`,
`type: application/vnd.iris.activecampaign.full-campaign+json`. Payload real de produção:

```json
{
  "id": "<uuid>",
  "to": "postmaster@activecampaign.msging.net",
  "method": "set",
  "uri": "/campaign/full",
  "type": "application/vnd.iris.activecampaign.full-campaign+json",
  "resource": {
    "campaign": {
      "name": "AUVPSempre_2026-08-06T.._L1",
      "campaignType": "Batch",
      "flowId": "d49b6828-3f4d-4a13-b33c-c8449249e651",
      "stateId": "d50b805e-0715-4bb1-bdbb-94eec04baaab",
      "masterstate": "auvpescolaprd@msging.net",
      "channelType": "WhatsApp"
    },
    "audiences": [
      { "recipient": "+5511987654321", "messageParams": { "1": "Ana" } }
    ],
    "message": {
      "messageTemplate": "campanha_auvp_sempre_acesso_expirar_escola",
      "messageParams": ["1"],
      "channelType": "WhatsApp"
    }
  }
}
```

- `flowId` + `stateId` + `masterstate` vêm do builder do roteador — para onde a resposta do cliente
  cai. Sem eles, a resposta não entra em fluxo nenhum.
- **Duas formas de `messageParams` no mesmo payload, e não é acidente:** em `audiences[].messageParams`
  é um objeto chaveado por posição (`{"1": "Ana"}`); em `message.messageParams` é um array das
  chaves na ordem (`["1"]`, ou `["1","2"]` com dois parâmetros). Confundir os dois formatos só dá
  erro na resposta da Blip, não na validação do payload.
- Relatório da campanha: `GET /campaigns/{campaignId}/reports`.
- Antes de disparar, normalmente é preciso setar `extras` no contato (`to: postmaster@msging.net`,
  `method: merge`, `uri: /contacts`, `type: application/vnd.lime.contact+json`,
  `resource: { identity, extras: { filaConsultor: "..." } }`) — dos dois lados (bot e roteador),
  porque o roteador decide a fila de resposta e o bot processa a conversa.

**A armadilha do deslocamento de parâmetros (a mais cara do levantamento).** O texto do template não
é criado no sistema — vive aprovado na Meta/WABA; o que se guarda é um ponteiro (`template_key`) +
mapa de posição `{{1}}..{{10}}` (limite Meta). **Se o template tem imagem no cabeçalho, a imagem
ocupa o parâmetro `1` e todas as variáveis do corpo deslocam +1.** Sem aplicar esse offset, o nome
do cliente cai no slot da imagem e a mensagem chega quebrada — e nada valida isso contra a Meta
antes do envio; o erro só aparece na resposta `failure`. Para conferir de fato o que um template
espera: `GET /message-templates-enriched?templateName=<nome>` em `postmaster@wa.gw.msging.net`
(também há `GET /message-templates?$take=200`, que lista status de aprovação). **Recomendação
direta para o Pipe:** calcular esse offset automaticamente a partir de um flag "tem mídia no
cabeçalho" por template, nunca deixar quem cadastra numerar manualmente.

### 1.9 Paginação

Regra única em todos os endpoints OData: `$take` máximo é **100**. Padrão de loop com teto absoluto
obrigatório (paginação sem teto é o jeito clássico de estourar rate limit e travar um ciclo
inteiro):

```js
const take = 100;
for (let skip = 0; skip < LIMITE_ABSOLUTO; skip += take) {
  const r = await cmd(`/tickets?$filter=...&$skip=${skip}&$take=${take}`);
  const items = r?.resource?.items ?? [];
  todos.push(...items);
  if (items.length < take) break;
}
```

`/threads` pagina por cursor temporal (`storageDate`), não por `$skip`/`$take`, com detecção de
página repetida como proteção extra contra loop infinito.

### 1.10 Limites de taxa

Não há número interno documentado nos projetos consultados — só a prática de teto de paginação e
concorrência limitada (ex.: 5–8 chamadas simultâneas, nunca `Promise.all` irrestrito). Segundo
`docs.blip.ai`:

- **Free tier:** 48 comandos/segundo. **Paid tier:** 200 comandos/segundo.
- Ao exceder, as próximas requisições recebem **HTTP 429 por uma janela de 2 minutos**.
- Recomendação oficial da Blip: implementar controle de fila em cenários de troca alta de
  mensagens/comandos. Não há orientação de retry/backoff além disso — o Pipe deve desenhar seu
  próprio backoff explícito no cliente HTTP central, já que a Blip não o oferece.

### 1.11 Segurança de credenciais

Nunca persistir a chave de bot em texto puro (nem em log, nem em dump). Guardá-la cifrada em
repouso (ex.: `pgcrypto`) e nunca reconstruir o host de comando só pela identidade quando existir um
`command_host` explícito cadastrado — hosts de comando podem divergir por bot mesmo dentro da mesma
conta.

---

## 2. Chatwoot

O Chatwoot expõe três APIs REST distintas, mais um canal de webhooks assinados por HMAC.

| API | Prefixo | Para que serve | Autenticação |
|---|---|---|---|
| Platform API | `/platform/api/v1/...` | Provisionar contas (tenants), usuários e agent bots — nível de instalação | header `api_access_token`, owner precisa ser um `PlatformApp` |
| Application API | `/api/v1/accounts/{account_id}/...` e `/api/v2/...` | Operação do dia a dia: contatos, conversas, mensagens, agentes, times, relatórios | mesmo header `api_access_token`, owner é `User` ou `AgentBot` |
| Client (Public) API | `/public/api/v1/inboxes/{inbox_identifier}/...` | Contato final conversando via widget/canal API, sem sessão de agente | sem token — `inbox_identifier` + `contact_identifier` no path, opcionalmente HMAC |

### 2.1 Platform API

Autenticação (`app/controllers/platform_controller.rb`): header `api_access_token`; o token só é
aceito se `AccessToken.owner` for um `PlatformApp`. Além disso, toda operação de leitura/escrita
passa por `validate_platform_app_permissible` — o `PlatformApp` só acessa recursos explicitamente
vinculados a ele em `platform_app_permissibles` (uma conta criada por um token fica automaticamente
vinculada a esse token).

| Método | Caminho | Função |
|---|---|---|
| POST | `/platform/api/v1/accounts` | Criar conta (tenant) |
| GET/PATCH/DELETE | `/platform/api/v1/accounts/{account_id}` | Detalhe/editar/apagar conta |
| GET/POST/DELETE | `/platform/api/v1/accounts/{account_id}/account_users` | Vincular usuário ↔ conta com papel |
| GET/POST/PATCH/DELETE | `/platform/api/v1/agent_bots[/{id}]` | CRUD de agent bots |
| POST | `/platform/api/v1/users` | Criar usuário |
| GET | `/platform/api/v1/users/{id}/login` | Gerar URL de SSO |
| POST | `/platform/api/v1/users/{id}/token` | Gerar token de acesso do usuário |

Exemplo de criação de conta:
```json
POST /platform/api/v1/accounts
Headers: { "api_access_token": "<platform_app_token>" }
{
  "name": "Acme Corp",
  "locale": "pt_BR",
  "domain": "acme.com",
  "support_email": "suporte@acme.com",
  "status": "active"
}
```

### 2.2 Application API

Autenticação (`app/controllers/concerns/access_token_auth_helper.rb`): mesmo header
`api_access_token`, mas o owner pode ser `User` (agente/admin) ou `AgentBot`. Quando o token é de um
`AgentBot`, o acesso é restrito por whitelist (`BOT_ACCESSIBLE_ENDPOINTS`) — um bot só pode mexer em
conversas/mensagens/atribuições/labels já existentes, nunca listar contatos ou criar webhooks:

```ruby
BOT_ACCESSIBLE_ENDPOINTS = {
  'api/v1/accounts/conversations' => %w[show toggle_status toggle_typing_status toggle_priority create update custom_attributes],
  'api/v1/accounts/conversations/messages' => ['create'],
  'api/v1/accounts/conversations/assignments' => ['create'],
  'api/v1/accounts/conversations/labels' => %w[index create]
}
```

**Contacts**
| Método | Caminho |
|---|---|
| GET/POST | `/api/v1/accounts/{account_id}/contacts` |
| GET/PUT/DELETE | `/api/v1/accounts/{account_id}/contacts/{id}` |
| GET | `/api/v1/accounts/{account_id}/contacts/search?q=` |
| POST | `/api/v1/accounts/{account_id}/contacts/filter` |
| POST | `/api/v1/accounts/{account_id}/actions/contact_merge` |

Payload de criação:
```json
POST /api/v1/accounts/{account_id}/contacts
{
  "inbox_id": 1, "name": "Alice", "email": "alice@acme.inc",
  "phone_number": "+123456789", "identifier": "1234567890",
  "additional_attributes": { "type": "customer" }, "custom_attributes": {}
}
```

Filtro avançado (o formato mais próximo do que o Pipe deve oferecer):
```json
POST /api/v1/accounts/{account_id}/contacts/filter?page=1
{
  "payload": [
    { "attribute_key": "name", "filter_operator": "equal_to", "values": ["en"], "query_operator": "AND" },
    { "attribute_key": "country_code", "filter_operator": "equal_to", "values": ["us"], "query_operator": null }
  ]
}
```
`filter_operator` ∈ {`equal_to`, `not_equal_to`, `contains`, `does_not_contain`}.

**Conversations**
| Método | Caminho |
|---|---|
| GET | `/api/v1/accounts/{account_id}/conversations` (query: `assignee_type`, `status`, `q`, `inbox_id`, `team_id`, `labels[]`, `page`) |
| POST | `/api/v1/accounts/{account_id}/conversations` |
| POST | `.../conversations/filter` |
| GET/PATCH | `.../conversations/{id}` |
| POST | `.../toggle_status`, `.../toggle_priority`, `.../toggle_typing_status` |
| POST | `.../assignments` (atribuir agente/time) |
| GET/POST | `.../labels` |

Payload de criação (com template WhatsApp já embutido):
```json
POST /api/v1/accounts/{account_id}/conversations
{
  "source_id": "1234567890", "inbox_id": 1, "contact_id": 1,
  "status": "open", "assignee_id": 1, "team_id": 1,
  "message": {
    "content": "Hello, how can I help you?",
    "template_params": { "name": "sample_issue_resolution", "category": "UTILITY", "language": "en_US", "processed_params": { "1": "Chatwoot" } }
  }
}
```

Schema do recurso `conversation`: `id, messages[], additional_attributes, custom_attributes,
inbox_id, labels[], status (open|resolved|pending), priority, waiting_since, sla_policy_id,
applied_sla, sla_events[], last_activity_at, unread_count`.

**Messages**
```
GET/POST   /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
PATCH/DELETE  .../messages/{message_id}
```
Texto simples:
```json
{ "content": "Hello, how can I help you?", "message_type": "outgoing", "private": false, "content_type": "text" }
```
Anexo via multipart:
```bash
curl -X POST ".../messages" -H "api_access_token: <token>" \
  -F "content=Here is the screenshot" -F "message_type=outgoing" \
  -F "attachments[]=@/path/to/screenshot.png"
```
Template WhatsApp com mídia no cabeçalho:
```json
{
  "content": "Hi your order 121212 is confirmed",
  "template_params": {
    "name": "order_confirmation", "category": "MARKETING", "language": "en",
    "processed_params": {
      "body": { "1": "121212" },
      "header": { "media_url": "https://.../img.jpg", "media_type": "image" }
    }
  }
}
```
Isso é a mesma armadilha de deslocamento de parâmetro vista na Blip — aqui o Chatwoot separa
explicitamente `header` de `body` no payload, evitando o problema de contagem por posição.

**Agents / Teams / Inboxes / Custom Attributes / Labels**
```
GET/POST/PATCH/DELETE   /api/v1/accounts/{account_id}/agents[/{id}]
GET/POST/PATCH/DELETE   /api/v1/accounts/{account_id}/teams[/{team_id}]
GET/POST/PATCH/DELETE   /api/v1/accounts/{account_id}/teams/{team_id}/team_members
GET/POST/PATCH          /api/v1/accounts/{account_id}/inboxes[/{id}]
GET/POST/PATCH/DELETE   /api/v1/accounts/{account_id}/custom_attribute_definitions[/{id}]
GET/POST/PATCH/DELETE   /api/v1/accounts/{account_id}/labels[/{id}]
```
`custom_attribute_definitions` define `attribute_display_type` (0=text, 1=number, 2=currency,
3=percent, 4=link, 5=date, 6=list, 7=checkbox) e `attribute_model` (0=conversation, 1=contact) — é
o modelo de campo customizado mais simples e direto dos três produtos pesquisados.

**Reports** (API v2, `/api/v2/accounts/{account_id}/...`)
```
GET /reports?metric=&type=agent|inbox|label|team|rating&id=&since=&until=
GET /reports/summary?type=&id=&since=&until=
GET /reports/conversations?type=account|agent&user_id=
GET /summary_reports/channel|inbox|agent|team?since=&until=&business_hours=
GET /reports/first_response_time_distribution?since=&until=
GET /reports/inbox_label_matrix?since=&until=&inbox_ids[]=&label_ids[]=
```
Resposta de `/reports`: série temporal `[{ "value": "12", "timestamp": 1690000000 }, ...]`.

### 2.3 Client (Public) API

Sem token — identificação por path: `inbox_identifier` (id público do canal) +
`contact_identifier`/`source_id` (id do `ContactInbox` daquele contato naquele canal).

```
GET        /public/api/v1/inboxes/{inbox_identifier}
POST       /public/api/v1/inboxes/{inbox_identifier}/contacts
GET/PATCH  .../contacts/{contact_identifier}
GET/POST   .../contacts/{contact_identifier}/conversations
GET        .../conversations/{conversation_id}
POST       .../conversations/{conversation_id}/toggle_status | toggle_typing | update_last_seen
GET/POST   .../conversations/{conversation_id}/messages
```

Quando o `contact_inbox` está `hmac_verified` (ver 2.5), a busca de conversas passa a considerar
**todas** as inboxes do contato, não só a daquele canal — o HMAC prova identidade real, não só
posse de um identificador.

### 2.4 Webhooks — eventos e payload

Modelo (`app/models/webhook.rb`), lista oficial de eventos assináveis por webhook de conta:
```
conversation_created, conversation_updated, conversation_status_changed,
contact_created, contact_updated,
message_created, message_updated,
webwidget_triggered, inbox_created, inbox_updated,
conversation_typing_on, conversation_typing_off
```
Cada webhook cadastrado só recebe o evento se ele estiver no array `subscriptions` daquele webhook
específico (não é broadcast automático de tudo). Além dos webhooks de conta, existem dois canais
paralelos: o **Agent Bot webhook** (eventos de conversa/mensagem para `agent_bot.outgoing_url`,
assinado com `agent_bot.secret`) e o **Installation webhook** (evento único `account_created`,
global, sem assinatura).

Exemplo de payload `conversation_created`:
```json
{
  "event": "conversation_created",
  "id": 42, "inbox_id": 3, "status": "open", "channel": "Channel::Api",
  "additional_attributes": {}, "custom_attributes": {},
  "meta": {
    "sender": { "id": 10, "name": "Alice", "email": "alice@acme.inc", "type": "contact" },
    "assignee": null, "assignee_type": "unassigned", "team": null, "hmac_verified": false
  },
  "messages": [{ "id": 100, "content": "Hello", "message_type": 1, "conversation_id": 42 }],
  "account": { "id": 1, "name": "Acme Corp" },
  "created_at": 1690000000, "timestamp": 1690000000
}
```

### 2.5 Assinatura HMAC — dois mecanismos distintos

**(a) Webhooks de saída** (`lib/webhooks/trigger.rb`):
```ruby
ts = Time.now.to_i.to_s
headers['X-Chatwoot-Timestamp'] = ts
headers['X-Chatwoot-Signature'] = "sha256=#{OpenSSL::HMAC.hexdigest('SHA256', @secret, "#{ts}.#{body}")}"
headers['X-Chatwoot-Delivery'] = SecureRandom.uuid  # id único por disparo, para dedupe
```
Algoritmo HMAC-SHA256; mensagem assinada é `"<timestamp>.<body_json>"`; assinatura vai no header
`X-Chatwoot-Signature` no formato `sha256=<hex>`; timestamp vai em header separado
`X-Chatwoot-Timestamp`. Se o webhook não tiver `secret` configurado, sai sem assinatura nenhuma —
não é bloqueado. Não há proteção de replay embutida no lado de quem envia.

**(b) Identidade de contato na Client API** (`app/controllers/public/api/v1/inboxes/contacts_controller.rb`):
```ruby
expected_hash = OpenSSL::HMAC.hexdigest('sha256', @inbox_channel.hmac_token, params[:identifier].to_s)
```
Assina só o `identifier` (sem timestamp), chave é o `hmac_token` do canal, resultado vai como
parâmetro de request `identifier_hash` (não header). Serve para provar que quem está criando/lendo
aquele contato é o sistema integrador legítimo, não qualquer requisição adivinhando um id.

**Referência de verificação de entrada com proteção de replay** (usada pelo próprio Chatwoot ao
receber webhooks do Slack, vale copiar para o Pipe): tolerância de 5 minutos entre timestamp e
horário do servidor, assinatura `v0=HMAC-SHA256(secret, "v0:<timestamp>:<body>")`, comparação com
`secure_compare` (tempo constante).

---

## 3. Twenty

Três superfícies de API sobre o mesmo motor de metadados: **REST** (auto-gerado), **GraphQL core**
(dados de negócio) e **Metadata API** (GraphQL, schema do schema). Autenticação idêntica nas três:
header `Authorization: Bearer <token>` (chave gerada em Settings > APIs).

### 3.1 REST

Padrão de endpoint: `/rest/<namePlural>` — plural do objeto (`/rest/people`, `/rest/opportunities`,
ou um objeto customizado como `/rest/disparos`). Controller genérico casa por método:

| Método | Caminho | Ação |
|---|---|---|
| POST | `/rest/<plural>` | createOne |
| POST | `/rest/batch/<plural>` | createMany |
| GET | `/rest/<plural>` | find (lista) |
| GET | `/rest/<plural>/{id}` | find (um) |
| GET | `/rest/<plural>/groupBy` | agregação |
| PATCH | `/rest/<plural>/{id}` | update |
| PATCH | `/rest/<plural>/{id}/restore` | restaurar soft-delete |
| PATCH | `/rest/<plural>/merge` | mergeMany |
| DELETE | `/rest/<plural>/{id}` | delete (soft) |

**Paginação** — cursor, idêntica em todos os scripts reais:
```
GET /rest/people?limit=60&starting_after=<cursor>
```
Resposta: `{ data: [...], pageInfo: { hasNextPage: bool, endCursor: string } }`; segue lendo até
`hasNextPage: false`.

**Filtro** (`?filter=`), sintaxe confirmada no código-fonte:
```
?filter=campo[comparador]:valor
?filter=and(campo1[eq]:valor1,campo2[gte]:10)
?filter=or(...)    ?filter=not(campo[eq]:valor)
```
Comparadores: `eq, neq, in, containsAny, is, gt, gte, lt, lte, startsWith, endsWith, like, ilike`.
Campo aninhado usa ponto: `fieldCurrency.amountMicros[gte]:1000`.

**Ordenação** (`?order_by=`):
```
?order_by=campo1[AscNullsFirst],campo2[DescNullsLast]
```
Direção default `AscNullsFirst`; o servidor sempre acrescenta `id[AscNullsFirst]` como desempate
final — detalhe que vale copiar (ordenação nunca ambígua, mesmo com empates no campo escolhido).

Exemplo real de criação, com campos compostos nativos (`smoke-test.mjs`):
```js
POST /rest/people
{
  "name": { "firstName": "Cliente", "lastName": "Teste" },
  "phones": { "primaryPhoneNumber": "11999998888", "primaryPhoneCallingCode": "+55", "primaryPhoneCountryCode": "BR" },
  "emails": { "primaryEmail": "smoke@teste.local" },
  "nrConta": "000000001", "plTotal": 150000.5, "contaAtiva30d": true,
  "seguros": ["VIDA", "AUTO"], "segmento": "Consolidado"
}
// resposta: { "data": { "createPerson": {...} } }  (varia por versão)
```
Campo moeda (`Currency`) é sempre `{ amountMicros, currencyCode }` (ex.:
`{ "amountMicros": 15000000000, "currencyCode": "BRL" }` para R$15.000,00). Relações no payload de
criação usam sufixo `Id` (`pointOfContactId: p.id`).

### 3.2 GraphQL core

Endpoint `/graphql`, mesma autenticação Bearer. Schema dinâmico gerado a partir do metadata do
workspace: queries `people(filter, orderBy, first, after)` com paginação cursor
(`edges { node, cursor }`, `pageInfo { hasNextPage, endCursor }`), mutations
`createPerson(input)`/`updatePerson(...)`/`deletePerson(...)`. O tipo de `orderBy` é o mesmo objeto
usado internamente para gerar o `order_by` do REST — ou seja, REST e GraphQL core não são duas
linguagens de filtro diferentes, é a mesma semântica com duas serializações.

### 3.3 Metadata API

Duas superfícies: um wrapper REST (`/rest/metadata/objects`, `/rest/metadata/fields`) e GraphQL
puro em `/metadata` (usado para recursos sem wrapper REST, como Views).

**Criar objeto customizado:**
```json
POST /rest/metadata/objects
{
  "nameSingular": "disparo", "namePlural": "disparos",
  "labelSingular": "Disparo", "labelPlural": "Disparos",
  "description": "Envio de template WhatsApp pela Blip.",
  "icon": "IconSend"
}
```
Equivale à mutation GraphQL `createOneObject(input: CreateOneObjectInput!)`.

**Criar campo customizado:**
```json
POST /rest/metadata/fields
{
  "objectMetadataId": "<uuid do objeto>",
  "name": "dataDisparo", "label": "Data do disparo",
  "type": "DATE_TIME", "isNullable": true
}
```
Equivale a `createOneField(input: CreateOneFieldMetadataInput!)`. Tipos de campo disponíveis
(`FieldMetadataType`): `TEXT, NUMBER, NUMERIC, BOOLEAN, DATE, DATE_TIME, CURRENCY, ADDRESS, LINKS,
EMAILS, PHONES, SELECT, MULTI_SELECT, RELATION, MORPH_RELATION, RATING, RICH_TEXT, RAW_JSON, ARRAY,
FULL_NAME, ACTOR, FILES, POSITION, TS_VECTOR, UUID`.

Campo SELECT/MULTI_SELECT leva `options` como array `{ value, label, position, color }`:
```json
{
  "name": "seguros", "label": "Seguros", "type": "MULTI_SELECT",
  "options": [
    { "value": "VIDA", "label": "Vida", "position": 0, "color": "green" },
    { "value": "CONTA_CARTAO", "label": "Conta e cartão", "position": 1, "color": "blue" }
  ]
}
```
Alterar opções depois é `PATCH /rest/metadata/fields/{fieldId}` com novo array `options` — é assim
que se reordena/renomeia os estágios de um funil sem recriar o campo.

Campo RELATION exige `relationCreationPayload`:
```json
{
  "objectMetadataId": "<id de Disparo>", "name": "cliente", "label": "Cliente", "type": "RELATION",
  "relationCreationPayload": {
    "targetObjectMetadataId": "<id de Person>",
    "type": "MANY_TO_ONE",
    "targetFieldLabel": "Disparos", "targetFieldIcon": "IconSend"
  }
}
```
`RelationType` só tem `MANY_TO_ONE`/`ONE_TO_MANY` — a direção inversa é derivada automaticamente
(cria o campo espelho no objeto alvo).

**Views** (GraphQL puro em `/metadata`, sem wrapper REST):
```graphql
mutation($input: CreateViewInput!) { createView(input: $input) { id name } }
# input: { name: "Busca de clientes", objectMetadataId, icon: "IconSearch", type: "TABLE" }

mutation($input: CreateViewFieldInput!) { createViewField(input: $input) { id } }
# input: { viewId, fieldMetadataId, position, isVisible: true, size: 180 }
```
Motivo real de uso em produção: a busca global (Ctrl+K) do Twenty não indexa campo customizado em
objeto padrão — só uma View com os campos certos resolve isso.

### 3.4 Motor de workflow

**Gatilhos** (`WorkflowTriggerType`):
- `DATABASE_EVENT` — `settings.eventName` no formato `"<nameSingular>.<action>"`
  (ex.: `person.created`, `opportunity.updated`). Ações possíveis (`DatabaseEventAction`):
  `created, updated, deleted, destroyed, restored, upserted`. Não existe gatilho dedicado a "campo X
  mudou" — isso se resolve dentro do fluxo, com uma ação de filtro checando o payload do evento
  `updated`.
- `MANUAL` — disparo pelo usuário, com `objectType`, `availability` (registro único / em massa /
  global).
- `CRON` — 4 variantes: `DAYS {day, hour, minute}`, `HOURS {hour, minute}`, `MINUTES {minute}`,
  `CUSTOM {pattern}` (cron pattern livre).
- `WEBHOOK` — `GET` ou `POST` recebido, `authentication: API_KEY | null`.

**Ações** (`WorkflowActionType`): `CODE, LOGIC_FUNCTION, SEND_EMAIL, DRAFT_EMAIL,
CREATE_CALENDAR_EVENT, CREATE_RECORD, UPDATE_RECORD, DELETE_RECORD, UPSERT_RECORD, FIND_RECORDS,
PICK_RECORD, FORM, FILTER, IF_ELSE, HTTP_REQUEST, AI_AGENT, ITERATOR, EMPTY, DELAY`. Agrupando por
categoria útil ao Pipe: CRUD de registro (CREATE/UPDATE/DELETE/UPSERT/FIND/PICK_RECORD),
comunicação (SEND_EMAIL, HTTP_REQUEST = webhook de saída), controle de fluxo (IF_ELSE, FILTER,
ITERATOR, DELAY, FORM), extensibilidade (CODE, LOGIC_FUNCTION, AI_AGENT).

---

## 4. Salesforce — só o conceito

Sem acesso ao ambiente; o que importa aqui é **por que o SOQL funciona bem para extração** e o que
o Pipe deve imitar, não a sintaxe Salesforce em si.

O SOQL é bom para extração por três motivos, nessa ordem de importância:

1. **Seleção de campos é obrigatória e explícita.** Não existe `SELECT *`. Quem escreve a consulta
   declara exatamente quais campos quer, e o servidor nunca devolve mais do que isso. Isso barra dois
   problemas de uma vez: payloads gigantes por engano, e vazamento de campo sensível que ninguém
   pediu — em multi-tenant isso importa tanto quanto performance.
2. **Relacionamento pai-filho e filho-pai na própria consulta**, sem `JOIN` explícito:
   - Filho → pai: notação de ponto (`Case.Account.Name`, `Case.Owner.Email`) — consultar um campo do
     registro relacionado sem uma segunda chamada.
   - Pai → filhos: subquery aninhada (`SELECT Id, (SELECT Id, Subject FROM Cases) FROM Account`) —
     traz a lista de filhos dentro do mesmo resultado, sem N+1.
   Isso resolve, numa única ida ao servidor, o padrão mais comum de extração para BI: "me dê a
   entidade principal com o suficiente do relacionado para não precisar de outra consulta".
3. **Agregação embutida na mesma linguagem** (`COUNT()`, `SUM()`, `GROUP BY`, `HAVING`) — dá para
   pedir "quantos casos abertos por fila" sem baixar linha a linha e agregar no cliente.

O que o Pipe deve imitar, adaptado para multi-tenant seguro (sem SQL cru, ver seção 5.3):
- seleção de campo explícita, nunca implícita;
- travessia de relacionamento pai↔filho dentro da própria consulta (mesmo formato conceitual:
  "traga o campo relacionado" e "traga os filhos agregados"), mas resolvida por um parser próprio
  que sabe quais relações existem no schema do tenant — nunca uma string SQL interpretada
  diretamente;
- agregação (`count`, `sum`, `avg`, `group by`) como parte da própria linguagem de consulta, não
  como um recurso à parte só em relatórios prontos.

O que **não** vale a pena imitar: a sintaxe textual solta (SOQL é uma string livre parseada no
servidor — controle de acesso a campo e objeto depende inteiramente de FLS/sharing rules aplicadas
depois do parse). No Pipe, a validação de esquema e permissão deve acontecer antes da execução,
sobre uma estrutura tipada (JSON), não depois de interpretar texto.

---

## 5. Recomendação para a API do Pipe

### 5.1 Estilo: REST com filtros ricos, GraphQL só onde o grafo compensa

**REST como superfície principal**, no padrão `/v1/<recurso-plural>` (leads, conversas, tickets,
avaliacoes, atendentes, filas), com filtro/ordenação/paginação ricos na query string — o modelo do
Twenty (`?filter=`, `?order_by=`, cursor) é o mais maduro dos três porque generaliza bem sobre um
schema dinâmico (o Pipe também terá campos customizados por tenant) e não exige que o cliente
aprenda GraphQL para consultas do dia a dia. Chatwoot mostra o piso mínimo aceitável (filtro por POST
com `attribute_key`/`filter_operator`/`values`) — mais simples de implementar, mas menos expressivo
(não compõe AND/OR aninhado nem tem paginação por cursor).

**GraphQL como superfície secundária**, só para dois casos onde REST dói: (a) telas que precisam de
grafo profundo em uma chamada (ticket + mensagens + contato + histórico de avaliações do mesmo
atendimento — evita N+1 do lado do front); (b) a própria Metadata API do Pipe (criar objeto/campo
customizado), onde mutations tipadas são mais seguras que um body REST solto. Não expor mutation de
dados de negócio livre em GraphQL — mutations de CRUD normal replicam o REST 1:1, então não vale
manter dois caminhos de escrita.

**Por que não LIME/comando único como a Blip:** o modelo de barramento da Blip é ótimo para um
produto que já nasceu como plataforma de mensageria multi-protocolo (comando único, extensão
variável), mas empurra para o cliente toda a responsabilidade de saber "para qual extensão mandar" e
esconde erros atrás de HTTP 200 — o próprio levantamento acima lista isso como a armadilha nº 1 do
Blip. Não vale reproduzir para um produto que já sabe seu domínio de recursos.

### 5.2 Autenticação e escopos

- Chave de API por integração, formato `Authorization: Bearer <token>`, token opaco (não JWT
  auto-contido) para poder revogar imediatamente — como Twenty e Chatwoot, e ao contrário da chave
  Blip (que exige decodificar base64 para saber a quem pertence; o Pipe deve resolver a identidade
  no servidor, nunca pedir isso ao cliente).
- Cada token pertence a um **actor** tipado: `user` (agente humano, herda permissões do papel),
  `service` (integração, ex. Blip↔Pipe), ou `agent_bot` (IA — igual ao AgentBot do Chatwoot, com
  whitelist de endpoints por padrão: um bot de IA não deve conseguir listar todos os contatos do
  tenant só porque tem uma chave válida).
- Escopos por recurso e verbo, não por "tudo ou nada": `tickets:read`, `tickets:write`,
  `templates:dispatch`, `metadata:write`, `reports:read`. Um token de disparo de template nunca
  deveria conseguir alterar schema.
- Multi-tenant: `tenant_id` nunca vai no payload nem em header confiável do cliente — é resolvido a
  partir do token no servidor (como a Platform API do Chatwoot resolve `platform_app_permissibles`).

### 5.3 Paginação e ordenação

Cursor-based em todos os endpoints de listagem, replicando o padrão Twenty por ser o mais robusto
sob escrita concorrente (offset com `$skip` quebra quando itens são inseridos/removidos entre
páginas — problema real na paginação por `$skip` da Blip):

```
GET /v1/tickets?limit=50&cursor=<opaco>&order_by=criado_em[desc],id[asc]
→ { "data": [...], "page_info": { "has_next_page": true, "end_cursor": "<opaco>" } }
```

- `limit` com teto de servidor (ex. 100, como a Blip) — o cliente pode pedir menos, nunca mais.
- `order_by` sempre com desempate final implícito por `id` (como o Twenty faz), para nunca haver
  ordenação ambígua em campos com empate.
- Todo endpoint de listagem devolve `page_info`; nunca "confiar" que `data.length < limit` sozinho
  significa última página (é frágil quando o limite é atingido exatamente) — expor `has_next_page`
  explícito.

### 5.4 Linguagem de consulta para extração (inspirada em SOQL, segura para multi-tenant)

Um corpo JSON estruturado, nunca SQL/string livre — validado contra o schema do tenant (que campos
e relações existem, que tipo tem cada um) **antes** de virar consulta real. Formato:

```json
{
  "from": "<objeto>",
  "select": ["campo1", "relacao.campoDoRelacionado"],
  "where": { "and": [ ["campo", "gte", valor], ["campo2", "eq", "valor"] ] },
  "group_by": ["campo"],
  "aggregate": { "total": { "fn": "count" }, "soma_valor": { "fn": "sum", "field": "valor" } },
  "order_by": [["campo", "desc"]],
  "limit": 100,
  "cursor": null
}
```

- `select` com notação de ponto para pai (`lead.responsavel.nome`) — igual ao filho→pai do SOQL.
- Filho agregado dentro da mesma consulta via `from` numa relação inversa declarada no schema
  (`"from": "fila", "select": ["nome", "tickets_abertos.count"]`) em vez de subquery de texto livre —
  o parser resolve isso olhando o grafo de relações do metadata, não interpretando SQL aninhado.
- Operadores de `where` fechados numa lista permitida (`eq, neq, gt, gte, lt, lte, in, contains,
  starts_with, between`) — nunca uma expressão arbitrária.
- Toda consulta passa por checagem de permissão por campo/objeto antes de executar (equivalente a
  FLS do Salesforce, mas aplicado no parse, não depois).

Cinco exemplos reais do domínio do Pipe:

**1. Leads por faixa de score**
```json
{
  "from": "lead",
  "select": ["id", "nome", "score", "responsavel.nome", "criado_em"],
  "where": { "and": [["score", "gte", 60], ["score", "lt", 80]] },
  "order_by": [["score", "desc"]],
  "limit": 50
}
```

**2. Conversas por fila e período**
```json
{
  "from": "conversa",
  "select": ["id", "fila.nome", "status", "canal", "aberta_em", "fechada_em"],
  "where": { "and": [
    ["fila.nome", "eq", "Suporte"],
    ["aberta_em", "gte", "2026-08-01T00:00:00Z"],
    ["aberta_em", "lt", "2026-09-01T00:00:00Z"]
  ]},
  "order_by": [["aberta_em", "desc"]]
}
```

**3. Avaliações por critério (monitoria com IA)**
```json
{
  "from": "avaliacao",
  "select": ["conversa.id", "atendente.nome", "criterio", "nota", "comentario_ia"],
  "where": { "and": [["criterio", "in", ["cordialidade", "resolucao", "aderencia_script"]]] },
  "group_by": ["criterio", "atendente.nome"],
  "aggregate": { "media_nota": { "fn": "avg", "field": "nota" }, "total": { "fn": "count" } }
}
```

**4. Esforço por atendente (régua de esforço: escrever/ler/ouvir/falar por ticket)**
```json
{
  "from": "ticket",
  "select": ["atendente.nome"],
  "where": { "and": [["fechado_em", "gte", "2026-09-01T00:00:00Z"]] },
  "group_by": ["atendente.nome"],
  "aggregate": {
    "tickets_fechados": { "fn": "count" },
    "esforco_total_min": { "fn": "sum", "field": "esforco_estimado_min" },
    "tempo_medio_resposta_seg": { "fn": "avg", "field": "tempo_ate_primeira_resposta_seg" }
  }
}
```

**5. Demandas recorrentes (classificação por categoria, estilo case-sync)**
```json
{
  "from": "ticket",
  "select": ["categoria", "subcategoria"],
  "where": { "and": [["fechado_em", "gte", "2026-08-01T00:00:00Z"], ["categoria", "neq", null]] },
  "group_by": ["categoria", "subcategoria"],
  "aggregate": { "total": { "fn": "count" } },
  "order_by": [["total", "desc"]],
  "limit": 20
}
```

### 5.5 Eventos de webhook que o Pipe deve emitir

Seguindo o modelo Chatwoot (assinatura por webhook, evento explícito no payload, HMAC-SHA256 com
timestamp e id de entrega), mas corrigindo as duas lacunas encontradas nele (sem tolerância de
replay no envio; sem garantia de assinatura quando o secret está vazio — no Pipe, `secret` deve ser
obrigatório para ativar um webhook, não opcional):

```
lead.created, lead.updated, lead.score_changed
conversa.created, conversa.status_changed, conversa.assigned, conversa.closed
mensagem.created (inbound/outbound)
ticket.created, ticket.transferred, ticket.closed
avaliacao.completed
atendente.status_changed
template.dispatch_failed
```

Payload:
```json
{
  "event": "conversa.status_changed",
  "delivery_id": "<uuid>",
  "tenant_id": "<uuid>",
  "occurred_at": "2026-09-05T14:00:00Z",
  "data": { "conversa_id": "...", "status_anterior": "aberta", "status_novo": "fechada" }
}
```
Headers: `X-Pipe-Signature: sha256=<HMAC-SHA256(secret, "<timestamp>.<body>")>`,
`X-Pipe-Timestamp`, `X-Pipe-Delivery`. No consumidor oficial (e na documentação de terceiros),
recomendar tolerância de 5 minutos contra replay, como o próprio Chatwoot faz ao validar entrada.

### 5.6 Servidor MCP do Pipe

Expor o mesmo domínio como ferramentas MCP para que um agente de IA opere o produto sem precisar
conhecer HTTP/paginação — cada ferramenta MCP é fina, chama a API REST/consulta acima por trás.

| Ferramenta | O que faz | Parâmetros |
|---|---|---|
| `pipe_query` | Executa a linguagem de consulta da seção 5.4 e devolve linhas | `from`, `select[]`, `where`, `group_by[]`, `aggregate`, `order_by[]`, `limit`, `cursor` |
| `pipe_get_ticket` | Busca um ticket/conversa por id, com histórico de mensagens | `ticket_id`, `include_messages: bool` |
| `pipe_transfer_ticket` | Transfere ticket para fila ou atendente | `ticket_id`, `fila` \| `atendente_id`, `motivo` |
| `pipe_close_ticket` | Fecha um ticket com categoria/subcategoria | `ticket_id`, `categoria`, `subcategoria`, `resumo` |
| `pipe_list_queue` | Lista tickets aguardando por fila, com tempo de espera | `fila`, `limit`, `cursor` |
| `pipe_get_lead` | Busca lead por id ou telefone, com score e histórico | `lead_id` \| `telefone` |
| `pipe_update_lead_score` | Atualiza o score de um lead com justificativa | `lead_id`, `score`, `motivo` |
| `pipe_dispatch_template` | Dispara template de WhatsApp para um contato/lista | `template_key`, `destinatarios[]`, `parametros`, `flow_id_resposta` |
| `pipe_get_template_schema` | Devolve o mapa de posições de um template (com offset de mídia já calculado) | `template_key` |
| `pipe_evaluate_conversation` | Registra avaliação de qualidade (monitoria com IA) de uma conversa | `conversa_id`, `criterios[]` (`{criterio, nota, comentario}`) |
| `pipe_get_agent_effort` | Devolve esforço agregado por atendente num período (régua de esforço) | `atendente_id` \| `todos`, `desde`, `ate` |
| `pipe_create_object` | Cria objeto customizado (Metadata API) | `name_singular`, `name_plural`, `label_singular`, `label_plural`, `icon` |
| `pipe_create_field` | Cria campo customizado num objeto | `object_id`, `name`, `label`, `type`, `options[]` (se select), `is_nullable` |
| `pipe_subscribe_webhook` | Cadastra um webhook para um conjunto de eventos | `url`, `events[]`, `secret` |

Cada ferramenta devolve erro estruturado (`{ "error": { "code", "message" } }`, nunca "HTTP 200 com
`status: failure` dentro" como a Blip) — para que o agente de IA saiba distinguir sucesso de falha
sem precisar inspecionar o corpo.

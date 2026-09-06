# Schema real da Blip — levantado direto na API (LIME)

> Metodologia: **só comandos `method: "get"`**, direto contra `POST https://<host>/commands` com as
> chaves já cadastradas em `blip_bots_rows.csv` (via `awk`) e as usadas pelo `blip-dash`
> (`.env.local`/`.env.local.example`). Nenhum `set`/`delete`/`merge`/`subscribe` foi executado, nenhuma
> mensagem foi enviada, nenhum ticket/fila/atendente/template foi alterado. Tudo rodou em
> `C:/Users/anderson.linhares/pipe` (scripts Node descartáveis, sem persistir chave). Sondagem feita em
> 2026-09-06, contra o tenant `auvp_capital` (bot `supernovaprincipal` / roteador `supernovaroteador`) e,
> para comparação, o tenant `auvp_escola_prd` (bot `auvpescolaprd`).
>
> Evidência sempre **agregada e anonimizada**: contagens, nomes de campo, tipos e enumerações reais —
> nunca nome, telefone, e-mail, conteúdo de mensagem ou identidade de cliente/atendente específico.
> Onde um valor de exemplo ajuda a ilustrar formato (ex.: e-mail de quem fechou um ticket), uso um
> exemplo **fictício**, nunca um valor real observado.

---

## 0. Descoberta estrutural que muda a leitura de tudo abaixo

**A chave do roteador e a chave do bot não têm o mesmo acesso a recursos do Desk — não é só
"dado diferente", é endpoint que funciona ou não.** Testado nos dois sentidos, mesmo tenant:

| Recurso | Chave do **roteador** (`supernovaroteador`) | Chave do **bot** (`supernovaprincipal`) |
|---|---|---|
| `GET /tickets?status eq 'waiting'` | Responde `success`, mas **0 itens** | Responde `success`, **23 itens** |
| `GET /tickets?status eq 'open'` | Responde `success`, mas **0 itens** | Responde `success`, **100 itens** (truncado no teto) |
| `GET /attendants` | `failure` — `"The requested resource was not found"` | `success` — **104 itens** |
| `GET /rules` | `failure` — `"The requested resource was not found"` | `success` — **26 itens** |
| `GET /tickets/history/metadata` | `success`, 0 itens | `success`, **100 itens** |
| `GET /attendance-survey-answer/summary` | `success` (objeto de contagem) | `success` (objeto de contagem) |
| `GET /message-templates` (`wa.gw`) | `success`, mas **0 itens** | `failure` — `"Could not determine the WhatsApp WhatsAppBusinessAccountId for the specified sender."` |
| `GET /whatsapp-business-account`, `GET /profile` (`wa.gw`) | `success` | não testado com a chave do bot (não é o dono do número) |

Isso **confirma e detalha** o que o `blip_bots.ticket_source` do blip-dash já modelava de forma opaca
("router" ou "bot" decide de onde vem o ticket) — mas na prática vai além de "de onde vem o dado":
para este tenant, `/attendants` e `/rules` **só existem pela identidade do bot**, não do roteador, com
`404`-like (`"resource not found"`) e não um erro de permissão. Um integrador que só tenha a chave do
roteador não consegue montar fila/atendente/regra de jeito nenhum — precisa da chave do bot.

---

## 1. Autenticação (confirmado)

- Header `Authorization: Key <base64(identidade:accessKey)>` — testado com as 6 credenciais do CSV;
  `Key` é literal, `Bearer`/`Basic` são rejeitados (não testado ativamente para não gastar chamada, mas
  o decode confirma o formato: `identidade:accessKey`).
- Host: `https://<identidade>.http.msging.net/commands` respondeu para todas as identidades testadas
  (`supernovaroteador`, `supernovaprincipal`, `auvpescolaprd`) — não foi preciso um `command_host`
  separado nesta sondagem (o CSV usado aqui não carrega essa coluna; o blip-dash a busca do Postgres).
- Envelope confirmado byte a byte:
  ```json
  {"id":"<uuid-v4>","to":"postmaster@desk.msging.net","method":"get","uri":"..."}
  ```

---

## 2. Ticket — o objeto inteiro

Duas formas distintas, confirmadas por dois endpoints diferentes: **ticket ao vivo** (`GET /tickets`,
Desk) e **ticket histórico** (`GET /tickets/history/metadata`, mesma extensão). Não são o mesmo shape.

### 2.1 Ticket ao vivo (`GET /tickets?$filter=status eq '<status>'`)

Amostra: 123 tickets reais (23 `waiting` + 100 `open`, teto de página atingido) do tenant
`auvp_capital`, mais 20 `waiting` do tenant `auvp_escola_prd` para comparação de schema (idênticos).

| Campo | Tipo | Presente | Notas |
|---|---|---|---|
| `id` | string (UUID) | 123/123 | Chave do ticket. |
| `sequentialId` | number | 123/123 | Não é único sozinho — só com `ownerIdentity`/bot (confirma armadilha já documentada). |
| `ownerIdentity` | string | 123/123 | Identidade do bot dono do ticket, formato `<identidade>@msging.net`. |
| `customerIdentity` | string | 123/123 | **Sempre** `<uuid>@tunnel.msging.net` nos dois tenants testados — nunca telefone direto. Confirma a armadilha documentada. |
| `customerDomain` | string | 123/123 | Único valor observado: `wa.gw.msging.net` (canal WhatsApp). |
| `provider` | string | 123/123 | Único valor observado: `Lime`. |
| `status` | string | 123/123 | Valores observados ao vivo: **`Waiting`, `Open`** (PascalCase — o blip-dash normaliza para minúsculo, a API não devolve minúsculo). |
| `storageDate` | string (ISO 8601) | 123/123 | Data de entrada na fila. |
| `externalId` | string | 74/123 | Não documentado; presente em boa parte dos tickets. |
| `rating` | number | 123/123 | `0` em toda a amostra ao vivo (ticket ainda não avaliado). |
| `team` | string | 123/123 | Nome da fila **ou** `DIRECT_TRANSFER`. Nesta amostra, **63/123 (51%)** vieram como `DIRECT_TRANSFER` — confirma a armadilha (fila sintética predominante). |
| `unreadMessages` | number | 123/123 | |
| `closed` | boolean | 123/123 | Redundante com `status`, mas existe como campo próprio. |
| `priority` | number | 123/123 | **Valores reais observados: `0, 1, 2, 3, 4, 7`** — seis valores distintos, não três. Não há mapeamento documentado para "Baixa/Média/Alta"; ver seção 8. |
| `agentIdentity` | string | 105/123 | Ausente nos `waiting` (ainda sem atendente), presente na maioria dos `open`. |
| `parentSequentialId` | number | 49/123 | Presente quando o ticket nasceu de uma transferência — confirma que o ticket novo referencia o `sequentialId` do original. |
| `CampaignId` | string | 38/123 | **Nome de campo com `C` maiúsculo** — inconsistente com o padrão camelCase do resto do objeto. Confirma origem de disparo ativo. |
| `openDate` | string (ISO 8601) | 100/123 | Só em tickets `open`. |
| `statusDate` | string (ISO 8601) | 100/123 | |
| `isAutomaticDistribution` | boolean | 100/123 | Só em `open` — confirma se o ticket foi atribuído pela distribuição automática. |
| `distributionType` | string | 100/123 | Único valor observado: `Redis` (mecanismo de lock da distribuição). |
| `firstResponseDate` | string (ISO 8601) | 97/123 | |
| `folderId` | string | 5/123 | **Não documentado em nenhuma fonte consultada** — indício de uma feature de "pastas" de ticket que não aparece no `blip-desk-funcoes.md` nem no `apis.md`. |

**Não existe campo `channel` no objeto de ticket**, nos dois tenants testados — nem em `auvp_capital`
nem em `auvp_escola_prd`. O canal é inferido pelo sufixo de `customerDomain` (`wa.gw.msging.net` →
WhatsApp), não por um campo dedicado.

### 2.2 Ticket histórico (`GET /tickets/history/metadata`)

Amostra: 100 tickets fechados/transferidos de `auvp_capital`. Schema é parecido mas **não idêntico**
ao ao vivo:

| Campo | Tipo | Presente | Notas |
|---|---|---|---|
| `metadata` | array | 100/100 | Presente em todo item; conteúdo não inspecionado a fundo (não é PII, é log técnico interno). |
| `id`, `sequentialId`, `ownerIdentity`, `customerIdentity`, `customerDomain`, `agentIdentity`, `provider` | — | 100/100 | Mesmos formatos da seção 2.1. |
| `status` | string | 100/100 | Valores observados: **`ClosedAttendant`, `Transferred`** — só dois dos quatro estados terminais que a documentação lista (`ClosedClient`, `ClosedClientInactivity` não apareceram nesta amostra de 100; não é contradição, é não-observação). |
| `storageDate`, `statusDate` | string (ISO) | 100/100 | |
| `openDate` | string (ISO) | 99/100 | |
| `closeDate` | string (ISO) | 100/100 | Campo próprio de fechamento (não existe no ticket ao vivo, que usa `statusDate`). |
| `rating` | number | 100/100 | `0` em toda a amostra. |
| `team`, `unreadMessages`, `closed` | — | 100/100 | |
| `closedBy` | string | 100/100 | **Formato confirmado**: `<email-do-atendente-url-encoded>@blip.ai` — ex.: `fulano.exemplo%40dominio.com.br@blip.ai` (exemplo fictício; o `@` do e-mail vira `%40` e o domínio final é sempre `@blip.ai`, não o domínio do tenant). |
| `firstResponseDate` | string (ISO) | 99/100 | |
| `parentSequentialId` | number | 65/100 | Maioria dos fechados desta amostra veio de uma transferência (65%). |
| `priority` | number | 100/100 | Valores observados aqui: `0, 1, 2` — faixa menor que no ao-vivo (`0..7`), reforça que não há mapeamento fixo de 3 ou 4 níveis. |
| `isAutomaticDistribution` | boolean | 99/100 | |
| `CampaignId` | string | 37/100 | |
| `averageAgentResponseTime` | number | 84/100 | **Campo não documentado em nenhuma fonte local** — métrica de tempo médio de resposta do atendente, calculada pela própria Blip, disponível só no histórico (não no ticket ao vivo). |
| `externalId` | string | 35/100 | |
| `tags` | array | 3/100 | Confirma que tag é raramente usada (3% da amostra). |

### 2.3 `GET /tickets/{id}/full-data` — **não confirma a documentação**

A skill `blip-onboarding` e o `apis.md` local descrevem esse endpoint como "o certo para
enriquecimento" (tags resolvidas + contato com e-mail/CPF). Testado num ticket real, aberto, deste
tenant:

```json
{"status":"failure","reason":{"description":"There's no processor available for requested resource type"}}
```

Ver seção 8 ("Contradiz a documentação").

### 2.4 Mensagem do sistema dentro de `/tickets/{id}/messages` — descoberta extra

Ao buscar `GET /tickets/{id}/messages?...&getFromOwnerIfTunnel=true` de um ticket real (8 mensagens),
apareceu um tipo de conteúdo que nenhuma fonte local documentava explicitamente: uma mensagem de
**evento de ticket**, com `type: "application/vnd.iris.ticket+json"`, cujo `content` é o próprio objeto
ticket (mesmos campos da seção 2.1) **mais** um campo extra:

```json
"content.customerInput": { "type": "text/plain", "value": "<texto que o cliente digitou>" }
```

Isto é: o Desk registra, como mensagem do próprio thread, o snapshot do ticket no momento da fila —
incluindo o texto que disparou a entrada na fila. `type` observado nas mensagens: `text/plain` (chat)
e `application/vnd.iris.ticket+json` (evento). `direction` observado: `received`, `sent`. `status` da
mensagem (entrega): `received`, `dispatched`.

O campo `metadata` de cada mensagem é rico e não documentado em nenhuma fonte local — chaves reais
observadas: `$elapsedTimeToStorage`, `#stateName`, `#stateId`, `#messageId`, `#previousStateId`,
`#previousStateName`, `#tunnel.owner`, `#tunnel.originator`, `#tunnel.originalFrom`,
`#tunnel.originalTo`, `traceparent`, `#uniqueId`, `#date_processed`, `date_created`, `$originator`,
`$claims`, `$internalId`, `$originatorSessionRemoteNode`, `#messageKind`, `#wa.timestamp`,
`#wa.bsuid`, `#wa.sharedWaId`, `x-request-id`, `x-b3-traceid`, `x-b3-spanid`, `x-b3-sampled`.

**`#wa.bsuid` já existe hoje na metadata da mensagem**, não é uma feature futura — só aparece em
2/8 mensagens da amostra (as vindas efetivamente do WhatsApp com esse identificador atribuído pela
Meta). Isso é evidência a favor da preocupação já registrada em `regras-blip.md` sobre a migração de
identidade por BSUID: o campo já circula na metadata, mesmo antes do rollout completo no Brasil.

---

## 3. Fila (`team`) e atendente

### 3.1 `GET /teams` — endpoint não documentado nas fontes locais, existe e funciona

Nenhuma fonte local (`api-blip.md`, `apis.md`, `regras-blip.md`) lista `/teams` como URI da extensão
Desk — só é citado indiretamente via a tabela `blip_teams`, sincronizada por outro caminho. Testado
direto: **23 itens**, schema enxuto:

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | Nome da fila. |
| `agentsOnline` | number | Contagem de atendentes online **naquela fila**, calculada pela própria Blip em tempo real. |

Não tem `id`, `capacity` nem qualquer campo de configuração — é um resumo operacional, não o cadastro
completo da fila (cadastro de fila provavelmente só existe via portal, não pela API Desk).

### 3.2 `GET /attendants?$take=200` — confirmado com dado real

104 atendentes retornados (chave do bot). Schema:

| Campo | Tipo | Presente | Notas |
|---|---|---|---|
| `identity` | string | 104/104 | Identidade LIME do atendente. |
| `fullName` | string | 104/104 | |
| `email` | string | 104/104 | |
| `teams` | array | 104/104 | Lista de filas do atendente (confirma que um atendente pode estar em várias). |
| `status` | string | 104/104 | Valores observados: **`Online`, `Invisible`, `Offline`**. `Paused` (citado em `blip-desk-funcoes.md`) não apareceu nesta amostra — não é contradição, é não-observação no momento da sondagem. |
| `agentSlots` | number | 77/104 | **Ausente em 27 atendentes** — provavelmente quem nunca teve um limite individual configurado (usa o default do tenant, que não é exposto neste mesmo objeto). |
| `isEnabled` | boolean | 104/104 | |

---

## 4. Regras de atendimento (`GET /rules`)

26 regras reais retornadas (chave do bot). Estrutura confirmada:

```json
{
  "id": "<uuid>",
  "ownerIdentity": "<bot>@msging.net",
  "title": "<texto>",
  "team": "<fila-alvo>",
  "relation": "Contains",
  "operator": "Or",
  "isActive": true,
  "priority": 1,
  "storageDate": "<iso>",
  "queueId": "<uuid>",
  "conditions": [
    { "property": "Contact.Extras.fila", "relation": "Contains", "values": ["<valor>"] }
  ]
}
```

- `priority` variou de **1 a 26**, um valor por regra, sem repetição — é literalmente a ordem
  sequencial das 26 regras. Isso **preenche a lacuna** que `regras-blip.md` registrava como "não
  documentado" (ordem de avaliação entre regras): a evidência estrutural forte é que `/rules` já
  devolve as regras com um índice de prioridade explícito e sem empate, o que é consistente com
  avaliação em ordem crescente de `priority` (a primeira que casar decide) — mas nenhuma chamada de
  leitura prova o *comportamento* de avaliação em si (isso exigiria observar um ticket real passando
  pela regra), só a **estrutura de dados que sustenta essa ordem**. Registro como evidência forte, não
  como confirmação definitiva de comportamento.
- `conditions[].property` observado no formato **`Contact.Extras.<chave>`** — confirma que regra de
  fila lê campo `extras` do contato (não só nome/e-mail/conteúdo de mensagem, como o texto de
  `blip-desk-funcoes.md` sugeria de forma mais genérica). `relation` por condição: `Contains`,
  `Equals`. `operator` no nível da regra (join entre condições): `Or` em toda a amostra (não observei
  `And` nesta amostra de 26 regras — pode existir e não estar presente neste tenant).
- Os valores de `conditions[].values` (o texto configurado como critério) **foram omitidos por
  princípio de segurança** mesmo sendo configuração de negócio (não dado de cliente) — o comando
  original te fatiaria detalhe operacional interno do tenant desnecessário para o schema.

---

## 5. Contato

**Não consegui confirmar o schema completo com dado real.** Resolvido o `originator` de um ticket real
via `/tunnels/{uuid}` (ver seção 6) e usado para chamar `GET /contacts/{identity}` em
`postmaster@msging.net` com a chave do bot: resposta `failure` — `"The requested resource was not
found"`. `GET /contexts/{identity}` para a mesma identidade: `failure` — `"There's no stored contexts
for the current owner"`. `GET /threads/{identity}`: `success`, mas **0 itens**.

Nenhum dos três erros é de autenticação/permissão — são "recurso vazio para este contato específico"
(nesta sondagem peguei um ticket cujo contato não tem contact/context/thread persistido sob a
identidade do bot testado, possivelmente porque a conversa ficou só no roteador). Não tentei mais
identidades para não multiplicar chamadas sem necessidade; o formato de campo do contato **não foi
confirmado por esta sondagem** — o que está documentado em `apis.md`/`regras-blip.md` sobre
`contact.identity`, `contact.extras` e o BSUID continua sem prova direta de schema completo.

---

## 6. Tunnel (`GET /tunnels/{uuid}`) — confirmado

Resolvido o tunnel do `customerIdentity` de um ticket real (`auvp_capital`, chave do bot):

```json
{ "owner": "string", "originator": "string", "destination": "string" }
```

Três campos, todos string, exatamente como a skill `blip-onboarding` documenta. `originator` veio no
formato `<identificador>@wa.gw.msging.net`, confirmando a armadilha central: o `customerIdentity` do
ticket nunca é o telefone, é sempre necessário este passo extra.

---

## 7. Canal WhatsApp (`postmaster@wa.gw.msging.net`)

Confirmado com a chave do roteador `supernovaroteador` (é quem tem o número associado neste tenant,
não o bot):

**`GET /profile`** — campos confirmados:
`displayName`, `displayPhoneNumber`, `address`, `email`, `description`, `webSites`, `vertical`,
`photoUri`, `verifiedName`, `nameStatus` — todos string (não inspecionei tipo de `webSites`, pode ser
array).

**`GET /whatsapp-business-account`** — campos confirmados:
`id`, `currency`, `message_template_namespace`, `name`, `timezone_id`.

### 7.1 Templates — não confirmado nesta sondagem

`GET /message-templates?$take=200`:

| Chave testada | Resultado |
|---|---|
| Roteador `supernovaroteador` | `success`, **0 itens** (lista vazia) |
| Bot `supernovaprincipal` | `failure` — `"Could not determine the WhatsApp WhatsAppBusinessAccountId for the specified sender."` |
| Bot `auvpescolaprd` | `failure` — mesma mensagem |

Nenhuma das três credenciais disponíveis devolveu um template real nesta sondagem — não dá pra
confirmar de novo, com prova fresca, a estrutura de `components`/`category`/`status`/aprovação nem o
deslocamento de parâmetro por mídia no cabeçalho. Essa regra **já está confirmada em produção** em
outro levantamento local (`apis.md`, seção 1.8, com payload real de campanha disparada), então não a
marco como "não documentada" — só registro que **esta sondagem específica não conseguiu reproduzi-la**
com as credenciais disponíveis agora (ver seção 9).

---

## 8. CSAT (`GET /attendance-survey-answer/summary`) — **contradiz a documentação local**

A skill `blip-onboarding` (`api-blip.md`) descreve este endpoint como devolvendo "respostas de CSAT,
já com `agentEmail`" — implicando uma lista de respostas individuais. **O que a API devolveu de fato**,
com e sem filtro de data, chave do bot:

```json
{ "closedTicketsCount": 0, "answersCount": 0 }
```

Dois números, não uma lista de itens. Não há `items`, não há `agentEmail` na resposta. Duas leituras
possíveis, nenhuma confirmável só com leitura:

1. O schema documentado (lista com `agentEmail`) existe em outro parâmetro/variação de URI não
   testada (ex.: agrupado por período, por fila, ou um endpoint irmão sem `/summary`).
2. A doc local descreveu errado, ou descreveu uma versão antiga da API.

Como não há CSAT respondido nas últimas ~8 meses neste tenant/bot (`answersCount: 0` mesmo com
`$filter=surveyDate gt '2026-01-01'`), não dá pra decidir entre as duas com mais leitura — precisaria
de um tenant/bot com resposta de CSAT recente para reabrir essa investigação.

---

## 9. Regras de envio de mensagem

Nada abaixo envolveu enviar mensagem — só leitura e inferência a partir do que já está confirmado em
`regras-blip.md`/`apis.md` (ambos com fonte primária declarada) mais o que esta sondagem observou.

- **Tipos de conteúdo confirmados em mensagens reais de um ticket**: `text/plain` (texto de chat) e
  `application/vnd.iris.ticket+json` (evento de sistema do próprio Desk, não é conteúdo enviado pelo
  atendente). Não vi mensagem de mídia na amostra de 8 — não dá pra confirmar aqui o formato exato de
  imagem/áudio/documento dentro de `/tickets/{id}/messages`.
- **Deslocamento de parâmetro por mídia no cabeçalho**: **não reconfirmado nesta sondagem** (ver seção
  7.1 — nenhum template real disponível). A regra continua de pé pela evidência já registrada em
  `apis.md` (payload de campanha real da AUVP Sempre, `messageParams` array vs. objeto), mas essa
  prova é de outro levantamento, não desta sessão.
- **Janela de 24h**: nenhuma chamada de leitura expõe diretamente um campo `window_expires_at` ou
  equivalente no ticket ou no contato — não existe esse campo no schema de ticket confirmado na seção
  2. A regra de negócio (24h, reabertura por mensagem do cliente) continua baseada só na documentação
  da Meta/Blip (`regras-blip.md`), sem contraprova nem confirmação direta pela API nesta sondagem.
- **Erro de conteúdo recusado**: não testado (exigiria `set`, fora do escopo de leitura autorizado).
- **Limite de taxa**: não testado ativamente de propósito — forçar 429 contra produção real não tem
  valor que justifique o risco de atrapalhar o atendimento ao vivo enquanto a sondagem rodava. O valor
  de 48/200 comandos por segundo (free/paid) e a janela de 2 minutos de bloqueio continuam sem
  contraprova própria, só a citação de `docs.blip.ai` já registrada em `apis.md`/`regras-blip.md`.

---

## 10. Paginação, erro e autenticação — confirmado com evidência fresca

### 10.1 Paginação

- Teto de `$take` confirmado **ao vivo**: pedindo `$take=101` em `/tickets?status eq 'closed'`, a API
  devolveu `failure`:
  ```
  "reason": { "description": "The take parameter can not be greater than 100" }
  ```
  Sem código numérico de razão nesta resposta (só descrição). Confirma o teto de 100 documentado.
- **Filtro `status eq 'closed'` direto em `/tickets` falha sempre**, com as duas chaves, com e sem
  aspas codificadas: `"Unable to perform operation 'status eq 'closed''"`. Isso **não está registrado
  em nenhuma fonte local** como limitação — a leitura correta de fechados é só via
  `/tickets/history/metadata`, nunca via `/tickets?$filter=status eq 'closed'`. Vale registrar como
  regra nova: o filtro OData de `/tickets` **só aceita `waiting`/`open`**, não `closed`.

### 10.2 Formato de erro — confirmado, "HTTP 200 esconde falha" bate com a documentação

Testado com um ticket inexistente:

```json
{
  "method": "get",
  "status": "failure",
  "reason": { "code": 62, "description": "The resource is not supported" },
  "id": "<uuid>",
  "from": "postmaster@desk.msging.net/<instância-do-processador>",
  "to": "<identidade>@msging.net/<instância-do-servidor>",
  "metadata": {
    "traceparent": "<w3c-traceparent>",
    "#command.uri": "lime://<identidade>@msging.net/tickets/<uri-original>",
    "#metrics.custom.label": "processor:default"
  }
}
```

HTTP transporte sempre `200`. Confirma exatamente o que `api-blip.md`/`apis.md` já registravam:
checar `body.status === 'failure'` e `body.reason.code`/`body.reason.description`, nunca confiar no
status HTTP. Bônus não documentado antes: o corpo de erro real inclui `from`, `to` e um bloco
`metadata` com `traceparent` (W3C) e a **URI original reconstruída em formato `lime://`** — útil para
correlacionar log de erro com o comando que o originou.

### 10.3 Autenticação

Confirmado na seção 0 e 1 — nada a acrescentar além do que já está lá.

---

## Contradiz a documentação

1. **`GET /tickets/{id}/full-data` não funciona neste tenant/bot** (`"There's no processor available
   for requested resource type"`), apesar de `blip-onboarding`/`apis.md` o descreverem como "o
   endpoint certo para enriquecimento". Pode ser uma feature não habilitada para este tenant
   específico, não necessariamente errada como documentação geral — mas não bate com o que está
   escrito sem ressalva.
2. **`GET /attendance-survey-answer/summary` devolve um objeto de contagem (`closedTicketsCount`,
   `answersCount`), não uma lista de respostas com `agentEmail`**, como a skill `blip-onboarding`
   descreve. Ver seção 8 para as duas leituras possíveis.
3. **`GET /tickets?$filter=status eq 'closed'` não é suportado** — nenhuma fonte local avisa que o
   filtro de `closed` falha sempre em `/tickets` e que fechados só saem por
   `/tickets/history/metadata`. `api-blip.md` lista os três status (`waiting`, `open`, `closed`) como
   se todos funcionassem do mesmo jeito no mesmo endpoint.
4. **A chave do roteador não acessa `/attendants` nem `/rules`** (erro "resource not found", não
   "permission denied") — a documentação local trata a diferença roteador/bot como "veem dados
   diferentes", mas aqui é "o endpoint simplesmente não existe" para a identidade errada, uma
   distinção mais dura do que "dado diferente".
5. **`priority` do ticket tem pelo menos 6 valores numéricos distintos em uso real (`0` a `7`)**, não
   um enum de 3 (Baixa/Média/Alta) nem 4 níveis — nenhuma fonte local documenta o mapeamento
   número↔label, e a suposição de 3 níveis não se sustenta com os dados observados.

## Comandos executados

Todos `method: "get"`. Nenhum `set`/`delete`/`merge`/`subscribe`. Por extensão (`to`), URIs efetivamente
chamadas (algumas repetidas em rodadas diferentes de sondagem, listadas uma vez):

**`postmaster@desk.msging.net`** (chave do roteador e/ou do bot, tenant `auvp_capital`; bot também no
tenant `auvp_escola_prd`):
- `/tickets?$filter=status eq 'waiting'&$skip=0&$take=3|100`
- `/tickets?$filter=status eq 'open'&$skip=0&$take=100`
- `/tickets?$filter=status eq 'closed'&$skip=0&$take=10|100|101` (sempre falhou — ver seção 10.1)
- `/tickets?$filter=status eq 'closed' and storageDate gt '2026-09-01'&$skip=0&$take=10` (variação testada, também falhou)
- `/tickets/{id}/full-data`
- `/tickets/{id}/messages?$skip=0&$take=20|50&getFromOwnerIfTunnel=true`
- `/tickets/history/metadata?$skip=0&$take=10|100`
- `/tickets/nao-existe-00000000-0000-0000-0000-000000000000` (sonda de erro, id inventado)
- `/attendants`, `/attendants?$take=200`
- `/rules`, `/rules?$take=100`
- `/teams`, `/teams?$take=100`, `/attendants/teams` (esta última não existe)
- `/attendance-survey-answer/summary?$skip=0&$take=50`
- `/attendance-survey-answer/summary?$filter=surveyDate gt '2026-01-01'&$skip=0&$take=50`

**`postmaster@tunnel.msging.net`** (chave do bot):
- `/tunnels/{uuid}` (uuid extraído de `customerIdentity` de um ticket real)

**`postmaster@msging.net`** (chave do bot):
- `/contacts/{identity}` (identity = `originator` resolvido pelo tunnel)
- `/contexts/{identity}?$take=200`

**`postmaster@wa.gw.msging.net`** (chave do roteador `supernovaroteador`, e também tentado com as
chaves de bot `supernovaprincipal`/`auvpescolaprd`):
- `/message-templates?$take=200`
- `/whatsapp-business-account`
- `/profile`

Total: ~35 chamadas de leitura distintas (contando variações de parâmetro), nenhuma repetida em volume
suficiente para se aproximar do limite de taxa documentado (48 cmd/s free-tier).

## Não consegui

- **Confirmar schema de `/contacts/{identity}` e `/contexts/{identity}` com dado real** — as duas
  chamadas responderam sem erro de autenticação, mas "recurso não encontrado"/"sem contexto
  armazenado" para o único contato testado. Não tentei outro contato para não multiplicar chamadas.
- **Confirmar schema de `/threads/{identity}`** — chamada funcionou (sem erro), mas devolveu 0 itens
  para o contato testado.
- **Confirmar estrutura de template (`components`, categoria, deslocamento de parâmetro por mídia)**
  com prova fresca desta sondagem — as três combinações de chave disponíveis não devolveram nenhum
  template real (lista vazia ou erro "WhatsAppBusinessAccountId não determinado"). A regra de
  deslocamento continua de pé só pela evidência já registrada em `apis.md` (outro levantamento).
- **Confirmar teste de rate limit (429)** — não tentei de propósito, por ser produção real em uso.
- **Confirmar campo `metadata` de `/tickets/history/metadata`** em profundidade — vi que é um array
  presente em 100% da amostra, mas não abri o conteúdo interno (não parecia ter valor de schema
  incremental e queria evitar risco de capturar dado sensível sem necessidade).
- **Confirmar a ordem exata de avaliação de `/rules`** como comportamento (não só estrutura) — geraria
  a necessidade de observar um ticket real entrando na fila via regra, o que está fora do escopo de
  leitura pura desta tarefa.
- **Reproduzir o objeto de CSAT com `agentEmail`** citado na skill `blip-onboarding` — o tenant/bot
  testado não tinha resposta de CSAT no período consultado (`answersCount: 0`), então não dá pra saber
  se o formato documentado existe sob outro parâmetro ou se a doc está desatualizada.

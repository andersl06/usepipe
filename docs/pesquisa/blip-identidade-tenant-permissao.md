# Blip — usuário, empresa e permissão, como o servidor organiza

Extraído dos objetos reais que o servidor devolveu numa sessão autenticada
(`desk-clone/capturas/sessao.har`, tenant `supernova`) e do bundle do Desk.
Complementa `blip-schema-real.md` (schema de ticket) e `arquitetura-multi-tenant.md`
(a decisão do Pipe).

## A hierarquia, em uma tela

```
Usuário            identidade global na Blip, não pertence a uma empresa
  │                anderson.linhares%40auvp.com.br@blip.ai
  │
  ├─ pertence a N tenants (empresas)          /tenants-mine
  │    │
  │    └─ Tenant                              /applications/{bot}/tenant
  │         id, dono, conta de pagamento, CLUSTER
  │         │
  │         └─ N applications (bots) = "owner"    /agents/owners
  │              │
  │              ├─ configuração do bot (49 OwnerProps)
  │              │    GET lime://{bot}/configuration/caller
  │              │
  │              └─ filas (teams) do bot
  │
  └─ permissão é por (usuário × BOT), não por empresa   /agent/permissions/all
```

O ponto que mais surpreende: **a permissão não é do tenant, é do bot.** O mesmo usuário
pode ser quase administrador num bot e quase nada em outro, dentro da mesma empresa.

## 1. Usuário — identidade global

`GET lime://blip.ai/accounts/{email-escapado}` devolve:

```json
{
  "fullName": "Anderson Linhares",
  "identity": "anderson.linhares%40auvp.com.br@blip.ai",
  "email": "anderson.linhares@auvp.com.br",
  "alternativeAccount": "anderson.linhares%40auvp.com.br@mailgun.gw.msging.net",
  "phoneNumber": "+55 21 9xxxx-xxxx",
  "culture": "pt",
  "extras": {
    "lastUsedTenants": "[\"supernova2\",\"\",\"anderson-linhares-oxo7k\",\"supernova\"]",
    "cookies": "{\"portalAcceptedCookiesDate\":\"...\"}",
    "isOldUser": "true",
    "acceptedPlugins": "[{\"pluginId\":\"...\",\"acceptedDate\":\"...\"}]"
  },
  "creationDate": "2025-07-30T19:15:25.880Z"
}
```

Três coisas a notar:

- **A identidade é o e-mail com o `@` escapado, mais `@blip.ai`.** O usuário é global na
  plataforma; a empresa não faz parte da identidade. Isso permite a mesma pessoa atender
  várias empresas sem segunda conta — e é o oposto do Chatwoot, onde o vínculo é
  `account_users` por conta.
- **`alternativeAccount` no gateway de e-mail** (`@mailgun.gw.msging.net`): o mesmo usuário
  tem endereço de canal, porque na Blip tudo é um nó de mensageria.
- **`extras` é um saco de strings**, com JSON serializado dentro de campo texto
  (`lastUsedTenants`, `cookies`, `acceptedPlugins`). Preferência de usuário não tem schema.

## 2. Tenant — a empresa

`GET postmaster@portal.blip.ai /applications/{bot}/tenant`:

```json
{
  "id": "supernova",
  "name": "Supernova",
  "photoUri": "https://blipmediastore.blob.core.windows.net/public-medias/...",
  "ownerIdentity": "mauricio%40investidorsardinha.com.br@blip.ai",
  "paymentAccount": "supernova@tenant.blip.ai",
  "creationDate": "2024-10-08T13:14:23.370Z",
  "clusterName": "beagle",
  "HubspotCompanyId": "7787532584",
  "DealId": "22547895874",
  "isTestContract": false,
  "creationSource": "Other",
  "blipSubsidiary": "Curupira",
  "canViewMobileDesk": true,
  "watermark": "98aeca0..."
}
```

O que cada campo revela do desenho:

| Campo | O que ensina |
|---|---|
| `id` | slug curto, não UUID — vira subdomínio (`supernova.desk.blip.ai`) e prefixo de host |
| `ownerIdentity` | a empresa tem **uma pessoa dona**, não um papel abstrato |
| `paymentAccount` | cobrança é um nó próprio (`{tenant}@tenant.blip.ai`), separado da operação |
| **`clusterName`** | **o tenant é ancorado a um cluster nomeado** — é o degrau silo/pool do nosso `arquitetura-multi-tenant.md`, em produção |
| `HubspotCompanyId`, `DealId` | o CRM comercial está amarrado ao tenant no próprio objeto |
| `isTestContract` | conta de teste é um flag, não um ambiente separado |
| `blipSubsidiary` | há mais de uma subsidiária servindo do mesmo produto |
| `watermark` | versão do registro, para cache/invalidação |

`GET postmaster@portal.blip.ai /tenants-mine` devolve os tenants do usuário logado. O host
também resolve tenant: `TenantService.getTenantFromHost(window.location.host)` — o Desk
descobre a empresa pelo subdomínio antes de autenticar.

## 3. Permissão — por bot, com cache no tipo

`GET postmaster@desk.msging.net /agent/permissions/all` devolve
`application/vnd.iris.desk.ownerpermissioncache+json`:

```json
{ "total": 5, "items": [
  { "OwnerIdentity": "instagramcapitalbuilder@msging.net",
    "Permissions": [
      { "Name": "canAccessContactHistory",  "IsActive": false },
      { "Name": "canAttendantTransfer",     "IsActive": true  },
      { "Name": "canCallsVideo",            "IsActive": false },
      { "Name": "canCareCopilotScore",      "IsActive": false }
    ] } ] }
```

- Um item **por bot**, cada um com as 17 permissões de `AgentPermissionType`.
- Na amostra real, o bot `instagramcapitalbuilder` tem quase tudo `false` enquanto outros
  bots do mesmo tenant têm `true` — a granularidade por bot é usada de verdade, não é
  teórica.
- O próprio nome do content type diz `permissioncache`: é uma **projeção cacheada**, não a
  fonte da verdade. A fonte está na Gestão.

### O segundo portão: configuração do bot

Permissão sozinha não libera nada. O Desk cruza permissão do usuário com a configuração do
bot antes de mostrar cada recurso:

```
Ações em massa  = canMultipleTicketTransfer  E  TransferTicketEnabled
Contatos        = canAccessContactHistory    E  HistoryEnabled
Mensagem ativa  = canSendActiveMessage       E  ActiveMessageEnabled
```

Um "sim" do usuário com um "não" da empresa dá não. É o desenho certo: a empresa contrata o
recurso, o administrador distribui entre as pessoas.

## 4. O que isso sugere para o Pipe

1. **Usuário global × usuário por conta.** A Blip escolheu identidade global e o Chatwoot
   escolheu vínculo por conta. Para quem vende para empresas que compartilham operadores
   (BPO, agência), o modelo da Blip evita conta duplicada. O `sso-multi-tenant.md` já decidiu
   HRD por domínio, que combina com identidade global.
2. **Permissão por bot, não por tenant.** O equivalente no Pipe seria permissão por
   canal/inbox — e é o que o Chatwoot também faz (`user.inboxes`). Dois produtos
   independentes chegaram no mesmo lugar; é sinal de que a granularidade certa é essa.
3. **O duplo portão (empresa contrata × admin distribui)** deve ser copiado. Ele separa
   comercial de operação sem misturar as duas tabelas.
4. **`clusterName` no objeto de tenant** confirma na prática o degrau que o
   `arquitetura-multi-tenant.md` recomenda: o tenant sabe em que cluster vive, e isso é dado,
   não configuração de infraestrutura.
5. **Cobrança como nó separado** (`paymentAccount`) evita que o schema de operação carregue
   campo de faturamento.

## Não coberto aqui

Como o portal **grava** vínculo de usuário, convite e permissão — está sendo levantado em
`blip-gestao-regras-tecnicas.md`. Também não há evidência, nesta captura, de papéis do
portal (administrador × atendente) além das 17 permissões do Desk.

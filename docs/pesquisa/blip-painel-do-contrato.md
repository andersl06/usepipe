# Painel do contrato — o que cada papel vê

Fonte: `main.e8593b01.chunk.js` (1,6 MB), o bundle do micro-frontend
`{conta}.tenant.fragment.blip.ai`, capturado em 13/09/2026 nas duas contas —
`supernova` (contrato, papel `guest`) e `anderson-da-silva-linhares-g813s`
(conta pessoal do autosserviço, papel `admin`).

**O bundle é bit a bit o mesmo nas duas contas.** O que muda a tela é o papel da
pessoa naquela conta, as feature flags do LaunchDarkly e as métricas do plano.
Quem quiser reproduzir o painel precisa reproduzir esses três eixos, não o código.

O painel roda dentro de um iframe no portal (`IframeMessageProxy`), pega o
contrato em vigor por `getCurrentTenant` e o papel por
`get /tenants/{id}/users/{identity}` (`roleId`). O portal pai usa
`/tenant-users-mine` para a mesma coisa; o fragmento pergunta de novo, por conta.

## A matriz de papéis

Três papéis, seis permissões, dois verbos. É uma tabela literal no código:

| permissão | `admin` | `member` | `guest` |
| --- | --- | --- | --- |
| `tenant-summary` | read, write | read | read |
| `tenant-members` | read, write | — | — |
| `tenant-workspace` | read, write | read, write | read |
| `tenant-dashboard` | read, write | — | — |
| `tenant-billing` | read | — | — |
| `tenant-permissions-group` | read, write | — | — |

Os nomes em pt-BR na tela de membros não são os do código:

| `roleId` | rótulo | descrição |
| --- | --- | --- |
| `admin` | Admin | "Edita todos os dados do contrato, gerencia membros, cria e edita chatbots." |
| `member` | **Pode editar** | "Cria e edita chatbots, mas não gerencia os membros do contrato." |
| `guest` | **Pode visualizar** | "Apenas visualiza informações do contrato." |

`tenant-dashboard` está na matriz e **nenhum cartão a usa**. Sobra do que veio antes.

## As quatro funções de conferência

O módulo da matriz exporta seis coisas. As quatro que interessam:

| export | o que faz |
| --- | --- |
| `d` | **read** — `permissões[papel][chave]` contém `"read"`. Síncrona. |
| `e` | **write** — a mesma coisa com `"write"`. Síncrona. |
| `b` | **write** + `/agent-plan/{tenantId}/active` com `hasActivePaidPlan` ou `isTrial` |
| `c` | **read** + (flag `pipeline-enable` **ou** plano de agente ativo) |

Em português: `d` só olha a matriz com "read", `e` só olha com "write", `b` exige
"write" **e** um plano de agente pago ou em trial, `c` exige "read" **e** uma de
duas coisas (a flag do Pipeline ou o plano de agente).

Detalhe do `/agent-plan`: quando a resposta vem com `reason: "notConfigured"`, a
função devolve o valor de configuração `AGENT_PLAN_NOT_CONFIGURED_KNOWLEDGE_BASE_ACCESS`
em vez de `false` — ou seja, há um interruptor de ambiente que libera a Base de
conhecimento em contrato sem plano configurado.

O sexto export (`f`) é o de rotas privadas, descrito mais abaixo.

## Os cartões, os três grupos

Cada cartão tem `group`, `option`, `icon`, `accessPermission`, `featureToggle`,
`metrics`, `path`, `segmentEvent` e `additionalCheck`.

### Configurações gerais (`generalSettings`)

Tooltip: "Visualize e configure todas as informações relacionadas ao seu contrato."

| cartão | ícone | permissão | conferência | flag | métrica | rota |
| --- | --- | --- | --- | --- | --- | --- |
| **Membros**<br>"Adicione e exclua membros do contrato" | `avatar-user` | `tenant-members` | `d` (read) | — | — | `/panel` |
| **Atendentes**<br>"Adicione atendentes para seus bots no Desk" | `agent` | `tenant-billing` | `d` (read) | — | `Agent` | `/agent` |
| **Certificados de autenticação**<br>"Gerencie seus certificados mTLS" · chip "Novo" | `lock` | `tenant-members` | `d` (read) | `enable-tenant-mtls-certificates` | — | `/mtls` |
| **Base de conhecimento**<br>"Importe manuais, guias e artigos para aprimorar as respostas do agente" · "Novo" | `brain-ai` | `tenant-workspace` | `b` (write + plano de agente) | — | — | `/knowledge-base` |
| **Pipeline**<br>"Gerencie pipelines para organizar e processar informações de forma estruturada" · "Novo" | `builder-router` | `tenant-members` | `c` (read + flag/plano) | `pipeline-enable` | — | `/pipeline` |
| **Grupos de acesso**<br>"Adicione, edite e remova grupos de acesso ao contrato" · "Novo" | `team` | `tenant-permissions-group` | `d` (read) | `portal-fragment-permission-groups-is-enabled` | — | `/permission-groups` |

### Gerenciamento de funcionalidades (`featureManagement`)

Tooltip: "Gerencie as funcionalidades disponíveis para seus bots."

| cartão | ícone | permissão | conferência | flag | rota |
| --- | --- | --- | --- | --- | --- |
| **Blip Calls**<br>"Gerencie os bots que terão acesso ao recurso de ligações" · "Novo" | `robot` | `tenant-members` | `e` (**write**) | `tenant-calls-settings` | `/calls` |

Um cartão só. Os rótulos de **Blip Copilot** ("Gerencie os bots que terão acesso
ao recurso") estão no arquivo de idiomas e **nenhum cartão os usa** — a rota
`/copilot` existe e é registrada sem `hasPermission`, alcançável só pela URL.

### Acompanhamento do plano (`usageData`)

Tooltip: "Consulte os dados de consumo relacionados ao seu contrato ou chatbot."

Nenhum destes tem `additionalCheck`. São filtrados antes, na montagem das rotas
privadas (adiante). Todos pedem `tenant-billing`, que só `admin` tem.

| cartão | ícone | flag | métricas | rota |
| --- | --- | --- | --- | --- |
| **Dados de Consumo**<br>"Visualize os dados de consumo do contrato" | `file-txt-1` | `tenant-consumption` | `MonthlyActiveUser` + `ExchangedMessage` | `/revenue` |
| **Dados de Consumo** (variante MEU) | `file-txt-1` | `billing-monthly-engaged-user-consumption` | `MonthlyEngagedUser` + `ExchangedMessage` | `/revenue` |
| **Consumo de usuários ativos diários** | `user-engaged` | `billing-daily-active-users-consumption` | `DailyActiveUser` | `/daily-active-users` |
| **Consumo de usuários engajados diários** | `user-engaged` | `billing-daily-engaged-user-consumption` | `DailyEngagedUser` | `/daily-engaged-users` |
| **Conversas**<br>"Visualize os dados de consumo de conversas" | `message-talk` | `billing-session-consumption` | `Session` | `/old-session-consumption` |
| **Atendentes**<br>"Veja os dados de consumo de atendentes acionados" | `agent` | `billing-agent-consumption` | `Agent` | `/old-agent-consumption` |
| **Relatório de consumo**<br>"Acompanhe o consumo do seu plano" | `monitoring` | `billing-data-consumption` | todas | `/data-consumption` |

O "Relatório de consumo" é **excludente**: a tela testa `billing-data-consumption`
e, se ligada, mostra SÓ ele; se desligada, mostra todos os outros menos ele. É a
tela nova que substitui as antigas.

E a seção inteira só é desenhada quando sobra **mais de um** cartão de consumo
(a contagem é feita antes do filtro do `billing-data-consumption`). Um cartão
sozinho não rende cabeçalho nem grade.

A string `"Os dados de consumo não estão disponíveis para este contrato."` existe
nos três idiomas e **não é usada em lugar nenhum** do bundle.

## O funil, na ordem em que roda

Para `generalSettings` e `featureManagement`, cartão a cartão:

1. `visible` = sem `featureToggle` **ou** a flag ligada;
2. e, se o cartão tem `metrics`, a assinatura precisa conter a métrica;
3. depois, `additionalCheck(accessPermission, roleId, tenantId, featureToggle)`.

Para `usageData` o caminho é outro: os cartões entram na montagem das **rotas
privadas**, feita uma vez no carregamento:

```js
getPrivateRoutes(subscription, user, [...cartõesDeConsumo, ...rotasDoMenuLateral])
// para cada rota:  permissão(read) && métricas(assinatura) && flags
```

A primeira linha dessa conferência é `if (!subscription) return false`.

## Por que a assinatura é o gargalo

No carregamento, o painel só busca a assinatura, o plano e os membros **se a
pessoa tiver read em `tenant-members`** — isto é, só se for `admin`:

```js
Object(Z.d)("tenant-members", o.roleId) && (
  t.subscription = await get("/tenants/{id}/subscription/plan/metrics"),
  t.info.plan   = await getTenantPlan(id),
  t.members     = await getAllTenantMembers(id)
)
```

Consequência em cascata para `member` e `guest`: sem `subscription`, o cartão
**Atendentes** some (pede a métrica `Agent`), toda a seção **Acompanhamento do
plano** some, e o campo **Membros** do cartão de resumo some (a lista fica vazia).

Sobre a métrica `Agent`: quando a quantidade contratada é `-1` (ilimitado), ela só
conta se a flag `billing-unlimited-agent-consumption` estiver ligada.

## O cartão de resumo

Sempre visível — `tenant-summary` tem read para os três papéis. Mostra, nesta ordem:

- **Nome do contrato** — campo editável (`bds-input-editable`, mínimo 2 e máximo 15
  caracteres, sanitizado sem tags) **só com write em `tenant-summary`**, ou seja,
  só para `admin`. Para `member` e `guest` vira texto `fs-24`.
- Logo abaixo, **`{id}.blip.ai`** em negrito com botão de copiar.
- A **foto** do contrato, editável pela mesma regra ("Alterar foto").
- **ID** com botão de copiar (tooltip "Copiar").
- **Data de criação**, formatada com pontos (`13.09.2026`).
- **Chatbots** — `tenant.applications.length`, só se houver.
- **Membros** — `tenant.members.length`, só se houver.
- No rodapé do cartão, o link **Deixar contrato**.

Duas ressalvas de campo: `tenant.applications` é inicializado como `[]` e
**nunca é preenchido** neste fragmento (não existe `setTenantApplications`), então
a linha "Chatbots" não aparece na prática; e `members` só é carregado para `admin`,
então a linha "Membros" é exclusiva dele.

O cartão tem dois arranjos. Fica **horizontal** (faixa de largura inteira) quando
não há nenhum cartão de Configurações gerais **e** não há seção de consumo —
o estado do `guest`. Caso contrário fica na coluna lateral, em pé.

## "Deixar contrato" — os três alertas

O link só é renderizado quando `loggedUser.identity !== tenant.info.ownerIdentity`.
O dono do contrato não tem como sair pela tela.

Ao clicar, o painel chama `/tenants/{id}/unique-admin-applications/{identity}` e
decide entre três alertas (todos `variant: "delete"`, ícone `trash`):

| quando | título | corpo | botões |
| --- | --- | --- | --- |
| a pessoa é **admin único** de algum chatbot | "Ops… você não pode deixar esse contrato" | "Antes de deixar o contrato, você precisa transferir a permissão administrativa de todos os chatbots em sua propriedade." | Cancelar · **Ir para chatbots** |
| é o **único contrato** da pessoa | "Quer mesmo deixar esse contrato?" | "Esse é o seu único contrato ativo. Caso queira utilizar o Blip novamente, você deverá criar um novo contrato ou ser convidado para algum já existente." | Cancelar · Deixar contrato |
| há outros contratos | "Quer mesmo deixar esse contrato?" | "Ao sair, você perderá o acesso a todos os chatbots e especificações. Caso queira voltar, deverá reenviar uma solicitação ou receber um novo convite." | Cancelar · Deixar contrato |

A ordem importa: o bloqueio por chatbot órfão é testado primeiro e os outros dois
nem chegam a ser avaliados. Confirmado o segundo caso, o painel apaga o vínculo
(`delete /tenants/{id}/users/{identity}`) e joga a pessoa em
`/application/tenant/create`; confirmado o terceiro, recarrega em outro contrato.
Os dois emitem `tenant-leave-contract-click` e `tenant-leave-contract-success`.

## O que cada papel vê, em uma linha

### `admin`

O painel inteiro, na medida das flags e do plano: cartão de resumo com nome e foto
editáveis, ID, data, Membros; **Membros** e **Atendentes** (este último se a
assinatura tiver a métrica `Agent`); **Certificados de autenticação**, **Pipeline**,
**Grupos de acesso** e **Blip Calls** conforme as flags; **Base de conhecimento**
se houver plano de agente pago ou trial; e **Acompanhamento do plano** com os
cartões de consumo cujas métricas estão na assinatura.

### `member` ("Pode editar")

Cartão de resumo em modo leitura (sem editar nome nem foto, sem linha Membros) e,
no máximo, **um** cartão: **Base de conhecimento** — e só se o contrato tiver plano
de agente ativo, porque `member` tem write em `tenant-workspace`. Nada de
Configurações gerais além disso, nada de Gerenciamento de funcionalidades, nada de
Acompanhamento do plano.

### `guest` ("Pode visualizar")

Só o cartão de resumo, em modo leitura, na faixa horizontal, com "Deixar contrato".
Zero cartões: `guest` tem apenas read em `tenant-summary` e `tenant-workspace`, e o
único cartão de workspace (Base de conhecimento) exige **write**.

### A conta pessoal do autosserviço

Quem cria a conta é `admin` dela — o papel não é o problema. O que apaga a tela é
o resto do funil:

- **Atendentes** cai pela métrica: a assinatura `standard` não traz `Agent`.
- **Certificados de autenticação** cai pela flag `enable-tenant-mtls-certificates`.
- **Pipeline** cai pela flag `pipeline-enable`.
- **Grupos de acesso** cai pela flag `portal-fragment-permission-groups-is-enabled`.
- **Blip Calls** cai pela flag `tenant-calls-settings`.
- **Base de conhecimento** cai no `/agent-plan/{id}/active` — sem plano pago nem
  trial (e sem o `AGENT_PLAN_NOT_CONFIGURED_KNOWLEDGE_BASE_ACCESS` ligado).
- **Acompanhamento do plano** cai nas métricas: as flags `billing-*` e a
  assinatura do plano pessoal não cobrem os cartões, e a seção ainda exige mais de
  um sobrevivente.

Sobra **Membros** — o único cartão sem flag e sem métrica — e o cartão de resumo
completo, com nome e foto editáveis. É por isso que a conta pessoal parece vazia
sendo administrada por quem a criou: não é falta de permissão, é falta de contrato.

*Quais flags exatamente estão ligadas ou desligadas em cada conta: não confirmado
pelo bundle. O bundle só dá os nomes das flags; o valor vem do LaunchDarkly em
tempo de execução.*

## As rotas do fragmento

```
/                         resumo (o painel)
/panel                    Membros
/agent                    Atendentes
/copilot                  Blip Copilot  (sem cartão, sem guarda)
/calls                    Blip Calls
/mtls                     Certificados            guarda: d(tenant-members)
/knowledge-base           Base de conhecimento    guarda: b(tenant-workspace)
/knowledge-base/:catalogId/documents                  b(tenant-workspace)
/knowledge-base/:catalogId/documents/:documentId/url-paths   b(tenant-workspace)
/pipeline                 Pipeline                guarda: c(tenant-members)
/permission-groups        Grupos de acesso
```

Mais as rotas de consumo, montadas dinamicamente: `/revenue`,
`/daily-active-users`, `/daily-engaged-users`, `/old-session-consumption`,
`/old-agent-consumption`, `/data-consumption`, `/dau-consumption`,
`/deu-consumption`, `/session-consumption`, `/mau-consumption`, `/meu-consumption`,
`/advanced-deu-consumption`, `/ai-tokens-consumption` — cada uma com `/monthly`,
`/daily` ou `/chatbots` abaixo.

A guarda de `/agent` é a mais frouxa: **não testa papel nenhum**, só se a assinatura
tem a métrica `Agent`. Na prática dá no mesmo, porque a assinatura só é carregada
para `admin` — mas a regra escrita ali não é a mesma do cartão.

## As flags, todas de uma vez

Vinte e quatro nomes, num módulo só:

```
tenant-consumption                              billing-agent-consumption
billing-monthly-engaged-user-consumption        billing-unlimited-agent-consumption
billing-daily-active-users-consumption          billing-data-consumption
billing-daily-engaged-user-consumption          tenant-ai-settings-copilot
billing-daily-active-users-plan-informations    tenant-calls-settings
billing-daily-engaged-users-plan-informations   billing-tracking-log
billing-session-consumption-by-bot              enable-tenant-mtls-certificates
billing-session-consumption                     billing-use-subscription-reference-date
pipeline-enable                                 billing-databricks-storage-type-enabled
portal-fragment-permission-groups-is-enabled    knowledge-base-document-pre-processing
billing-advanced-deu-enabled                    billing-ai-token-enabled
billing-deu-ai-enabled                          studio-grounding-preprocessing-enabled
```

`billing-advanced-deu-enabled` é a única consultada **por cluster**
(`isFeatureToggleEnabledByCluster`), nas rotas de DEU avançado e de token de IA.

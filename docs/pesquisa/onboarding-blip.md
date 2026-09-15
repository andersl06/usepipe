# Onboarding da Blip — o fluxo real, tela por tela, e o plano para o Pipe

Levantamento de 12/09/2026 sobre páginas salvas offline do fluxo de entrada da Blip.
Complementa `blip-identidade-tenant-permissao.md` (hierarquia usuário↔tenant) e
`arquitetura-multi-tenant.md` (a decisão que o Pipe já tomou).

**Uso.** Só leitura. Nenhum código de produto foi alterado nesta rodada. Regra descrita em
português e nome de campo são fato; expressão (o bundle deles) não se copia.

## Onde estão as evidências

| Tela | Pasta capturada | Arquivo que importa |
|---|---|---|
| Landing | `…\Temp\claude\ob-www-blip-ai` | `www.blip.ai\index.html` |
| Welcome / portal sem conta | `…\Temp\claude\ob-portal-blip-ai` | `portal.blip.ai\welcome.html`, `portal.blip.ai\portal.js` (21 MB), `portal.blip.ai\settings.json` |
| Minha conta | `…\Temp\claude\ob-accountmanagement-api-blip-ai` | `accountmanagement-api.blip.ai\account.html`, `…\lib\AccountIndex.js` |
| Portal do tenant criado | `…\Temp\claude\ob-anderson-linhares-oxo7k-blip-ai` | `anderson-linhares-oxo7k.blip.ai\portal.js` (mesmo bundle) |
| Textos pt-BR | ambas as pastas de portal | `vendor-app_modules_translate_translationLoaders_sync_recursive_js_.b24c54226d22ac12.js` (1,7 MB) |

`…\Temp\claude` = `C:\Users\ANDERS~1.LIN\AppData\Local\Temp\claude`.

Como o bundle é de 21 MB numa linha, a leitura foi feita por offset. O script auxiliar está em
`…\scratchpad\g.js` (grep com contexto por índice de caractere) — descartável, não faz parte do repo.

---

## 1. O fluxo real, passo a passo

```
landing (www.blip.ai)
   ├─ "Fale com um especialista"  →  /contato/ , /demonstracoes/   (venda assistida)
   └─ entrar / criar conta        →  account.blip.ai  (IdP próprio, OIDC)
                                        │
                        accountmanagement-api.blip.ai  ← perfil + dados da empresa
                                        │
                        portal.blip.ai/welcome   ← "Conta ativada com sucesso!"
                                        │  [Vamos lá]
                        ┌───────────────┴────────────────┐
              e-mail corporativo                  e-mail pessoal
              com tenant já existente             (ou domínio sem tenant)
                        │                                │
          /existing-tenant → tela "Hey! Você       CreatePersonalTenant()
          faz parte de {tenant}?"                  cria contrato novo
          [Solicitar acesso] | [Criar nova conta]        │
                        │                         redireciona p/ <slug>.blip.ai
                        └───────────────┬────────────────┘
                                        │
                        portal do contrato  (auth.application.list)
                        sem nada criado → "Criar fluxo" | "Criar roteador"
                        canto sup. esquerdo → seletor de contratos
```

### 1.1 Landing — dois caminhos, de propósito

A captura da landing é WordPress+Elementor com menu montado por JS, então os CTAs de entrada
não aparecem no HTML estático. O que sobreviveu no `index.html` são os links de venda assistida:
`href="/contato/"` e `href="/demonstracoes/"`, mais o texto *"Fale com nosso time Comercial por
telefone ou…"*. A entrada direta existe (é por ela que o resto da captura foi feito) e leva ao
IdP `account.blip.ai` — confirmado em `portal.blip.ai\settings.json`:

```json
"blipAccountUrl": "https://account.blip.ai",
"blipAccountIssuer": "account.blip.ai",
"blipAccountClientId": "blip-portal",
"accountManagementUrl": "https://accountmanagement-api.blip.ai",
"accountManagementAuthentication": "https://accountmanagement-authentication.blip.ai"
```

**Regra:** a landing não obriga ninguém a falar com vendas. Venda assistida e self-service
convivem na mesma página.

### 1.2 Welcome — a porta de uma vez só

Estado AngularJS `auth.welcomeScreen`, `url: "/welcome?tenant-invitation"`
(`portal.blip.ai\portal.js`, módulo `account`, @6560371). Template no módulo `20814` (@2152891):

```html
<div id="welcome-screen" …>
  <h1 translate> welcomeScreen.accountActivated </h1>
  <p  translate> welcomeScreen.description </p>
  <bds-button ng-click="$ctrl.goToTenantScreen()" arrow="true">
    {{'welcomeScreen.letsGo' | translate}}
  </bds-button>
  <img src="/assets/img/welcme-screen-detail.png"/>   <!-- typo é deles -->
</div>
```

Textos pt-BR (arquivo de tradução, @232650):

| Chave | pt-BR |
|---|---|
| `welcomeScreen.accountActivated` | Conta ativada com sucesso! |
| `welcomeScreen.description` | Olá! Chegou a hora de começar sua jornada de criação, gestão e evolução de contato inteligente. Mas, primeiro, precisamos criar seu espaço de trabalho. |
| `welcomeScreen.letsGo` | Vamos lá |
| `welcomeScreen.errorWhileRedirect` | Erro ao redirecionar usuário |

**Quem cai aqui, e uma vez só.** Guard global no `$stateChangeStart` (@6374630):

```js
$rootScope.$on("$stateChangeStart", async (n, a, s) => {
    if (a.name.startsWith("anon")) return;
    if (!await TenantService.isOrganizationEnabled()) {
        const n = await AccountService2.me();
        if ("true" != n?.extras?.isOldUser && !a.name?.startsWith("auth.application.tenant") …) {
            $state.go("auth.welcomeScreen", { "tenant-invitation": s["tenant-invitation"] })
        }
    }
})
```

Quer dizer: **o welcome é um portão marcado por uma flag no perfil do usuário**
(`extras.isOldUser`), não por "o usuário tem zero contas". Quem ainda não passou por ele é
arrastado de volta a cada navegação. `bindBlipAccount()` (@5135187) é quem carimba a flag:

```js
async bindBlipAccount() {
    if (!this.blipAccount) {
        this.blipAccount = await this.AccountService2.me();
        const e = this.isOrganizationEnabled
            ? {...this.blipAccount.extras}
            : {...this.blipAccount.extras, isOldUser: "true"};
        await this.AccountService2.setExtras(e)
    }
}
```

**Variante "fale mais sobre você".** O mesmo controller (`class x`, @6526000–6540000) monta uma
pesquisa que a captura desta sessão não exibiu, mas cujos campos estão no código e nas traduções:

| Campo | Rótulo pt-BR | Opções (valores no código) |
|---|---|---|
| `userPosition` | Meu cargo é: | analyst, assistant, developer, intern, student, coordinator, manager, director, founder — ordenadas por rótulo traduzido |
| `userArea` | Minha área é: | customerService, data, finance, legal, marketing, product, hr, sales, it |
| `userInterest` | Tenho interesse em: | acquireOrFilterNewClients, automateClientCommunication, toolForServiceTeam, other |
| `userInterestOtherOption` | Conte mais sobre os seus objetivos no Blip: | texto livre, só quando `userInterest === 'other'` |
| `phoneNumber` | — | telefone com seletor de DDI (`changePhoneNumber` concatena `code + value`) |
| `waOptIn` | Ativar comunicações com Take Blip por Whatsapp | switch |

### 1.3 `goToTenantScreen()` — o coração da coisa

`portal.blip.ai\portal.js` @6535436. É aqui que "de forma orgânica é criada uma conta nova":

```js
async goToTenantScreen() {
  if (this.isOrganizationEnabled) {
      await this.setIsOldUserAccount();
      if (this.tenantId)  window.location.href = TenantService.getTenantUrl(this.tenantId, true)
      else                $state.go("auth.application.list")
  } else {
      const dominio = await this.TenantService.TryGetDomainTenant();      // (a)
      if (dominio != null) {
          const meus = await this.TenantService.mine();
          if (meus.items.some(i => i.id === dominio.id))                  // (b)
               return $state.go("auth.application.list");
          $state.go("auth.application.tenant…", {id: dominio.id, name: dominio.name})  // (c)
      } else {
          if (!(isPersonalTenantEnabled && contaCriadaDepoisDoCorte))     // (d)
               return $state.go("auth.application.list");
          const url = await this.TenantService.CreatePersonalTenant();    // (e)
          await this.setIsOldUserAccount();
          window.location.href = url
      }
  }
}
```

Leitura em português:

- **(a)** procura um contrato pelo **domínio do e-mail** (`AccountService2.getEmailDomain`). É a
  descoberta por domínio — a mesma ideia que o Pipe já tem em `dominio_tenant`.
- **(b)** se achou e o usuário já é membro, entra direto na lista de aplicações.
- **(c)** se achou e o usuário **não** é membro, manda para a tela `existingTenant` — "pede acesso
  ou cria conta própria".
- **(d)** se não achou domínio: só cria conta pessoal se a flag `personalTenantEnabled` estiver
  ligada **e** a conta do usuário for posterior a uma data de corte (contas antigas ficam no
  contrato "Default", sem subdomínio). `settings.json` traz `"personalTenantEnabled": "true"` e
  `"dateToCompareTenant": "2021-10-01"`.
- **(e)** cria o contrato e **redireciona para o subdomínio novo**.

Tela `existingTenant` (traduções pt-BR):

| Chave | pt-BR |
|---|---|
| `existingTenant.heading` | Hey! Você faz parte de {{tenantName}}? |
| `existingTenant.organizationsConnectPeople` | Os espaços de trabalho no Blip são divididos por **contratos**. Contratos conectam pessoas que, provavelmente, compartilham projetos dentro de uma mesma **empresa** ou **organização**. |
| `existingTenant.organizationIdentifiedByYourEmail` | Você está usando um e-mail corporativo, então precisa da permissão da empresa para acessar o Blip. Se preferir, você pode criar uma nova conta com seu e-mail pessoal. O que você quer fazer? |
| `existingTenant.askToJoin` | Solicitar acesso |
| `existingTenant.createAnotherAccount` | Criar uma nova conta |
| `existingTenant.inviteAlreadySentError` | Você já pediu para participar deste contrato! |

E, na sequência, `tenantInvitationSent` ("Request sent / You'll get an e-mail as soon as your
solicitation is approved") — o pedido vira convite pendente para um admin aprovar.

**Nota de vocabulário:** no pt-BR da Blip, `tenant` é traduzido como **"contrato"**
(`"tenant":"Contrato"` no arquivo de traduções). O Pipe já usa "tenant" no código e "conta" na
conversa — vale fixar um dos dois na UI.

### 1.4 `CreatePersonalTenant()` — como nasce a conta

```js
async CreatePersonalTenant() {
    const eu = await this.AccountService2.me();
    const {id, name} = await this.getValidId(eu.email, eu.fullName);  // slug reservado no servidor
    const url = this.getTenantUrl(id);                                // https://<id>.blip.ai
    await this.set({id, name});                                       // cria
    await this.setTenantUserDefaultContract({id, name});              // marca como padrão do usuário
    return url
}
```

`getValidId` é o que explica o sufixo aleatório do subdomínio capturado
(`anderson-linhares-oxo7k`): o servidor deriva o slug do nome e garante unicidade.
`getTenantUrl(id)` = `` `https://${id}.${PORTALDOMAIN}` `` — **o contrato é um subdomínio**.

### 1.5 API de tenants — LIME, não REST

Tudo passa por comandos LIME para `postmaster@portal.blip.ai` (`portalPostmaster` no settings).
Mapa completo do `TenantService` (@14659576–14672000):

| Método | URI LIME | Uso |
|---|---|---|
| `get` | `GET /tenants` ou `/tenants/{id}` | ler contrato |
| `set` | `SET /tenants/{id}` type `application/vnd.iris.portal.tenant+json` | criar/atualizar |
| `setTenantNew` | `SET /tenant/create` | criação nova (rota mais recente) |
| `getIfExists` | `GET /existing-tenant/{dominio}` | **descoberta por domínio de e-mail** |
| `getValidId` | `GET /tenant-valid-id?email=…&name=…` | reservar slug único |
| `getPermissionCreateContract` | `GET /tenant-create-permission` | pode criar contrato? |
| `mine` | `GET /tenants-mine` | **lista do seletor do topo** |
| `tenantUsersMine` | `GET /tenant-users-mine` | meus vínculos |
| `getTenantUsers` | `GET /tenants/{id}/users` | membros |
| `getTenantUser` | `GET /tenants/{id}/users/{identity}` | papel de um membro |
| `joinTenant` | `SET /tenants/{id}/users` (um item) | entrar / pedir acesso |
| `inviteMany` | `SET /tenants/{id}/users` (collection, com `roleId`) | convidar em lote |
| `setMemberStatus` | `SET /tenants/{id}/users/{identity}/user-status` | aprovar/bloquear |
| `getTenantUserDefaultContract` | `GET /tenants-default-contract` | contrato padrão |
| `setTenantUserDefaultContract` | `SET /tenants/{id}/default-contract` | define o padrão |
| `assignBotToTenant` | `SET /tenants/{id}/applications` | vincular bot ao contrato |
| `assignMultipleBotsToTenant` | `SET /tenants/{id}/applications[-contract-admin]` | em lote |
| `getBotsByTenantId` | `GET /tenants/{id}/applications` | bots do contrato |
| `getInvalidApplicationsToLinkTenant` | `GET /tenants/{id}/validate-applications?applications=…` | validação |
| `getTenantClusterName` | `GET /applications/{bot}@msging.net/tenant` | cluster |
| `setGrantExternalLoginAccess` | `SET /tenants/{id}/tenant-user-external-login` | SSO externo |

Identidade do usuário no comando: `` `${encodeURIComponent(email)}@${BLIP_DOMAIN}` `` — o e-mail
vira identidade LIME. Papéis usados nos checks: `Admin`, `Member` (`hasRequiredTenantRole`).

### 1.6 "Minha conta" (account management)

Página ASP.NET MVC, `accountmanagement-api.blip.ai\account.html`. O `<form id="account-form">`
(linha 151) posta em `/Account?portalUrl=https%3A%2F%2Fportal.blip.ai` com antiforgery token.
Os campos não estão no HTML: são montados em JS dentro das divs `#profileFields` e
`#preferenceFields` por `lib\AccountIndex.js` (linhas 380–620).

**Aba "Meu perfil"** — ordem exata do `appendChild` (AccountIndex.js:559-567):

| # | `id`/`name` | Rótulo | Tipo | Obrigatório | Validação / máscara |
|---|---|---|---|---|---|
| 1 | `FullName` | Nome completo | texto | sim | min 6, max 250 |
| 2 | `Email` | E-mail | email | sim | `readonly` (linha 458: `$('#Email').attr('readonly', true)`) |
| 3 | `PhoneNumber` | Telefone | texto + máscara | **sim** | `libphonenumber-js`: `parsePhoneNumberFromString(v, CultureIetfCode).isPossible()`; máscara por cultura via `execPhoneMask` |
| 4 | `CompanySite` | Site da empresa | texto | **sim** | regex `^(https?:\/\/(www\.)?)?[a-z0-9]+([\-\.][a-z0-9]+)*\.[a-z]{2,8}(:\d{1,5})?(\/.*)?$`, min 3, max 50 |
| 5 | `CompanyNumberOfEmployees` | Nº de funcionários | select → input hidden | — | faixas (abaixo) |
| 6 | `City` | Cidade | texto com autocomplete | — | Google Places `types:['geocode']`, `autocomplete="off"` |
| 7 | `State` | Estado | texto | — | **`readOnly: true`** — preenchido pelo Places |
| 8 | `Country` | País | texto | — | **`readOnly: true`** — preenchido pelo Places |
| 9 | `OptInContactWhatsapp` / `OptinWhatsApp` | Contato via WhatsApp | checkbox + hidden | não | — |

Faixas de funcionários (AccountIndex.js:386-420), rótulo montado como
`"{a} {preposição} {b} {funcionários}"`:

```
1 a 4 · 5 a 19 · 20 a 49 · 50 a 249 · 250 a 999 · 1000 a 10000 · 10000+
```

Cada faixa tem um valor próprio vindo do servidor (`EmployeeNumberBand1_4` … `EmployeeNumberBand10000More`)
— ou seja, **faixa é enum, não número** (mesma armadilha já anotada nos campos de cartão do banking).

O truque do endereço (AccountIndex.js:187-227): a pessoa digita só a **cidade**; o
`place_changed` do Google Places despeja `administrative_area_level_2 → City`,
`administrative_area_level_1 → State` (short_name, ex. "MG") e `country → Country` (long_name).
Limpar a cidade zera estado e país.

**Aba "Preferências"**: `Culture` (pt/en/es, select) e `TimeZoneName` (select em modo autocomplete).

**Outras abas na mesma tela** (fora do escopo do onboarding, mas na mesma página):
chaves de acesso (`/account-access-key`, limite de 3, banner "Limite de 3 chaves atingido") e
MFA (`/mfa`, `mfaMethod` ∈ `email` | `totp`). Foto: `POST /change-photo`, aceita `.png .jpeg .jpg .gif`.

Botão "Salvar alterações" nasce `disabled` e só habilita quando `checkFormValidity()` passa.
Rodapé: *"Ao clicar em salvar alterações, eu aceito os Termos de Uso e Privacidade"*.

### 1.7 Portal com a conta criada

Depois de `CreatePersonalTenant`, o navegador vai para `https://<slug>.blip.ai`. A captura
`ob-anderson-linhares-oxo7k-blip-ai` mostra a URL `/application/create/router` — confirmando que,
com a conta vazia, o portal oferece criar fluxo ou roteador.

**Estado vazio** (template do `application.list`, @5548000 e adjacências):

```html
<bds-paper class="welcome-banner"
  ng-if="!$ctrl.applications.length && $ctrl.ContextProcessorService.tenant.id && $ctrl.canCreateChatBot …">
  <bds-typo translate-values="{ name: $ctrl.blipAccount.fullName }">onboarding.welcomeCard.greeting</bds-typo>
  <bds-typo translate>onboarding.welcomeCard.startYourJourney</bds-typo>
```

`canCreateChatBot` = `TenantService.hasRequiredTenantRole(identidade, tenantId, [Admin, Member])`.

**Ações do subheader** (chaves `navbar.*`): `createChatbot` ("Criar fluxo"),
`createChatbotRouter` ("Criar roteador"), `createTemplateHeadstart`, `createAiAgent`.

Estados de criação (`$stateProvider`):

```
/application/create/marketplace          → escolher template ou do zero
/application/create/name/{template}      → dar nome ao fluxo
/application/create/router               → o roteador
/application/create/pipeline  e  /pipelinename/{template}
```

Textos pt-BR de `createApplication`:

| Chave | pt-BR |
|---|---|
| `tagline` | Criar fluxo |
| `taglineRouter` | Criar roteador |
| `taglinePipeline` | Criar pipeline |
| `marketplace.title` | Escolha como começar seu fluxo |
| `marketplace.template.title` / `.description` | Usar template / Construa um fluxo a partir de um modelo com funcionalidades pré-configuradas e atendimento humano, simplificando o desenvolvimento. (tag: *Ideal para começar*) |
| `marketplace.scratch.title` / `.description` | Construir do zero / Construa um fluxo desde o início e faça todas as configurações manualmente. Recomendado para quem já tem experiência com o Blip. |
| `name.titleScratch` / `.titleRouter` | Dê um nome ao fluxo / Dê um nome ao seu roteador |
| `router.title` | Como funciona o roteador |
| `router.description` | O roteador ajuda a reunir vários fluxos em um só. Dessa forma, seu cliente terá acesso a múltiplos serviços conversando com um único contato inteligente. |
| `router.learnMore` | Quero saber mais → o artigo de hierarquia (§2) |
| `errorMsg.1` | Houve um erro na criação do seu fluxo. Experimente usar outro nome. |

Template do passo do roteador (módulo `22046`, @2227442) — botão chama
`$ctrl.selectTemplate('master')`.

### 1.8 O seletor de contas do canto superior esquerdo

Template `tenant-list` (módulo `81057`, @13482201):

```html
<ul class="tenant-list">
  <a ng-repeat="tenant in $ctrl.tenantsToShow"
     ng-click="$ctrl.onTenantClick(tenant)"
     ng-href="{{$ctrl.getTenantUrl(tenant.id)}}">
    <li class="tenant-profile">
      <bds-icon ng-if="!tenant.photoUri &&  tenant.id" name="business"       aria-label="contrato">
      <bds-icon ng-if="!tenant.photoUri && !tenant.id" name="message-ballon" aria-label="organization">
      <bds-avatar ng-if="tenant.photoUri" thumbnail="{{tenant.photoUri}}" size="small">
      <p>{{tenant.name}}</p>
      <p ng-if=" tenant.id">{{tenant.accountType}}</p>   <!-- tipo de conta -->
      <p ng-if="!tenant.id">{{tenant.url}}</p>           <!-- o "pessoal", sem id -->
```

Controller (@20720536):

```js
getTenantUrl(id, abs = true) {
    return id ? this.TenantService.getTenantUrl(id, abs)
              : this.TenantService.getDefaultPortalUrl(abs)
}
async onTenantClick(t) { /* só telemetria; a navegação é o ng-href */ }
```

**Regra:** trocar de conta é **navegar para outro subdomínio**, não trocar estado dentro da SPA.
A lista vem de `GET /tenants-mine`. O item **sem `id`** é o contrato "Default"/pessoal, que mora
no domínio principal (`portal.blip.ai`), não num subdomínio.

Título do subheader (`class h`, @11053): `navbar.subheader.workspaceOf` normalmente, e
`navbar.subheader.sharedWithMe` quando o contexto é `Default` com criação desabilitada.

---

## 2. Hierarquia de bots e subbots — a regra de negócio

Fonte: <https://help.blip.ai/hc/pt-br/articles/4474398386711-Hierarquia-ou-arquitetura-de-bots-e-subbots>
(atualizado 05/09/2025; o WebFetch devolve 403, foi preciso `curl` com User-Agent de navegador).

### Os quatro conceitos, nas palavras deles

> **Bot Router** — bot responsável por gerir os subbots. Este é o bot que o cliente verá, portanto
> é este bot que deverá ser publicado e testado nos canais. **O bot router não possui nenhuma
> regra ou conteúdo, apenas possui a referência de todos os subbots.** Qualquer bot router deve
> possuir pelo menos 1 subbot.

> **SubBot Principal** — Sempre que um usuário conversa com um bot router pela primeira vez ele é
> direcionado para o subbot principal da hierarquia. Ele é responsável por definir, pela primeira
> vez, qual subbot atenderá o cliente. Caso o bot router possua apenas um bot, este será
> obrigatoriamente o bot principal.

> **Subbot** — Qualquer bot pertencente à hierarquia de um bot router.

> **Serviço** — Todo subbot é reconhecido como um serviço do bot router. Essa denominação é
> necessária para que subbots com o mesmo nome possam ser utilizados dentro de um bot router.
> Será necessário dar um nome (nome do Serviço) para cada subbot. Este será o nome usado para
> referenciar seu subbot durante a troca entre os bots.

> **Expiração do redirecionamento** — É possível definir um tempo de inatividade em cada subbot.
> […] o tempo de expiração define um limite, **em segundos**, do período em que este subbot deve
> ficar ativo na conversa em relação à última interação do cliente.

### Quando usar cada um

| Situação | O que usar |
|---|---|
| Um assunto, um canal, uma equipe | **Fluxo simples** (`template: 'builder'`) — publica direto no canal |
| Vários assuntos/produtos que o cliente acessa por **um único contato** | **Roteador** (`template: 'master'`) + subbots |
| Conteúdo que se repete em mais de um bot (ex.: FAQ, LGPD, onboarding) | Roteador, para **reaproveitar** o subbot em vez de duplicar |
| Bots por idioma/filial/região com núcleo comum | Roteador: o subbot principal decide o idioma e encaminha |

O argumento central do artigo é **reuso**: sem roteador, criar um bot novo que junte dois
existentes significa "replicar todos os dados/conteúdos dos bots criados anteriormente" —
"não é uma solução muito flexível, uma vez que os dados estariam duplicados em diferentes locais".
Com roteador, "qualquer correção ou evolução feita nas aplicações Filial Brasil ou Filial EUA
também estarão disponíveis para o bot Irlandês".

### Como isso aparece no código do portal

- O tipo do bot é o campo `template` da aplicação. Enum em `portal.js` módulo `77569`:
  `MASTER: "master"`, `AI_AGENT: "aiAgent"`, `MASTER_STATE: "master-state"`.
  `isBotRouter = application?.template == 'master'` (@19299061).
- A UI de roteador tem telas próprias em vários lugares: no disparo de mensagem ativa,
  `response-targeting-router-step` substitui `response-targeting-builder-step` quando `isBotRouter`.
- Cadastro de subbot como serviço: chaves `master.addService` ("Adicionar serviço"),
  `master.createServiceName` ("Dê um nome ao serviço") e a validação
  `"Este serviço deve estar no mesmo contrato do chatbot roteador"` — **subbot e roteador têm de
  estar no mesmo tenant**. Também `"Você precisa fazer parte da equipe deste chatbot para
  visualizar o contrato"`.
- Há ainda `hasRouterChild`, `invalidRouters`, `shouldAvoidDuplicateRouterService`,
  `loadValidationsForRouterId` — indícios de que o servidor valida duplicidade de serviço e
  ciclos na hierarquia.

### O que isso significa para o Pipe

O Pipe hoje tem `fluxo` (um por canal) e `execucao_fluxo`. Não existe roteador. Para replicar:
um roteador é **um fluxo sem blocos, com uma tabela de serviços** que aponta para outros fluxos,
mais o estado "em qual subbot esta conversa está agora" e um **timeout de inatividade por serviço**.
Detalhe de implementação na fase 5.

---

## 3. O que o Pipe já tem, o que falta

### 3.1 Já existe e serve

| Peça da Blip | Equivalente no Pipe | Onde |
|---|---|---|
| Tenant / contrato | tabela **`tenant`** (`id`, `nome`, `slug` UK, `plano`, `implantacao`, `ativo`, `fuso`, `idioma`, `logo_url`, `cor_primaria`) | `packages\db\src\schema\identidade.ts` |
| `getValidId` (slug único) | `slugDaConta(nome, email)` | `apps\api\src\dominio\construtor-de-conta.ts` |
| criar contrato + primeiro usuário + papéis | `construirConta(pedido)` / `POST /v1/contas` (`{account_name, user_full_name, email}`) | `apps\api\src\controladores\contas.ts` |
| `/existing-tenant/{dominio}` | tabela **`dominio_tenant`** (`dominio` UK global, `verificado_em`, `token_verificacao`) + `descobrirEntrada(email)` → `POST /v1/auth/descobrir` | `apps\api\src\dominio\sso.ts`, `apps\api\src\controladores\sso.ts` |
| `inviteMany` / `joinTenant` | tabela **`convite`** + `POST /v1/convites`, `GET /v1/convites/:token`, `POST /v1/convites/:token/aceitar` | `apps\api\src\dominio\convites.ts` |
| papéis Admin/Member | `papel`, `permissao`, `papel_permissao`, `usuario_papel` | `identidade.ts` |
| login | Google OAuth (`GET /v1/auth/google`, `/retorno`) + OIDC/SSO por tenant (`conexao_sso`) | `packages\autenticacao\src\{google,oidc,entrada}.ts` |
| sessão | `sessao` (`token_hash`, `origem` ∈ senha/google/sso), cookie `pipe_sessao` | `packages\autenticacao\src\sessao.ts` |
| `GET /v1/eu` → tenant + permissões | `Eu` (`usuario`, `tenant{id,nome,slug,plano}`, `permissoes[]`, `origem`) | `packages\contracts\src\sessao.ts` |
| fluxo / builder | `fluxo`, `fluxo_versao`, `bloco`, `transicao`, `execucao_fluxo`, `execucao_passo` | `packages\db\src\schema\automacao.ts` |
| tela pública de entrada | `/entrar` e `/convite/[token]` + middleware que protege o resto | `apps\gestao\src\app\entrar\page.tsx`, `apps\gestao\src\middleware.ts` |

### 3.2 Falta

| # | Falta | Consequência |
|---|---|---|
| F1 | **Usuário é preso a um tenant.** `usuario` tem UK `(tenant_id, email)` e a sessão carrega um único `tenant_id`. | Impossível "administrar várias empresas num portal só". Bloqueia o seletor. |
| F2 | **Não há tela de welcome.** Quem entra sem conta vai direto para `/` (ou toma 500/redireciona). | Falta o "Conta ativada com sucesso!". |
| F3 | **Não há "minha conta".** Nenhum dos campos de perfil/empresa existe: sem `telefone`, `site_empresa`, `faixa_funcionarios`, `cidade`, `uf`, `pais`, `cargo`, `area`, `interesse`, `optin_whatsapp`, `fuso`, `idioma` no `usuario`. | Não dá para qualificar o lead nem preencher o que a Blip preenche. |
| F4 | **`POST /v1/contas` não é acionável pela UI.** Existe rota, não existe tela; e ela pede `account_name` — não há o caminho "cria sozinho a partir do nome do usuário". | O onboarding orgânico não fecha. |
| F5 | **Sem seletor de contas no header.** `estrutura-gestao.tsx` mostra `dados.tenant.nome` como texto estático. | Sem troca de conta. |
| F6 | **Sem "solicitar acesso"** quando o domínio bate com um tenant existente. `descobrirEntrada` só devolve `{metodo: 'sso'\|'google'}`; não existe pedido pendente. | Falta o `existingTenant` + `tenantInvitationSent`. |
| F7 | **Sem roteador.** Não há `template` em `fluxo`, nem tabela de serviços/subfluxos, nem estado de subfluxo na conversa. | Falta a metade da regra de negócio do §2. |
| F8 | **Sem estado vazio no portal** oferecendo "Criar fluxo" / "Criar roteador". `/builder` existe mas não tem onboarding. | — |

### 3.3 Precisa mudar

- **F1 é a mudança estrutural.** A Blip tem usuário global (identidade `email@blip.ai`) e N vínculos.
  O Pipe tem usuário por tenant. Duas saídas:
  - **(A) Vínculo N:N de verdade** — `usuario` vira global (UK em `email`), `usuario_papel` já é o
    vínculo (`tenant_id, usuario_id, papel_id`) e passa a ser a fonte da lista "minhas contas".
    Mexe em RLS, em `entrarComIdentidade` e em toda consulta que assume `usuario.tenant_id`.
  - **(B) Usuário-espelho por tenant, ligados por `identidade_externa`** — `identidade_externa` já
    tem UK **global** `(emissor, sujeito)`, ou seja, hoje **um Google sub só pode existir em um
    tenant**. Trocar essa UK para `(tenant_id, emissor, sujeito)` e usar `(emissor, sujeito)` como
    chave de "mesma pessoa" permite listar as contas sem tocar em RLS.

  **(B) é o caminho preguiçoso e o que a Blip faz na prática** (cada contrato é um subdomínio com
  seu próprio contexto; o que une é o e-mail). Custo: uma migration que troca uma UK, mais uma
  consulta cross-tenant com `SECURITY DEFINER` para montar a lista. Custo de (A): reescrever RLS.
  → **Recomendação: (B).**

- `dominio_tenant` já existe mas hoje só serve ao SSO. Reusar na descoberta do welcome, sem
  tabela nova.
- `convite` já tem tudo para o "solicitar acesso": basta um convite criado pelo próprio
  solicitante, com `papel_id` do papel padrão e `aceito_em` nulo, mais um estado "pendente de
  aprovação". Uma coluna, não uma tabela.

---

## 4. Plano de implementação, em fases curtas

Cada fase é um PR. Nada de tecnologia nova: Next App Router + server actions no `gestao`,
NestJS no `api`, Drizzle no `db`, CSS na folha `globais.css`.

### Fase 1 — Perfil do usuário (as colunas de "minha conta")

**Arquivos**
- `packages\db\src\schema\identidade.ts` — colunas em `usuario`: `telefone`, `site_empresa`,
  `faixa_funcionarios` (CK sobre as 7 faixas), `cidade`, `uf`, `pais`, `cargo`, `area`,
  `interesse`, `interesse_outro`, `optin_whatsapp` (bool def false), `fuso`, `idioma`,
  `perfil_completo_em` (timestamptz null — é o `isOldUser` deles).
- `packages\db\drizzle\0017_perfil_do_usuario.sql`
- `packages\core` — constantes `FAIXAS_DE_FUNCIONARIOS`, `CARGOS`, `AREAS`, `INTERESSES`
  (valores do §1.2/§1.6, rótulos em pt-BR).

**Pronto quando** a migration roda, `pnpm -F @pipe/db test` passa e um teste confirma que o CK da
faixa rejeita valor fora da lista.

### Fase 2 — `GET/PUT /v1/eu/perfil` + tela "Minha conta"

**Arquivos**
- `apps\api\src\controladores\eu.ts` (ou `entrar.ts`) — `GET /v1/eu/perfil`, `PUT /v1/eu/perfil`.
  Validação **no servidor**, espelhando a Blip: nome 6–250; telefone via
  `libphonenumber-js` (`isPossible`); site pelo regex do §1.6, 3–50; faixa ∈ enum; e-mail nunca
  editável. Gravar `perfil_completo_em = now()` quando os obrigatórios estiverem preenchidos.
- `packages\contracts\src\sessao.ts` — `interface Perfil`.
- `apps\gestao\src\app\conta\page.tsx` + `acoes.ts` — abas "Meu perfil" / "Preferências".
- `apps\gestao\src\app\globais.css` — seção "minha conta".

**Decisão pendente:** o autocomplete de cidade da Blip é Google Places. O Pipe não tem chave do
Maps. Preguiçoso: `cidade` texto livre + `uf` como `<select>` das 27 UFs + `pais` fixo "Brasil".
Places entra depois se o produto for internacional.

**Pronto quando** a tela salva e recarrega os 9 campos, o botão nasce `disabled` e habilita só com
o formulário válido, e um teste de API rejeita telefone e site inválidos.

### Fase 3 — Welcome + criação orgânica da conta

**Arquivos**
- `apps\gestao\src\middleware.ts` — sessão sem tenant, ou `perfil_completo_em` nulo → `/bem-vindo`.
- `apps\gestao\src\app\bem-vindo\page.tsx` + `acoes.ts` — "Conta criada com sucesso!" + botão
  "Vamos lá" (copiar o texto da Blip sem menção à marca deles).
- `apps\api\src\dominio\construtor-de-conta.ts` — `construirContaPessoal(usuario)`: deriva
  `account_name` do nome do usuário, usa `slugDaConta` com sufixo curto para unicidade (é o
  `getValidId`), cria tenant + papéis + vincula.
- `apps\api\src\controladores\contas.ts` — `POST /v1/contas/minha` (sem corpo, usa a sessão).
- `apps\api\src\dominio\sso.ts` — expor `tenantPorDominio(email)` para a decisão (a) do §1.3.

Fluxo do botão "Vamos lá", igual ao `goToTenantScreen`:
1. domínio do e-mail casa com `dominio_tenant` **verificado** e já sou membro → vai para `/`;
2. casa mas não sou membro → `/entrar/solicitar-acesso` (fase 4);
3. não casa → `POST /v1/contas/minha` → vai para `/`.

**Pronto quando** um e-mail novo que entra por Google cai no welcome, clica uma vez e acorda dentro
de um tenant próprio com papel de admin; e voltar ao welcome depois disso é impossível
(`perfil_completo_em` preenchido).

### Fase 4 — "Solicitar acesso" ao tenant do domínio

**Arquivos**
- `packages\db\...\0018_convite_pendente.sql` — coluna `origem` em `convite`
  (`'convidado'` | `'solicitado'`) e `aprovado_em`; índice para listar pendentes.
- `apps\api\src\dominio\convites.ts` — `solicitarAcesso(tenantId, pessoa)` e
  `aprovarSolicitacao(conviteId, aprovador)`.
- `apps\api\src\controladores\convites.ts` — `POST /v1/convites/solicitar`,
  `GET /v1/convites/pendentes`, `POST /v1/convites/:id/aprovar`.
- `apps\gestao\src\app\entrar\solicitar-acesso\page.tsx` — a tela `existingTenant`:
  "Você faz parte de {nome}?" com dois botões, "Solicitar acesso" e "Criar uma nova conta".
- `apps\gestao\src\app\atendentes\gestao\page.tsx` — lista de pendentes para o admin aprovar.

**Pronto quando** dois e-mails do mesmo domínio verificado: o segundo vê a tela, pede acesso, o
admin aprova e ele entra no mesmo tenant. Pedir duas vezes devolve "Você já pediu para participar".

### Fase 5 — Seletor de contas no topo

**Arquivos**
- `packages\db\...\0019_identidade_multi_conta.sql` — troca a UK de `identidade_externa` de
  `(emissor, sujeito)` para `(tenant_id, emissor, sujeito)`; índice em `(emissor, sujeito)`.
- `packages\autenticacao\src\entrada.ts` — `entrarComIdentidade` para de assumir unicidade global;
  quando o mesmo `(emissor, sujeito)` existe em mais de um tenant, escolhe o tenant padrão
  (novo campo `tenant_padrao_id` no vínculo, ou o mais recente por `ultimo_acesso_em`).
- `apps\api\src\controladores\entrar.ts` — `GET /v1/eu/contas` (equivalente do `/tenants-mine`) e
  `POST /v1/eu/conta` (troca a sessão de tenant, reemitindo o cookie).
- `apps\gestao\src\componentes\estrutura-gestao.tsx` — transformar `div.g-tenant` em dropdown
  (o padrão visual já existe: o seletor de canais na mesma barra).
- `apps\gestao\src\lib\cabecalho.ts` — carregar a lista junto do cabeçalho.

**Cuidado (RLS):** `GET /v1/eu/contas` cruza tenants. Não relaxar a policy — usar uma função
`SECURITY DEFINER` que só devolve `id, nome, slug, plano` dos tenants onde
`(emissor, sujeito)` da sessão existe. Uma função, não um bypass.

**Pronto quando** um mesmo Google entra em dois tenants, o dropdown lista os dois, trocar recarrega
com o outro tenant e um teste prova que a lista **não** vaza tenant onde a pessoa não tem vínculo.

### Fase 6 — Roteador (fluxo pai + subfluxos)

**Arquivos**
- `packages\db\src\schema\automacao.ts` + `0020_roteador.sql`:
  - `fluxo.tipo` ∈ `'simples'` | `'roteador'` (default `'simples'`).
  - `servico_roteador`: `id`, `tenant_id`, `roteador_id`→fluxo CASCADE, `subfluxo_id`→fluxo
    RESTRICT, `nome` (o "nome do Serviço"), `principal` bool, `expiracao_segundos` int null,
    `ordem`. UK `(roteador_id, nome)`; CK "no máximo um `principal` por roteador"; CK
    `roteador_id <> subfluxo_id`.
  - `execucao_fluxo.servico_atual_id` (null = no roteador) e `servico_expira_em`.
- `apps\api\src\dominio\fluxo.ts` — antes de rodar, resolver o serviço ativo da conversa:
  sem serviço ou expirado → subfluxo **principal**; com serviço válido → aquele subfluxo. Ação
  nova de bloco `transferir_servico` (é o "Redirecionar a um serviço" deles).
- `apps\gestao\src\app\builder\` — criar roteador e gerir serviços.

**Validações que a Blip faz e o Pipe precisa fazer** (§2): roteador tem ≥ 1 subbot; subfluxo tem
de ser do **mesmo tenant**; nome de serviço único dentro do roteador; sem ciclo (subfluxo de um
roteador não pode ser o próprio roteador, direta ou indiretamente).

**Pronto quando** um roteador com dois subfluxos: a primeira mensagem cai no principal, o bloco
`transferir_servico` troca para o segundo, mensagens seguintes continuam nele, e depois de
`expiracao_segundos` sem interação a conversa volta para o principal. Um teste por afirmação.

### Fase 7 — Estado vazio do portal

**Arquivos**
- `apps\gestao\src\app\page.tsx` — quando o tenant não tem fluxo nem canal, mostrar o cartão de
  boas-vindas com nome do usuário e os dois botões: **Criar fluxo** e **Criar roteador**
  (+ "Usar template" / "Construir do zero", já que o Pipe tem `importarFluxoDaBlip`).
- `apps\gestao\src\app\globais.css`.

**Pronto quando** um tenant recém-criado abre o portal e vê os dois caminhos; com um fluxo criado,
o cartão some.

---

## 5. Ordem, e o que dá para cortar

Caminho crítico para reproduzir a demo que o usuário descreveu: **1 → 2 → 3 → 7**.
Isso já entrega "entra sem conta → welcome → minha conta → conta criada → portal com criar
fluxo/roteador".

As fases 4, 5 e 6 são independentes entre si e podem sair depois:
- **4** só importa quando houver mais de uma pessoa por domínio;
- **5** só importa quando alguém precisar de duas empresas — e é a que mexe em RLS, então merece
  um PR sozinha;
- **6** é a maior, e é regra de produto, não de onboarding.

O que **não** vale copiar agora: Google Places (fase 2), MFA e chaves de acesso da tela "minha
conta" (existem no Pipe por outro caminho — `chave_api`), e o "pipeline" (terceiro tipo de
aplicação da Blip, fora do escopo).

# Portal da Blip — o contrato, tirado da rede

Fonte: `supernova.blip.ai.har` (HAR do Chrome, 92 MB, 304 requisições) mais o DOM
renderizado de `supernova.blip.ai/application`, ambos capturados em 13/09/2026 na
conta `supernova` (11 bots, plano `enterprise`).

O HAR é o material que faltava: a SPA deles não busca nada por HTTP: monta a tela
por **LIME sobre WebSocket** (`wss://supernova.ws.blip.ai/`), e o HAR do Chrome
guarda os quadros do WebSocket em `entries[].._webSocketMessages`. São 523 quadros
nas duas sessões capturadas. Os zips de "salvar página" não pegavam nada disso —
por isso as tentativas anteriores só trouxeram a casca.

## Os endereços que o portal chama

Todos como `get`/`set` para `postmaster@portal.blip.ai` (ou `postmaster@msging.net`
nos de conta).

| URI | O que devolve |
| --- | --- |
| `/account` | a PESSOA: `fullName`, `email`, `phoneNumber`, `culture`, e um saco de `extras` |
| `/tenants-mine` | as contas do e-mail |
| `/tenant-users-mine` | as mesmas contas, cada uma com o **papel** da pessoa nela |
| `/tenants/{id}` | uma conta |
| `/tenants/{id}/subscription` | a assinatura da conta (traz o `planId`) |
| `/plans?$filter=Id eq '{planId}'` | o plano, de onde sai o nome (`enterprise`, `standard`) |
| `/tenants/{id}/cluster` | o cluster da conta |
| `/contract-status/validate/{id}` | `{ tenantId, hasValidPlan }` |
| `/applications?tenantId={id}` | **os cartões da grade** |
| `/agent-plan/{id}/active` | o plano de agente de IA |
| `/active-subscription` | a assinatura da PESSOA (não da conta) |
| `/threads/notifications@msging.net?direction=desc&$take=5` | o sino |

O nome do plano custa DUAS idas: `subscription` para achar o `planId`, `plans` para
traduzir. É por isso que o seletor de contas pede `/tenants/{outra}/subscription`
para cada conta da lista — no HAR aparecem as de `anderson-linhares-oxo7k` e
`supernova2`.

## `/applications` — o cartão da grade

`itemType: application/vnd.iris.portal.application-account+json`, e cada item tem
exatamente estes campos:

```json
{
  "shortName": "supernovaprincipal",
  "name": "AUVP Capital",
  "imageUri": "https://blipmediastore.../Media_a2be0822-...",
  "template": "builder",
  "tenantId": "supernova",
  "created": "2024-10-08T17:30:17.140Z",
  "updated": "2024-10-08T17:30:17.140Z",
  "hasPermission": true,
  "emailOwner": "ism.onboarding@blip.ai"
}
```

- `template` é o que a etiqueta do cartão diz: `builder` → **Fluxo**,
  `master` → **Roteador**. Não há terceiro valor nesta conta.
- `imageUri` ausente → o avatar vira o ícone `blip-chat`
  (`ng-if="!$ctrl.contact.imageUri"`).
- A resposta vem na ordem de criação (mais antigo primeiro), e a tela desenha ao
  CONTRÁRIO: o primeiro cartão da grade é o último criado.
- `shortName` é o que vai na URL do bot: `/application/detail/{shortName}/home`.

## `/tenants-mine` e `/tenant-users-mine`

A conta traz `id`, `name`, `photoUri`, `ownerIdentity`, `paymentAccount`,
`creationDate`, `clusterName`, `isTestContract`, `creationSource`,
`blipSubsidiary`, `canViewMobileDesk`, `watermark` — e, nas contratadas,
`HubspotCompanyId` e `DealId`.

`/tenant-users-mine` é a mesma lista com `roleId` por conta. Na captura:
`admin` na conta pessoal, `guest` em `supernova`, `member` em `supernova2`. O papel
é **por conta**, não por pessoa.

A conta pessoal (`anderson-linhares-oxo7k`, criada pelo autosserviço) se distingue
das contratadas por **não ter** `clusterName`, `HubspotCompanyId`, `DealId` nem
`blipSubsidiary`, e por ter `ownerIdentity` igual ao próprio e-mail. O plano dela é
`standard`; o das contratadas, `enterprise`.

## O que o DOM acrescenta

- **A fileira de cartões de ação aparece com os 11 bots.** A condição é
  `ng-if="!isCarouselBannerEnabled || !canCreateChatBot"` — não olha a quantidade.
  Os quatro: "Novidades na Blip", "Acompanhe seu contrato"
  (`ng-if="tenant.id"`), "Aprenda a usar o Blip", "Converse com a Comunidade".
- **O banner de boas-vindas** é `!applications.length && tenant.id && canCreateChatBot`.
- A seção da lista é `<div id="applications" ng-if="applications.length > 0">`, com
  o título em `bds-typo variant="fs-24" bold` — "Fluxos e roteadores em Supernova".
- A barra clara diz **"Espaço de trabalho de {conta}"** (`navbar.subheader.workspaceOf`),
  em `fs-20` negrito, `tag="h2"`. A busca ao lado tem `debounce: 700`.
- Os itens do topo são só **"Home"** e **"Blip Store"**. Nada de Atendimento ou Canais
  — esses são de dentro de um bot.
- O menu do contrato abre com **"Painel do contrato"** (nome da conta em vigor em
  `fs-10` embaixo) e só então a `tenant-list` — que traz as OUTRAS contas, nunca a
  em vigor. Cada item: ícone `business` (ou `message-ballon` no pseudo-item
  "Chatbots compartilhados comigo"), nome em `fs-16`, e em `fs-12` o plano
  (contrato) ou o host (`beagleaz.blip.ai`).
- O menu do avatar: avatar, NOME e e-mail, e "Minha conta" / "Minhas preferências" /
  "Sair" (ver a seção da barra do topo, mais abaixo). O plano não está lá.
- A paginação aparece **mesmo com uma página só**: `items-page="[40,80,120]"`,
  "Itens por página:", "1-11 de 11", "de 1 páginas".
- "Mover chatbots" não está na tela porque a flag `can-migrate-bots` é `false`.

## Onde isso já entrou

`apps/gestao/src/app/portal/page.tsx` e `src/lib/portal.ts` — cada regra acima está
comentada no ponto em que é aplicada. O que NÃO copiamos e por quê também está lá.

## A barra do topo, item por item

Conferido duas vezes: no DOM de `supernova.blip.ai` (contrato, 11 bots) e no de
`anderson-da-silva-linhares-g813s.blip.ai` (conta pessoal do autosserviço, zero
bots). O segundo é a única captura que temos do estado VAZIO.

Da esquerda para a direita:

1. **O seletor de contrato** — ícone `business` (ou a foto do contrato quando há
   `photoUri`), o nome em `fs-16` **negrito** branco, o plano em `fs-12` logo
   abaixo, e a seta `arrow-down`. O menu abre com "Painel do contrato" (ícone
   `settings-builder`, nome do contrato em `fs-10` embaixo) e só então a
   `tenant-list`.
2. **A divisória vertical** (`divisor-vertical-contract`).
3. **`nav-items`: "Home" e "Blip Store". SÓ.** Nenhum atalho para o Desk. Na
   rota do portal, "Home" leva `main-navbar__active-link`; dentro de um bot,
   nenhum dos dois fica ativo.
4. **A marca**, centrada (`brand-logo`, 10% da largura).
5. **`main-navbar__account-actions`**: o botão "?" (ícone `question`), o **sino**
   (`notificationsCenter`, ícone `bell`, painel com "Você não tem nenhuma
   notificação"), e a divisória.
6. **O avatar**, com seta `arrow-down` ao lado.

O menu do "?" é uma lista de quatro destinos com ícone: Blip Help (`faq`),
Blip Academy (`guide`), Blip Community (`team`), Blip Support (`agent`).

O menu do avatar é um `bds-menu-exibition` — avatar à esquerda, nome em `fs-16`,
e-mail em `fs-10` — seguido de três `bds-menu-action` separados por
`bds-menu-separation`: "Minha conta" (`user-default`), "Minhas preferências"
(`settings-adjusments`) e "Sair" (`logout`).

## A barra clara tem os botões de criar

A `action-icons` da direita traz, nesta ordem: a busca (debounce 700ms) e,
quando `canCreateChatbot`, **"Criar roteador"** (`bds-button variant="tertiary"`,
ícone `builder-router`) e **"Criar fluxo"** (`variant="primary"`, ícone
`builder-new-state"`). Estão lá na conta VAZIA também — criar não é privilégio
do banner de boas-vindas.

## O estado vazio da conta pessoal

Nessa conta o `isCarouselBannerEnabled && canCreateChatBot` é verdadeiro, e a
tela mostra o `carousel-container`: um banner de carrossel e, abaixo, os quatro
cartões em DUAS LINHAS de dois (`simple-action-card`) — "Novidades na Blip"
(com chip "Novo"), "Acompanhe seu contrato", "Aprenda a usar o Blip",
"Converse com a Comunidade". Não há banner de boas-vindas nem grade.

Ou seja: os quatro cartões aparecem nos DOIS estados; o que muda é o arranjo
(fileira única com `action-card` × duas linhas com `simple-action-card`).

## O rodapé

`© 2026 Blip - Powered by Blip | Todos os direitos reservados | Termos de Uso`,
e à direita o `blip-status`: "Conexão" e "Serviços Blip", cada um com um badge
verde de `check`.

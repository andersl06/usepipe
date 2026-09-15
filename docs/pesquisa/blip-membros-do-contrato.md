# Membros do contrato — a tela `/panel`, tirada do bundle

Fonte: o micro-frontend `{conta}.tenant.fragment.blip.ai` capturado em
13/09/2026 — `static/js/main.e8593b01.chunk.js` (1,6 MB) e
`static/css/main.7b59c603.chunk.css` (335 kB) —, mais o shell do portal
(`supernova.blip.ai/portal.js`) e os quadros LIME do WebSocket
(`wss://supernova.ws.blip.ai/`).

**O HAR pequeno de `anderson-da-silva-linhares-g813s` não serve para isto**: ele
tem 50 requisições, nenhuma com `_webSocketMessages`, e a rota `/panel` aparece
com `content.size = 0` porque a SPA só troca de estado. O contrato de dados sai
do bundle; os payloads, dos quadros da captura anterior.

Esta é a tela do cartão **Membros** do painel (`docs/pesquisa/blip-painel-do-contrato.md`).
Ela não usa o design system novo (`bds-*`) do painel: é o **blip-toolkit antigo**,
classes `bp-card`, `bp-table`, `bp-btn`, mais os componentes próprios
`BlipSearch`, `BlipDropdownButton` e `BlipSelect`.

## Os endereços LIME

Todos para `postmaster@portal.blip.ai`, menos o enriquecimento de conta.

| método   | uri                                                           | type                                             | resource                                   | para quê                                                             |
| -------- | ------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------- |
| `get`    | `/tenants/{id}/users?$skip={100*(p-1)}&$take=100`             | —                                                | —                                          | a lista, paginada de 100 em 100                                      |
| `get`    | `/tenants/{id}/users/{userIdentity}`                          | —                                                | —                                          | um membro (é como o fragmento descobre o PRÓPRIO papel)              |
| `get`    | `lime://blip.ai/accounts/{local}` (para `postmaster@blip.ai`) | —                                                | —                                          | o nome e o e-mail de verdade de cada linha                           |
| `set`    | `/tenants/{id}/users/{userIdentity}/role`                     | `application/vnd.iris.portal.role+json`          | `{ "id": "admin" \| "member" \| "guest" }` | trocar o papel                                                       |
| `delete` | `/tenants/{id}/users/{userIdentity}`                          | —                                                | —                                          | excluir do contrato                                                  |
| `set`    | `/tenants/{id}/users/{userIdentity}/user-status`              | `application/vnd.iris.portal.tenant-user-status` | `"accepted"` \| `"rejected"`               | aprovar ou recusar quem PEDIU para entrar                            |
| `set`    | `/tenants/{id}/users`                                         | `application/vnd.lime.collection+json`           | ver "Convidar"                             | convidar em lote                                                     |
| `get`    | `/tenants/{id}/unique-admin-applications/{userIdentity}`      | —                                                | —                                          | os bots em que a pessoa é a única admin (trava do "Deixar contrato") |

`{userIdentity}` vai sempre `encodeURIComponent`ado, e a identidade já vem
codificada do servidor — daí o `%2540` (o `%40` de um `@` já escapado) que
aparece nas URIs do HAR.

### O payload de um membro

`type: application/vnd.iris.portal.tenant-user-information+json`. Campo a campo,
de um quadro real:

```json
{
  "tenantId": "supernova",
  "userIdentity": "anderson.linhares%40auvp.com.br@blip.ai",
  "fullName": "Anderson Linhares",
  "creationDate": "2026-02-25T20:39:11.970Z",
  "updateDate": "2026-02-25T20:39:11.970Z",
  "userStatus": "Accepted",
  "roleId": "guest"
}
```

**Não há `email` nem `photoUri`.** É por isso que a tela faz uma segunda chamada
por linha (`lime://blip.ai/accounts/{local}`) e funde a resposta. Quando essa
chamada falha, o apanhado é:

```js
fullName: e.fullName ? e.fullName : decodeURIComponent(e.userIdentity.split("@")[0]),
email:    decodeURIComponent(e.userIdentity.split("@")[0])
```

A paginação é um laço `do…while (acumulado.length % 100 === 0)` — e ele para
sem erro quando a próxima página devolve o código de razão guardado em `l.a`.

### `userStatus`, os três estados

| valor           | onde aparece                                               | o que é                              |
| --------------- | ---------------------------------------------------------- | ------------------------------------ |
| `Accepted`      | aba **Membros**                                            | entrou                               |
| `PendingUser`   | aba **Membros**, com `" (Pendente)"` grudado no `fullName` | foi convidado e ainda não entrou     |
| `PendingTenant` | aba **Pendentes**                                          | PEDIU para entrar e espera aprovação |

A aba Membros filtra `(Accepted || PendingUser) && userIdentity !== eu`:
**você nunca aparece na sua própria lista.**

### Convidar (o modal mora no SHELL, não no fragmento)

O fragmento só pede o modal por `IframeMessageProxy` (`showModal("InviteModal")`)
e recarrega a lista se a resposta for `true`. Quem grava é o portal:

```js
inviteMany(emails, tenantId, roleId) {
  const items = emails.map(email => ({
    tenantId,
    userIdentity: `${encodeURIComponent(email)}@blip.ai`,
    roleId
  }));
  return sendCommand({
    method: "set", to: "postmaster@portal.blip.ai",
    uri: `/tenants/${tenantId}/users`,
    type: "application/vnd.lime.collection+json",
    resource: { items, itemType: "application/vnd.iris.portal.tenant-user+json", total: items.length }
  });
}
```

O modal aceita e-mails em chips ou um **CSV** (`.csv`, um e-mail por linha,
linhas `sep=` descartadas, teto em `maximumContact`), tem um `bds-select` com os
três papéis e trava o botão enquanto houver e-mail inválido, papel não escolhido
ou alguém que já é membro na lista.

## Os textos, em pt-BR

Da tabela (dicionário `Wt.pt` do bundle):

| chave                  | pt-BR                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| `name`                 | Nome                                                                       |
| `email`                | Email                                                                      |
| `role`                 | Papel                                                                      |
| `invite`               | Convidar                                                                   |
| `edit`                 | Editar                                                                     |
| `members`              | membro(s)                                                                  |
| `cancel`               | Cancelar                                                                   |
| `apply`                | Aplicar                                                                    |
| `chooseRole`           | Escolha o papel                                                            |
| `delete`               | Excluir                                                                    |
| `deleteMessage`        | Tem certeza que deseja excluir esse(s) membro(s)?                          |
| `deleteMembersSuccess` | Membro(s) excluído(s)                                                      |
| `deleteMembersError`   | Falha ao excluir membro(s)                                                 |
| `setRoleSuccess`       | Membro(s) atualizado(s) com sucesso                                        |
| `setRoleError`         | Falha ao atualizar membro(s)                                               |
| `loadMembersError`     | Falha ao carregar membros                                                  |
| `pendingInvitation`    | Pendente                                                                   |
| `admin`                | Admin                                                                      |
| `member`               | **Pode editar**                                                            |
| `guest`                | **Pode visualizar**                                                        |
| `adminDescription`     | Edita todos os dados do contrato, gerencia membros, cria e edita chatbots. |
| `memberDescription`    | Cria e edita chatbots, mas não gerencia os membros do contrato.            |
| `guestDescription`     | Apenas visualiza informações do contrato.                                  |

Do cabeçalho da tela (`ca.pt`): título "Painel do Contrato", abas **"Membros do
contrato"** (é o texto do cabeçalho, montado como `"{members} {tenant.name}"`) e
**"Pendentes"**.

Da aba de pendentes (`aa.pt`): Aceitar / Excluir, vazio **"Não há solicitações
pendentes"**, e o alerta de recusa — título "Quer mesmo rejeitar o pedido?",
corpo "Você perderá acesso a este e-mail e não poderá resgatá-lo no futuro, caso
mude de ideia. Essa ação não pode ser desfeita, ok?", botões "Voltar" e
"Rejeitar".

Do modal de convite (`application/tenant/inviteMemberModal/i18n/pt.json`):

| chave                    | pt-BR                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `title`                  | Convidar pessoas                                                                                 |
| `subtitle`               | Convide membros do seu time para trabalhar em projetos relacionados a este contrato:             |
| `typeOfPermission`       | Permissão                                                                                        |
| `select`                 | Selecione                                                                                        |
| `or`                     | ou                                                                                               |
| `importMany`             | Importar vários                                                                                  |
| `csvExample`             | Veja a formatacão da tabela aqui. _(o erro de acentuação é deles)_                               |
| `notNow`                 | Cancelar                                                                                         |
| `invite`                 | Convidar                                                                                         |
| `holdOn`                 | Enviando convites...                                                                             |
| `invitationsSuccess`     | Convites enviados com sucesso.                                                                   |
| `invitationsOkButton`    | OK :)                                                                                            |
| `invalidEmail`           | Formato de endereço e-mail inválido                                                              |
| `repeatedInviteWarning`  | Existem pessoas que já fazem parte desse contrato. Para editar o permissionamento desses membros |
| `clickHere`              | clique aqui                                                                                      |
| `maximumQuantityContact` | Quantidade de e-mail maior que o permitido! Limite de e-mails                                    |

Ícone por papel no modal: `guest` → `eye-open`, `member` → `edit`,
`admin` → `avatar-user`.

## A tela, peça por peça

```
da            margin: 10px auto; width: 93%
 └ _t         padding: 2rem 0; animation: fadeIn ease-in .5s (1x)
    └ div.bp-card.bp-card--left-arrow
        └ #tab-nav
            ├ ul.bp-tab-nav        "Membros" | "Pendentes" (+ badge com a contagem)
            └ div.bp-tab-content   a tabela
```

`.bp-card`: `padding: 2.5rem 3.75rem`, `margin-top: .9375rem`, fundo branco,
`box-shadow: 0 4px 29px 6px rgba(181,205,211,.29)`, `position: relative`. O
`--left-arrow` é um bico: `:after` de `border-width: .46875rem`, `left: 2.5rem`,
`margin-left: -.46875rem`, `top: 0`, `transform: rotate(-45deg)` com
`transform-origin: 0 0`.

Abas: `li { padding: 10px 20px; margin: 0 5px }`, `a { font-size: 15px;
font-weight: 600 }`, ativa com `border-bottom: 4px solid #3f7de8`.
`.bp-tab-content { padding: 45px 10px 10px }`.

### A tabela (`bp-table bp-table--scroll-y`)

| medida             | valor                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| `thead`            | `display: block`, `border-bottom: .125rem solid #dee8ec`                      |
| `thead tr`         | `width: calc(100% - 1.0625rem)`, centrada (desconta a barra de rolagem)       |
| `thead th`         | `height: 3.75rem`, `padding: 1.25rem .625rem`, `.875rem/160%`, peso 600       |
| `tbody`            | `display: block`, `overflow-y: auto`, `max-height` = `bodyHeight` = **400px** |
| `tbody td`         | `height: 2.9375rem`, `padding: .625rem`, `.875rem/160%`, peso 400             |
| primeira célula    | `padding-left: 1.5625rem` · última: `padding-right: 1.5625rem`                |
| toda célula        | `white-space: nowrap; text-overflow: ellipsis; padding-right: 30px`           |
| linha ímpar / par  | `#fff` / `#f5f8f9`                                                            |
| barra de rolagem   | `.375rem`, polegar `#b9cbd3`, raio 1000px                                     |
| coluna da marcação | `w4` = **8rem** · coluna das ações: `w5` = **16rem**, `overflow: inherit`     |

Colunas (`tableModel`): `fullName` → Nome, `email` → Email, `roleId` → Papel.
O valor da coluna Papel é trocado antes de desenhar
(`{...membro, roleId: content[membro.roleId]}`), então a célula mostra "Admin",
"Pode editar" ou "Pode visualizar", não o `roleId` cru.

Ordenação: clicar no rótulo alterna `asc`/`desc` com `<` e `>` crus sobre o
campo. A seta é `arrow-up`/`arrow-down`; nas colunas que não estão ordenando ela
existe com `opacity: 0` e aparece com `opacity: .7` ao passar o cursor.

Busca (`BlipSearch`): a lupa é um botão; o `input` nasce com `width: 0` e vai a
`200px` (`transition: width .5s`), com `border-bottom: 1px solid #94a3ab` e
`2px solid #b3d4ff` no foco. Filtro **local**, `debounce 500`:
`fullName.toLowerCase().includes(q) || email.includes(q)`.

### A seleção e os dois menus

A última coluna do cabeçalho traz `N {content.selected}` e, ao lado, os dois
gatilhos. Ela some (`class="hidden"`) enquanto não houver nada marcado.

> **A chave `selected` mora no dicionário da tabela genérica** (`j.pt`:
> "selecionado(s)", com "Não há dados" de vazio), e não no `Wt.pt` da tela.

Cada gatilho é um `BlipDropdownButton` (`bp-btn--text-only bp-fs-4`) que abre um
`bp-card bp-card--right-arrow` de `w6` = **24rem**, `right: -1.5rem`,
`padding: 15px`, com uma capa (`div.overlay.z-1`) que fecha ao clique. Dentro:
corpo em `pa3`, uma `.bp-divider-h` de 1px `#c9dfe4`, e o rodapé em
`pa2 flex flex-row-reverse` — **por isso o "Cancelar" aparece à esquerda do
"Aplicar" mesmo sendo escrito depois**.

- **Editar** (ícone `edit`): "Editar _N_ membro(s)", um `BlipSelect` com rótulo
  "Papel" e vazio "Escolha o papel", as três opções, e abaixo a descrição do
  papel escolhido. Rodapé: "Aplicar" (`bp-btn--bot`, **desabilitado até haver
  papel escolhido**) e "Cancelar" (`bp-btn--silver`).
- **Excluir** (ícone `trash`): "Excluir _N_ membro(s)" e, em `bp-fs-7`,
  "Tem certeza que deseja excluir esse(s) membro(s)?". Rodapé: "Excluir"
  (`bp-btn--delete`, `#ff4c4c`) e "Cancelar".

Ambos rodam um `Promise.all` sobre os marcados, mostram um toast e recarregam a
lista inteira (`getAllTenantMembers`) no `finally`.

Abaixo da tabela, à direita: **Convidar**, `bp-btn bp-btn--blip-dark
bp-btn--small mt20` (`min-width: 120px`, `margin-top: 20px`, fundo `#0747a6`),
só quando `canEdit`.

`.bp-btn`: `min-width: 10rem`, `height: 2.625rem`, `line-height: 2.375rem`,
`padding: 0 1.25rem`, `border-radius: 3px`, `.875rem` peso 600.
`.bp-btn--text-only`: `min-width: 0`, `height: auto`, `line-height: 1.125rem`,
`padding: .5rem .625rem`, fundo transparente.

## As regras por papel

Uma conferência só, a matriz de `docs/pesquisa/blip-painel-do-contrato.md`:

| o quê                                                  | conferência                 |
| ------------------------------------------------------ | --------------------------- |
| abrir a tela e as duas abas                            | `read` em `tenant-members`  |
| marcar linhas (`canSelect`) e, com isso, os dois menus | `write` em `tenant-members` |
| o botão "Convidar"                                     | `write` em `tenant-members` |

Ou seja: `member` e `guest` **não abrem esta tela** — `tenant-members` só tem
read para `admin`. Na prática, quem chega aqui já pode escrever.

**Não há trava de "último admin" no contrato.** Nada no bundle impede excluir o
último `admin` de um tenant, e `ownerIdentity` não é escrito em lugar nenhum
(`blip-gestao-regras-tecnicas.md` §8.7). A única trava desse feitio é a do BOT
(`/applications/{bot}/islastadmin`), e ela vale para a tela de Equipe.

## O que foi feito no Pipe, e o que não

`apps/gestao/src/app/contrato/membros/` — a casca, a tabela de seleção, os dois
menus, a busca, a ordenação, o "(Pendente)" e a regra de não se ver na própria
lista. As medidas acima estão comentadas em `contrato.css`, ponto a ponto.

Ficaram de fora, e por quê:

- **O conteúdo da aba "Pendentes".** Ela é dos `PendingTenant` — gente que PEDE
  para entrar no contrato. O Pipe não tem esse caminho: a única porta é o
  convite, e quem foi convidado e não veio aparece em Membros com "(Pendente)",
  como o `PendingUser` deles. A aba existe (a tela é cópia), mas abre sempre em
  "Não há solicitações pendentes".
- **O botão "Convidar".** O convite existe e funciona (`POST /v1/convites` +
  `/convite/[token]`); o que não existe é entrega — nada no repositório manda
  e-mail, e mostrar um token de uso único na tela seria vazá-lo no histórico do
  navegador.
- **O `check-ball` do "Aceitar"** da aba de pendentes: sem ninguém na fila, o
  gatilho nunca aparece. Os `edit` e `trash` dos dois gatilhos da seleção já
  estão em `componentes/icones-portal.tsx` (`editar`, `lixeira`).

# Contatos — lista e detalhe

## Rastro na referência

- Lista: estado `auth.application.detail.users`, template `users-content-view`
  (`portal.js`, módulo `2753`). Detalhe: estado `auth.application.detail.users.user`
  (`/users/:id?ticketId`), template `details-container` (`portal.js`, offset
  ~15463641). CSS em `portal.css`: `#users-content-view`, `.static-sidebar`,
  `.card--mini-card`, `.details-container`, `#user-detail-sidebar`, `expandable-item`.
- Traduções pt-BR (`vendor-app_modules_translate_...js`): `modules.application.detail.users.*`
  (`title` "Contatos", `titleSingular` "Contato", `approximateCount` "Aproximadamente",
  `filtersTitle` "Filtros", `notFound` "Nenhum contato encontrado", `lastInteraction`
  "Última interação:", `channel` "Canal", `editContact` "Editar contato", `contactId`
  "ID do contato"), `modules.analytics.userDimension.addFilters` "Adicionar filtros",
  `modules.application.detail.attendance.history.*` (`information` "Informações",
  `conversationHistory` "Histórico de Conversa", `agent` "Atendente", `agentEmail`
  "Email do atendente", `team` "Fila", `avgResponseTicketTime.title` "Tempo médio de
  resposta", `showTicketHistory` "Ver conversa", `testeUser` "Usuário de teste",
  `noMessages` "Ainda não há histórico de conversa ):", `noTickets.title` cita a marca —
  no Pipe virou "Não há tickets abertos para este usuário").
- Formatos: última interação = `toLocaleString(idioma, {ano, mês 2 dígitos, dia, hora,
  minuto})`; `ticket.$day` = moment `L`, `ticket.$hour` = moment `LT`; carimbo do balão
  "DD/MM/AAAA - HH:mm"; período do seletor "09 set, 2026 - 00:00 ~ 16 set, 2026 - 23:59".

## Medidas conferidas na cópia (janela 1280×780, conteúdo a partir de y=136)

Lista: lateral absoluta de 25% (320px), cabeçalho escuro 320×122 com `padding 20px 30px`,
"Filtros" fs-20 e botão "Aplicar" 260×40 (largura toda, desabilitado); corpo `40px 0 40px 15px`
com o tracejado "+ Adicionar filtros" 239×60 (90%, `margin 0 0 20px 10px`, borda 2px, raio 3px,
14px/600). À direita `page-header` com `.container` de 90% (margem 5%), `.full-initial-section`
15px de margem e padding, linha inferior, conteúdo de 42px, h1 24px; recarregar dentro de um
`bds-tooltip` de 130×40 (ícone centrado, sem borda). `#contacts-filter`: contagem `w-20 ml3`
fantasma 14px; seletor 384×38 (borda 1px, raio 8px, ícone 25×25 raio 5px, caixas 160×36).
Cartão 864×112: `padding 20px 50px 20px 60px`, `margin-bottom 10px`, raio 8px, superfície 1;
seções 10% (avatar 56px) / 50% `ph5` (nome fs-14, "Última interação:" fs-12 fantasma) /
divisor 1×40 `margin 0 15px` / 20% `pl3` ("Canal" fantasma + valor) / 10% (Teste) / 5% `pl5`
(ícone "abrir em nova aba" num tooltip de 130px, só no hover — fica fora do cartão, como lá).
Vazio: `.no-users-found` 30vh centrado.

Detalhe: `.content` = `calc(100% - 445px)`; `.history-header` `padding 20px 31px 20px 96px`
(113px): seta 32px, avatar 56px `mr 20px`, nome fs-24 (altura 24), recarregar 130×40,
`.separator` `margin 16px 8px 0` com linha fantasma. `.tickets-list-view` `padding 0 31px 0 96px`,
altura 30/35/50/57vh conforme a janela (≤550/≤700/≤800/≥801); cartões `w-40`/`w-60` com
`margin 9px 24px 9px 0` (os 40/60 são do que sobra depois das margens → 264/396 em 708),
superfície 1, raio 8px. Informações: `padding 0 20px` + `.card-content 15px`; cabeçalho de 40px
("Informações" fs-16 negrito + lápis num tooltip de 130px); linhas `mt4` (20px; a primeira 40px)
rótulo `w-30 fw5` / valor `pl3 w-70`; Nome/E-mail/Telefone em `bp-fs-6` (14px) e Cidade/
Documento/Gênero/ID em `f4` (12.5px); "Extras" `mt5` (40px). Tickets: `padding 15px 20px`,
"Tickets" fs-16 negrito `margin 0 15px` (bds-typo em linha), `expandable-item` com superfície 3
nas ímpares e 1 nas pares, `.item-header` `10px 15px` (52px), seta 10%, `item-header pl4`, dia/
hora/#id em `w-70`, ações 32px com 8px entre; `.item-body` superfície 3, `li` `6px 0`, rótulo
`pl6 ml3 w-40 fw5`, valor `pl5 w-50`. `#user-detail-sidebar`: fixo à direita 445px, superfície 2,
`.thread-header` 61px escuro fs-16/500 `padding-left 20px`; `.messages` `8px 50px 0`; balão
`10px 16px`, 16px/20px, borda 1px fantasma, `max-width 90%`, raio `13px 2px 13px 13px` à direita
(contato, fundo escuro) e `13px 13px 13px 2px` à esquerda (bot/atendente, foto 25px absoluta a
37px do topo, container `margin 0 -50px 10px 35px`); carimbo 10px/14px.

## Pipe

- `apps/gestao/src/app/fluxo/[id]/contatos/page.tsx`, `[contatoId]/page.tsx`, `[contatoId]/editar.tsx`,
  `contatos.css`, `regras.ts` (regras puras, testadas em `tests/contatos.test.ts`).
- Dados reais de `apps/gestao/src/lib/contatos-do-fluxo.ts` (`contato`, `conversa`, `mensagem`).
  A lista só enche quando o `fluxo` tem `canal_id`; conversa não tem número sequencial
  (`#` mostra os 8 primeiros caracteres do id). Filtros, período, edição, "Usuário de teste",
  exportar ticket e copiar ID ficam visuais (`ponytail:`).
- `apps/crm` já tinha ficha de pessoa; não foi reutilizada porque a disposição da origem é outra.

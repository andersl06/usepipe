# Conteúdos — Modelos de mensagem

## Onde está cada coisa na origem

- Casca: estado `auth.application.detail.contents` — a `<aside class="detail-aside
  fl">` de 397px com `<bds-grid class="sidebar-container" direction="column">`
  (`margin-top: 24px`) e um `sidebar-item-container` (`margin: 0 24px`) >
  `a.sidebar-anchor` > `bds-grid.sidebar-item` (`padding: 24px 16px`) por
  entrada: `sidebar-item-text` (título `bds-typo fs-14 bold`, subtítulo
  `fs-12`) + `sidebar-item-icon` (`bds-icon arrow-right`, `margin-left: 16px`).
  O ativo leva `.selected-sidebar-item { background: rgba(41,41,41,.05);
  border-radius: 10px }` (o `:hover` é igual). Textos de
  `modules.application.detail.contents.menu.messagetemplate/resource`.
- `/contents/messagetemplate` (estado `.contents.messageTemplate`, controlador
  `MessageTemplateController` = `vD`): `page-header#whatsapp-message-templates-
  header` com `custom-title` (`bds-typo bold fs-24 .mr3` "messageTemplate.title"
  + `bds-tooltip` com `bds-icon info size=small`) e `custom-content` só com
  `isWhatsAppActive()` (`ChannelsService.isChannelActive(WhatsApp)`): o
  `dropdown-item` de busca (só com modelos ou filtro) e `<bds-grid direction=
  "row" gap="2">` com `bds-button outline color=content icon=refresh`
  "Atualizar" e `bds-button primary` "Criar modelo" → `openNewMessageSidebar()`.
  `#message-template__main-content-area.container`: sem WhatsApp o
  `<unavailable-warning>` (módulo 28850: `section` + `img` 110 + `bds-typo
  fs-20 bold` título + descrição `fs-16` + `<a>` `color-primary bold`
  linkDescription); com WhatsApp `bds-paper.message-template__paper-container`
  (`padding: 2rem`) com filtro de status, chips e um `<message-template-item>`
  por modelo (`.w-40` nome, `.w-15` categoria, recategorizado, idioma, status
  em `.br-pill.ph3.pv1.status-chip` colorido por `statusColorMap`; `.w-15`
  score só com `messageTemplateScoreEnabled`; divisor `.message-template-item-
  divider.mb3.mt3`), `view-more-bar` "Visualizar mais modelos"; sem modelos os
  `.no-content-found-mini-1/2` (`noContentFound.title/subTitle`).
- Sidebar (`openNewMessageSidebar`, template do módulo 95559, controlador
  `CreateMessageTemplateSidebarController` = `dD`): `.sidebar-overlay` +
  `#create-message-template-sidebar` (37.5rem, `.sidebar-header` 61px +
  `.sidebar-body`). Corpo: `bds-typo p fs-14` descrição (com link "regras e
  boas práticas"), `blip-input-dpr` nome (+ erros `invalidMessageTemplateName`
  / `usedMessageTemplateName` / `invalidMessageTemplateNameLength`),
  `blip-select` categoria (AUTHENTICATION/MARKETING/UTILITY com
  `isNewestMessageTemplateCategoriesEnabled`), bloco `meta-pricing` (só
  `isMetaBiddingAlphaEnabled && MARKETING`), e um bloco por
  `translation`: `.inline` (`blip-select` idioma + `bds-icon trash` se >1),
  aviso `usedMessageTemplateLanguage`, `.back-button` (`ng-if type !== default
  && $index === 0 && !thereTranslations() && !isAuthenticationType()`),
  `bds-paper.menu-list` (`ng-if type === default && !isAuthenticationType() &&
  !isEmptyCategory()`: linha 1 text · image/document (`isMediaMessageTemplate
  Enabled`), linha 2 video (`media && isMessageTemplateVideoEnabled`) · payment
  (`isMessageTemplatePaymentEnabled && isUtilityType()`) · carousel
  (`isMessageTemplateCarouselEnabled`)), depois o cartão do tipo
  (`message-template-card` para texto/autenticação, `message-template-
  attachment-card` para image/document/video, `-payment-card`, `-carousel-card`),
  `bds-button text icon-left=sparkle-ai` "Avaliar mensagem com IA" (só
  `pt_BR`), `bds-divider` entre traduções, `.add-translation-button`
  "Adicionar tradução" (habilita com `areTranslationsValid()`), e o rodapé
  `bds-button color=content size=large full-width` "Enviar para avaliação"
  (`.footer-enabled` com `isMessageTemplateValid()`).
- Regras do controlador: nome `/^[a-z]([a-z0-9_])*$/`, ≤ 512, único; idioma
  padrão = `AccountService2.me().culture` (pt_BR); `areTranslationsValid` por
  tipo (texto/pagamento: idioma + texto; imagem/documento/vídeo: + link;
  carrossel: bodyText + ≥ 2 cards; autenticação: só idioma);
  `isMessageTemplateValid` = nome ok && categoria && traduções && idiomas sem
  repetição && `isMetaBidValid`.
- `message-template-card` (módulo 5084): `.mt-card` com placeholder
  `messageTemplateCard.placeholder`; edição com `textarea` (3 linhas, 1024),
  barra negrito/itálico/tachado + "+ variável", `message-template-buttons`
  (`.menu-buttons-list` "Botões de ação" | "Respostas rápidas"; respostas:
  inputs "Texto do botão" ≤ 20 e "Adicionar outro botão"; ação: `blip-select`
  Link do website / Número de telefone / Solicitar informação de contato).
  `attachment-card` (módulo 105523): link do anexo (`attachment.<tipo>.link`
  + compatibility), texto, formatação, rodapé (`attachment.footer`, 60).

## Textos pt-BR

`messageTemplate`: title "Modelos de Mensagem"; addNewButton "Criar modelo";
refreshButton "Atualizar"; toolTip "São formatos para mensagens reutilizáveis
que poderão ser enviadas em massa"; unavailable.title "Recurso exclusivo para
WhatsApp", subtitle "A funcionalidade de criação de modelos de mensagem é
exclusiva para chatbots integrados ao WhatsApp.", linkDescription "Saiba como
contratar"; noContentFound "Você ainda não adicionou modelos de mensagens" /
"Clique no botão **Adicionar novo** para adicionar modelos de mensagens";
status APPROVED "Aprovado", PENDING "Pendente", REJECTED "Rejeitado", PAUSED
"Pausado"; categories AUTHENTICATION "Autenticação", MARKETING "Marketing",
UTILITY "Utilidade". `messageTemplateItem`: "Nome do modelo", "Categoria",
"Recategorizado", "Idioma", "Status", "Score"; `recategorization.isRecategorized`
"Sim"/"Não". `messageTemplateSidebar.newTemplate`: title "Novo modelo de
mensagem"; description "Preencha os campos abaixo para fazer a submissão de um
modelo de mensagem. Lembre-se de seguir as regras e boas práticas propostas
pelo Facebook."; inputs templateName "Nome do modelo" / "Use letras minúsculas,
números ou underline"; category "Categoria" / "Selecione"; language "Idioma" /
"Selecione" / deleteTooltip "Excluir idioma"; menuList default "Escolha um
bloco para adicionar", text "Texto", image "Imagem", document "Documento",
video "Vídeo", payment "Pagamento", carousel "Carrossel"; addTranslation
"Adicionar tradução"; footerText "Enviar para avaliação"; evaluateMessage
"Avaliar mensagem com IA"; errors invalidMessageTemplateName "Use letras
minúsculas, números ou underlines, começando com uma letra",
usedMessageTemplateName "Já existe um modelo de mensagem com este nome",
usedMessageTemplateLanguage "Este idioma está sendo usado em outra tradução",
invalidMessageTemplateNameLength "Máximo de 512 caracteres".
`messageTemplateCard`: placeholder "Insira aqui o conteúdo da mensagem",
variable "variável", authenticationMessage "Seu código de verificação é {{1}}.
Para sua segurança, não o compartilhe.", copyButton "Copiar código".
`attachment`: description "**Clique aqui** para editar o conteúdo do seu
modelo de mensagem", image.link "Link da imagem" / "Compatível com JPG, JPEG
ou PNG", document.link "Link do documento" / "Formato PDF", video.link "Link do
vídeo" / "Compatível com MP4 até 16MB", footer "Rodapé". `buttons`:
callToAction "Botões de ação" (Link do website / Número de telefone /
Solicitar informação de contato), quickReplies "Respostas rápidas",
buttonPlaceholder "Texto do botão", addNewButton "Adicionar outro botão",
errors.invalidLength "Máximo de 20 caracteres".

## Medidas (cópia em 1280×780)

- Lateral 397px; cartões 349×105 em x=24 (`padding: 24px 16px`), título
  14/700 (21px), subtítulo 12 (18px por linha), seta 24 com `margin-left: 16px`.
- Miolo 883px; `.container` 706 (80%). `page-header`: `.full-initial-section
  { margin: 1rem 0; padding: 1rem 0 }` + `border-bottom: 1px solid #cfcfcf`;
  título 24px/700 com `margin-right: 10px`; ícone info 20px.
- `unavailable-warning`: `padding: 30px 0 36px`, imagem 110 `margin-bottom:
  25px`, título 20px/700 `margin-bottom: 22px` (#595959), descrição 16px/1.6
  #94a3ab em 670px. `.no-content-found-mini-1`: 24px, `padding: 80px 0 50px`;
  `-2`: 16px, `padding: 20px 0`; ambos peso 500, 31px, `line-height: 33px`.
- Sidebar: `#create-message-template-sidebar { width: 37.5rem; box-shadow:
  -4px 0 10px rgba(0,0,0,.2) }`; `.sidebar-header { background: #f6f6f6;
  min-height: 61px; padding: 0 1.5rem }`; `.sidebar-body { padding: .9375rem
  1.5rem }`. `.bp-input-wrapper` (blip-input-dpr/blip-select): 2.9375rem,
  `border: 1px solid; border-radius: .5rem; padding: .3125rem .625rem`, label
  12/600 (16px), input 14px (19px) `margin-top: .125rem`; no sidebar label
  fantasma e input #595959. `.menu-list_new { border: 1px solid #e3e3e3;
  border-radius: .5rem; display: flex; justify-content: space-around; margin:
  .625rem }`, item `padding: .625rem 0`, `span` 12px #8ca0b3 `margin-top:
  .3125rem`, `.middle-item` com bordas laterais; ícones text #3f7de8, image
  warning, pdf error, video success, pix #35de90, barcode #fb4bc1, carousel
  #9b51e0. `.mt-card { border-radius: 13px 13px 13px 2px; padding: 10px 16px;
  width: 85%; margin: 19px 0 16px; background: #f6f6f6 }`; `.mt-card__btn`
  28px redondo em `top: -13px` (fechar a 50px, confirmar/editar a 17px);
  `.mt-card__textarea { border: 1px solid #d2dfe6; border-radius: 8px;
  margin-top: 9px; padding: 8px }`; `.mt-card__attachtment { width: 25vw }`.
  `.add-translation-button`: 14/700, 26px, fantasma → `#3f7de8` quando válido.

## Limites da cópia e o que só a Blip real mostra

- O mock não tem canal WhatsApp: `/contents/messagetemplate` abre no
  `unavailable-warning` e nem o botão "Criar modelo" nem o sidebar existem na
  régua. A reprodução do sidebar, da lista e do estado vazio saiu do template
  e do CSS, não de foto. Para ter foto: Blip real →
  `/application/detail/<bot com WhatsApp>/contents/messagetemplate` (lista,
  filtros e "Visualizar mais modelos"), clicar em "Criar modelo" (sidebar),
  escolher categoria Marketing (menu de blocos), clicar em "Texto"
  (`mt-card`), dar dois cliques no cartão (edição, formatação e o bloco de
  botões), escolher "Respostas rápidas" e "Botões de ação"; escolher categoria
  Utilidade (bloco "Pagamento", se a flag estiver ligada) e Autenticação
  (cartão fixo); "Adicionar tradução"; e clicar num modelo da lista (o
  `detailsMessageTemplateSidebar`, que não foi reproduzido).
- Ícones que não existem no sistema do Pipe (são glifos `icon` do
  blip-toolkit, não `bds-icon`): Bold/Italic/Strikethrough da barra de
  formatação, CallToAction/QuickReply do `.menu-buttons-list`, AddCircle do
  "Adicionar outro botão", Edit/Confirm/Close dos botões redondos (usados
  `editar`/`cheque`/`fechar` do bds-icon no lugar).

## Pipe

`apps/gestao/src/app/fluxo/[id]/conteudos/**`: `page.tsx` lê
`carregarCanalDoFluxo` + `carregarModelos` (`lib/comunicacao.ts`, sem mudança)
e `temWhatsapp = canalId !== null`; `tela.tsx` (lateral, cabeçalho, os três
estados da lista, o sidebar com nome/categoria/idiomas/blocos/cartões/botões/
rodapé); `regras.ts` (`blocosDoMenu` por flags — no Pipe mídia e vídeo ligados,
pagamento e carrossel desligados —, `mostrarEscolhaDeBloco`, `mostrarVoltar`,
`erroDoNome`, `traducoesValidas`, `idiomasRepetidos`, `modeloValido`,
`estadoDaLista`; `tests/conteudos-regras.test.ts`). Salvar/avaliar com IA
devolvem o erro controlado (`ponytail:`). Ícones novos via
`docs/capturas/gerar-icones.mjs`: `texto-mensagem`, `arquivo-imagem`,
`arquivo-pdf`, `video`, `pix`, `codigo-barras`, `carrossel`, `brilho-ia`,
`busca`.

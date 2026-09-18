# Configurações — Informações de conexão e Chaves de acesso

## Onde está cada coisa na origem

- Casca: estado `auth.application.detail.configurations` (portal.js, módulo
  57475): `<aside class="detail-aside fl">` + `<section id="main-content-area">`
  lado a lado, na largura toda. A lateral é o template com
  `<bds-grid padding="2"><bds-nav-tree-group collapse="single">` e um
  `<bds-nav-tree icon text secondary-text ui-sref>` por item:
  `settings-general` (configs.basic/basicSubtitle), `robot-2`
  (configs.welcome.title/subtitle), `add-persistent-menu`
  (persistentMenu.title/subtitle), `plugin` (configs.apiKey/apiKeySubtitle →
  `.apikey`, url `/apikey`), `sso` (configs.keys.title/subtitle →
  `.accessToken`, url `/keys`, só com `isTokenManagementEnable`) e `xml`
  (extensions, só com `isMimeTypeManagementEnable` — a régua não mostra).
- `/configurations/apikey`: template do módulo 83981, controlador `iP`.
  `<page-header page-title="templates.api.pageTitle">` com
  `<additional-info><p>templates.api.pageDescription</p>`; depois quatro
  `<bds-paper class="ph5 pv4 mb3">`: usingBuilder (h1 + p + `<switch>`),
  usingSdk (h1 `<span>` + `<small>usingSdkTitleDesc</small>`, p, switch;
  `ng-show="isSdkActive"`: duas colunas `.mr6.w-50` com `input-clipboard` de
  wsEndpoint/tcpEndpoint e identifier; `channels.keyAccess` só com
  `!isTokenManagementEnable && !isHideAccessKeyEnabled`), usingHttp (idem +
  `form#httpForm`: `bds-input` urlReceiveMessages/urlReceiveNotifications em
  `.w-40 | .w-10 | .w-40`, `bds-paper.w-100.ph5.pv3.mt4` do OAuth 2.0 com
  `bds-switch size="short"`, URL de autorização | Grant Type
  (`client_credentials`, desabilitado), Client ID | Client Secret
  (`bds-input-password`), "Limpar dados"; `expandable-content` "Cabeçalhos
  customizados" com `key-value`; `.row.mt4 > .three.columns.offset-by-nine >
  button.bp-btn.bp-btn--bot.bp-btn--small.fr` "Salvar") e httpEndpoints
  (sendMessagesUrl/sendNotificationsUrl | sendCommandsUrl; headerAuthentication
  só com `!isTokenManagementEnable`).
- `/configurations/keys`: template do módulo 76179, controlador `lP`
  (`MAX_TOKENS = 3`). `page-header#accesskey-header` com `custom-title`
  (`bds-typo h1 fs-24` "tokens.title" + `bds-button-icon info` → `toggleInfo`)
  e `custom-content` (`bds-button primary icon="add"` "tokens.buttons.addNewToken"
  → `openCreationModal`, ou `bds-banner warning tokenLimitReached` no limite).
  `.container.token-container`: `bds-paper.token-help` (3 `bds-typo fs-14`
  `tokens.help.keys/limit/exclude` + `bds-button tertiary` "Ok" + `img
  ballons.svg`), `bds-paper.token-create` (`bds-input` label `tokens.fields.
  token.name` placeholder `.placeholder` maxlength 100 + secondary "Cancelar" +
  primary "Criar") e um `bds-paper > .token-card` por chave (4 colunas
  `tokens.info.id/creationDate/name/requirer`, `bds-chip-tag info` "Padrão"
  quando `isDefault` = primeira da lista, `bds-button-icon trash` desabilitado
  na padrão). `deleteKey` confirma com `ModalService`: título `tokens.deleteBox.
  title`, corpo `<p>tokens.warning.httpSessionDeleteKey</p><p>tokens.deleteBox.
  text</p>`, botões `utils.forms.delete`/`utils.forms.return`. A API é
  `get /account/keys`, `set /account/keys` (`application/vnd.iris.keyRequest+json`,
  `purpose`) e `delete /account/keys/{id}`.

## Textos pt-BR (vendor-app_modules_translate…)

`templates.api`: pageTitle "Informações de conexão"; pageDescription "Defina
as configurações de envio e recebimento de mensagens e notificações do seu
chatbot"; usingBuilder "Conectar usando o builder" / "Construa um bot
utilizando o bot builder do Blip" (aqui: "do Pipe"); usingSdk "Conectar usando
SDK" / "para C# e JS" / "Receba suas credenciais de acesso"; usingHttp
"Conectar usando HTTP" / "para qualquer linguagem" / usingHttpNewDesc "Informe
sua URL para receber mensagens. Caso queira, informe outra URL para receber
notificações sobre a conversa. Nos dois casos, use um protocolo seguro
(HTTPS)."; httpEndpoints "Endpoints HTTP"; sendMessagesUrl "Url para enviar
mensagens"; sendNotificationsUrl "Url para enviar notificações";
sendCommandsUrl "Url para enviar comandos"; wsEndpoint "Endpoint WS";
tcpEndpoint "Endpoint TCP"; identifier "Identificador".
`templates.webhook`: urlReceiveMessages "Url para receber mensagens",
urlReceiveNotifications "Url para receber notificações". `templates.oauth`:
"URL de autorização", "Grant Type (Tipo de autentificação)", "Client ID",
"Client Secret". `builder-tabs-actions.processHttp`: oAuth2 "OAuth 2.0",
headeroAuth2 "Configurações de autenticação", infoOAuth2 "OAuth 2.0 é um
protocolo de autorização que utiliza um token de acesso para interagir com uma
API. Esse token é empregado para autenticar solicitações subsequentes.",
clearOAuth "Limpar dados", customHeaders "Cabeçalhos customizados".
`utils.forms.save` "Salvar", `.delete` "Excluir", `.return` "Voltar".
`tokens.*`: title "Chaves de acesso"; buttons addNewToken "Nova chave", submit
"Criar", cancel "Cancelar"; fields.token.name "Nome", placeholder "Dê um nome
para a chave"; info id "Id", creationDate "Data de criação", name "Nome",
requirer "Criado por"; default "Padrão"; help.keys/limit/exclude (ver tela),
help.close "Ok"; deleteBox.title "Excluir chave", text `Quer mesmo excluir a
chave "{{name}}"?`; warning.httpSessionDeleteKey "**Cuidado**: certifique-se de
que a chave removida não seja a mesma usada para a configuração HTTP do bot.";
errorMsg tokenNameRequired "Adicione um nome para identificar a chave",
tokenLimitReached "Limite de {{value}} chaves atingido".

## Medidas (cópia em 1280×780, `docs/capturas/regua.md`)

- Lateral 309px = 12 (bds-grid padding=2) + 285 + 12; degradê
  `linear-gradient(180deg,#fff,#f2fcff)`. Cada `bds-nav-tree`: `.nav_main`
  277×86 (`padding: 8px; gap: 8px; border-radius: 8px; border: 1px solid
  transparent`), ícone 24, título fs-14/600 (22px), subtítulo fs-12 (22px por
  linha), `.accordion` fechado embaixo com `margin: 9px 0; padding: 6px 0;
  border-bottom: 1px dotted #bebebe` (13px); passo entre itens 121px.
- Miolo: `.container` 80% centrado (776 de 971). `page-header`:
  `.full-initial-section { margin: 15px 0; padding: 15px 0; border-bottom: 1px
  solid #cfcfcf }`, `.page-header-content` 42px com `margin-top: 3px`, h1
  24px/24px peso 400; `additional-info p` 16px/1.6 `margin-bottom: 24px`.
- `bds-paper.ph5.pv4.mb3`: `padding: 20px 40px; margin-bottom: 10px;
  border-radius: 16px; background: #f6f6f6; box-shadow: 0 2px 8px -2px
  rgba(0,0,0,.16)`. h1 24px/24 `margin-bottom: 30px`, `<small>` 12px #738192;
  `p.bp-fs-6` 14px/1.6 `margin-bottom: 24px`. `<switch>` 43×26 (raio 36,
  #cfcfcf, bolinha 22 em 2,2, `margin-bottom: -3px`). Colunas `.mr6.w-50`
  (50%, `margin-right: 80px`); rótulo `.mb3.bp-fs-7.fw7` 12px/700 `margin-bottom:
  10px`; `.input-clipboard-container` 32px (`padding: 5px 20px; border-radius:
  100px; background: #e0e0e0; color: marca; input 700, 85%, margin-right 10px`;
  `.icon-copy` 16×22).
- `bds-input`: `border: 1px solid rgba(0,0,0,.2); border-radius: 8px; padding:
  7px 4px 8px 12px`; label 12px/700 (18px) + 2px + input 36px 14px.
  `bds-paper` do OAuth: `padding: 10px 40px; margin-top: 20px`; cabeçalho 56px;
  `.w-100.mv3` `margin: 10px 0`. `.bp-btn--bot.bp-btn--small`: 42px, `padding:
  0 20px`, raio 3, 14px/600, `line-height: 38px`.
- Chaves: `.token-container { gap: 12px }`; `.token-help { padding: 24px }` com
  `.token-help-data` (coluna, `gap: 12px`, space-between) e a imagem 111×139;
  `.token-create { padding: 24px; justify-content: space-between }`,
  `.token-create-data` 50%, ações `gap: 12px`; `.token-card { gap: 32px;
  padding: 24px }`, colunas `flex-basis: calc(50% - 24px)`, chip 75px.
  `bds-button`: 40px, raio 8, `padding: 0 16px`, 14px/700 (`line-height: 14px`),
  `gap: 4px`; tertiary com `border: 1px solid #282828`. `bds-button-icon short`:
  40×40, raio 8, `padding: 8px`.

## Limites da cópia e o que só a Blip real mostra

- O mock não resolve `isBuilderActive/isSdkActive/isHttpActive` nem
  `isCheckedOAuth`: os três interruptores aparecem desligados COM o miolo de
  cada cartão à vista (o `ng-show` não fecha). A reprodução segue essa foto.
  Para ver o estado real (builder ligado e desabilitado, SDK/HTTP fechados,
  OAuth fechado, o `expandable-content` "Cabeçalhos customizados" e o modal
  `changeConnectionDisclaimer` ao trocar): Blip real →
  `/application/detail/<bot builder>/configurations/apikey`, clicar no
  interruptor de "Conectar usando HTTP" e, dentro, no de "OAuth 2.0".
- Os `bds-input` do formulário HTTP aparecem no mock em estado de erro (borda
  vermelha, `{{ }}` sem interpolar); a reprodução usa o estado normal do
  `bds-input` (borda `rgba(0,0,0,.2)`), medido em `token-create`.
- Em Chaves, os `bds-button`/`bds-button-icon` do mock renderizam degradados
  ("Nova chave" fora do botão, botão de ícone com 130px). A reprodução usa o
  desenho normal do blip-ds. Para conferir: Blip real →
  `/configurations/keys`, clicar no `i` (ajuda), em "Nova chave" e na lixeira
  de uma chave (modal de exclusão) e criar uma chave (modal "Chave gerada com
  sucesso!", `tokens.modal.*`, que aqui NÃO existe porque nunca se exibe
  credencial).
- Lista de chaves preenchida: a régua ganhou a rota `get /account/keys` em
  `~/desk-clone/gestao-local/dados-mock.js` (duas chaves fictícias, sem
  segredo); o `ng-repeat` do mock só desenha um cartão e sem interpolar.

## Pipe

`apps/gestao/src/app/fluxo/[id]/configuracoes/**`: `layout.tsx` (casca com
`.cf-casca` desfazendo o recuo da `fx-coluna`), `navegacao.tsx` (os 5 itens),
`pecas.tsx` (page-header, bds-paper, switch, input-clipboard, bds-input,
bds-button, bds-button-icon), `api/tela.tsx`, `keys/tela.tsx`, `regras.ts`
(limite 3, nome obrigatório, padrão não sai — `tests/configuracoes-regras.test.ts`).
Tudo sem backend (`ponytail:`): campos vazios, identificador = id do fluxo,
criar/excluir/salvar devolvem o erro controlado. Não se gera nem se mostra
credencial. Ícones novos via `docs/capturas/gerar-icones.mjs`: `config-basicas`
(settings-general), `boas-vindas` (robot-2), `menu-persistente`
(add-persistent-menu), `chaves` (sso), `copiar` (copy).

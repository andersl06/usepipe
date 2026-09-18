# Integrações, Webhook e Log — o que a origem mostra

Conferido no bundle (`docs/capturas/cap6s/supernova.blip.ai/portal.js` e
`portal.css`), no arquivo de traduções pt-BR e no DOM da cópia local
(`http://127.0.0.1:8790`, janela 1280×780). As medidas abaixo são as do DOM.

## Integrações (`auth.application.detail.integrations`)

Template do `IntegrationsController`: `.container > .row > .twelve.columns >
.integrations-list` com um `.integration-item.tc` por integração, cada um
com `<card class="tc card card--with-hover card--square" id="<x>-card-integration">`
contendo `img` (Dashbot `height="67"` com `.mb0`; Botanalytics e Webhook
`height="57"`), `.integration-item-text > h4 + small` e
`.integration-item-button > bds-button variant="tertiary"`. NÃO há título
acima da grade. Dashbot e Botanalytics vêm antes do Webhook; RD Station e
HubSpot ficam atrás de `ng-if` (flags) e não aparecem na conta capturada.

- Texto do botão: `utils.forms.connect` = "Conectar"; vira
  `utils.forms.connected` = "Conectado" (variante `primary`) quando
  `<X>.IsValid` é `"true"` na configuração do bot.
- Textos: `dashbot.title/headline`, `botanalytics.title/headline`,
  `modules.application.detail.integrations.webhook.title/description`.
- Medidas: lista a 15px da barra do contato (128,151 → 1044×268, `margin-right:
  -20px`, grade 4 colunas ≥1220px); item 261 de largura com `padding-right:
  30px` e `margin: 15px 0 1px`; cartão 231×234, raio 8, `card-content` com 15px
  de padding; figura a 15px do topo; `h4` 16/700 com 12px abaixo; `small`
  12px; botão 40 de altura, `padding 0 16px`, raio 8 e **`min-width: 130px`**
  (é o `button { min-width: 8.125rem }` global do portal alcançando o
  `bds-button`, que nesta build não usa shadow DOM).

## Webhook (`auth.application.detail.integrations.webhook`, módulo 29045)

`<page-header back-button page-title="Webhook">` com `bds-switch` (`pa1`) e
`bds-typo fs-16 bold` "Ativar" à direita; abaixo, `bds-grid > bds-paper
.integration-card` (raio 16, 80% da tela, `margin-top: 8px`) com `bds-grid
padding="3"` (24px): fileira das abas (`bds-tabs` com `webhook-tab-1` "Visão
Geral" e `webhook-tab-2` "Configurações"; tab de 48px, `margin-right: 32px`,
sublinhado de 2px na selecionada) e o link "Documentação" (para
help.blip.ai — escondido na cópia e ausente no Pipe).

- Visão geral: `img` 72×72, `bds-typo fs-16` com a descrição e, se não
  ativo, `bds-banner variant="warning"` (`padding 8px 16px`, raio 8, ícone 24)
  com `activationWarning` = "Esta integração precisa ser configurada antes de
  ser ativada."
- Configurações: `form#webhookForm` (`margin-bottom: 25px`) com o parágrafo
  `webhook.page.configurations.header` (escondido na cópia porque traz link
  de ajuda da Blip; o Pipe mostra a frase sem o link), uma
  `.form-group-small` por URL (`padding-bottom: 15px`): `bds-input
  .url-input-field` (label "Endereço HTTPS", `max-width: 440px`,
  `margin-right: 8px`, 73 de altura) + `bds-button-icon icon="close"`
  (40 de altura, `min-width` global de 130); `expandable-content
  .advanced-settings.pv3` com "Configurações avançadas (Opcional)" e, dentro:
  `bds-select-chips` "Tipos de envio" (Contatos, Mensagens, Eventos;
  `can-add-new="false"`, erro "Ao menos um tipo deve estar selecionado."),
  "Configurações de autenticação" com `bds-switch size="short"` + "OAuth
  2.0", `oauth-form` (módulo 75264: parágrafo `infoOAuth2`, fileiras
  `.w-40/.w-10/.w-40` com "URL de autorização", "Grant Type (Tipo de
  autentificação)" desabilitado com `client_credentials`, "Client ID",
  "Client Secret" em `bds-input-password`) e `custom-headers` ("Cabeçalhos
  customizados", fileiras Chave/Valor com lixeira, botão tracejado
  "+ Adicionar cabeçalho" de 60px em `.w-60`). Rodapé `bds-grid gap="1"`
  com `bds-button ghost` "+ Adicionar" (`utils.forms.addplus`) e
  `primary` "Salvar".
- Regras do controlador (`WebhookController`): `addUrl()` até 10;
  `isUrlValid` = HTTPS pela regex `VY`, ≤ 512, sem repetição;
  `handleSwitchBehavior()` desabilita o interruptor sem URL salva
  (tooltip `disabledSwitchTooltip`); `shouldDisableSave()` trava com URL
  inválida. Feature flags `is-showing-dispatchTypes-settings`,
  `is-showing-oauth-on-webhooks`, `is-showing-custom-headers-on-webhooks`
  estão ligadas na conta capturada.
- Dados: `ConfigurationsService.get("postmaster@analytics.msging.net")`
  lê `Webhook.IsValid`, `Webhook.Url` (URLs separadas por `;`),
  `Webhook.OAuthEnabled` e `Webhook.AdvancedSettings` (JSON). A cópia
  agora responde isso no mock (`dados-mock.js`), mas o chunk do
  `bds-tab-panel`/`bds-select-chips` não veio na captura: para ver os
  painéis é preciso forçar `display:block` no `bds-tab-panel`, e o seletor
  de chips não renderiza.

## Log (`auth.application.detail.growth.messages.log`, módulo 4842)

`<page-header page-title="Log" class="message-history-header">` com
`custom-content` (`gap: 20px`): formulário de busca (só com busca ou
mensagens; `bds-input` sem rótulo de 54px + `bds-button-icon search`
primária 40px com `min-width` 130 e `margin-left: 8px`), `bds-switch` e
"Ativar" (fs-16 bold). Abaixo, `.container.relative.message-history`:
`bds-chip-tag warning` de 24px (raio 12, `padding 0 4px`, ícone 16, texto
12/700, `margin-bottom: 20px`) "Funcionalidade desabilitada. Novas mensagens
e notificações trafegadas não aparecerão aqui." quando o log está
desligado; lista `.row > div > bds-paper elevation="primary"` (`padding
16px`, raio 16, `margin-bottom 20px`) com `p fs-12` Date / Id (link) / From /
To / (Pp) / Type / Content `pre` / Metadata `pre`; vazio sem busca:
`.no-logs-found h4 fs-16` "Aguardando a primeira mensagem" (cor
`content-disable`) + `p fs-14` com `noMessagesDescription`; vazio com busca:
ícone `error` size brand centrado + "Nenhum resultado encontrado".

- Dados: `get /log-configurations` em `postmaster@threads.<domínio>`
  (`{ enabled }`) e `get /messages?$take=30&$skip=0[&contentFilter=]`.
  O `MessageParser` lê `metadata["#envelope.storageDate"]` SEM checar se
  `metadata` existe — toda mensagem do mock precisa carregar isso. No mock
  local, `localStorage['log-ativo']` liga o log e devolve três mensagens.

## Pipe e limite

Não existe tela nem configuração de webhook por bot em Gestão, nem
`/log-configurations`. `webhook_saida` e `apps/api/src/webhooks-saida.ts` são
a saída de eventos do Pipe para uma URL do cliente, sem correspondência com
as configurações da integração original; não são reaproveitados. Os
controles ficam visuais (`ponytail:`) e salvar retorna indisponibilidade
controlada. As figuras dos cartões são os SVGs de
`/assets/img/integrations/` copiados para `integracoes/ilustracoes.tsx`.

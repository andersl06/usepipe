# Growth — Mensagens ativas

## Capturas e navegação

O microfrontend `docs/capturas/cap7/mfe/active-campaign-main.js` contém as
telas de resumo/listagem, criação de disparo e Envio direto. A casca e os itens
de navegação estão em `docs/capturas/cap6s/supernova.blip.ai/portal.js`.
O mesmo `portal.js` registra `/clicktracker` e monta `<click-tracker>`. O arquivo
`C:\Users\anderson.linhares\Downloads\supernova.blip.ai (16).zip` contém
`portal-fragment-click-tracker/latest/main.js` e sua página `clicktracker.html`;
portanto o microfrontend do Click Tracker está capturado e pode ser reproduzido.

Flags observadas em `docs/capturas/cap7/flags-roteador.txt`: `active-message-screen`,
`is-active-message-menu-enabled`, `new-campaingn-listing-active-message`,
`batch-active-message` e `active-message-international-phone-number` ligadas;
`enable-active-message-scheduling`, `active-message-opening-hours`,
`group-active-message` e `journey-enabled` desligadas.

## Dados e segurança

O Pipe tem `template_mensagem`, contatos, canais e mensagens enviadas. A gestão
consulta apenas dados do tenant: modelos, contatos ativos e mensagens de saída
com template das últimas 72 horas. Não existe entidade de campanha/audiência
para agrupar esses envios; `disparo_id` é preservado sem inferir campanha.
`apps/api/src/dominio/mensagem-ativa.ts` também possui operação de envio real;
esta tela não chama essa operação. Criar, enviar e Envio direto apenas exibem
aviso de indisponibilidade, sem enviar mensagens.

O bundle inclui criação de disparo em etapas, upload de audiência e prévia de
modelo. O código local reproduz a navegação visual, mas não persiste campanha,
lista CSV em memória e não transmite mensagens.

O Click Tracker mostra a performance agregada de anúncios Click to WhatsApp,
com variações para Meta, Google e TikTok e configurações de eventos de
conversão. A conexão de canal/conta externa e gravação de eventos no Pipe não
existem; a captura (16) fornece UI e estados, não autorização para enviar eventos
ou conectar contas.

O ZIP `supernova.blip.ai (16).zip` inclui a rota `growth/clicktracker.html` e o
microfrontend `portal-fragment-click-tracker/latest/main.js`; os arquivos de
settings não são usados pois podem conter credenciais. A UI Pipe mostra estado
sem conexão e métricas vazias, sem inventar resultados; conexão e configuração
de eventos permanecem indisponíveis.

## Fontes visuais

Textos e estados vêm do microfrontend `active-campaign-main.js`; a navegação,
rotas e entrada do Click Tracker vêm de `portal.js`. A folha local mapeia a
hierarquia visual para tokens de cor do Pipe, sem reutilizar cores hexadecimais
da origem.

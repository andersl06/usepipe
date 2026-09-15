# Growth — Mensagens ativas

## Capturas e navegação

O microfrontend `docs/capturas/cap7/mfe/active-campaign-main.js` contém as
telas de resumo/listagem, criação de disparo e Envio direto. A casca e os itens
de navegação estão em `docs/capturas/cap6s/supernova.blip.ai/portal.js`.
O mesmo `portal.js` registra `/clicktracker` e monta `<click-tracker>`, mas o
microfrontend carregado por essa tag não está salvo. Assim, a entrada pode ser
reproduzida; o conteúdo interno do Click Tracker depende de captura adicional.

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
lista CSV em memória e não transmite mensagens. O Click Tracker exige salvar o
microfrontend externo ou capturar sua tela para reproduzir campos e métricas.

## Fontes visuais

Textos e estados vêm do microfrontend `active-campaign-main.js`; a navegação,
rotas e entrada do Click Tracker vêm de `portal.js`. A folha local mapeia a
hierarquia visual para tokens de cor do Pipe, sem reutilizar cores hexadecimais
da origem.

# Aba Preferências (Settings) — Blip Desk

## De onde saiu

Arquivo: `C:\Users\anderson.linhares\blip-desk-ref-2\deskmfe.blip.ai\beagle\desk-preferences-mfe\latest\main.umd.js`
Tamanho: 420 KB
Data: 07/09/2026

## O que a aba oferece

A aba Preferências é um painel de configuração personalizada para o usuário. Estrutura visual: lista de seções de preferência (toggles, checkboxes, dropdowns); cada seção agrupa configurações relacionadas (notificações sonoras, alertas de navegador, comportamento ao sair, corretor ortográfico). Não há modal ou fluxo sequencial — tudo é seleção imediata com salvamento automático (provável).

## Fluxo passo a passo

1. Usuário acessa aba Preferências
2. Exibe todas as seções de configuração disponíveis
3. Alterna toggles/checkboxes para ativar/desativar preferências
4. Sistema salva configuração (modo automático, sem botão "Salvar")
5. Se configuração requer permissão do navegador (notificações), exibe prompt
6. Mudança entra em efeito imediatamente (para alertas sonoros, redirecionamento, etc)

## Regras de bloqueio

- **"O som está ativado no seu navegador?"**: Verificação pré-requisito antes de ativar alertas sonoros — usuário deve conferir volume do navegador/sistema
- **"Ative a permissão de notificações clicando no ícone de cadeado na barra de endereço do navegador."**: Prerequisito para habilitar notificações push — requer permissão explícita do navegador
- **"Habilite o envio de notificações clicando no ícone de cadeado na barra de endereço do seu navegador."**: Sinônimo da mensagem anterior
- **"O corretor ortográfico pode levar alguns instantes para carregar, variando conforme o desempenho do seu computador"**: Aviso de performance — ativação de corretor pode impactar UX em máquinas lentas

## Números

| O que é | Valor | Onde achei |
|---------|-------|-----------|
| Timeout aproximado do corretor ortográfico | alguns segundos (não quantificado) | main.umd.js: "instantes" / "alguns segundos" |
| Session timeout (logout inativo) | 15 minutos | settings.json: DEFAULT_LOGOUT_TIME_MINUTES = 15 |
| Intervalo de verificação de inatividade | 5 segundos | settings.json: CHECK_INACTIVITY_INTERVAL_MS = 5000 |
| Timeout de notificação na tela | 5 segundos | settings.json: NOTIFICATION_CLOSE_TIMEOUT = 5000 |

## Vocabulário de tela

**Alertas sonoros — Novos tickets:**
- Alertas sonoros para novos tickets
- Alertas sonoros para novos tickets atribuídos
- Alertas de sonido de nuevos tickets
- Alertas sonoros para novos tickets asignados
- Receba alertas sonoros quando novos tickets forem atribuídos a você
- Reciba alertas de audio cuando se le asignen nuevos tickets

**Alertas sonoros — Novas mensagens:**
- Alertas sonoros para novas mensagens
- Alertas de sonido para la pestaña activa del navegador
- Alertas sonoros na aba ativa do navegador
- Receba alertas sonoros enquanto a aba do navegador estiver ativa

**Notificações do navegador:**
- Ative a permissão de notificações clicando no ícone de cadeado na barra de endereço do navegador.
- Habilite o envio de notificações clicando no ícone de cadeado na barra de endereço do seu navegador.
- Active el envío de notificaciones haciendo clic en el icono de candado en la barra de direcciones del navegador.
- Habilita el permiso de notificaciones haciendo clic en el icono de candado en la barra de direcciones del navegador.

**Comportamento ao sair/fechar:**
- Continuar online ao fechar o Blip Desk

**Corretor ortográfico:**
- Corrector de textos
- Corrector ortográfico
- O corretor ortográfico pode levar alguns instantes para carregar, variando conforme o desempenho do seu computador
- El corrector ortográfico puede tardar unos instantes en cargarse, según el rendimiento de su computadora

**UI/Navegação:**
- Barra de tickets
- Ver mensagens por ordem de abertura do ticket
- Ver mensajes por orden de apertura de los tickets

**Verificação de pré-requisitos:**
- O som está ativado no seu navegador?
- ¿Está habilitado el sonido en tu navegador?

## O que não consegui determinar

- Se as preferências são salvadas na sessão (localStorage/sessionStorage) ou servidor
- Se há perfil padrão ou reset de preferências a fábrica
- Tipo de notificação sonora (beep, custom alert, notification sound)
- Se alertas sonoros continuam ativos em abas inativas do navegador (ou apenas "Alertas sonoros na aba ativa")
- Comportamento exato de "Continuar online ao fechar" (WebSocket keepalive?)
- Se há preview de som antes de salvar preferência
- Limite de caracteres ou tamanho do arquivo de som customizável
- Se há preferências de idioma ou timezone nesta aba
- Se "Barra de tickets" é um header fixo ou collapsible

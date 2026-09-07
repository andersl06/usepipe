# Regras de Configuração do Blip Desk

Tabela com as chaves de configuração extraídas de `supernova.desk.blip.ai/static/settings.*.json`. Agrupa comportamentos relativos a tempo, limite, tamanho, contagem, intervalo e chaves liga/desliga.

## Presença do Atendente

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `POLLING_INTERVAL` | `15000` | 15 segundos | Intervalo de verificação de novas mensagens e eventos (polling) |
| `INACTIVITY_INTERVAL` | `600000` | 10 minutos | Tempo sem interação do atendente antes de considerar inativo |
| `INACTIVITY_SET_OFFLINE_INTERVAL` | `600000` | 10 minutos | Tempo para mudar automaticamente para modo "offline" após inatividade |
| `CHECK_INACTIVITY_INTERVAL_MS` | `5000` | 5 segundos | Intervalo de verificação de inatividade |
| `KEEP_AGENT_ONLINE` | (chave de configuração) | Manter agente online | Ativa/desativa manutenção automática de presença online |

## Sessão e Saída

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `SESSION_EXPIRATION_TIME_MS` | `28800000` | 8 horas | Tempo máximo de sessão antes de logout automático |
| `DEFAULT_LOGOUT_TIME_MINUTES` | `15` | 15 minutos | Tempo padrão de espera antes de fazer logout por inatividade |
| `COOKIE_UPDATE_INTERVAL_MS` | `5000` | 5 segundos | Intervalo para renovar cookies da sessão |
| `MINIMUM_RESET_INTERVAL_MS` | `1000` | 1 segundo | Intervalo mínimo entre resets de sessão |
| `AUTH_COOKIE_ENABLED` | `true` | Habilitado | Habilita uso de cookies para autenticação |

## Anexos e Mídia

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `MAX_ATTACHMENT_SIZE` | `104857600` | 100 MB | Tamanho máximo de um arquivo anexado |
| `MAX_ATTACHMENT_COUNT` | `10` | 10 arquivos | Quantidade máxima de anexos por mensagem |
| `DEFAULT_FILE_TOKEN_EXPIRATION_IN_MILLISECONDS` | `900000` | 15 minutos | Tempo de validade do token de acesso a arquivo |

## Conversa e Digitação

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `TYPING_TIMEOUT` | `4000` | 4 segundos | Duração do indicador "digitando..." na conversa |
| `CHAT_STATE_TIMEOUT` | `20000` | 20 segundos | Tempo máximo para manter estado (digitando, online) |
| `COMMAND_TIMEOUT` | `9000` | 9 segundos | Timeout para execução de comandos |
| `MESSAGE_HISTORY_PAGE_SIZE` | `40` | 40 mensagens | Quantidade de mensagens carregadas por página no histórico |

## Conexão e Tempo Real

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `PING_TIMEOUT` | `5000` | 5 segundos | Timeout de resposta ao ping de conexão |
| `CONNECTION_TEST_INTERVAL` | `15000` | 15 segundos | Intervalo para verificar qualidade da conexão |
| `DEFAULT_CLIENT_TIMEOUT` | `65000` | 65 segundos | Timeout padrão para requisições do cliente |
| `MAX_PING_RETRIES` | `1` | 1 tentativa | Máximo de retentativas de ping antes de desconectar |

## Cache e Expiração

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `CONFIGURATION_EXPIRATION_TIME` | `1800000` | 30 minutos | Tempo de validade do cache de configuração geral |
| `CONFIGURATION_EXPIRATION_TAGS_TIME` | `300000` | 5 minutos | Tempo de validade do cache de tags |
| `CONFIGURATION_EXPIRATION_REPLIES_TIME` | `1800000` | 30 minutos | Tempo de validade do cache de respostas rápidas |
| `CONFIGURATION_EXPIRATION_FORBIDDEN_WORDS_TIME` | `300000` | 5 minutos | Tempo de validade do cache de palavras proibidas |
| `OWNER_ACCOUNT_EXPIRATION_TIME` | `1800000` | 30 minutos | Tempo de validade do cache de informações do proprietário |
| `CONTACT_EXPIRATION_TIME` | `1800000` | 30 minutos | Tempo de validade do cache de contatos |

## Notificação e Alerta

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `NOTIFICATION_CLOSE_TIMEOUT` | `5000` | 5 segundos | Tempo para fechar automaticamente notificações na tela |
| `BROWSER_NOTIFICATION` | (chave de configuração) | Notificação do navegador | Ativa/desativa notificações do sistema operacional |
| `TICKET_ALERT` | (chave de configuração) | Alerta de ticket | Ativa/desativa alerta quando novo ticket é atribuído |
| `MESSAGE_ALERT` | (chave de configuração) | Alerta de mensagem | Ativa/desativa alerta ao receber nova mensagem |
| `ALERT_DESK_ACTIVE` | (chave de configuração) | Alerta Desk ativo | Ativa/desativa alerta geral da aba Desk |

## Desempenho e Scroll

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `MINIMUM_SCROLL_DISTANCE` | `150` | 150 pixels | Distância mínima de scroll antes de carregar mais histórico |
| `SCROLL_TIMEOUT` | `50` | 50 ms | Intervalo de debounce para evento de scroll |
| `INFINITE_LOADING_TIMEOUT` | `750` | 750 ms | Timeout para carregamento infinito de histórico |

## Verificação de Status e Atualizações

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `VERSION_CHECK_INTERVAL_MINUTES` | `5` | 5 minutos | Intervalo para verificar se há nova versão da aplicação |
| `INSTABILITY_CHECK_INTERVAL` | `300000` | 5 minutos | Intervalo para verificar instabilidade da plataforma |

## Transcrição e Processamento de Texto

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `TRANSCRIPTION_SHORT_TEXT_LENGTH` | `500` | 500 caracteres | Limite para considerar transcrição como "texto curto" |
| `TRANSCRIPTION_LONG_TEXT_LENGTH` | `1000` | 1000 caracteres | Limite para considerar transcrição como "texto longo" |
| `TEXT_ASSISTANT_MAX_RETRY` | `3` | 3 tentativas | Máximo de retentativas ao processar texto com IA |

## Outros

| Chave | Valor bruto | Em português | O que isso faz |
|-------|-------------|--------------|-----------------|
| `GET_TICKETS_LAST_MESSAGE_PARTITION_TICKET_AMOUNT` | `100` | 100 tickets | Quantidade de tickets carregados por partição na busca de última mensagem |
| `LOGS_ENABLED_DEFAULT_VALUE` | `"Disabled"` | Desabilitado | Estado padrão de logs (ativado/desabilitado) |
| `APPCUES_ENABLED` | `true` | Habilitado | Habilita exibição de dicas e tutorials in-app |

---

**Nota sobre ignorados**: Foram omitidas 37 chaves de endereço, URL, ID de cliente, domínio, porta, esquema e configuração de localização, pois descrevem identidade e roteamento, não comportamento.

**Observação de incerteza**: As chaves `BROWSER_NOTIFICATION`, `TICKET_ALERT`, `MESSAGE_ALERT`, `ALERT_DESK_ACTIVE` e `KEEP_AGENT_ONLINE` aparecem como valores de string (nome de chave configurável) no JSON, não como booleanos diretos. Sua função de liga/desliga é inferida do contexto e do nome.

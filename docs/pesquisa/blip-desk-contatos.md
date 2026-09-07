# Aba Contatos (Histórico de Contatos) — Blip Desk

## De onde saiu

Arquivo: `C:\Users\anderson.linhares\blip-desk-ref-2\deskmfe.blip.ai\beagle\desk-contact-history\latest\main.js`
Tamanho: 1,6 MB
Data: 07/09/2026

## O que a aba oferece

A aba Contatos mostra histórico de atendimento com buscador de contatos, lista de contatos/tickets ao lado, e painel de detalhes. Estrutura visual: coluna esquerda com busca ("Busca por nombre o teléfono") e listagem de contatos agrupados por ticket; coluna central com campo de busca; painel direito (ao abrir) mostrando "Dados do Contato" (nome, ID, telefone, origem), "Dados do atendimento" (fila, agente, tempo, status), "Resumo da conversa" (texto-resumo com scroll), histórico de mensagens com mídia suportada (texto, imagem, vídeo, áudio, localização), e ações (ligar, enviar mensagem ativa).

## Fluxo passo a passo

1. Usuário acessa aba Contatos
2. Exibe mensagem inicial: "Selecione um contato na lista ao lado e escolha um ticket para abrir seu histórico"
3. Busca opcional por nome/telefone filtra lista
4. Clica em contato e escolhe ticket
5. Abre painel com histórico, dados do contato, e resumo da conversa
6. Pode interagir com ações: ligar (se habilitado), enviar mensagem ativa, ver gravação (se disponível)
7. Voltar ("Voltar para o histórico") retorna à lista

## Regras de bloqueio

- **"Selecione um contato na lista ao lado e escolha um ticket para acessar abrir seu histórico"**: Mandatório selecionar antes de ver histórico
- **"Nenhum resultado encontrado"**: Busca não retornou contatos
- **"Este contato não possui um número de telefone válido."**: Impede ligar ou enviar SMS (ao tentar "Ligar para o contato")
- **"Este bot não está habilitado para iniciar chamadas."**: Chamadas desabilitadas no bot
- **"Este bot não está habilitado para enviar mensagens ativas."**: Mensagens ativas desabilitadas
- **"Você não tem permissão para enviar mensagens ativas."**: Permissão de usuário insuficiente
- **"Você não tem permissão para iniciar chamadas nesse bot."**: Permissão de usuário insuficiente
- **"Você não pode enviar mensagem ativa para este contato enquanto estiver offline."**: Contato offline
- **"Falha ao carregar o resumo da conversa."**: Erro de carregamento de resumo
- **"Ops! Falha ao carregar o histórico de atendimento."**: Erro crítico no carregamento do histórico
- **"A lista de tickets mostra os registros dos últimos 90 dias"**: Limitação de período

## Números

| O que é | Valor | Onde achei |
|---------|-------|-----------|
| Período de histórico exibido | 90 dias | main.js: "A lista de tickets mostra os registros dos últimos 90 dias" |
| Tamanho máximo de arquivo de áudio/vídeo | 100 MB | settings.json: MAX_ATTACHMENT_SIZE = 104857600 bytes |
| Quantidade máxima de anexos por mensagem | 10 | settings.json: MAX_ATTACHMENT_COUNT = 10 |
| Tamanho limite de transcrição curta | 500 caracteres | settings.json: TRANSCRIPTION_SHORT_TEXT_LENGTH = 500 |
| Tamanho limite de transcrição longa | 1.000 caracteres | settings.json: TRANSCRIPTION_LONG_TEXT_LENGTH = 1000 |
| Timeout para carregamento de gravação | não confirmado | — |

## Vocabulário de tela

**Seção inicial:**
- A lista de tickets mostra os registros dos últimos 90 dias
- Selecione um contato na lista ao lado e escolha um ticket para acessar abrir seu histórico
- Nenhum resultado encontrado

**Busca:**
- Busca por nombre o teléfono

**Dados do contato:**
- Dados do Contato
- Nome do contato
- ID Usuário
- Origem do ticket
- Última interação

**Dados do atendimento:**
- Dados do atendimento
- Fila de atendimento
- Tempo de atendimento
- Finalizado pelo atendente
- Finalizado pelo cliente
- Finalizado por inatividade do cliente
- Transferido por
- Encaminhado pelo bot
- Transferência

**Resumo e histórico:**
- Resumo da conversa
- Falha ao carregar o resumo da conversa.
- Comentários
- Comentários realizados durante o atendimento humano
- Nenhum comentário sobre este contato

**Tipos de interação:**
- Ligação
- Chamada de vídeo
- Fim da chamada de {callType} {callTime}
- Início da chamada de {callType} {callTime}
- Mensagem de texto de introdução
- Conteúdo não suportado
- Reação
- Reação removida
- Solicitação de permissão para ligação
- O cliente aceitou receber ligações ativas
- O cliente rejeitou receber ligações ativas

**Campos de mensagem/mídia:**
- URL da página
- URL do arquivo
- Uri do vídeo
- Proporção da tela
- Mime type do postback
- Valor de postback
- Modelo de mensagem

**Ações:**
- Ligar para o contato
- Carregar gravação
- Preparando gravação
- Enviar Localização
- Voltar para o histórico

**Erros de permissão/conectividade:**
- Este bot não está habilitado para iniciar chamadas.
- Este bot não está habilitado para enviar mensagens ativas.
- Você não tem permissão para enviar mensagens ativas.
- Você não tem permissão para iniciar chamadas nesse bot.
- Este contato não possui um número de telefone válido.
- Você não pode enviar mensagem ativa para este contato enquanto estiver offline.
- No se pudo enviar el mensaje.

**Transferência/Bot:**
- Chatbot {chatbotIdentity} encaminhou a conversa para atendimento

**Erros gerais:**
- Ops! Falha ao carregar o histórico de atendimento.

## O que não consegui determinar

- Modo de ordenação do histórico de mensagens (cronológica, por interação)
- Se há suporte a reações emoji além das nomeadas
- Limite de mensagens exibidas por página ou scroll infinito
- Se gravações de chamada são armazenadas e por quanto tempo
- Autenticação necessária para "Ligar para o contato" (é integração com VoIP?)
- Se há exportação de histórico (PDF, CSV)
- Duração máxima/mínima de gravação permitida

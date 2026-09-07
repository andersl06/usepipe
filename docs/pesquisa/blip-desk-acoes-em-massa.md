# Aba Ações em Massa (Bulk Tickets) — Blip Desk

## De onde saiu

Arquivo: `C:\Users\anderson.linhares\blip-desk-ref-2\deskmfe.blip.ai\beagle\desk-tickets-mfe\latest\main.js`
Tamanho: 876 KB
Data: 07/09/2026

## O que a aba oferece

A aba Ações em Massa permite selecionar e executar operações em múltiplos tickets simultaneamente. Estrutura visual: barra de filtro/busca ("Busca por nombre o teléfono"), lista de tickets com checkboxes de seleção, barra de ações flutuante (ao selecionar 1+), painel lateral de gerenciamento de "Pastas" (customizáveis, limite de 10), e modal de confirmação pós-ação. Oferece ações: transferir (fila/agente), mover para pasta, marcar como lido/não lido.

## Fluxo passo a passo

1. Usuário acessa aba Ações em Massa
2. Pode buscar/filtrar tickets ("Busca por nombre o teléfono")
3. Seleciona um ou múltiplos tickets via checkbox
4. Barra flutuante aparece com ações disponíveis
5. Escolhe ação: Transferência Direta (para agente) ou mover para pasta
6. Modal de confirmação: "Se transfirieron {0} de {1} tickets" ou "Trasferência realizada com sucesso"
7. Sistema processa; se falha, exibe erro específico

## Regras de bloqueio

- **"O Desk permite até 10 pastas. Exclua ou reorganize pastas para criar uma nova."**: Limite hard de 10 pastas customizáveis
- **"Limite de pastas atingido"**: Tentativa de criar 11ª pasta bloqueada
- **"Não é possível transferir para um atendente Indisponível"**: Agente offline ou status "Indisponível" impede transferência
- **"Não é possível transferir para uma fila sem atendentes online"**: Fila sem agentes online impede transferência
- **"Se alcanzó el límite de ficheros"** (ES): Tentativa de criar pasta além do limite (espelhamento de regra anterior)
- **"Erro ao mover ticket. Por favor, tente novamente."**: Erro genérico de backend ao mover
- **"Erro ao transferir"**: Erro genérico de backend ao transferir
- **"No ha sido posible enviar el mensaje."**: Falha ao enviar mensagem (se ação inclui mensagem)
- **"Sem atendimentos nesse estágio"**: Estado vazio — nenhum ticket no filtro/busca ativo

## Números

| O que é | Valor | Onde achei |
|---------|-------|-----------|
| Limite de pastas | 10 | main.js: "O Desk permite até 10 pastas" |
| Máximo de tickets transferíveis por ação | não confirmado | — |
| Timeout de transferência | não confirmado | — |
| Limite de caracteres "Pasta sem nome" | não confirmado | — |

## Vocabulário de tela

**Header/Busca:**
- Ações em Massa
- Busca por nombre o teléfono

**Gestão de Pastas:**
- Pasta sem nome
- Adicionar Opção (criar nova pasta?)
- Limite de pastas atingido
- O Desk permite até 10 pastas. Exclua ou reorganize pastas para criar uma nova.

**Ações principais:**
- Transferência Direta
- Transferência direta
- Solicitação de permissão para ligação
- Ligação

**Confirmações:**
- Foram transferidos {0} de {1} tickets
- Se transfirieron {0} de {1} tickets
- Transferência realizada com sucesso
- Trasferência realizada com sucesso

**Contagem/Seleção:**
- {0} não lida
- {0} não lidas

**Resumo:**
- Resumo da conversa

**Estados:**
- Sem atendimentos nesse estágio
- Chamada de vídeo

**Erros:**
- Erro ao mover ticket. Por favor, tente novamente.
- Erro ao transferir
- Não é possível transferir para um atendente Indisponível
- Não é possível transferir para uma fila sem atendentes online
- No ha sido posible enviar el mensaje.
- No se pudo transferir al asistente Indisponível
- No se pudo transferir a la cola sin asistentes en línea
- Se alcanzó el límite de ficheros

**Permissões de chamada:**
- El cliente ha aceptado recibir llamadas salientes
- El cliente ha rechazado recibir llamadas salientes
- O cliente aceitou receber ligações ativas
- O cliente rejeitou receber ligações ativas

## O que não consegui determinar

- Se a seleção é persistente após ação (checkboxes mantêm marcação?)
- Se há busca avançada ou filtros além de nome/telefone
- Se é possível selecionar "todos os tickets" com um único clique
- Limite de tickets que podem ser transferidos de uma vez
- Se há histórico de ações em massa executadas
- Se pastas podem ser compartilhadas entre agentes ou são por usuário
- Comportamento ao transferir para agente que sai do ar durante transferência
- Se há confirmação de "desfazer" após transferência bem-sucedida

# Aba Analytics — Blip Desk

## De onde saiu

Arquivo: `C:\Users\anderson.linhares\blip-desk-ref-2\deskmfe.blip.ai\beagle\desk-analytics-mfe\latest\main.js`
Tamanho: 2,9 MB
Data: 07/09/2026

## O que a aba oferece

A aba Analytics apresenta um painel de análises de atendimento geradas por IA. Estrutura visual: painel no topo com "Visão Geral de Tickets", contadores e métricas de atendimento; abaixo, listagem de análises com cards individuais; ao abrir uma análise, surge modal com "Detalhes da análise" e a nota do atendimento. Há componente de feedback (concordo/discordo) integrado ao modal. Também oferece "Transcrição de Áudio" de tickets quando disponível e "Sugestões de Respostas" geradas pela IA.

## Fluxo passo a passo

1. Usuário acessa a aba Analytics
2. Exibe painel resumido com "Médias de métricas de atendimento"
3. Lista todas as análises disponíveis nos últimos 90 dias
4. Ao clicar em análise, abre modal com "Detalhes da análise"
5. Usuário pode fornecer feedback ("Você concorda com essa análise?") marcando concordância ou discordância
6. Sistema processa feedback com mensagem "Obrigado pelo feedback! Ele nos ajuda a melhorar as análises da IA."

## Regras de bloqueio

- **"Análise não realizada..."**: Exibido quando não há dados de análise disponíveis para o período
- **"Carregando análises..."**: Estado de carregamento — nenhuma ação disponível durante este estado
- **"Falha no envio da avaliação. Tente novamente."**: Erro ao submeter feedback de concordância/discordância

## Números

| O que é | Valor | Onde achei |
|---------|-------|-----------|
| Período de registros na listagem | 90 dias | main.js grep "90 day" |
| Período alternativo (leitura opcional) | 30 dias | main.js grep "30 day" |
| Análises geradas pela IA | não confirmado | — |
| Limite de análises por página | não confirmado | — |

## Vocabulário de tela

**Painel principal:**
- Visão Geral de Tickets
- Confira todas as suas métricas de atendimento nesse painel
- Médias de métricas de atendimento

**Análises:**
- Análise de tickets
- Análise não realizada...
- Detalhes da análise
- Nota do atendimento
- A nota do atendimento é gerada pela IA com base nos critérios previamente definidos.

**Métricas específicas:**
- Performance do atendimento
- Performance do último atendimento
- Tempo de 1ª resposta
- Tempo de atendimento
- Tempo médio de resposta
- Tamanho de respostas

**Assistências:**
- Transcrição de Áudio
- Sugestões de Respostas
- Entenda conversas rapidamente com [Sugestões]

**Feedback:**
- Você concorda com essa análise?
- Quais pontos você discorda da análise da IA?
- Obrigado pelo feedback! Ele nos ajuda a melhorar as análises da IA.
- Obrigado pelo feedback!

**Carregamento:**
- Carregando análises...
- Confira todas as suas análises de atendimento nessa listagem

**Erros:**
- Falha no envio da avaliação. Tente novamente.

## O que não consegui determinar

- Limite de análises por página ou modo de paginação
- Quantidade de análises que podem ser armazenadas ou sincronizadas
- Se há filtros por agente, fila ou data além do padrão de 90 dias
- Se o modal de "Detalhes da análise" oferece ações (download, compartilhamento)
- Tempo de geração de análises após ticket ser encerrado

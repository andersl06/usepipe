# Portal Blip — Módulo Copiloto (Blip Copilot)

Levantamento do módulo **Copiloto** (Blip Copilot) e **Transcrição** do Portal Blip, extraído de arquivo capturado da organização **Supernova** (app "AUVP Capital"), **somente leitura**.

**Fontes exploradas:**
- `portalmfe.blip.ai/beagle/blip-copilot-mfe/latest/main.js` (3.1 MB) — módulo específico de Copiloto
- Referências em `portal-fragment-desk-mfe/latest/main.js` (Desk/Atendimento)

---

## 1. Conceito geral

O **Copiloto** é um **assistente de IA para atendentes** que:
- Sugere respostas em tempo real durante atendimento
- Fornece informações de contexto (cliente, ordem, histórico)
- Pode executar ações em background (criar ticket, enviar email, etc.)
- Usa **base de conhecimento** alimentada por uploads do usuário
- Aprende com histórico de sugestões aceitas/rejeitadas

---

## 2. Telas e roteamento

### Rotas descobertas

| Tela | Rota | Função |
|---|---|---|
| Configuração de Copiloto | `/copilot/enable` | Setup inicial, habilitar/desabilitar |
| Configuração de Qualidade | `/copilot/quality-analysis/configuration` | Parâmetros de análise de qualidade |
| Relatório — Base de Conhecimento | `/copilot/report/knowledge-base?$skip=` | Análise de documentos na base |
| Relatório — Sessões | `/copilot/report/sessions?year=` | Histórico de atendimentos com copiloto |
| Relatório — Sugestões | `/copilot/report/suggestion?beginDate=` | Análise de sugestões dadas |
| Relatório — Transcrição | `/copilot/report/transcription?beginDate=` | Relatório de áudio transcritos |
| Relatório — Resumo Consolidado | `/copilot/report/summary/consolidated?beginDate=` | Resumo geral com comparações |
| Relatório — Resumo | `/copilot/report/summary?beginDate=` | Resumo de período |
| Relatório — v2 (Novo) | `/copilot/report/v2?beginDate=` | Versão melhorada do relatório |
| Relatório — Export Combinado | `/copilot/reports/combined/export?beginDate=` | Exportar múltiplos relatórios |
| Relatório — Export Sugestões | `/copilot/reports/suggestion/export?beginDate=` | Exportar sugestões em CSV |
| Relatório — Export Thread Summary | `/copilot/reports/thread-summary/export?beginDate=` | Exportar resumos de thread |

### Acesso dentro de Desk

- Rota completa: `/application/detail/{appId}/attendance/desk/blip-copilot`
- Copiloto aparece como sub-módulo dentro de Desk/Atendimento

---

## 3. Configuração inicial do Copiloto

### Fluxo de setup

1. **Habilitar Copiloto** — toggle em `/copilot/enable`
2. **Escolher Perfil de Copiloto** — define tom e estilo
3. **Selecionar Fila** — qual fila(s) usarão o copiloto
4. **Upload de Base de Conhecimento** — enviar documentos
5. **Configurar Parâmetros** — temperatura, orientações adicionais
6. **Ativar/Testar** — torna ativo para atendentes

### Campos de configuração

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| Nome da empresa | texto | Sim | Exibido no copiloto ("O nome da empresa que será mostrado em seu copilot") |
| Perfil do copiloto | select | Sim | "Escolha um perfil para seu copiloto" |
| Fila do copiloto | select | Não | "Se no queue is selected, the copilot will use the context of your bot" |
| Base de conhecimento | arquivo (upload) | Sim | "Para começar a utilizar o copilot, faça o upload de uma base de conhecimento" |
| Temperatura (Criatividade) | slider (0-1) | Não | Padrão não confirmado; "O nível de criatividade da IA é definido através do parâmetro de temperatura" |
| Orientações adicionais | textarea | Não | "Orientações adicionais para o copilot (recomendado)" |
| Tom de voz | select | Não | "Copilot voice tone (optional)" |

### Mensagem de ativação

- "Para começar a utilizar o copilot, faça o upload de uma base de conhecimento."
- "Upload de base de conhecimento é obrigatório"

---

## 4. Base de Conhecimento

### Formato de entrada

- Documento: provavelmente PDF, DOCX, TXT ou similar
- Upload: arrastável ou seletor de arquivo
- Limite de tamanho: não confirmado
- Limite de documentos: não confirmado

### Conteúdo indexado

Padrão de search em base:
- Título do documento
- Conteúdo textual
- Metadados (data, autor, etc. — não confirmado)

### Relatório de base de conhecimento

Rota: `/copilot/report/knowledge-base?$skip=`

Campos:
- Nome do documento
- Data de upload
- Tamanho (não confirmado)
- Status de indexação (processado, pendente, erro)
- Número de referências (quantas vezes foi citado em sugestões)
- Ação: **deletar documento**

### "Oportunidade de melhoria"

Análise sugerida:
- "Oportunidade de melhoria da base do Copilot" — documentos não utilizados em sugestões
- "Copilot Knowledge Base Improvement Opportunity" — na UI
- Significado: identifica gaps na base de conhecimento

---

## 5. Parâmetros de IA

### Temperatura (Criatividade)

- **Escala**: 0 (preciso) até 1 (criativo)
- **Baixa temperatura**: respostas mais precisas, menos aleatórias
- **Alta temperatura**: respostas mais variadas, risco de sair do contexto
- Mensagem: "Quanto maior a temperatura, mais chances tem o seu copilot de sugerir respostas aleatórias e fora do contexto da sua base de conhecimento. Quanto menor a temperatura mais precisas serão as respostas."

### Orientações adicionais

- Campo: textarea livre
- Exemplos sugeridos: "Não mencionar concorrentes", "Validar reforço positivo"
- Tamanho: não confirmado (tipicamente até 500 chars)

### Perfil do copiloto

Não confirmado o que cada perfil contém, mas existem variações:
- Pode incluir tom (formal, informal, técnico, amigável)
- Pode incluir personas (atendimento ao cliente, suporte técnico, vendas)
- Padrão: não confirmado qual é default

---

## 6. Relatórios de Copiloto

### Relatório — Sessões (Chat Sessions)

Rota: `/copilot/report/sessions?year=`

Medição:
- "Acompanhe o número de sessões de conversa em que o Copilot foi utilizado ao longo do mês"
- "Chat sessions with Copilot" — contagem
- Período: filtrável por ano (parâmetro `year=`)
- Métrica adicional: tickets resolvidos via copiloto

Campos esperados:
- Data
- Atendente
- Cliente
- Fila
- Duração
- Copiloto foi usado? (sim/não)
- Sugestão foi aceita? (sim/não/parcial)

### Relatório — Sugestões (Suggestion Report)

Rota: `/copilot/report/suggestion?beginDate=`

Conteúdo:
- "List of suggested suggestions and responses sent using the Copilot"
- "Lista das sugestões sugeridas e das respostas enviadas com o uso do Copilot"

Campos:
- Timestamp
- Atendente
- Sugestão proposta (texto)
- Resposta enviada (texto)
- Match? (se resposta seguiu sugestão ou foi alterada)

### Relatório — Transcrição (Transcription Report)

Rota: `/copilot/report/transcription?beginDate=`

Conteúdo:
- Áudio de chamadas/interações transcritas
- Qual atendente usava transcrição
- Duração de transcrição
- Acurácia (não confirmado)

Campos:
- Timestamp
- Atendente
- Duração do áudio
- Texto transcrito
- Idioma (se multi-língua)
- Status (sucesso, erro)

### Relatório — Resumo (Summary Report)

Rota: `/copilot/report/summary?beginDate=`

Resumo consolidado:
- "Número total de agentes con copiloto activo" — count
- "Sessões de conversa com Copilot" — volume
- "Tickets resolvidos através do copiloto" — conversão
- Período: últimos 7 dias (padrão)
  - "Os dados deste relatório abrangem os últimos 7 dias de uso do Copilot"

### Relatório — Resumo Consolidado (Consolidated Summary)

Rota: `/copilot/report/summary/consolidated?beginDate=`

Comparação de performance:
- "Average response time WITH Copilot" — tempo médio com copiloto
- "Average service time WITHOUT Copilot" — tempo médio sem copiloto (controle)
- Diferença: (sem - com) = ganho de tempo (calculado)

---

## 7. Transcrição de áudio

### Funcionalidade de transcrição

Dentro do Blip Copilot, há suporte para:
- **Transcrição em tempo real** — converte áudio da chamada em texto
- **Integração com atendimento** — o atendente vê o texto enquanto fala com cliente
- **Sugestões baseadas em áudio** — copiloto pode sugerir respostas ouvindo a conversa

### Métricas de transcrição

Rota: `/copilot/report/transcription?beginDate=`

Dados:
- "Atendentes utilizando transcrição" — count de users com feature ativa
- "Agentes que usan la transcripción" — idem em espanhol
- Performance:
  - "Aquí puedes ver las métricas de rendimiento de la transcripción de audio por Copilot"
  - Duração total de áudio transcrito
  - Acurácia de transcrição (não confirmado)
  - Idiomas suportados (não confirmado)

### Configuração de transcrição

Não confirmado, mas esperado:
- Ativar/desativar por atendente
- Idioma de transcrição
- Envio de áudio a servidor (privacidade)

---

## 8. Integração com Desk (Atendimento)

### Uso durante atendimento

1. Atendente atende cliente em Desk
2. Painel do Copiloto aparece ao lado (ou em aba)
3. Copiloto analisa mensagem do cliente
4. Sugere resposta baseada em base de conhecimento
5. Atendente pode: aceitar, modificar, rejeitar sugestão
6. Feedback registrado para melhorias

### Bloqueios e regras

- **Fila bloqueada**: se fila não está vinculada ao copiloto, sugestões não aparecem
  - Flag: `isInCopilot` (documentos) / `isEnableInCopilot` (copiloto)
- **Base de conhecimento vazia**: "Para começar a utilizar o copilot, faça o upload de uma base de conhecimento"
  - Copiloto fica inativo até upload
- **Copiloto desabilitado**: toggle em `/copilot/enable` desativa globalmente

### Atalhos/Controles do atendente

Não confirmado exatamente, mas esperado:
- Botão "Usar sugestão" — aceita sugestão do copiloto
- Botão "Editar" — modifica antes de enviar
- Botão "Rejeitar" — descarta sugestão
- Botão "Regenerar" — pede nova sugestão (não confirmado)

---

## 9. Limites, timeouts e intervals

### Limites de dados

| Parâmetro | Valor | Contexto |
|---|---|---|
| Tamanho de documento | Não confirmado | máximo para upload de base |
| Número de documentos | Não confirmado | limite de arquivos na base |
| Histórico de relatórios | 7 dias (padrão) | "Os dados deste relatório abrangem os últimos 7 dias" |
| Retenção de sugestões | Não confirmado | quanto tempo logs são mantidos |
| Lag de transcrição | Não confirmado | delay entre áudio e texto |

### Timeouts de processamento

- Upload de documento: não confirmado
- Indexação de documento: não confirmado
- Geração de sugestão: tipicamente <2 segundos (esperado para UX)
- Processamento de relatório: pode ser async/batch

---

## 10. Mensagens de uso e orientação

### Onboarding

- "Escolha um perfil para seu copiloto" — selector visual
- "Para começar a utilizar o copilot, faça o upload de uma base de conhecimento." — chamada de ação
- "Nessa página você pode configurar o copiloto da sua empresa." — intro

### Guias de melhoria

- "Observe as melhorias do seu copiloto nas sugestões das suas respostas."
- "Oportunidade de melhoria da base do Copilot" — dados subutilizados
- "Copilot Knowledge Base Improvement Opportunity" — idem em inglês

### Status de feature

- "Em uso no copilot" / "En uso en copiloto" — documento está sendo usado
- "In use in copilot" — idem em inglês

---

## 11. Relatórios e análise de qualidade

### Configuração de Qualidade

Rota: `/copilot/quality-analysis/configuration`

Parâmetros (não confirmado em detalhe):
- Métrica de qualidade de sugestão
- Scoring de aceitação
- Benchmark vs. atendentes sem copiloto

### Tipos de análise

- **Performance com/sem copiloto**: comparação de tempo médio de resposta
- **Taxa de aceitação de sugestões**: % de sugestões que atendente usou
- **Melhoria de satisfação**: CSAT com vs. sem copiloto
- **Documentos mais usados**: quais arquivos geram mais sugestões

---

## 12. Permissões e controle de acesso

Baseado em padrões de Blip:

- **Visualizar Copiloto** — padrão dentro de Desk
- **Configurar Copiloto** — requer permissão de admin
- **Upload de base de conhecimento** — requer permissão de admin
- **Ver relatórios de Copiloto** — pode exigir permissão de supervisor/manager
- **Usar Copiloto como atendente** — padrão (habilitado por fila)
- **Transcrição** — pode exigir permissão separada

---

## 13. Fluxo de navegação

### Do Desk para Copiloto

1. Atendente abre Desk (módulo Atendimento)
2. Painel de Copiloto carrega automaticamente (se ativo)
3. Durante atendimento, Copiloto sugere respostas em tempo real

### Do Home/Portal para Relatórios

1. Ir para Desk → Copiloto (ou acesso direto se integrado)
2. Abrir aba/menu "Relatórios"
3. Selecionar tipo de relatório (Sessões, Sugestões, Transcrição, etc.)
4. Filtrar por data (combi período: últimos 7 dias, últimos 30, etc.)
5. Visualizar gráficos/tabelas
6. Export (CSV, PDF) — não confirmado qual formato

---

## 14. Mensagens de erro e bloqueio

### Erros de configuração

- "Base de conhecimento não foi carregada" — bloqueio de ativação
- "Fila não selecionada" — aviso (usará contexto do bot)
- "Erro ao processar documento" — falha no upload
- "Documento excede tamanho máximo" — limitação de arquivo

### Erros de runtime

- "Copiloto indisponível no momento" — downtime
- "Falha ao gerar sugestão" — erro interno
- "Base de conhecimento vazia ou inválida" — nenhum documento processado

### Warnings

- "Base de conhecimento não está sendo utilizada" — oportunidade de melhoria
- "Transcrição desabilitada para esta fila" — feature não ativa

---

## 15. Diferenças vs. documentos anteriores

**Novidade:** Nenhum documento anterior cobria Copiloto especificamente.

- **blip-portal-atendimento.md** — focava em Desk (atendimento manual)
- **blip-portal-agentes-ia.md** — focava em Skills/Agentes IA
- **blip-portal-home.md** — focava em home/entry point

**Relação:** Copiloto é um **sub-módulo de Desk**, mas funciona de forma independente (pode estar ativo/inativo por fila).

---

## 16. Notas de método

- Arquivo explorado: `blip-copilot-mfe/latest/main.js` (3.1 MB)
- Técnica: busca por rotas, strings de UI em português/espanhol/inglês, padrões de "report"
- Limitações:
  - Sem acesso a DOM vivo
  - UI visual não capturada
  - Alguns campos de configuração inferidos de nomes de rota/var
  - Limites numéricos não disponíveis em bundle compilado
- Não confirmado:
  - Layout visual de painel de copiloto
  - Exato algoritmo de ranking de sugestões
  - Idiomas suportados pela transcrição
  - Integração com APIs de transcrição (Google Cloud Speech, Azure Speech, etc.)
  - Privacidade/criptografia de áudio

**O que não é escopo (YAGNI):**
- Documentação técnica de embedding de modelo de IA
- Guia de treinamento de modelos customizados
- Especificação de prompt engineering
- Detalhes de segurança/compliance (LGPD, GDPR, HIPAA)

**Confirmado neste documento:**
- 11+ rotas de relatório
- 7+ campos de configuração
- Conceito de temperatura/criatividade de IA
- Integração com base de conhecimento
- Transcrição de áudio como feature
- Análise de qualidade e melhoria contínua

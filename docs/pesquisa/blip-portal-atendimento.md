# Portal Blip — Módulo Atendimento (Desk)

Levantamento complementar do módulo **Atendimento** (Blip Desk) baseado em arquivos capturados da organização **Supernova** (app "AUVP Capital"), **somente leitura**.

**Fontes exploradas:**
- `supernova.blip.ai/portal.js` (20.3 MB) — bundle principal
- `portalmfe.blip.ai/beagle/portal-fragment-desk-mfe/latest/main.js` (10.8 MB) — módulo específico de Atendimento
- `portalmfe.blip.ai/beagle/portal-fragment-desk-mfe/latest/settings.json` — configuração

**Complementa:** blip-telas-atendimento.md (documento 14 KB anterior, focado em medidas de layout)

---

## 1. Estrutura de navegação do módulo (completa)

Idem ao blip-telas-atendimento.md, reproduzido para referência:

```
Monitoramento              ← item de 1º nível (operação)
Histórico                  ← item de 1º nível (operação)
├ Relatórios
│  ├ Atendimento
│  ├ Satisfação
│  ├ Calls
│  └ Vendas
├ Comunicação
│  ├ Respostas prontas
│  └ Modelos de mensagens
├ Regras
│  ├ Atendimento
│  ├ SLA
│  └ Horários
├ Atendentes
│  ├ Gestão de atendentes
│  ├ Filas de atendimento
│  └ Pausas personalizadas
└ Preferências
   ├ Configurações gerais
   └ Canais de atendimento
```

**Filosofia:** Dois itens de operação no topo (Monitoramento, Histórico); três grupos de configuração embaixo (Regras, Atendentes, Preferências).

---

## 2. Telas e roteamento

### Rotas descobertas no código

| Tela | Rota | Módulo |
|---|---|---|
| Monitoramento | `/monitoring` | Métricas em tempo real |
| Histórico | `/history` | Lista de tickets (histórico) |
| Atendimento | `/reports/attendance` | Dashboard de atendimento |
| Pesquisa (CSAT) | `/reports/survey` | Dashboard de satisfação |
| Chamadas | `/reports/calls` | Dashboard de chamadas (integração com telefonia) |
| Vendas | `/reports/sales` | Dashboard de vendas |
| Respostas prontas | `/communication/quick-responses` | CRUD de respostas |
| Modelos de mensagens | `/communication/message-templates` | CRUD de templates |
| Regras de atendimento | `/rules/attendance` | Regras de roteamento/SLA |
| SLA | `/rules/sla` | Configuração de SLA |
| Horários de atendimento | `/rules/attendance-hours` | Configuração de jornada |
| Gestão de atendentes | `/team/attendants` | CRUD de usuários |
| Filas de atendimento | `/team/queues` | CRUD de filas |
| Pausas personalizadas | `/team/breaks` | CRUD de tipos de pausa |
| Configurações gerais | `/general-settings` | Configurações da conta |
| Canais de atendimento | `/preferences/channels` | Integração com canais (WhatsApp, etc) |

### Rota específica de Copilot (dentro de Desk)

- `/blip-copilot` — acessado como sub-rota dentro de Desk (ex.: `/application/detail/{id}/attendance/desk/blip-copilot`)

---

## 3. Campos principais por tela

### Histórico (lista de tickets)

Campos visíveis em cartão (conforme blip-telas-atendimento.md):

| Campo | Rótulo | Tipo | Notas |
|---|---|---|---|
| ticket | Ticket | ID | número sequencial do atendimento |
| atendente | Atendente | usuario.name | nome do agente que respondeu |
| contato | Contato | usuario.name | cliente final |
| tempoEspera | Tempo de espera | duração | quanto o cliente esperou em fila |
| tempoResosta1 | Tempo de 1ª resposta | duração | tempo até 1º envio de msg |
| tempoAtendimento | Tempo de atendimento | duração | tempo total de conversa |

Ação: **seta de detalhe** (→) para abrir ticket completo

### Monitoramento (em tempo real)

Campos que definem status:

| Campo | Valores | Padrão |
|---|---|---|
| statusAtendente | online, pausado, ausente, offline | configurável |
| statusTicket | novo, em atendimento, aguardando resposta, fechado, reabertoNão confirmado | ativo |
| statusCliente | ativo, inativo, bloqueado | Não confirmado |

Métrica: "Clientes únicos contatados"

---

## 4. Filtros e busca

### Filtros rápidos (Quick Filters)

Pré-configurados na UI:

- "Meus tickets" (tickets atribuídos ao agente logado)
- "Abertos" (status = aberto)
- "Fechados" (status = fechado)
- (Outros não confirmados)

### Filtros avançados (Advanced Filters)

- **Filtro por Canais** — seleciona WhatsApp, Facebook, SMS, etc.
- **Filtro por Atendentes** — múltipla seleção
- **Filtro por Filas** — múltipla seleção
- **Filtro por Tags** — rótulos atribuídos a tickets
- **Filtro por Período** — data início e fim (limite de 5 anos: `startDateFilterLimit: 1825` dias)
- **Filtro por Período (padrão)** — "últimos 90 dias" como default

**Nota:** "Os filtros de Canais, Atendentes, Filas e Tags não se aplicam à tabela abaixo" — aviso quando esses filtros são muito restritivos ou quando a view baixa ignora certos filtros

### Filtros salvos (Saved Filters)

- Nome obrigatório: "O nome do filtro é obrigatório"
- Limitação: "Já existe um filtro com esse nome" — nomes únicos
- Salvar filter atual: "Criar Filtro Salvo com estes parâmetros"
- Edição: "Edição de filtro salvo" — modal para ajustar
- Exclusão: "Tem certeza que deseja excluir este filtro?"
- Mensagem de sucesso: "Filtro salvo com sucesso!"
- Mensagem de erro: "Filtro foi excluído!"

### Aplicação de filtros

- "Aplicar filtro" — botão para executar filtro
- "Criar e aplicar filtro" — salvar e aplicar em um passo
- "Redefinir filtros" — limpar todos e retornar ao padrão
- Mensagem: "Filtro aplicado com sucesso!"

### Comportamento quando filtro produz zero resultados

- "Não encontramos dados com os filtros aplicados. Tente ajustar os filtros ou redefinir a busca para ver outros resultados."
- Sugestão: reduzir scope de filtro ou resetar

---

## 5. Ordenação e paginação

### Ordenação

- Rótulo: "Ordenar dados" / "Ordenar datos" (português/espanhol)
- Não confirmado: quais colunas são ordenáveis, ordem ascendente/descendente

### Paginação

- Parâmetro config: `startDateFilterLimit: 1825` — determina range máximo de dias em um filtro
- Campos relacionados:
  - `Linhas por página` — selector de quantidade de registros por página
  - `Resultados por página` — alias
  - Padrão: não confirmado (tipicamente 10–20)
  - Máximo: não confirmado

---

## 6. Blocos de configuração (Regras, Atendentes, Preferências)

### Filas de atendimento

Campo principal: **nome da fila** (ex.: "Fila comercial", "Fila suporte")

- Criação: "Fila salva com sucesso!"
- Exclusão: "Fila excluída com sucesso!"
- Limitação: "Filas não podem ser alteradas enquanto houver um campo condicional vinculado. Neste caso, ele herdará automaticamente as tags do campo condicional informado acima."
- Nota: "Horário regular é aquele que se aplica para toda sua operação. Filas sem horários específicos definidos, irão funcionar no horário regular."

### Atendentes

- Campo: **nome do atendente**
- Aviso: "Abaixo estão listados os atendentes cadastrados no contrato. Caso o atendente que procura não esteja na lista, verifique sua disponibilidade na página de..."
- Limitação: "Você pode adicionar somente atendentes registrados no contrato."

### Regras (Atendimento, SLA, Horários)

Cartão padrão contém:

- **Nome da Regra** (campo)
- **Fila** (campo)
- Ações: editar, excluir, **toggle/interruptor** (ativar/desativar)

---

## 7. Limites, timeouts e intervalos

### Limites de entrada de dados

| Campo | Limite | Tipo | Significado |
|---|---|---|---|
| Nome de regra/filtro | 100 caracteres | maxLength | identificador do objeto |
| Descrição | 500 caracteres | maxLength | metadados |
| Nome de fila | 50 caracteres | maxLength | identificador da fila |
| Limite de atendentes | 30 | max | máximo de atendentes por fila |
| Limite de domínios (email) | 100 | max | máximo de domínios whitelistados |
| Minlength (nome campo) | 1 | minLength | não pode estar vazio |
| Linhas por página | mín. 1, máx. (não confirmado) | range | paginação |

### Timeouts e delays

| Parâmetro | Valor | Contexto |
|---|---|---|
| `idleTimeout` | 1 segundo | debounce de ações |
| `finalTimeout` | 3 segundos | timeout de operação terminal |
| `childSpanTimeout` | 15 segundos | timeout de child spans (logs) |
| `delay` (geral) | 200ms | debounce padrão |
| `scrollTimeout` | 300ms | debounce de scroll |
| `interval` (polling) | 5 segundos | check de novo dados |
| `SESSION_NEGOTIATION_TIMEOUT` | 16 segundos | negociação de sessão |
| Filtro por período | máx. 1825 dias (5 anos) | limite histórico |

### Limites de atividade

Extraído de strings "Limite a quantidade de...":

| Métrica | Limite | Período | Notas |
|---|---|---|---|
| Mensagens ativas por atendente | (não confirmado) | 24 horas | limite de agendamentos |
| Distribuição automática de tickets | máximo configurável | por atendente | "Defina o número máximo de atendimentos distribuídos automaticamente por atendente" |

---

## 8. Mensagens de erro, aviso e bloqueio

### Erros de carregamento

- "Houve um erro ao carregar essa página"
- "Ocorreu um erro ao carregar essa página"
- "Não conseguimos exibir esta página no momento. Tente novamente em alguns instantes ou atualize a página."
- "Não pudemos mostrar esta página em este momento. Inténtalo de nuevo en unos momentos o actualiza la página."

### Erros de filtro e busca

- "Não foi possível classificar a prioridade do ticket. Atualize a página para tentar novamente"
- "No ha sido posible clasificar la prioridad del ticket. Actualice la página para volver a intentarlo"
- "Não encontramos dados com os filtros aplicados. Tente ajustar os filtros ou redefinir a busca para ver outros resultados."
- "No hemos encontrado ningún dato con los filtros aplicados. Intenta ajustar los filtros o redefinir la búsqueda para ver otros resultados."

### Timeouts de busca com muitos dados

- "Não conseguimos carregar as informações no tempo esperado. Isso pode acontecer quando há muitos dados para processar ou em situações de instabilidade do sistema. Ajuste os filtros para reduzir o volume de dados e facilitar a busca ou tente novamente."
- Sugestão: reduzir filtro, tentar novamente

### Validações de entrada

- "Esse campo deve ter no mínimo {0} caracteres."
- "Limite de {N} caracteres"
- "O nome do filtro é obrigatório"

---

## 9. Fluxos de navegação e permissões

### Bloqueios por falta de permissão

- Flag: `hasDeskWritePermission` — controla acesso a edit/delete
- Condição bloqueada: `!$ctrl.hasDeskWritePermission` → botões de edição desabilitados
- Mensagem: (implícita via UI desabilitada)

### Redirecionamentos condicionais

- `isDeskState` — se bloco é de transbordo (Desk)
- `isDeskStateOutdated` — se configuração está desatualizada
- `isDeskSalesforceIntegração` — se Salesforce está integrado
- Ação: `goToStateAndTrack('Desk')` — rastrear navegação para Desk

### Integração com Builder

- Bloco "Atendimento humano" — no Builder, cria transbordo para Desk
- Padrão: `sendDeskState` → redireciona contato para atendente
- Condição de saída: pode verificar `NoAgentAvailable` ou `OutOfAttendanceHour`

---

## 10. Diferenças e confirmações vs. documentos anteriores

### vs. blip-telas-atendimento.md

**Anterior** (14 KB):
- Focava em **medidas de layout**: altura de cartões, cores, tipografia
- Estrutura de telas e componentes visuais

**Este documento** (novo):
- Focava em **funcionalidade**: campos, filtros, limites, fluxos
- Roteamento, permissões, mensagens de erro

**Complementar:** Juntos cobrem interface + funcionalidade

### vs. blip-portal-telas.md

**Anterior** (25 KB):
- Focava em **Builder** (editor de fluxo, blocos, publicação)
- Não cobria Desk

**Este documento:**
- Focava em **Desk/Atendimento** (operação, relatórios)
- Complementa o anterior

### Novas informações deste documento

- Rotas completas de módulo (9 telas)
- Filtros salvos e avançados (não documentado antes)
- Limites numéricos (timeouts, max chars, dias de filtro)
- Mensagens de erro/bloqueio em português
- Fluxo de integração com Builder (transbordo para Desk)

---

## 11. Notas de método

- Arquivos explorados:
  - `supernova.blip.ai/portal.js` (20.3 MB)
  - `portal-fragment-desk-mfe/latest/main.js` (10.8 MB)
  - `portal-fragment-desk-mfe/latest/settings.json` (1 KB)
- Técnica: busca por padrões em português, nomes de rota, constantes de limite
- Limitações:
  - Sem acesso a DOM vivo (captura estática)
  - Alguns limites e padrões inferidos de código compilado
  - Flags de permissão confirmadas por nome, não por UI visual
- Não confirmado: comportamento visual de menus, cores exatas, animações

**O que não é escopo deste documento (YAGNI):**
- CSS e layout (já em blip-telas-atendimento.md)
- Medidas de componentes
- Paleta de cores (já em blip-design-system.md)

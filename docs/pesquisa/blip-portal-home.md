# Portal Blip — Página Inicial (Home)

Levantamento da página inicial (Home/Dashboard) do Portal Blip, extraído de arquivo capturado na sessão da organização **Supernova** (app "AUVP Capital"), **somente leitura**.

**Fontes exploradas:**
- `supernova.blip.ai/portal.js` (20.3 MB) — bundle principal da aplicação

---

## 1. Estrutura geral da página inicial

A Home atua como **painel de controle central** (BotHome), exibindo resumo da operação do aplicativo e oferecendo atalhos para os principais módulos.

### Componentes visíveis na home

- **Título de tela**: "Home" ou "Início" (24px, peso 400, conforme padrão de títulos do Blip)
- **Área de dashboards rápidos**: cards com métricas resumidas
  - Dashboard de tempo real (se habilitado)
  - Dashboard de chamadas (desks-callsDashboard)
  - Dashboard de pesquisa de satisfação (desk-surveyDashboard)
  - Dashboard de vendas (desk-salesDashboard)
  - Recomendação de plugins (BlipStore) — aparece quando extensões estão disponíveis
- **Atalhos para módulos principais**: navegação para Atendimento, Análise, Growth, Canais, Relatórios
- **Cartões de recomendação**: sugestões de ferramentas e extensões (se habilitado `isBlipStoreHomeBotPluginsRecommendationServicePageEnabled`)

### Páginas e rotas conhecidas da home

- `PortalHome` — rota principal da home
- `PortalHomeAdditional` — conteúdo adicional (não confirmado via UI)
- `BotHome` — alias da home (ApplicationHome)

### Regras de navegação

- Clique no título de uma seção (ex.: "Atendimento") navega para essa área
- Cliques em cards de metátricas abrem os dashboards específicos
- Menu lateral esquerdo oferece navegação estruturada por grupo (Monitoramento, Relatórios, Comunicação, Regras, Atendentes, Preferências)

---

## 2. Blocos de conteúdo e campos exibidos

### Métricas de resumo (quando habilitadas)

Baseado em análise de strings da aplicação, a home pode exibir:

- **Atendimentos** — total do dia/período
- **Clientes únicos contatados** — contagem
- **Qualidade dos Atendimentos** — métrica agregada
- **Qualidade dos Atendimentos por Atendente** — desagregação
- **Total de Solicitações** — contagem geral
- **Total de Solicitações Atendidas** — subset do total
- **Total de Solicitações Não Atendidas** — subset do total
- **Avaliações** — contagem de pesquisas respondidas
- **Causa das Solicitações Não Atendidas** — breakdown categorizado

### Mensagens de estado

- "{{application.name}}" — interpolação do nome da aplicação
- "Carregando..." — estado de espera
- Indicador visual de salvamento automático: "Salvo" / "Salvando…"

### Ocultar/mostrar métricas

Flag `isHidingHomeMetrics` — quando ativo, oculta o painel de métricas (verificado: `$ctrl.nUsers != 0 && !$ctrl.isHidingHomeMetrics`)

---

## 3. Navegação e permissões

### Acessos de telas principais a partir da home

Cada módulo abaixo tem rota e flag de habilitação:

| Módulo | Rota | Flag de ativação |
|---|---|---|
| Atendimento (Desk) | `/application/detail/{id}/attendance/desk/` | (padrão, sem flag) |
| Análise | `/application/detail/{id}/analysis/` | (padrão) |
| Relatórios | `/application/detail/{id}/reports/` | (padrão) |
| Growth | `/application/detail/{id}/growth/` | (padrão) |
| Canais | `/application/detail/{id}/channels/` | (padrão) |
| Builder | `/templates/builder/` | `isBuilderAccessible` |
| Dashboard de Atendimento | (integrado) | `isDeskCallsDashboardEnabled` |
| Dashboard de Pesquisa | (integrado) | `isSurveyDashboardEnabled` |
| Dashboard de Vendas | (integrado) | `isSalesDashboardEnabled` |

### Paginação na home

Se aplicação tem **múltiplas aplicações**, a home pode listar aplicações com paginação:

- Flag: `isPaginationHomeInApplication` — quando ativo, mostra controles de paginação
- Condição de exibição: `$ctrl.applications.length > 0 && $ctrl.showPagination`
- Não confirmado: tamanho de página, número de aplicações por página

---

## 4. Comportamentos e fluxos

### Fullscreen (tela cheia) de dashboards

- Botão/ação: `requestDashboardSummaryFullScreen(true)` — expandir dashboard para tela cheia
- Saída: `exitDashboardSummaryFullScreen()` — retornar da tela cheia para home
- Efeito: card de resumo toma a tela inteira (não confirmado visualmente, inferido pelo nome)

### Atualização manual de dados

- Ação: `updateDashboard()` — atualiza métricas exibidas
- Sem confirmação de intervalo automático (pode ser manual, pode ser por debounce)

### Redirecionamento para módulos específicos

- `goToStateAndTrack('Desk')` — rastreia navegação e vai para Desk/Atendimento
- Útil para entender fluxos de funil e abandono

---

## 5. Limites conhecidos, timeouts e intervalos

Extraído de análise de constantes e configurações:

| Parâmetro | Valor | Significado |
|---|---|---|
| `startDateFilterLimit` (desk-mfe) | 1825 dias | limite de 5 anos para filtros por data em relatórios |
| Intervalo de atualização de dashboard | Não confirmado | pode ser debounce, polling ou manual |
| Timeout de carregamento de extensões | Não confirmado | BlipStore pode ter timeout ao buscar plugins |

---

## 6. Mensagens de erro e bloqueio

### Bloqueios conhecidos (inferidos de condições)

- **Sem aplicações**: se `$ctrl.applications.length === 0`, home pode redirecionar ou exibir mensagem vazia
- **Sem permissão em módulo**: flags de habilitação específicas bloqueiam acesso (ex.: `isDeskCallsDashboardEnabled === false` → Dashboard de Chamadas não aparece)
- **Dados indisponíveis**: mensagem "Carregando..." durante fetchs de dashboard

### Avisos de sistema

- **Router sem dados de atendimento**: "não é possível gerar relatórios de atendimento para um router ou chatbot sem atendimento ativo" (aplicável a Routers; limitação de método durante levantamento)

---

## 7. Diferenças e confirmações vs. documento anterior

**blip-portal-telas.md** (documento 25 KB já existente):
- Focava em **Builder** (editor de fluxo), não em Home
- Este documento complementa com a página inicial do portal

**blip-telas-atendimento.md** (documento 14 KB já existente):
- Focava em **Atendimento** (Desk), módulo específico
- Este documento é o entry point que precede a navegação para Desk

**Novidades deste documento:**
- Estrutura de home com blocos de métrica
- Flags de habilitação por dashboard
- Regras de paginação (confirmado: `isPaginationHomeInApplication`)
- Fluxo de fullscreen para dashboards (não confirmado anterior)

---

## 8. Notas de método

- Arquivo explorado: `supernova.blip.ai/portal.js` (20.3 MB)
- Técnica: busca por padrões de tradução em português (i18n), nomes de rota, flags de features
- Limitações: sem acesso ao DOM vivo (captura estática); algumas flags confirmadas por nome, não por UI visual
- Não confirmado: layout visual de cards de métrica, altura de áreas, cores específicas

**Dados não coletados (YAGNI):** CSS específico, medidas de layout, cores exatas (já coberto em blip-telas-atendimento.md e blip-design-system.md)

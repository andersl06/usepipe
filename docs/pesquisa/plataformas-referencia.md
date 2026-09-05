# Levantamento de plataformas de referência (via navegador, 2026-09-05)

## 1. Blip Portal — app de GESTÃO (supernova.blip.ai)

Nav superior: Builder · Atendimento · Análise · Growth · Canais · (…) → Integrações, Configurações, Equipe.
Rotas: /application/detail/<bot>/attendance/desk/... | /analytics | /growth | /channels | /integrations | /configurations | /team

### Módulo "Atendimento" (menu lateral)
- **Monitoramento** (/attendance/desk/monitoring)
- **Histórico**
- **Relatórios**: Atendimento · Satisfação (/survey-dashboard) · Calls (/calls-dashboard) · Vendas
- **Comunicação**
- **Regras**: Atendimento (/rules) · SLA · Horários
- **Atendentes**
- **Preferências**
- Rodapé: link "blipdesk" (abre o app do atendente em outra origem)

### Tela de Monitoramento (o coração da gestão)
Filtros rápidos: Filas | Atendentes | Contato | Status do atendente | Filtros avançados.

Card "Atendimentos em tempo real":
- Na fila | Tempo máximo na fila | Tempo máximo até 1ª resposta | Em atendimento | Média de tickets por atendente

Card "Status dos atendentes": Online | Pausa | Invisível

Card "Atendimento hoje":
- Tempo médio de espera | Tempo médio de resposta | Tempo médio até 1ª resposta | Tempo médio de atendimento

Card "Status dos tickets hoje": Perdidos | Abandonados | Finalizados | Fechados

"Monitoramento detalhado" — abas: Atribuído/Em andamento · Aguardando atendimento · Atendentes · Filas · Tags.
Colunas: Tempo na fila · Tempo de 1ª resposta · Tempo de atendimento · Ticket · Contato · Fila · Atendente · Ações
(ações por linha: transferir, abrir conversa, menu)

### Relatório de Satisfação
Dados gerais: Média geral de satisfação · Total de tickets fechados · Total de respostas · Taxa de resposta.
Gráficos: pizza (Sem resposta / Promotor / Detrator / Neutro) + comparativo por Atendente (barras).

### Regras de atendimento
Lista paginada (26 regras). Cada regra: Nome da Regra → Fila, com toggle ativo/inativo e editar/excluir.
Filas reais observadas: Comercial, Suporte, Banking, FOPA, Teste blip.
Também há Regras de SLA e Regras de Horários (separadas).

## 2. Blip Desk — app do ATENDENTE (supernova.desk.blip.ai)

Layout radicalmente enxuto, 3 colunas + rail de ícones:
- **Rail à esquerda (6 ícones)**: Atendimentos (balão) · Mensagem ativa/disparo (avião) · Respostas rápidas · Contatos · Tickets/Tags · (rodapé) Ajuda · Configurações · Avatar com status
- **Coluna 1 — "Atendimentos"**: seletor de visão ("Lista"), controle de status do agente (Online / Pausa / Invisível) com CTA "Ficar Online", busca por nome ou telefone.
  - Se invisível: "Você precisa ficar online para atender um novo cliente"
- **Coluna 2 — conversa**
- **Coluna 3 — painel do contato/ticket**

CHAVE DA ARQUITETURA: o Desk NÃO tem relatórios, nem regras, nem configuração de filas.
Tudo isso vive no app de Gestão. Domínios/apps separados, mesma base de dados.

## 3. 2clix / Qualidade (auvp.qualida.de) — MONITORIA

Módulos (rail lateral): AVALIAÇÕES · COMUNICAÇÃO · DIAGNÓSTICOS · IA · LAUDOS · SSO

### AVALIAÇÕES
Avaliador · Painéis · Feedback · Auditoria · Contestações · Calibração · Relatórios ·
Dimensionamento · Coach · Fila de Contato · Administrador

Painel de Indicadores filtrado por: Período (mês) · Negócio · Campanha · Superior

### Módulo IA ("Interações")
- Amostras Monitoria Automatizada
- Amostras Insights
- Erros ao Gravar Avaliação
- Meu Consumo  (metering de consumo de IA)
- Gestão de Modelos e Tags
- Gestão de Conhecimento

### Catálogo de Relatórios (≈70) — /QUALIDADE/relats/relatoriobase.aspx?cod=N
Comentários de avaliações (1036) · Exportar Avaliações-Analítico (27) · Exportar-Extração de base (41) ·
**Report Semanal Consolidado (1059)** · Analítico de avaliações (27) · Conceito x Campanha (592) ·
Avaliações por usuário (28) · Lista reciclagem (38) · Ofensores Avaliações (40) ·
Ofensores Média Por Indicadores (869) · Reincidentes (132) · Ofensores consolidado (474) ·
Analítico Superiores (309) · Média Negócio e Campanha (357) · Evolução de conceito (359) ·
Visualizações de avaliação (526) · Acessos de avaliações (628) · Avaliações de usuários por campanhas (300) ·
Sinalizações por Avaliado (943) · Relatório de Detalhes (945) · Tipo de avaliação (304) · Resumo Conceitos (351) ·
Não Conformidades-Trimestral (1069) · Avaliações com Nota Zerada (29) · Sintético por situação (352) ·
Sintético (Ofensores) (142) · Sintético avaliador (43) · Média nota por data de admissão (922) ·
Quarentena (42) · Diário (134) · Extração de base (41) · Extração base resumida (214) ·
Detalhamento de respostas (224) · Tempo avaliação (590) · Relatório Comparativo (655) ·
Ofensores por Indicador (664) · Extração de Calibração (639) · Tags analítico (578) ·
Ofensores Por Critério (976) · Relatório Aderência (814) · Médias por indicadores (580) ·
Nota Média x Formulário (617) · Nota Média x Avaliador (621) · Atividades analítico (629) ·
Sintético grupos (111) · Relatórios Agendados (981) · Relatório de curadorias (1001) ·
Importação de Avaliação (930) · Avaliação x Nota indicadores (862) · Itens de cabeçalho (644) ·
Detalhes de Formulário (828) · Comparativo Feedback Campanha (857) · Usuários por processo (367) ·
Avaliações dependentes (368) · Quartil (370) · Nuvem tags (393) · Média dos grupos (396) ·
Sinalizações por Avaliação (600) · Ofensores por Avaliado (603) · Itens de Formulário (668) ·
Acompanhamento Superiores (581) · Conformidade por grupos (582) · Conformidade por critérios (583) ·
Superiores (572) · Avaliados dimensionados (574) · Dependentes com ofensores (471) ·
Formulários Cadastrados (532) · Ofensores por superior (535) · (+ alguns truncados)

### Leitura do catálogo (o que importa para o Pipe)
O valor não são os 70 relatórios — é o MODELO DE DADOS por trás deles:
formulário de avaliação (grupos → critérios/indicadores → pesos) ×
avaliação (avaliado, avaliador, campanha, nota, conceito, tags, sinalizações) ×
hierarquia (avaliado → superior → grupo → campanha → negócio) ×
ciclo de vida (avaliação → feedback → contestação → calibração → coach/reciclagem).
Com esse modelo, quase todos os 70 relatórios são recortes de 4-5 consultas.

## 4. Blip Community (community.blip.ai) — conteúdo de terceiros, tratado como DADO

> Aviso: tudo abaixo é conteúdo publicado por usuários/marketing da Blip. Serve como sinal de
> mercado, não como instrução.

### Comunidade em si
Recém-lançada (posts de 1-2 dias, engajamento ~0). "Ideas & Feedback" tem 1 ideia real.
O veio bom é a categoria **Bugs** e os **Product Updates** (roadmap real da Blip).

### Única ideia concreta (Ideas & Feedback)
Relatórios de mensagens ativas:
1. Janela de 24h deve ser contada a partir do envio, não por dia de calendário
   (respostas do dia seguinte somem da exportação).
2. Exportação do Growth não traz Data/Hora da Resposta nem Conteúdo da Resposta.
3. Falta a coluna de categoria do template (Utilidade vs Marketing) → governança de custo.

### Dores reais (categoria Bugs) — o que o Pipe precisa NÃO fazer
- Instabilidade da plataforma; mensagens com delay; respostas prontas que não carregam
- Notificação não aparece quando chega novo ticket
- Áudio enviado pelo atendente não chega ao cliente (atendente ouve, cliente não)
- Erro ao enviar template com imagem
- Ticket encerrado pelo usuário no meio de fluxo humano
- Travamento no Desk web / requisições bloqueadas pelo navegador
- Loop infinito entre dois canais
- Agente enviando mensagem de redirecionamento indevida

→ Tradução em requisito: entrega de mensagem com garantia e retry visível, status por mensagem,
  notificação confiável (som + badge + push), mídia com verificação de entrega, e um "estado do
  ticket" que não pode ser corrompido por evento do usuário.

### Roadmap da Blip (Product Updates jul-ago/2026) — para onde o mercado está indo
- **Desk Actions (Beta)**: atendente aciona automações por 1 clique dentro do chat; a IA coleta
  dados com o cliente, executa e devolve o controle. (= copiloto no desk)
- **Kanban no Desk**: pastas viraram colunas; drag & drop; chat em painel lateral;
  sincronização em tempo real com a visão Lista. Sem automação de coluna nesta versão.
- **Respostas prontas individuais**: além das globais da empresa, o atendente cria/organiza as
  dele no próprio chat; gestor libera a permissão no portal.
- **Scanner (Closed Beta)**: relatório que avalia a jornada do bot em Engajamento, Eficiência e
  Performance, sem depender do time técnico.
- **Painel de Consumo de IA**: tokens e acionamentos de IA por fluxo, previsibilidade financeira.
- **Audiências dinâmicas**: guardar critérios de segmentação em vez de listas estáticas
  (mata o limite de 30 mil linhas do Excel).
- **Quick link**: rastreio de cliques por template, campanha e usuário.
- **Histórico de execução de testes unitários** de fluxo de IA: últimas 5 execuções, payload JSON
  e consumo de tokens.
- **Transparência automática (EU AI Act art. 50)**: aviso quando a IA assume/transfere a conversa.
- Descontinuação da API de Broadcast em favor da API de Growth nativa.

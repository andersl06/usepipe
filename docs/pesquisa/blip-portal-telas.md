# Levantamento funcional — Blip Portal (cliente AUVP Capital / Supernova)

> Levantamento de leitura feito no Blip Portal real de um cliente (organização "Supernova", app "AUVP Capital"), via
> automação de navegador, para servir de referência funcional ao produto próprio **Pipe**. Nenhuma alteração foi
> feita no ambiente: não houve criação, edição, publicação, exclusão ou disparo de mensagem.
>
> Base: `https://supernova.blip.ai/application/detail/supernovaprincipal/`. O app "AUVP Capital" aberto durante o
> levantamento se comportou como um **roteador** (várias telas de atendimento/relatório mostraram avisos do tipo
> "não é possível gerar relatórios de atendimento para um router ou chatbot sem atendimento ativo"), o que limitou
> alguns dados reais (ficaram zerados ou bloqueados) mas não a estrutura das telas.
>
> **Limitação de método registrada**: o Builder é renderizado dentro de um iframe de outra origem, altamente
> baseado em canvas. Nele, cliques em coordenadas de tela funcionam para abrir um bloco (usando o texto do bloco
> como alvo), mas cliques dentro do painel lateral de detalhe do bloco, abaixo do cabeçalho (a régua de abas
> "Conteúdo / Condições de saída / Ações"), não registraram de forma confiável nesta sessão — o clique parece
> atravessar para o canvas por trás do painel. Por isso, "Condições de saída" e "Ações" são documentadas pelo nome
> da aba e pela inferência de conteúdo a partir do texto bruto da página (que lista os tipos de ação de cada
> bloco), não por captura visual do conteúdo interno dessas duas abas. Isso está sinalizado explicitamente na seção
> do Builder.

---

## 1. Builder — o construtor de fluxo

**URL**: `.../templates/builder/`

**O que faz**: editor visual do fluxo conversacional do bot. O fluxo é um grafo de **blocos** (states) ligados por
setas; cada bloco roda uma sequência de **ações** quando o contato chega nele, opcionalmente aguarda uma entrada do
usuário, e decide para qual próximo bloco seguir.

### Layout geral do canvas

- Barra superior secundária (abaixo do menu Builder/Atendimento/Análise/Growth/Canais/…): um banner informativo
  contextual (ex.: aviso sobre mudança de identificadores do WhatsApp/Meta, com link "Analisar fluxo" que gera um
  relatório de dependências de número de telefone no flutxo, e "Saiba mais" para a documentação). O banner é
  dispensável (X) e muda de altura (1 ou 2 linhas) dependendo do texto.
- Canvas infinito com blocos retangulares arrastáveis. Um bloco de cor azul e formato levemente diferente marca o
  **bloco de início** ("Início"). Os demais blocos são cinza-escuros.
- Pequenos indicadores visuais no rodapé de cada bloco:
  - **bolinhas coloridas** — parecem indicar canal(is) ou tags associadas ao bloco (ex.: laranja/rosa/roxo/preto no
    bloco "Início"; rosa/laranja em "Fila comercial").
  - **ícone de pessoas** (👥) no canto inferior direito de alguns blocos — presente em blocos de transbordo para
    atendimento humano (ex.: "Atendimento humano", "Contato Bloqueado", "Fora do Horário de atendimento").
- **Linhas/setas de conexão** entre blocos aparecem ao arrastar o canvas / selecionar um bloco (nem sempre visíveis
  sem interação); indicam o roteamento condicional de um bloco para o próximo.
- Barra de ferramentas fixa, canto inferior esquerdo: indicador de estado de salvamento ("Salvo" / "Salvando…"),
  desfazer / refazer, "ajustar à tela", controle de zoom (slider, mostra "100%").
- Barra de ícones fixa, canto superior esquerdo do canvas (sobreposta a blocos quando o canvas está com poucos
  blocos à esquerda): ícones de **+** (adicionar bloco), foguete, chave/ferramenta, livro, lupa (busca de blocos) e
  engrenagem/olho — um menu de ações rápidas de canvas (adicionar bloco, publicar/testar, blocos prontos,
  documentação, busca, configurações de fluxo). Não foi possível confirmar o rótulo exato de cada ícone por
  automação; a função foi inferida do ícone e da posição.
- Blocos com um design levemente diferente (barra/slider horizontal colorido, ex.: "Menu principal", "Menu opções
  suporte") indicam blocos de **menu/lista de opções**.

### O fluxo real observado (amostra, não exaustiva)

O fluxo do AUVP Capital é grande — dezenas de blocos — cobrindo: recepção (Início, Boas-vindas, Menu principal),
triagem por IA ("IA - Triagem", "IA - Complemento", "IA - Aguarda"), filas de atendimento (Fila comercial, Fila
suporte, filas de banking/wealth/ouvidoria), horário de atendimento (Validação do Horário, mensagens de fora do
horário para suporte e comercial), pesquisa de satisfação (vários blocos "Pesquisa de Satisfação" com
ramificação por Promotores/Neutros/Detratores), campanhas ativas por área de negócio (Banking, Crédito, FOPA,
Corporate), qualificação de lead (Sócio, Faturamento, Cargo Relevante, Quantidade de funcionários, Remuneração
Média, Banco Atual +4K / -4K), blocos de transbordo nomeados por fila/especialista (ex.: "Atendimento humano -
Raul Pordeus", "Transbordo fila Wealth", "Transbordo abertura de conta e custódia") e blocos de sistema
("BLIPSTORE: Central de Conversas - Gravar Ticket", "Contato Bloqueado", "Menu porquinho" — um easter egg/teste).

### Anatomia de um bloco (painel de detalhe)

Abrir um bloco (duplo clique no bloco no canvas) abre um **painel lateral direito** com:

- Cabeçalho: nome do bloco (editável), botão de fechar (X).
- Linha de **tags de ação** — chips coloridos, um por tipo de ação configurada no bloco, na ordem em que rodam.
  Tipos observados no fluxo real: `SendMessage`, `UserInput`, `ExecuteScript`, `MergeContact`, `SetVariable`,
  `ProcessHttp`, `ProcessCommand`, `TrackEvent`. Cada chip tem um "x" para removê-lo (edição), e um campo
  "Adicionar tag..." para incluir uma nova ação.
- Três abas: **Conteúdo**, **Condições de saída**, **Ações**.
  - **Conteúdo** (aba padrão, visível): editor da conversa que o bloco produz. Para um bloco `SendMessage`,
    mostra uma prévia em formato de bolha de chat: mensagens de texto (com suporte a variáveis como
    `{{contact.name}}` e emoji), **indicadores de "digitando…"** entre mensagens (representando o atraso
    simulado entre envios), um contador tipo "2/25" (provável limite de mensagens/itens de conteúdo por bloco),
    e — quando o bloco é um menu — **botões de resposta rápida** (ex.: bloco "Menu principal": pergunta "Com
    qual time de especialistas você deseja falar hoje?" com botões "Comercial" e "Suporte"). Para o bloco de
    entrada ("Início"), a aba mostra um texto fixo explicando que a conversa sempre começa pela "Entrada do
    usuário", com um cartão "Entrada do usuário >" e um link "Entenda como funcionam os tipos de conteúdo".
  - **Condições de saída** e **Ações** — abas visíveis e clicáveis na interface (nomes confirmados), mas o
    conteúdo interno **não pôde ser capturado** nesta sessão pela limitação de clique descrita no início do
    documento. Pelo nome e pelo padrão comum de builders desse tipo, a expectativa é: "Condições de saída" define
    as regras/gatilhos que decidem para qual próximo bloco o fluxo segue (ex.: resposta do usuário casa com uma
    opção, uma variável tem certo valor, expressão regular, intenção reconhecida por IA); "Ações" reúne
    ações adicionais não ligadas ao conteúdo enviado (ex.: webhooks, scripts, variáveis, eventos de analytics) —
    isso é compatível com a lista de tipos de ação (`ProcessHttp`, `ProcessCommand`, `SetVariable`, `TrackEvent`)
    vistos como chips em blocos do fluxo real.
- Variáveis: usadas dentro do texto das mensagens com sintaxe `{{contact.name}}` (contexto do contato). O padrão
  sugere acesso a um objeto de contato e, provavelmente, a variáveis de sessão/fluxo (não confirmado via UI por
  causa da limitação de clique nas abas).

### Publicação e versionamento

- O canvas salva automaticamente (indicador "Salvo" / "Salvando…" no canto inferior esquerdo); não foi localizado
  um botão explícito de "Publicar" na área visível do Builder nesta sessão — pode estar dentro do menu de ícones
  do canto superior esquerdo (foguete?) ou em "Configurações avançadas do fluxo" (ver seção Configurações).
- Não foi possível abrir/testar o fluxo (ex.: "testar fluxo", histórico de versões) dentro do tempo desta pesquisa.

### O que o Pipe deve aproveitar

Modelo de bloco = **lista ordenada de ações tipadas + conteúdo de mensagem com atraso simulado + condições de
saída** é um padrão sólido e replicável; vale copiar a ideia de **tags de ação reordenáveis** (visualmente simples,
poderosas) e a prévia de chat com indicador de "digitando" para dar noção de UX real do disparo.

---

## 2. Análise (`/analytics`)

Sub-abas no topo: **Dashboard, Mensagens ativas, Visão Geral, Relatórios Personalizados, Jornada dos Contatos,
Gerenciador de Relatórios, Dicionário de Dados**.

### 2.1 Dashboard

**URL**: `.../analytics/dashboard`. **O que faz**: painel inicial de métricas, com dois seletores de data
(`dd/mm/aaaa` a `dd/mm/aaaa`). **Não carregou**: ficou preso em esqueleto de carregamento cinza por mais de 40s,
mesmo após recarregar a página — registrado como tela não funcional nesta sessão, sem inventar conteúdo.
**O que o Pipe deve aproveitar**: nada capturado; ver "Visão Geral" abaixo, que parece cobrir o mesmo tipo de dado.

### 2.2 Mensagens ativas (dentro de Análise)

**URL**: `.../analytics/activeMessages`. Distinta da tela de mesmo nome dentro de Growth. **Não carregou**: painel
em branco por mais de 30s. Registrado como não funcional nesta sessão.

### 2.3 Visão Geral

**URL**: `.../analytics/overview`. **O que faz**: visão consolidada de uso do bot num período.
**Elementos e opções**:
- Seletor de período (ex.: "29 ago, 2026 ~ 05 set, 2026"), botão **Atualizar**, botão **Exportar**.
- Cartão **Usuários**: "Ativos" e "Engajados" (com tooltip "i" explicando definição: usuário único que
  recebeu/enviou mensagem).
- Cartão **Mensagens**: Total, Recebidas, Enviadas, Ativas (com tooltips).
- Gráfico **Mensagens ativas por canal** (estado vazio quando não há disparo ativo no período).
- Gráfico de linha **Usuários por dia (DAUs e DEUs)** — duas séries.
- Gráfico de linha **Mensagens por dia**.

Dados reais observados (período de 1 semana): 755 usuários ativos, 1.363 engajados, 24.466 mensagens totais
(10.040 recebidas, 14.426 enviadas, 0 ativas no período).

**O que o Pipe deve aproveitar**: o par "métrica com tooltip de definição operacional" resolve a maior dor de
qualquer analytics interno (ninguém concorda no que significa "ativo"/"engajado") — vale copiar a prática de
documentar a fórmula dentro da própria UI.

### 2.4 Relatórios Personalizados

**URL**: `.../analytics/reports`. **O que faz**: permite montar e salvar relatórios ad-hoc.
**Elementos**: tabela (Nome do relatório, Criado por, Última modificação), botão **Criar relatório**, busca (lupa).
Um relatório existente ("Sem título") apareceu na lista real do cliente. Não foi aberto o editor de criação por
tempo. **O que o Pipe deve aproveitar**: um "relatório salvo, nomeado, com autor e data" é o mínimo indispensável
de qualquer camada de BI self-service — o Pipe deveria ter o equivalente desde o dia 1.

### 2.5 Jornada dos Contatos

**URL**: `.../analytics/contactsJourney`. **O que faz**: visualização (provável diagrama tipo Sankey/funil) do
caminho que os contatos percorrem dentro do fluxo, a partir de um bloco escolhido.
**Elementos**: seletor **"Começar a partir de"** (dropdown, ex.: valor "Início" — permite escolher qualquer bloco
do fluxo como ponto de partida da jornada), seletor de período.
**Estado real observado**: "O chatbot não possui dados suficientes para mapeamento de uma jornada no período
selecionado. É necessário republicar o seu fluxo e aguardar algumas horas para que os dados comecem a aparecer
por aqui." — texto que revela um detalhe de arquitetura importante: **a jornada só é populada depois de uma
republicação do fluxo**, os dados não são retroativos.
**O que o Pipe deve aproveitar**: a ideia de escolher **qualquer bloco do fluxo** como ponto de partida de uma
análise de funil é diretamente aplicável a um "funil por etapa do Builder" no Pipe.

### 2.6 Gerenciador de Relatórios (extração de dados)

**URL**: `.../analytics/dataExtractor`. **Esta é a tela de extração de dados propriamente dita.**
**O que faz**: gera relatórios de exportação por tipo de dado.
**Elementos observados**:
- Título "Gerenciador de relatórios" + subtítulo "Gere relatórios para diferentes dados do seu contato
  inteligente ou acesse os relatórios que você já criou."
- **Escolha de bot**: dropdown "Bot" (mostrou "AUVP Capital" pré-selecionado) — a extração é sempre por bot/fluxo
  específico, não por conta inteira de uma vez.
- Aviso amarelo: **"Não é possível gerar relatórios de atendimento para um router ou chatbot sem atendimento
  ativo."** — confirma que o tipo de app (roteador vs. bot com Desk ativo) limita quais relatórios podem ser
  gerados.
- **"Defina o tipo de relatório"** — grupo de rádio com pelo menos: **Mensagens ativas**, **Rastreamento de
  eventos**, **Métricas de chatbots e usuários** (a lista continua além do que coube na tela sem rolagem interna,
  que não foi possível operar nesta sessão — via o texto do Gerenciador de Relatórios do menu "..." de contexto,
  vimos referências a mais categorias, incluindo dados de conversas/tickets).
- Texto de apoio: "Selecione entre as opções os dados que deseja analisar no relatório. Entenda melhor cada um
  deles no Dicionário de Dados." — ou seja, **o Dicionário de Dados é o glossário de campos do Gerenciador de
  Relatórios**, pensado para ser lido em conjunto.
**O que o Pipe deve aproveitar**: este é o modelo mais próximo de uma "linguagem de consulta" que a Blip expõe ao
usuário final — (bot) × (tipo de relatório pré-definido) × (período) → exportação. Não é uma query livre, é um
catálogo de relatórios fixos por categoria de dado. Para o Pipe, um catálogo assim (com nomes de campo
documentados) é mais rápido de construir e mais fácil de vender que uma linguagem de consulta genérica.

### 2.7 Dicionário de Dados

**URL**: `.../analytics/dataDictionary`. **Não carregou**: ficou preso em uma barra de esqueleto de carregamento
por mais de 30s mesmo após reload da página — registrado como tela não funcional nesta sessão. É a peça que mais
interessava para uma "linguagem de consulta" (glossário de campos por tipo de relatório), mas não foi possível
capturar seu conteúdo real; não fabricamos os campos.

---

## 3. Growth (`/growth`)

**URL de entrada**: `.../growth/activemessages?tab=Launch`. Menu lateral: **Mensagens ativas** (ativo por padrão),
**Click Tracker** ("Confira os dados das campanhas de Click to WhatsApp"), **Anúncios** (selo "Beta", "Crie e
publique anúncios que se conectam ao seu chatbot"), **Relatório de Pagamentos** ("Visualize e analise os
pagamentos realizados").

### 3.1 Mensagens ativas (Growth) — visão "Disparo"

**Elementos**: título "Resumo dos envios de mensagens" + subtítulo, botão **Atualizar**, botão primário **Enviar
mensagens ativas**. Bloco **Filtros**: Canal (ex.: Whatsapp), Tipo da mensagem (Todos), Tipo de campanha (Todos),
ícone de busca. Lista de campanhas abaixo (vazia na conta observada, com CTA "Que tal criar campanhas que te
aproximam da sua audiência?").

### 3.2 Criar Disparo (wizard de campanha)

Acionado por "Enviar mensagens ativas". Fluxo em etapas (confirmado pela existência de 4 botões "Continuar" no
DOM, um por etapa):

1. **Escolher o canal** — grade de canais: "Canais mais utilizados" (WhatsApp, Rich Communication Services/RCS,
   SMS) e "Outros canais" (Blip Chat, E-mail, Facebook Messenger, Facebook Workplace, Instagram, Telegram).
2. **Tipo de disparo** — acordeão com seções:
   - **Gestão de audiência**: upload de planilha de contatos. Regras de formato documentadas na própria tela:
     nomes de coluna sem caracteres especiais, telefone no formato "DDI DDD Número" (ex.: `+5511987654321`),
     uma coluna por variável de template, e um aviso específico de que **audiências de cobrança têm campos
     obrigatórios** (com modelo próprio no Blip Help). Botões **"Modelos e documentação"** e **"Exemplo de
     arquivo"** (download).
   - **Modelo da mensagem**: escolha do template a enviar.
   - **Encaminhamento do disparo**: para onde vão as respostas dos contatos.
   - **Ajustes do disparo**: configurações finais antes de enviar.

**O que o Pipe deve aproveitar**: o requisito de formato de audiência (telefone em E.164 com DDI+DDD, 1 coluna por
variável) é praticamente um contrato de API não documentado como tal — o Pipe pode formalizar isso como schema de
upload desde o início, incluindo a distinção de "audiência de cobrança" com campos obrigatórios extras.

---

## 4. Canais (`/channels`)

**URL**: `.../channels/`. Grade de canais de conversa disponíveis para conectar:
- **Blip Chat** — único canal com status **Conectado** na conta observada.
- **WhatsApp, Messenger, Instagram, RCS for Business** (badge "New!") — status **Conectar** (não conectados neste
  app específico).
- **Telegram, Apple Messages for Business, E-mail, Slack** — cartões presentes mas sem ação de conectar visível
  diretamente (Slack tem link "Ver na Blip Store", sugerindo instalação via marketplace).

### Configuração do WhatsApp oficial

Ao clicar "Conectar" em WhatsApp, abre `.../channels/whatsapp-embedded` com abas **Visão Geral**,
**Configurações de alerta**, **Ambiente de testes**, e um link **Documentação** (externo). Na conta observada
(um app do tipo roteador), a tela mostrou o estado de bloqueio:

> "Ainda não é possível conectar ao WhatsApp. Se você está vendo essa mensagem, provavelmente se encaixa em um
> dos casos abaixo: 1) Você contratou um plano e não passou pelo onboarding de implementação → aguarde contato da
> equipe responsável; 2) Você não comprou um número adicional para conectar ao WhatsApp → contate seu suporte
> comercial."

Isso revela duas pré-condições comerciais/operacionais para ativar um número de WhatsApp oficial na Blip: passar
pelo onboarding de implementação, e ter comprado o "número adicional" (a conexão de WhatsApp é tratada como um
add-on avulso, não incluso automaticamente no plano/app).

**O que o Pipe deve aproveitar**: expor claramente pré-condições comerciais/técnicas de conexão de canal como
estado de UI (em vez de simplesmente esconder o botão) é uma boa prática de produto B2B — copiar o padrão de
"aqui está o motivo, aqui está o que fazer".

---

## 5. Integrações (`/integrations`)

**URL**: `.../integrations`. **O que faz**: marketplace de integrações prontas com serviços de terceiros.
**Elementos**: botão **"Ir para Blip Store"** (o catálogo completo vive na Blip Store, esta tela mostra um
recorte). Cartões observados, cada um com nome, autor/fornecedor, descrição curta e botão **"Teste grátis"**:
- **Catalyst AI Personal Shopper** (Dawntech Inc.) — catálogos inteligentes para vendas.
- **MkSolutions** (WConsulting) — segunda via de boleto e desbloqueio de confiança.
- **Shopify** (Dawntech Inc.) — checkouts abandonados e rastreamento de envios.
- **BigQuery** (Wiv / White Wall) — envia dados das conversas do chatbot para o Google BigQuery.
- **Salesforce: Atendimento** (Wiv / White Wall) — atende tickets do Blip Desk dentro do Salesforce.
- **Braze** (Wiv / White Wall) — dispara mensagens ativas no WhatsApp a partir do Braze.
- **Webhook Manager** (Wiv / White Wall) — envia mensagens, eventos e contatos do bot via webhook.
- **HubSpot: Atendimento** (Wiv / White Wall) — atende tickets do Blip Desk dentro do HubSpot.

Chamou atenção que a extração nativa para BigQuery já existe como integração pronta (paga/teste grátis) — ou
seja, a Blip já oferece um caminho "sem código" para tirar os dados do bot e colocar num data warehouse.

**O que o Pipe deve aproveitar**: BigQuery/Webhook Manager mostram que o mercado já espera "exportação contínua
para meu warehouse" e "todo evento vira webhook" como funcionalidades de plataforma, não só de fluxo (Builder). O
Pipe deveria oferecer ao menos um webhook genérico de eventos desde o início.

---

## 6. Configurações (`/configurations`)

**URL de entrada**: `.../configurations/basic`. Menu lateral com 5 seções (cada uma com nome + descrição de
apoio, texto capturado literalmente da UI):

1. **Configurações básicas** — "Define nome, descrição e a imagem de seu fluxo." Tela: "Editar Fluxo" com campos
   **Nome do fluxo** (contador de caracteres, ex. "AUVP Capital" = 18/? caracteres), **Descrição** (limite 160
   caracteres), **Imagem do avatar** (upload, opcional), botão **Salvar**, link **"Clique aqui para acessar as
   configurações avançadas"**, e ação destrutiva **Excluir fluxo** (não acionada).
2. **Tela de Boas-vindas** — "Defina a Mensagem de Saudação e o botão Começar."
3. **Menu Persistente** — "Configure o menu persistente de seu fluxo."
4. **Informações de conexão** — "Obtenha e defina as configurações de conexão do seu fluxo."
5. **Chaves de acesso** — "Gerencie as chaves de acesso para conexão com seu fluxo."

Não foi possível abrir o conteúdo interno de 2–5 nesta sessão (a navegação por clique nesse painel específico não
respondeu de forma estável, e o tempo do levantamento priorizou telas com maior densidade de informação nova);
seus rótulos e descrições acima são exatamente os exibidos na UI, sem inferência de conteúdo.

**O que o Pipe deve aproveitar**: "Chaves de acesso" e "Informações de conexão" como itens de primeira classe no
menu de configurações (não escondidos em "avançado") é coerente com o público técnico que integra bots via API —
o Pipe deveria ter equivalente visível e não enterrado.

---

## 7. Equipe (`/team`)

**URL**: `.../team`. **O que faz**: gestão de usuários com acesso ao app/fluxo.
**Elementos**: campo de busca **"Pesquisar por nome ou e-mail"**, botão **"+ Adicionar Membro"**, e uma lista de
membros — cada linha com avatar (iniciais ou logo), **Nome**, **E-mail**, e um badge de papel (observado: **Admin**
para vários membros; membros sem badge visível aparentam ter papel padrão/"Membro" sem destaque). A lista real da
conta tinha dezenas de membros (não reproduzidos aqui por serem dados pessoais de terceiros — nomes e e-mails reais
de colaboradores do cliente).

**O que o Pipe deve aproveitar**: modelo simples de "lista + busca + badge de papel + botão adicionar" é
suficiente como MVP de gestão de equipe; não há evidência aqui de um editor de permissões granular nesta tela
(pode existir ao clicar num membro, não testado).

---

## 8. Atendimento — seções ainda não mapeadas (`Atendentes`, `Preferências`)

**URL base do módulo**: `.../attendance/desk/...` (ex.: `.../rules`, `.../monitoring`). O menu lateral do Desk
tem: Monitoramento, Histórico, Relatórios, Comunicação, **Regras** (com sub-itens Atendimento/SLA/Horários — já
mapeados, fora do escopo deste documento), **Atendentes**, **Preferências**.

**Atendentes** e **Preferências**: apesar de aparecerem com o mesmo estilo visual dos demais itens do menu
(ícone, texto, seta de expandir), **não responderam a clique em múltiplas tentativas** (clique direto no texto,
no ícone de seta, duplo-clique) — a URL não mudou e o conteúdo da tela permaneceu o de "Regras". Uma tentativa de
navegação direta por URL (`.../attendance/desk/attendants`, um palpite razoável de rota) foi aceita pelo roteador
da aplicação mas renderizou um painel de conteúdo em branco, mesmo após mais de 30s de espera. Ao passar o mouse
sobre "Atendentes", ao contrário de itens ativos (ex. "Regras"), não houve destaque de hover — sinal de que o item
está de fato desabilitado/bloqueado nesta conta, provavelmente por ela ser um roteador sem atendimento humano
habilitado diretamente (mesma limitação relatada explicitamente em outras telas: "não é possível gerar relatórios
de atendimento para um router ou chatbot sem atendimento ativo").

**Registrado explicitamente, sem inventar conteúdo**: não foi possível ver ou descrever o conteúdo real das telas
"Atendentes" e "Preferências" nesta sessão.

---

## Resumo de telas não carregadas ou inacessíveis (registro explícito)

| Tela | URL | Sintoma |
|---|---|---|
| Análise → Dashboard | `.../analytics/dashboard` | Esqueleto de carregamento infinito (>40s, com reload) |
| Análise → Mensagens ativas | `.../analytics/activeMessages` | Painel em branco (>30s) |
| Análise → Dicionário de Dados | `.../analytics/dataDictionary` | Esqueleto de carregamento infinito (>30s, com reload) |
| Atendimento → Atendentes | (sidebar Desk) | Item não responde a clique; URL palpite renderiza painel vazio |
| Atendimento → Preferências | (sidebar Desk) | Item não responde a clique |
| Builder → abas "Condições de saída" / "Ações" de um bloco | (painel lateral do Builder) | Clique não registra de forma confiável (atravessa para o canvas) |

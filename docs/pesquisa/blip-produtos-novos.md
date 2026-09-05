# Mapeamento de produtos novos da Blip (referência funcional para o Pipe)

> Pesquisa feita em 05/09/2026 na central de ajuda pública da Blip (help.blip.ai) e na
> comunidade (community.blip.ai). Objetivo: servir de inspiração funcional ao Pipe (CRM +
> atendimento + monitoria com IA), nunca copiar texto da documentação — tudo abaixo está
> reescrito com minhas palavras. Comportamento de tela é descrito; onde a doc não detalhava
> algo, isso está marcado na seção Lacunas.

---

## Blip Go / Blip Go Personal

### O que é

O **Blip Go** é o produto de autoatendimento da Blip para empresas pequenas/médias que
querem atender pelo WhatsApp Business App sem contratar a "Plataforma Blip" completa. A
proposta central é simples: um único canal (WhatsApp Business App, via API Coex da Meta),
um assistente de IA que faz a triagem e qualificação inicial, e um atendimento humano que
assume quando a IA não resolve — tudo dentro do mesmo número, sem conflito entre bot e
humano. É vendido como plano único ("Blip Go Essencial", R$ 299/mês, 15 dias de trial, 100
disparos ativos inclusos, excedente a R$ 0,60/disparo). Não suporta outros canais (Telegram,
Instagram, WhatsApp comum) — para isso a Blip empurra o cliente para a Plataforma Blip
completa.

Já o **Blip Go Personal** é um produto irmão, mas com propósito bem diferente: não é para
centralizar o atendimento da empresa, e sim para **descentralizar** conversas 1:1 entre um
agente específico (vendedor, gerente, consultor) e um cliente, usando um número corporativo
exclusivo daquele agente. A ideia é substituir o uso informal de WhatsApp Business/pessoal
por vendedores, mantendo governança da carteira de clientes e conformidade com LGPD (a
empresa não perde o histórico quando o vendedor sai, por exemplo).

### Telas e funções

#### Kanban de contatos (Blip Go)
Acessado pelo menu lateral "Contatos" — é literalmente a mesma tela que gerencia contatos,
não é um menu separado.

- Quando o WhatsApp é ativado, todo contato novo cai automaticamente numa coluna inicial
  "Não classificado". O usuário cria colunas próprias ("Adicionar nova coluna") para montar
  o funil do negócio, e cada coluna pode ser editada pelo menu de três pontos.
- Mover contato entre colunas: arrastar e soltar o card, ou abrir o painel lateral (clicando
  no card) e trocar o campo "Grupo".
- Cada card guarda dados editáveis (nome, CNPJ, telefone) e tags livres para segmentação.
- Filtros do quadro: por tag, por status ("Sem atendimento aberto" / "Aguardando
  atendimento") e por ordenação de tempo de espera (maior/menor tempo aguardando). Há um
  temporizador visível no card mostrando há quanto tempo aquele contato aguarda atendimento
  humano.
- Botão "Atualizar contatos" no canto superior direito força um refresh manual (contatos
  muito recentes podem não aparecer de imediato).
- Do próprio Kanban dá para disparar campanha ativa direto para os contatos de uma coluna
  segmentada, sem sair da tela.
- A documentação já traz uma tabela comparativa oficial Blip Go vs. Plataforma Blip: no Go,
  arrastar-e-soltar, segmentação e disparo pelo Kanban existem mas **relatórios avançados,
  dashboards e integração com CRM externo não existem** — isso só está na Plataforma Blip.

Fonte: [Como Gerenciar Contatos e Utilizar o Kanban no Blip Go](https://help.blip.ai/hc/pt-br/articles/41262466364695-Como-Gerenciar-Contatos-e-Utilizar-o-Kanban-no-Blip-Go)

#### Tela de Mensagens Ativas / Campanhas (Blip Go)
Menu lateral "Mensagens Ativas".

- Tela inicial = histórico de todos os disparos (individuais e em massa), com quatro
  métricas por envio: **Audiência** (total de disparos — cada telefone conta 1), **Falhas**
  (não entregues), **Recebidas** (entregues) e **Lidas** (visualizadas). A documentação
  pública **não menciona** uma métrica de "Respondida" nem taxas percentuais de
  resposta/falha prontas — só contagens absolutas.
- Criar novo disparo: botão "Enviar Nova Mensagem" → lista de templates com status de
  aprovação da Meta → "Criar mensagem" para cadastrar um novo template (simples ou com
  variáveis, usando o botão "+variável").
- Todo template passa por aprovação da Meta (a Blip não decide isso, só orienta boas
  práticas); a tela mostra o status em tempo real: "Análise em andamento", "Aprovado",
  "Reprovado", com uma lista de gatilhos que forçam revisão manual (links, mídia, linguagem
  promocional/urgente, encurtadores) e o que fazer se passar de 24h sem resposta.
- Ao usar um template aprovado ("Usar mensagem"), a tela "Configurar disparo" deixa
  escolher o público (grupo do Kanban ou planilha própria), e depois agendar data/hora ou
  disparar na hora.
- Uma segunda vertente de campanhas (a que aparece no artigo genérico "Campanhas", ligado
  ao Blip Go Personal / Growth) tem uma tela de upload de planilha com validação de
  remetentes, resumo do envio (números remetentes, destinatários, modelos), **agendamento**
  e **envio fracionado** (escolher quantidade de mensagens e intervalo, para não sobrecarregar
  os agentes que vão receber o volume de atendimento gerado) — e um relatório de campanhas
  filtrável por grupo, número e origem de envio.

Fontes: [Como Gerenciar Campanhas e Mensagens Ativas no Blip Go](https://help.blip.ai/hc/pt-br/articles/33302768736023-Como-Gerenciar-Campanhas-e-Mensagens-Ativas-no-Blip-Go) · [Campanhas](https://help.blip.ai/hc/pt-br/articles/33771933812631-Campanhas)

#### Onboarding e conexão do WhatsApp
- Pré-requisitos obrigatórios: número já registrado no **WhatsApp Business App** (não pode
  ser o WhatsApp comum) e com **histórico real de uso** — a Meta não libera número "zerado".
- Fluxo de conexão: no painel do Blip Go, "Iniciar conexão WhatsApp" → assistente da Meta
  abre em nova janela → escolher autenticação por Facebook ou diretamente pelo app WhatsApp
  Business (a segunda é mais rápida) → preencher campo obrigatório de site/Instagram/Facebook
  da empresa (exigência de confiança da Meta) → escanear QR code pelo app (Configurações >
  Aparelhos conectados).
- Validação da conexão só é possível checando dentro do próprio app WhatsApp Business
  (Configurações > Conta > Plataforma Business > deve aparecer "Blip" na lista) — o painel
  do Blip Go não mostra esse status.
- A documentação mapeia 6 erros específicos da Meta (número não registrado, número não
  elegível por baixa atividade, limite de números vinculados, número já no Meta Inbox, número
  não associado ao portfólio selecionado, conta restrita) com causa técnica e correção para
  cada um — é um material de troubleshooting bem maduro.
- Desconectar o número mantém o histórico de conversas no app, mas desliga IA, Kanban e
  campanhas imediatamente; não cancela a assinatura.

Fonte: [How to Connect WhatsApp and Resolve Meta Errors in Blip Go](https://help.blip.ai/hc/en-us/articles/33302405136279-How-to-Connect-WhatsApp-and-Resolve-Meta-Errors-in-Blip-Go)

#### Blip Go Personal — conversas 1:1
- Foco: "governança da carteira" — a empresa mantém visibilidade sobre dados de clientes e
  histórico mesmo quando o atendimento é descentralizado por vendedor/consultor.
- Diferencial declarado: enquanto a Blip tradicional centraliza tudo num fluxo/ambiente
  único, o Go Personal existe justamente para os casos em que uma conversa consultiva 1:1
  entre um agente nomeado e um cliente é o modelo de negócio (ex: gerente de conta, consultor
  de vendas).
- Benefícios citados: elimina uso de WhatsApp pessoal/informal por vendedores, permite
  monitorar performance individual de cada consultor e atende LGPD.
- O envio de mensagem ativa no Go Personal pode ocorrer por três vias: pela própria tela de
  Campanhas, pelo Blip Desk, ou por integração via API (gateway de disparo).
- **Não achei** artigos de instruções passo a passo específicas do Go Personal — os dois
  links de "Instruções" e "Atendimento Blip Go Personal" que a busca indicava retornaram
  página 404 no momento da pesquisa.

Fonte: [Como funciona o Blip Go Personal](https://help.blip.ai/hc/pt-br/articles/33771807235095-Como-funciona-o-Blip-Go-Personal)

### O que o Pipe deve aproveitar

- O **Kanban simples e arrastável**, com painel lateral de edição de contato e disparo de
  campanha direto da coluna segmentada, é um padrão de UX validado e vale replicar como o
  fluxo primário de atendimento do Pipe — sem exigir que o atendente saia da tela de
  contatos para nada.
- A ideia de **uma única tela de campanhas com histórico + criação + métricas** (mesmo que
  hoje na Blip só mostre contagens, não taxas) é o ponto de partida certo; o Pipe pode ir
  além calculando as taxas de resposta/falha que a própria Blip ainda não expõe.
- O checklist de **erros de conexão do WhatsApp mapeados um a um** (causa técnica + correção)
  é um modelo de documentação de suporte que vale copiar para o onboarding do Pipe — reduz
  drasticamente ticket de suporte.
- A separação conceitual entre "atendimento centralizado" (Kanban/Portal) e "conversa 1:1
  com um agente nomeado" (Go Personal) é relevante para o Pipe decidir se quer os dois modos
  ou só um: hoje o Pipe está desenhado para atendimento centralizado, mas a demanda de
  vendedores com número próprio (ex: closers de vendas) é análoga ao caso de uso do Go
  Personal.
- A tabela "isto está no produto simples, isto só na plataforma completa" é um bom exercício
  de posicionamento: o Pipe deveria decidir cedo o que fica no "modo simples" vs. "modo
  avançado" em vez de tentar entregar tudo de uma vez.

### Fontes (URLs)

- https://help.blip.ai/hc/pt-br/articles/33302181138455-O-que-%C3%A9-Blip-GO
- https://help.blip.ai/hc/pt-br/articles/41262466364695-Como-Gerenciar-Contatos-e-Utilizar-o-Kanban-no-Blip-Go
- https://help.blip.ai/hc/pt-br/articles/33302768736023-Como-Gerenciar-Campanhas-e-Mensagens-Ativas-no-Blip-Go
- https://help.blip.ai/hc/pt-br/articles/33771933812631-Campanhas
- https://help.blip.ai/hc/pt-br/articles/33771807235095-Como-funciona-o-Blip-Go-Personal
- https://help.blip.ai/hc/en-us/articles/33302405136279-How-to-Connect-WhatsApp-and-Resolve-Meta-Errors-in-Blip-Go

---

## Blip Studio

### O que é

O Blip Studio é o ambiente atual da Blip para criar e orquestrar **agentes de IA
generativa** dentro de um fluxo conversacional — ele substituiu/unificou o antigo "AI Agent"
avulso com o Builder clássico num único canvas, onde dá para misturar blocos determinísticos
(os blocos de sempre do Builder) com blocos de "Agente" baseados em LLM. Não é um produto
comercial separado do resto da Blip: é a camada de construção de IA dentro da mesma
plataforma/Builder que já existia — quem já usa o Builder vê o Studio como uma extensão dele,
com um bloco novo ("Agente") e telas próprias de gestão de conhecimento, testes e qualidade.

### Telas e funções

#### Criação e configuração de um Agente ("Primeiros Passos")
- Um agente é um bloco no canvas do Studio ("Adicionar bloco" → "Agente"), configurável por
  um menu lateral com quatro abas: **Instruções**, **Ferramentas**, **Condições de saída** e
  (dentro de instruções) sub-configurações de modelo/resposta/interpretação.
- Na aba Instruções: escolha do modelo de linguagem entre uma lista relativamente grande de
  LLMs (GPT-5, GPT-5-mini, GPT-5-nano, GPT-5.1/5.4/5.6, e modelos Gemini 3.x), temperatura,
  limite de tokens, e liga/desliga de histórico de mensagens (memória curta). Também dá para
  escolher se a resposta vai direto pro canal ou fica guardada numa variável para outro
  agente reaproveitar, e o formato de saída (inclusive customizado).
- As instruções em si são adicionadas em **níveis**: Sistema (persona/regras gerais), Usuário
  (a pergunta específica), Agente (respostas anteriores do próprio agente, para manter
  coerência multi-turno) e Histórico (reaproveitar o histórico de mensagens de *outro*
  agente do mesmo fluxo). Cada instrução pode ser reordenada por drag-and-drop — a ordem
  importa para o comportamento. Existe um ícone de "escudo" que sugere textos de guardrail
  prontos (ex: não mencionar concorrente, ficar restrito à base de conhecimento).
- Na aba Ferramentas, o agente ganha acesso a Base de Conhecimento (RAG) e a ações
  determinísticas (ex: "Definir contato", que grava dados capturados na conversa nos campos
  do contato).
- Condições de saída definem para qual bloco o fluxo vai depois que o agente termina —
  inclusive permitindo montar uma arquitetura "orquestrador → agentes especialistas → volta
  pro orquestrador" (o próprio artigo usa esse exemplo com um agente de planos, um de
  produtos e um orquestrador).

Fonte: [Studio: Primeiros Passos - Configurações Básicas](https://help.blip.ai/hc/pt-br/articles/35031299389079-Studio-Primeiros-Passos-Configura%C3%A7%C3%B5es-B%C3%A1sicas)

#### Base de Conhecimento
- Estrutura em **catálogos** (agrupadores temáticos de arquivos e URLs). Um catálogo pode
  reunir vários formatos: XLSX, CSV, JSON, PDF, TXT, DOCX, PPTX, MD — cada tipo com limites
  de tamanho e boas práticas próprias documentadas (ex: PDF até ~250 mil caracteres/120-150
  páginas; XLSX precisa obrigatoriamente de uma coluna chamada "text").
- Um agente pode ter **várias** ferramentas de base de conhecimento simultâneas (ex: uma
  para "dúvidas técnicas", outra para "políticas de RH"), cada uma com nome e — mais
  importante — uma **descrição** que instrui o próprio agente sobre quando consultar aquela
  base. Isso é literalmente o mecanismo de roteamento de contexto do agente.
- Usa RAG (Retrieval Augmented Generation): o agente não lê o documento inteiro, busca só os
  trechos (chunks) mais relevantes; o número de chunks retornados por consulta é configurável
  (padrão 3, mais chunks = mais qualidade mas mais consumo de tokens).
- Tem **pré-processamento** opcional em três camadas antes de disponibilizar o documento:
  Otimização (limpeza de HTML/espaços, sem custo de IA), Indexação (um agente de IA gera
  resumo + palavras-chave por chunk — bom para FAQs e conteúdo fragmentado) e
  Contextualização (um agente de IA lê o documento inteiro e descreve "onde" cada trecho se
  encaixa — bom para manuais/contratos longos e estruturados). Os dois últimos consomem
  tokens de IA proporcionalmente ao tamanho do documento.

Fonte: [Studio: Base de Conhecimento](https://help.blip.ai/hc/pt-br/articles/35037154666903-Studio-Base-de-Conhecimento)

#### Testes Unitários
Provavelmente a peça mais madura do Studio para o objetivo do Pipe (monitoria/QA de IA):

- Um teste é uma sequência de pares "mensagem de entrada → resposta esperada". A entrada pode
  ser texto ou URL pública; a resposta esperada pode ser texto e/ou validação de arquivo
  (tipo e quantidade exatos).
- Duas métricas de comparação textual: **Similaridade** (permite variação — configura-se um
  limiar, ex.: 6.5 = pelo menos 65% de similaridade — ideal para agentes de IA) e
  **Correspondência exata** (idêntico, inclusive pontuação — ideal para fluxos
  determinísticos).
- Ao rodar, o teste para na primeira interação que falhar; interações seguintes ficam como
  "Não executado". Status possíveis: Aguardando execução, Sucesso, Falha na métrica, Erro ao
  iniciar, Interrompido.
- **Histórico de execuções**: cada execução gera uma "versão"; a interface guarda as 5 mais
  recentes por teste. Cada execução é auditável no detalhe — mostra interação por interação,
  mensagem de entrada, resposta esperada, resposta recebida e **o JSON retornado** pelo
  agente.
- **Consumo de tokens por execução**: quando o teste usa agente de IA, dá pra abrir uma aba
  "Tokens" por interação, com Input, Input cached, Output e Total — inclusive quebrado por
  agente individual (nome, modelo, temperatura, limite de tokens, tokens de entrada/saída).
  A doc já lista as causas típicas de consumo alto: prompt extenso, muita instrução, histórico
  acumulado, base de conhecimento grande, múltiplas chamadas ao modelo, respostas longas,
  limite de tokens mal configurado.
- Testes Unitários se cruzam com a tela de **Logs e Eventos**: o fluxo recomendado é rodar o
  teste numa aba e acompanhar Logs e Eventos em outra para investigar onde a conversa
  divergiu do esperado.
- Limitações assumidas pela própria Blip: só mostra as 5 execuções mais recentes; não
  funciona em roteadores (só em chatbot individual); não substitui teste manual.

Fonte: [Testes Unitários](https://help.blip.ai/hc/pt-br/articles/35461439411607-Testes-Unit%C3%A1rios)

#### Bibliotecas de blocos — Habilidades prontas ("Packed Agents")
- É uma biblioteca de blocos pré-montados organizada em três camadas: **Habilidade** (um
  conjunto de blocos com função específica, ex: Onboarding, LGPD, Inatividade, Opt-In/Out,
  Algo Mais, Finalização, CSAT, Transbordo, Dados Pessoais, Cascata de Validação), **Agente**
  (um bloco de agente de IA pronto para um objetivo, ex: Agente de Cadastro) e **Caso de Uso**
  (combinação de habilidades + agentes para uma jornada completa, ex: Qualificação de Leads).
- Arquitetura recomendada: cada conjunto de blocos prontos fica isolado num Studio próprio,
  conectado por um roteador — a Blip desaconselha explicitamente juntar tudo num único Studio
  porque a alta interconexão vira um pesadelo de manutenção.
- Dois "casos de uso" prontos documentados em detalhe: um **Agente de FAQ** (arquitetura
  híbrida com RAG obrigatório antes de qualquer resposta, protocolo de "Knowledge Gap" —
  admitir que não sabe em vez de alucinar — e handoff humano só em casos de irritação real ou
  falha persistente) e um **Agente de Aquisição** (4 agentes especializados orquestrados:
  Orquestrador, Pedido, Carrinho Abandonado, Cadastro — monta um fluxo de vendas completo
  pelo WhatsApp, com detecção automática de carrinho abandonado e bloqueio de checkout sem
  cadastro completo).
- Cada habilidade importada chega com um bloco "Comece Aqui" com instruções de ativação, e a
  Blip recomenda apagar os blocos nativos de "Boas-vindas"/"Erro Padrão" gerados
  automaticamente para não duplicar.

Fonte: [Bibliotecas blocos - Habilidades prontas](https://help.blip.ai/hc/pt-br/articles/35462279759767-Bibliotecas-blocos-Habilidades-prontas)

#### Qualidade das conversas (o mais próximo de um "Scanner" documentado)
- A Blip calcula um **Conversation Quality Score** (0-100, classificado em Crítico/Regular/
  Bom/Excelente) a partir de 4 critérios com pesos diferentes: **Fluência** (peso 1 —
  fallbacks, repetição, erro de escrita), **Integridade** (peso 2 — ausência de conteúdo
  ofensivo/tóxico), **Resolução** (peso 3 — sentimento do usuário + se o objetivo foi
  atingido) e **Relevância** (peso 4 — resposta bateu com a intenção do usuário). Cada
  critério se decompõe em sub-critérios avaliados por modelos de IA numa escala -1/0/1, que
  depois passam por normalização e uma função sigmoide para virar o score final.
- É acessível em "Conversas > Performance" (nome em inglês da navegação: *Conversations >
  Performance*), com filtro por roteador (um, vários ou todos) e por período/data.
- A doc já entrega um guia de "o que observar / o que priorizar / o que otimizar": priorizar
  correções nos critérios de maior peso (Relevância e Resolução), tratar qualquer problema de
  Integridade como urgência máxima independente do peso, e olhar volume de ocorrência antes de
  esforço de implementação.
- **Não encontrei uma feature com o nome literal "Scanner"** documentada no help center. Uma
  busca externa trouxe uma frase solta descrevendo algo assim ("relatório integrado que
  analisa o histórico de conversas de uma marca e aponta ROI e caminhos de automação antes da
  implantação"), mas sem conseguir localizar o artigo de origem — pode ser um nome de
  campanha/pitch comercial e não uma tela real, ou um recurso muito recente ainda sem
  documentação pública. Tratando com cautela: o Conversation Quality Score é a funcionalidade
  documentada que mais se aproxima do que foi pedido (avaliar a jornada por múltiplos eixos),
  mas ele mede qualidade conversacional, não engajamento/eficiência de negócio como tal.

Fonte: [Conversation quality](https://help.blip.ai/hc/en-us/articles/32870048018199-Conversation-quality)

#### Relação com o Builder clássico
O material de "Primeiros Passos" trata o Studio como uma extensão do Builder, não como
ferramenta separada: você continua desenhando o fluxo no mesmo canvas, só que agora tem um
tipo de bloco novo (Agente) que pode conviver lado a lado com os blocos determinísticos de
sempre (mensagem, lógica, redirect). A Biblioteca de blocos reforça isso — as "Habilidades"
são compostas dos mesmos blocos clássicos do Builder (LOGIC, MSG, INPUT, REDIRECT), só que
pré-montados, e os "Agentes"/"Casos de Uso" acrescentam blocos de IA por cima dessa base.

### O que o Pipe deve aproveitar

- O padrão de **instrução em níveis** (Sistema/Usuário/Agente/Histórico) com reordenação por
  drag-and-drop é um jeito elegante de expor prompt engineering sem virar uma caixa de texto
  única gigante — vale copiar essa granularidade na tela de configuração de agente do Pipe.
- **Testes Unitários com histórico de execução + JSON retornado + consumo de tokens por
  agente** é exatamente o tipo de monitoria com IA que o Pipe quer entregar — é a peça mais
  diretamente reaproveitável de toda a pesquisa. Vale copiar a separação clara Input/Input
  cached/Output/Total e a atribuição de consumo por agente individual dentro de um mesmo
  teste multi-agente.
- A ideia de **descrição da ferramenta como mecanismo de roteamento** (o agente decide qual
  base de conhecimento/ferramenta usar lendo a descrição que o builder escreveu) é um padrão
  de design que evita hardcodar lógica de decisão — o Pipe deveria adotar isso ao invés de
  "if intenção == X".
- O **Conversation Quality Score** com pesos por critério e faixas de classificação é um bom
  esqueleto de métrica de qualidade para a monitoria com IA do Pipe — dá pra adaptar os 4
  eixos (fluência, integridade, resolução, relevância) ou propor eixos próprios, mas a lógica
  de "score ponderado + drill-down por sub-critério" é reaproveitável.
- A **biblioteca de blocos por camadas (Habilidade/Agente/Caso de Uso)**, com a recomendação
  explícita de isolar cada conjunto por roteador para não acoplar demais, é uma lição de
  arquitetura que o Pipe deve levar para sua própria "biblioteca de fluxos prontos" — evita
  reinventar CSAT, LGPD, opt-in, etc. do zero para cada cliente.
- O guia de pré-processamento de base de conhecimento (Otimização/Indexação/
  Contextualização, com uma "regra de ouro" clara de quando usar cada um) é um diferencial
  de produto que o Pipe pode oferecer de forma mais simples: um único toggle "meu documento é
  uma coleção de fatos" vs. "meu documento é uma história/manual".

### Fontes (URLs)

- https://help.blip.ai/hc/pt-br/sections/35030785001879-Studio
- https://help.blip.ai/hc/pt-br/articles/35031299389079-Studio-Primeiros-Passos-Configura%C3%A7%C3%B5es-B%C3%A1sicas
- https://help.blip.ai/hc/pt-br/articles/35037154666903-Studio-Base-de-Conhecimento
- https://help.blip.ai/hc/pt-br/articles/35461439411607-Testes-Unit%C3%A1rios
- https://help.blip.ai/hc/pt-br/articles/35462279759767-Bibliotecas-blocos-Habilidades-prontas
- https://help.blip.ai/hc/en-us/articles/32870048018199-Conversation-quality

---

## Blip Copilot / Desk Actions

### O que é

O Blip Copilot é a camada de IA generativa **dentro do atendimento humano** (Blip Desk):
um assistente que dá contexto rápido ao atendente sobre quem é o cliente, sugere respostas
baseadas numa base de conhecimento própria (separada da base de conhecimento do Studio) e
melhora o texto que o atendente está digitando. "Desk Actions" aparece na comunidade da Blip
como uma evolução declarada do Copilot — em vez de só ajudar o atendente a responder, o
Copilot passaria a **executar tarefas** em nome do atendente — mas não encontrei um artigo
de central de ajuda dedicado a essa funcionalidade (ver Lacunas).

### Telas e funções

#### Habilitação e permissionamento
- Só um usuário com perfil **Administrador** do contrato consegue ativar o Copilot.
- Elegibilidade por plano: incluso automaticamente em planos novos (MVO); em planos antigos
  (ex: Enterprise) precisa de uma exceção comercial negociada com o CSM; **não existe** no
  plano Trial.
- Depois de ativado no bot, um administrador liga/desliga por atendente individual as
  permissões de "Response Suggestion" e "Smart Summaries" direto pelo Portal, sem precisar
  abrir chamado com o suporte da Blip (Portal → contrato → Blip Copilot → bot → Atendimento →
  Agentes → ícone de permissões).

#### As quatro funções do Copilot dentro do ticket
- **Smart Summaries**: ao abrir o ticket, a IA já mostra um resumo com o que o cliente
  informou ao bot/em conversas anteriores, o motivo do contato atual, quantos tickets esse
  cliente abriu nos últimos 30 dias e o sentimento da conversa. Ao fechar o ticket, gera
  também um resumo final consolidado com o sentimento de encerramento.
- **Transcrição de áudio (Speech to Text)**: quando chega um áudio no ticket, aparece um
  botão "Transcrever áudio" — não é automático, o atendente precisa clicar.
- **Sugestão de resposta**: sob demanda (botão no Desk), a IA olha o contexto da conversa +
  a base de conhecimento configurada e entrega **duas opções** de resposta prontas, que o
  atendente pode editar antes de enviar.
- **Melhorar texto**: corrige gramática, padroniza tom e aumenta clareza do que o próprio
  atendente escreveu.

#### Configuração técnica
- Base de conhecimento própria do Copilot (separada da do Studio), aceitando .pdf, .xls,
  .txt ou .tsv, com um formato de linha bem específico: `NOME_DO_CONTEXTO (maiúsculo) |
  texto`, podendo ter uma segunda coluna de "tag de contexto" para sub-tópicos. Atualizar a
  base = substituir o arquivo inteiro (não dá para editar incrementalmente).
- Formulário de configuração por bot: Nome da empresa (obrigatório, define o "papel" que o
  Copilot assume), demanda(s) de suporte no Desk (obrigatório), diretrizes adicionais
  (opcional) e um **Perfil de tom** (Amigável / Descontraído / Técnico).
- Mensagens de boas-vindas configuráveis (até ~3 recomendadas), com variáveis dinâmicas
  `${NAME}`/`${LASTNAME}` que puxam o nome do atendente logado — só são sugeridas quando a
  conversa ainda só tem mensagens do cliente (ninguém do time respondeu ainda).
- **Temperatura ajustável** entre 0.1 e 0.5 (padrão 0.2) — a doc recomenda mexer só se
  souber o impacto técnico.

#### Relatórios do Copilot
- Indicadores em tempo real: taxa de adoção por atendente, número de tickets assistidos,
  comparação do **AHT (tempo médio de atendimento) com e sem uso do Copilot**, e taxa de
  edição das respostas sugeridas (quanto o atendente mexeu no texto sugerido antes de
  mandar).
- Exportação em .xlsx do histórico de sugestões/escolhas e resumos de atividade, limitado a
  janelas de até 60 dias.

#### Desk Actions
A comunidade da Blip descreve essa peça como "mais do que ajudar no dia a dia — com Desk
Actions o Copilot vai executar tarefas pelos atendentes humanos", no mesmo espírito do que o
AI Agent do Studio já faz via *Custom Skill* (conectar a APIs externas para agendar, sugerir
produto, processar pagamento etc.), só que citado no contexto do Desk. **Não achei artigo de
central de ajuda dedicado** — só a menção num post de comunidade que, ao tentar abrir,
redirecionou para o feed (provavelmente exige login). Tratar como funcionalidade em rollout/
anunciada, não como tela documentada e estável.

### O que o Pipe deve aproveitar

- **Smart Summaries automático ao abrir o ticket** é um ganho de produtividade muito direto
  e barato de implementar — a lista de campos (o que já foi dito ao bot, motivo do contato,
  tickets nos últimos 30 dias, sentimento) é praticamente uma especificação pronta para a
  tela de atendimento do Pipe.
- O par **"sugestão sob demanda com 2 opções editáveis" + "taxa de edição da sugestão"** é um
  bom desenho de métrica de confiança na IA: se o atendente sempre reescreve a sugestão, o
  prompt/base de conhecimento está ruim — isso é uma métrica de monitoria de IA que o Pipe
  deveria nascer medindo desde o dia um.
- Comparar **AHT com e sem uso da IA** é o argumento de ROI mais direto que existe para
  convencer um gestor a manter o assistente ligado — o Pipe deveria expor esse comparativo
  nativamente, não como relatório à parte.
- O formato de base de conhecimento do Copilot (linha = contexto + texto, com tag opcional
  de subcontexto) é mais rígido que o RAG do Studio, mas é mais previsível para casos
  simples — vale considerar os dois modos (RAG "solto" vs. base tabular rígida) dependendo
  da maturidade do cliente do Pipe.
- Vale acompanhar a evolução de "Desk Actions" como sinal de mercado: a Blip está migrando
  de "IA que sugere" para "IA que executa" dentro do atendimento humano — é a direção que a
  monitoria+automação do Pipe também deveria seguir, mas sem repetir o problema de lançar a
  funcionalidade sem documentação madura.

### Fontes (URLs)

- https://help.blip.ai/hc/en-us/articles/21860799152279-How-to-Use-Blip-Copilot
- https://community.blip.ai/acontece-na-blip-31/blip-desk-ia-empoderando-seus-agentes-de-atendimento-4484 (mencionado, conteúdo não confirmado — ver Lacunas)

---

## Outros produtos novos encontrados

### STILINGUE (Social Listening / STILINGUE Studio)

A Blip incorporou a STILINGUE, uma plataforma de **escuta social** (monitoramento de menções
e conversas públicas na internet) com um motor de IA próprio para português do Brasil (e
também com foco em espanhol e inglês). Serve para entender o que falam de uma marca nas
redes, detectar crise antes de escalar e extrair sentimento/insight de comunidades online —
é uma ferramenta de inteligência de mercado, não de atendimento 1:1. Dentro dela existe o
**STILINGUE Studio**, que monta dashboards customizados em tempo real a partir dos dados de
pesquisa coletados, com apoio de uma equipe de consultoria da Blip para montar o primeiro
dashboard. Não é o mesmo "Studio" do item anterior (nome coincide, produto é outro).

Fonte: [What is STILINGUE?](https://help.blip.ai/hc/en-us/articles/17830214105495-What-is-STILINGUE)

### Blip Marketing, Blip Nexus, Blip Insights

**Não encontrei** nenhuma página na central de ajuda pública (help.blip.ai) com esses nomes.
Pode ser que sejam nomes de campanha/material comercial (site institucional blip.ai) sem
documentação de produto própria, ou produtos ainda não lançados/sem doc pública no momento
desta pesquisa. Não vou especular funcionalidade para eles.

---

## Lacunas

- **"Scanner"**: não encontrei uma tela ou artigo com esse nome exato na documentação
  pública. O mais próximo documentado é o *Conversation Quality Score* (Studio), que avalia
  fluência/integridade/resolução/relevância — mas isso é qualidade conversacional, não
  necessariamente o "engajamento, eficiência e performance" descrito no pedido original. Uma
  busca externa trouxe uma frase solta sugerindo um relatório de ROI/automação chamado
  Scanner, mas não consegui localizar o artigo de origem para confirmar — tratar como não
  verificado.
- **Desk Actions**: só achei menção num post de comunidade (não numa página de central de
  ajuda); ao tentar abrir esse post durante a pesquisa, o site redirecionou para o feed
  (provável necessidade de login). Não há detalhamento de tela, permissões ou exemplos de
  tarefa executada — a funcionalidade parece estar em fase de anúncio/rollout, sem
  documentação madura equivalente à do resto do Copilot.
- **Blip Go Personal**: os dois artigos de "Instruções" e "Atendimento" que apareceram nos
  resultados de busca retornaram página 404 no momento da pesquisa (podem ter sido
  renomeados/despublicados). A visão de produto veio de "Como funciona o Blip Go Personal",
  mas não há um passo a passo de configuração equivalente ao que existe para o Blip Go
  padrão.
- **Métricas de campanha (Blip Go)**: a tela de Mensagens Ativas documenta só contagens
  absolutas (Audiência, Falhas, Recebidas, Lidas) — não achei confirmação de uma métrica de
  "Respondida" nem de taxas percentuais de resposta/falha prontas na interface, então não dá
  para afirmar que esse "mini-dashboard de funil com taxas" já existe do jeito descrito no
  pedido original.
- **Blip Marketing / Blip Nexus / Blip Insights**: nenhum resultado na central de ajuda
  pública — não foi possível mapear.
- **Packed Agents**: o termo aparece no índice da seção Studio, mas o conteúdo do artigo usa
  a nomenclatura "Habilidades / Agentes / Casos de Uso" — não fica claro se "Packed Agents" é
  sinônimo oficial ou um rótulo de índice desatualizado.

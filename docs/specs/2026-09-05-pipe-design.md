# Pipe — desenho do produto

Data: 2026-09-05 · Estado: aprovado verbalmente pelo Anderson, pendente de revisão escrita

## 1. O que é

Pipe é uma plataforma de **CRM + atendimento + monitoria com IA** para empresas, construída para
ser vendida pela PJ de tecnologia do Anderson. Substitui a combinação cara e fragmentada que as
empresas usam hoje — uma plataforma de chat, um CRM e uma ferramenta de qualidade — com três
diferenciais que nenhuma delas entrega junto:

1. **WhatsApp pela API oficial da Meta** — o cliente para de correr o risco de perder o número.
2. **Desk do atendente separado do app de gestão** — o atendente vê só o que precisa para atender.
3. **Monitoria de atendimento com IA** — avaliação automática, insights e demandas recorrentes,
   no lugar de amostragem manual.

### Decisões já tomadas

| Decisão | Escolha | Quando |
|---|---|---|
| Estratégia de construção | **Do zero**, com Twenty e Chatwoot como mapa funcional | 05/09/2026 |
| Reuso de código | Permitido só de pacote MIT (ver §2) | 05/09/2026 |
| Modelo de negócio | Produto vendido pela PJ; multi-tenant desde a primeira linha | 05/09/2026 |
| Separação Desk/Gestão | Dois apps distintos, não um app com permissão | 05/09/2026 |

## 2. Regra de licença e reuso — vinculante

Copiar o código errado inviabiliza a venda do produto. A regra não tem exceção.

**Pode copiar** (MIT; manter o aviso de copyright no arquivo):

- `chatwoot/*` — **exceto** `chatwoot/enterprise/**`
- `twenty/packages/twenty-ui`, `twenty-shared`, `twenty-sdk`, `twenty-client-sdk`

**Não pode copiar — ler e reimplementar:**

- `twenty/packages/twenty-server` e `twenty-front` — **AGPLv3**. Código derivado desses pacotes
  obriga a publicar o código do Pipe para qualquer usuário que o acesse pela rede, o que mata a
  venda de licença fechada.
- `chatwoot/enterprise/**` — licença proprietária paga. É onde ficam, no Chatwoot, a distribuição
  por carga real, o RBAC customizado, o SLA e o copiloto de IA. Todos serão escritos do zero aqui.

**Documentação de terceiros** (help.blip.ai, docs do Chatwoot e do Twenty): o comportamento de
uma função não é protegido por copyright, o texto que a descreve é. Descrever o comportamento com
nossas palavras é livre; colar o texto deles não.

Todo arquivo que contiver código copiado carrega no topo o comentário
`Adaptado de <projeto> (<licença>) — <url do arquivo original>`.

## 3. Arquitetura

Um monorepo, cinco aplicações, um banco.

```
pipe/
  apps/
    desk        Next.js   tela do atendente
    gestao      Next.js   monitoramento, relatórios, regras, monitoria
    crm         Next.js   leads, oportunidades, contas, contatos
    api         NestJS    REST + WebSocket; dono das regras de domínio
    workers     NestJS    BullMQ: entrega de mensagem, IA, agregações, relatórios
  packages/
    ui          design system Pipe (tokens, componentes, marca)
    db          Drizzle: schema, migrations, políticas RLS
    core        regras puras e testáveis: score, esforço, SLA, distribuição, métricas
    ai          resumo, classificação e avaliação — Claude
    contracts   tipos e schemas Zod compartilhados entre api e fronts
    mcp         servidor MCP: expõe consulta e ações do Pipe a agentes de IA
```

- **Postgres** único. `tenant_id` em toda tabela de negócio, com Row Level Security ligada.
- **Redis + BullMQ** para fila de trabalho e agendamento.
- **WebSocket** com canal por tenant e por conversa, para o realtime do Desk e do Monitoramento.
- **Docker Compose** atrás do Traefik que já roda na VPS OVH (`149.56.12.166`, `/opt/stack`).

### Por que três front-ends e não um com permissão

É a lição direta da Blip: o Desk do atendente tem cinco ícones e nada mais — sem relatório, sem
regra, sem configuração de fila. Isso não é resultado de esconder menu por papel; é resultado de
ser outro aplicativo, com outro modelo mental e outro ciclo de release. Esconder por permissão
produz uma tela cheia de caminhos mortos e um bundle que carrega código que o atendente nunca usa.

Os três fronts compartilham `packages/ui` e `packages/contracts`, e falam com a mesma `api`.

### A base visual: `twenty-ui` com os tokens do Pipe por cima

Decisão tomada com precedente próprio. O `blip-dash` já faz exatamente isso: usa o `twenty-ui`
(MIT) como base estrutural e sobrescreve os tokens `--t-*` com a paleta da marca, e com isso
Button, Tag, MenuItem, TabButton e Checkbox passam a renderizar na identidade certa **sem que
nenhum componente do pacote seja tocado ou forkado**. O Pipe repete o método com a paleta moss.

Duas lições caras que vêm de graça junto, registradas no próprio `blip-dash/app/globals.css`:

- **A densidade do Twenty é ancorada em 13px.** Os tokens de fonte são `rem` e o app deles roda com
  `html { font-size: 13px }`. Trocar essa régua por uma escala de 16px alarga cada coluna e joga
  tabela para a rolagem horizontal. Desk e Gestão são ferramentas densas: mantemos a régua de 13px.
  Espaçamento e raio do Twenty já são px e não precisam de âncora.
- **Severidade na linha, não só no texto.** O `blip-dash` colore a linha inteira da tabela por
  tempo de espera, com três degraus (atenção, grave, crítico) e cada degrau definido como um trio
  fundo/borda/texto num token só, porque duas cópias de um hex sempre viram duas cores diferentes.
  O Pipe usa o mesmo padrão no monitoramento e na fila de avaliação.

**O que o `twenty-ui` dá e o que ele não dá.** Ele entrega a arquitetura de tema (objeto TypeScript
tipado, `spacing()` como múltiplo de 4px, tokens de componente centralizados), a escala de raio
(2/4/8/16/999), a fachada de ícones sobre o Tabler Icons, e os primitivos: Button, IconButton,
Checkbox, Radio, Toggle, Avatar, Modal, Tooltip, Loader e a família `MenuItem*` que compõe dropdown.

Ele **não** entrega tabela nem board — isso mora no `twenty-front`, que é AGPL e está fora do que
podemos copiar. Também não há virtualização em nenhuma das duas referências: o Chatwoot faz rolagem
infinita por `IntersectionObserver`. Como as filas e listas do Pipe serão genuinamente grandes,
tabela e virtualização entram por bibliotecas MIT próprias — **TanStack Table** e **TanStack
Virtual** — e não por cópia.

Uma lacuna comum às duas referências que o Pipe resolve desde o início: nenhuma tem um
**Chip/Badge genérico**; cada uma reimplementa o seu por contexto. No Pipe é um componente só,
porque etiqueta, faixa de score, status de SLA e conceito de avaliação são todos a mesma forma.

### Por que a lógica vive em `packages/core`

Score, esforço, SLA, distribuição por carga e cálculo de métrica são funções puras: entram dados,
sai número. Isoladas em `core`, são testáveis sem banco, sem HTTP e sem dublê — e é exatamente aí
que erro de cálculo custa caro, porque vira número em relatório que o cliente usa para decidir
sobre gente.

## 4. Módulos e fronteiras

Seis módulos. Cada um com dono claro, interface explícita, e compreensível sozinho.

### 4.1 Identidade e Tenancy

`tenant` · `usuario` · `papel` · `permissao` · `equipe` · `membro_equipe` · `sessao`

Base de tudo; não depende de ninguém. Papéis do dia 1: **administrador**, **gestor**,
**supervisor**, **atendente**, **avaliador**. Permissão é lista de capacidades nomeadas, não flag
booleana espalhada pelo código.

O `tenant` carrega a personalização: nome, logo, cor primária, fuso, idioma. White-label é
configuração, nunca build separado.

### 4.2 CRM

`conta` · `contato` · `lead` · `oportunidade` · `formulario` · `formulario_versao` ·
`formulario_pergunta` · `resposta_formulario` · `regra_score` · `score_lead` · `atividade`

**A decisão que evita repetir o erro do Salesforce.** A org de hoje tem 353 campos no Lead, 304
deles customizados, porque cada pergunta de formulário virou uma coluna
(`Com_que_frequencia_vcposta_reels__c`, `Como_se_sente_em_rela_o_ao_seu_banco__c`). Aqui:

- pergunta de formulário vira **linha** em `resposta_formulario` (formulário + versão + pergunta +
  valor tipado), não coluna;
- só o punhado de campos que o negócio filtra o tempo todo sobe para coluna do `lead`;
- campo customizado por tenant existe, declarado em `campo_customizado` e guardado em JSONB com
  índice GIN — não vira DDL em tempo de execução.

**Score é objeto de primeira classe.** `regra_score` (condição, peso, versão, ativa) produz
`score_lead` (valor, faixa, versão da regra, explicação por regra, timestamp). Duas consequências
que a estrutura atual não dá: responder *por que* este lead tirou 62, e recalcular a base inteira
quando a regra muda, sem perder o histórico. A faixa é a saída do motor, e é ela que decide fila e
proprietário — replicando o comportamento do webhook n8n `kq4lU8aFv5CKNpvr` (60 ou mais vai para
closer, abaixo disso para o Comercial).

**Importação de outros CRMs** é um mapeamento origem → campo Pipe, com pré-visualização,
deduplicação por CPF, e-mail ou telefone, e relatório de linhas rejeitadas. Salesforce, HubSpot,
RD Station e CSV.

### 4.3 Conversas

`canal` · `inbox` · `conversa` · `mensagem` · `anexo` · `fila` · `atribuicao` · `pausa` ·
`resposta_pronta` · `etiqueta` · `nota_interna`

Canais do dia 1: **WhatsApp Cloud API oficial**, **e-mail** e **widget de site**. Os três caem na
mesma tela do Desk — um dos pedidos explícitos.

Os requisitos da tela do atendente estão detalhados em
[`2026-09-05-desk-requisitos.md`](2026-09-05-desk-requisitos.md).

**Entrega de mensagem é o coração, e é onde a concorrência falha.** A lista de bugs da comunidade
da Blip é literalmente a lista de requisitos. Portanto:

- toda mensagem de saída passa por **outbox** com estado próprio
  (`pendente → enviando → enviada → entregue → lida | falhou`) e retry com backoff;
- falha é **visível na tela do atendente**, com motivo e botão de reenviar — nunca silenciosa;
- mídia sobe primeiro para o storage e só depois é referenciada no envio, com verificação de tipo
  e tamanho antes de chamar a Meta;
- o estado da conversa é máquina de estados explícita, e evento do usuário final não pode levá-la
  a estado inválido.

**A janela de 24 horas é conceito de primeira classe, não detalhe de integração.** No WhatsApp, a
mensagem do cliente abre uma janela de atendimento de 24 horas contada a partir da última mensagem
*dele*. Dentro dela a empresa responde em texto livre. Fora dela só sai **template aprovado pela
Meta**, e a resposta do cliente ao template reabre a janela. Isso governa três coisas ao mesmo
tempo, e por isso não pode ficar escondido no adaptador do canal:

- **A tela.** O Desk mostra o tempo restante da janela na conversa. Quando ela fecha, o campo de
  texto livre é substituído pelo seletor de template, com o motivo escrito — não um erro depois do
  envio. Conversa perto de expirar aparece destacada na lista.
- **O custo.** Cada mensagem de saída registra se foi livre ou template, e em qual categoria
  (utilidade, marketing ou autenticação). É o que permite o relatório de custo por fila, por
  campanha e por atendente. A tabela de preços da Meta muda com frequência e entra como
  configuração por categoria, nunca embutida no código.
- **O relatório.** A janela é contada **a partir do envio**, não pelo dia do calendário. Esse é
  exatamente o defeito que a comunidade da Blip reclama: disparo às 17h do dia 25 perde as
  respostas do dia 26 na exportação. No Pipe, a resposta pertence ao disparo que a originou.

O mesmo conceito vale, com outro relógio, para os demais canais: e-mail e widget não têm janela,
e o modelo guarda `janela_expira_em` nulo — a regra é do canal, a tela é a mesma.

**Distribuição por carga real**, não round-robin. Cada atendente tem capacidade configurável, e a
carga é a soma ponderada das conversas abertas atribuídas a ele — conversa aguardando resposta do
atendente pesa mais que conversa aguardando o cliente. A escolha: entre os atendentes online,
habilitados na fila e abaixo da capacidade, vai para o de menor carga; empate desempata pelo que
está há mais tempo sem receber. Vive em `packages/core`, testado com tabela de casos.

### 4.4 Gestão

`evento_atendimento` · `metrica_diaria` · `regra_fila` · `regra_sla` · `horario_atendimento` ·
`esforco_atendente` · `relatorio_agendado`

Cada transição relevante da conversa grava um `evento_atendimento` imutável: entrou na fila,
atribuída, primeira resposta do atendente, resposta do cliente, transferida, pausada, encerrada,
avaliada. Toda métrica é derivada desses eventos, nunca de campo mutável na conversa — é isso que
permite recalcular o passado quando a definição de uma métrica muda.

A definição exata de cada métrica, dos status de encerramento, da elegibilidade e do SLA está em
[`2026-09-05-metricas-atendimento.md`](2026-09-05-metricas-atendimento.md), que é vinculante: todo
número em tela obedece àquele documento e tem teste correspondente em `packages/core`.

**Monitoramento em tempo real** replica os cartões da Blip, porque eles estão certos: na fila,
tempo máximo na fila, tempo máximo até a primeira resposta, em atendimento, média de tickets por
atendente, status dos atendentes (online, pausa, invisível), tempos médios do dia e tickets
perdidos, abandonados, finalizados e fechados. Abaixo, a tabela detalhada com abas por
atribuído/aguardando, atendentes, filas e etiquetas.

**Relatório semanal individual de esforço** usa a régua determinística já validada em produção
(implementação em `~/digisac-esforco`):

- caracteres escritos pelo atendente ÷ 200/min (digitação)
- caracteres recebidos do cliente ÷ 1.000/min (leitura)
- duração dos áudios recebidos (escuta em 1×) e dos áudios gravados (fala)
- duração de áudio estimada por tamanho quando não vier no metadado: Opus a ~16 kbps → 2 KB/s
- régua de apoio: tempo em sessão, somando intervalos entre mensagens consecutivas de até 10 min
- média ponderada por construção: esforço total ÷ tickets total, para que dia cheio pese mais

Ressalva registrada no relatório original, que o produto precisa expor: a régua assume texto
digitado à mão, então template e resposta pronta inflam o esforço. O Pipe desconta o conteúdo
originado de resposta pronta e o exibe em coluna separada.

**Regras** são condição → ação versionada, em três famílias separadas, como na Blip: regra de fila
(decide para onde a conversa vai), regra de SLA (o que dispara e o que acontece ao estourar) e
horário de atendimento (expediente, feriado, mensagem fora do horário).

### 4.5 Monitoria com IA

`formulario_avaliacao` · `grupo_criterio` · `criterio` · `avaliacao` · `resposta_avaliacao` ·
`contestacao` · `calibracao` · `plano_coach` · `insight` · `consumo_ia`

Modelo copiado em espírito do 2clix, que acertou a estrutura: formulário (grupo → critério → peso,
com critério fatal que zera a nota) × avaliação (avaliado, avaliador humano **ou** IA, nota,
conceito, etiquetas, sinalizações) × ciclo (feedback → contestação → calibração → coach).

O 2clix tem cerca de setenta relatórios. Eles não são setenta consultas: são recortes desse modelo
cruzado com a hierarquia (avaliado → superior → equipe → campanha). Acertando o modelo, o Pipe
entrega o mesmo com uma camada de relatório parametrizada, não com setenta telas.

**Avaliação automática:** ao encerrar, a conversa vira transcrição normalizada; o agente de IA
responde o formulário critério a critério, cada resposta com trecho citado como evidência. A nota
da IA nasce como **sugestão** e vira nota efetiva conforme a política do tenant — sempre, só acima
de um limiar de confiança, ou nunca (apoio ao avaliador humano).

**Calibração** é o mecanismo que mantém a IA honesta: uma amostra é avaliada por humano e por IA,
e o desvio por critério é medido e exibido. Critério que desvia demais é sinalizado para revisão de
prompt. É a bancada de medição que levou o `case-sync` de 26% para 64% de acurácia, generalizada.

**Insights e demandas recorrentes:** resumos e classificações de conversa são agregados por período
em `insight`, com volume, tendência e conversas de exemplo. É a tela onde o gestor decide o que
automatizar — o pedido original, e o `case-sync` generalizado.

**Consumo** registra tokens e chamadas por tenant, por funcionalidade e por modelo. Sem isso o
produto vende IA no prejuízo. Aparece como painel para o cliente e como base de cobrança.

### 4.6 Automação e extração

`fluxo` · `fluxo_versao` · `bloco` · `transicao` · `variavel_contexto` · `execucao_fluxo` ·
`workflow` · `gatilho` · `acao` · `execucao_workflow` · `consulta_salva` · `chave_api` · `webhook_saida`

Este módulo é o que transforma o Pipe de "sistema onde o dado entra" em "sistema de onde o dado
sai e onde o trabalho acontece sozinho". Três peças distintas, que costumam ser confundidas:

**1. Construtor de fluxo — a conversa automática.** Equivalente ao Builder da Blip. Um fluxo é um
grafo de blocos versionado: cada bloco tem entrada, conteúdo (mensagem, pergunta, chamada externa,
script), condições de saída avaliadas em ordem, e ações que gravam no contexto. O contexto da
conversa é um mapa de variáveis que atravessa o fluxo e sobrevive à transferência para humano —
é o que permite o atendente receber o cliente já sabendo o que o robô coletou.

Duas coisas que a Blip faz e nós copiamos porque estão certas: fluxo tem **versão publicada
separada da versão em edição**, e existe **teste do fluxo antes de publicar**, com histórico das
últimas execuções, payload e consumo de tokens. Uma que fazemos diferente: o bloco que chama IA
declara qual base de conhecimento usa e a resposta cita o documento — a mesma regra do copiloto do
Desk (§4.3).

**2. Ações no chat — automação na mão do atendente.** Dentro da conversa, o atendente aciona uma
automação com um clique: segunda via de boleto, consulta de pedido, agendamento. A automação pode
conversar com o cliente para coletar o que falta e devolve o controle ao atendente ao terminar,
sempre com o que fez registrado na linha do tempo da conversa. É o Desk Actions da Blip, que lá
ainda está em beta.

**3. Motor de workflow — automação do sistema, não da conversa.** Espelha o modelo do Twenty, que
é o mais completo do mercado aberto. Um workflow tem gatilho e uma cadeia de ações:

| Gatilho | Exemplo no Pipe |
|---|---|
| Evento de dado | lead criado, score mudou de faixa, conversa encerrada, avaliação abaixo de 60 |
| Agendado | relatório semanal de esforço toda segunda às 7h |
| Manual | botão "reprocessar score" numa lista de leads |
| Webhook | formulário do site publica um lead |

Ações: criar ou atualizar registro, enviar mensagem ou template, atribuir proprietário, mover de
fila, criar avaliação, chamar HTTP externo, rodar função de lógica em sandbox, e **acionar um
agente de IA**. Toda execução fica registrada com entrada, saída, duração e erro — workflow que
falha em silêncio é pior que workflow que não existe.

**4. Extração — a linguagem de consulta.** O que torna o SOQL bom não é ser SQL: é selecionar
campos explicitamente, atravessar relacionamento pai-filho sem escrever junção, e agregar. O Pipe
oferece uma linguagem com esse espírito, mas que **nunca vira SQL cru vindo do cliente**: a consulta
é analisada contra o dicionário de dados do tenant, e o `tenant_id` é imposto pelo servidor, não
pelo texto da consulta. Toda consulta pode ser salva, agendada e exportada em CSV, JSON ou Parquet,
e existe um **dicionário de dados** navegável que lista cada objeto, campo, tipo e significado —
inspirado no Dicionário de Dados da Blip, que resolve o problema real de ninguém saber o nome da
coluna.

**5. Servidor MCP — o Pipe como ferramenta de agente.** O mesmo catálogo de consultas e ações é
exposto como servidor MCP, com autenticação por chave de escopo limitado. Um agente de IA — Claude
no terminal do cliente, ou um agente dentro do próprio Pipe — consulta leads, conversas, avaliações
e métricas, e executa ações permitidas, sem que ninguém escreva integração. Isso é diferencial
concreto: nenhuma das plataformas de referência oferece.

A regra de segurança é a mesma da API: a chave carrega tenant e escopos, escopo de escrita é
separado de escopo de leitura, e toda chamada entra no log de auditoria com a chave que a fez.

## 5. O fluxo que costura os módulos

```
formulário do site
      │
      ▼
  Lead criado ──► motor de score ──► faixa ──► fila + proprietário
      │                                            │
      │                                            ▼
      │                                    conversa no WhatsApp
      │                                            │
      │                                atendimento e encerramento
      │                                            │
      │                     ┌──────────────────────┴──────────────────────┐
      │                     ▼                                             ▼
      │              resumo por IA                             avaliação da monitoria
      │                     │                                             │
      └─ timeline do Lead ◄─┘                                             ▼
                            │                                   nota, ofensores, coach
                            ▼
                 classificação agregada ──► demanda recorrente ──► decidir o que automatizar
```

## 6. Multi-tenant e segurança

- `tenant_id` em toda tabela de negócio; RLS ligada com política baseada em variável de sessão que
  a `api` define a cada requisição. Consulta sem tenant não retorna linha — falha fechada.
- Segredo de canal (token da Meta, senha SMTP) cifrado em repouso, com a chave fora do banco.
- Webhook de entrada validado por assinatura HMAC, com janela de tempo curta contra replay.
- Log de auditoria para o que muda regra, permissão, nota de avaliação e dado de contato.
- Conversa é dado pessoal: exclusão a pedido do titular precisa existir desde o começo, não depois.

## 7. Erro, e o que a concorrência ensina a não fazer

A lista de bugs reclamados na comunidade da Blip vira critério de aceite:

| Falha deles | Requisito nosso |
|---|---|
| Áudio que o atendente ouve e o cliente não recebe | Status por mensagem visível; falha de mídia com motivo e reenvio |
| Notificação não avisa ticket novo | Notificação em três camadas — som, contador na aba, push do navegador — com teste na configuração |
| Template com imagem falha | Validação da mídia do template antes do envio, com erro legível |
| Respostas prontas não carregam | Respostas prontas em cache local; funcionam com a rede oscilando |
| Ticket encerrado pelo usuário em fluxo humano | Máquina de estados explícita; evento do usuário não corrompe estado |
| Travamento do Desk web | Orçamento de performance por tela e reconexão de WebSocket com backoff |
| Loop infinito entre canais | Detector de laço: 10 mensagens entre o mesmo par origem/destino em 60 segundos pausa o canal e alerta |

## 8. Testes

- `packages/core`: tabela de casos para score, esforço, SLA, distribuição e cada métrica. Todo
  número que aparece em relatório tem teste com valor esperado escrito à mão.
- `apps/api`: teste de integração por caso de uso, com banco real em container.
- Entrega de mensagem: teste com a API da Meta dublada, cobrindo falha, retry e duplicata.
- Monitoria: conjunto de referência de conversas com nota humana; a acurácia da IA é medida contra
  ele a cada mudança de prompt, e a métrica é registrada — a bancada do `case-sync`.
- Fronts: teste do caminho crítico do atendente (receber, responder, transferir, encerrar).

## 9. Fases

| Fase | Entrega | Depende de |
|---|---|---|
| 1 | Fundação: monorepo, `db` com RLS, Identidade e Tenancy, `ui` com a marca | — |
| 2 | Conversas: WhatsApp oficial, filas, distribuição por carga, e o **Pipe Desk** | 1 |
| 3 | Gestão: eventos, monitoramento em tempo real, métricas, esforço, regras e SLA | 2 |
| 4 | Monitoria com IA: formulário, avaliação automática, calibração, insights, consumo | 3 |
| 5 | CRM: leads, formulários versionados, score, importação, e a ponte com Conversas | 1 |
| 6 | Automação e extração: workflow, construtor de fluxo, ações no chat, consulta e MCP | 2 e 5 |

O módulo 6 não é sobremesa. O **motor de workflow** e a **linguagem de consulta** entram cedo, no
fim da fase 3, porque metade das "funcionalidades" pedidas depois — relatório agendado, roteamento
por score, avaliação disparada no encerramento, alerta de SLA — são workflows, e construí-las uma a
uma na mão é o caminho para um sistema que não se estende. O **construtor visual de fluxo** e as
**ações no chat** são a parte cara e vêm depois, na fase 6. O **servidor MCP** é barato assim que a
consulta existir: ele é uma fachada sobre o mesmo catálogo.

O CRM fica por último de propósito, e isso não trava as fases anteriores: o Desk da fase 2 atende
conversa que chega pelo canal, sem depender de lead cadastrado, e o contato já existe em Conversas.
O fluxo do §5 só fecha inteiro na fase 5, quando o lead passa a nascer de formulário com score e o
resumo do atendimento passa a subir para a linha do tempo dele.

A Monitoria (fase 4) é o único módulo que também funciona sozinho, plugado na Blip, na Digisac ou
no Chatwoot que o cliente já usa. Se aparecer oportunidade de receita antes da fase 4, ela pode ser
antecipada como produto independente sem quebrar este desenho — o que muda é só a origem da
transcrição.

## 10. Fora de escopo agora

Adiados de propósito, para não inflar a fundação:

- Telefonia e voz.
- Marketplace de extensões.
- Aplicativo móvel nativo. O Desk é web responsivo.
- Metadata engine com DDL em tempo de execução, no estilo Twenty. Campo customizado em JSONB
  resolve por muito tempo, sem a complexidade de migração de schema por tenant.
- Instagram, Messenger e Telegram. A arquitetura de canal já prevê, mas não entram no dia 1.

## 11. Em aberto

1. **Origem dos insights quando o lead não vem por canal oficial.** Pergunta registrada pelo
   Anderson em 05/09: se o Chatwoot do cliente está integrado por caminho não oficial e recebe lead
   do site, de onde sai o insight da IA? Resposta provável: da transcrição, que existe
   independentemente de o canal ser oficial — o canal oficial protege o número, não a análise.
   A confirmar antes da fase 4.
2. **Política padrão de nota da IA**: sugestão sempre, automática acima de um limiar de confiança,
   ou só apoio ao avaliador humano.
3. **Preço e unidade de cobrança** — por atendente, por conversa, por avaliação, ou híbrido. Define
   o que o `consumo_ia` precisa medir.

# Blip Desk, medido

Medição da tela do atendente da Blip. **Esta versão foi conferida contra a folha de
estilo compilada da aplicação deles** — 969 KB, 3.349 seletores, salva junto com a
página inteira. É a primeira vez que a medida tem uma fonte que se pode reconferir:
até aqui tudo vinha de `getComputedStyle` numa sessão viva e de captura de tela.

Três fontes, na ordem de confiança:

1. **A folha de estilo compilada**, em `supernova.desk.blip.ai/static/css/app.<hash>.css`.
   É de onde sai todo número desta página que traga um seletor ao lado. Onde ela e a
   medição por captura discordam, **a folha ganha**, e a divergência está marcada.
2. **O arquivo de configuração**, em `supernova.desk.blip.ai/static/settings.<hash>.json`.
   É de onde saem os tempos e limites da operação (§9).
3. **A aplicação rodando**, medida antes com a sessão ativa e o atendente Invisível.
   Continua valendo para o que não está na folha — o que vem de componente web
   (`bds-*`), cujo estilo mora dentro do `shadowRoot` e não na folha.

**Nada daqui é código copiado.** O seletor aparece ao lado do número como referência de
medição — "medi aqui, deu tanto" —, do mesmo jeito que se cita a página de um livro.
Nenhum bloco de regra deles foi colado, nenhum nome de classe deles entra no nosso CSS,
e nenhum valor de cor deles entra em lugar nenhum. **Cor sai sempre dos nossos `--p-*`.**

## 0. O truque de medição, e por que ele importava menos do que parecia

O aviso do levantamento anterior continua válido: **`getComputedStyle` no elemento
hospedeiro mente**. Todo `bds-typo` devolve `16px` no host, para qualquer texto; o
tamanho real vive no elemento dentro do `shadowRoot`.

| O que o host diz | O que o shadow diz | Onde aparece |
|---|---|---|
| 16px | 20 / 600 / entrelinha 20px | Título de tela |
| 16px | 16 / 400 / entrelinha 24px | Corpo, rótulo, item de menu |
| 16px | 14 / 400 / entrelinha 21px | Contador de aba |

Régua de tipo deles: **20 / 16 / 14**, mais um **10px** que aparece no horário abaixo do
balão (`.blip-card .notification`, `font-size: 10px; line-height: 14px`). A folha
confirma os dois extremos.

O que mudou: quase tudo o mais **não** precisava do truque. A folha traz a medida
direta, e é por isso que este documento pôde corrigir sete valores.

---

## 1. As correções

Sete medidas do levantamento por captura estavam erradas ou incompletas. Todas já foram
aplicadas em `apps/desk`.

| # | O que | Estava | É | Onde medi |
|---|---|---|---|---|
| 1 | **Canto do balão de saída** | `13 2 13 13` — recorte em cima à direita | `13 13 2 13` — recorte **embaixo** à direita | `.blip-message-group .blip-card-group>:first-child …>.bubble.right` |
| 2 | **Canto do balão de saída, dentro do grupo** | continuava `13 2 13 13` | `13 2 2 13` — os dois cantos da direita encolhem | `…>:not(:first-child) …>.bubble.right` |
| 3 | **Cartão selecionado na lista** | preto 16% sobre superfície 1 | **superfície 3** + preto **12%**; com o cursor, 16% | `.active` e `.active:hover` do item de lista |
| 4 | **Topo do painel do contato** | 57px, caindo para 49px na faixa estreita | **49px é o padrão**; 57px é que aparece **abaixo de 1440** | `.drawer-heading` e sua consulta de mídia |
| 5 | **Cabeçalho da conversa** | recuo lido só na lateral (24px) | **24px em volta**, inclusive em cima e embaixo | `.pane-chat-header .chat-header { padding: 1.5rem }` |
| 6 | **Bloco de busca da coluna** | "50px" | o bloco de busca custa **80px** da altura da coluna | diferença entre `.list-content` e `.list-content-with-search` |
| 7 | **Faixa de 1440** | não existia no levantamento | o bloco de estado sobe para **117px** entre 1112 e 1440 | consulta de mídia sobre `--sidenav-header-min-height` |

Duas medidas novas, que simplesmente faltavam:

| O que | Valor | Onde |
|---|---|---|
| **Piso e teto do compositor** | `min-height: 150px`, `max-height: 420px` | `.pane-chat-message-input__container` |
| **Piso do painel do contato** | `min-width: 260px` | `.drawer` |

E dois degraus do trilho que estavam subestimados: a passagem do cursor é **8%** e o item
em vigor é **16%** (`--color-hover` e `--color-pressed`, com os valores de recurso
`rgba(0,0,0,.08)` e `rgba(0,0,0,.16)`). Estavam em 6% e 10% no nosso CSS, e a diferença
entre os dois ficava abaixo do que se enxerga.

---

## 2. Proporção geral, que não é em pixel

Confirmado na folha, sem correção:

```
sidenav   25%
pane-chat 50%
drawer    25%,  min-width 260px
```

Em 1920 isso dá: trilho 80 · lista 460 · conversa 920 · painel 460.

As faixas, na ordem em que a folha as declara — **são cinco, e não quatro**:

| Faixa | O que muda |
|---|---|
| acima de **1600** | recuo do rolador de mensagens vai a 40px/64px |
| até **1600** | com o painel fechado, a conversa vai a 75% |
| até **1441** | troca de conjunto de itens visíveis (`show-above-large` / `show-below-large`) |
| até **1440** | bloco de estado a 117px, topo do painel a 57px |
| até **1112** | painel some por `z-index: -1`; se aberto, **sobrepõe** a conversa com `z-index: 10`; caixa de texto cai para 7em |
| até **950** | as três colunas viram 100% e deslizam com `left: -100%` e `-200%` |
| até **650** | o trilho vira gaveta de 250px sobre um véu preto a 50% |
| até **480** | recuo do rolador cai para 26px/16px |

**Não existe coluna de 300px em lugar nenhum.** Em 1440 a coluna de atendimentos tem
340px; em 1920, 460px.

---

## 3. Trilho de ícones

Barra vertical, tema escuro, altura cheia. Único cromo escuro da tela.

| Medida | Valor | Fonte |
|---|---|---|
| Largura do trilho | **80px** | medida na tela; a folha não traz (vem do componente web) |
| Recuo interno | 16px em cima/embaixo, 8px nas laterais | tela |
| Alvo de cada item | 40px de altura, recuo de 8px, raio 8px | `.menu-button { border-radius: 8px; padding: 8px }` |
| Recuo lateral do item | 12px | `.navbar-menu-item { padding: 0 .75rem }` |
| Espaço entre ícone e rótulo (modo largo) | 20px | `.menu-button { gap: 20px }` |
| Ícone | **24×24** | `.menu-icon { height: 24px; width: 24px }` |
| Passagem do cursor | tinta a **8%** | `.menu-button:hover` → `--color-hover` |
| Item em vigor | tinta a **16%**, raio 8px | `.menu-selected` → `--color-pressed` |
| Marca no topo | ilustração 40×40, com **24px** de folga abaixo | `.blip-image { width/height: 40px; margin-bottom: 1.5rem }` |
| Contador sobre o ícone | 22×22, deslocado −7px em cima e −12px à direita | `.notification` do item de menu |

O item em vigor **só ganha o retângulo acima de 650px de janela** — a regra está dentro
de uma consulta de mídia. Abaixo disso o trilho é uma gaveta com rótulo escrito, e o
retângulo não é mais necessário para dizer onde se está.

Nada de barra lateral, nada de sublinhado, nada de cor de marca: o em-vigor é **só** um
retângulo um degrau mais claro que o fundo.

Os itens, na ordem: **Atendimentos · Mensagens ativas · Métricas de atendimento ·
Contatos · Ações em massa** em cima; **Ajuda · Preferências · avatar** no rodapé.
A ordem é regra, não gosto.

---

## 4. Coluna de atendimentos

Fundo em superfície 2. Quatro blocos empilhados; os dois primeiros em superfície 1.

| Bloco | Altura | O que traz |
|---|---|---|
| Cabeçalho | **76px**, recuo 16px | Título e o seletor de visão |
| Estado do atendente | **111px** de piso, **117px** entre 1112 e 1440, teto de 160px | "Seu status é X" e um botão |
| Busca | **80px** de custo na coluna | Campo com raio 8 e borda de 1px |
| Faixa de abas | **29px** de custo na coluna | Todos / Não lidos / … |
| Lista | o que sobra | |

Os custos de altura saem por subtração, e é assim que a folha os expressa: a lista sem
busca ocupa `calc(100% - 20px)`; com busca, `calc(100% - 100px)`; com abas e busca,
`calc(100% - 109px)`. Daí: cabeçalho da lista 20px, busca 80px, abas 29px.

O bloco de estado é separado por linha de 1px em superfície 3, em cima e embaixo.

### O item da lista

Cartão, não linha de tabela.

| Parte | Medida | Fonte |
|---|---|---|
| Cartão | raio 8, recuo 8, borda 1px em superfície 3, fundo superfície 1 | `.chat-list-item` |
| Espaço entre cartões | 8px | `.chat-list-item:not(:last-child)` |
| Rosto do cliente | **37×37** | `.customer-avatar` |
| Selo do canal sobre o rosto | 24×24, raio 6, deslocado −10px nos dois eixos | `.channel` |
| Conteúdo | 8px de folga abaixo | `.ticket-content { margin-bottom: 8px }` |
| Faixa de metadados | linha de 1px em superfície 2, recuo de 4px no topo, 8px entre itens, entrelinha 24px | `.ticket-info` |
| Ícones da faixa | 24×24, em conteúdo fantasma | `.ticket-info-icon` |
| Contador de não lidas | altura 24, largura mínima 24, texto 12/20 em peso 700 | `.badge-warning` |

**Os três estados, corrigidos:**

| Estado | Tratamento |
|---|---|
| Repouso | superfície 1 |
| Passagem do cursor | superfície 1 + preto a **4%** |
| **Selecionado** | **superfície 3** + preto a **12%** |
| Selecionado, com o cursor | superfície 3 + preto a **16%** |

O selecionado muda **duas** coisas ao mesmo tempo — o degrau de superfície e o
escurecimento —, e é isso que o faz ser lido de relance sem gastar cor nenhuma. A
medição anterior tinha visto só o escurecimento.

---

## 5. Área da conversa

### Cabeçalho

Recuo de **24px em volta** (era lido como 24 só na lateral). O rosto do contato tem
**45px**, caindo para **36px** abaixo de 950. À direita do nome ficam as ações e o botão
que abre e fecha o painel, com raio só do lado esquerdo (`8px 0 0 8px`), recuo de 8px e
fundo em superfície 2, deslocado 24px para dentro da borda.

Uma faixa de etiquetas de **64px** aparece abaixo do cabeçalho quando há etiqueta na
conversa, e a linha que separa cabeçalho e corpo tem **0,5px**, não 1.

### Corpo

Recuo **32px 24px**, virando **40px 64px** acima de 1600 e **26px 16px** abaixo de 480.
É a única medida da tela que muda por faixa em vez de por porcentagem.

### O balão

```
max-width:   90%
min-width:   160px
font-size:   16px / entrelinha 20px
border:      1px sólido, conteúdo fantasma
margin-bottom: 5px
```

O raio é 13px com **um canto de 2px**, e a correção mais importante deste levantamento
é **onde** esse canto fica:

| Direção | Fora do grupo | Primeiro do grupo | Demais do grupo |
|---|---|---|---|
| Entrada | `13 13 13 2` | `13 13 13 2` | `2 13 13 2` |
| **Saída** | `13 2 13 13` | **`13 13 2 13`** | **`13 2 2 13`** |
| Sistema | `13` nos quatro | `13 13 2 2` | `2` nos quatro |

Ou seja: **o recorte mora embaixo, do lado de quem fala**, nos dois lados da conversa.
Dentro do grupo, o canto de cima do mesmo lado também encolhe, e o resultado é uma
coluna de balões costurada por uma borda reta do lado do autor. A regra anterior punha o
recorte da saída em cima à direita: os dois lados apontavam para direções diferentes e
cada balão parecia abrir uma fala nova.

O fundo do balão de saída é o **cinza escuro do texto** (`--color-content-default`), com
o texto claro por cima — **não** a cor de marca. O lado e o contraste carregam a
informação; a cor de marca fica livre para a ação primária. Nós reproduzimos o par com a
nossa superfície contrastante clareada, o que dá o mesmo degrau nos dois temas.

### Agrupamento

- **20px** entre grupos (`.blip-card-group { margin-bottom: 20px }`).
- **3px** entre balões dentro do grupo.
- O horário fica **fora** do balão, em 10/14, na cor de conteúdo desabilitado, alinhado
  ao mesmo lado. Dentro do grupo, o horário de cada balão some e só o do grupo aparece.
- O rosto é posicionado por cima, redondo, e o corpo do grupo é recuado **35px** do lado
  da entrada e **55px** do lado da saída para abrir espaço.

### Entrega e falha

Falha tem tratamento duplo: o balão vai a **50% de opacidade** e um ícone de **25×25** na
cor vermelha estendida aparece a 10px do fundo, encostado na direita, fora do balão e
clicável. A falha **não pinta o balão de vermelho** — ela apaga o balão e põe o vermelho
num ícone pequeno, o que é bem mais barato de ler numa conversa longa.

### Voltar ao fim

Botão de **40×40**, redondo, a **24px** do fundo e a **5%** da direita, com sombra
`0 1px 7px` a 10%. O contador de não lidas gruda no canto, deslocado −6px nos dois eixos.
O botão aparece quando a conversa está a mais de **150px** do fim (§9).

---

## 6. Compositor

A medida que faltava: o compositor é um **bloco de altura estável**, e não uma barra que
cresce do nada.

| Parte | Medida | Fonte |
|---|---|---|
| Bloco | **piso 150px**, **teto 420px**, raio 8, borda 1px em superfície 3, fundo superfície 1 | `.pane-chat-message-input__container` |
| Área de texto | de **4em** a **11.5em**; **7em** abaixo de 1112; 4em no Firefox | `.pane-chat-message-input textarea` |
| Barra de rolagem da área de texto | 4px de largura, alça com raio 2 | mesma regra |
| Faixa de ações | **56px** de altura, com **12px** separando ela do campo acima de 950 | `.action-buttons` |
| Abaixo de 1112 | o bloco vira linha: campo e ações lado a lado, piso 56px, teto 280px | consulta de mídia |

Anexo, áudio e emoji ficam **na faixa de ações, abaixo do campo**, à esquerda; o envio
fica à direita.

Quando a conversa não aceita texto livre, o compositor inteiro é **substituído** por um
bloco centralizado com uma linha e um botão. São quatro casos, cada um com o seu texto:
cliente encerrou, encerrou por inatividade, atendente encerrou, e em espera. **Não existe
campo desabilitado com dica no `title`** — o campo sai da tela e o motivo ocupa o lugar.

---

## 7. Painel do contato

Coluna de 25% com **piso de 260px**, fundo em superfície 2.

| Parte | Medida | Fonte |
|---|---|---|
| Cabeçalho | **49px**; **57px** abaixo de 1440 | `.drawer-heading` |
| Corpo em abas | `calc(100% - 58px)`, fundo superfície 1 | `.drawer-tabs` |
| Recuo do painel | 8px | `.drawer__profile` |
| Cartão | recuo **16px 24px** | `.drawer__profile__paper` |
| Espaço entre cartões | 8px | `:first-child { margin-bottom: 8px }` |
| Altura dos dois cartões da aba de perfil | **50% cada** na tela larga | mesma regra |
| Abaixo de 950 | o primeiro cartão vira altura automática, teto de 90% | consulta de mídia |
| Cartão de histórico | recuo 16px 24px; **16px** na variante compacta | `.drawer__history__paper` |

**O painel é em abas**, não uma pilha rolada: perfil, histórico e metadados são abas
irmãs, e cada uma é uma pilha de cartões sobre o fundo recuado. **Nós adotamos isso** —
uma versão anterior do nosso Desk tinha achatado as três numa rolagem só, e o efeito era
uma coluna de um metro onde o histórico ficava sempre abaixo da dobra.

---

## 8. Estados vazios

Os três seguem a mesma receita: ilustração, uma linha que nomeia o estado, uma linha que
diz o que fazer. Nenhum é caixa com borda; é texto centrado no vazio.

- **Atendente invisível, na coluna** — bloco de 50px de recuo, centralizado
  (`.get-online-txt { text-align: center; padding: 50px }`).
- **Sem conversa selecionada** — bloco de 336px de largura, centralizado na coluna.
- **Lista vazia por busca** — mesma figura, com o termo citado.

---

## 9. As regras de operação, com número

Tudo desta seção sai do arquivo de configuração público deles,
`supernova.desk.blip.ai/static/settings.<hash>.json`. **O número é medido; o código é
nosso.** A tabela completa das chaves está em `blip-desk-regras.md`; aqui ficam só as que
mudam o comportamento da tela do atendente, com o que o nosso Desk faz hoje.

### Inatividade do atendente

| Regra | Chave deles | Valor | No nosso Desk |
|---|---|---|---|
| Sem gesto na tela → considerado inativo | `INACTIVITY_INTERVAL` | 10 min | **cumpre**, `apps/desk/src/lib/operacao.ts` |
| Mais esse tempo → status cai para Offline | `INACTIVITY_SET_OFFLINE_INTERVAL` | 10 min | **cumpre** |
| De quanto em quanto tempo o relógio é conferido | `CHECK_INACTIVITY_INTERVAL_MS` | 5 s | **cumpre** |
| Piso entre dois reinícios do relógio | `MINIMUM_RESET_INTERVAL_MS` | 1 s | **cumpre** |
| Preferência que desliga a queda automática | `KEEP_AGENT_ONLINE` | — | **não existe**; depende da tela de Preferências |

Implementado em `apps/desk/src/componentes/inatividade.tsx` e na ação
`cairPorInatividade` de `apps/desk/src/app/acoes.ts`. O aviso é bloqueante e cobre a
tela: um aviso passivo no rodapé é lido como enfeite justamente por quem ele deveria
acordar. A ação **só derruba, nunca levanta**, e não faz nada se o atendente já está
Offline — sem isso, uma aba esquecida num segundo monitor derrubaria quem está
trabalhando na primeira.

### Sessão

| Regra | Chave | Valor | No nosso Desk |
|---|---|---|---|
| Validade da sessão | `SESSION_EXPIRATION_TIME_MS` | 8 h | **número diferente** — conferir `apps/desk/src/lib/sessao.ts` |
| Desconexão por ociosidade da sessão | `DEFAULT_LOGOUT_TIME_MINUTES` | 15 min | **não existe** |
| Renovação do cookie | `COOKIE_UPDATE_INTERVAL_MS` | 5 s | **não existe** |

### Conversa

| Regra | Chave | Valor | No nosso Desk |
|---|---|---|---|
| Mensagens por página no histórico | `MESSAGE_HISTORY_PAGE_SIZE` | 40 | **não existe** — carregamos a conversa inteira; número já anotado em `operacao.ts` |
| Distância do fim para o botão "voltar ao fim" aparecer | `MINIMUM_SCROLL_DISTANCE` | 150 px | **não existe** |
| Validade do aviso de "digitando…" | `TYPING_TIMEOUT` | 4 s | **não existe** — depende de tempo real |
| Validade do estado de conversa | `CHAT_STATE_TIMEOUT` | 20 s | **não existe** |
| Canais que **não** recebem "digitando…" | `CHANNELS_IGNORE_CHATSTATE` | WhatsApp e Instagram | **não existe** |
| Canais onde responder-a-mensagem funciona | `CHANNELS_REPLY_AVAILABLE` | WhatsApp e chat próprio | **não existe** |

### Anexos

| Regra | Chave | Valor | No nosso Desk |
|---|---|---|---|
| Tamanho máximo de um anexo | `MAX_ATTACHMENT_SIZE` | 100 MB | **não existe**; limite já anotado em `operacao.ts` |
| Quantidade máxima por envio | `MAX_ATTACHMENT_COUNT` | 10 | **não existe**; idem |
| Validade do link temporário do arquivo | `DEFAULT_FILE_TOKEN_EXPIRATION_IN_MILLISECONDS` | 15 min | **não existe** |

### Atualização e conexão

| Regra | Chave | Valor | No nosso Desk |
|---|---|---|---|
| Recarga da fila | `POLLING_INTERVAL` | 15 s | **cumpre**, `apps/desk/src/componentes/recarga-fila.tsx` — refaz só os componentes de servidor, preservando o texto meio escrito no compositor; para com a aba em segundo plano e recarrega na volta |
| Aviso de versão nova do aplicativo | `VERSION_CHECK_INTERVAL_MINUTES` | 5 min | **não existe** |
| Teste de conexão | `CONNECTION_TEST_INTERVAL` | 15 s | **não existe** |
| Aviso de instabilidade da plataforma | `INSTABILITY_CHECK_INTERVAL` | 5 min | **não existe** |
| Fechamento da notificação do navegador | `NOTIFICATION_CLOSE_TIMEOUT` | 5 s | **não existe** |

### Validade de cache

Configuração geral e respostas prontas: **30 min**. Etiquetas e palavras proibidas:
**5 min**. Conta do dono e contato: **30 min**. Nenhuma dessas existe no nosso Desk —
lemos do banco a cada navegação.

---

## 10. Aba de Métricas (Analytics)

O miolo desta aba veio no segundo salvamento e foi levantado. O achado que muda decisão
de produto: **a aba é do próprio atendente, não da operação.** O título da tela é
literalmente "Minhas métricas: {nome}", e toda consulta é feita com a identidade do
atendente logado como filtro obrigatório. Não há seletor de "ver o time".

### O que ela mostra

**Visão Geral de Tickets** — seis contagens, em rosca mais seis cartões: "Abertos",
"Transferidos", "Fechados", "Abandonados", "Finalizados", "Perdidos". Atenção à
semântica, que os rótulos escondem: **"Abandonados" é encerrado pelo cliente e
"Finalizados" é encerrado pelo atendente**.

**Total de tickets de atendimento** — linha do tempo diária com **duas** séries apenas,
"Fechados" e "Abertos". As outras quatro situações ficam só nos cartões.

**Médias de métricas de atendimento** — três tempos médios: "Primeira Resposta",
"Espera na fila", "Espera total". Quando não há valor, mostram `-`, não zero.

**Performance do último atendimento** — cartão de análise por IA do último ticket
encerrado: nota de 0 a 5 com estrelas, tempo do atendimento, tempo médio de resposta,
"Pontos positivos:" e "Pontos a melhorar:", uma dica em texto livre, e a pergunta "Você
concorda com essa analise?" com joinha. Os seis critérios avaliados são **Conduta,
Tamanho de respostas, Ortografia, Disponibilidade, Tempo de 1ª resposta, Tempo de
atendimento**.

Uma segunda tela, "Análise de tickets", lista todas as análises, paginada em 5/10/15/20
itens, e abre cada uma numa gaveta lateral.

### Recorte

Períodos: **"Hoje" (padrão), "Ontem", "7 Dias", "30 dias", "90 dias", "Personalizado"**.
O intervalo personalizado é limitado a **90 dias**. **Não há filtro** por fila, atendente,
canal ou etiqueta, e **não há exportação** — a única ação de saída é "Atualizar".

### O que não existe lá

Nem TMA/TME nomeados, nem SLA (o cálculo é **explicitamente desligado** nas consultas),
nem CSAT, NPS, satisfação do cliente, transbordo, reabertura ou taxa de abandono. Nenhum
indicador em percentual.

### Duas armadilhas para não herdar

1. As consultas são feitas **uma por bot**, em paralelo e tolerantes a falha: **se uma
   falhar, o total sai menor e a tela não avisa.** O nosso equivalente tem de dizer
   quando o número está incompleto.
2. A média dos tempos **divide pela quantidade de valores maiores que zero**, e não pelo
   volume de tickets. É média simples entre bots, cada bot pesando igual tenha ele 1 ou
   500 tickets. Para leitura gerencial isso distorce, e o nosso deve ponderar por volume.

### O que foi construído

A tela existe: **`/metricas` no Desk**, e o ícone do trilho passou a apontar para ela em
vez de mandar o atendente para o Gestão. Título "Minhas métricas: {nome}", os seis
cartões de situação, a série diária em barras, os três tempos médios, os cinco atalhos de
período com "Hoje" como padrão e o intervalo à mão limitado a 90 dias. Sem filtro de
colega e sem exportação, como lá.

**Isolamento**: a transação roda em `noTenant`, com a RLS valendo, e toda consulta filtra
por `atendente_id` vindo da **sessão**, nunca da URL. Não existe parâmetro que faça a tela
mostrar o número de outra pessoa.

Arquivos: `app/metricas/page.tsx`, `servidor/metricas.ts`, `lib/periodo.ts` (com teste).

**Sem biblioteca de gráfico.** Duas séries em no máximo 90 pontos não pagam o custo de
trazer um empacotado de gráfico para dentro do Desk: as barras são `div` com altura em
porcentagem, funcionam sem JavaScript, imprimem e acompanham o tema sozinhas.

### O que falta, e o tamanho

| O que | Por quê | Tamanho |
|---|---|---|
| **Transferidos** | não há coluna que diga que a conversa mudou de atendente | uma tabela de eventos de transferência, ou uma coluna de contagem em `conversa`; muda o domínio, não a tela |
| **Perdidos** | não existe o conceito no nosso domínio, e nem na tela deles ele é definido | precisa de definição de produto antes de código |
| **Abandonados** | está aproximado por "encerrada sem autor" — junta o cliente que saiu com o fechamento automático por inatividade | uma coluna dizendo **quem** encerrou (cliente, atendente, sistema); é o mesmo dado que faltaria para as três situações de encerramento da aba de Contatos |
| **Nota do atendimento por IA** | depende do `@pipe/ai`, que ainda não entrou | tela inteira, com a etapa de IA antes |

Os dois primeiros aparecem como **traço**, não como zero: zero seria dizer que houve
medição e deu nada. O cartão explica em uma linha que o Pipe ainda não guarda o dado.

### As duas divergências deliberadas

Marcadas no código e mantidas por decisão:

1. **Total que encolhe em silêncio.** Lá as consultas são disparadas uma por robô e, se
   uma falhar, o total sai menor sem aviso. Aqui é uma consulta só, na mesma transação:
   ou o número está certo, ou a tela quebra e a pessoa sabe.
2. **Média simples entre robôs.** Lá cada robô pesa igual, tenha ele 1 ou 500
   atendimentos. Aqui a média é sobre os atendimentos.

Consequência a registrar: **o nosso número pode não bater com o deles** para a mesma
operação, e a diferença não é defeito nosso. Quem comparar as duas telas lado a lado vai
ver médias diferentes sempre que houver mais de um robô com volumes desiguais.

---

## 11. Aba de Contatos

É a aba que mais conversa com o que já temos, porque o nosso painel do contato faz uma
fatia do que ela faz. Ela é **inteiramente de leitura** — não há criar, editar nem apagar
contato em lugar nenhum. Três colunas: lista de contatos à esquerda, transcrição do
atendimento escolhido no meio, e à direita duas abas, "Histórico" e "Contato".

### Regras com número

| Regra | Valor | Nosso Desk |
|---|---|---|
| Contatos por página, com rolagem infinita | 20 | não existe |
| Espera antes de disparar a busca | 500 ms | **diferente** — a nossa busca é por envio de formulário, não por digitação |
| Mínimo de caracteres para buscar | 2 | não existe |
| Janela do histórico | **90 dias** | **diferente** — mostramos tudo o que houver |
| Mensagens por página na transcrição | 40 | não existe — carregamos a conversa inteira |
| Agrupamento de comentários do mesmo autor | mesmo autor **e** menos de 60 s | não existe |

O **40 de página da transcrição bate com `MESSAGE_HISTORY_PAGE_SIZE`** do arquivo de
configuração (§9), o que confirma que o número é da plataforma e não desta aba.

### Campos que a tela mostra

Nome, Username (WhatsApp), Telefone, E-mail, ID do usuário, BSUID da Meta, WhatsApp ID,
mais dois blocos separados: **"Dados Extras"**, que renderiza cru o que vier no campo de
atributos (a chave vira o rótulo, sem tradução e sem tipagem), e **"Comentários"**,
descritos como "Comentários realizados durante o atendimento humano".

**Não existe** CPF, CNPJ, documento, data de nascimento, gênero nem endereço. O nosso
painel mostra "Documento", que eles não têm — é acréscimo nosso, e fica.

Quando falta valor, a tela escreve a falta em vez de deixar vazio: "Nenhum telefone
cadastrado", "Nenhum e-mail cadastrado", "Nenhum comentário sobre este contato". É a
mesma regra que o nosso painel já segue com "não informado".

**Cadeia de recurso do nome de exibição**, que vale copiar tal e qual: nome → telefone
formatado internacionalmente → e-mail → parte da identidade antes do `@`. Nunca fica em
branco. O nosso cai direto em "Sem nome", que é um degrau só.

### Ordenação e agrupamento da lista

Duas opções, mutuamente exclusivas: **"Ordem alfabética"** (padrão) e **"Última
interação"**. E o agrupamento muda com a ordenação — por primeira letra do nome no
primeiro caso (com os sem-nome num grupo `#` sempre empurrado para o fim), e por data da
última mensagem no segundo.

### O histórico de atendimentos

Agrupado por bot, em sanfonas que **começam todas fechadas** a cada troca de contato.
Cada linha traz três campos: número do ticket, atendente e data de encerramento. O
detalhe de um ticket abre em quatro blocos — "Dados do atendimento", "Origem do ticket"
(que distingue **transferência** de **encaminhado pelo bot**), "Tempo de atendimento"
(início, última interação e total por extenso) e "Tags".

Oito situações de encerramento, escritas por extenso: "Finalizado pelo atendente",
"Transferido", "Finalizado por inatividade do cliente", "Finalizado pelo cliente",
"Nenhum", "Aguardando", "Aberto", "Atribuído". O nosso painel mostra cinco; as três que
faltam — transferido, por inatividade do cliente, pelo cliente — dependem de o domínio
gravar **quem** encerrou, que hoje ele não grava.

### Contato repetido: não tratam

A identidade de um contato, para essa tela, é o par **bot + identidade do cliente**. O
mesmo telefone atendido por dois bots aparece **duas vezes na lista**, e não há mesclar,
bloquear nem avisar. A lista também não deduplica o que o servidor devolver repetido.

**Decisão do dono: replicar a ausência.** Não inventamos deduplicação. Se o mesmo
telefone chega por dois canais, são dois contatos, como lá. Fica registrado aqui que
**isto é ausência de regra deles, e não esquecimento nosso** — quem ler depois não deve
"consertar" achando que faltou.

### Três defeitos deles, para não herdar

1. Erro ao buscar a lista de contatos é **relançado sem aviso**: a tela fica presa em
   carregando ou vazia, sem explicação.
2. Erro ao buscar comentários ou dados cadastrais **falha em silêncio** e devolve vazio —
   o atendente lê "não há dados" quando na verdade a consulta quebrou.
3. Duas mensagens de bloqueio estão escritas nos três idiomas e **nenhuma é disparada**:
   quando o contato não tem identidade válida, o botão de conversar novamente aborta em
   silêncio e o clique não faz nada.

### O que foi construído

A metade que é do Desk: **o atendimento antigo abre em leitura**, em
`/conversas/<id>`. Cada linha do histórico no painel do contato virou um link — o
histórico deixou de ser uma lista de datas e virou a porta para o que foi dito, que é a
pergunta que faz alguém abrir aquele painel.

A tela tem a transcrição à esquerda e "Informações do ticket" à direita, nos blocos da
referência: **Dados do atendimento** (atendente, e-mail, fila, canal, prioridade),
**Tempo de atendimento** (início, primeira resposta, última interação, total, tempo em
espera, situação, motivo) e **Etiquetas**.

**Sem compositor, e sem como haver**: a conversa está encerrada. É a mesma regra que o
atendimento em curso já segue — quando não há o que compor, o compositor some e o motivo
ocupa o lugar dele. O botão de reenviar também sai: a falha continua visível e continua
explicada, o que ela perde é a ação.

O renderizador de balão foi extraído para um componente só, usado pelas duas telas. Um
segundo renderizador seria dois lugares para acertar o canto de 2px, o agrupamento de 3px
e a regra da falha — e eles divergiriam na primeira correção feita só num deles.

**Quem atendeu não filtra a consulta**, de propósito: o histórico já lista os
atendimentos anteriores do contato sem olhar quem atendeu, e abrir um deles não mostra
nada que a coluna ao lado já não mostrasse. Quem fecha o cerco é a RLS, que só enxerga o
cliente da sessão.

### O que falta, e o tamanho

| O que | Por quê | Tamanho |
|---|---|---|
| **Bloco "Origem do ticket"** | não gravamos que uma conversa nasceu de transferência | uma coluna apontando para a conversa anterior; a rota de transferência já existe na `api` e é ela quem saberia preencher |
| **Três das oito situações de encerramento** | não gravamos QUEM encerrou quando não foi atendente | é o mesmo dado que falta para "Abandonados" nas métricas (§10) — uma coluna resolve os dois |
| **Paginação de 40 na transcrição** | carregamos o atendimento inteiro | o número já está em `lib/operacao.ts`; entra junto com a rolagem infinita |
| **Lista navegável de contatos** | é tela do CRM (Twenty), não do Desk | fronteira de produto, não de anatomia |

### Três defeitos deles que não foram herdados

Estão descritos acima e nenhum entrou: erro de lista relançado sem aviso, erro de
comentários falhando em silêncio, e o botão que aborta calado quando o contato não tem
identidade válida.

---

## 12. Aba de Preferências

Levantamento em `blip-desk-preferencias.md`. Construída: as cinco preferências vivem no
diálogo que o item "Preferências" do rodapé do trilho já abria, com os rótulos deles,
nas seções deles, **sem botão "Salvar"** — cada interruptor vale no instante em que é
tocado.

| Preferência | Chave deles | Padrão | O que ela liga aqui |
|---|---|---|---|
| Alertas sonoros para novos tickets | `TICKET_ALERT` | ligado | bipe alto quando um atendimento novo aparece na fila |
| Alertas sonoros na aba ativa do navegador | `MESSAGE_ALERT` / `ALERT_DESK_ACTIVE` | desligado | bipe baixo quando o cliente responde, só com a aba visível |
| Notificações do navegador | `BROWSER_NOTIFICATION` | desligado | cartão do sistema, que fecha em 5 s |
| Continuar online ao fechar o Pipe Desk | `KEEP_AGENT_ONLINE` | desligado | **desliga a queda por inatividade** (§9) |
| Corretor ortográfico | — | ligado | o corretor do próprio navegador no campo de mensagem |

### Onde a preferência mora, e por quê

**No navegador, uma chave por preferência — não no banco.** As cinco dizem respeito à
MÁQUINA em que a pessoa está sentada, não à pessoa: se sai som, se o sistema deixa
notificar, se o corretor está carregado, se esta aba deve segurar o status. A mesma
pessoa no computador do escritório e no de casa quer respostas diferentes para as cinco,
e uma preferência guardada no banco daria a mesma resposta nas duas.

Quando aparecer uma preferência que é da PESSOA e não da máquina — idioma, fuso,
assinatura —, aí nasce a tabela com tenant e usuário sob RLS, e a camada passa a ler dos
dois lugares. O da máquina continua no navegador.

O levantamento deles marcou este ponto como não confirmado, e a tela não deixa ver.

### Como o alerta sabe que chegou coisa nova, sem tempo real

A fila é recarregada a cada 15 s (§9) e a recarga entrega props novas ao componente de
avisos **sem apagar o estado dele** — então basta guardar o que já foi visto e comparar.
Atendimento que não estava lá é ticket novo; conversa cujo último instante avançou **e**
cuja última palavra é do cliente é mensagem nova. Nada dispara no primeiro desenho, e
sai **um aviso por rodada**: dez bipes não dizem mais que um.

O atraso é de até 15 segundos. Quando o WebSocket entrar, muda o gatilho e o resto fica.

### Som gerado, não tocado

Duas notas de um oscilador do próprio navegador — a de ticket sobe, a de mensagem é mais
baixa e mais curta. **Não há arquivo de áudio no repositório**: som de terceiro não entra,
e um bipe de duas notas não justifica um binário.

### O que não entrou

"Ver mensagens por ordem de abertura do ticket" — no nosso Desk a ordem da lista já é uma
escolha na coluna, na URL. Duas formas de dizer a mesma coisa seriam duas que divergem.

---

## 13. O que ainda falta do produto deles

A tela é montada por **oito micro-frontends**, e eles só baixam quando a aba é aberta.
Sete já chegaram nos salvamentos; **falta um**:

| Aba | Chegou? |
|---|---|
| Chamadas, Transcrição, Metadados do ticket | sim |
| Mensagens Ativas | sim |
| Métricas (Analytics) | sim |
| Contatos | sim |
| Preferências | sim |
| **Ações em massa** | **não** |

**Para eu conseguir levantar "Ações em massa":** abrir essa aba no Desk deles e salvar a
página de novo (Ctrl+S, "página completa"). O micro-frontend só é baixado quando a aba
abre, então salvar a partir da tela de Atendimentos nunca o traz. Feito isso, o arquivo
aparece em `deskmfe.blip.ai/beagle/desk-tickets-mfe/`, e o levantamento sai no mesmo
molde do de Métricas.

---

## 14. O que copiamos, o que não, e o que ficou de propósito diferente

**Copiado, e agora conferido na folha:**

1. A proporção 25/50/25 e as sete faixas.
2. O cartão de 8px com recuo 8 e espaço 8, sobre fundo recuado.
3. **O selecionado neutro** — o degrau de superfície mais o escurecimento. Reintroduzido
   nesta rodada; a versão anterior usava a cor de marca.
4. O balão de 13px com o recorte de 2px **embaixo**, e o agrupamento de 3px dentro e 20px
   entre. Corrigido nesta rodada.
5. A falha por opacidade mais ícone, em vez de balão vermelho.
6. O compositor que some quando não há o que compor, em vez de campo desabilitado.
7. **O piso de 150px do compositor.** Novo nesta rodada.
8. O trilho de 80px com passo de 48px e o em-vigor como retângulo de 40×40 em raio 8.
9. **O painel em abas.** Reintroduzido nesta rodada.
10. Os cinco destinos do trilho e a ordem deles.

**Diferente de propósito, e o porquê:**

1. **Toda cor.** Sai dos nossos `--p-*`. Onde a estrutura deles pede um degrau que a
   nossa paleta não nomeia, ele é derivado com `color-mix`, nunca inventado.
2. **O horário de 10px.** Fica abaixo do que se lê numa tela de escritório a um metro de
   distância. O nosso menor de tela é 12px.
3. **Os 37px do rosto na lista e os 45px no cabeçalho** viraram 40 e 44, que são os
   degraus da nossa régua de 4. A diferença não se enxerga; a régua quebrada, sim.
4. **A janela de 24 horas no cabeçalho.** Eles não mostram; a nossa especificação manda
   mostrar, e é a diferença entre avisar antes e errar depois.
5. **A aba escolhida do painel vive na URL**, e não em estado de cliente. O Desk já
   guarda a conversa aberta e os filtros assim; uma quarta forma de guardar estado de
   tela seria uma a mais do que o produto precisa.

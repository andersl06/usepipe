# A casca da Gestão, conferida contra a folha de estilo do portal

Até aqui a casca da Gestão foi construída medindo **captura de tela e DOM vivo**
(`blip-medidas-monitoramento.md`). Este documento faz a segunda passada, agora
contra a **folha de estilo publicada** do portal da Blip
(`supernova.blip.ai/portal.css`, 1,1 MB) e contra os **pedaços do design system**
que viajam com ela (`node_modules_blip-ds_*_entry_js.*.js`, um por componente).

**Por que a segunda passada muda alguma coisa.** A medição de DOM devolve o
valor *resultante* — 42px de altura, 21,33px de barra. A folha devolve a
**regra** que produziu aquele valor — `padding: 8px` mais `border: 1px`, ou
`top: 8px; bottom: 8px`. Regra é o que se replica; valor resultante é o que se
confere. Onde os dois discordam, a folha ganha, porque ela diz o que acontece
nos tamanhos que não foram medidos.

**Aviso de uso.** Medida, regra e vocabulário são fato sobre o produto. Nenhum
arquivo, trecho de código, nome de classe, ícone ou hex deles entra em `apps/**`
ou em `packages/**`. Aqui em `docs/pesquisa/` o seletor aparece **ao lado da
medida**, como referência de onde ela foi lida — é o mesmo papel de uma nota de
rodapé numa planilha, e é a única parte do repositório onde ele pode aparecer.

**Nada aqui é estimativa.** O que não foi lido está marcado como *não lido*.

> **LEIA A §8.7 ANTES DAS SEÇÕES 1 A 7.** Elas foram escritas tratando a folha
> de estilo como fonte, e a folha diz o **tamanho das peças**, não a
> **montagem**. Por isso as medidas ficaram certas e a tela não ficou igual —
> lista de materiais sem a planta. A §8.7 traz a planta, lida no pacote do
> módulo, e diz o que ela invalida.

---

## 1. Onde cada medida foi lida

| Fonte | O que ela responde |
|---|---|
| `supernova.blip.ai/portal.css` | as duas gerações do portal no mesmo arquivo: a casca no ar (barra de conta, barra de módulos, home) e o legado AngularJS |
| `node_modules_blip-ds_*_entry_js.*.js` | o design system atual, um arquivo por componente, com a folha do shadow DOM dentro. **É esta a fonte da regra.** |
| `supernova.blip.ai/portal.js` | os gabaritos e as regras de comportamento da casca e da home |
| `vendor-app_modules_translate_translationLoaders_sync_recursive_js_.*.js` | **os rótulos em português.** O `portal.js` só tem a chave; o texto vive neste irmão de 1,77 MB, em 480 pedaços de dicionário |
| `portalmfe.blip.ai/beagle/portal-fragment-desk-mfe/latest/main.js` | o módulo de Atendimento inteiro: rotas, rótulos, vocabulário e o que ele sobrescreve do design system |
| `blip-medidas-monitoramento.md` | o DOM vivo da tela de Monitoramento, em 1707×767 |

**A armadilha que quase custou o levantamento inteiro:** os rótulos em português
não estão onde a aplicação está. `portal.js` carrega chaves de tradução; o texto
mora num pedaço separado. Quem procurar "Monitoramento" no `portal.js` não acha
nada e conclui que o portal é em inglês.

A folha do portal e a do design system **descrevem gerações diferentes**. Onde a
`portal.css` guarda regra morta — a faixa de submenu de `4,125rem` em
`top: 5,75rem`, o sublinhado de módulo ativo de 5px — ela é registrada como
legado e **não** corrige a medição do DOM vivo, que é o que está no ar.

---

## 2. A régua deles, contada

### 2.1 Tipografia

A escala utilitária do portal tem **oito degraus** (`.bp-fs-1` a `.bp-fs-8`):

| Degrau | Valor |
|---|---|
| 1 | 48px |
| 2 | 32px |
| 3 | 24px |
| 4 | 20px |
| 5 | **16px** — é o do `<body>` |
| 6 | 14px |
| 7 | 12px |
| 8 | 10px |

Pesos utilitários: **400** (`regular`), **600** (`bold`), **700**
(`extra-bold`) — mais o **300** que só aparece no cromo das barras.

**O que isso corrige na nossa régua.** `--p-t-numero: 28px` **não existe** na
escala deles: entre 24 e 32 não há degrau. O número de cartão de métrica que
eles usam é **24 / 400** no Monitoramento e **20 / 700** no relatório — os dois
já são token nossos (`--g-t-valor`, `--g-t-valor-rel`). Ver §7.

### 2.2 Raio

Contagem de `border-radius` nos pedaços do design system, que é onde vive a
regra atual:

| Valor | Ocorrências | Papel |
|---|---|---|
| **8px** | 50 | padrão: botão, item de menu, cartão pequeno, tabela, painel |
| **4px** | 23 | anel de foco e controle miúdo |
| **16px** | 8 | cartão grande (`bds-paper`) |
| 50% / 100% | 12 | círculo |
| 12px | 2 | etiqueta de 24px de altura — é a metade da altura, não um degrau |
| 40px | 1 | avatar |

Não há **5px** em lugar nenhum do design system do portal. Ver §7.

### 2.3 Cor — a arquitetura, não a tinta

Lidos nos valores de reserva das variáveis deles, e registrados aqui só para
provar que a **arquitetura** do nosso `tokens.css` está certa. Nenhum destes
valores entra no nosso CSS:

- **cinco superfícies** (`surface-0` a `surface-4`), a última escura;
- **três degraus de conteúdo** em uso (`default`, `disable`, `ghost`) mais o
  claro;
- **borda como tinta translúcida em três forças**, não hex opaco;
- **uma cor de marca** (`primary`), que pinta ação, ícone ativo e barra de item
  ativo, e nada mais;
- **estado é par de fundo pastel com conteúdo preto** — os quatro pastéis deles
  são acompanhados de uma variável de conteúdo que é literalmente `black`;
- **uma cor de foco própria**, que **não** é a cor de marca.

As seis primeiras regras já são as nossas. A sétima **não é**: o nosso anel de
foco usa `--p-marca`. Ver §7.

---

## 3. A regra de estado que estava faltando: camada de tinta

Esta é a correção mais estrutural desta passada, e ela não aparece em nenhuma
captura de tela.

No design system deles, **passagem do cursor e pressionado não trocam a
superfície**: sobrepõem uma camada da tinta do conteúdo em **8%** e em **16%**.
A mesma dupla de números aparece em botão de ícone (`.icon__button:hover::after`
/ `:active::after`), em item de lateral (`.nav_main:hover:before` /
`:active:before`), em linha de tabela clicável e na moldura do item ativo.

Só existem **dois degraus**, e eles são sempre os mesmos dois.

**Por que importa, e não é preciosismo.** Uma troca de superfície escolhe um
fundo e erra em todos os outros: o mesmo item de menu que fica certo sobre o
branco do cartão fica invisível sobre o creme da página e briga com a linha
colorida de uma tabela de severidade. A camada de tinta funciona sobre
qualquer fundo porque é translúcida.

**Antes → depois.** `apps/gestao/src/app/globais.css`:

| Peça | Antes | Depois |
|---|---|---|
| `.g-item:hover` | `background: --p-superficie-2` | `background: --g-tinta-hover` (8% do conteúdo) |
| `.g-item:active` | *não existia* | `background: --g-tinta-pressao` (16%) |
| `.g-subitem:hover` | `background: --p-superficie-2` | `background: --g-tinta-hover` |
| `.g-subitem:active` | *não existia* | `background: --g-tinta-pressao` |

Os dois degraus viraram token derivado (`--g-tinta-hover`, `--g-tinta-pressao`),
num lugar só, para não virarem cinco cinzas.

---

## 3.1 As duas barras do topo

Agora lidas na folha, e não só medidas na tela.

| Peça | Regra deles | Nosso estado |
|---|---|---|
| Barra da conta | `height: 80px`, fundo escuro, **`transition: height .22s ease`**, e ela **encolhe para 44px** | 80px, sem o encolhimento. Ver §8.3 |
| Barra de módulos | fundo um degrau mais claro, **`box-shadow: 0 2px 12px`** a ~15% — e **nenhum fio** | **corrigido**: a sombra entrou; o fio continua fora, porque o sublinhado de 4px do módulo ativo precisa encostar no pé da barra |
| Linha do bot dentro da barra | `min-height: 55px` | 56px, que é o medido na tela viva. Mantido |
| Item de módulo | `line-height: 3.5rem` (56px), `padding: 0 20px`, peso **300**, tinta fraca; ativo em branco | já batia |
| Sublinhado do ativo | 4px, e **animado**: de `left: 25%; width: 0` para `left: 0; width: 100%` em **0,3s** | **corrigido**: a animação entrou. O traço agora nasce do meio e abre |
| O "…" | recuo de **10px**; e o corte é por **CONTAGEM**: exatamente **5 módulos visíveis** (4 se o bot for agente de IA), o resto cai no menu, que **só é renderizado se sobrar algo** | **corrigido** nas duas pontas — ver §3.2 |

### 3.2 A regra dos cinco módulos

O controlador deles fatia a lista de módulos em cinco e joga o resto no "…".
Não é transbordo por largura: é `slice(0, 5)`, e o "…" tem um `ng-if` que o
apaga quando não sobrou nada.

**Antes → depois.** O nosso "…" abria um mapa com **os mesmos cinco módulos que
já estavam na fileira ao lado**. Agora ele mostra o que sobrou de cinco — e, como
temos exatamente cinco, ele **não aparece**. É a leitura correta da regra deles e
resolve, de quebra, um caso do nosso próprio critério: um botão que abre uma
lista já visível é cromo fingindo que há mais coisa.

A regra fica escrita no código para o dia em que nascer o sexto módulo.

### 3.3 O que mora nas barras deles, e não nas nossas

Inventário lido nos gabaritos, para o dono decidir o que vale trazer. Nada disto
foi construído.

**Barra da conta, à esquerda:** seletor de contrato com menu (painel do contrato,
os três contratos mais usados e "Mais contratos"); divisória vertical; e uma
fileira de atalhos de PRODUTO — Home · Templates · Conversas · Blip Store ·
Audiences · Pagamentos · Blip Insights · Análises · Blip Solutions Cred.
**Não há campo de busca nesta barra.**

**Barra da conta, à direita:** Ajuda, cujo menu é Blip Help · Blip Academy ·
Blip Community · Blip Support · Primeiros passos; Avisos, com estado vazio
**"Você não tem nenhuma notificação"** e rodapé "Carregar mais" / "Carregar
menos"; divisória; e o menu do usuário — nome e e-mail no topo, depois
**Minha conta**, **Minhas preferências** e **Sair**.

*Adotamos daqui apenas o estado vazio dos avisos*, que é uma frase. O resto
depende de conta, contrato e produtos que não existem no Pipe.

**Barra de módulos, além dos módulos:** o avatar do bot com bolinha de status,
cujo menu tem Home · Configuração · **Deixar projeto** (em vermelho); e, à
direita, os ícones Integrações · Configurações · Equipe mais o botão **Testar**.
Os nossos quatro atalhos da direita (Monitoramento, Histórico, Esforço,
Configurações) são outra escolha, e ficam.

---

## 4. A lateral

Fonte: o pedaço do componente de árvore de navegação deles (`bds-nav-tree-item`
e irmãos), mais `bds-nav-tree-group { margin: 16px }` e
`bds-nav-tree-item { margin: 8px 0 0 }` na `portal.css`.

### 4.1 O que já estava certo

| Peça | Nosso valor | Regra deles |
|---|---|---|
| Recuo do conteúdo | `padding: 16px` | `bds-nav-tree-group { margin: 16px }` |
| Passo entre itens e entre grupos | `gap: 8px` | `bds-nav-tree-item { margin: 8px 0 0 }` |
| Item — padding e raio | `padding: 8px`, `border-radius: 8px` | `.nav_main { padding: 8px; border-radius: 8px }` |
| Item — ícone ao rótulo | `gap: 8px` | `.nav_main { gap: 8px }` |
| Ícone do item ativo na cor de marca | sim | `.nav_main .icon-item-active { color: primary }` |
| Rótulo do filho 5px à direita do rótulo do pai | 45px contra 40px | `23px` de contêiner + `22px` de subitem contra `8 + 24 + 8` |

O recuo total de 45px do rótulo do subitem **coincide exatamente** com o
resultado das duas regras deles. A medição de DOM tinha acertado o número; a
folha explica de onde ele vem, e é por isso que ele foi reescrito nos mesmos
dois pedaços em vez de continuar como um `margin-left: 37px` sem origem.

### 4.2 O que foi corrigido

| # | Peça | Antes | Depois | Regra lida |
|---|---|---|---|---|
| 0 | Rodapé — fio e disposição | sem fio, tudo encostado à esquerda | `border-top: 1px solid`, e os dois extremos afastados: marca à esquerda, ícone de "abre fora" à direita | `MenuTreeSidebarFooter`: `border-top: 1px solid surface3`, `height: 72px`, `padding: 24px`, `justify-content: space-between` |
| 1 | Item — moldura | sem borda | `border: 1px solid transparent`, acesa em 16% no hover e no ativo | `.nav_main { border: 1px solid transparent }`; `.nav_main:hover, .nav_main_active { border-color: pressed }` |
| 2 | Item — pressionado | não existia | camada de 16% | `.nav_main:active:before { opacity: 0.16 }` |
| 3 | **Guia vertical do grupo aberto** | **não existia** | trilho de **2px** em `left: 23px`, de `top: 8px` a `bottom: 8px`, raio 8px, tinta de 8% a 80% de opacidade | `.accordion .container:before` |
| 4 | Recuo dos filhos | `margin-left: 37px` no subitem | `padding-left: 23px` no contêiner + `padding-left: 22px` no subitem | `.accordion .container { padding-left: 23px }` + `.nav_tree_item { padding: 8px; padding-left: 22px }` |
| 5 | Respiro do grupo | `gap: 8px` no `<details>` | `padding: 8px 0` no contêiner dos filhos, `gap: 0` no grupo | `.accordion_open { padding: 8px 0 }` |
| 6 | Barra do subitem — altura | `height: 21px` centrada | `top: 8px; bottom: 8px` (altura = item − 16) | `.nav_tree_item:before { top: 8px; bottom: 8px }` |
| 7 | Barra do subitem — estados | só no ativo | **três estados**: transparente em repouso, 16% sob o cursor, marca no ativo | `.nav_tree_item:before` / `:hover:before` / `_active:before` |
| 8 | Barra do subitem — transição | nenhuma | acende em 0,3s, apaga em 0,8s | `transition: background-color ease 0.3s` no estado, `0.8s` no repouso |
| 9 | Botão de ícone da barra — raio | `--p-r-sm` (5px) | `--p-r-md` (8px) | `.icon__button { border-radius: 8px; padding: 8px }` |
| 10 | Painel de menu — largura | 268px | **240px** | `bds-menu`: `width: 240px` |

**A guia vertical (item 3) é a falta que mais se via.** Com dois grupos abertos
ao mesmo tempo — e a nossa lateral abre o grupo do caminho atual sozinha — não
havia nada dizendo quais filhos pertencem a qual pai: eram dez linhas recuadas
em fila. A guia deles resolve isso, e a barra do item ativo monta **em cima
dela**, no mesmo x, o que é o motivo de as duas terem a mesma largura de 2px e o
mesmo raio.

**O item 7 conserta um gesto morto.** Ter só o estado ativo fazia o subitem sob o
cursor não dizer para onde ia. Na lateral deles a barra existe sempre e muda de
tinta três vezes.

### 4.3 Largura da lateral — os três números, e por que ficamos com 262px

| Lateral | Largura | Onde |
|---|---|---|
| Portal | **306px** | `.sidebar-nav-tree` na `portal.css` |
| Módulo de Atendimento, árvore (a atual) | **310px** | o `<nav>` do pacote do módulo |
| Módulo de Atendimento, lista (a legada) | **318px** de largura, item de **104px** de altura | mesmo pacote, atrás da bandeira desligada |
| **Medido na tela viva** | **262px** | `blip-medidas-monitoramento.md` §3 |

Quatro números para a mesma coisa, e nenhum deles é erro: o módulo de
Atendimento tem **duas laterais** no mesmo pacote, escolhidas por bandeira de
funcionalidade — uma árvore de 310px e uma lista de cartões de 318px —, e o
portal tem a sua própria, de 306px.

**Fica em 262px.** É o que estava na tela no dia da medição, e tela viva ganha de
folha quando as duas discordam: a folha diz o que o código pode fazer, a tela
diz o que ele fez. Os outros três ficam registrados porque a diferença entre
262 e 310 é grande demais para ser esquecida — se algum dia a nossa lateral
parecer estreita ao lado da deles, a resposta está aqui.

*Não replicado:* a lateral legada do portal recolhe para 36px. **Não temos
lateral que recolhe**, e isso não foi visto na tela viva.

---

## 4.4 A área de conteúdo — o padding é proporcional, e há teto

Esta é a correção mais silenciosa e a que mais errava fora da tela onde foi
medida.

| # | Peça | Antes | Depois | Regra lida |
|---|---|---|---|---|
| 1 | Padding lateral | **28px** fixo | **2%** | `padding: 2rem 2%` no contêiner interno deles |
| 2 | Teto de largura | nenhum | **90%** a partir de 1920px, **85%** a partir de 2560px, centralizada | mesma regra, nos dois pontos de quebra |
| 3 | Altura da área | `calc(100vh - 136px)` | igual | `height: calc(100vh - 136px)` — **os 136px estão no código deles como número fixo**, o que confirma o nosso `--g-topo-h` |

**Por que 28px estava errado sem parecer errado.** 28,47px é exatamente 2% da
área que sobra depois da lateral numa tela de 1707px. A medição de DOM leu o
resultado e nós gravamos o resultado como se fosse a regra: acertava aquela
largura e errava todas as outras — em 1280px o conteúdo ficava com folga demais,
em 2560px com folga de menos.

**O teto de largura é regra de leitura, não de estética.** Sem ele, numa tela de
2560px a tabela de monitoramento tem 2200px de largura e o olho perde a linha
entre a primeira coluna e a última. Eles param de crescer em 90% e depois em 85%.

Pontos de quebra deles, para referência: 1280 · 1366 · 1440 · 1536 · 1600 ·
1920 · 2560. *Não replicados* — só os dois que o teto usa.

**A escada de `z-index` deles**, conferida contra a nossa: rodapé 10000 ·
lateral 20000 · barra de módulos 30000 · barra da conta 40000 · painel lateral
50000 · página 60000 · menu suspenso 70000 · véu de modal 80000 · modal 90000 ·
carregamento 100000 · aviso 110000. A **ordem** é a nossa (30 / 31 / 40); a
grandeza não. Fica registrado que a nossa escada não tem degrau para modal,
véu, carregamento e aviso — quando o primeiro modal da Gestão nascer, é esta a
ordem a seguir.

---

## 5. Densidade de tabela

A tabela deles tem **duas densidades declaradas**, e isto é regra, não estilo:

| Peça | Padrão | Denso | Regra lida |
|---|---|---|---|
| Altura da linha | **64px** | **48px** | `bds-table-row { height: 64px }`; `.dense-row { height: auto }` |
| Conteúdo da célula | `min-height: 48px` + `margin: 8px 0` | `margin: 0` | `.cell` / `.dense_cell` |
| Cabeçalho de coluna | `height: 64px` | `min-height: 48px` | `.th_cell` / `.dense-th` |
| Padding lateral da célula | `0 8px` | idem | `padding: 0 8px` |
| Primeira e última coluna | `padding-left: 16px` / `padding-right: 16px` | idem | `:first-child` / `:last-child` |
| Corpo da célula | **14px**, `vertical-align: middle` | idem | `font-size: 14px` |
| Fio entre linhas | `1px solid` tinta a **16%** | idem | `border-bottom: 1px solid border-2` |
| Última linha | **sem fio** | idem | `:last-child { border-bottom: none }` |
| Moldura da tabela | raio 8px, fundo superfície-1, borda 1px a **6%** | idem | `.sc-bds-table-h` |
| Linha selecionada | `outline: 2px` na cor de marca, `outline-offset: -1px`, raio 8px, **sem fio** | idem | `.selected--true` |
| Linha clicável | fio **só no hover**, com fundo de 8% | idem | `.clickable--true` |

**A tela de Monitoramento roda no modo denso**: os 48px de cabeçalho e os 49px
de linha medidos no DOM são exatamente `48` e `48 + 1` de fio.

**E existe uma SEGUNDA tabela.** O módulo de Atendimento carrega, além do
componente do design system, uma tabela própria — célula de **51,5px**
(variante curta de 40px), padding de **10px** com 25px nas pontas, cabeçalho com
fio de **2px**, e **linhas em zebra** alternando as superfícies 1 e 2, com as
ações aparecendo só na passagem do cursor. Nenhuma medida bate com a do design
system.

Isso explica a inconsistência de densidade entre telas deles, e é a única coisa
neste documento que eu **não** recomendo replicar: são dois sistemas de tabela
no mesmo produto, e a régua diz que valor que aparece em dois lugares vira um
token, não dois valores diferentes em dois arquivos. Ficamos com a do design
system, no modo denso.

**O que já estava certo na Gestão.** `.tblwrap th { height: 48px }`,
`.tblwrap td { height: 49px }`, `padding: 0 8px` com 16px na primeira coluna,
cabeçalho em **14/600 caixa normal** e fio em `--p-linha-media`. A passada
anterior acertou tudo isto; a folha confirma e nomeia o que era um número solto:
é o **modo denso** do componente deles, não um aperto nosso.

**O que fica registrado e não foi feito:**

- **Linha selecionada com anel de 2px** — a Gestão tem seleção múltipla na
  listagem, e hoje ela não usa este desenho. Tamanho: uma regra de CSS, meia
  hora, mas depende de conferir a marcação que a seleção já usa.
- **Fio só no hover na linha clicável** — nossa tabela mostra o fio sempre.
  Divergência deliberada por ora: a nossa tabela de monitoramento não é
  clicável linha a linha.

---

## 6. Cromo miúdo, com a medida deles

| Peça | Regra deles | Nosso estado |
|---|---|---|
| Botão de ícone | `padding: 8px`, raio 8px, hover 8%, pressionado 16%; foco com anel de raio 4px | corrigido o raio (§4.2 item 9) |
| Botão de ícone terciário | `border: 1px solid` tinta a 20% | não temos variante terciária |
| Menu suspenso | `width: 240px`, `padding: 2px`, raio 8px, sombra `0 8px 12px` a 8% | largura corrigida; padding e sombra **não** — o nosso painel é prosa, não lista de itens |
| Item de lista, três densidades | alto `16px`, padrão `8px 16px`, curto `8px`; raio 8px | não temos as três |
| Etiqueta | altura **24px**, raio **12px** (metade da altura), `padding: 0 4px`, `min-width: 32px`, ícone 16×16 | nossa `.etiqueta` usa `--p-r-sm` e `padding: 1px 8px`. Ver §7 |
| Avatar | raio **40px** | usamos `--p-r-pilula` (999px) — mesmo efeito |
| Aba | item **46px**, `gap: 32px` entre abas, faixa com `padding: 4px 16px`, fio de **2px** | nossa aba tem 48px e o mesmo espaçamento efetivo (16+16). Mantido: 48px é o valor **medido na tela viva**, e a tela viva ganha |
| Modal | `width: 592px`, altura 368px, raio 8px, `padding: 32px`; dinâmico com `max-width: 1000px` | *não conferido nesta passada* |
| Painel lateral fixo | 288px; sobreposto 360px; cabeçalho com `padding: 24px` | não temos painel lateral direito na Gestão |
| Anel de foco | anel de 2px com a borda externa a 4px do elemento, raio 4px, em **cor própria** | a nossa geometria já bate: `outline: 2px` com `offset: 2px` põe a borda externa nos mesmos 4px. **Só a cor diverge** — ver §7 |

---

## 7. O que fica para `packages/ui`, e não foi mexido aqui

Estas quatro divergências vivem em `packages/ui`, que a Gestão divide com o Desk
e com o CRM. **Nenhuma foi alterada nesta passada**, porque o Desk está sendo
mexido em paralelo e uma edição em `packages/ui` seria um choque garantido. Ficam
listadas com tamanho, para o dono decidir quando as duas frentes se encontrarem.

| # | O que está errado | Valor hoje | Valor deles | Tamanho |
|---|---|---|---|---|
| 1 | `--p-r-sm` não existe na régua deles | **5px** | **4px** | uma linha em `tokens.css`; afeta Desk, Gestão e CRM ao mesmo tempo |
| 2 | `--p-t-numero` está entre dois degraus | **28px** | **24px** (o degrau 3 deles) | uma linha; a Gestão já não usa este token — usa `--g-t-valor: 24px` |
| 3 | Cabeçalho de coluna em caixa alta com espaçamento de letra é invenção nossa | `12px / 600`, `text-transform: uppercase`, `letter-spacing: .06em` | **14 / 600, caixa normal** | a Gestão já corrige localmente em `.tblwrap th`; o Desk não. Uma regra em `base.css`, mas ela muda TODAS as tabelas dos três apps |
| 4 | ~~Anel de foco na cor de marca~~ | **FEITO** — ver §7.1 | — |
| 5 | `--p-altura-linha-tabela: 36px` está abaixo das duas densidades deles | **36px** | **48px** (denso) / **64px** (padrão) | a Gestão já corrige localmente; o token compartilhado continua em 36. Uma linha, mas reaperta a densidade do Desk e do CRM |

### 7.1 O anel de foco — o defeito é NOSSO, e não se replica de volta

**A número 4 não é divergência: é defeito nosso, e aqui eles estão certos.**
Fica explícito porque é a única linha deste documento onde a instrução se
inverte — em todas as outras replicamos o comportamento deles; nesta, o que se
replica é a *decisão* deles, e o que se apaga é o nosso jeito atual.

O nosso anel de foco usa `--p-marca`. A mesma cor pinta o item ativo de
navegação, a borda de campo em foco e a ação primária. Resultado: **teclado e
mouse dizem a mesma coisa.** Quem percorre a lateral pelo Tab vê o anel na cor
que já marca o item onde ele está, e deixa de saber qual dos dois é qual.

Eles resolvem com uma **cor de foco própria** — não é a cor de marca, não é
nenhum dos quatro estados, e é a única cor do sistema deles com um papel só.
Existe exatamente para isso: foco de teclado não pode compartilhar cor com nada,
senão deixa de ser sinal.

**Corrigido.** `--p-foco` existe, nos dois temas, e é **o único token da folha
com um papel só** — não pode ser reaproveitado para mais nada. Violeta porque
nenhum outro papel do Pipe usa violeta: nem a marca, nem os quatro estados, nem
a paleta de gráfico.

| Peça | Antes | Depois |
|---|---|---|
| `:focus-visible` global | `outline: 2px solid var(--p-marca)` | `var(--p-foco)` |
| Borda do campo em foco | `--p-marca` | `--p-marca` — **fica**: ela é o realce do campo, não o anel, e some sob o anel que a regra global desenha por cima |
| Pílula de filtro, busca do cartão, busca do topo | `outline: none` no `<input>` e **nada** na caixa de fora | `:focus-within` na caixa, com o mesmo anel de 2px |

**O terceiro achado foi pior que o defeito de cor.** Três controles da Gestão são
um `<input>` sem moldura dentro de uma caixa que tem a moldura, e os três
apagavam o anel do `<input>` com `outline: none` — sem repor nada na caixa. Eram
três controles que recebiam foco de teclado e **não mostravam que receberam**:
quem navega por Tab digitava às cegas. O `outline: none` continua (um anel
apertado em volta do texto dentro de uma caixa que já tem borda fica confuso),
mas agora quem acende é a caixa, com `:focus-within`.

**Regra para as telas novas:** nenhum `outline: none` sem um `:focus-within` no
ancestral que o reponha, e `--p-marca` nunca em anel de foco.

---

## 7.1 A home do portal — o que ela é, e por que não virou tela

**A descoberta que muda o plano: a home deles não é o painel do cliente. É a
home DE UM BOT.** Ela não se alcança por módulo nenhum — chega-se nela clicando
no nome do bot na barra de baixo e escolhendo "Home". Não tem lista de bots, não
tem "recentes", não tem texto de boas-vindas. É a ficha de um contato
inteligente.

Anatomia lida, na ordem do documento:

**Cabeçalho:** avatar do bot (envio de imagem) · **nome do bot editável na
própria linha** · abaixo, `Id: {nome-curto}` · no canto direito, **"Criado em"**
com a data · e um fio horizontal fechando.

**Grade de três colunas**, cujas áreas se remontam conforme o que existe: com
extensões, a coluna da esquerda é só delas e as outras três empilham à direita;
**quando o cartão de IA aparece, o cartão de Canais some**.

| # | Cartão | Conteúdo | Ação |
|---|---|---|---|
| 1 | **Extensões para você** | cartões com ícone, nome e resumo de duas linhas; rodapé em azul dizendo **"Teste grátis"** ou **"Instalação grátis"** | "Ir para Blip Store" |
| 2 | **Inteligência Artificial** | selo **"Novo!"** ao lado do título; *"Comece com um modelo de IA pronto ou crie um do zero."* | "Vamos lá!" |
| 3 | **Canais** | fileira de logotipos, sempre na mesma ordem, cada um aceso conforme o estado de ativação | "Ver canais" |
| 4 | **Equipe** | fila de avatares com teto de 8; com um membro só, o vazio é *"Convite seu time para o seu contato inteligente"* | "Adicionar equipe" |
| 5 | **Preferências** | três campos lado a lado: Cultura, Fuso horário e Plano (este desabilitado) | "Aplicar alterações" |
| 6 | **Métricas** | três colunas separadas por fio: **Usuários** · **Mensagens recebidas** · **Mensagens enviadas**, cada uma com dica explicando a população, o número grande e um **"Ver mais" que só aparece na passagem do cursor** | — |

Medidas: grade com `gap: 0 .8rem` e `margin-bottom: .8rem` por área — ou seja,
**12,8px nos dois eixos**; pontos de quebra em 62em (duas colunas) e 48em (uma);
cartão de extensão com raio 8px, altura máxima de 96px e um `translateY(-4px)`
na passagem do cursor; bloco de métricas com 24px de padding e divisória de 1px
com 32px de recuo; número da métrica em 32px negrito, rótulo em 16px, dica em
12px.

**Não construída, e a razão é de escopo, não de dado.** A nossa `/` é o
Monitoramento, e o módulo Atendimento aponta para ela — é a decisão que já está
tomada e escrita na casca. A home deles é uma tela **a mais**, de um objeto
("o bot") que o nosso domínio não tem: no Pipe não há bot, há tenant e canais.

O que dela é traduzível para o nosso domínio, se o dono quiser a tela:
cabeçalho com nome do tenant e data de criação; cartão de **Canais** (temos);
cartão de **Equipe** (temos); cartão de **Preferências** com fuso horário
(temos); e o bloco de **Métricas** de três colunas com o "Ver mais" no hover
(temos os números). Ficariam de fora **Extensões** e **Inteligência
Artificial**, que dependem de loja de extensões e de modelos de IA. Tamanho:
**dois dias**, e nenhum dado novo — cinco das seis peças já existem em consulta.

---

## 8. Módulo de Atendimento — o que existe lá e ainda não existe aqui

Comparação da tela de Monitoramento com `blip-gestao-funcoes.md` §1. Só entram
itens **observáveis** — nada de suposição sobre o que a plataforma deles faz por
baixo.

### 8.1 Replicado nesta passada

| # | Regra deles | O que fizemos |
|---|---|---|
| 1 | As duas abas de conversa têm **conjuntos de coluna diferentes**: "Atribuído/Em andamento" mostra espera na fila, 1ª resposta, contato, fila, atendente, tempo de atendimento e ticket; "Aguardando atendimento" mostra tempo na fila, contato, fila, ticket e **prioridade** | duas tabelas separadas, cada uma com as colunas da sua aba. Antes as duas usavam a MESMA tabela, e na aba "Aguardando" as colunas Atendente, 1ª resposta e Atendimento saíam com travessão em toda linha — três colunas mortas empurrando para fora a prioridade, que é o que decide quem sai da fila primeiro |
| 2 | Coluna de **prioridade** na fila de espera | passou a aparecer. O dado já existia (`conversa.prioridade`, com `baixa`/`media`/`alta`) e nunca chegava à tela |
| 3 | O **indicador de SLA mora dentro da coluna de tempo de atendimento**, não numa coluna própria | a pastilha de SLA passou para dentro daquela célula, ao lado do número. A coluna "SLA" separada era invenção nossa |
| 4 | A linha fica **destacada enquanto o contato aguarda a 1ª resposta** do atendente | terceiro degrau de severidade na linha, abaixo de SLA estourado e no mesmo amarelo do alerta. E a legenda deles entrou sob a tabela, literal: *"O destaque amarelo sinaliza que um ticket foi atribuído a um atendente, mas o contato ainda não recebeu a primeira resposta."* |
| 5 | **Vocabulário literal das colunas** | "Espera na fila" → **Tempo na fila**; "1ª resposta" → **Tempo de 1ª resposta**; "Atendimento" → **Tempo de atendimento**; na aba Filas, "Na fila" → **Tickets aguardando** e "Em atendimento" → **Tickets em atendimento**. A aba passou a se chamar **"Atribuído/Em andamento"** |
| 6 | **Valor vazio é "Aguardando...", não travessão** | onde ainda não houve 1ª resposta não existe tempo de atendimento para medir. Travessão diz "não se aplica"; "Aguardando..." diz "o cronômetro ainda não começou", que é o caso |
| 7 | **A busca do cartão procura pelo Nº do ticket**, e o contato tem filtro próprio | a nossa varria os dois, o que dava dois caminhos para a mesma coisa e nenhum exato. Rótulo agora é o deles: *"Buscar pelo Nº do ticket"* |
| 8 | **Estado vazio em três partes** | *"Nenhum dado encontrado"* + *"Não encontramos dados com os filtros aplicados. Tente ajustar os filtros ou redefinir a busca para ver outros resultados."* + botão **"Redefinir filtros"**. O nosso tinha só a primeira parte, e deixava a pessoa sem saída |
| 9 | Estado vazio dos avisos | *"Você não tem nenhuma notificação"* |

### 8.2 Registrado, e não feito — com o tamanho

| # | O que falta | Por quê | Tamanho |
|---|---|---|---|
| 1 | ~~A régua de prioridade tem CINCO degraus~~ | **FEITO** — ver §8.5 | — |
| 2 | **Desconectar atendente inativo** pela tela de monitoramento | eles avisam o atendente e, se ele não confirmar em **1 minuto**, trocam o status; tickets em curso **não** são redistribuídos | precisa de um canal vivo Gestão → Desk para o aviso e o relógio de 1 minuto. Dois a três dias, e é a primeira coisa da Gestão que empurra evento para o app do atendente |
| 3 | **Transferir para outra fila ou atendente** pela linha do monitoramento | a coluna de Ações deles tem o atalho; a nossa só abre a conversa | um dia, e depende de a transferência existir como operação de domínio. Não vai virar botão desabilitado enquanto não existir |
| 4 | **Encerrar o ticket pela tela de monitoramento**, com etiquetas no fechamento | idem | meio dia depois do item 3 |
| 5 | **Tela cheia é uma SEGUNDA MONTAGEM da tela** | o nosso botão só chama a API do navegador e não muda nada. O deles troca o tema para escuro, troca o componente de cabeçalho por um com a marca e o avatar do contrato, **acrescenta** o bloco de tickets por hora e **remove** o cartão de abas + tabela | **dois dias**, e não a meia estimada antes — ver §8.7.2 item 4. A estimativa velha supunha "acrescentar uma métrica"; o molde mostrou uma árvore diferente, um tema diferente e uma consulta nova (aberturas por hora) |
| 6 | **Filtros salvos** | ficam no navegador, não na conta — eles avisam que não replicam entre máquinas | meio dia, e a decisão de guardar no navegador é regra deles, não limitação |
| 7 | **Chat gestor → atendente** pela tela de monitoramento | conversa direta do supervisor com quem está atendendo | é produto novo, não um ajuste: uma semana, e depende do mesmo canal vivo do item 2 |
| 8 | **"-" quando não há dado suficiente**, distinto de "0" | eles mostram `0` / `00:00:00` quando o valor é zero de verdade, e `-` quando não há população para calcular | o nosso `duracao(null)` já devolve travessão; o que falta é **auditar métrica por métrica** se o zero que aparece é zero medido ou população vazia. Um dia de leitura, sem código novo |

O item 8 é o mais barato e o mais perigoso de deixar como está: um zero que na
verdade é "não há o que medir" é a única classe de erro deste painel que mente
sem parecer que mentiu.

### 8.5 A régua de prioridade, com os cinco degraus

Feito. A régua agora é **Máxima · Alta · Média · Baixa · Sem prioridade**, e mora
num lugar só: `NIVEIS_PRIORIDADE`, **em ordem de precedência** — o índice é o
peso. Junto dela nasceram `ROTULOS_PRIORIDADE` (os rótulos deles, literais) e
`pesoPrioridade`.

| Peça | Antes | Depois |
|---|---|---|
| Degraus | `baixa` · `media` · `alta` | `maxima` · `alta` · `media` · `baixa` · **`sem_prioridade`** |
| Padrão da coluna | `media` | **`sem_prioridade`** |
| Ordem da fila de espera | só por data de criação | **prioridade primeiro**, empate pela mais antiga |
| Nível desconhecido | valia `media` | vai para o **fim** |
| O que uma regra de priorização pode atribuir | qualquer nível | tudo **menos** a ausência (`NIVEIS_ATRIBUIVEIS`) |
| Rótulo na tela | mapa local de três | `ROTULOS_PRIORIDADE`, compartilhado |
| Tinta da etiqueta | só `alta` em alerta | `maxima` em erro, `alta` em alerta, o resto neutro |

**O que a ausência conserta.** Com o padrão em `media`, todo ticket nascia com
prioridade que ninguém escolheu, e ordenar a fila por prioridade era ordenar por
um dado inventado — que é por que a nossa fila de espera saía só por data. A
regra deles depende do degrau que faltava: **um ticket `baixa` fura a frente de
um `sem_prioridade`**. É o que o teste `apps/gestao/tests/prioridade.test.ts`
tranca.

**Por que ausência virou VALOR e não `NULL`.** Coluna anulável obrigaria
`prioridade: string | null` em `apps/api`, `apps/desk` e `apps/gestao` ao mesmo
tempo — e as três estão sendo mexidas em paralelo. Um valor nomeado exprime a
mesma coisa, mantém a restrição do banco como uma lista simples, e é o que eles
próprios mostram na tela ("Sem prioridade" é rótulo, não vazio).

**Linhas antigas não foram reescritas, e NÃO DEVEM SER.** Elas gravaram `media`
sob o padrão antigo, quando "alguém escolheu média" e "ninguém escolheu nada"
produziam exatamente a mesma linha. O fato se perdeu no dia em que a coluna
nasceu com padrão, e nenhuma consulta o traz de volta.

Se alguém, algum dia, olhar essas linhas e pensar em rodar um `update` para
`sem_prioridade`: **não há o que corrigir, há dado que não existe.** Um `update`
desses não conserta um erro — inventa um fato, e ainda por cima rebaixaria para
o fim da fila tickets cuja prioridade pode ter sido escolhida de propósito. O
padrão novo conserta daqui para a frente, e isso é tudo o que dá para fazer.
A mesma advertência está no cabeçalho de `0013_prioridade_cinco_degraus.sql`.

**Onde a régua mora, e por quê.** Em `@pipe/core/conversa`, não em `@pipe/db`.

Ela nasceu junto da restrição do banco, em `schema/comum.ts` — e todo o
`schema/` importa `drizzle-orm/pg-core` para montar as restrições. O app do
atendente ordena a coluna dele num componente `'use client'`; importar a régua
de lá arrastaria o driver do Postgres para o pacote do navegador. Foi
exatamente por isso que o Desk manteve um **mapa paralelo de pesos**, e foi
assim que as duas cópias divergiram.

Agora `packages/db` importa de `@pipe/core/conversa` para montar a restrição —
regra pura no pacote de regra pura, e o esquema consumindo dela, nunca o
contrário.

**O comparador fica em cada app, e isso é deliberado:** a linha da Gestão guarda
a data em `marcos.criadaEm` e a do Desk em `criadaEm`. Uma função genérica o
bastante para servir às duas custaria mais do que as três linhas que economiza.
O que não pode divergir é a régua, e ela é uma só.

**Fica pendente, e é em `apps/desk` (outro agente):** `src/lib/ordem.ts` ainda
tem o mapa paralelo (`PESO_PRIORIDADE`), com três níveis e um padrão que manda o
desconhecido para o peso de `media`. Com a régua nova ele ordena `maxima` e
`sem_prioridade` **como se fossem média** — a fila do atendente erra nos dois
extremos, e o de cima é o que mais custa. A correção é trocar o mapa e a função
`peso` por `pesoPrioridade` de `@pipe/core/conversa`, que é puro e não arrasta
banco nenhum para o navegador.

### 8.3 O menu do módulo, item a item

O menu deles, lido no pacote do módulo, com os grupos e a ordem exatos:

```
Monitoramento                (solto)
Histórico                    (solto)
Relatórios    ├ Atendimento
              ├ Satisfação        (só quando o idioma é português)
              ├ Calls
              ├ Vendas
              └ Score             ← "Qualidade do atendimento"
Comunicação   ├ Blip Copilot      ← PRIMEIRO do grupo
              ├ Respostas prontas
              └ Modelos de mensagens
Regras        ├ Atendimento
              ├ SLA
              ├ Horários
              └ Score             ← "Lead Score"
Atendentes    ├ Gestão de atendentes
              ├ Filas de atendimento
              └ Pausas personalizadas
Preferências  ├ Configurações gerais
              ├ Gestão de metadados
              └ Canais de atendimento
```

**Quatro itens não estavam em `blip-gestao-funcoes.md`**, que foi levantado pela
central de ajuda: **Score (Qualidade do atendimento)**, **Blip Copilot**,
**Score (Lead Score)** e **Gestão de metadados**. Todos os quatro vivem atrás de
bandeira de funcionalidade, que é por que não aparecem na documentação pública.

E há uma confusão real do produto deles, não erro de leitura: **dois itens
diferentes se chamam "Score"** — um em Relatórios, outro em Regras.

**Onde a nossa lateral diverge, e por quê:**

| Deles | Nosso | Motivo |
|---|---|---|
| Relatórios é grupo da lateral de Atendimento | virou o módulo **Análise**, na barra de cima | decisão anterior, já escrita na casca; a barra deles tem "Análise" como módulo, então os relatórios estão nos dois lugares lá |
| Canais de atendimento é item de Preferências | virou o módulo **Canais** | mesma decisão |
| **Gestão de atendentes** é o primeiro item de Atendentes | **FEITO** — ver §8.6 | — |
| **Gestão de metadados** | não existe | não sabemos o que a tela faz — só o nome. **Não estimável sem ver a tela** |
| **Blip Copilot** e **Lead Score** | não existem | são produtos, não telas de gestão |
| ~~Atendentes ├ Operação~~ | **removida** | ver §8.6 — ela mostrava o quadro de atendentes (que virou Gestão de atendentes) mais uma cópia só-leitura dos motivos de pausa, que já têm tela com formulário logo abaixo |
| Preferências ├ Dados | só nosso | não tem par na lateral deles |

**Regras de menu deles que valem para nós:** item sem permissão **some** do
menu (não aparece desabilitado) — que é a nossa regra também; o estado dos
grupos abertos e o item ativo ficam guardados **no navegador**, e a lateral rola
sozinha até o grupo ativo. Este último não temos: os nossos grupos abrem pelo
caminho da rota, e nada é lembrado entre visitas. **Meio dia**, e é estado de
navegador, não de conta — a mesma escolha que eles fazem com os filtros salvos.

### 8.6 Gestão de atendentes

Feito, em `/atendentes/gestao`, e agora é o **primeiro item do grupo Atendentes**,
na ordem deles.

As quatro colunas são as deles, na ordem deles — **Atendente · E-mail · Filas ·
Tickets simultâneos** —, com o vazio *"Sem filas"* e o estado vazio *"Não existem
atendentes cadastrados. Que tal adicionar alguns?"*. As duas do fim, Status agora
e Situação, são nossas.

**Ela não é tela nova: é a tela de Operação, com as duas colunas que faltavam.**
Metade do trabalho foi apagar. `/configuracoes/operacao` mostrava duas coisas —
um quadro de atendentes com Pessoa · E-mail · Status · Situação, e uma cópia
só-leitura dos motivos de pausa que já têm tela com formulário em
`/atendentes/pausas`. Sobravam um item de menu sem par na lateral deles e uma
tabela repetida em dois lugares. A tela saiu, e com ela `carregarOperacao`.

**A divergência que fica, e é de domínio:** na plataforma deles o teto de
tickets simultâneos é **um número por pessoa** — um padrão global do contrato e
um override individual. No Pipe ele nasce da FILA (`fila.capacidade_padrao`) com
override por participação (`fila_atendente.capacidade_override`), então quem está
em duas filas de capacidades diferentes tem dois números.

A coluna mostra **o maior**, e não a soma. Não é escolha nova: é a mesma regra
que o Monitoramento já usava na coluna "Limite" (`limitePorAtendente`), e a razão
é que o teto é do ATENDENTE — quem está em duas filas não atende o dobro por
estar em duas. Somar transformaria "entrar numa fila a mais" em "ganhar
capacidade".

**Não tem formulário, e é deliberado.** Adicionar atendente lá é convidar por
e-mail, e o convite já existe no Pipe com fluxo próprio (`/convite/[token]`).
Editar teto individual pede o override por participação em fila, que se edita em
`/atendentes/filas`, onde a fila e a capacidade padrão estão do lado. Duplicar os
dois aqui daria dois caminhos para a mesma gravação.

**Por confirmar, quando o dono salvar a tela** (`/desk/team`):

- se a lista deles mostra **todos os usuários do contrato** ou só quem está em
  alguma fila. A nossa mostra todos, e marca "Sem filas" em alerta — quem não
  está em fila não recebe conversa, e isso é configuração pela metade;
- o que a etiqueta **"Não acionável"** marca, e onde. O levantamento pegou o
  rótulo e a dica (*"Esta configuração é feita no painel do contrato"*), mas não
  a coluna a que ela pertence;
- se há **ações por linha** (o levantamento não achou nenhuma, mas a central de
  ajuda fala em editar e excluir passando o mouse sobre o nome);
- se a tela tem **busca** e **paginação** — as duas existem em outras telas
  deles, e nenhuma apareceu no levantamento desta.

### 8.4 Vocabulário deles, registrado para as próximas telas

Levantado literal e guardado aqui porque cada tela nova vai precisar dele:

- **Estados de ticket:** Na fila · Atribuído · Em atendimento · Finalizado.
- **Status de atendente:** Online · Em Pausa · Invisível · Offline.
  *A nossa tela mostra três; falta **Offline**, que é diferente de Invisível.*
- **Prioridade:** Máxima · Alta · Média · Baixa · Sem prioridade.
- **Período:** Hoje · Ontem · Últimos 7 · 15 · 30 · 60 · 90 · 120 · 180 dias ·
  Personalizado. *Onze opções; o padrão do Histórico é "Últimos 30 dias".*
- **Colunas do Histórico:** Ticket · Atendente · Contato · Tempo de espera ·
  Tempo de 1ª resposta · Tempo de atendimento.
- **Colunas do Relatório de atendimento:** Fila · Tickets finalizados · Tempo
  médio da 1ª resposta · Tempo médio de espera · Tempo médio de resposta ·
  Tempo médio de atendimento.
- **Metas de SLA, com as siglas:** Tempo de espera (**TME**) · Tempo de primeira
  resposta (**TMR1**) · Tempo de atendimento (**TMA**). E os avisos: *"O tempo
  de espera na fila excedeu o SLA"*, *"O tempo de 1ª resposta excedeu a meta de
  SLA"*, *"O tempo de atendimento excedeu a meta de SLA"*.
- **Paginação:** "Resultados por página" · "Exibindo {0}-{1} de {2} resultados".
- **Salvar/erro:** "Alterações salvas com sucesso!" / "Não foi possível salvar as
  alterações!" / "Falha ao exibir os dados".
- **Aviso de janela:** *"Atrasos de SLA não são exibidos em períodos maiores que
  90 dias."*

As três dezenas de mensagens de validação, o dicionário do Relatório de vendas e
os textos do encerramento automático estão levantados e podem ser recuperados —
não foram transcritos aqui porque nenhuma das telas correspondentes existe
ainda, e vocabulário sem tela vira dicionário morto.

---

## 8.7 O MOLDE — o que a folha de estilo não podia dizer

**Correção de método, e ela invalida a premissa dos §1 a §7.** Este documento
tratou `portal.css` e os componentes como fonte. Eles dizem o **tamanho das
peças** — largura, raio, espaço, tipografia. Não dizem a **montagem**: quais
elementos existem, em que ordem, aninhados em quê, e o que é condicional.

Foi por isso que as medidas ficaram certas e a tela não ficou igual. Medida sem
montagem é a lista de materiais sem a planta.

A montagem está no pacote, como árvore de componentes. O que segue foi lido lá.

### 8.7.1 A pergunta que precisava de resposta: abas ou lateral?

**Lateral. A nossa navegação está estruturalmente certa.**

A casca do módulo de Atendimento tem **três variantes**, escolhidas por bandeira,
e duas delas são lateral:

| Variante | Montagem |
|---|---|
| atual (`menu-tree-sidebar`) | `contêiner externo` → **`<nav>` da árvore** + `contêiner de rolagem` → `contêiner interno` → página |
| anterior (`attendance-menu-mfe`) | `contêiner externo` → **`<nav>` de cartões** + `contêiner` → `contêiner interno` → página |
| sem bandeira | `contêiner` → página, **sem menu nenhum** — quem navega é o portal |

O contêiner externo é `display: flex` numa caixa de `calc(100vh - 136px)`, e o
`<nav>` é **irmão** do contêiner de conteúdo. Fileira, lado a lado: é lateral
esquerda, não fileira de abas.

A fileira de abas horizontais que apareceu na captura é de **Análise**, que é
outro módulo e vive no portal, não neste pacote. Módulos diferentes navegam
diferente, e o de Atendimento — o nosso espelho — navega por lateral.

### 8.7.2 O que o molde revelou e a folha tinha escondido

**1. A ROLAGEM não é da página; é do contêiner de conteúdo.**

O contêiner externo tem altura fixa de `calc(100vh - 136px)`. Dentro dele, o
contêiner de conteúdo é `display: flex; flex-direction: column; width: 100%;
height: 100%; overflow-y: auto; overflow-x: hidden`, e a lateral é irmã dele,
com rolagem própria.

Ou seja: **as duas barras do topo e a lateral não rolam porque estão FORA da
caixa que rola.** Não há nada preso, nada grudado.

A nossa casca faz o oposto: a página inteira rola e as barras são
`position: sticky`, e a lateral é `sticky` com `top: 136px`. O resultado se
parece de longe e se comporta diferente de perto — barra grudada repinta e treme
na rolagem, e a lateral disputa a barra de rolagem da página. **É a divergência
estrutural mais visível da casca, e nenhuma medida a conserta.**

**2. O contêiner interno é CENTRALIZADO** (`align-self: center`) dentro do
contêiner que rola, com `flex: 1 0 auto` e o `padding: 2rem 2%` que já
registramos. O teto de 90%/85% é a largura DELE.

**3. A tela de Monitoramento tem uma árvore que a nossa não tem.** Molde lido:

```
página
├ bloco de tema        (claro normal, ESCURO em tela cheia)
│   ├ cabeçalho de tela        título + [atualizar] [tela cheia]
│   ├ faixa de filtros
│   └ contêiner de dados       (position: relative — é ele que ancora o "carregando")
│        ├ carregando
│        ├ LINHA de métricas   (flex, justify-between)  cartão largo + cartão estreito
│        ├ LINHA de métricas   (flex, justify-between)  cartão largo + cartão estreito
│        └ só em tela cheia:   bloco de tickets por hora
└ fora do bloco de tema, e só fora da tela cheia:
     └ cartão de abas + tabela
```

Três coisas aí são estruturais e nós não temos:

- **a grade 2×2 não é uma grade.** São **duas linhas de dois**, cada uma
  `flex` com `justify-between`, e não um `grid`. Por isso o cartão largo e o
  estreito se comportam como se comportam quando a tela encolhe;
- **o cartão da tabela está FORA do bloco de tema**, irmão dele. Não é mais um
  filho da mesma coluna;
- **o contêiner de dados existe para ancorar o "carregando"** (`position:
  relative`), que cobre os cartões sem cobrir a tabela.

**4. Tela cheia é OUTRA ÁRVORE, não um botão de tela cheia.** Ela troca o tema
para escuro, troca o componente de cabeçalho por um com a marca, e **acrescenta**
o bloco de tickets por hora — e o cartão de abas + tabela **some**. O nosso botão
chama a API do navegador e não muda nada. A lacuna que eu tinha registrado em
§8.2 item 5 é maior do que eu disse: não é "acrescentar uma métrica", é uma
segunda montagem da tela.

**5. O estado vazio tem ilustração.** Molde: `margin-top: 3.5rem`, coluna
centralizada, ilustração de `8.5rem` de largura, e o bloco de texto com
`width: 60%` e `margin: 2rem`. O nosso `SemDados` tem título, explicação e botão,
e nenhuma ilustração — que é o que o `@pipe/ui` já oferece em `ilustracoes.tsx`.

**6. As cinco abas confirmadas na origem**, com os nomes internos: tickets
abertos · tickets aguardando · atendentes · **times** · tags. O terceiro nome
interno é "times", e o rótulo é "Filas" — é a mesma confusão fila/time que o
levantamento de funções já tinha apontado.

**7. A régua de prioridade confirmada na origem**: máxima · alta · média ·
baixa · **nenhuma**. O degrau de ausência que virou `sem_prioridade` no §8.5 é
literalmente o que o pacote deles chama de `None`.

### 8.7.3 Os dois moldes que se repetem em TODA tela

Antes das telas uma a uma: dois componentes aparecem em todas, e é neles que a
divergência se multiplica por vinte.

**O cabeçalho de tela.**

```
cabeçalho   width 100%, flex row, padding-bottom 1rem,
            FIO EMBAIXO de 1px na superfície 3, margin-bottom 1rem
├ ESQUERDA  width 40%, justify-start
│   └ título   flex, align-center, 24px / peso 400, gap 8px
│       └ (fenda para o ícone de informação, margin-left 12px)
└ DIREITA   width 60%, justify-end   ← as ações da tela
```

Duas coisas que a nossa `.board-head` não faz:

- **o cabeçalho tem FIO embaixo**, com 1rem antes e 1rem depois. O nosso não tem
  fio nenhum e usa `margin-bottom: 23px`;
- **a divisão é 40% / 60% declarada**, não `margin-left: auto`. Em tela estreita
  isso muda quem cede espaço: no deles o título é espremido primeiro; no nosso,
  as ações.

O tamanho e o peso do título (24/400) já batiam.

**A faixa de filtros.**

```
provedor de filtros salvos   (guarda o estado, chaveado por uma CHAVE DA TELA)
└ bloco
   ├ SE há filtro salvo aplicado → botão sólido "Filtro salvo: <nome>", ACIMA da faixa
   ├ faixa   min-height 56px, flex align-center
   │   ├ ESQUERDA — três estados MUTUAMENTE EXCLUSIVOS:
   │   │   a) há filtro aplicado → linha de botões de contorno (gap 8px), um por
   │   │      filtro, cada um com o título em 14/bold e um CONTADOR de opções ao lado
   │   │   b) há filtro salvo pelo nome → a esquerda fica VAZIA
   │   │   c) senão → "Filtros rápidos:" em 16/bold + linha de botões de contorno
   │   └ DIREITA   margin-left auto, gap 8px
   │       ├ SE a tela tem período → botão de TEXTO (sem moldura) com o período,
   │       │   ou "início - fim" quando personalizado
   │       └ botão de CONTORNO com ícone de funil: "Filtros"
   └ painel lateral de filtros   (abre pela direita)
```

Quatro coisas estruturais que a nossa faixa não faz:

- **os três estados da esquerda são exclusivos.** Nós mostramos sempre
  "Filtros rápidos" com as pílulas. No deles, assim que um filtro é aplicado o
  rótulo SOME e as pílulas viram botões com contador;
- **"Filtros" abre um PAINEL LATERAL**, não um formulário na página;
- **período é botão de texto, "Filtros" é botão de contorno** — hierarquia
  diferente para ações diferentes;
- **o filtro salvo é por tela** (cada uma tem a sua chave), e o nome dele aparece
  num botão ACIMA da faixa, não dentro dela.

Isso responde de graça o item "filtros salvos" da fila: agora sei a forma, e ela
não é um botão de salvar ao lado das pílulas.

### 8.7.4 O que fazer com isso

Nada foi reescrito ainda — a ordem é montagem primeiro, medida depois, e a
montagem acabou de mudar. O que a próxima passada precisa fazer, em ordem:

1. **A casca**: trocar o modelo de rolagem. Caixa externa de altura fixa, lateral
   e conteúdo irmãos, rolagem no conteúdo. Sai todo o `position: sticky`.
2. **O Monitoramento**: reproduzir a árvore acima — bloco de tema, contêiner de
   dados ancorando o carregando, duas linhas de dois, e a tabela fora do bloco.
3. **Tela cheia**: segunda montagem, não um botão.

---

## 9. Duas gerações no mesmo arquivo — como não se enganar

A `portal.css` tem **duas gerações do design system convivendo**, e vários token
aparecem com **dois valores de reserva diferentes**: a superfície 2 é `#ededed`
em 87 lugares e `#e0e0e0` em 46; o conteúdo padrão é `#282828` em 265 e `#454545`
em 73; a cor de foco é uma na folha do portal e outra na folha dos componentes.

Isso importa por dois motivos:

1. **A geração nova é a dos componentes**, não a da folha. Quando as duas
   discordam, o valor do componente é o que está na tela.
2. **A régua deles não é aplicada com disciplina.** São 554 declarações de raio
   com **91 valores distintos** — incluindo cinco formas diferentes de escrever
   "pílula" — e 468 declarações de fonte com **79 valores distintos**. A régua
   *efetiva* (8/4/16 de raio; 10/12/14/16/20/24/32 de fonte) só aparece quando
   se conta a frequência.

**A leitura que isso confirma:** não é que eles tenham uma régua melhor que a
nossa. É que eles têm **uma régua enterrada em ruído**, e o valor de replicá-los
está na régua, não no ruído. A nossa `verificar-tokens.mjs` faz o que a folha
deles não faz — impede o ruído de nascer.

Registro de defeito, para não virar bandeira nossa: a classe de entrelinha usada
nos itens de menu deles resolve para **5%**, sobrescrevendo os 150% do tamanho.
É defeito do design system deles, não escolha, e **não foi replicado**.

---

## 10. O que não foi lido, e por quê

- **A faixa de submenu de `4,125rem` em `top: 5,75rem`** e o sublinhado de módulo
  ativo de 5px na `portal.css` são da geração AngularJS. A geração no ar mede
  **80px + 56px** com sublinhado de **4px**, e é essa que vale.
- **`webpack---*`** não foi aberto: é código-fonte original recuperado, e está
  fora da linha de cópia.
- **Estados de foco de teclado da barra de módulos e da lateral** — não lidos.
- **Comportamento abaixo de 1280px** — nenhum ponto de quebra abaixo do primeiro
  deles foi exercitado.
- **O tamanho em px dos ícones do design system deles** — o pedaço do componente
  de ícone não está no que foi salvo. Os nossos 24px de lateral e 20px de barra
  vêm da medição de DOM.
- **O que "Gestão de metadados" faz** — só temos o nome do item de menu.
- **O roteador e os módulos fora de Atendimento** — não estão no que foi salvo.
  Ver o pedido no fim do relatório.

---

## 11. Um achado que não é de design

O `settings.json` publicado junto do pacote do módulo de Atendimento deles traz,
**em texto claro**, uma credencial de função em nuvem e uma chave de cliente de
bandeiras de funcionalidade. É bundle público.

Fica registrado aqui por duas razões: é o tipo de coisa que se avisa a quem se
está estudando, e é um lembrete do que **não** replicar — a nossa configuração
de cliente não pode carregar segredo, e vale conferir isso antes do primeiro
pacote público do Pipe ir para o ar. **Nada dessa credencial foi usado, guardado
ou transcrito.**

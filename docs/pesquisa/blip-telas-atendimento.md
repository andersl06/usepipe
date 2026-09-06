# As telas do módulo Atendimento da Blip, medidas

Levantamento das oito áreas do módulo **Atendimento** do Portal da Blip, feito em sessão
autenticada e **somente leitura**: nada foi criado, editado, apagado ou disparado lá.

As medidas vêm de duas fontes, e onde discordam vence a primeira:

1. **Estilo computado do DOM vivo**, lido com `getComputedStyle` na própria tela. É a fonte
   autoritativa: já resolve variável, ponto de quebra e altura renderizada de verdade.
2. **Os pacotes compilados** (`portal.css`, o casco; `desk-mfe.js`, o módulo de Atendimento),
   usados para confirmar regra e descobrir nome de rota. Ficam fora do repositório.

**Aviso de uso.** Medida e regra de layout são fato, não expressão criativa. O que se aproveita é
a **disposição**: quantos degraus, onde cada coisa fica, qual a densidade. Nenhum arquivo deles
entra no repositório e nenhum hex deles entra no nosso CSS. A paleta continua sendo a moss do
`docs/marca/MARCA.md`, e os tokens continuam sendo os `--p-*` do `@pipe/ui`.

Complementa o `blip-design-system.md`, que mediu os 31 tokens de cor. Este mede as **telas**.

---

## 1. O mapa completo do módulo

Lido da árvore de navegação (os itens vivem em shadow DOM, então não aparecem num
`querySelectorAll` comum — é preciso atravessar cada `shadowRoot`):

```
Monitoramento
Histórico
Relatórios ├ Atendimento
           ├ Satisfação
           ├ Calls
           └ Vendas
Comunicação ├ Respostas prontas
            └ Modelos de mensagens
Regras     ├ Atendimento
           ├ SLA
           └ Horários
Atendentes ├ Gestão de atendentes
           ├ Filas de atendimento
           └ Pausas personalizadas
Preferências ├ Configurações gerais
             └ Canais de atendimento
```

Duas lições de estrutura, antes de qualquer medida:

- **Cinco grupos e dois itens soltos.** Monitoramento e Histórico são itens de primeiro nível
  porque são o trabalho; todo o resto está atrás de um grupo que abre.
- **Nada de configuração no primeiro nível.** Regras, Atendentes e Preferências são grupos, e é
  onde mora tudo que ajusta a operação em vez de operá-la.

Rotas descobertas (só para registro de que a tela existe; nenhuma foi chamada por URL direta com
sucesso — o micro-frontend só resolve a rota pelo clique na lateral):
`monitoring`, `history`, `rules`, `sla`, `attendance-hours`, `survey-dashboard`, `sales-dashboard`,
`team`, `general-settings`.

---

## 2. O cromo, que é o mesmo em todas as telas

| Peça | Medida |
|---|---|
| Barra superior (conta) | **80px**, fundo `#141414` (a superfície escura do sistema deles) |
| Barra inferior (produto) | **56px**, fundo `#282828`, um degrau mais clara |
| Topo somado | **136px** |
| Lateral | **262px**, fundo branco, encostada à esquerda |
| Fundo da página | branco |
| Fundo do cartão | `#f6f6f6` — **um degrau mais escuro que a página** |

Repare na inversão: a página é branca e o cartão é cinza. É o contrário do reflexo comum (cartão
branco sobre fundo cinza), e é o que faz a lista de cartões ler como lista sem precisar de borda.

### Tipografia, contada por ocorrência na tela de Monitoramento

```
14px   350 folhas de texto    o corpo da aplicação
16px    98                    valor, título de conta, item de menu
12px      4                   rótulo
24px      1                   o título da tela
```

Três degraus resolvem tudo, exatamente como o `blip-design-system.md` já tinha apontado. O 24px
aparece **uma vez por tela**, no título, e com peso **400** — título deles não é negrito.

### Cores de texto, contadas na mesma tela

Doze valores distintos, mas a distribuição é o que importa:

```
#282828   402 ocorrências   o texto
#52636c    27               o secundário
#636363     4               o terciário
resto       ≤ 8 cada         estado e cromo
```

Ou seja: **uma tinta carrega 90% da tela.** Cor é exceção, não sistema.

---

## 3. O cartão de lista, que é o idioma da casa

Esta é a descoberta que mais muda o nosso código. Seis das oito áreas usam **exatamente o mesmo
cartão** — Histórico, Regras, SLA, Horários, Respostas prontas e Gestão de atendentes. Não é uma
tabela em lugar nenhum.

Medido no `bds-paper` do Histórico e conferido no de Regras:

```
altura            86–88px
padding           20px
raio              16px
fundo             surface-1 (#f6f6f6), sobre página branca
sombra            0 2px 8px -2px rgba(0,0,0,.16)
margem            10px 0
passo entre cartões  96px  (86 de cartão + 10 de respiro)
linha interna     46–48px, flex, alinhada ao centro
```

E a tipografia de dentro, que é a parte que a captura sozinha não entrega — os tamanhos reais estão
no shadow DOM do `bds-typo`, e um `getComputedStyle` no elemento hospedeiro mente (devolve 16px
para tudo):

```
rótulo   12px / peso 400 / entrelinha 18px
valor    16px / peso 700 / entrelinha 24px
exceção  o número do ticket sai 14px / peso 400
```

**O rótulo fica ACIMA do valor**, pequeno e leve; o valor abaixo, grande e negrito. É o oposto da
tabela, onde o rótulo é um cabeçalho distante e a célula é leve. Num cartão, cada campo carrega o
próprio rótulo, e é isso que permite jogar fora o `<thead>`.

Controles do cartão, encostados à direita:

```
caixa de seleção    18×18, margem 0 5px
botão de ícone      40×40
interruptor         42×24
```

### As variações do mesmo cartão

| Tela | Campos | Ações à direita |
|---|---|---|
| Histórico | Ticket, Atendente, Contato, Tempo de espera, Tempo de 1ª resposta, Tempo de atendimento | seta de detalhe |
| Regras | Nome da Regra, Fila | editar, excluir, **interruptor** |
| SLA | Regras de SLA, Metas, Filas atribuídas | editar, excluir |
| Horários | nome em negrito **sem rótulo**, etiqueta "1 fila", descrição | editar, excluir |
| Respostas prontas | Categoria | editar, excluir |
| Gestão de atendentes | avatar, Atendente, E-mail, Filas, Tickets simultâneos | editar, permissões, excluir |

Horários é a única que quebra o padrão rótulo-acima-do-valor: ali o nome é o próprio título, a
etiqueta faz o papel de contagem e a descrição ocupa o meio.

---

## 4. O esqueleto de tela, repetido

De cima para baixo, e igual em Histórico, Regras, SLA, Horários, Respostas prontas e Atendentes:

```
1. linha do título        título 24px/400 à esquerda, ação primária à direita
2. busca                  campo de 410×42, à esquerda, sozinho na linha
3. faixa de filtros       "Filtros rápidos:" + pílulas; à direita, período + botão "Filtros"
4. barra de seleção       caixa "Selecionar todos"
5. a lista de cartões
6. rodapé de paginação    "Resultados por página [5]" à esquerda; "1-5 de 16" + setas à direita
```

Nem toda tela usa os seis degraus, mas quando usa é **nesta ordem**. Botão de ação primária tem
**40px** de altura e vive na linha do título, nunca solto no meio.

---

## 5. Tela a tela

### 5.1 Monitoramento — conferência

Confirma o que o nosso já faz: grade 2×2 com o cartão largo à esquerda e o estreito à direita nas
duas linhas, duas faixas de filtro rápido (uma acima da grade, outra entre a grade e a tabela), e
a busca dentro do cartão do "Monitoramento detalhado". Dois números saem na cor de marca deles
("Na fila" e "Em atendimento"); todo o resto fica em tinta escura.

**Onde o nosso diverge, de propósito e com registro:** as nossas barras são de 44px e 40px (84
somados) contra 80px e 56px (136 somados) deles, e a nossa lateral tem 170px contra 262px. É quase
o dobro de cromo. Manter o nosso mais apertado é o que faz a tabela caber na primeira dobra em
1440×900, que é o monitor do supervisor. Fica registrado como divergência deliberada, não como
descuido.

### 5.2 Histórico — a mais diferente da nossa

Lista de cartões, com seleção múltipla e ação em massa. Nunca uma tabela.

- Linha do título: "Histórico" à esquerda, **"Enviar por e-mail"** (botão primário, 174×40) à direita
- Faixa de filtros: "Filtros rápidos:" + pílulas "IDs dos tickets", "Atendentes", "Tags"; à direita
  "Últimos 30 dias" e o botão "Filtros" com funil
- Barra "Selecionar todos" com caixa de seleção
- Cartões de 88px com seis campos e a seta de detalhe à direita

O que o cartão resolve e a tabela não: com dez colunas, a tabela obriga a ler o cabeçalho e descer
o olho; o cartão traz o rótulo colado no valor e sobrevive a qualquer largura de tela.

### 5.3 Regras de atendimento

Título "Regras de atendimento" + botão primário "Criar nova regra". Busca de 410×42. Cartões de
86px com dois campos (Nome da Regra, Fila) e três controles à direita: editar, excluir e o
interruptor de 42×24.

### 5.4 Regras de SLA

Mesmo esqueleto, três campos (Regras de SLA, Metas, Filas atribuídas), duas ações (editar,
excluir) — **sem interruptor**. Ganha o rodapé de paginação.

### 5.5 Regras de horários

O cartão muda: nome em negrito sem rótulo, etiqueta de contagem ("1 fila", "7 filas") no meio,
descrição corrida, editar e excluir à direita. Cartões mais altos e mais espaçados que os demais.

### 5.6 Relatórios

**Atendimento.** Faixa de filtros rápidos, e o conteúdo em cartões grandes com título e ícone de
informação ("Indicadores de SLA"). Dentro, uma grade de blocos pequenos com rótulo + ícone de
informação em cima e valor grande embaixo, ao lado de um gráfico de barras. Também traz um atalho
"Gerenciador de Relatórios ›" no lugar do botão primário.

**Satisfação.** Mesmo desenho. Cartão "Dados gerais" com quatro blocos de métrica em linha, depois
dois cartões lado a lado com gráfico de pizza e barras horizontais.

**Calls — estado vazio.** É design, e vale registrar inteiro: ilustração cinza centralizada,
manchete grande ("Seu relatório de ligações do WhatsApp está quase pronto!"), uma linha de
explicação, e **um botão primário que resolve** ("Habilitar agora"). O estado vazio deles nunca é
só um texto triste: sempre oferece a ação que sai dali.

**Vendas — estado vazio por dado, não por função.** A tela existe e está montada, com seletor de
fila, período e três blocos de métrica, mas os valores saem como travessão. O botão primário é
"Configurar relatório". Ou seja: eles preservam o esqueleto e deixam o vazio no valor, em vez de
esconder a tela.

### 5.7 Comunicação

**Respostas prontas.** O cartão mais simples do conjunto: um campo (Categoria), editar e excluir.
Título + "Criar categoria" e rodapé de paginação ("1-5 de 16").

**Modelos de mensagens.** Não aberta.

### 5.8 Atendentes — Gestão de atendentes

O cartão mais cheio: caixa de seleção, avatar circular, quatro campos (Atendente, E-mail, Filas,
Tickets simultâneos) e três ações. Acima, busca, uma linha "Filtrar por: Filas ▾" e a barra
"Selecionar todos". É a prova de que o mesmo cartão escala de um campo a quatro sem mudar de forma.

### 5.9 Preferências — Configurações gerais

Aqui **não há cartão de lista**: são blocos de configuração empilhados, cada um com título em
negrito, uma linha de explicação e o interruptor à direita. Blocos podem conter controle próprio
(campo de etiquetas com chips removíveis, caixa de seleção, botão "Salvar") e podem aninhar
sub-blocos ("Blip Calls" contém "Receber ligações de voz").

---

## 6. O que aplicamos, o que não, e por quê

### Aplicado

| Deles | Nosso |
|---|---|
| Cartão de lista no lugar de tabela | **Histórico** e **Regras** viram lista de cartões |
| Rótulo 12/400 acima, valor 16/700 abaixo | mesma régua, com `--p-t-xs` e `--p-t-md` |
| Cartão um degrau mais escuro que a página | `--p-superficie-1` sobre `--p-superficie-0` |
| Seleção múltipla + ação em massa no topo | **Histórico** ganha seleção e exportação |
| Busca no topo, sozinha na linha | **Regras** ganha busca |
| Esqueleto título → busca → filtros → lista | as duas telas seguem a ordem |
| Estado vazio com ação, nunca só texto | mantido nos nossos `.vazio` |

### Lacuna registrada, não construída

Telas que a Blip tem e nós não. Nenhuma foi criada:

- **Relatórios de Satisfação, Calls e Vendas.** Não temos pesquisa de satisfação, nem telefonia,
  nem funil de vendas no modelo. Tela sem dado é item desabilitado com outro nome.
- **Comunicação** (Respostas prontas, Modelos de mensagens). Vive no app do atendente, não na
  gestão.
- **Atendentes / Filas de atendimento / Pausas personalizadas** como telas próprias. O que elas
  mostram já está em `/configuracoes/operacao` e no cartão "Status dos atendentes" do
  Monitoramento.
- **Preferências / Canais de atendimento.** Está em `/configuracoes/dados`.
- **Gerenciador de Relatórios.** Não temos relatório configurável.

### Divergência deliberada

- **Criar, editar, excluir e o interruptor nos cartões de Regras.** A Blip tem os quatro. O nosso
  `lib/configuracoes.ts` é somente leitura por decisão registrada: editar configuração exige log
  de auditoria com autor, valor anterior e horário, e configurar sem rastro é passivo. Botão que
  não salva é item desabilitado disfarçado, e a régua da casa proíbe. Então o cartão de Regras
  nasce com a **forma** deles e com a situação em etiqueta no lugar do interruptor. Quando a
  auditoria existir, o interruptor entra sem mexer no layout.
- **A ação em massa do Histórico é "Exportar CSV", não "Enviar por e-mail".** A exportação é
  gerada no navegador a partir das linhas já carregadas: resolve o mesmo problema (tirar estes
  tickets da ferramenta) sem inventar fila de e-mail.
- **Cromo mais apertado**, conforme §5.1.
- **Agrupamento preservado.** O nosso Histórico dobra a lista por fila, atendente, desfecho ou
  etiqueta. A Blip não tem isso, e é a nossa resposta aos relatórios que não viraram tela. O
  título do grupo vira um cabeçalho acima dos cartões dele.

### Não abriu

- **Modelos de mensagens**, **Filas de atendimento**, **Pausas personalizadas** e **Canais de
  atendimento**: não abertas, para não gastar sessão em tela que já estava classificada como
  lacuna.
- Navegação por URL direta (`/attendance/desk/sla`, `/attendance/desk/attendants`) **não funciona**:
  o micro-frontend fica no esqueleto de carregamento indefinidamente. Toda tela precisou ser
  alcançada pelo clique na lateral, e o clique precisa atravessar o shadow DOM.

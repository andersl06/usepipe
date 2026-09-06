# A tela de Monitoramento da Blip, medida no DOM vivo

Medição feita em sessão autenticada e **somente leitura** do Portal da Blip
(`supernova.blip.ai/application/detail/supernovaprincipal/attendance/desk/monitoring`),
mais as telas de **Relatório de atendimento** (`.../desk/report`) e **Relatório de satisfação**
(`.../desk/survey-dashboard`), alcançadas pelo clique na lateral. Nada foi criado, editado,
apagado ou disparado lá.

**Viewport da medição:** `innerWidth` 1707 · `innerHeight` 767 · `devicePixelRatio` 1,125.

**Como foi medido.** `getComputedStyle` + `getBoundingClientRect` sobre um caminhador que atravessa
`shadowRoot` recursivamente. Os componentes `bds-*` da Blip são web components Stencil: **medir
fonte no elemento hospedeiro mente** — devolve 16px para tudo. Todo tamanho e peso de fonte deste
documento foi lido no primeiro filho do `shadowRoot`, não no host.

**Aviso de uso.** Medida e regra de layout são fato, não expressão criativa. O que se aproveita é a
**disposição, a medida, a hierarquia e a densidade**. Nenhum hex deles entra no nosso CSS.

**Nada aqui é estimativa.** O que não foi medido está marcado como *não medido*.

---

## 1. Cabeçalho — as duas barras do topo

| Peça | Medida |
|---|---|
| Barra superior (conta) | altura **80px**, fundo `rgb(20,20,20)` |
| Barra inferior (produto) | altura **56px**, fundo `rgb(40,40,40)` |
| **Topo somado** | **136px** |
| Fonte de todo o cromo | `"Nunito Sans"` |

### 1.1 Barra superior, da esquerda para a direita

| Elemento | Posição e tamanho | Fonte |
|---|---|---|
| Avatar do contrato | x=32, y=24, **32×32** | — |
| Nome do contrato ("Supernova") | x=74, y=19 | **16px / 700**, lh 24, `rgb(255,255,255)` |
| Plano ("enterprise") | x=74, y=43 | **12px / 400**, lh 18, `rgb(179,212,255)` |
| Seta do seletor de contrato | x=203, **24×24** | — |
| "Home" | x=307, altura 21 | **16px / 700**, lh 25,6, `rgb(115,129,146)` |
| "Blip Store" | x=371, altura 21 | **16px / 700**, lh 25,6 |
| Marca, centralizada | x=813, **80×29** (ilustração) | — |
| Botão de ícone 1 (ajuda) | x=1490, y=20, **40×40**; ícone interno 20×20 | — |
| Botão de ícone 2 (avisos) | x=1540, y=20, **40×40** | — |
| **Passo entre botões de ícone** | **50px** (40 de botão + **10 de respiro**) | — |
| Avatar do usuário | x=1630, y=24, **32×32**; iniciais **14px / 400** | — |

### 1.2 Barra inferior, da esquerda para a direita

| Elemento | Posição e tamanho | Fonte |
|---|---|---|
| Ícone do bot | x=40, y=90, **36×36** | — |
| Ponto de status sobre o ícone | x=66, y=90, **13×13** | — |
| Nome do bot ("AUVP Capital") | x=91, y=95 | **16px / 300**, lh 25,6, `rgb(255,255,255)` |
| Seta do seletor de bot | x=189, **20×20** | — |
| Módulos, centralizados | ver §2 | — |
| Atalhos à direita | x=1533, 1571, 1609, …, **20×28** cada | — |
| **Passo entre atalhos** | **38px** (20 de ícone + **18 de respiro**) | — |

---

## 2. Navegação de cima — os módulos

| Medida | Valor |
|---|---|
| Altura do item | **56px** — o item ocupa a barra inteira |
| Padding do item | **0 20px** |
| Largura do item ("Atendimento") | 132px |
| Distância entre rótulos vizinhos | **40px** (20 + 20 de padding; os itens se encostam) |
| Fonte, inativo | **16px / 300**, lh 25,6, `rgb(201,223,228)` |
| Fonte, ativo | **16px / 300**, lh 25,6, `rgb(255,255,255)` — **o peso não muda** |
| Marcação do ativo | `::before` absoluto: **altura 4px**, largura = **100% do item** (131,78px), `bottom: 0`, `left: 0`, cor `rgb(63,125,232)` |

Ou seja: o ativo é **sublinhado grosso de 4px na largura inteira do item**, mais o texto de cinza
claro para branco. Não há fundo, não há mudança de peso.

Módulos medidos: Builder (x=617), Atendimento (x=707, ativo), Análise (x=839), Growth (x=932),
Canais (x=1026), e um botão "…" com ícone 24×24 em x=1103.

---

## 3. Lateral

| Medida | Valor |
|---|---|
| Largura do `<nav>` | **262px** |
| Largura útil (`clientWidth`) | **242px** — 20px de barra de rolagem |
| Fundo | `rgb(255,255,255)` |
| Padding do `<nav>` | **0** |
| Recuo do conteúdo | árvore em **x=16**, largura **210px** |
| Topo do primeiro item | y=152 (barra de 136 + **16px**) |
| `overflow-y` | `auto` (`scrollHeight` 1165 contra `clientHeight` 631) |

### 3.1 Item de primeiro nível

| Medida | Valor |
|---|---|
| Altura | **42px** |
| Largura | **210px** |
| Padding | **8px** |
| Raio | **8px** |
| Ícone | **24×24**, em x=25 (16 do recuo + 8 de padding + 1) |
| Distância do ícone ao rótulo | **8px** (`gap: 8px`; ícone termina em 49, rótulo começa em 57) |
| Rótulo, inativo | **14px / 600**, `rgb(40,40,40)` |
| Rótulo, ativo | **14px / 700**, `rgb(40,40,40)` |
| Ícone, ativo | `rgb(30,107,241)` — a cor de marca deles |
| Fundo do ativo | `::before` de **208,1×40**, `rgb(40,40,40)` com **`opacity: 0.08`** |
| Passo entre itens | **50px** (42 de item + **8px** de `margin-top`) |

### 3.2 Grupo que abre

| Medida | Valor |
|---|---|
| Cabeçalho do grupo | idêntico ao item de primeiro nível: **42px** |
| Altura do grupo "Relatórios" (4 filhos) | **238px** |
| Altura do grupo "Comunicação" (2 filhos) | **165px** |
| Altura do grupo "Regras" (3 filhos) | **191px** |
| Primeiro filho | **7px** abaixo do fim do cabeçalho |
| Respiro no pé do grupo | **8px** |
| Passo entre grupos | **8px** |

### 3.3 Subitem

| Medida | Valor |
|---|---|
| Altura | **39px** |
| Caixa clicável | começa em **x=53** — recuo de **37px** contra os 16px do item pai |
| Padding | **8px** |
| Raio | **8px** |
| Rótulo | x=62 — **5px à direita** do rótulo do pai (x=57) |
| Fonte, inativo | **14px / 600** |
| Fonte, ativo | **14px / 700** |
| Passo entre subitens | **47px** (39 + 8) |
| Marcação do ativo | duas coisas juntas: `::before` de **2×21,33**, raio 8px, em `left: -15px` (x=38), cor `rgb(30,107,241)`; e `::after` de **108,7×37,3** com `rgb(40,40,40)` a **`opacity: 0.08`** |

### 3.4 Rodapé da lateral

| Medida | Valor |
|---|---|
| Altura | **72px** |
| Largura | 242px (a útil) |
| Padding | **24px** |
| Conteúdo | ilustração da marca do Desk **116×24** + ícone externo **20×20** |
| Posição | no fim do conteúdo rolável, não fixo |

### 3.5 O mapa completo do menu

Lido dos atributos `text` dos componentes de árvore:

```
Monitoramento          (item)
Histórico              (item)
Relatórios   (grupo)  ├ Atendimento
                      ├ Satisfação
                      ├ Calls
                      └ Vendas
Comunicação  (grupo)  ├ Respostas prontas
                      └ Modelos de mensagens
Regras       (grupo)  ├ Atendimento
                      ├ SLA
                      └ Horários
Atendentes   (grupo)  ├ Gestão de atendentes
                      ├ Filas de atendimento
                      └ Pausas personalizadas
Preferências (grupo)  ├ Configurações gerais
                      └ Canais de atendimento
```

Dois itens soltos e **cinco grupos**. Nada de configuração no primeiro nível: Regras, Atendentes e
Preferências são grupos.

---

## 4. Área de conteúdo e cartões

### 4.1 A área

| Medida | Valor |
|---|---|
| Padding do contêiner | **32px 28,47px** |
| Origem do conteúdo | x=291 (262 da lateral + 28,47), y=168 (136 do topo + 32) |
| Largura útil | 1367px |

### 4.2 O esqueleto vertical

| Faixa | Altura |
|---|---|
| Linha do título | **40px** de linha, dentro de um bloco de **73px** |
| Faixa de filtros rápidos | **56px** |
| Primeiro cartão | y=307 no Monitoramento, y=317 no Relatório |

### 4.3 O cartão (`bds-paper`)

| Medida | Valor |
|---|---|
| Fundo | `rgb(246,246,246)` — **um degrau mais escuro que a página, que é branca** |
| Padding | **20px** |
| Raio | **16px** |
| Sombra | `rgba(0,0,0,0.16) 0px 2px 8px -2px` |
| Borda | **nenhuma** |
| Margem | **0** |

**Grade do Monitoramento:** cartão largo 840px + cartão estreito 515px; altura **129px** nos quatro.
Passo entre linhas: y=307 e y=446 → **gap vertical de 10px**. Gap horizontal medido: 11px (1131 →
1142; a diferença de 1px é arredondamento de largura fracionária).

### 4.4 Dentro do cartão de métricas

| Papel | Medida |
|---|---|
| Título do cartão | **14px / 600**, lh 21, `rgb(40,40,40)`, `margin-bottom: 10px` |
| Grade de métricas | `gap: 16px` entre colunas |
| Valor | **24px / 400**, lh 24 |
| Espaço do valor ao rótulo | **10px** (valor y=358 com 25 de altura; rótulo y=393) |
| Rótulo | **12px / 400**, lh 18, `rgb(40,40,40)` |
| Ícone de informação ao lado do rótulo | **16×16** |
| Cor do número em destaque | `rgb(0,150,250)` — só "Na fila" e "Em atendimento" |
| Cor dos demais números | `rgb(40,40,40)` |

### 4.5 A tabela do "Monitoramento detalhado"

| Medida | Valor |
|---|---|
| Título do cartão ("Monitoramento detalhado") | **20px / 700**, lh 20 |
| Faixa de abas | altura **56px**, padding **4px 16px** |
| Item de aba | altura **48px** |
| Aba, inativa | **16px / 400**, lh 24 |
| Aba, ativa | **16px / 700**, lh 24, com fio de **1,78px** em `rgb(30,107,241)` embaixo |
| Linha de cabeçalho | **48px** |
| Célula de cabeçalho | padding **0 8px** (primeira: `0 8px 0 16px`), fonte **14px / 600**, lh 21 |
| Linha de corpo | **49px** |
| Célula de corpo | padding **0 8px**, fonte **14px / 400**, lh 21 |
| Fio entre linhas | `0,889px solid rgba(0,0,0,0.16)` |

### 4.6 Faixa de filtros rápidos

| Elemento | Medida |
|---|---|
| Rótulo "Filtros rápidos:" | **16px / 700**, lh 24, x=291, y=257 |
| Pílula de filtro ("Filas") | **48×40**, raio **8px**, borda `0,889px solid rgb(40,40,40)`, fundo **transparente**, padding **8px**; rótulo **14px / 700** |
| Botão "Filtros" à direita | altura **40px**, raio 8px |
| Botão de período ("Últimos 7 dias") | altura **40px** |

### 4.7 Título de tela

**24px / 400**, `rgb(40,40,40)`. Um por tela. **Título deles não é negrito.**

---

## 5. A escala de fonte, por papel

Família: **Nunito Sans**. Tudo abaixo foi lido no `shadowRoot`.

| Papel | Tamanho / peso | Entrelinha |
|---|---|---|
| Título de tela | **24 / 400** | — |
| Título de bloco de relatório | **16 / 700** ou **20 / 700** (ver §6) | 24 / 20 |
| Título de cartão de métrica | **14 / 600** | 21 |
| Rótulo de métrica (Monitoramento) | **12 / 400** | 18 |
| Valor de métrica (Monitoramento) | **24 / 400** | 24 |
| Rótulo de métrica (Relatório) | **14 / 600** | 21 |
| Valor de métrica (Relatório) | **20 / 700** | 20 |
| Item de lateral, primeiro nível | **14 / 600** (ativo **14 / 700**) | — |
| Subitem de lateral | **14 / 600** (ativo **14 / 700**) | — |
| Módulo do topo | **16 / 300** (ativo **16 / 300**) | 25,6 |
| Cabeçalho de coluna | **14 / 600** | 21 |
| Célula de tabela | **14 / 400** | 21 |
| Aba | **16 / 400** (ativa **16 / 700**) | 24 |
| Rótulo "Filtros rápidos:" | **16 / 700** | 24 |
| Rótulo de pílula de filtro | **14 / 700** | — |
| Nome do contrato (barra 1) | **16 / 700** | 24 |
| Plano (barra 1) | **12 / 400** | 18 |
| Nome do bot (barra 2) | **16 / 300** | 25,6 |
| Texto de balão de dica | **12 / 400** | 18 |

Cinco degraus de tamanho em uso: **12, 14, 16, 20, 24**. Cinco pesos: **300, 400, 600, 700** (e o
600 do ícone, que não é texto).

---

## 6. Relatórios

### 6.1 Relatório de atendimento — ordem dos blocos

| # | Bloco | Largura × altura | Conteúdo |
|---|---|---|---|
| 1 | Linha do título | 1367 × 73 | "Relatório de atendimento" 24/400 à esquerda; **"Gerenciador de Relatórios ›"** (botão 231×40) à direita |
| 2 | Faixa de filtros | 1367 × 56 | "Filtros rápidos:" + pílulas (Atendentes, Filas); à direita "Últimos 7 dias" (127×40) e "Filtros" |
| 3 | **Indicadores de SLA** | 1367 × 401 | título **20/700** + ícone de informação; à esquerda grade **2×2** de caixas de métrica; à direita gráfico de barras horizontais com título próprio **16/700** |
| 4 | **Tempo máximo** + **Status dos tickets** | 601 × 129 e 745 × 129, lado a lado | tiras de métrica |
| 5 | **Tempo médio** | 1367 × 129 | tira de métrica |
| 6 | **Tickets Abertos x Fechados** | 1367 × 346 | gráfico de série temporal |
| 7 | Grupo de abas por atendente | 1367 × 596 | tabela |
| 8 | Aviso de filtros (41px) + **Disponibilidade de atendentes** | 1367 × 605 | tabela |

**Gap entre blocos: 20px** (738 = 718 + 20; 887 = 867 + 20; 1036 = 1016 + 20).

Caixa de métrica do "Indicadores de SLA":

| Medida | Valor |
|---|---|
| Tamanho | **320×96** |
| Borda | `0,889px solid rgb(227,227,227)` |
| Raio | **8px** |
| Padding | **16px** |
| Fundo | transparente (o `#f6f6f6` do cartão atravessa) |
| Rótulo | **14 / 600**, no topo, com ícone de informação **16×16** à direita |
| Valor | **20 / 700**, **42px** abaixo do topo do rótulo |
| Gap da grade | **16px** nos dois eixos |

### 6.2 Relatório de satisfação — a estrutura de bloco em estado puro

Esta tela é a definição limpa do "bloco de relatório" deles: **um cartão cinza que contém cartões
brancos**.

| # | Bloco | Medida | Conteúdo |
|---|---|---|---|
| 1 | Linha do título | — | "Relatório de satisfação" 24/400, **sem ação à direita** |
| 2 | Faixa de filtros | — | à direita "Últimos 30 dias" + "Filtros" |
| 3 | **Dados gerais** | 1367 × 615 | 4 cartões brancos **317×111** em linha + 2 cartões brancos **653×400** com gráficos |
| 4 | **Análise do período** | 1367 × 484 | 1 cartão branco 1327×400 |
| 5 | **Detalhamento das pesquisas** | 1367 × 465 | tabela |

Anatomia do bloco, medida:

```
bloco externo   bds-paper   fundo #f6f6f6   padding 20   raio 16   sombra 0 2px 8px -2px
  título        16 / 700  lh 24   +  ícone de informação 16×16
  (44px do topo do título ao topo do conteúdo)
  cartão interno  bds-paper   fundo #ffffff   padding 20   raio 16
     métrica:  rótulo 14 / 600  +  ícone 16×16
               valor  20 / 700   (41px abaixo do topo do rótulo)
     gráfico:  título 16 / 700  lh 24
  gap da grade interna: 20px nos dois eixos
gap entre blocos: 20px
```

Cartão interno de métrica: **317×111**, padding 20, raio 16.
Cartão interno de gráfico: **653×400**, padding 20, raio 16.

---

## 7. O que não foi medido

- **Modelos de mensagens, Filas de atendimento, Pausas personalizadas, Canais de atendimento,
  Configurações gerais, Calls, Vendas** — telas não abertas nesta sessão.
- **Estados de passagem do cursor** (`:hover`) da lateral e dos módulos.
- **Comportamento abaixo de 1707px de largura** — nenhum ponto de quebra foi exercitado.
- **Altura da linha do rodapé de paginação** — a tela de Monitoramento não tem paginação.

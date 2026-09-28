# Fidelidade visual F-1..F-6: Builder Blip × Builder Pipe

**Data:** 2026-09-28
**Origem:** as seis áreas apontadas pelo dono em `ref/LACUNAS-APROVADAS.md` §"Fidelidade visual apontada pelo dono no uso real". Levantamento somente leitura; nenhum código foi alterado e o app não foi executado.
**Regras que valem para todas as correções:** D-30 (fidelidade máxima; a única troca é o azul da Blip pelo verde do Pipe, pelos tokens `--p-builder-marca-*` de `packages/ui/src/estilos/tokens.css`) e D-33 (nenhum ícone, imagem ou código da Blip entra no repositório: os ícones são descritos e o Pipe desenha os próprios).

## Fontes e abreviações

| Sigla | Caminho | Observação |
|---|---|---|
| **P** | `referencias-blip/builder/builder/zip19/supernova.blip.ai/portal.js` | Bundle AngularJS. Os templates são strings `e.exports = '...'`. "P:230569" significa linha 230569, que costuma ser uma linha longa com um template inteiro. |
| **C** | `referencias-blip/builder/builder/zip19/supernova.blip.ai/portal.css` | CSS do Portal, com números de linha. |
| **T** | `referencias-blip/builder/builder/zip19/supernova.blip.ai/vendor-app_modules_translate_translationLoaders_sync_recursive_js_.fd90eba8615af397.js` | **Dicionários de tradução.** As chaves `'x.y' \| translate` do P viram texto aqui (as linhas 836, 1829, 2610 e 3136 são pt-BR). Os levantamentos anteriores não usaram este arquivo. |
| **DOM** | `referencias-blip/builder/builder/zip19/builder-fluxo__pagina.html` | DOM capturado do Builder em produção. |
| **R** | `referencias-blip/builder/builder/reconstrucao/` | `MEDIDAS.md`, `index.html` (carrega o `portal.css` real), `screenshots/`. |
| **Pipe** | `apps/management-vite/src/pages/` | `builder.tsx`, `builder.css` e o diretório `builder/`. |
| **Capturas do Pipe** | `referencias-blip/pipe-capturas/NN-*.png` | Fora do git, feitas no portão de 2026-09-27. |

**Tema.** O Builder da Blip roda dentro de `bds-theme-provider theme="dark"`. Todo `var(--color-*, fallback)` do C vale o valor escuro, não o fallback:

| Variável | Valor escuro |
|---|---|
| surface-0 | `#424242` |
| surface-1 | `#393939` |
| surface-2 | `#1f1f1f` |
| surface-3 | `#141414` |
| primary | `#498bff` (vira verde) |
| surface-primary | `#0c50c5` (vira verde) |
| content-default | `#fff` |
| content-disable | `#949494` |
| content-ghost | `#666` |
| border-1 | `rgba(255,255,255,.2)` |
| error | `#7b3d3d` |
| delete | `#b60c0c` |
| warning | `#60593b` |

A tabela completa está em `R/MEDIDAS.md` §"o tema é dark".

**Correção de escala que afeta F-1 (e outras áreas).** As classes utilitárias do Portal não seguem a escala de 4/8/16 px. Estão definidas uma única vez no C:

| Classe | Valor | Linha no C |
|---|---|---|
| `.pa2` | 5px | C:52662 |
| `.pa3` | 10px | C:52666 |
| `.pt3` | 10px | C:52798 |
| `.pl3` | 10px | C:52702 |
| `.ph3` | 10px | C:52878 |
| `.ml2` | 5px | C:52956 |
| `.ml3` | 10px | C:52960 |
| `.mr1` | 2.5px | C:52984 |
| `.mr5` | 40px | C:53000 |
| `.mb3` | 10px | C:53024 |
| `.mt2` | 5px | C:53056 |
| `.mt3` | 10px | C:53060 |
| `.mt4` | 20px | C:53064 |
| `.mv3` | 10px | C:53099 |
| `.mv4` | 20px | C:53104 |
| `.br4` | 10px | C:49292 |
| `.br-100` | 100% | C:49296 |
| `.bp-fs-7` | 12px | C:36731 |
| `.bp-fs-6` | 14px | C:36727 |

- `R/MEDIDAS.md` §"Aba Condições de saída" anota `.pa3` como 16px e `.pa2` como 8px. Isso está errado. O `R/index.html` carrega o `portal.css` real, então os prints de `R/screenshots` já mostram os valores certos.
- As classes de `bds-grid` (`padding="3"`, `gap="2"`) seguem outra escala, de 8 px (3 = 24px, 2 = 16px, x-4 = 32px). Não misturar as duas.

---

## F-1. Cards de condições de saída e de ações (prioridade máxima)

**O que o dono aponta.** "os cardszinho e a forma do texto dentro dos cards de condições de saída e ações". Os blocos no canvas da Blip não mostram condições nem ações: o template do nó (P:129947) tem só:
- título `span.builder-node-title`;
- um ícone no canto (`user-engaged` em `desk:`, `emoji` em `survey:`);
- as etiquetas.

Os "cards" são os das abas **Condições de saída** e **Ações** do painel do bloco. É o que mostram `R/screenshots/c-condicoes-de-saida.jpg` e `d-acoes-menu.jpg`, e, do lado Pipe, `pipe-capturas/05-condicoes-de-saida.png` e `06-acoes.png`. A comparação dos dois pares de prints já mostra o essencial:
- Na Blip, "Se" e "Condição" são duas caixas lado a lado com o rótulo dentro, "Valores" é uma caixa com chips, o "+" fica sobre uma linha e "Ir para" é uma caixa com o rótulo dentro. Entre os cards aparece o divisor "OU".
- No Pipe, "Se" é um texto solto com um vão de ~60px, os campos ficam empilhados na largura inteira sem rótulo, o chip é uma faixa preta com um "×" quadrado cinza, há um checkbox "Exibir apenas blocos de pesquisa de satisfação" sempre visível, "Ir para" fica fora da caixa e não há "OU".

### F-1.1 Blip: aba Condições de saída

**Árvore** (template da aba em P:145003; card genérico `output-card` em P:230974; linha de condição `output-condition-card` em P:96733; "Ir para" `output-state-card` em P:43737; cabeçalho `builder-info-header` em P:86888):

```
div.sidebar-inner-content.sidebar-inner-content-output-conditions           C:12057 padding 24px 48px (fundo surface-2 C:12020)
 ├ [bloco desk:] builder-info-header "Disponibilidade de atendimento" + botões "+ Condição para …" + desk-output-card …
 ├ builder-info-header  header="CONDIÇÕES DE SAÍDA" (ttu) extra="{n}/25" info+link (show-info só quando não há saída)
 ├ ul#outputs-list (ng-sortable)
 │  └ li.anchor-container (por saída)
 │     ├ bds-icon order-elements .anchor.anchor-outputs      C:13295 abs left -31 top 51, cor content-default; C:13274 visibility hidden, min-height 40; C:13306 visível no hover do li
 │     └ div.mt3 (10px)
 │        ├ output-card
 │        │  └ div.output-card-container.u-flex.flex-column.pa2.mv3  [.invalid]
 │        │     ├ span.error-output > i.icon-info.bp-c-warning   C:13041 abs left -28, hidden; C:13052 visível em .invalid
 │        │     ├ (por condição) bds-typo span bold "E" (.tc .fw7, só a partir da 2ª)
 │        │     │  output-condition-card:
 │        │     │  div.condition-wrapper.pa3
 │        │     │   ├ bds-button-icon trash secondary short .fr.remove-output-condition   C:13987 abs right -52 top 5, hidden; C:14010 visível no hover do li
 │        │     │   ├ div.flex.items-center.w-100
 │        │     │   │  ├ bds-select label="Se"       .reduced-blip-select.w-50   (opções: Resposta do usuário / Variável / Intenção identificada / Entidade identificada)
 │        │     │   │  └ bds-select label="Condição" .ml3.reduced-blip-select.w-50 (Igual a … Não existe)
 │        │     │   ├ [fonte=context] div.condition-values-wrapper.mt3.pl3 > autocomplete placeholder "Nome da variável"
 │        │     │   ├ [fonte=entity]  div.condition-values-wrapper.mt3.pl3 > autocomplete placeholder "Nome da entidade"
 │        │     │   └ [comparação ≠ exists/notExists] div.condition-values-wrapper.mt3 > bds-select-chips placeholder "Valores"
 │        │     ├ div.more-conditions-wrapper
 │        │     │  ├ bds-icon.more-conditions.br-100.mr5 name=add theme=outline (clique = nova condição)
 │        │     │  └ div.builder-line-divider-h.w-100.mv4
 │        │     └ div.ph3.mb3 > output-state-card
 │        │         ├ [showFilterSurvey] bds-switch size=short + bds-typo fs-14 "Exibir pesquisa de satisfação"
 │        │         └ div.flex.items-center.mt3.br4.bp-fs-6 > builder-autocomplete label="Ir para" (botão "Novo bloco:" no modal)
 │        └ [não é a última] div.flex > divider.mv3 + bds-typo span bold "OU" + divider.mv3
 ├ div.relative > span.over-limit-icon (i.icon-info warning com tooltip "Limite de 25 condições de saída atingidos")
 │   + bds-button color=content size=large full-width "+ Adicionar condição de saída" (disabled no limite)
 ├ div.builder-line-divider-h.w-100.mv4
 └ builder-info-header "SAÍDA PADRÃO" (show-info) + output-state-card + span.bp-c-cloud.bp-fs-7.mt2 "A seta que liga os blocos não será exibida"
```

**Textos (T:1829, `builder-tabs-outputs`):**

| Chave | Texto |
|---|---|
| `title` | "Condições de saída" (exibido em caixa alta por `ttu`) |
| `info` | "Defina as regras e o bloco para o qual o usuário será direcionado" |
| `documentation` | "Entenda como funcionam as condições de saída" |
| `if` | "Se" |
| `conditions` | "Condição" |
| `and` | "E" |
| `or` | "OU" |
| `goTo` | "Ir para" |
| `addNewState` | "Novo bloco:" |
| `addOutputCondition` | "+ Adicionar condição de saída" |
| `defaultOutput` | "Saída padrão" |
| `defaultOutputInfo` | "Defina para qual bloco o usuário será direcionado se nenhuma das condições forem cumpridas" |
| `noArrowInfo` | "A seta que liga os blocos não será exibida" |
| `values` | "Valores" |
| `sources.*` | "Resposta do usuário", "Variável", "Intenção identificada", "Entidade identificada", "Nome da entidade", "Nome da variável" |
| `comparisons.*` | "Igual a", "Diferente de", "Contém", "Começa com", "Termina com", "Maior que", "Menor que", "Maior ou igual a", "Menor ou igual a", "Corresponde à regex", "Parecido com", "Existe", "Não existe" |
| `target.filterSurvey` | **"Exibir pesquisa de satisfação"** |
| `limitReached` | "Limite de 25 condições de saída atingidos" |

- O contador é `${n}/25` (P:263258). O "2/60" do print R é da reconstrução, não da Blip.

**Medidas (C):**

| Elemento | Valor | Origem |
|---|---|---|
| Card `.output-card-container` | fundo surface-2 (igual ao do painel, então **o card não tem contorno visível**); raio 10; `padding-top: 7px` é anulado pelo `.pa2` declarado depois, ficando 5px em todos os lados; margem vertical 10px (`.mv3`) | C:13903, C:52662 |
| Card inválido | a classe global `.invalid` (C:13047) põe `border: 1px solid var(--color-delete)`, que no escuro é `#b60c0c`. `.output-card-container.invalid` (C:13914) só devolve o fundo surface-2, então a borda vermelha de 1px fica. Aparece também o ícone `.error-output` (`icon-info`, cor warning) 28px à esquerda do card | C:13047, C:13914 |
| `.condition-wrapper` | `position: relative`; padding 10px | C:13951, `.pa3` |
| Par Se/Condição | `bds-select` `w-50` cada, 10px entre eles (`.ml3`) | — |
| Campo `bds-select` / `bds-autocomplete` | bundle ausente. Aproximação de `R/MEDIDAS.md` a partir do `bds-input`: borda 1px border-1, raio 8, padding 8 4 8 12, rótulo 12/700 **dentro** da caixa acima do valor 14, seta 24, altura ≈56 | [A] |
| Caixa de valores `.condition-values-wrapper` | fundo surface-1 `#393939`; borda 1px surface-3 `#141414`; raio 8; texto `#fff`. O autocomplete interno tem 55px | C:13955–13975 |
| Chips | 24px, raio 12, fundo surface-3 | [A], `R/MEDIDAS.md` |
| "+" `.more-conditions` | 25×25; círculo (`br-100`); fundo surface-1 `#393939`; cor `#fff`; `position: absolute; top: -13px; left: calc(50% - 12px)`, sobre o divisor | C:13924 |
| Wrapper do "+" | 8px de altura, `margin-top: -8px` | C:13918 |
| Divisor dentro do card | 1px `#141414` (`.more-conditions-wrapper div` sobrepõe surface-3) com 20px acima e abaixo | C:13947, C:11864 |
| Divisor "OU" entre cards | `.builder-line-divider-h`: 1px surface-1 `#393939`; margem 10px | C:11864 |
| Texto "OU" | `bds-typo` bold, 16px/150% | — |
| "E" | bold, centralizado | — |
| Lixeira da condição | `bds-button-icon` secondary short (40×40), fora do card à direita (−52px), só no hover | C:13987 |
| Botão "+ Adicionar condição de saída" | `bds-button content large`: 56px de altura, raio 8, fundo `#fff`, texto `#424242` 14/700 | `R/MEDIDAS.md` [M] |
| Nota "A seta…" | 12px; cor `.bp-c-cloud` `#8ca0b3` | C:36352 |
| `builder-info-header` (P:86888) | título `bds-typo p fs-16 bold` em caixa alta; botão info secondary short; contador `bds-typo fs-12`; a linha é `justify-between` | P:86888 |
| Descrição do cabeçalho | `bds-typo fs-14` **disabled** (`#949494`), só com `showInfo` | P:86888 |
| Link do cabeçalho | `a.mt3.linkBuilderInfo` sublinhado | C:18196 |

**Comportamento:**
- Arrastar pela alça reordena as saídas (`ng-sortable`).
- Não existem botões subir/descer nem lixeira do card inteiro no card genérico. A lixeira é por condição, no hover.
- O "+" cria uma condição.
- Com 25 saídas, o botão desabilita e aparece o ícone de limite.
- O filtro de pesquisa de satisfação é um **switch**. Só aparece com `showFilterSurvey` (bot com pesquisa do Desk habilitada: `show-switch-survey="$ctrl.isDeskSurveyEnabled"`, P:145003).

### F-1.2 Blip: aba Ações

**Árvore** (aba em P:224435; lista `actions-list` em P:230569, com uma segunda cópia em P:84451; cabeçalho P:86888):

```
div.sidebar-inner-content                                     padding 24px 32px, fundo surface-2 (C:12020)
 ├ builder-info-header "AÇÕES DE ENTRADA"  info (com <strong>) + link + extra "{n}/15" (show-info="true")
 ├ actions-list type=enteringCustomActions
 │  ├ div#actions-container.copy-action-container.flex.justify-between.items-center   C:18725 padding 16px 0 (1rem)
 │  │  ├ bds-checkbox label="Selecionar todos" (disabled sem ações)
 │  │  ├ [nenhuma selecionada] bds-button#copy-action "Colar ação"
 │  │  │     P:84451 → variant="primary" icon="file-new" size="short"  (print R/d: botão azul cheio com ícone)
 │  │  │     P:230569 → variant="outline" color="content" size="short"
 │  │  └ [alguma selecionada] div.actions-selected-buttons: bds-button-icon copy (tooltip "Copiar selecionados") + bds-button-icon trash (tooltip "Deletar selecionados")
 │  ├ [há ações] div.builder-line-divider-h.w-100.mt4
 │  └ ul#action-list (ng-sortable)
 │     └ li.anchor-container.action-icons-container.mb0
 │        ├ div.flex.items-start.w-100
 │        │  ├ div.select-action.mr1 > bds-checkbox          C:18753 padding-top 1.3rem
 │        │  └ div.pointer.flex.mv3.w-100.justify-between     (margem vertical 10px)
 │        │     ├ div.anchor.anchor-action-list > bds-icon order-elements   C:13290 left -27, visível só no hover
 │        │     ├ div.w-60.flex.items-start
 │        │     │  ├ div.icon-container (min 40×40, centralizado) > bds-icon size=large theme por tipo   C:18758
 │        │     │  └ bds-typo p fs-14 .w-80.ml2.pt3  "{{action.$title || 'Nome da ação'}}"  (word-wrap)
 │        │     ├ div > bds-chip-tag color="danger" "Erro"   (só se action.$invalid)
 │        │     └ bds-dropdown bottom-right > bds-button-icon more-options-vertical secondary small
 │        │           └ bds-list: "Detalhes da ação" · "Copiar ação" · "Excluir ação"
 │        └ div.builder-line-divider-h.w-100
 ├ add-action "Adicionar ação de entrada" → abre builder-second-column-sidebar "ADICIONAR FERRAMENTAS" (P:6891)
 ├ div.builder-line-divider-h.w-100.mv4
 └ (mesma estrutura para "AÇÕES DE SAÍDA")
```

**Ícone por tipo** (P:230569; descrever e desenhar o do Pipe, D-33):

| Tipo | Ícone |
|---|---|
| `ProcessHttp` | "http", sólido |
| `TrackEvent` | alvo, sólido |
| `MergeContact` | contato, sólido |
| `Redirect` | redirecionar, sólido |
| `ManageList` | lista, contorno |
| `ExecuteScript`, `ExecuteScriptV2` | "javascript", sólido |
| `ExecuteBlipFunction` | arquivo JSON, contorno |
| `SetVariable` | variável, sólido |
| `ProcessCommand` | comando, sólido |
| `ExecuteTemplate` | "xml" |
| `ForwardToAgent` | plugin |

Todos são `size="large"`, na cor content-default (C:18739).

**Textos (T:836, `builder-tabs-actions`):**

| Chave | Texto |
|---|---|
| `entering` | "Ações de Entrada" |
| `enteringDescription` | "Inclua ações que serão executadas **antes do envio do primeiro conteúdo**" (com `<strong>`) |
| `leaving` | "Ações de Saída" |
| `leavingDescription` | "Inclua ações que serão executadas **após o envio do último conteúdo ou resposta do usuário**" |
| `documentation` | "Entenda como funcionam as ações de entrada" |
| `leavingDocumentation` | "Entenda como funcionam as ações de saída" |
| `addEnteringAction` | "Adicionar ação de entrada" |
| `addLeavingAction` | "Adicionar ação de saída" |
| `selectAllActions` | "Selecionar todos" |
| `pasteAction` | "Colar ação" |
| `copySelectedActionsTootltip` | "Copiar selecionados" |
| `deleteSelectedActionsTooltip` | "Deletar selecionados" |
| `actionTitle` | "Nome da ação" |
| `actionDetail` | "Detalhes da ação" |
| `copyAction` | "Copiar ação" |
| `deleteAction` | "Excluir ação" |
| `errorChipTag` | "Erro" |
| `limitReached` | "Limite de 15 ações atingidos" |

- O contador é `${n}/15` (P:261028). O "3/30" do print R é da reconstrução.
- O limite desabilita o botão quando n > 14 (P:261006).

**Medidas:**

| Elemento | Valor | Origem |
|---|---|---|
| Barra "Selecionar todos"/"Colar ação" | padding 16px 0 | C:18725 |
| `bds-button` short | 32px; primary = fundo surface-primary `#0c50c5` (vira verde), disabled 50% | `R/MEDIDAS.md` |
| Checkbox | 16px, raio 4, borda 2px ghost | [A] |
| Linha da ação | margem vertical 10px | — |
| Ícone | caixa 40×40, ícone `large` (28px segundo `R/MEDIDAS.md`) | — |
| Título | 14px/150%, 400, `#fff`, 5px à esquerda do ícone, `padding-top` 10px, largura 80% da coluna de 60% | — |
| Divisor entre ações | 1px `#393939` | C:11864 |
| Divisor entre as seções Entrada/Saída | 1px `#393939` com 20px acima e abaixo | — |
| "Adicionar ação …" | `bds-button content large full-width`: 56px, fundo `#fff`, texto `#424242` 14/700 | — |
| Detalhe da ação | cobre a aba (`.sidebar-detail-content-wrap`: absoluto, 100%, padding 24, fundo surface-2) | C:12061 |

### F-1.3 Pipe hoje

**Arquivos:**

| O quê | Arquivo |
|---|---|
| Aba de saídas | `apps/management-vite/src/pages/builder/panel-outputs.tsx:40-287` |
| Linha de condição | `builder/condition.tsx:29-183` |
| Rótulos | `builder/conditions.ts:10-62` |
| Cabeçalho | `builder/cabecalho-info.tsx:4-34` |
| "Ir para" | `builder/destination-picker.tsx:82-144` |
| Aba de ações | `builder/panel-actions.tsx:50-279` (lista) e `:282-624` (`ActionCard`) |
| CSS base | `builder/editor.css:479-495`, `:529-560`, `:603-819` |
| CSS do painel | `builder/panel-block.css:195-296`, `:500-735` |
| Select | `apps/management-vite/src/components/selection.tsx`, sem rótulo interno |

**O que renderiza** (confirmado por `pipe-capturas/05` e `06`):
- **Saída:** a `section.bl-saida` tem um cabeçalho invisível com subir/descer/lixeira no hover, que apaga a saída inteira.
- **Condição:**
  - a linha `.bl-condition-fields` vira **uma coluna só** dentro do painel, porque `panel-block.css:671-676` põe `grid-template-columns: 1fr` e sobrepõe o grid de 2 colunas de `editor.css:682`;
  - o rótulo "Se" é um `span` 12px com `margin-bottom: 38px` (`editor.css:688-691`), o que abre o vão;
  - a fonte, o nome da variável e a comparação são selects sem rótulo, empilhados;
  - na 2ª condição o rótulo vira "e" minúsculo (`condition.tsx:102`);
  - com mais de um valor aparece um select extra "OU/E" (`condition.tsx:145-158`), que não existe na Blip;
  - os valores ficam em `.bl-values` (56px, `#393939`, borda `#141414`) e cada chip `.bl-value` só tem fundo `#141414`, sem padding nem raio (`panel-block.css:692-695`).
- **"+":** `.bl-add-condition`, 24px com borda 2px `#aaa` e pseudolinhas `#333` (`editor.css:695-719`).
- **Filtro de pesquisa:** checkbox "Exibir apenas blocos de pesquisa de satisfação" em toda saída (`panel-outputs.tsx:241-250`).
- **"Ir para":** o rótulo `span.sub` fica fora da caixa (`destination-picker.tsx:83`).
- **Erros:** lista `ul.bl-errors` com fundo claro `#fbe9e6` e texto `#c4442e` dentro do card (`panel-outputs.tsx:257-263`, `editor.css:493-500`).
- **Entre cartões:** não há divisor "OU".
- **Ação:** `article.bl-acao` com:
  - alça de 6 pontos (`panel-block.css:566-583`);
  - checkbox nativo de 20px;
  - título em botão;
  - etiqueta redonda vermelha com **o número** de erros (`panel-actions.tsx:384-388`);
  - kebab SVG de 24px com o menu "Detalhes da ação / Copiar ação / Excluir ação".
  - Não há **ícone por tipo**.
  - Subir/descer/lixeira existem, mas estão escondidos por `panel-block.css:584`.
- **Barra de seleção:** "Colar ação" contornado; selecionar muda o texto para "Copiar ações" (`panel-actions.tsx:180-191`), sem "Deletar selecionados".
- **Descrições dos cabeçalhos:** brancas, sem negrito (`cabecalho-info.tsx:31`, `panel-block.css:228-234`).

### F-1.4 Diferenças e correções

| # | Elemento | Blip | Pipe | Correção |
|---|---|---|---|---|
| 1 | Layout Se/Condição | duas caixas lado a lado, `w-50` + 10px | uma coluna; "Se" solto com vão de 38px | `panel-block.css:671`: `.bl-panel--block .bl-condition-fields{grid-template-columns:1fr 1fr; column-gap:10px}`; variável/valores em `grid-column:1/-1`; remover o `span.bl-condition-if` do grid (`condition.tsx:102`) |
| 2 | Rótulo dentro do campo | "Se", "Condição", "Ir para", "Valores" em 12/700 dentro da caixa de ~56px, acima do valor 14 | selects sem rótulo; "Ir para" fora da caixa | dar a `Selection` (`components/selection.tsx`) uma prop `rotulo` desenhada dentro de `.selection-control`, e no `DestinationPicker` levar o `span.sub` para dentro. Reaproveitar o padrão já existente `.bl-campo--interno > .sub` (`panel-block.css:500-511`: absoluto, top 5, left 12, 12px) |
| 3 | Conector entre condições | "E" bold centralizado **entre** as linhas; cada linha mantém "Se" | "e" minúsculo no lugar do "Se" | `condition.tsx:43-50`: antes de cada linha com `i>0`, renderizar `<b class="bl-condition-and">E</b>` (`text-align:center; font-weight:700; font-size:16px`); rótulo sempre "Se" |
| 4 | Operador entre valores | não existe na tela da Blip | select "OU/E" extra | esconder o select (`condition.tsx:145-158`); manter o dado `operator` ao importar/exportar |
| 5 | Chips de valor | chip ≈24px, raio 12, fundo `#141414`, "×" dentro | faixa preta sem raio, "×" em quadrado cinza | `panel-block.css:692`: `.bl-value{height:24px; padding:0 4px 0 10px; border-radius:12px; font-size:14px; gap:4px}` e botão "×" transparente 16px. Medida exata na captura V-F1-02 |
| 6 | Caixa de valores | `#393939`, borda 1px `#141414`, raio 8, 55px, placeholder "Valores" `#fff` | igual em cor e tamanho; placeholder cinza | `.bl-values-field::placeholder{color:#fff; opacity:1}` (C:13977) |
| 7 | Contorno do card | nenhum (fundo = painel); padding 5px; condição com padding 10px; margem 10px | `margin: 24px 0; padding: 7px 0 16px` | `panel-block.css:638`: `.bl-panel--block .bl-saida{margin:10px 0; padding:5px}` e `.bl-condition{padding:10px}` |
| 8 | "OU" entre cards | linha 1px `#393939` + "OU" bold 16 + linha, margem 10px | ausente | `panel-outputs.tsx:185-266`: após cada saída não final, `<div class="bl-ou"><span/>OU<span/></div>` (flex, linhas `height:1px; flex:1; background:#393939`) |
| 9 | "+" nova condição | 25×25 círculo `#393939`, ícone "adicionar" em contorno, `top:-13px`, sobre uma linha 1px `#141414` com margem de 20px | 24px, borda 2px `#aaa`, pseudolinhas `#333` | `editor.css:695-719`: 25×25, sem borda, fundo `#393939`, ícone próprio do Pipe; linha `.bl-add-condition-linha{height:1px; background:#141414; margin:20px 0}` com o botão centralizado em `top:-13px` |
| 10 | Lixeira da condição | 40×40 secondary, `right:-52px; top:5px`, só no hover | `right:-36px; top:24px` | `panel-block.css:677`: `right:-52px; top:5px`; botão 40×40 |
| 11 | Controles do card | alça de arrasto à esquerda (`left:-31px; top:51px`), visível no hover; sem subir/descer; sem lixeira do card | subir/descer/lixeira do card no hover | trocar `.bl-output-order` por alça de arrasto como a das ações (`panel-block.css:566`, `left:-31px; top:51px`). O arrasto de saídas já é a lacuna nº 4 de `LACUNAS-APROVADAS.md`. Excluir a saída ao remover a última condição, como na Blip (`on-remove-condition`) |
| 12 | Filtro de pesquisa | **switch** curto + "Exibir pesquisa de satisfação" 14px, só quando o bot tem pesquisa habilitada | checkbox + "Exibir apenas blocos de pesquisa de satisfação" em toda saída | `panel-outputs.tsx:241-250`: trocar o texto; usar um switch; mostrar só se houver bloco de pesquisa no fluxo (equivalente do Pipe a `isDeskSurveyEnabled`) |
| 13 | Card inválido | borda 1px `#b60c0c` no card + ícone de informação (cor warning) 28px à esquerda; **sem texto de erro no card** | caixa clara `#fbe9e6`/`#c4442e` com a lista de erros | `editor.css:639-643`: `.bl-output--error{border:1px solid #b60c0c}` e ícone absoluto `left:-28px`; mensagens só no `title` do ícone. Ver F-6 |
| 14 | Cabeçalho: descrição | 14px, `#949494`, com `<strong>` nas ações | branca, sem negrito | `panel-block.css`: `.bl-info-texto{color:#949494}`; `LABELS_OF_ACTIONS` com `<strong>` nos trechos da T:836 |
| 15 | Cabeçalho: link | sublinhado, cor primary (vira `--p-builder-marca`) | `#9bbd6a` fixo | `panel-block.css:244`: `color:var(--p-builder-marca)` |
| 16 | Botões "+ Adicionar …" | 56px | 48px | `panel-block.css:248`: `min-height:56px` (já estava em `VERIFICACAO-VISUAL.md`) |
| 17 | Linha da ação: ícone | caixa 40×40 com o ícone do tipo (28px) antes do título | só o título | `panel-actions.tsx:379`: `<span class="bl-acao-icone">` com um ícone próprio por tipo (lista acima; `inventario-visual.md` já propõe `requisicao-http`, `script` etc.) |
| 18 | Linha da ação: título | 14/400 `#fff`, 5px após o ícone, `padding-top` 10px, margem vertical 10px | botão de 40px de altura, padding 12px 0 | `panel-block.css:548-558`: `.bl-acao{padding:10px 0}`; título `margin-left:5px` |
| 19 | Erro da ação | chip "Erro" (`bds-chip-tag danger`) | etiqueta redonda com o número de erros | `panel-actions.tsx:384-388`: `<Etiqueta tom="erro">Erro</Etiqueta>` sem contagem; medir o chip na captura V-F1-04 |
| 20 | Divisor entre ações | 1px `#393939` | 1px `rgba(255,255,255,.2)` | `panel-block.css:551`: `border-bottom:1px solid #393939` |
| 21 | Checkbox | `bds-checkbox` ≈16px (raio 4, borda 2px) | nativo 20px com `accent-color` | `panel-block.css:531`: checkbox próprio de 16px (medir na V-F1-03) |
| 22 | "Colar ação" | cópia A (P:84451): primary cheio com ícone de "novo arquivo" (print R/d); cópia B (P:230569): contorno | contorno | confirmar a versão em produção (V-F1-03); se for A, `.bl-botao-contorno` vira fundo `--p-builder-marca` e ganha ícone |
| 23 | Seleção ativa | troca "Colar ação" por dois botões-ícone (copiar, lixeira) com tooltips "Copiar selecionados"/"Deletar selecionados" | texto "Copiar ações", sem apagar em lote | `panel-actions.tsx:180-191` |
| 24 | Divisores de seção | 1px `#393939`, 20px de margem | `border-top: #fff3` / margem 24–32 | `panel-block.css:710-720` e `.bl-section{margin-bottom:20px}` |

**Esforço:** M (dois componentes e um CSS, sem mudança de modelo). As linhas 1, 2, 3, 5, 8 e 9 sozinhas já resolvem o que o print mostra.

### F-1.5 Capturas que faltam (Blip DEV, somente leitura)

Caminho comum: Portal → bot com Builder → Builder → abrir um bloco comum (duplo clique no nó).

| ID | Estado | Caminho | Medir |
|---|---|---|---|
| V-F1-01 | Aba Condições de saída com 2 saídas, a primeira com 2 condições (uma "Variável") | bloco com saídas → aba "Condições de saída" | `getBoundingClientRect`/`getComputedStyle` de `bds-select` (altura, borda, raio, rótulo interno: tamanho, peso, cor), `.condition-values-wrapper`, `builder-autocomplete`, "E", "OU", `.more-conditions`, lixeira no hover. Shadow DOM de `bds-select`/`bds-autocomplete`, ausentes no zip19 |
| V-F1-02 | Chips de valores | mesma aba, condição com 2 valores | chip de `bds-select-chips`: altura, raio, padding, cor, tamanho do "×" |
| V-F1-03 | Aba Ações com 3 ações de entrada, uma inválida (ex.: Requisição HTTP sem URL, sem salvar) | aba "Ações" | linha inteira, `.icon-container`, título, chip "Erro", checkbox, "Colar ação" (primary com ícone ou contorno?), estado com 1 selecionada (botões copiar/lixeira) |
| V-F1-04 | Card de saída inválido | saída sem "Ir para" | borda do card, ícone `.error-output` (posição e cor) |
| V-F1-05 | Hover numa saída e numa ação | hover | alça de arrasto (posição), lixeira |
| V-F1-06 | Bot com pesquisa do Desk | bloco de atendimento humano → aba de saídas | switch "Exibir pesquisa de satisfação" |

---

## F-2. Painel Configuração do Builder

### F-2.1 Blip

**Como abre.** O botão da pílula está em P:146703: `bds-button-icon icon="settings-builder" ng-click="$ctrl.editConfig()"`, tooltip `utils.misc.configs` = "Configuração" (T:3136; DOM:674).

`editConfig()` (P:258629) abre `SidebarContentService.showSidebar` com o template do módulo 3571 (P:4511), que é o vivo. O módulo 72702 (P:144945) é a cópia antiga, sem `float-builder`.

**Árvore** (P:4511):
```
bds-theme-provider theme=dark
 div#node-content-tab.sidebar-content-component.right-entrance-animation.position-right.builder-sidebar.float-builder
  bds-grid.builder-sidebar-content-header (column, xxs=12, padding=x-4)
   bds-grid padding=t-4: input#builder-sidebar-title readonly maxlength=50 value="Configurações gerais" + bds-icon close
   hr.builder-sidebar-content-header-line
  bds-tab-group.builder-sidebar-tabs
   bds-tab-item "Variáveis"      (padrão) → BuilderConfigurationVariablesView (P:208986)
   bds-tab-item "Versões"        → BuilderConfigurationVersionsView (P:207015)
   bds-tab-item "Ações globais"  (flag isGlobalActionsEnabled, não em subfluxo) → o mesmo componente `actions` da aba Ações do bloco
 actions-option-list (menu "ADICIONAR FERRAMENTAS")
```

Os textos estão em T:1737 (`builder-configurations`): "Configurações gerais", "Variáveis", "Versões", "Ações globais" (com g minúsculo).

**Aba Variáveis.** `bds-grid.sidebar-inner-content > form#variablesForm` contém seções `expandable-content` separadas por `div.builder-line-divider-h.w-100.mv4`.
- Cada seção começa **recolhida**, com seta à direita/para baixo (`img`, `mr3 mt2`; componente em P:72958).
- O cabeçalho é `bds-typo fs-16 ttu b` (16px, 700, caixa alta).
- O corpo tem uma descrição em fs-14 e o controle.

Seções, em ordem (T:1737; T:1833 para a 3ª):

| # | Seção | Descrição | Controle |
|---|---|---|---|
| 1 | "Confiabilidade de IA" | "Defina o percentual de confiabilidade de uma intenção para ser considerada uma resposta válida." | slider 0–100, "N%" |
| 2 | "Tracking automático" | "Executar automaticamente uma ação de registro de eventos para todo bloco do fluxo. A categoria dos eventos registrados é 'flow' e a ação é o nome de cada bloco." | switch `.builder-config-swicth`, absoluto `margin-left:342px; margin-top:10px` (C:12051) |
| 3 | "Permitir edição pelo brain" | — | switch (flag) |
| 4 | "Utilizar contexto do roteador" | texto longo em T:1737 | switch |
| 5 | "Expiração da sessão" | "Tempo em segundos de expiração da sessão dos usuários em caso de inatividade. Em caso de expiração da sessão, o usuário volta para o estado inicial do fluxo. Se este valor não estiver definido, a expiração não ocorre." | número ≥1, gravado como TimeSpan |
| 6 | "Tempo limite de ações" | "Tempo em segundos padrão para limitar a execução de cada ação. Se não especificado, o padrão é 30 segundos. Está limitado tempo limite global de processamento de uma mensagem, de 60 segundos." | número |
| 7 | "Executar em nome de outro bot" | termina em "…Deve estar no formato 'identificador@dominio' (ex: 'myidentifier@msging.net')." | e-mail |
| 8 | "Identificador do fluxo" | "Identificador único do fluxo. As sessões do usuários ficam associadas a este identificador. Se alterado, todas as sessões de usuário são redefinidas." | campo desabilitado + ícone "atualizar" pequeno + "Redefinir identificador do fluxo" |
| 9 | "Variáveis de configuração" | "Para mostrar as informações da consulta no fluxo, utilize: **{{config.VariableName}}**" | chave-valor: placeholders "Variável"/"Valor", inputs com 43% de largura (C:39960), lixeira secondary short, botão tracejado `bp-btn--dashed h3-1` (60px, C:51464) "+ Adicionar informações extras" (T:3136) |
| 10 | "Variáveis sensíveis" | "Para utilizar as informações sensíveis no fluxo, utilize **{{secret.VariableName}}**" + aviso "Valores suprimidos…" | (flag) |

Detalhes da seção 8 ("Identificador do fluxo"):
- Confirmação: "Ao redefinir o identificador do fluxo, todas as sessões de usuários existente serão redefinidas após a publicação. Deseja continuar?"
- Falha: toast "Não foi possível redefinir o identificador do fluxo".

**Gravação** (P:288224): não há botão Salvar. Cada mudança escreve em `configuration`:

| Chave | Observação |
|---|---|
| `builder:minimumIntentScore` | — |
| `builder:stateTrack` | — |
| `builder:useTunnelOwnerContext` | — |
| `builder:ownerIdentity` | — |
| `builder:stateExpiration` | — |
| `builder:actionExecutionTimeout` | — |
| chaves do usuário | só `[a-zA-Z0-9]` |

Depois o autosave do fluxo (P:292344) grava tudo, com desfazer/refazer.

**Aba Versões** (P:207015). `bds-grid.sidebar-inner-content > ul.no-style.mb0`, com três itens:
- **"Carregar fluxo":** `li.pv3.ph4.br4.mb4.flex.items-center.custom-action-item` + ícone "upload" pequeno `mr4` + `bds-typo fs-14`. Tem `input#flowFileInput` `.json` escondido.
- **"Baixar fluxo":** mesma estrutura, ícone "download". Depois dele, `div.flex.items-center.pb4` com um ícone de informação sólido `x-small mr2` e o texto fs-12 "Baixar o fluxo e as configurações de ações globais."
- **"Restaurar versão":** ícone "restaurar". Restaura a **última versão publicada** (não aparece em subfluxo).

Depois vem `#latest-published-versions`: `expandable-content` recolhido "VERSÕES PUBLICADAS" (fs-16 bold ttu) + "Confira o histórico de versões publicadas do seu fluxo".
- Um **card** `bds-paper elevation=primary .flex.justify-between.mb3` por publicação, com as **últimas 10, da mais nova para a mais antiga** (P:255809):
  - coluna esquerda: título (fs-16 bold, opcional), descrição (fs-14), data `dd/MM/yyyy - HH:mm:ss` (fs-14 bold) e autor (fs-14);
  - coluna direita: três `bds-button-icon short` com tooltip: "Nomear versão" (editar, primary), "Restaurar versão", "Baixar fluxo".
- **Modal "Nomear":** título "Edite o título e descrição da versão"; campos "Título" (50 caracteres) e "Descrição" (200 caracteres); botões "Cancelar"/"Salvar".

Mensagens de Carregar/Restaurar:

| Situação | Texto |
|---|---|
| Arquivo inválido | "O arquivo especificado não contém um fluxo válido para importação" |
| Confirmação de carregar | título "Carregar fluxo", "Ao importar o fluxo, a sua versão atual será substituída. Deseja continuar?", botões `utils.misc.yes/no` (a confirmar: "Sim"/"Não") |
| Erro ao carregar | "Não foi possível importar o fluxo" |
| Confirmação de restaurar | título "Restaurar versão", "Ao restaurar a última versão publicada, as alterações no fluxo principal serão perdidas, enquanto as alterações nos subfluxos serão mantidas. Deseja prosseguir com a restauração?", botões "Restaurar"/"Cancelar" |
| Nada publicado | "Não foi encontrada nenhuma versão publicada" |
| Erro ao restaurar | "Não foi possível restaurar a versão publicada" |

- Depois de carregar ou restaurar, a página recarrega.

**Aba Ações globais.** É o mesmo componente da aba Ações do bloco (F-1.2): cabeçalhos com contador e link, "Selecionar todos"/"Colar ação" e o menu "ADICIONAR FERRAMENTAS".

**Medidas (C):**

| Elemento | Valor | Origem |
|---|---|---|
| Caixa | igual à do painel do bloco: 460px, `top/right 16px`, altura `calc(100% - 32px)`, raio 16, sombra `32px 0 56px 32px rgba(0,0,0,.5)`, fundo `#1f1f1f` | C:48229-48241, 48225, 12179 |
| Título | `input` readonly, `padding: 0 50px 5px 0`, borda inferior 2px transparente | C:11924-11933 |
| Linha | 1px `rgba(255,255,255,.2)` | C:12191 |
| Corpo | 24px 32px | C:12017 |
| Itens de Versões | padding 10px 20px, raio 10, 20px entre itens, fundo `#1f1f1f` (igual ao painel), sem borda, ícone a 20px do texto | — |
| Seções recolhíveis | cabeçalho com padding 10px 5px | C:39523-39551 |

### F-2.2 Pipe hoje

- **Botão:** `builder.tsx:329-336`, que monta o painel em `builder.tsx:279-298`.
- **Painel:** `builder/panel-configuration.tsx:62-106`, `aside.bl-panel.bl-panel--settings`.
  - Título `span` "Configurações"; fechar de 20px.
  - Abas "Ações Globais" (padrão) / "Versões" / "Funções".
- **Ações Globais:** lista própria `ActionsGlobalList` (`:109-217`). **Não** reaproveita a lista da aba Ações (`panel-actions.tsx:50`).
- **Versões** (`:229-428`):
  - botões "Importar fluxo"/"Exportar fluxo";
  - ajuda "Baixa o fluxo e as ações globais num arquivo .json; importar substitui o rascunho atual.";
  - `h4` "Histórico de versões";
  - **tabela** Versão/Estado/Blocos/Publicada em/Publicada por, de 505px dentro de um painel de 405px (já registrada em `VERIFICACAO-VISUAL.md`);
  - textos em `import-exportar.ts:11-15`.
- **Variáveis:** não existe. O comentário em `panel-configuration.tsx:37` diz que o motor não tem nada disso, o que é **em parte falso**:
  - `{{config.X}}` já é lido pelo motor (`packages/core/src/flow/context.ts:407`, que lê `flow.configuration`);
  - o tempo limite de ação existe (`defaultActionTimeLimitMs`, `packages/core/src/flow/manager.ts:421`).
- **CSS:**
  - `editor.css:358-374`: 445px colado à direita, raio `16 0 0 16`;
  - `:401-409`: cabeçalho;
  - `:502`: linha `#3a3a3a`;
  - `:508-528`: abas `#282828`;
  - `:463`: corpo 16px 20px;
  - `:922-968`: itens e tabela de versões.

| Elemento | Blip | Pipe | Correção |
|---|---|---|---|
| Caixa | 460 flutuante, raio 16, sombra forte | 445 colada | reaproveitar a geometria de `.bl-panel--block` (`panel-block.css:39-64`) num modificador comum (ex.: `.bl-panel--flutuante`) aplicado ao `aside` em `panel-configuration.tsx:68`. Aplicar `.bl-panel--block` inteiro também puxaria as regras de `.bl-mais`/abas, o que é desejado, mas conferir efeitos colaterais |
| Título | `input` readonly "Configurações gerais" | `span` "Configurações" | `panel-configuration.tsx:70`, como em `panel.tsx:91-93` |
| Fechar | ícone de 24px sem moldura | 20px | `:72` |
| Linha / abas / corpo | 1px `rgba(255,255,255,.2)` dentro do padding de 32; `bds-tab`; corpo 24/32 | `#3a3a3a` de ponta a ponta; abas `#282828`; 16/20 | vêm de graça com as regras `.bl-panel--block .bl-panel-wire/.bl-abas/.bl-panel-body` (`panel-block.css:162-198`) |
| Abas | Variáveis · Versões · Ações globais (padrão: Variáveis) | Ações Globais · Versões · Funções (padrão: Ações) | renomear para "Ações globais"; reordenar; criar Variáveis como padrão; "Funções" é do Pipe (D-22) e fica por último |
| Aba Variáveis | 10 seções recolhíveis | ausente | **decisão do dono** sobre o escopo. Mínimo fiel e funcional: "Variáveis de configuração" (chave-valor → `flow.configuration`, que o motor já lê), "Tempo limite de ações" (se a API mapear para `defaultActionTimeLimitMs`) e "Identificador do fluxo" (só leitura). As demais ficam ocultas ou desabilitadas. Corrigir o comentário `:37` |
| Rótulos de Versões | "Carregar fluxo" (upload), "Baixar fluxo" (download), "Restaurar versão" | "Importar fluxo", "Exportar fluxo", sem "Restaurar" | `panel-configuration.tsx:332,339`; novo item "Restaurar versão", que chama `onRestoreVersion` com a última publicada |
| Ajuda | ícone de informação + fs-12 "Baixar o fluxo e as configurações de ações globais.", entre Baixar e Restaurar | outro texto, abaixo | `:343-345` |
| Itens | 10/20, raio 10, 20px entre eles, sem borda, fundo igual ao do painel | borda `#3a3a3a`, `#282828`, raio 8, espaço de 4 | `editor.css:922-947` |
| Histórico | seção recolhida "VERSÕES PUBLICADAS" + cards (título, descrição, data `dd/MM/yyyy - HH:mm:ss` em negrito, autor; 3 botões-ícone); últimas 10 | tabela de 5 colunas | trocar a tabela (`:348-399`) por cards. "Nomear versão" depende de API (título e descrição da versão); sem ela, omitir |
| Textos de modal | ver F-2.1 | textos próprios ("Importar", "Quando você importar…", "…sequência de importação válida.") | `import-exportar.ts:12-14`; `panel-configuration.tsx:403-416` |
| Ações globais | componente da aba Ações | lista própria com menu pop-up | renderizar o `ActionsPanel` com um pseudobloco a partir de `global` (ou extrair o corpo da lista) e apagar `ActionsGlobalList` (`:138-217`). As correções de F-1.2 passam a valer aqui também |

**Esforço:** M (casca e Versões são S; a aba Variáveis é M e depende de decisão).

### F-2.3 Capturas que faltam

Caminho: Builder → pílula, 4º botão (tooltip "Configuração").

| ID | Estado | Medir |
|---|---|---|
| V-F2-01 | Painel aberto, aba Variáveis | faixa das abas (altura, fonte, sublinhado, cor inativa, distribuição) com shadow DOM do `bds-tab-group`; tamanho real da fonte de `#builder-sidebar-title` (hoje ~20px [A]) |
| V-F2-02 | Cada seção de Variáveis recolhida e aberta | seta, switch (posição 342px), slider, `blip-input-dpr`, linha chave-valor, botão tracejado |
| V-F2-03 | Aba Versões | itens com hover e foco; tamanho dos ícones; abrir "Versões Publicadas" (card: padding, fundo do `bds-paper` escuro, raio, espaço, botões); hover nos tooltips |
| V-F2-04 | "Carregar fluxo" com um .json válido | modal de confirmação (tema e rótulos "Sim/Não"). **Cancelar sem confirmar** |
| V-F2-05 | "Restaurar versão" | modal. **Cancelar** |
| V-F2-06 | Aba Ações globais | confirmar que é igual à aba Ações |
| V-F2-07 | Com Configuração aberta, clicar em Biblioteca e num bloco | a Blip fecha a Configuração? |

---

## F-3. Biblioteca de variáveis

### F-3.1 Blip

**Como abre.** A pílula (P:146703) tem, em modo de escrita, esta ordem: Adicionar bloco, Assistente, Publicar, Configuração (`settings-builder`), **Biblioteca**, Pesquisar, Filas. O botão é `bds-button-icon icon="library"` com `ng-click="$ctrl.openVarLib()"` e tooltip `utils.misc.varLibrary` = "Biblioteca de variáveis" (T:3136; o DOM tem o texto literal).

`openVarLib()` (P:258612-258625):
- limpa a busca do canvas;
- chama `SidebarContentService.showSidebar({allowMultiple: true, …, appendToElement: #main-content-area})`, então pode ficar aberta junto com o painel do bloco;
- registra o evento `trackFlowVariablesDictionaryOpened`.

**Árvore** (módulo 41071, P:93014-93015):

```
bds-theme-provider theme=dark
 └ bds-grid.library-sidebar.left-entrance-animation.sidebar-content-component.position-left.builder-sidebar.float-builder (column, padding none)
    └ bds-grid.library-sidebar--header > bds-grid#builder-variables-library-header
       ├ bds-grid padding="x-4" justify-content=flex-end > bds-icon close           ← sem título
       └ bds-tab-group
          ├ bds-tab-item "Biblioteca de variáveis"
          │   └ bds-grid.var-library-list.h-100 padding=x-4
          │      ├ bds-grid margin=y-3 > bds-input icon=search placeholder="Digite um nome ou tema para buscar variáveis"
          │      ├ ul > li.pv3.ph4.flex.flex-column
          │      │   ├ div.flex.items-center: bds-typo fs-16 .value-in-variable-library.mr4 {{nome}} + bds-tooltip "Copiar" > bds-button-icon copy secondary short
          │      │   └ bds-typo fs-12 {{descrição}}
          │      └ bds-typo p fs-16 .no-variables-found "Nenhuma variável encontrada"
          └ bds-tab-item "Minhas variáveis"   (mesma estrutura, li sem descrição)
```

**Textos** (T:2610, `varLibrary`):

| Chave | Texto |
|---|---|
| `systemVariables` | "Biblioteca de variáveis" |
| `userVariables` | "Minhas variáveis" |
| `searchVar` | "Digite um nome ou tema para buscar variáveis" |
| `noVarsFound` | "Nenhuma variável encontrada" (sem ponto final) |
| `copyText` | "Copiar" |
| `copiedText` | "Copiado!" |

- As descrições vêm de `variables.*`. Exemplos:
  - `input.content`: "Conteúdo da mensagem enviado pelo usuário";
  - `contact.name`: "O nome do contato";
  - `context`: "Variáveis de contexto do bot, onde '?' deve ser substituído pelo nome da variável de contexto criada".

**Comportamento** (controller `Iy`, P:254990-255030):

*Aba sistema:*
- lista plana de 118 itens (`xk.Ay`, P:264780), ordenada por `localeCompare`, mais 5 que dependem de flag (P:270446);
- os nomes aparecem literalmente com `?` (ex.: `context.?`);
- não há cabeçalho de grupo.

*Aba "Minhas variáveis"* (`setUserVariables`, P:270540):
- `responseStatusVariable` e `responseBodyVariable` (ProcessHttp/SendCommand);
- `outputVariable` (scripts, funções, templates);
- `variable` (SetVariable);
- `input.variable` dos conteúdos;
- chaves da configuração do fluxo.
- Tudo ordenado e sem duplicatas.

*Busca:* uma por aba. É o `filter:` do AngularJS: substring sem diferenciar maiúsculas, mas sensível a acento, sobre o nome e a chave.

*Cópia:* copia o **nome puro** (`contact.name`, sem `{{ }}`) com `execCommand("copy")`. O tooltip vira "Copiado!" por 1000 ms. **Não há toast.**

*Hover:* o botão de copiar fica em `opacity:0` e aparece no hover da linha (C:18296, C:18343).

**Medidas (C):**

| Elemento | Valor | Origem |
|---|---|---|
| Painel | `top:1rem; left:1rem` (`.position-left`); altura `calc(100% - 2rem)`; largura 460px; raio 16; sombra `32px 0 56px 32px rgba(0,0,0,.5)` | C:48229-48240, C:48269, C:48225 |
| Fundo do painel | `#1f1f1f` | `.builder-sidebar` C:12179 |
| Fundo da lista | `#141414` | `.var-library-list` C:18300 |
| Cabeçalho | `margin-top: 20px` | C:18286 |
| Linhas | padding 10px 20px; zebra: pares `#1f1f1f`, ímpares `#141414` (C:18335/18339); sem raio nem espaço entre elas | — |
| Nome | 16px/150%, 400, `max-width: 300px` | C:18291 |
| Descrição | 12px/150%, `#fff` | — |
| Vazio | `#949494` | C:18348 |
| Laterais | 32px | `bds-grid x-4` |
| Busca | 24px acima e abaixo (`y-3`); `bds-input`: borda 1px `rgba(255,255,255,.2)`, raio 8, padding 8 4 8 12, 14px/22px, borda primary no hover | — |
| Entrada | `.5s ease-in-out`, de `margin-left: -30px` e opacidade 0 | C:42883-42908 |

- As abas (`bds-tab-group`) não estão no zip19. A aproximação está em `R/MEDIDAS.md:152-160`.

### F-3.2 Pipe hoje

- **Botão:** `builder.tsx:339-347`, que abre `VariablesPanel` (`builder.tsx:270-277`). A pílula abre mesmo a biblioteca de variáveis; a de funções fica na aba "Funções" da Configuração (`panel-configuration.tsx`).
- **Painel** (`builder/panel-variables.tsx:45-130`):
  - `aside.bl-panel.bl-panel--left`;
  - cabeçalho só com o fechar de 20px, seguido de `hr.bl-panel-wire`;
  - abas "Variáveis do sistema"/"Variáveis do usuário";
  - **uma** busca compartilhada, "Pesquisar variável", sem ícone;
  - linhas com nome, botão de copiar sempre visível e descrição `p.sub`;
  - a cópia grava `{{nome}}` e dispara o toast "Variável copiada." (`panel-variables.tsx:20-25`).
- **Conteúdo** (`builder/variables.ts`):
  - sistema: 15 itens escritos pelo Pipe (`:17-59`);
  - usuário: SetVariable, DeleteVariable, condições, globais (`:61-97`); **faltam** `responseStatusVariable`/`responseBodyVariable`/`outputVariable` e as chaves de configuração.
- **CSS:**
  - `editor.css:358-381`: painel de 445px colado na borda, com raio `0 16 16 0` e sombra fraca;
  - `:394-400` e `:463-469`: padding 16/20;
  - `:508-528`: abas com fundo `#282828`;
  - `:559-570`: `.campo` `#282828`/`#3a3a3a`;
  - `:890-918`: linhas com raio 8, espaço de 4px, fundo no hover, nome 13/700.

| Elemento | Blip | Pipe | Correção |
|---|---|---|---|
| Caixa | flutuante 16px das bordas, 460×(100%−32), raio 16, sombra `32px 0 56px 32px rgba(0,0,0,.5)` | 445, colada, raio `0 16 16 0`, sombra fraca | `editor.css .bl-panel--left{top:16px; left:16px; bottom:16px; width:460px; border-radius:16px; box-shadow:32px 0 56px 32px rgb(0 0 0/50%)}` (mesma geometria de `.bl-panel--block`, `panel-block.css:48-63`) |
| Entrada | .5s, de −30px | nenhuma | keyframe `translateX(-30px)`→0 com opacidade, .5s ease-in-out |
| Cabeçalho | só o fechar de 24px à direita, `padding: 20px 32px 0`, sem título, sem linha | fechar de 20px + `hr` | `panel-variables.tsx:51`: remover o `hr`; ícone de 24px |
| Abas | "Biblioteca de variáveis" / "Minhas variáveis" | "Variáveis do sistema" / "Variáveis do usuário" | `panel-variables.tsx:60,69` |
| Faixa das abas | transparente, padding 0 32 ([A]) | fundo `#282828` | `.bl-panel--left .bl-abas{background:transparent; padding:0 32px}` |
| Busca | uma por aba, ícone de lupa, placeholder da T, borda `rgba(255,255,255,.2)`, fundo transparente, 24px acima e abaixo | uma só, sem ícone, "Pesquisar variável" | estado `buscaSistema`/`buscaUsuario`; placeholder novo; ícone; CSS da linha anterior |
| Fundo da lista | `#141414`, laterais de 32px | `#1f1f1f`, 20px | `.bl-panel--left .bl-panel-body{padding:0 32px; background:#141414}` |
| Linha | 10px 20px, zebra `#1f1f1f`/`#141414`, sem raio nem espaço | 8px 10px, raio 8, espaço de 4, hover | `.bl-variables-list{gap:0}`; `li{padding:10px 20px; border-radius:0}`; zebra; tirar o hover |
| Nome | 16/400 `#fff`, `max-width: 300px`, 20px até o botão | 13/700, `space-between` | `.bl-variable-name{font:400 16px/1.5 inherit; max-width:300px; margin-right:20px}`; `.bl-variable-line{justify-content:flex-start}` |
| Descrição | 12/150% `#fff`, texto da T | `#a3a3a3`, texto do Pipe | cor e tamanho; usar a descrição da T:2610 quando o nome coincidir |
| Copiar | 40×40, visível só no hover (.2s); tooltip "Copiar" → "Copiado!" por 1s; sem toast | sempre visível, 16px, toast | `opacity:0` → 1 no hover; estado local `copiado`; remover `onAviso` |
| Valor copiado | nome puro | `{{nome}}` | **decisão do dono** (as chaves podem ter sido de propósito); fidelidade pede o nome puro |
| Vazio | "Nenhuma variável encontrada", 16px `#949494`, igual nas duas abas | com ponto, `#a3a3a3`, texto especial na aba usuário | `panel-variables.tsx:81,104-107` |
| Lista do sistema | 118 itens | 15 | **decisão do dono**. Recomendação: manter só o que o motor do Pipe suporta (`variables.ts:8`), com o texto e o estilo da Blip |
| Lista do usuário | saídas de HTTP/script + SetVariable + input + configuração | sem saídas de HTTP/script | `variables.ts:61`: somar `responseStatusVariable`, `responseBodyVariable`, `outputVariable` |

**Esforço:** S/M (CSS e um componente; a lista do sistema depende de decisão).

### F-3.3 Capturas que faltam

Caminho: Builder → pílula esquerda, 5º botão (tooltip "Biblioteca de variáveis").

| ID | Estado | Medir |
|---|---|---|
| V-F3-01 | Aba "Biblioteca de variáveis" aberta | retângulos do painel, cabeçalho, fechar, faixa e itens das abas (ativa/inativa, com shadow DOM do `bds-tab-group`), `bds-input`, dois primeiros `li`, botão de copiar |
| V-F3-02 | Hover numa linha e clique em copiar | tooltip "Copiar" e depois "Copiado!" (print em menos de 1s); confirmar que não há toast |
| V-F3-03 | Buscar "zzzz" | estado vazio |
| V-F3-04 | Aba "Minhas variáveis" num fluxo com HTTP/script | conteúdo da lista |
| V-F3-05 | Biblioteca aberta e depois abrir um bloco | como os dois painéis convivem (`allowMultiple`) |

---

## F-4. Pesquisa (lupa)

### F-4.1 Blip

**A Blip não tem painel de pesquisa.** Não há barra lateral nem lista de resultados. A pesquisa é um campo flutuante que **esmaece os blocos que não casam** no canvas.

**Posição.** `<builder-search on-get-input="$ctrl.debouncedMakeSearch($event)">` fica dentro de `.builder-icon-button-list`, entre Biblioteca e Filas (P:146703).

**Template** (P:1822):
```
bds-tooltip right-center tooltip-text = showSearch ? "Fechar" : "Pesquisar"   (class mv2)
  bds-button-icon secondary short icon = showSearch ? close : search   (o próprio botão da pílula vira X)
bds-paper.search-wrapper [.show-search]          (DOM: "paper__elevation--static bg-surface-1 border-null")
  bds-input#builder-search icon=search placeholder="Pesquisar"
  bds-icon info solid, tooltip "Para facilitar a pesquisa, use: <br>title: Inicío<br>tags: valor<br>content: valor<br>actions: valor<br>output: valor"
```

Textos (T:3136 e T:728/2965): "Pesquisar", "Fechar" e o tooltip acima (o erro de grafia "Inicío" é da Blip).

**Comportamento** (P:264506-264550 e P:256744-256826):

*Abrir e fechar:*
- Abrir foca o campo.
- Fechar (pelo mesmo botão da pílula) **sempre limpa o termo**.
- Clicar fora fecha, mas só com o campo vazio.

*Busca:*
- Espera 500 ms após a digitação.
- Normaliza para minúsculas sem acento.
- Aceita os prefixos `title:`, `tags:`, `content:`, `actions:` e `output:`.
- Sem prefixo, o bloco casa por:
  - título;
  - etiquetas;
  - variáveis e valores das condições de saída;
  - título e campos das ações;
  - texto dos conteúdos.
- Não busca pelo id.

*Efeito no canvas* (P:225074, C:47983, C:48067, C:48072):
- Só **quando há pelo menos um resultado**: os blocos fora do resultado ficam com `opacity: .2`, as setas somem (`.canvas.hide-conns svg{display:none}`) e os pontos de saída somem.
- **Sem resultado, nada muda.**
- Não centraliza nem seleciona o bloco encontrado.

**CSS** (C:14172-14199):

| Elemento | Valor |
|---|---|
| `.search-wrapper` | `position:absolute; top:10px; left:35vw; width:440px; padding:10px; gap:10px; radius 8; display:flex; align-items:center; background: var(--color-surface-3)` (`#141414`; o DOM também traz `bg-surface-1` = `#393939`, a confirmar); `opacity:0; visibility:hidden; transition .5s; z-index:1` |
| `.show-search` | opacidade 1, visível |
| Caixa do ícone de informação | borda 1px `#8c8c8c`, raio 10, altura 25, padding 10px 8px |
| Referência de posição | a pílula é `position:fixed` com `transform` (C:12709), então `top`/`left` do wrapper contam a partir da pílula (a medir) |

### F-4.2 Pipe hoje e causa do "em branco"

**Caminho no código:**
- estado `pesquisaAberta`/`pesquisa`: `builder.tsx:88-89`;
- botão: `builder.tsx:348-357`, ícone sempre `busca`; o clique só alterna `pesquisaAberta`, **sem limpar o termo**;
- caixa: `builder.tsx:368-380`, `div.bl-pesquisa-flutuante` com `Campo` e um X próprio;
- filtro: `builder/canvas.tsx:261-269` (casa id, título e etiquetas) e `:321`;
- estado do nó: `builder/no.tsx:50`;
- CSS: `builder.css:411-431` e `builder/editor.css:74-82`.

**Causas, que se somam:**
1. **A caixa pinta com o tema claro (provado no código).**
   - Ela é montada em `.bl-corpo`, **fora** de `div.bl-editor[data-tema="escuro"]` (`builder/editor.tsx:177`).
   - O fundo é `var(--surface-2)`, resolvido uma vez no `:root` com o valor claro (`estilos/global.css:23,35`), ≈ `#e3e3e2`.
   - O `.campo` e o `.iconbtn` são brancos com texto escuro (`packages/ui/src/estilos/base.css:372, 513-523`).
   - O resultado é uma faixa quase branca de 440px, só com o placeholder cinza, sobre o canvas `#141414`.
   - Os tokens escuros de `panel-block.css:13-24` só valem para `.bl-panel`, e esta caixa não é `.bl-panel`.
2. **Termo sem resultado apaga o canvas.**
   - Com qualquer termo não vazio, o Pipe esmaece **todos** os nós que não casam e esconde todas as setas e saídas (`canvas.tsx:263,321`, `editor.css:74-82`).
   - Como o Pipe só busca id, título e etiquetas, digitar um texto de mensagem não acha nada e o fluxo inteiro some (opacidade .2, sem setas).
   - A Blip não mexe no canvas quando não há resultado.
   - Esta é a leitura mais provável do "em branco" do dono. Confirmar ao vivo.
3. **Fechar pela pílula mantém o filtro.** `builder.tsx:354` não chama `setPesquisa('')`: a caixa some e o canvas continua esmaecido sem motivo visível.

| Elemento | Blip | Pipe | Correção |
|---|---|---|---|
| Fundo da caixa | `#141414` (ou `#393939`, a medir), texto `#fff` | claro ≈`#e3e3e2` | `builder.css:424`: hex escuro fixo e `color:#fff`; aplicar os tokens escuros (dar a classe `bl-panel` ou copiar as variáveis de `panel-block.css:13-24`) |
| Campo | `bds-input` escuro com ícone de lupa | `.campo` branco | tokens escuros como acima; ícone de lupa de 24px antes do texto |
| Fechar | o botão da pílula vira X, tooltip "Fechar"; sem X na caixa | X dentro da caixa; a pílula continua lupa | tirar o X (`builder.tsx:377-379`); na pílula, `nome={pesquisaAberta ? 'fechar' : 'busca'}` e `rotulo={pesquisaAberta ? 'Fechar' : 'Pesquisar'}` |
| Fechar limpa | sim | não (pela pílula) | `builder.tsx:354`: `if (pesquisaAberta) setPesquisa('')` |
| Clique fora | fecha se vazio | nada | listener no `document` |
| Ícone de informação | caixa bordada com tooltip de prefixos | ausente | ícone próprio + `title` com o texto da T |
| Campos buscados | título, etiquetas, conteúdo, ações, saídas e prefixos | id, título, etiquetas | ampliar `corresponde` em `canvas.tsx:261-269`; tirar o id |
| Sem resultado | canvas intacto | tudo esmaecido | calcular os casamentos antes e aplicar `bl-canvas--pesquisando`/`outside-search` só se houver algum |
| Espera | 500 ms | imediato | `setTimeout` de 500 ms |
| Posição | a partir da pílula fixa (a medir) | a partir de `.bl-corpo` | ajustar depois da V-F4-01 |

**Esforço:** S (dois arquivos e uma função de filtro).

### F-4.3 Capturas que faltam

Caminho: Builder → pílula, 6º botão (lupa).

| ID | Estado | Medir |
|---|---|---|
| V-F4-01 | Caixa aberta, vazia | `background-color` e `box-shadow` computados de `bds-paper.search-wrapper`; retângulo em relação à janela e à pílula; `bds-input` (altura, borda, raio, cores do texto e do placeholder, ícone) |
| V-F4-02 | Hover no ícone de informação | tooltip |
| V-F4-03 | Termo que casa um título (ex.: "Início") | esmaecimento, setas e pontos ocultos |
| V-F4-04 | Termo sem resultado ("zzzz") | confirmar canvas intacto |
| V-F4-05 | Palavra só de texto de mensagem; `content:x`; `tags:x` | confirmar casamento por conteúdo |
| V-F4-06 | Com termo, clicar na pílula (X) | limpa e restaura; com campo vazio, clicar no canvas fecha |

---

## F-5. Gerenciamento de filas no Builder

**Correção de premissa:** a Blip **tem** um painel de filas embutido no Builder. C-38 e D-15 diziam o contrário.
- O painel fica atrás da flag `queue-management-in-builder`, que está `true` em todos os contextos capturados (`referencias-blip/atendimento/attendance-desk-queue-management/beagleaz-external.blip.ai/launchdarkly_app/sdk/evalx/*/contexts/*.html`; pré-requisito `attendance-rules-in-builder`).
- O teste da flag está em P:251793.
- O DOM confirma: o tooltip é "Gerenciamento de Filas", o texto de quando a flag está ligada. Com ela desligada, seria "Regras de Atendimento".

### F-5.1 Blip

**Botão da pílula** (P:146703): `bds-button-icon icon="agent"`, `ng-click="$ctrl.openRulesModal()"`, tooltip `utils.misc.lineManagement` = "Gerenciamento de Filas" (T:3136).

**`openRulesModal()`** (P:258900):
- **Sem bloco `desk*` no fluxo, não abre nada.** Mostra um toast de aviso por 3000 ms:
  - título "Você ainda não configurou o atendimento humano.";
  - texto "Para ativar o atendimento humano, adicione um bloco de atendimento no Builder." (T:1785).
- Com bloco de atendimento, abre `showSidebar` (controller `Ey`, template do módulo 61509) dentro do Builder, sem navegar. Começa no modo fila (`isInQueueMode`); editar uma fila leva ao modo regras (P:254845-254862).

**Casca** (P:86936):
```
bds-theme-provider dark
 div#flow-config-tab.sidebar-content-component.builder-sidebar-content-header.right-entrance-animation.position-right.builder-sidebar
  div.sidebar-content-header.ph5.pt2 > div.sidebar-helper-header
    input#builder-sidebar-title readonly value="Gerenciamento de filas"   (f minúsculo, T:856)
    div.sidebar-helper-header__actions > bds-icon close
  div.sidebar-content-body > builder-attendance-queue | builder-attendance-rules
```

**Modo fila** (P:230793; controller `Yx`, P:263865-264054). Tudo fica dentro de `div.sidebar-inner-content`.
- **Vazio:**
  - fs-14 "Você ainda não possui filas de atendimento definidas. Escolha o comportamento padrão para tickets e as filas para os quais eles serão direcionados.";
  - `bds-button size=tall icon=plus primary` "Criar nova fila", centralizado.
- **Lista:**
  - `div.queue-search-container`: `bds-input icon=search` (placeholder `utils.misc.search` = "Pesquisar") + `bds-button-icon primary standard`, com ícone mais, ou X quando há busca;
  - sem resultado: ilustração "triste" + "Fila não encontrada  :(" (fs-20 bold) + "Não há filas cadastradas com este nome" (fs-16);
  - `div#queue-builder-page` com um card por fila;
  - rodapé "Exibindo {{showing}} de {{total}}" (fs-16) + `bds-button ghost` "Carregar mais" + spinner;
  - página de 100.
- **Card** (P:22838):
  - `bds-paper.output-card-container.mb3.queue-card-item`;
  - rótulo `label.title-label` "Fila de Atendimento" e nome `span.queue-name`;
  - à direita, `bds-tooltip "Editar fila"` > `bds-button-icon edit secondary small` e `bds-switch` (ativa/inativa);
  - **sem lixeira no card**.
- **Criar:**
  - voltar (`arrow-ball-left` small) + "CRIAR NOVA FILA" (fs-16 bold, caixa alta) + `<hr>`;
  - fs-14 "Dê um nome para essa fila de atendimento";
  - `bds-input` "Nome da fila" (máx. 60), com erros "Já existe uma fila com esse nome." e "Você precisa dar um nome para essa fila";
  - botões `tall` "Cancelar" (secondary) e "Confirmar" (primary, desabilitado se vazio).
- **Mensagens:**

| Situação | Mensagem |
|---|---|
| Nome `DIRECT_TRANSFER` | toast "Ops! Não é possível criar fila com este nome." |
| Criação ok | "Fila adicionada com sucesso!", e vai para o modo regras da fila nova |
| Erro 23 | "Já existe uma fila com este nome." |
| Outros erros | "Erro ao salvar/atualizar fila" |
| Excluir fila com atendentes | toast "Ops! Esta fila já tem atendentes vinculados, por isso não é possível removê-la." |
| Excluir fila sem atendentes | alerta de exclusão "Você quer excluir essa fila de atendimento?", corpo "Ao excluir essa fila, você removerá permanentemente o direcionamento dos tickets condicionados a fila de atendimento <b>{{name}}</b>.", botões "Cancelar"/"Excluir"; depois "Fila excluída com sucesso!" |

**Modo regras** (P:221270; controller `Xx`, P:264076-264334):
- cabeçalho com voltar + nome da fila;
- o nome só é editável (`bds-input-editable`, mínimo 3) com 0 atendentes, 0 regras e permissão; senão, o botão editar só mostra um toast "Ops! Esta fila já tem …";
- lixeira "Excluir" (o `ng-show="$$ctrl…"` tem erro de digitação e provavelmente nunca aparece);
- `<hr>`;
- vazio: "Você ainda non possui regras de atendimento definidas…" (erro da Blip) + "Criar nova regra";
- busca + lista `new-rule-item is-builder-view`;
- "Exibindo … de …".

**Medidas (C):**

| Elemento | Valor | Origem |
|---|---|---|
| Caixa | 460px, `top/right 16px`, altura `calc(100% - 32px)`, raio 16, fundo `#1f1f1f`. Esta casca **não** tem `float-builder` (sem a sombra forte), a confirmar | C:48229-48240, 12179 |
| Ações do cabeçalho | absolutas à direita, espaço de 8 | C:11906 |
| Corpo | 24px 32px | C:12017 |
| Busca | `padding-bottom: 16px`; input 376×40; 16px até o botão | C:18923-18941 |
| Formulário | botões com `margin-top: 16px` | C:18943 |
| Card | fundo **`#393939`**, raio 8, sombra `0 2px 12px rgba(96,123,153,.15)`, padding 20px | C:10750-10757 |
| Rótulo | 12/400 `#949494` | C:10538 |
| Nome | 16/700 `#fff` | C:10544-10550, padding 0 em C:10784 |
| Bloco de ações | opacidade 0 → 1 no hover do card em 125 ms; borda direita 2px `#8ca0b3`; altura 29 | C:10741-10776 |
| Switch | padding-left 8 | C:10772 |

A página de filas do Desk (React, `referencias-blip/atendimento/.../portal-fragment-desk-mfe/latest/main.js`) é outra tela, não aberta pelo Builder. Seus textos são a referência de `pages/registrations/agents-queues.tsx`.

### F-5.2 Pipe hoje

- **Botão:** `builder.tsx:358-365`, "Gerenciamento de Filas", ícone `suporte`. Abre sempre, sem checar se há bloco de atendimento.
- **Painel:** `builder/panel-queues.tsx:17-56`. É um **atalho**, não um CRUD:
  - título "Gerenciamento de Filas";
  - `hr`;
  - ícone + "Gerencie filas, atendentes atribuídos e regras de atendimento.";
  - resumo "N filas cadastradas, M ativas.";
  - botão "Abrir gerenciamento de filas", que navega para `${attendanceBase}/queue-management` (`:49`, página `pages/registrations/agents-queues.tsx`).
- **CSS:** `editor.css:358-393` (`.bl-panel` de 445 colado; `.bl-queues-*`).
- **API e gravação reaproveitáveis:** `useRead('/v1/management/agents/queues')` e `toggleQueue`/`deleteQueue`/`editQueue` em `apps/management-vite/src/lib/registrations-gravar.ts:11-90`; formulário de criação em `pages/registrations/agents-queues-formulario.tsx`; regras em `/v1/management/rules/attendance` (`rules-attendance.tsx:85`).

| Elemento | Blip | Pipe | Correção |
|---|---|---|---|
| Fluxo sem bloco de atendimento | toast de aviso e não abre | abre | `builder.tsx:363`: se nenhum bloco `ehAttendance`, `setRecado` com os dois textos (tom de aviso; ver F-6 sobre o toast) e retornar |
| Título | "Gerenciamento de filas" | "Gerenciamento de Filas" | `panel-queues.tsx:29` |
| Caixa | 460 flutuante, raio 16 | 445 colada | mesma geometria flutuante de F-2/F-3 |
| Corpo | lista CRUD embutida | atalho com resumo e link para fora | **decisão do dono (reverte D-15/C-38)**. Recomendação: montar a lista no painel, reusando `registrations-gravar.ts` e o formulário existente |
| Busca | input 376×40 + botão-ícone primary (mais/X) | ausente | `.bl-queues-search` com os valores de C:18923-18941 |
| Card | `#393939`, raio 8, padding 20, rótulo 12 `#949494` "Fila de Atendimento", nome 16/700, editar (aparece no hover) + switch | ausente | `.bl-queue-card` com C:10741-10786 |
| Vazio | texto `infoNoQueues` + "Criar nova fila" (primary tall com mais) | ícone + texto próprio | textos literais |
| Criar | formulário no próprio painel (voltar, "CRIAR NOVA FILA", `hr`, "Dê um nome…", "Nome da fila" máx. 60, Cancelar/Confirmar) | link para fora | formulário embutido com as mensagens da tabela acima |
| Rodapé | "Exibindo X de Y" + "Carregar mais" | — | adicionar (100 por página) |
| Modo regras | lista de regras da fila | — | segunda etapa, opcional (API existe) |

**Esforço:** L se virar CRUD embutido (fila + regras); S se o dono mantiver o atalho e só quiser a casca, o título e o aviso sem bloco.

### F-5.3 Capturas que faltam

Caminho: Builder → pílula, último botão (tooltip "Gerenciamento de Filas").

| ID | Estado | Medir |
|---|---|---|
| V-F5-01 | Fluxo **sem** bloco de atendimento, clicar no botão | toast (posição, cores, ícone, duração) |
| V-F5-02 | Fluxo com bloco de atendimento, painel aberto na lista | caixa (460 ou 445? sombra?), título, padding do corpo, busca, card (altura, fundo, sombra, cores), hover do card (editar + borda), switch, rodapé |
| V-F5-03 | Clicar em "+" | formulário de criação. **Não confirmar**; para ver o erro, digitar um nome existente e sair do campo, se a validação aparecer sem enviar |
| V-F5-04 | Clicar em editar num card | modo regras: cabeçalho, lixeira visível?, vazio de regras |
| V-F5-05 | Buscar "zzzz" | "Fila não encontrada  :(" |

Criar, excluir ou alternar uma fila **altera dados reais do Desk**. Só observar.

---

## F-6. Tratamento e exibição de erros

**Resumo.** A Blip **nunca mostra texto de validação na tela**. As mensagens do validador são em inglês e vão só para o console e para a telemetria. O erro aparece por **cor e marca**:
- nó vermelho;
- bolinha vermelha na aba;
- borda vermelha com ícone no card;
- chip "Erro" na ação;
- campo com borda vermelha;
- toasts curtos na publicação e ao salvar.

O Pipe faz o contrário: faixa permanente com a lista de erros, modal que bloqueia a publicação, contador em cada nó e listas de mensagens dentro do painel.

### F-6.1 Blip

**A. Validação viva.**
- `saveState` (P:258747-258755) e `onOutputChange` (P:258028-258040) rodam o validador (`fm`, P:249355; `pm.validate`, P:249214-249235) a cada edição.
- A validação marca `$invalid` no bloco, em cada conteúdo, saída e ação, e ainda `$invalidContentActions`/`$invalidOutputs`/`$invalidCustomActions`.
- Não precisa publicar para aparecer.
- Exemplos de regras (P:~248855-249220): "The output state id is required", "The condition values must be provided", "The message content is required", "The HTTP URI is required", "The script source is required".

**B. Nó inválido** (template P:225074: `ng-class="{'invalid-node': state.$invalid, …}"`). O nó não tem ícone, contador nem tooltip.

| Estado | CSS | Origem |
|---|---|---|
| Nó inválido | fundo `var(--color-error)` = **`#7b3d3d`** | C:48122 |
| Ponto de saída | `var(--color-delete)` = `#b60c0c` | C:48126 |
| Hover, selecionado e em edição | anel `0 0 0 4px #b60c0c` | C:48063, 48113, 48179 |
| Selecionado ou em edição | mantém o fundo vermelho (o fundo azul de seleção é excluído), com o véu `::before` `#141414` a .5 por cima | C:48096, 48117, 48144, 48156 |
| Erro de loop vindo do servidor | também marca o nó | P:257008 |

**C. Bolinha na aba.** `validateTab` põe `invalid-background` em Conteúdo (P:253064), Condições de saída (P:263422) e Ações (P:253014, 260986). O CSS (C:13078-13100) desenha um `::before`: círculo de **9×9px `#ff4a4a`**, absoluto, `right: -12px`. Não há contagem.

**D. Card de saída.** Borda 1px `#b60c0c` + ícone de informação sólido na cor delete a `left: -28px` (C:13041-13052, 13914, 18760). O card da Blip clássico usa `icon-info bp-c-warning` `#f04847` (C:35974). Não há texto (ver F-1, linha 13).

**E. Ação inválida.** `bds-chip-tag color="danger"` "Erro" (P:230569), entre o título e o kebab; clicar abre o detalhe. O chip mede (shadow do bundle `bds-chip-tag` no zip19):
- `min-width: 32px`, altura 24, raio 12, padding 0 4px;
- fundo `var(--color-error)` `#7b3d3d`;
- texto `--color-content-din`.

**F. Card de conteúdo inválido.** `ng-class="{'invalid': content.$invalid}"` (P:88255, 134298). Borda 1px `#b60c0c`, sem texto nem ícone.

**G. Campo.**
- `bds-select`/`bds-autocomplete`/`bds-input` com `danger` (P:134314, 24705). O shadow do `bds-input` define:
  - borda 1px delete, raio 8;
  - rótulo na cor delete;
  - pressionado com anel 2px `--color-error`;
  - mensagem na cor negativa.
- Campo antigo `blip-input-dpr`: `.bp-input-wrapper--invalid` com borda `#f04847` e sombra `0 0 1px 2px #ff4c4c` (C:33945), só depois de tocado.

**H. Publicar** (P:256974-257023). O botão da pílula nunca fica desabilitado por erro, só durante a publicação (ícone de carregando, mínimo 2 s), e **não abre modal**.

| Situação | Resposta (texto da T) |
|---|---|
| Builder desativado | toast de aviso `errorMsg.114` |
| Validação local falha | toast de aviso **"Erro ao publicar o fluxo: Um ou mais blocos estão inválidos. Corrija os blocos marcados de vermelho e tente novamente."**; nada vai ao servidor |
| Subfluxo não publicado | `bds-toast` warning, 8 s: "Subfluxo não publicado"/"Publique o subfluxo {{name}} para publicar seu fluxo." ou "Publique seus subfluxos!"/"Para seguir, todos os subfluxos do seu fluxo principal têm que estar publicados." |
| Sucesso | toast de sucesso **"Fluxo publicado!"** |
| Loop | toast de perigo `errorMsg.111`: "Existe um loop no seu fluxo começando no bloco '{{state}}' que não requer entrada de usuário.<br/>Inclua uma ou mais entradas do usuário nos blocos ligados a este." O nó fica vermelho |
| Outro erro | toast de perigo **"Erro ao publicar o fluxo"** |

Não há lista de erros nem navegação até o bloco.

**I. Falha ao salvar** (P:258770-258773): toast de perigo **"Erro ao salvar o fluxograma"**.

**J. Outros avisos.**
- Colar inválido: "O conteúdo copiado não é um bloco válido.<br>Tente de novo." (P:258339).
- Trava de edição: texto em linha sobre o canvas, `bds-typo color-warning/error` (P:225074).

**K. Toast (ngToast legado).** Configuração em P:312865-312872:
- canto **inferior esquerdo**, deslizando;
- 5 s, com botão "×";
- clicar fecha; passar o mouse pausa;
- até 6 empilhados, o mais novo por cima.

CSS no C:

| Elemento | Valor | Linha |
|---|---|---|
| Base `.alert` | `#4a4a4a`, raio 10, padding 14px 20px, 14px branco, `inline-flex` | C:47171 |
| Sucesso | gradiente `90deg #00e4e8→#00d3be` | C:47194 |
| Aviso | gradiente `90deg #ffbd4e→#ffb04f` | C:47213 |
| Perigo | gradiente `90deg #ff654b→#ff807f` | C:47251 |
| Ícone | glifo antes do texto, 1.5rem, `margin-right: 25px` | — |
| Posição | lista em `bottom: 20px`, `margin-left: 18px`; mensagem com `max-width: 500px` | C:47299-47362 |
| Fechar | `button.close` | C:47385 |
| Animação | .3s | C:47412-47435 |

Os gradientes de status não são azul de marca, então **não viram verde** (D-30 só troca o azul de marca). O `bds-toast` novo (P:84668-84760; shadow em `referencias-blip/bundles-e-css/…bds-toast…js`) só aparece no caso dos subfluxos: raio 8, largura 440, padding 8 16, fundo pela variante (`--color-warning` etc.).

### F-6.2 Pipe hoje

| Situação | O que o Pipe mostra | Onde |
|---|---|---|
| Fonte dos erros | `joinErrors(errorsLocal(mapa), apiErrors, engineErrors)`, mensagens em pt-BR | `builder.tsx:101`, `builder/editor.tsx:111-116`, `builder/validation.ts:20-47` |
| Fluxo com erro | faixa permanente `role=alert` "O motor recusaria este fluxo — N erro(s)…" com até 6 itens | `builder.tsx:226-243`, `builder.css:274-302` |
| Publicar com erro | modal "Publicar fluxo" com lista e confirmação desabilitada | `builder.tsx:479-528` |
| Falha ao publicar | `Etiqueta` dentro do modal | `builder-gravar.ts:54-58`, `builder.tsx:130-139,512` |
| Sucesso | `Etiqueta` no rodapé "Versão N publicada…", que nunca some | `builder.tsx:143-148,408-412` |
| Falha ao salvar | pílula "Salvo" vira ícone + texto + "Tentar de novo"; a classe `bl-status--erro` não tem CSS | `builder.tsx:176-177,387-405` |
| Nó | borda 1px + contador redondo + `title` nativo | `builder/no.tsx:46,58,69-73`, `editor.css:93-95,154-158` |
| Selecionado com erro | fica verde (`editor.css:66-69` não exclui o erro) | — |
| Topo do painel | `ul.bl-panel-errors` com todos os erros | `builder/panel.tsx:184-190` |
| Abas | nenhuma marca | `panel.tsx:191-200` |
| Saída, condição, ação | borda + listas de texto; ação com contador | ver F-1 |
| Conteúdo | sem estado por card | `panel-content.tsx:439,464` |
| Aviso passageiro | `.bl-toast` centralizado, `#1a1a1a`, 13px, 4 s, sem fechar, um por vez | `editor.tsx:85-90,242-246`, `editor.css:875-886` |

O `packages/ui/src` não tem componente de toast.

| Elemento | Blip | Pipe | Correção |
|---|---|---|---|
| Nó inválido | fundo `#7b3d3d`, ponto de saída `#b60c0c`, anel 4px `#b60c0c` no hover/seleção/edição; sem contador | borda 1px + contador + `title` | `editor.css:93`: `.bl-node--error{background:#7b3d3d}`, `.bl-node--error .bl-no-saida{background:#b60c0c}`, anel `0 0 0 4px #b60c0c` em `:hover`/`--selecionado`/`--editando`; `editor.css:66`: `:not(.bl-node--error)` no fundo de seleção (manter o véu); remover a `Etiqueta` e o `title` (`no.tsx:58,69-73`) |
| Aba | bolinha 9px `#ff4a4a` a `right:-12px` | nada | `panel.tsx:195`: classe `bl-aba--erro` por aba a partir de `contentErrors`/`outputErrors`/`actionErrors`; `::after` com essas medidas (posição vertical: V-F6-01) |
| Card de saída | borda `#b60c0c` + ícone a −28px, sem texto | borda + lista | ver F-1, linha 13 |
| Ação | chip "Erro" 24px, raio 12, `#7b3d3d` | contador | ver F-1, linha 19 |
| Conteúdo | borda 1px `#b60c0c` no card | nada | erro por card em `panel-content.tsx`; `.bl-card--erro{border:1px solid #b60c0c}` |
| Campo | borda 1px `#b60c0c`, raio 8, rótulo `#b60c0c` | `p.bl-field-error` só em condições | classe de erro no `Campo` obrigatório vazio |
| Listas de texto | nenhuma | faixa, lista no topo do painel, listas nos cards | remover `builder.tsx:226-243`, `panel.tsx:184-190` e as listas dos cards. **Decisão do dono**: são um ganho do Pipe, mas D-30 pede paridade. Meio-termo: guardar o texto no `title` do ícone |
| Publicar com erro | botão ativo → toast de aviso (texto acima), sem modal | modal bloqueado | ao clicar com `errors.length>0`, mostrar o toast e não abrir o modal. **O modal de confirmação também não existe na Blip** (decisão do dono) |
| Sucesso / erro de publicação / erro ao salvar | toasts "Fluxo publicado!" / "Erro ao publicar o fluxo" / "Erro ao salvar o fluxograma" | etiqueta fixa / etiqueta no modal / pílula | toasts com esses textos; manter "Tentar de novo" e criar CSS para `bl-status--erro` |
| Toast | inferior esquerdo (`left 18`, `bottom 20`), máx. 500, raio 10, padding 14 20, 14px branco, gradiente por tom, ícone, "×", 5 s, pausa no hover, até 6 | centralizado, `#1a1a1a`, 4 s, um só | subir o toast para `builder.tsx` (um estado com lista) e reescrever `editor.css:875` com os valores do C; modificadores `--erro/--alerta/--sucesso` com os gradientes; ícones próprios |

**Esforço:** M (toast compartilhado + CSS do nó + marcas por aba e por card; a remoção das listas é decisão).

### F-6.3 Capturas que faltam

Tudo abaixo edita **só o rascunho** (autosave). Use um bloco descartável e apague-o no fim. Publicar com um bloco já vermelho **não publica**: o validador local interrompe antes (P:256987-256991). Confirme que o nó está vermelho antes de clicar. Um erro que só o servidor detecta (loop) publicaria de verdade.

| ID | Estado e caminho | Medir |
|---|---|---|
| V-F6-01 | Novo bloco → aba Condições de saída → "+ Adicionar condição de saída" sem "Ir para" → fechar o painel | fundo do nó, ponto de saída, anel no hover e na seleção, título em negrito?, posição exata da bolinha na aba |
| V-F6-02 | Mesmo estado, painel aberto | borda e fundo do card, ícone (tamanho, posição, cor) |
| V-F6-03 | Aba Ações → "Requisitar HTTP" com URL vazia → voltar à lista | chip "Erro" (tamanho, cores, posição); bolinha na aba Ações |
| V-F6-04 | Aba Conteúdo → Texto vazio | borda do card; bolinha |
| V-F6-05 | "Processar comando" com Método/Tipo vazios; entrada do usuário com validação sem mensagem | campo `danger`: borda, rótulo, texto de ajuda |
| V-F6-06 | Com o nó da V-F6-01, clicar em "Publicar fluxo" | toast de aviso: posição, tamanho, gradiente, glifo, "×", duração, pausa no hover, clique fecha; duração do ícone de carregando |
| V-F6-07 | Copiar um texto qualquer → botão direito no canvas → "Colar" | toast de perigo (é o mesmo componente de "Erro ao publicar"/"Erro ao salvar") |
| V-F6-08 | DevTools → Network Offline → editar um título → esperar o salvamento | "Erro ao salvar o fluxograma"; a pílula "Salvo" muda? Voltar a Online |

Não dá para disparar com segurança: "Fluxo publicado!", o loop (111) e o erro genérico (107). Reproduzir pelo CSS acima.

---

## Ordem sugerida

Critério: a ordem de gravidade do dono (F-1 primeiro), com as correções pequenas que destravam o resto puxadas para a frente.

| # | Item | Esforço | Por que nesta posição | Depende de |
|---|---|---|---|---|
| 1 | **F-1 saídas**: linhas 1–10 e 12 da tabela F-1.4 (grid 2 colunas, rótulo dentro do campo, "E"/"OU", chips, "+", lixeira, filtro de pesquisa como switch) | M | pior ponto do dono; só CSS e dois componentes (`condition.tsx`, `panel-outputs.tsx`, `components/selection.tsx`, `destination-picker.tsx`) | V-F1-01/02 para os valores [A] do `bds-select`; dá para começar pelos valores de `R/MEDIDAS.md` |
| 2 | **F-1 ações**: linhas 14–24 (ícone por tipo, linha, chip "Erro", divisores, 56px, seleção em lote, cabeçalho com `<strong>`) | M | segunda metade do item do dono; o `ActionCard` também é usado nas Ações globais (F-2) | ícones próprios (D-33); V-F1-03 |
| 3 | **F-4 lupa**: tema escuro da caixa, sem resultado não mexe no canvas, fechar limpa, X na pílula, busca por conteúdo/ações/saídas | S | o dono vê a tela "em branco"; a correção é pequena e resolve o defeito mais visível | nenhuma (V-F4-01 só ajusta a posição) |
| 4 | **Casca flutuante comum** (460, `top/right/left 16px`, raio 16, sombra `32px 0 56px 32px rgba(0,0,0,.5)`, título `input`, fechar 24, linha e abas no padrão do painel do bloco) aplicada a Configuração, Biblioteca e Filas | S | um modificador só que F-2, F-3 e F-5 usam; tira a maior diferença visual das três telas de uma vez | nenhuma |
| 5 | **F-6 marcas de erro**: nó vermelho, bolinha na aba, borda do card, chip "Erro", campo `danger`, toast da Blip (canto inferior esquerdo, gradientes, 5 s) e troca da etiqueta fixa por toasts | M | complementa F-1 (linhas 13 e 19); o toast é pré-requisito do aviso "sem bloco de atendimento" (F-5) | decisão do dono sobre remover a faixa e as listas de texto e sobre o modal de publicar |
| 6 | **F-3 biblioteca**: rótulos, busca por aba, zebra, cópia no hover com "Copiado!", sem toast | S | pequeno, isolado | decisão: `{{ }}` ou nome puro; lista de 15 ou de 118 |
| 7 | **F-2 Configuração**: abas na ordem da Blip, Versões com os textos e cards da Blip, "Restaurar versão", Ações globais reaproveitando a aba Ações | M | usa os itens 2 e 4 prontos | decisão: escopo da aba Variáveis (mínimo: "Variáveis de configuração", que o motor já lê); "Nomear versão" depende de API |
| 8 | **F-5 filas**: aviso sem bloco de atendimento e título ("Gerenciamento de filas") agora (S); CRUD embutido depois (L) | S / L | a parte S é trivial com os itens 4 e 5; a L reverte D-15/C-38 e precisa de aprovação | **decisão do dono** sobre o CRUD embutido |

**Decisões que o dono precisa tomar antes de planejar** (cada uma muda escopo):
1. **F-6:** remover a faixa de erros, as listas de texto e o modal de publicar em nome da paridade, ou mantê-las como ganho do Pipe.
2. **F-3:** copiar `{{nome}}` ou o nome puro; lista do sistema com 15 ou 118 itens.
3. **F-2:** quais seções da aba Variáveis entram.
4. **F-5:** manter o atalho para a página de filas ou embutir o CRUD como a Blip (reverte D-15).

**Capturas ao vivo, por ordem de valor:**
1. V-F1-01/02/03 (shadow do `bds-select`/`bds-select-chips`/`bds-checkbox`, ausentes no zip19);
2. V-F4-01/04;
3. V-F6-01/06/07;
4. V-F2-01 (abas);
5. V-F3-01;
6. V-F5-01/02.

Todas são somente leitura, com as ressalvas de rascunho e de dados reais do Desk indicadas em cada seção.

**Notas para o planejador:**
- `R/MEDIDAS.md` tem os valores de `.pa3` (16px → **10px**) e `.pa2` (8px → **5px**) errados. Use a tabela de escala do início deste arquivo.
- Os contadores reais da Blip são `n/25` (saídas) e `n/15` (ações). O "2/60" e o "3/30" dos prints de `R/` são artefatos da reconstrução.
- O `Colar ação` tem duas versões no bundle (primary com ícone em P:84451, contorno em P:230569). Só a V-F1-03 decide qual está em produção.
- `CAPTURAS-PENDENTES.md` C-38 (Filas) e C-39 (Versões) ficam respondidas pelo bundle (F-5.1 e F-2.1); falta só o print.

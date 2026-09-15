# Análise do contato — casca, Visão Geral, Relatórios Personalizados e Jornada

Fonte: captura `supernova.blip.ai (6).zip`, tela `/application/detail/supernovaroteador/analytics/dashboard`
(contrato `supernova`, cluster `Beagle`). Tudo abaixo saiu de `portal.js`, `portal.css`, dos
`*_bds-*_entry_js` do blip-ds, do pacote de tradução pt-BR e do LaunchDarkly do contexto do bot.
Nada foi medido na Blip ao vivo.

Código: `apps/gestao/src/app/fluxo/[id]/analise/` (`layout.tsx`, `vista.tsx`, `abas.ts`, `pecas.tsx`,
`analise.css`, `visao-geral/`, `relatorios/`, `jornada/`) e `apps/gestao/src/lib/analise-portal.ts`.

## 1. A casca (`#analytics-tabs-view`)

- Estado `auth.application.detail.analytics` (`url: "/analytics"`, `redirectTo` →
  `analytics.dashboard`), vista `tabsNav@auth.application.detail`, template módulo **95760**,
  controlador **`ra`**.
- Oito `bds-tab`, nesta ordem. Condição de cada uma (`ra.checkFeatures()`):

| aba (pt-BR, `analyticsTabs.*`) | condição | flag / valor na captura | aparece |
|---|---|---|---|
| Dashboard | nenhuma | — | sim |
| Mensagens ativas | `isDisplayingActiveMessagesTab` | `is-displaying-analytics-active-messages-tab` = true | sim |
| Visão Geral | `isDisplayingOverviewTab` | `is-displaying-analytics-overview-tab` = true | sim |
| Relatórios Personalizados | nenhuma | — | sim |
| Jornada dos Contatos | nenhuma | — | sim |
| Gerenciador de Relatórios | `isShowingDataExtractor = await Zn()` | ver abaixo | **sim** |
| Dicionário de Dados | `isShowingDataDictionary` | `is-showing-data-dictionary` = true | sim |
| GoodData | `isShowingGoodData` | `is-showing-gooddata` = false | não |

- `Zn()`:
  `const e = await ve.ak.dataExtractorShowTab(), i = $n.D_.toLowerCase(); return e[i in e ? i : "default"].isEnabled`.
  `dataExtractorShowTab` lê `data-extractor-show-tab` =
  `{"golden":{"isEnabled":false},"default":{"isEnabled":true},"dobermann":{"isEnabled":false}}`;
  `$n.D_` é `defaultClusterName` = `"Beagle"` (`settings.json`). `beagle` não é chave → `default` →
  **true**. `is-showing-data-extractor-tab` (`{"clusters":"Golden,Doberman"}`),
  `is-showing-data-extractor` e `show-data-extractor-tab` **não** decidem a aba.
- O conteúdo do Gerenciador é o estado `analytics.dataExtractor` (vista `content`, template 69470,
  controlador `Xn`): um `<iframe>` de `DATA_EXTRACTOR_FRAME_URL` (outro aplicativo; plano `standard`
  redireciona). O `<data-extractor>` do painel não tem componente registrado. Aqui: aba no lugar,
  apagada, com o selo "em breve"; sem tela.
- `analytics-redirect-modal`: só com `isShowAnalyticsSuite` (`blip-analytics-suite-visibility` = false)
  → não entra.
- `is-displaying-analytics-tabs`: zero ocorrências no `portal.js`. O `isDisplayingAnalyticsTabs` dos
  relatórios é `!isHidingAnalyticsTabs()` (`is-hiding-analytics-tabs` = false).
- Posição: `handlePosition()` põe `bds-tabs.style.top` = `getBoundingClientRect().bottom` de
  `#main-navbar` e reage a `scroll` e `ResizeObserver`.
- Medidas:
  - `#analytics-tabs-view { background: --color-surface-2 }`;
  - `.tabs-header { background:#fff; box-shadow:-3px 1px 8px 0 rgba(0,4,10,.15); height:auto; padding-top:10px; position:fixed }`;
  - `.bds-tabs { width:100%; display:flex; z-index:1100; box-sizing:border-box; align-items:center; height:48px; padding:0 10px }`,
    com `align` padrão `center` e um contêiner de 40px para cada seta;
  - `.bds-tab { height:46px; border-bottom:2px solid transparent; max-width:270px; box-sizing:content-box; color:--color-content-disable }`,
    `:not(:last-child) { margin-right:32px }`, texto `bds-typo fs-16` com `min-width:90px`, negrito
    só na ativa, e a animação `selectFade` .75s (traço `--color-brand`);
  - `bds-tab-panel:not(#dashboardContent) { padding:50px 0 0 }`.
- A aba com `ng-show` falso continua no DOM, e o `:last-child` a conta: com o GoodData escondido, a
  última visível ainda tem 32px à direita.
- Barra do contato: `li.active > a:before` — 4px, `#3f7de8`, `left:0; width:100%`. O
  `sidenav-menu-item` acende com `$state.includes(sref)`.

## 2. Visão Geral (`generalDashboard`)

- Template **7780**, controlador **`ri`**; `counterChildCard` **14085**, `analyticsChart` **1920**,
  modal de ajuda **6411** (`Qe`).
- Flags: `analytics-messages-general-info` (ícone de ajuda), `active-messages-per-domain-table`
  (bloco por canal), `analytics-general-dashboard-requests-for-user-quantity-enabled` (contadores de
  usuário) ligadas; `general-dashboard-initial-period-one-day` desligada → período `U4(7)` =
  `moment().subtract(7,'days')` até `moment()`.
- `page-header` com título `bds-typo fs-32 extra-bold` + ícone `info solid medium`. "Atualizar"
  (secundário, `refresh`) e "Exportar" (`download`) só com `usersPerDay.length > 0`.
- Cartões: `.card.ma0.pa4.mt4.mr2.ml2`, `flex:1.5` (Usuários) e `flex:3` (Mensagens), coluna com
  `space-between`. Título fs-24 bold, descrição fs-16 com `line-height:24px`.
- Contador: `.counter-child-card { border-radius:8px; height:11vh; margin-top:20px; padding:10px }`
  + `ml2 mr2`, nome fs-16 bold + `info solid x-small`, valor fs-20 bold. O número é
  `toLocaleString().replaceAll(",", ".")`.
- Por canal: vazio = `card` com título fs-24 e `.no-content-found`
  (`padding:80px 0; height:31px; color:#a8bfc4`) "Não há mensagens ativas no período selecionado";
  cheio = `analytics-chart` do tipo lista.
- Gráficos: `analytics-chart { margin-top:1.5rem }` dentro de `div.row.mr2.ml2`; o `card` com
  `item-title`: `card .card-header { padding:.9375rem .9375rem 0 }`, título negrito
  (`.font-size-24px p { font-size:24px }`), `icon-info` só no hover; `div.pa4 > chart`.
- Textos pt-BR: `metrics.*`, `modules.application.detail.dashboard.general.*`
  ("Usuários por dia (DAUs e DEUs)", "Mensagens por dia", `noEnoughData`), `metrics.overviewHelp.*`.

## 3. Relatórios Personalizados (`customReports`)

- Template **47754**, controlador **`bi`**.
- `page-header page-title="Relatórios personalizados"` com `helper-title/body/doc`, mas sem
  `helper-confirm` → não há ícone de ajuda.
- Cabeçalho: `search-input` (lupa `Search` 32px `#8CA0B3`; o campo nasce com `width:0` e abre para
  200px no foco) e o botão `bp-btn bp-btn--bot bp-btn--small` "Criar relatório" (`.bp-btn`: raio 3,
  altura 42, `min-width:10rem`, `padding:0 1.25rem`, .875rem/600).
- Lista: `bds-paper.cards` — `#reports-id .cards { background:surface-1; display:flex; justify-content:space-between; margin-bottom:5px; padding:25px; white-space:nowrap }`.
  Colunas "Nome do relatório" (`w-25.truncate` → 250px), "Criado por" (`w-30.truncate` → 250px),
  "Última modificação" (`w-25`), rótulo fs-12 `--color-content-disable`, valor fs-14. Ícones editar e
  excluir só para o dono, escondidos até o hover.
- Data: hoje → `fromNow()`; outro dia → `DD/MM/YYYY - HH:mm`; sem data → `N/A`.
- Vazio: `bds-typo.no-content-found` "Nenhum relatório encontrado :(".
- Excluir: `ModalService.showModal(Rw({title, body, buttons}))`, template **84817**
  (`.modal-dialog.modal-sm`, título fs-32, botões "Não"/"Sim"), textos `reports.modal.*`.
- Busca por nome: filtro local em `searchChange()`.

## 4. Jornada dos Contatos (`contactsJourney`)

- Template **55218**, controlador **`Sn`**; `sankeyDiagram` (`Oe`, sem template, Google Charts
  `Sankey`), `labeledColorCard` **4233**, modal de ajuda **22616** (`Gi`, `bds-modal`).
- Flags: `showing-contacts-journey`, `contacts-journey-first-node-filter`,
  `contacts-journey-contacts-button`, `contacts-journey-csv-export-button`,
  `contacts-journey-cassandra-datasource` (sem fallback SQL) ligadas.
- Período: `UT({defaultStartFromToday:-1, defaultEndFromToday:0, validStartFromToday:-30, validEndFromToday:1, maximumDaysToSelect:6})`.
- Opções `Ci`: `width:1000; height:500` (380 sem dado); nó `width:15; nodePadding:30;
  colorMode:"unique"`; rótulo `fontSize:10; bold`; `iterations:0`; aresta com `fill`/`stroke` `L` e
  `strokeWidth:2`. Cor do nó: `Regular` `#1968f0`, `Other` `#141414`, `End` `extended_orange`.
- Ordem: por etapa e, dentro dela, Regular → Other → End (`orderSankeyEdges`).
- Rótulo do nó: `nome: getLabelSufix(nome, etapa)`. Chegadas ao nó sobre chegadas da etapa; para o nó
  de partida, saídas sobre a etapa seguinte; com `i < 0` ou etapa vazia, a contagem crua.
- Tooltip: `getTooltipSufix` = aresta sobre as que saem do mesmo nó.
- Largura do corpo: `max(100, 23 × etapas)%` (`adjustJourneyViewWidth`).
- Nomes especiais: `#others` → "Outros", `#exit` → "Saída"; o nó leva `[etapa]`, que
  `getNodeNameWithoutInstance` corta para o filtro "Começar a partir de".
- Medidas:
  - `#contacts-journey { min-width:620px }`, `.container.w-90`;
  - `#contacts-journey-container { margin-top:14px }`;
  - `.diagram-header { line-height:40px; padding-bottom:14px }`;
  - `.communication-div { height:550px }` no "sem dado";
  - `.labeled-color-card { border:1px solid surface-3; border-left-width:10px }`, com cores
    `#3f7de8` / `#f06305` / `#141414`.
- "Sem dado": `errorNoData.title` + `descriptionMaster` (roteador) ou `descriptionDefault`; no roteador,
  o link "Saiba como ativar o contexto do roteador".
- Imagens `clock.svg`, `sankey-loading.svg`, `empty.svg`, `sankey-diagram.svg` e `Chevalet.svg`
  **não vieram** na captura.

## 5. Régua do blip-ds usada

- `bds-typo`: fs-10/12/14/16 com `line-height:150%`; fs-20/24/32 com `100%`. `margin` ligada por
  padrão, com `margin-bottom:22px` só em fs-20/24/32 (e 20px em fs-40). Peso: regular 400,
  semi-bold 600, bold 700, extra-bold 800. `tag="span"` põe a margem num inline — não conta.
- `bds-icon`: xx-small 12, x-small 16, small 20, medium 24, x-large 32, xx-large 36, xxx-large 40.
- `bds-button`: `standard` → `medium`; `padding:0 16px`, raio 8, `gap:4px`.
- `bds-modal`: `.modal` 592×368, `padding:32px`, raio 8; `.outzone` preto a 70%.
- `.modal` legado: `.modal-dialog` raio 3, `padding:1.875rem`, `.modal-sm` 690px.
- Datepicker: `.bp-daterange-inputs` com borda `#d2dfe6`, raio 8 e 24rem em `.small-datepicker-input`;
  data `dd Mon, aaaa` com meses em inglês (`DateHelper.months`, o template não passa `months`).

## 6. Dados

WebSockets vazios na captura. Formatos, pelo código:

- `AnalyticsReportsService.getMany(email@blip.ai, skip, take)` → `{ reports: [{ id, name, isPrivate, owner: { email, fullName }, modifiedAt }] }`.
- `ContactsJourneyService.getJourneyEdges(período, fonte, primeiroNó)` →
  `[{ from, to, fromStateId, count, step, type }]`.
- Visão Geral: `AnalyticsServiceFactory.createService(Users | Messages)`; séries
  `usersPerDay[i] = [dia, ativos, engajados]` e `messagesPerDay[i] = [dia, recebidas, enviadas]`
  (`generateCSV`).

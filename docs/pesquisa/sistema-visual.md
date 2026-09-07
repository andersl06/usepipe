# Sistema visual — Chatwoot e Twenty como base para `packages/ui` do Pipe

Fontes: clone raso `chatwoot/chatwoot` (HEAD `8314676`, MIT fora de `enterprise/**`) e clone parcial
`twentyhq/twenty` limitado a `packages/twenty-ui`, `twenty-shared`, `twenty-sdk` (MIT — `twenty-front`
e `twenty-server` são AGPLv3 e não foram abertos nem citados nesta pesquisa).

Contexto que muda a leitura deste documento: o Pipe **já tem marca fechada**
(`docs/marca/MARCA.md` — paleta Moss/Sage/Terracota/Creme, tipografia sans geométrica + IBM Plex
Mono para rótulos) e **já decidiu a stack** (`docs/specs/2026-09-05-pipe-design.md` — Next.js/React
nos três fronts). Por isso este documento não recomenda copiar valores de cor ou fonte de nenhuma
das duas referências — recomenda a **arquitetura de token e de componente**, populada com os valores
que o Pipe já escolheu.

---

## 1. Tokens de design

### 1.1 Chatwoot

Duas camadas coexistem no CSS: um sistema legado (`woot`, escala 25–900) e o sistema novo
("Next Colors", prefixo `n-`), que é o que vale estudar.

- Variáveis: `app/javascript/dashboard/assets/scss/_next-colors.scss:1-308`
- Mapeamento Tailwind: `theme/colors.js:112-260` (`rgb(var(--x) / <alpha-value>)`)
- Dark mode: `tailwind.config.js:20` (`darkMode: 'class'`); bloco `.dark { ... }` em
  `_next-colors.scss:153-307`. Nenhum componente sabe de tema — só a CSS custom property muda de
  valor quando a classe `.dark` entra/sai da raiz.

Escalas completas (12 passos, RGB), light + dark: `slate`, `iris` (marca), `blue`, `ruby` (erro),
`amber` (warning), `teal` (sucesso), `gray`, `violet`. Exemplo `slate` light `_next-colors.scss:5-16`:
passo 1 = `252 252 253`, passo 12 = `28 32 36`; dark `:154-165`: passo 1 = `17 17 19`, passo 12 =
`237 238 240`.

Tokens semânticos (papel fixo, não escala), light → dark, `_next-colors.scss:114-152` /`:274-298`:

| Token | Light | Dark |
|---|---|---|
| `--background-color` | `247 247 247` | `28 29 32` |
| `--surface-1` | `254 254 254` | `20 21 23` |
| `--surface-2` | `255 255 255` | `22 23 26` |
| `--border-weak` | `234 234 234` | `31 31 37` |
| `--border-strong` | `226 227 231` | `46 45 50` |
| `--card-color` | `255 255 255` | `28 30 34` |
| `--overlay` | `0,0,0,0.12` | `0,0,0,0.4` |

Marca fixa (não muda com tema): `brand: '#2781F6'` (`theme/colors.js:229`).

Espaçamento: **sem escala própria** — nenhuma chave `spacing` em `tailwind.config.js` (arquivo
inteiro, 260 linhas, conferido). Usa o padrão Tailwind (base 4px).

Border-radius: **sem escala própria** — usa `rounded-lg` (botão `_base.scss:47`, campo
`_base.scss:75`) e `rounded-md` (tooltip `_woot.scss:36`) do Tailwind padrão. Único radius próprio:
`code` 4px / `pre` 6px na tipografia de bolha de mensagem (`tailwind.config.js:154,166`).

Sombra: **sem token próprio** — `shadow`/`shadow-md` do Tailwind usados direto nos componentes.

Tipografia: **Inter + InterDisplay**, self-hospedadas (`_woot.scss:6-7`), aplicadas com `!important`
em `html, body` (`_woot.scss:21-31`). Pesos não-padrão interpolados —
`font-420/440/460/520/620` (`tailwind.config.js:47-53`) — usados para afinar legibilidade por estilo
de texto. Tamanhos extras: `fontSize.xxxs = 8px`, `fontSize.xxs = 10px` (`tailwind.config.js:212-215`).

O artefato mais reaproveitável do Chatwoot é a escala tipográfica semântica em
`_woot.scss:71-148`:

| Classe | Tamanho/peso | line-height | letter-spacing |
|---|---|---|---|
| `.text-body-main` | sm / 420 | 21px | -0.28px |
| `.text-body-para` | sm / 420 | 21px | -0.21px |
| `.text-heading-1` | lg / 520 | 24px | -0.27px |
| `.text-heading-2` | base / medium | 24px | -0.27px |
| `.text-heading-3` | sm / medium | 21px | -0.27px |
| `.text-label` | sm / medium | 21px | — |
| `.text-label-small` | xs / 440 | 16px | -0.24px |
| `.text-button` | sm / 460 | 21px | -0.28px |
| `.text-button-small` | xs / 440 | 18px | -0.24px |

Isso é um padrão (nome semântico → tamanho + peso + altura de linha + tracking), não valores a
copiar — o Pipe aplica o mesmo padrão com sans geométrica + IBM Plex Mono.

### 1.2 twenty-ui

Base: **Radix Colors P3** (`@radix-ui/colors`, MIT), reexportada — não são valores autorais do
Twenty.

- Grayscale 12 passos: `src/theme/constants/GrayScaleLight.ts:1-14` / `GrayScaleDark.ts:1-14`
  (`color(display-p3 r g b)`). Light: gray1 `1 1 1` → gray12 `0.2 0.2 0.2`. Dark: gray1
  `0.09 0.09 0.09` → gray12 `0.922 0.922 0.922`.
- 23 cores principais (`MainColorsLight.ts:4-35`), uma por família Radix no passo 9 (red, orange,
  amber, green, blue…). Pegadinha: `blue` aponta para `indigoP3.indigo9`, não para o azul Radix
  puro.
- Cores secundárias (`SecondaryColorsLight.ts`, 379+ linhas): cada família expandida em 12 passos —
  uso em fundo sutil de tag/chip.
- Sem `success/warning/error` nomeados — compostos por composição: `FontLight.color.danger =
  COLOR_LIGHT.red` (`FontLight.ts:13`), `BackgroundLight.danger = COLOR_LIGHT.red3`
  (`BackgroundLight.ts:15`).
- `accent` (marca) em arquivo à parte (`AccentLight.ts`/`AccentDark.ts`).

Tipografia (`FontCommon.ts:1-17`): Inter; tamanhos xxs `0.625rem`, xs `0.85rem`, sm `0.92rem`, md
`1rem`, lg `1.23rem`, xl `1.54rem`, xxl `1.85rem`; pesos regular 400/medium 500/semiBold 600; cores
de texto primary/secondary/tertiary/light/extraLight = grayscale 12/11/9/8/7.

Espaçamento (`ThemeCommon.ts:12-14`): não é array — é **função**:
`spacing(...args) => args.map(m => m*4+'px').join(' ')`, base 4px. `theme.spacing(2,4)` →
`"8px 16px"`.

Border-radius (`BorderCommon.ts:1-14`): xs 2px, sm 4px, md 8px, smRound 4px, mdRound 8px, lg 16px,
xl 20px, xxl 40px, pill 999px, rounded 100%.

Sombra (`BoxShadowLight.ts:3-8`, cor base = grayscale com alpha, não preto puro):
- `light`: `0 2px 4px 0 {gray2α}, 0 0 4px 0 {gray5α}`
- `strong`: `2px 4px 16px 0 {gray7α}, 0 2px 4px 0 {gray5α}`
- `underline`: `0 1px 0 0 {gray9α}`
- `superHeavy`: `0 0 8px 0 {gray7α}, 0 8px 64px -16px {gray10α}, 0 24px 56px -16px {gray5α}`

Animação (`Animation.ts:1-8`, só durações): instant `0.075s`, fast `0.15s`, normal `0.3s`, slow
`1.5s`. Transição de hover padrão (`ThemeCommon.ts:22`): `background 0.1s ease`.

Outros tokens em `ThemeCommon.ts`: ícone (14/16/20/24px, stroke 1.6/2/2.5 em `Icon.ts`), modal
(larguras fixas sm 300px → xl 1200×800px, fullscreen via `calc(100dvw/var(--t-zoom,1))` em
`Modal.ts`), tabela (`horizontalCellMargin/Padding` 8px, `checkboxColumnWidth` 32px),
`sidePanelWidth` 500px, `betweenSiblingsGap` 2px.

Estrutura do tema (`ThemeLight.ts:15-31`): objeto plano único —
`THEME_LIGHT = {...THEME_COMMON, accent, background, blur, border, boxShadow, font, name, snackBar,
tag, code, IllustrationIcon, grayScale, color}`. Sem `types/Theme.ts` central — o tipo é inferido
(`typeof THEME_LIGHT`). Dark é a mesma estrutura trocando as constantes `*_DARK`.

### 1.3 Comparação e recomendação para o Pipe

| Critério | Chatwoot | twenty-ui | Escolha p/ Pipe |
|---|---|---|---|
| Stack de entrega | Tailwind config + SCSS + CSS vars | Objeto TS puro + CSS Modules | **twenty-ui** — Pipe é Next.js/React, objeto tipado sem acoplamento a framework é mais direto |
| Nomenclatura semântica | Boa (`surface-1`, `border-weak`) | Fraca (acesso via escala crua: `gray9`, `red3`) | **Chatwoot** — copiar o padrão de nome, não o valor |
| Mecanismo de dark mode | CSS custom property + classe `.dark`, zero lógica em componente | Objeto de tema trocado via Provider/Context | **Chatwoot** — mais barato de portar para Tailwind, funciona igual em CSS puro |
| Tokens de componente (modal, tabela, ícone) | Inexistentes, cada tela define localmente | Existem e são centrais (`ThemeCommon.ts`) | **twenty-ui** — evita 20 componentes reinventando o mesmo padding |
| Escala de cor | 12 passos por família, mas só 8 famílias | 12 passos, 23+ famílias (mais granular) | Nenhuma pronta — gerar escala de 12 passos a partir de Moss/Sage/Terracota do Pipe com o mesmo método (passo 9 = valor de marca) |

**Recomendação concreta**: estruturar `packages/ui/theme` como objeto TypeScript no formato do
twenty-ui (`THEME_COMMON` + `THEME_LIGHT`/`THEME_DARK`, com `spacing()` como função de multiplicador
4px, tokens de `modal`/`table`/`icon` centralizados), mas **entregá-lo também como CSS custom
properties** no mecanismo do Chatwoot (`--pipe-surface-1`, `--pipe-border-weak`, trocadas por
`.dark`) para que funcione tanto em componentes React quanto em classes utilitárias Tailwind. Os
valores de cor são os do Pipe (`MARCA.md`): expandir Moss `#4A5D23`, Sage `#8A9A5B`, Terracota
`#C4442E`, Azul profundo `#2E4A5D`, Verde escuro `#1F3A2E` em escalas de 12 passos (o próprio valor
de marca fica no passo 9, como no Twenty), gerando os passos claros/escuros ao redor dele. Tipografia:
manter sans geométrica + IBM Plex Mono do Pipe, mas adotar a tabela semântica do Chatwoot
(`text-heading-1`, `text-body-main` etc., com line-height e letter-spacing explícitos) como
convenção de nomenclatura, e a escala numérica do twenty-ui (xxs→xxl) como os valores em rem
subjacentes. Border-radius e sombra: nenhuma das duas referências tem algo digno de copiar
verbatim — usar a escala do twenty-ui (`xs 2 / sm 4 / md 8 / lg 16 / pill 999`) por ser mais completa
e já pensada para produto B2B denso.

---

## 2. Estrutura de layout das telas principais

### 2.1 Chatwoot

**Shell do dashboard** — raiz `app/javascript/dashboard/routes/dashboard/Dashboard.vue:131-177`.
Uma única sidebar colapsável (não duas fixas) + área de conteúdo:
- `NextSidebar` (`components-next/sidebar/Sidebar.vue`): `SidebarAccountSwitcher.vue` (troca de
  conta), `SidebarGroup.vue`/`SidebarSubGroup.vue`/`SidebarGroupHeader.vue`/`SidebarGroupLeaf.vue`
  (árvore de navegação com ordenação persistida via `helper/sidebarSort.js`),
  `SidebarProfileMenu.vue` (menu do usuário), `ComposeConversation.vue` (botão nova conversa).
- `<main class="flex flex-1 h-full w-full min-h-0 px-0 overflow-hidden bg-n-surface-1">`:
  `<router-view/>` + `CommandBar` (paleta de comando, lazy), `FloatingCallWidget`,
  `MobileSidebarLauncher` (responsivo).

Padrão a portar: **uma sidebar só, com grupos hierárquicos**, mais simples que duas colunas fixas.

**Conversa em 3 colunas** — raiz `routes/dashboard/conversation/ConversationView.vue:197-219`, uma
`<section class="flex w-full h-full min-w-0">` com 3 filhos diretos:
1. `ChatList` (`components/ChatList.vue`) — lista de conversas, filtrada por `inboxId`/`label`/
   `teamId`/`conversationType`.
2. `ConversationBox` (`components/widgets/conversation/ConversationBox.vue`) — thread, com
   `SidepanelSwitch` injetado como slot (painel de IA/detalhes).
3. `ConversationSidebar` (`components/widgets/conversation/ConversationSidebar.vue`) — contexto do
   contato, renderizado condicionalmente.

Padrão a portar: 3 colunas como **irmãs diretas de uma section flex**, cada uma resolvendo seu
próprio loading/empty internamente.

**Relatórios** — wrapper fino por tipo (`routes/dashboard/settings/reports/AgentReports.vue:5-14`)
ao redor de `WootReports.vue`. Blocos reais em `components/`:
- `ReportHeader.vue`, `ReportFilters.vue` — cabeçalho e filtros
- `ReportContainer.vue:296-337` — grid de métricas:
  `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 px-6 py-5 shadow outline-1 outline
  outline-n-container rounded-xl bg-n-solid-2 mt-4`, iterando métricas → `ChartStats.vue` (números)
  + `BarChart` (série temporal), com `woot-loading-state` e mensagem
  `REPORT.NO_ENOUGH_DATA` como estados de loading/vazio.
- `ReportDrilldownCard.vue`/`ReportDrilldownDrawer.vue` — drill-down ao clicar num ponto do gráfico.

Padrão a portar: card de métrica = `rounded-xl` + `outline-1 outline` (não borda sólida) + fundo
levemente elevado; todo gráfico com estado de loading E vazio dedicados.

**Settings/listagem** — `SettingsLayout.vue:22-40` é puramente estrutural via slots:
```
<div class="flex flex-col w-full h-full gap-4 font-inter">
  <slot name="header" />
  <main>
    <slot name="preBody" />
    <slot v-if="isLoading" name="loading"><woot-loading-state .../></slot>
    <p v-else-if="noRecordsFound">{{ noRecordsMessage }}</p>
    <slot v-else name="body" />
  </main>
</div>
```
Loading e empty-state são responsabilidade do layout, não de cada tela. Exemplo de uso:
`routes/dashboard/settings/agents/Index.vue:147-207` — header via `BaseSettingsHeader` (busca +
título + contador + botão de ação), body em lista densa `divide-y divide-n-weak border-t
border-n-weak`, linha `flex justify-between items-start gap-4 py-4` com `Avatar` + nome/e-mail.

Padrão a portar: um `SettingsLayout` genérico de 3 slots (header/loading-empty/body), reaproveitável
em toda tela de listagem.

### 2.2 twenty-ui

**Não existe componente de tabela/board em twenty-ui** — vive em `twenty-front` (AGPLv3), fora do
escopo permitido. Nada a copiar para grid/tabela desta fonte; o Pipe precisa construir isso do zero
ou usar uma lib de tabela MIT externa (ex. TanStack Table).

- **Campos de entrada**: `input/Field`, `SearchInput`, `InputLabel`, `InputHint`, `Slider`,
  `SegmentedControl`.
- **Chips/tags**: `data-display/Chip/Chip.tsx:11-41` — `ChipSize` (Small/Large), `ChipAccent`,
  `ChipVariant` (Regular/Outline/Transparent/Highlighted/Static). Também `Tag`, `Pill`, `LinkChip`.
- **Botões**: `input/Button` — `ButtonVariant` (primary/secondary/tertiary) × `ButtonAccent`
  (default/blue/danger/green) × `ButtonSize` (medium/small); família estendida: `LightButton`,
  `MainButton`, `FloatingButton(+Group)`, `IconButton(+Group)`, `RoundedIconButton`.
- **Menus dropdown**: sem componente "Dropdown" isolado — o padrão é a família
  `navigation/MenuItem*` (MenuItem, MenuItemSelect, MenuItemMultiSelect, MenuItemToggle,
  MenuItemDraggable, MenuItemAvatar, MenuItemSelectColor) + `MenuPicker`, que montam o corpo de um
  dropdown (o container/popover fica em `twenty-front`, fora de escopo).
- **Modais**: `surfaces/Modal/` completo — `Modal.tsx` + `ModalBackdrop`, `ModalContent`,
  `ModalHeader`, `ModalFooter`; tipos `ModalSize`, `ModalPadding`, `ModalOverlay`.

---

## 3. Inventário de componentes reutilizáveis

### 3.1 twenty-ui (`packages/twenty-ui/src/`)

Pastas de alto nível: `input`, `data-display`, `feedback`, `navigation`, `surfaces`, `layout`,
`typography`, `theme`, `theme-constants`, `icon`, `utilities`, `json-visualizer`, `accessibility`.

| Componente | O que faz | Arquivo |
|---|---|---|
| Button | Botão variant/accent/size, ícone opcional | `src/input/Button/Button.tsx` |
| IconButton (+Group) | Botão só-ícone, agrupável | `src/input/IconButton/`, `IconButtonGroup/` |
| Checkbox / Radio(Group) / Toggle | Controles de formulário | `src/input/Checkbox/`, `Radio/`, `RadioGroup/`, `Toggle/` |
| SegmentedControl | Tabs de opção estilo segmented | `src/input/SegmentedControl/` |
| Field / InputLabel / InputHint | Wrapper de campo + rótulo/hint | `src/input/Field/`, `InputLabel/`, `InputHint/` |
| Avatar / AvatarGroup / AvatarOrIcon | Avatar com fallback e empilhamento | `src/data-display/Avatar*/` |
| Chip / Tag / Pill / LinkChip | Família de etiquetas | `src/data-display/Chip/Chip.tsx:11-41`, `Tag/`, `Pill/`, `LinkChip/` |
| Status | Indicador de status colorido (bolinha + label), usa `parseThemeColor` | `src/data-display/Status/Status.tsx` |
| NotificationCounter | Badge numérico pequeno (transcrito abaixo) | `src/data-display/NotificationCounter/NotificationCounter.tsx` |
| Loader / CircularProgressBar / ProgressBar | Indicadores de carregamento/progresso | `src/feedback/Loader/`, `CircularProgressBar/`, `ProgressBar/` |
| Banner / InlineBanner / Callout | Mensagens de aviso/contexto | `src/feedback/Banner/`, `InlineBanner/`, `Callout/` |
| EmptyPlaceholderStyled / ErrorPlaceholderStyled | Estados vazio/erro | `src/feedback/*PlaceholderStyled/` |
| Modal (+Backdrop/Content/Header/Footer) | Modal completo | `src/surfaces/Modal/` |
| Card (+Content/Header/Footer) | Cartão com header/body/footer | `src/surfaces/Card*/` |
| AppTooltip | Tooltip global | `src/surfaces/AppTooltip/AppTooltip.tsx` |
| MenuItem (família completa) | Item de menu dropdown, várias variantes | `src/navigation/MenuItem*/` |
| H1Title/H2Title/H3Title/Text/Label | Escala tipográfica como componente | `src/typography/*` |

Ausentes (confirmadamente não existem em twenty-ui): tabela/grid, Dropdown/Popover container,
Skeleton dedicado, Pagination, Tabs container — vivem em `twenty-front`, fora de escopo.

### 3.2 Chatwoot

**`components-next/`** (design system atual, Vue 3 `<script setup>`, cada componente com
`.story.vue` via Histoire) — ponto de partida certo:

| Componente | O que faz | Arquivo |
|---|---|---|
| Button / ConfirmButton | Botão base (variant × cor × tamanho) / botão com confirmação | `components-next/button/Button.vue` (261 linhas), `ConfirmButton.vue` |
| Checkbox / Switch | Controles de formulário | `components-next/checkbox/Checkbox.vue` (63L), `switch/Switch.vue` (42L) |
| Avatar | Avatar com fallback, status online | `components-next/avatar/Avatar.vue` (304L) |
| Dialog | Modal headless com slots header/body/footer | `components-next/dialog/Dialog.vue` (188L) |
| DropdownMenu | Menu de contexto/dropdown + primitivos | `components-next/dropdown-menu/DropdownMenu.vue` (302L) |
| BaseTable/Row/Cell | Tabela genérica composable | `components-next/table/BaseTable.vue` (60L) |
| PaginationFooter | Paginação de tabela/lista | `components-next/pagination/PaginationFooter.vue` (130L) |
| Spinner | Loading | `components-next/spinner/Spinner.vue` (25L) |
| TabBar | Abas horizontais | `components-next/tabbar/TabBar.vue` (106L) |
| Select / ComboBox | Select e combobox com busca | `components-next/select/Select.vue`, `combobox/ComboBox.vue` |
| TagInput + helper | Input de tags livres | `components-next/taginput/TagInput.vue` + `helper/tagInputHelper.js` |
| Label / LabelItem | Chip de label colorido | `components-next/label/Label.vue`, `LabelItem.vue` |
| Icon / FileIcon / ChannelIcon | Wrapper de ícone Iconify, ícone por extensão, ícone de canal | `components-next/icon/Icon.vue`, `FileIcon.vue`, `ChannelIcon.vue` |
| Popover | Popover posicionado | `components-next/popover/Popover.vue` |
| EmptyStateLayout | Layout genérico de estado vazio | `components-next/EmptyStateLayout.vue` |

**`components/` (legado, ainda em uso onde `components-next` não cobre)**:

| Componente | O que faz | Arquivo |
|---|---|---|
| Snackbar/SnackbarContainer | Toast de notificação | `components/Snackbar.vue`, `SnackbarContainer.vue` |
| ui/DatePicker | Date picker completo | `components/ui/DatePicker/` |
| ui/ContextMenu | Menu de contexto (clique direito) | `components/ui/ContextMenu.vue` |
| ui/TimeAgo | Timestamp relativo com tooltip da data exata | `components/ui/TimeAgo.vue` |
| table/Table, Pagination, SortButton | Tabela antiga com ordenação por coluna | `components/table/*.vue` |
| base/Hotkey | Exibe atalho de teclado | `components/base/Hotkey.vue` |

**`shared/components/`** (usado no widget público): `Button.vue`, `Spinner.vue`,
`ResizableTextArea.vue`, `StarRating.vue` (CSAT), `PhoneInput/` (telefone com DDI).

**Observação de gap**: nem Chatwoot nem twenty-ui têm um `Badge.vue`/`Chip.tsx` genérico único —
cada contexto reimplementa (`CallStatusBadge`, `DeliveryStatusBadge`, `UnreadBadge`,
`AttributeBadge` no Chatwoot; `Chip`/`Tag`/`Pill`/`Status`/`NotificationCounter` espalhados no
Twenty). **Recomendação**: o Pipe deve generalizar isso num único `Badge`/`Chip` parametrizado por
variante e cor desde o início — nenhuma das referências fez isso bem.

---

## 4. Padrões de lista densa e paginação

- **Virtualização: não existe em nenhuma das duas fontes MIT-seguras.** `package.json` do Chatwoot
  não tem `vue-virtual-scroller` nem equivalente; listas longas (conversas, contatos) usam DOM
  normal + scroll infinito via `IntersectionObserver.vue`
  (`app/javascript/dashboard/components/IntersectionObserver.vue` — wrapper sobre
  `useIntersectionObserver` do `@vueuse/core`; emite `observed` quando uma sentinela entra na
  viewport). twenty-ui não tem tabela, logo não tem virtualização a inspecionar.
  **Implicação para o Pipe**: como filas de conversa, listas de lead e listas de avaliação vão ficar
  genuinamente grandes, o Pipe precisa trazer uma lib de virtualização própria (ex. TanStack Virtual,
  MIT) — não há nada para copiar aqui, é gap real das duas referências.
- **Estados vazios**: Chatwoot separa layout de conteúdo — um `EmptyStateLayout.vue` genérico
  (`components-next/EmptyStateLayout.vue`) recebe título/ícone/ação, e cada domínio só declara um
  arquivo `*EmptyStateContent.js` com o texto (`Contacts/EmptyState/`, `Campaigns/EmptyState/`,
  `HelpCenter/EmptyState/`). Padrão bom de copiar.
- **Loading**: poucos skeletons dedicados — `shared/components/ArticleSkeletonLoader.vue` é o único
  relevante fora do widget. O padrão dominante no dashboard é `Spinner`/`woot-loading-state`, não
  skeleton de linha de tabela.
- **Paginação**: dois padrões coexistindo — legado `components/table/Pagination.vue` e o atual
  `components-next/pagination/PaginationFooter.vue` (documentado via Histoire `.story.vue`). Este
  último é o candidato certo a portar.

---

## 5. Ícones

| Projeto | Biblioteca | Como é usada | Licença | Uso comercial |
|---|---|---|---|---|
| Chatwoot | Iconify via `@egoist/tailwindcss-icons`, agregando `@iconify-json/{lucide,ph,ri,material-symbols,teenyicons,fluent,logos}` (`tailwind.config.js:268-281`, coleções custom em `theme/icons.js`) | Classe utilitária `i-lucide-xxx` | Lucide=ISC, Phosphor=MIT, Remix Icon=Apache-2.0, Material Symbols=Apache-2.0, Teenyicons=MIT, Fluent=MIT | Livre em todas; Apache-2.0 só exige manter aviso de licença no projeto, não na UI |
| twenty-ui | `@tabler/icons-react ^3.31.0` (`packages/twenty-ui/package.json:78`) | Componente-fachada `src/icon/components/Icon.tsx` + registro `src/icon/providers/internal/AllIcons.ts`, componentes gerados por ícone | MIT | Livre |

**Recomendação**: Chatwoot mistura 6 coleções Iconify diferentes — inconsistente visualmente entre
telas. Para o Pipe, usar **uma única biblioteca**: Tabler Icons (MIT), com a mesma arquitetura do
twenty-ui — um `Icon.tsx` genérico + registro central — porque é a que já assume React, o stack do
Pipe.

---

## 6. Código que PODE ser copiado (transcrito, pronto para adaptar)

Cada arquivo abaixo deve levar no topo:
`// Adaptado de <projeto> (<licença>) — <caminho original>`, conforme convenção do Pipe
(`docs/specs/2026-09-05-pipe-design.md §2`).

### 6.1 Formatação de tempo relativo — Chatwoot (MIT)

Origem: `chatwoot/app/javascript/shared/helpers/timeHelper.js` (commit `8314676`)

```js
// Adaptado de Chatwoot (MIT) — app/javascript/shared/helpers/timeHelper.js
import {
  format,
  isSameYear,
  isThisYear,
  isToday,
  isYesterday,
  fromUnixTime,
  formatDistanceToNow,
  differenceInDays,
} from 'date-fns';

export const messageStamp = (time, dateFormat = 'h:mm a') => {
  const unixTime = fromUnixTime(time);
  return format(unixTime, dateFormat);
};

export const relativeDayTimestamp = (time, yesterdayLabel) => {
  const date = fromUnixTime(time);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return yesterdayLabel;
  if (isThisYear(date)) return format(date, 'MMM d');
  return format(date, 'MMM d, yyyy');
};

export const dynamicTime = time => {
  const unixTime = fromUnixTime(time);
  return formatDistanceToNow(unixTime, { addSuffix: true });
};

// 1m, 1h, 1d, 1mo, 1y — usado em contadores compactos de lista
export const shortTimestamp = (time, withAgo = false) => {
  const suffix = withAgo ? ' ago' : '';
  const timeMappings = {
    'less than a minute ago': 'now',
    'a minute ago': `1m${suffix}`,
    'an hour ago': `1h${suffix}`,
    'a day ago': `1d${suffix}`,
    'a month ago': `1mo${suffix}`,
    'a year ago': `1y${suffix}`,
  };
  if (timeMappings[time]) return timeMappings[time];
  return time
    .replace(/about|over|almost|/g, '')
    .replace(' minute ago', `m${suffix}`)
    .replace(' minutes ago', `m${suffix}`)
    .replace(' hour ago', `h${suffix}`)
    .replace(' hours ago', `h${suffix}`)
    .replace(' day ago', `d${suffix}`)
    .replace(' days ago', `d${suffix}`)
    .replace(' month ago', `mo${suffix}`)
    .replace(' months ago', `mo${suffix}`)
    .replace(' year ago', `y${suffix}`)
    .replace(' years ago', `y${suffix}`);
};

// Duração mm:ss / hh:mm:ss — direto reaproveitável para duração de chamada/áudio
export const formatDuration = durationInSeconds => {
  if (durationInSeconds === null || durationInSeconds === undefined) return '';
  const totalSeconds = Number(durationInSeconds);
  if (Number.isNaN(totalSeconds) || totalSeconds < 0) return '';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  if (hours > 0) return `${hours.toString().padStart(2, '0')}:${mm}:${ss}`;
  return `${mm}:${ss}`;
};
```

Uso no Pipe: `shortTimestamp`/`relativeDayTimestamp` servem direto para timestamp de mensagem na
lista de conversas do Desk; `formatDuration` serve para duração de áudio (já referenciado na régua
de esforço do Pipe em `2026-09-05-pipe-design.md §4.4`).

### 6.2 Helper de cor — Chatwoot (MIT)

Origem: `chatwoot/app/javascript/shared/helpers/colorHelper.js`

```js
// Adaptado de Chatwoot (MIT) — app/javascript/shared/helpers/colorHelper.js
import { toHex, mix, getLuminance, getContrast } from 'color2k';

export const isWidgetColorLighter = color => {
  const colorToCheck = color.replace('#', '');
  const c_r = parseInt(colorToCheck.substr(0, 2), 16);
  const c_g = parseInt(colorToCheck.substr(2, 2), 16);
  const c_b = parseInt(colorToCheck.substr(4, 2), 16);
  const brightness = (c_r * 299 + c_g * 587 + c_b * 114) / 1000;
  return brightness > 225;
};

// Ajusta iterativamente uma cor até atingir contraste mínimo contra o fundo —
// útil para texto sobre cor dinâmica (ex.: cor de etiqueta/tenant customizada)
export const adjustColorForContrast = (color, backgroundColor) => {
  const targetRatio = 3.1;
  const MAX_ITERATIONS = 20;
  let adjustedColor = color;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const currentRatio = getContrast(adjustedColor, backgroundColor);
    if (currentRatio >= targetRatio) break;
    const adjustmentDirection =
      getLuminance(adjustedColor) < 0.5 ? '#fff' : '#151718';
    adjustedColor = mix(adjustedColor, adjustmentDirection, 0.05);
  }
  return toHex(adjustedColor);
};
```

Uso no Pipe: o `tenant` carrega "cor primária" configurável (`pipe-design.md §4.1`, white-label) —
`adjustColorForContrast` é exatamente o que garante texto legível em cima dessa cor arbitrária do
cliente. Depende de `color2k` (MIT, já teria que ser instalada de qualquer forma).

### 6.3 Badge/contador — duas implementações equivalentes

**Vue/Tailwind — Chatwoot (MIT)**
Origem: `chatwoot/app/javascript/dashboard/components-next/Conversation/ConversationCard/UnreadBadge.vue`

```vue
<!-- Adaptado de Chatwoot (MIT) — components-next/Conversation/ConversationCard/UnreadBadge.vue -->
<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  count: { type: Number, required: true },
  alignBottom: { type: Boolean, default: false },
});

const { t } = useI18n();
const displayCount = computed(() =>
  props.count > 9 ? t('CHAT_LIST.UNREAD_COUNT_OVERFLOW') : props.count
);
</script>

<template>
  <span
    v-if="count > 0"
    class="bg-n-teal-9 rounded-full h-4 min-w-4 max-w-5 px-1 w-fit font-medium text-xxs leading-3 text-white inline-grid place-items-center flex-shrink-0"
    :class="{ 'mb-0.5': alignBottom }"
  >
    {{ displayCount }}
  </span>
  <span v-else />
</template>
```

**React/CSS Modules + tema — twenty-ui (MIT)**
Origem: `twenty/packages/twenty-ui/src/data-display/NotificationCounter/NotificationCounter.tsx`
e `.module.scss` no mesmo diretório.

```tsx
// Adaptado de twenty-ui (MIT) — src/data-display/NotificationCounter/NotificationCounter.tsx
import { clsx } from 'clsx';
import styles from './NotificationCounter.module.scss';

type NotificationCounterProps = {
  count: number;
  variant?: 'primary' | 'secondary';
  className?: string;
};

export const NotificationCounter = ({
  count,
  variant = 'primary',
  className,
}: NotificationCounterProps) => (
  <div className={clsx(styles.notificationCounter, styles[variant], className)}>
    {count}
  </div>
);
```

```scss
/* Adaptado de twenty-ui (MIT) — NotificationCounter.module.scss */
.notificationCounter {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--t-font-size-xxs);
  font-weight: var(--t-font-weight-semi-bold);
}

.primary {
  background: var(--t-color-blue);
  color: white;
}

.secondary {
  background: var(--t-background-transparent-light);
  color: var(--t-font-color-secondary);
}
```

Por que os dois: são a mesma peça de UI (contador circular pequeno) em duas arquiteturas diferentes.
A versão twenty-ui mostra o padrão certo para o Pipe (React + CSS var de tema, `--t-color-blue` viraria
`--pipe-color-moss`) — é o template a seguir para todo componente do `packages/ui`. A versão Vue serve
só de referência de comportamento (overflow "9+", variação por posição), não de código a colar
diretamente já que o Pipe é React.

---

## Resumo do que entra em `packages/ui`

1. `theme/` — objeto tipado no formato twenty-ui, entregue como CSS custom properties no mecanismo
   Chatwoot, com os valores do Pipe (Moss/Sage/Terracota expandidos em escala de 12 passos).
2. `components/` — inventário combinado de §3, priorizando: Button, IconButton, Checkbox, Radio,
   Toggle, Field, Avatar, Chip/Badge (genérico, nenhuma referência acertou isso), Modal, Dropdown
   (via família MenuItem), Tooltip, Loader, EmptyStateLayout, PaginationFooter, TabBar.
3. `icons/` — Tabler Icons (MIT) com fachada `Icon.tsx` central, arquitetura do twenty-ui.
4. `helpers/` — `timeHelper.js` e `colorHelper.js` do Chatwoot, adaptados para TS.
5. Gap a resolver do zero (nenhuma referência cobre): virtualização de lista (TanStack Virtual) e
   componente de tabela/grid (nenhuma fonte MIT tem um bom).

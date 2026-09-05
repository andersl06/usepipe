# Como Blip, Salesforce e Twenty se comportam visualmente

> Medição feita para responder a uma reprovação do dono: "está muito sujo, unifica tanta informação
> que acaba se tornando ruim", "você está carregando todas as funções na aba à esquerda e usa tantas
> cores que fica parecendo um carrossel", "dessa forma parece que foi construído por IA".
>
> Método: número, não impressão. No Salesforce a medição é do DOM vivo, com `getComputedStyle`,
> atravessando shadow DOM. Na Blip a sessão do navegador estava expirada e **não autentiquei** — a
> medição vem do design system público da própria Blip (`takenet/blip-ds`, código-fonte dos tokens) e
> a estrutura de navegação vem do levantamento que o time já tinha feito no portal real
> (`docs/pesquisa/blip-portal-telas.md`). No Twenty a medição é do código de `twenty-ui` (MIT).
>
> Data: 05/09/2026.

---

## 0. Resumo em uma tabela

O que os três têm em comum, contra o que o Pipe faz hoje:

| Medida | Salesforce | Blip | Twenty | **Pipe hoje** |
|---|---|---|---|---|
| Famílias de fonte numa tela | **1** | **1** | **1** | **2** (Sans + Mono) |
| Degraus de tamanho em uso real | **2** (13/12px = 98%) | 8 definidos | 7 definidos | 8+ |
| Pesos em uso real | **2** (400/700 = 99%) | 4 | 3 | 3 |
| Cor de destaque | **1** (azul) | **1** (azul) | **1** (indigo) | **4** (moss, terracota, ocre, azul) |
| Cores de borda numa tela | **1** domina (66%) | **1** tinta, 3 alfas | **3** degraus de 1 escala | 2 + 4 coloridas |
| Raio dominante | **4px** (77%) | — | escala 2/4/8/16 | 3 valores |
| Navegação principal | **horizontal** | **horizontal** | vertical (app de 1 objeto) | **vertical, tudo empilhado** |
| Itens na navegação principal | **7** | **5** | — | **32** (Gestão) / **17** (CRM) |
| Itens desabilitados visíveis | **0** | **0** | **0** | **45 de 54 (83%)** |
| Configuração | tela própria, outro domínio | módulo próprio | tela própria | **misturada no menu de trabalho** |

A conclusão que o número dá: **os três referenciais são muito mais pobres de cor e de tipo do que
parece à primeira vista, e é isso que os faz parecer profissionais.** O Pipe não erra por falta de
capricho; erra por excesso de vocabulário.

---

## 1. Salesforce — medido no DOM vivo

Org `anderson.linhares@auvp.com.br.playground`. Entrei pela URL de sessão da CLI já autenticada
(`sf org open --url-only`), sem digitar senha. Só leitura: nenhum registro criado, editado ou
apagado.

Telas medidas: `/lightning/o/Lead/list`, `/lightning/o/Account/list` e
`/lightning/setup/ObjectManager/home` (a mais densa, 607 elementos visíveis, 109 com texto).

### 1.1 Cores

**Texto — 8 cores distintas, mas 3 respondem por 97% das ocorrências:**

| Hex | Papel | Ocorrências |
|---|---|---|
| `#181818` | tinta | 64 |
| `#0176D3` | link / destaque | 21 |
| `#747474` | texto secundário | 12 |
| `#444444` | cabeçalho de tabela | 6 |
| `#0B5CAB` | link visitado | 2 |
| `#1E6A1E` | sucesso | 2 |
| `#2E2E2E`, `#FFFFFF` | 1 cada | 2 |

**Fundo — branco e um cinza respondem por 92 de 107 ocorrências:**
`#FFFFFF` (84), `#747474` (9, ícones), `#F3F3F3` (8), `#919191` (2), `#36A934` (2), `#E0E5F8` (1),
`#D60501` (1).

**Borda — uma cor só, em 66% das arestas:** `#C9C9C9` (98 de 148), depois `#747474` (40, contorno de
ícone), `#919191` (8), `#36A934` (1), `#E5E5E5` (1).

**Cor de destaque: uma.** Azul `#0176D3`, e ela aparece **só em link e em estado ativo**. Nunca em
etiqueta de categoria, nunca em barra de progresso decorativa.

**Cores de estado: três, e raríssimas.** Verde `#36A934`/`#1E6A1E` (sucesso), vermelho `#D60501`
(erro), e o azul de informação. Somadas, 6 ocorrências numa tela de 607 elementos — **menos de 1%**.

O Salesforce declara **1205 custom properties** no `:root`. Usa 8 numa tela. O tamanho da paleta
disponível não tem relação com o tamanho da paleta usada.

### 1.2 Tipografia

- **Uma família:** `-apple-system` / `system-ui`. Nenhuma segunda família em nenhuma tela.
- **Tamanhos:** 13px (90 ocorrências), 12px (16), 10px (1), 18px (1), 20px (1). **Cinco degraus
  existem; dois carregam 98% do texto.**
- **Pesos:** 400 (92), 700 (15), 300 (1), 500 (1). **Dois carregam 99%.**
- **Caixa alta:** 15 ocorrências, todas 12px, 12 delas em peso 700 — e **todas são cabeçalho de
  coluna de tabela**. Nada mais na tela é caixa alta. E **não é monoespaçada**: é a mesma família do
  resto, só com peso e caixa diferentes.

### 1.3 Navegação

**Horizontal, no topo.** Medido na lista de Contas:

- Barra de navegação: `height: 40px`, fundo branco, começa em `y=98`. Itens de 32px de altura.
- Sete itens: Início, Chatter, Contas, Contatos, Contratos, Calendário, Configurações — mais o
  iniciador de aplicativos (a "waffle") à esquerda, em `x=16`.
- **`temSidebar: false`.** Não existe menu lateral na tela de lista. Busquei por qualquer elemento
  encostado à esquerda com 140–360px de largura e mais de 300px de altura: **zero resultados**.

**A configuração fica noutro lugar, e é o achado mais importante.** Ao entrar em Configuração (a
engrenagem no canto superior direito), o Salesforce:

1. **Troca de domínio** — de `lightning.force.com` para `my.salesforce-setup.com`.
2. **Reduz a navegação de topo de 7 itens para 3** (Iniciador, Início, Gerenciador de objetos).
3. **Só aí cria um menu lateral**, de 250px, com a árvore de configuração.

Ou seja: o menu lateral não é onde moram as funções do produto. É onde moram as funções **de um
módulo**, e o módulo de configuração é um lugar separado com endereço próprio.

### 1.4 Cabeçalho

- **Cabeçalho global: 50px**, fundo branco. À esquerda, o iniciador de aplicativos e o nome do app.
  No centro, a busca. À direita, em ordem: favoritos, ações globais, centro de orientação, ajuda,
  **engrenagem de Configuração**, notificações, avatar.
- Abaixo dele, a **barra de navegação de 40px** com os módulos.
- Total de cromo fixo: **90px**.

### 1.5 Densidade

- **Altura de linha de tabela: 35px** (35 de 53 linhas medidas; as de 49px são linhas de cabeçalho
  de seção).
- **Célula:** `padding: 8px`, `font-size: 13px`.
- **Cabeçalho de coluna:** `padding: 4px 8px`, `font-size: 12px`, `font-weight: 700`,
  `text-transform: uppercase`, cor `#444444`.
- **Raio:** `4px` em 48 elementos (77% dos que têm raio), `50%` em 10 (avatares), `2px` em 2,
  `8px` em 1.

---

## 2. Blip — tokens do design system público

**Não consegui medir a Blip ao vivo.** A sessão do Chrome em
`supernova.blip.ai/application/detail/supernovaprincipal/attendance/desk/monitoring` estava expirada
e caiu no login da Azure B2C. Não autentiquei: digitar senha não é coisa que eu faça. Registro a
limitação aqui em vez de fingir número.

O que dá para medir sem sessão é melhor do que uma captura de tela: **o código-fonte dos tokens**,
em `takenet/blip-ds`, `src/globals/`. É a mesma folha que pinta o Desk que a operação usa.

### 2.1 Cores (`_colors.scss` + `theme/theme-light.scss`)

A Blip organiza cor por **papel**, não por matiz. Papéis declarados:

| Grupo | Tokens | Valores no tema claro |
|---|---|---|
| Superfície | `surface-0` … `surface-4` | `#FFFFFF`, `#F6F6F6`, `#EDEDED`, `#E3E3E3`, `#141414` |
| Conteúdo | `content-default`, `-disable`, `-ghost`, `-bright`, `-din` | `#282828`, `#595959`, `#8C8C8C`, `#FFFFFF`, `#000000` |
| Borda | `border-1`, `-2`, `-3` | `rgba(0,0,0,.20)`, `rgba(0,0,0,.16)`, `rgba(0,0,0,.06)` |
| Destaque | `brand`, `primary` | `#0096FA`, `#1E6BF1` |
| Estado | `success`, `warning`, `error`, `delete` | `#84EBBC`, `#FDE99B`, `#FABEBE`, `#E60F0F` |
| Informação | `info`, `system`, `focus` | `#80E3EB`, `#B2DFFD`, `#C226FB` |

Três coisas para copiar:

1. **A escala de superfície é puramente neutra.** Cinco degraus, zero matiz. Nenhum "creme
   esverdeado" no fundo.
2. **A borda é uma tinta só — preto — em três opacidades.** Não são três cinzas diferentes. É por
   isso que a borda nunca briga com o fundo em que está: ela escurece o que estiver embaixo.
   O Pipe usa `--line` e `--line-strong` como hex opacos, e por isso a linha de grade some sobre
   fundo colorido e grita sobre fundo branco.
3. **Uma cor de destaque.** `brand` e `primary` são o mesmo azul em dois tons, não duas cores.

E uma coisa para **não** copiar sem pensar: a Blip tem uma paleta "extended" de 8 matizes
(`blue, ocean, green, yellow, orange, red, pink, gray`), cada um em tom normal e claro — 16 cores.
Ela existe para **etiqueta e gráfico**, não para o cromo da aplicação. É exatamente a paleta que, se
vazar para dentro do menu e da tabela, produz o "carrossel" que o dono reclamou. A Blip a mantém
cercada; nós deixamos a nossa solta.

### 2.2 Tipografia (`_fonts.scss`)

- **Uma família:** `'Nunito Sans', 'Carbona', 'Tahoma', 'Helvetica', 'Arial', sans-serif`.
- **Oito degraus:** 40 / 32 / 24 / 20 / 16 / 14 / 12 / 10 px (declarados em rem sobre base 16).
- **Quatro pesos:** 400 / 600 / 700 / 800.
- **Nenhum token de caixa alta e nenhuma família monoespaçada** em todo o arquivo de tipografia.

### 2.3 Navegação (levantamento do portal real, `docs/pesquisa/blip-portal-telas.md`)

**Horizontal, no topo:** Builder · Atendimento · Análise · Growth · Canais.

O menu lateral aparece **dentro** de um módulo, com os itens daquele módulo — e o próprio
levantamento descreve a tela do Builder como "barra superior secundária (abaixo do menu
Builder/Atendimento/Análise/Growth/Canais)". A hierarquia é: barra de módulos no topo → contexto do
módulo abaixo → conteúdo.

### 2.4 Sombra e elevação

Três elevações, todas construídas sobre duas tintas de sombra (`rgba(0,0,0,.04)` e
`rgba(0,0,0,.16)`):

```
$shadow-1: 0px 2px 8px -2px  rgba(0,0,0,.16)
$shadow-2: 0px 6px 16px -4px rgba(0,0,0,.16)
$shadow-3: 0px 8px 4px -4px rgba(0,0,0,.04), 0px 12px 12px -4px rgba(0,0,0,.16)
```

---

## 3. Twenty — arquitetura de tema (`twenty-ui`, MIT)

Lido em `packages/twenty-ui/src/theme/constants/`. **`twenty-ui` é MIT e pode ser adaptado**
mantendo o aviso de copyright; `twenty-front` é AGPL e não foi aberto.

Aqui o valor não é a paleta (indigo do Radix, não serve para nós) — é a **forma**.

### 3.1 O tema é um objeto TypeScript tipado

`ThemeCommon.ts`:

```ts
spacingMultiplicator: 4,
spacing: (...args: number[]) => args.map((m) => `${m * 4}px`).join(' '),
betweenSiblingsGap: '2px',
table: { horizontalCellMargin: '8px', checkboxColumnWidth: '32px', horizontalCellPadding: '8px' },
sidePanelWidth: '500px',
clickableElementBackgroundTransition: 'background 0.1s ease',
```

`spacing(2)` → `8px`; `spacing(1, 2)` → `4px 8px`. Um espaçamento fora do múltiplo de 4 fica
impossível de escrever por acidente.

### 3.2 Escalas

| Escala | Valores |
|---|---|
| Raio (`BorderCommon`) | 2 / 4 / 8 / 16 / 20 / 40 / 999 / 100% |
| Fonte (`FontCommon`) | 0.625 / 0.85 / 0.92 / 1 / 1.23 / 1.54 / 1.85 rem |
| Peso | 400 / 500 / 600 |
| Ícone (`Icon.ts`) | tamanho 14 / 16 / 20 / 24; traço 1.6 / 2 / 2.5 |
| Animação | 75 / 150 / 300 / 1500 ms |

### 3.3 Papéis semânticos, e é isso que faz o tema trocar sozinho

`BackgroundLight` / `FontLight` / `BorderLight` não guardam cor: guardam **papel apontando para um
degrau da escala cinza**.

```ts
BACKGROUND: primary=gray1, secondary=gray2, tertiary=gray4, quaternary=gray5
FONT.color: primary=gray12, secondary=gray11, tertiary=gray9, light=gray8, extraLight=gray7
BORDER.color: light=gray4, medium=gray5, strong=gray6
```

Nenhum componente conhece cor. Trocar o tema é trocar a escala, não os componentes.

### 3.4 A armadilha da régua em rem — já paga pelo dono

`C:/Users/anderson.linhares/blip-dash/app/globals.css` usa `twenty-ui` como base e documenta o
problema em comentário, com um custo que já foi pago uma vez:

> Os tokens de fonte do Twenty são `rem` (md = 1rem) e o app deles roda com `html { font-size: 13px }`
> (`twenty-front/src/index.css`). Aqui a raiz é 16px, então cada token vinha 23% maior: xxl rendia
> 29.6px em vez de 24px.

E a correção certa, também de lá:

> A correção é em px, e não mexendo no `font-size` da raiz: as classes de espaçamento também são rem
> e encolheriam junto, apertando o layout inteiro sem que ninguém tivesse pedido. Espaçamento e raio
> do Twenty já são px — só a fonte precisava ser ancorada.

**Regra que herdamos: a escala tipográfica do Pipe é declarada em px.**

O mesmo arquivo registra outra lição cara, sobre severidade:

> Escala de espera fora do acordo. Vive aqui porque é lida em dois lugares — a regra `tr[data-espera]`
> e os quadradinhos da legenda — e duas cópias de um hex sempre viram duas cores diferentes.

E o formato que ele usa é um **trio** por severidade: fundo, linha e texto
(`--bd-espera-grave: #fbe9e7 / #e8b3ad / #a3231d`). Um estado não é uma cor; é três, e as três
precisam viajar juntas.

Também de lá, a razão de a grade de tabela ser tinta translúcida e não cor sólida:

> Era `--t-border-color-light` (#dde3dd), um cinza ESVERDEADO. Sobre linha branca passava; sobre as
> linhas de espera fora do acordo — a crítica é rosa — virava uma grade verde cruzando fundo vermelho.

É a mesma conclusão a que a Blip chegou com `border-1/2/3` em alfa. Duas fontes independentes
apontando para a mesma regra é o suficiente para adotá-la.

### 3.5 O que `twenty-ui` não tem

Confirmado por inventário do pacote: existe `input/` (Button, IconButton, Checkbox, Toggle, Field,
SegmentedControl, TabButton…), `navigation/` (MenuItem e 17 variantes, NavigationBar, Link),
`feedback/` (Banner, Callout, Loader, ProgressBar, placeholders), `layout/`, `display/`, `icon/`.

**Não existe tabela, não existe board e não existe Chip/Badge genérico.** Tabela e board vivem em
`twenty-front` (AGPL, fora do alcance). A etiqueta genérica é lacuna nas três referências — é
componente que precisamos desenhar, não copiar.

---

## 4. Confronto com a leitura do dono

| # | Leitura do dono | Veredito | O número |
|---|---|---|---|
| 1 | A navegação principal dos dois é horizontal, no topo | **Confirmado** | Salesforce: barra de 40px, 7 itens, `temSidebar: false` na lista. Blip: Builder/Atendimento/Análise/Growth/Canais no topo |
| 2 | Eles usam pouca cor | **Confirmado, e é pior do que ele imagina** | Salesforce: 1 destaque, 1 cor de borda em 66% das arestas, estado em <1% da tela |
| 3 | Configuração não fica no menu de trabalho | **Confirmado, e mais radical** | Salesforce troca de **domínio**, corta a navegação de 7 para 3 itens e só então cria um lateral de 250px |
| 4 | Item que não funciona não aparece | **Confirmado** | Zero itens desabilitados nas três referências. No Pipe são **45 de 54 (83%)** |

### Onde discordo

**a) "A Gestão tem cerca de 28 itens e o CRM 17, com 11 desabilitados."** Os números reais são
piores: **Gestão 32 itens, 29 desabilitados; CRM 17 itens, 12 desabilitados; Desk 5, 4
desabilitados.** No total, **54 itens de menu, 45 desabilitados — 83%**. Um usuário que abre a
Gestão hoje vê 32 portas e consegue atravessar 3.

**b) "A monoespaçada em caixa alta é assinatura da marca."** Concordo que ela fique — mas a
justificativa que o dono dá para reduzi-la ("usada em toda linha vira barulho") subestima o
problema. **Nenhuma das três referências usa família monoespaçada em lugar nenhum da interface.**
O Salesforce usa caixa alta, sim, mas na **mesma família do corpo**, com peso 700 e 12px, e só em
cabeçalho de coluna. A conclusão que o dado suporta não é "usar menos mono"; é: **caixa alta é um
recurso de rótulo, e a monoespaçada é um recurso de número.** São dois papéis distintos que hoje
estão colados numa classe só (`.lbl`), e é a colagem que produz o ruído — não a frequência.

**c) A navegação vertical não é errada por si.** O Twenty é inteiramente vertical e não parece
sujo. A diferença é que o Twenty é um app de **um objeto** (registros) com poucas seções, e o Pipe
tem três produtos. O que quebra não é a orientação: é **empilhar módulo, relatório e configuração no
mesmo eixo, sem hierarquia.** Adotamos o topo horizontal porque temos módulos — não porque lateral
seja proibido.

**d) Uma correção ao meu próprio escopo inicial:** limpar os três CSS separadamente não resolveria.
`apps/crm/src/app/globais.css` tem as linhas 1–688 **idênticas byte a byte** a
`apps/gestao/src/app/globais.css` (o próprio cabeçalho do arquivo admite: "Copiada da Gestão sem
retoque"), e os 18 tokens de cor estão triplicados. São 48,5 KB de CSS com três cópias da mesma
verdade. A correção estrutural é `packages/ui` — que já existe no monorepo como esqueleto vazio
desde o começo.

---

## 5. O que o Pipe faz hoje, medido

Levantamento em `apps/desk`, `apps/gestao`, `apps/crm` (Next 15 App Router, React 19, CSS puro):

- **Três folhas globais, 48,5 KB somados:** `crm/globais.css` (19.453 B), `desk/globais.css`
  (16.927 B), `gestao/globais.css` (12.135 B). As linhas 1–688 do CRM são cópia literal da Gestão.
- **Quatro matizes de destaque em uso simultâneo:** moss `#4A5D23`, terracota `#C4442E`, ocre
  `#9A7420`, azul `#2E4A5D` — mais sage `#8A9A5B` e um `--online #5FA84B` que existe só em dois dos
  três apps e está *hardcoded* em `desk/trilho.tsx:13`.
- **Cada matiz tem um par `-soft`** usado como fundo de etiqueta. São 8 cores só de etiqueta.
- **Menu:** 54 itens, 45 desabilitados (83%). Marcados com `aria-disabled` + `opacity: .65` — o
  cinza que o dono leu como "inacabado".
- **Mono em caixa alta:** 6 regras CSS, 33 usos de `.lbl` mais **toda** regra `th` de Gestão e CRM.
  Ou seja: todo cabeçalho de tabela, todo rótulo de campo, todo título de grupo de menu.
- **Nove arquivos com hex literal** fora dos blocos de token.
- **`packages/ui` existe, chama-se `@pipe/ui`, e seu `index.ts` inteiro é `export {}`.** Nenhum app
  o consome. O SVG do logo está duplicado inline em três componentes.
- **Divergência já instalada:** o Desk usa `data-theme`, Gestão e CRM usam `data-tema` — e nenhum
  código em Gestão/CRM escreve esse atributo, então o alternador de tema desses dois nunca funciona.
  `--sage` e `--online` não são redefinidos no tema escuro.

---

## 6. As regras que saem daqui

1. **Uma família de fonte no corpo.** A monoespaçada é recurso de **número**, não de rótulo.
2. **Caixa alta é recurso de rótulo de seção e cabeçalho de coluna** — na família do corpo, peso
   alto, 11–12px. Nunca em nome de fase, fila, canal ou origem.
3. **Dois degraus de tamanho carregam a tela.** Um corpo (13px) e um miúdo (12px). O resto é
   exceção contada a dedo.
4. **Uma cor de destaque: moss.** Ela pinta ação primária, estado ativo e foco. Nada mais.
5. **Três cores de estado**, cada uma como **trio** fundo/linha/texto, e reservadas ao que exige
   ação. Meta na casa de 1% da tela.
6. **Borda é tinta translúcida**, não hex opaco — para não brigar com o fundo em que cair.
7. **Etiqueta de fila, canal e origem é neutra.** Cor de matiz só entra em gráfico e em severidade.
8. **Navegação de módulo no topo, horizontal. Lateral só com o contexto do módulo aberto, e curta.**
9. **Configuração atrás de engrenagem, em tela própria**, com o seu próprio lateral.
10. **Item que não funciona não aparece.**
11. **Escala tipográfica em px**, nunca rem — a lição já paga no `blip-dash`.
12. **Fonte única de token: `packages/ui`.** Nenhum app declara cor própria.

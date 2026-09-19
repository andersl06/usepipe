# Sistema visual do portal — a régua da FORMA

A estrutura, a ordem e os textos já estavam levantados (as `FICHA-*.md` em
`docs/capturas/blip/dom/`). O que faltava era a **forma**: tamanho e peso de
letra, densidade, espaçamento, raio, borda, sombra, altura de linha de tabela,
altura de campo e de botão, e **tipo de controle**.

A divisão é esta, e não é negociável:

| É deles (copiar sem desconto) | É nosso |
|---|---|
| escala tipográfica (tamanho + peso), densidade, espaçamento, raio, borda, sombra, altura de controle, **tipo de controle** | paleta (`--p-*`), ícones, marca |

Um cartão deles não pode virar um cartão nosso mais chapado. Um botão-pílula
não pode virar um `<select>`.

As fotos que provam a diferença estão em `docs/capturas/comparacao/`
(`*-original.png`, `*-nosso-antes.png`, `*-nosso-depois.png`), todas em
1280×780.

## Como estes números foram medidos

Não saíram de leitura de CSS: saíram de `getComputedStyle` na **cópia rodável**
em `http://127.0.0.1:8790`, nas telas
`/application/detail/pipeprincipal/attendance/desk/monitoring` e
`.../history`, em 1280×780, com `LOCAL=claims-todas=1 ESPERA=7000
CLIQUE="text=Ok, entendi."`. Os `docs/capturas/blip/dom/*.json` só trazem
título/altura do cabeçalho; a medida fina veio da cópia viva.

---

## 1. Superfície e fundo

| Papel | Original | O que era nosso (antes) |
|---|---|---|
| área de trabalho (atrás dos cartões) | `rgb(237,237,237)` — **cinza neutro** | `#f2f1ec` — creme/bege |
| cartão de métrica (`bds-paper`) | `rgb(246,246,246)` | `#ffffff` |
| tabela | `#ffffff` | `#ffffff` |
| lateral do módulo | `#ffffff` | creme |

O erro visível não era o nível de luz — `#ededed` e `#f2f1ec` têm quase a
mesma luminosidade —, era a **matiz**: o deles é neutro, o nosso é quente.
Lado a lado, o neutro lê como "branco" e o quente lê como "bege".

**Decisão:** na Gestão as três superfícies claras passam a ser derivadas da
nossa tinta de conteúdo contra o branco (`color-mix(in srgb,
var(--p-conteudo) N%, #fff)`), o que devolve o cinza neutro sem inventar hex e
sem tocar na paleta de marca (moss, terracota, ocre, sage continuam como
estão). O cartão continua **branco sobre cinza** — mais contraste do que o
original, que é o que o dono pediu.

## 2. Escala tipográfica (tamanho / peso / entrelinha)

| Papel | Original | Exemplo medido |
|---|---|---|
| título de página | **24 / 400 / normal** | "Monitoramento" `div 396x32` |
| título de bloco dentro de cartão | **20 / 700 / 20** | "Monitoramento detalhado" |
| título de estado vazio | **20 / 700 / 20**, `margin-bottom: 22px` | "Nenhum resultado encontrado" |
| título de cartão de métrica | **14 / 600 / 21** | "Atendimentos em tempo real" |
| número de destaque | **24 / 400 / 24** | "6", "00:16:50" |
| rótulo sob o número | **12 / 400 / 18** | "Na fila" (quebra em 2 linhas, coluna de 40px) |
| rótulo de faixa ("Filtros rápidos:") | **16 / 700 / 24** | |
| rótulo de botão | **14 / 700 / 14** | "Filas", "Filtros", "Redefinir filtros" |
| item da lateral | **14 / 600** (ativo 700), `letter-spacing: .7px` | |
| célula de tabela | **14 / 400** | |
| módulo da barra do topo | **16 / 300 / 25.6** | "Builder", "Análise" |
| legenda sob tabela | **12 / 700 / 18** | aviso do destaque amarelo |
| corpo de estado vazio | **16 / 400** | |

Cinco degraus de tamanho (12, 14, 16, 20, 24) e quatro de peso (300, 400, 600,
700) cobrem o portal inteiro. **Não há 28px em lugar nenhum** — o número de
destaque é 24/400, e o que o faz parecer grande é o peso 400 contra o rótulo
de 12px logo abaixo, não o tamanho.

## 3. Botão — o controle que mais destoava

Todo botão do portal, sem exceção medida:

```
altura            40px
raio              8px
recuo lateral     0 16px
espaço ícone↔texto 4px
rótulo            14px / 700
largura mínima    130px   (o rótulo maior estica: 135 "Redefinir filtros", 174 "Enviar por e-mail")
```

Três variantes, só de tinta:

| Variante | Borda | Fundo | Texto |
|---|---|---|---|
| secundário (padrão) | `1px solid` tinta de conteúdo | transparente | tinta de conteúdo |
| terciário / fantasma | `1px solid transparent` | transparente | tinta de conteúdo |
| primário | `1px solid transparent` | cor de marca | branco |

Medidas cruas: `button 130x40 pad 0px 16px r=8px b=1px rgb(40,40,40)` ("Filas",
"Filtros"), `button 135x40 ... b=1px rgb(74,93,35)` ("Redefinir filtros"),
`button 174x40 bg=rgb(74,93,35)` ("Enviar por e-mail"), `button 136x40 b=1px
rgba(0,0,0,0)` ("Últimos 30 dias").

**O nosso estava em 79×30, 12/500, borda a 17% e cor de texto apagada.** Era
disso que vinha a impressão de "miúdo e sem osso".

### Filtro rápido é BOTÃO, não campo

A faixa "Filtros rápidos:" é uma fila de botões secundários com **o rótulo e
nada mais** — "Filas", "Atendentes", "Contato", "Status do atendente". Sem
caixa de seleção, sem seta, sem valor dentro. O valor escolhido vive no painel
lateral "Filtros"; o botão da faixa é só o atalho.

Botão de ícone (atualizar tela, expandir tela, ações de linha): **sem borda e
sem fundo**, o glifo solto sobre a superfície.

## 4. Cartão

```
raio        16px
recuo       20px
borda       nenhuma
sombra      0 2px 8px -2px rgba(0,0,0,.16)
título→1º conteúdo   10px
```

Cartão de métrica da primeira dobra: `606x166` (o largo) e `372x166` (o
estreito), lado a lado — **166px de altura, não 200**. A altura extra do nosso
vinha das linhas de apoio de 10px que acrescentamos sob cada número; elas
continuam (são informação nossa, não enfeite), mas a coluna passa a se medir
pelo número, para nada transbordar.

As colunas de métrica **não são iguais**: cada uma tem a largura do próprio
número ("Na fila" ocupa 40px, "Tempo máximo na fila" ~100px) e o rótulo quebra
embaixo. Era daí que vinha o `302:33:2`/`53` sobreposto no nosso.

## 5. Tabela

```
moldura     bg #fff, raio 8px, borda 1px rgba(0,0,0,.06)
cabeçalho   altura 59px
linha       altura 54px
célula      14/400, padding 0 8px; primeira coluna padding-left 16px
```

A tabela mora **dentro** do cartão de 16px — moldura de 8px dentro de moldura
de 16px, e é esse duplo raio que dá a profundidade que o nosso não tinha.

Busca dentro do cabeçalho do cartão: `748x54`, raio 8, borda `1px
rgba(0,0,0,.2)` — ela **ocupa a faixa toda**, não é um campinho de 246px.

## 6. Espaçamento entre blocos

```
recuo do conteúdo       32px em cima/embaixo, ~20px nas laterais
título → faixa de filtro   ~45px (título em y=172, faixa em y=249)
faixa de filtro            altura 56px
faixa → grade de cartões   ~18px
entre cartões (coluna)     10px
entre linhas de cartões    10px
grade → 2ª faixa           ~10px
```

Cromo: barra superior 80px + barra do contato 56px = 136px; lateral do módulo
250px de largura.

---

## O que esta régua exige FORA do escopo desta rodada

Ficam registradas para a próxima, porque estas telas estão travadas
(`src/paginas/fluxo/**`, `src/paginas/cadastros/**`, `src/paginas/builder.*`):

1. **`.btn` dos cadastros e do fluxo herda a nova medida** (40px, 14/700,
   borda em tinta cheia). Nenhum arquivo daquelas pastas foi tocado, mas as
   telas mudam de aparência junto — é o efeito desejado, e só precisa de uma
   conferência por foto.
2. **Largura mínima de 130px** ficou aplicada só nas faixas que a tela deles
   tem assim (`.faixa-filtros`, `.quickfilters`, `.board-head`, `.vazio`,
   `.tblhead`). Se os cadastros tiverem faixa de filtro equivalente, ela entra
   lá também.
3. **Campo de formulário** (`input`, `select`, `textarea` fora da faixa): a
   régua deles é 40px de altura, raio 8, borda `1px rgba(0,0,0,.2)`, texto
   14/400. Os formulários de cadastro ainda não foram medidos contra isso.
4. **Modal e painel lateral** dos cadastros: não medidos nesta rodada. O
   painel "Filtros" da cópia não abre (o mock não responde a rota dos filtros
   salvos), então ele continua sem medida de referência.
5. **A tabela do "Monitoramento detalhado" transborda na horizontal** porque a
   nossa coluna "Tempo de atendimento" carrega a pastilha de SLA, que a tela
   deles não tem. Ou a pastilha vira coluna própria, ou a coluna encolhe. Não
   é forma: é decisão de conteúdo, e fica para o dono.
6. **O realce de linha da tabela.** A legenda copiada deles fala em "destaque
   amarelo" (ticket atribuído sem 1ª resposta) e a nossa tabela pinta a maior
   parte das linhas de terracota, porque quem ganha é o SLA estourado, que é
   nosso. As duas regras convivem hoje; se o amarelo deles tiver de aparecer,
   precisa de precedência declarada.

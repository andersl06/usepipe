# Design system da Blip, medido no bundle real

Extraído de `Downloads/blio`, que é o pacote compilado do Blip Desk: 29 MB, 54 arquivos, incluindo
o `blip-ds` (o design system deles, em web components Stencil) e a folha de estilo de 773 KB.

**Aviso de uso.** Nada aqui é código copiado, e nada de lá entra no Pipe. Valor de cor, escala de
tamanho e nome de token são fato, não expressão criativa. O que se aproveita é o **método**: quantos
degraus a escala tem, onde a cor de destaque aparece, como os papéis são nomeados. A paleta do Pipe
continua sendo a moss do `docs/marca/MARCA.md`.

## 1. Cores, e a lição principal

Trinta e um tokens de cor na aplicação inteira. Organizados por **papel**, nunca por matiz.

### Superfície, cinco degraus e nada mais
```
--color-surface-0   #ffffff    fundo de cartão
--color-surface-1   #f6f6f6    fundo da aplicação
--color-surface-2   #ededed / #e0e0e0
--color-surface-3   #e3e3e3 / #cfcfcf
--color-surface-4   #141414    superfície escura
```

### Conteúdo, quatro degraus
```
--color-content-default    #282828 / #454545
--color-content-disable    #595959 / #636363
--color-content-ghost      #8c8c8c
--color-content-bright     #ffffff
```

### Uma cor de marca, e uma só
```
--color-primary  #1e6bf1   (azul)
--color-secondary #292929  (que é quase preto, não uma segunda cor)
```

### Estado, com par claro e escuro
```
--color-error     #f99f9f / #fabebe    fundo claro
--color-delete    #e60f0f              ação destrutiva
--color-warning   #fde99b
--color-success   #84ebbc
--color-positive  #10603b              texto sobre o sucesso
--color-info      #80e3eb
--color-system    #b2dffd
```

### E a paleta estendida, que quase não aparece
```
--color-extended-blue #1968f0 · green #35de90 · orange #f06305 · red #e60f0f · yellow #fbcf23
```

**A lição.** O fundo é branco e cinza. O texto é preto e cinza. A cor forte é **uma**, e ela pinta
ação primária e estado ativo. Cor de estado é pastel de fundo com texto escuro por cima, nunca cor
saturada em texto corrido. A paleta estendida existe para gráfico e ilustração, não para interface.

É exatamente o oposto do que fizemos: nós espalhamos verde, terracota, ocre e azul em etiqueta,
número, borda e barra ao mesmo tempo.

## 2. Tipografia

Uma família só: **Nunito Sans**, com Tahoma, Helvetica e Arial de reserva. A `Carbona` aparece em
seis regras, só em peça de marca.

Três tamanhos concentram quase todo o uso:
```
16px   37 ocorrências    corpo
14px   36 ocorrências    corpo denso, tabela
12px   36 ocorrências    rótulo, apoio
10px    8 ocorrências    o menor que existe
```

Não há monoespaçada na interface. Ela aparece em duas regras, para código.

**A lição.** Três degraus resolvem uma aplicação inteira. Nós temos mais degraus que isso e ainda
usamos monoespaçada em caixa alta em toda linha, o que dobra o ruído.

## 3. Raio

```
8px    48 ocorrências    o padrão, cartão e caixa
5px    26 ocorrências    controle pequeno
13px   22 ocorrências    pílula e avatar
2px    16 ocorrências    detalhe
9999px  4 ocorrências    círculo
```

Um raio domina, e os outros são exceção com propósito.

## 4. Os componentes que eles empacotam

Do `blip-ds`, pelos nomes dos pacotes: `bds-alert` (com header, body e actions separados),
`bds-avatar`, `bds-badge`, `bds-button-icon`, `bds-card`, `bds-checkbox`, `bds-chip-clickable`,
`bds-illustration`, `bds-input-editable`.

Vale reparar em dois:
- **`bds-chip-clickable`** — a etiqueta é componente de primeira classe e tem versão clicável. É a
  lacuna que a nossa pesquisa já tinha apontado no Chatwoot e no Twenty, e que o `packages/ui`
  precisa resolver.
- **`bds-illustration`** — ilustração é componente, não imagem solta. É como eles preenchem estado
  vazio sem depender de foto.

## 5. Variáveis de layout com nome de papel

```
--sidenav-header-min-height: 111px / 117px / 82px
```

Muda por faixa de tela e por contexto, mas é um token nomeado, não número solto no CSS. É o mesmo
princípio que o `blip-dash` documenta para severidade: valor que aparece em dois lugares vira token,
senão vira duas cores diferentes.

## 6. O que aplicar no `packages/ui`

1. **Cortar a paleta para o formato deles**: cinco superfícies, quatro degraus de conteúdo, **uma**
   cor de marca, e estado como par de fundo pastel com texto escuro. A paleta estendida fica
   reservada para gráfico.
2. **Três degraus de texto** no corpo da aplicação: 16, 14 e 12. O de 10 só para o que é
   verdadeiramente secundário.
3. **Um raio padrão** e duas exceções com propósito.
4. **Etiqueta como componente de primeira classe**, com variante clicável.
5. **Ilustração como componente** para estado vazio.
6. Tirar a monoespaçada da interface corrente. Ela fica em número tabular e rótulo de seção, que é
   onde a marca do Pipe realmente pede.

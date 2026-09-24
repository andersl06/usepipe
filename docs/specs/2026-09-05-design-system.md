# Design system do Pipe

> Fonte única de token, primitivo e estrutura para `apps/desk`, `apps/gestao` e `apps/crm`.
> Implementado em `packages/ui` (`@pipe/ui`).
>
> Autoridade da identidade: `docs/marca/MARCA.md`.
> Números que justificam cada decisão: `referencias-blip/pesquisa/blip-design-system.md` (medição do bundle
> real do Blip Desk) e `referencias-blip/pesquisa/visual-blip-salesforce.md`.
> Arquitetura de tema: `referencias-blip/pesquisa/sistema-visual.md`.
>
> **Segunda versão.** A primeira foi escrita antes de medirmos o bundle da Blip, e errava na
> quantidade: espalhava quatro matizes de destaque pela interface. A seção 6 tem a tabela de
> renomeação.

---

## 1. Por que existe

O dono reprovou o visual dos três aplicativos: "está muito sujo, unifica tanta informação que acaba
se tornando ruim", "você está carregando todas as funções na aba à esquerda e usa tantas cores que
fica parecendo um carrossel", "dessa forma parece que foi construído por IA".

A causa não era falta de capricho em cada tela. Era estrutural, e mensurável:

- **48,5 KB de CSS em três cópias.** `apps/crm/src/app/globais.css` tinha as linhas 1–688 idênticas
  byte a byte às de `apps/gestao`; o próprio cabeçalho do arquivo admitia "Copiada da Gestão sem
  retoque". Os 18 tokens de cor estavam triplicados.
- **Os tokens já tinham divergido.** `--online` existia em dois dos três apps e estava *hardcoded*
  em `desk/trilho.tsx:13`. `--sage` e `--online` não eram redefinidos no tema escuro. O Desk usava
  `data-theme`, Gestão e CRM usavam `data-tema` — e nada em Gestão/CRM escrevia esse atributo, então
  o alternador de tema desses dois nunca funcionou.
- **54 itens de menu, 45 desabilitados (83%).**
- **`packages/ui` existia desde o primeiro commit como `export {}`.**

Limpar três folhas separadamente teria adiado o problema por uma semana.

---

## 2. O que veio de cada fonte, e por quê

### Da Blip

Fonte: `referencias-blip/pesquisa/blip-design-system.md`, que mediu o bundle compilado do Blip Desk (29 MB,
folha de estilo de 773 KB). Nada de lá foi copiado como código. Valor de cor, contagem de degrau e
nome de papel são fato, não expressão criativa; o que se aproveita é o **método**.

**A contagem, que é a lição inteira.** Trinta e um tokens de cor na aplicação toda, organizados por
papel e nunca por matiz. Cinco superfícies, quatro degraus de conteúdo, **uma** cor de marca, e
estado como par de fundo pastel com texto escuro. Era o oposto do que tínhamos feito: verde,
terracota, ocre e azul espalhados ao mesmo tempo em etiqueta, número, borda e barra.

**A escala de superfície puramente neutra.** Cinco degraus sem matiz (`#FFFFFF`, `#F6F6F6`,
`#EDEDED`, `#E3E3E3`, `#141414`), na ordem `surface-0..4`. Adotamos a estrutura e a ordem, não os
valores: o creme da marca é o degrau 1, o fundo da aplicação, e o cartão é branco, para que a cor
que aparecer em cima seja lida como informação.

**Quatro degraus de conteúdo, com os nomes deles**: padrão, desabilitado, fantasma, claro
(`default` / `disable` / `ghost` / `bright`). Quatro chegam; mais do que isso não se distingue em
texto de 14px.

**Uma cor de marca, e uma só.** O `--color-primary` deles é um azul, e o `--color-secondary` é um
quase-preto — ou seja, não é uma segunda cor. A moss ocupa exatamente esse lugar no Pipe.

**Borda como tinta translúcida.** A Blip usa preto em três opacidades (`.20` / `.16` / `.06`), não
três cinzas. Uma borda translúcida escurece o que estiver embaixo e nunca briga com o fundo em que
cai. Copiado direto.

**A cerca em volta da paleta larga.** A `extended` deles (azul, verde, laranja, vermelho, amarelo)
existe para gráfico e ilustração, e quase não aparece na tela. Era exatamente a nossa paleta solta.
Adotamos a cerca inteira: terracota, ocre, azul profundo e sage mudaram de nome para
`--p-grafico-1..5` e saíram da interface corrente.

**A régua tipográfica de três degraus.** 16, 14 e 12 concentram 109 das 117 ocorrências medidas; o
de 10 aparece 8 vezes. Uma família só (Nunito Sans neles, IBM Plex Sans aqui), e **nenhuma
monoespaçada na interface** — ela aparece em duas regras, para código.

**Um raio que domina.** 8px em 48 ocorrências, 5px em 26 (controle pequeno), pílula em 22
(avatar). Os outros são exceção com propósito. Adotamos os três.

**Dois componentes que a nossa pesquisa já sentia falta**, e que eles empacotam:
`bds-chip-clickable` (etiqueta como componente de primeira classe, com versão clicável) e
`bds-illustration` (ilustração é componente, não imagem solta — é como se preenche estado vazio sem
depender de foto).

**Variável de layout com nome de papel**, não número solto no CSS (`--sidenav-header-min-height`).
Mesmo princípio que o `blip-dash` já documentava: valor que aparece em dois lugares vira token,
senão vira dois valores diferentes.

**O que não veio:** os valores de cor. Azul não é a nossa marca. E não veio a ausência total de
monoespaçada — ver a seção 3.6.

### Do Salesforce

**A prova de que pouca cor é o normal, não o mínimo.** Na tela mais densa medida (607 elementos):
uma família de fonte, dois tamanhos cobrindo 98% do texto, dois pesos cobrindo 99%, uma cor de borda
em 66% das arestas, raio de 4px em 77%. A cor de destaque aparece só em link e item ativo. Estado
ocupa menos de 1% da tela.

**A régua de densidade.** Linha de tabela 35px, célula `padding: 8px`, corpo 13px, cabeçalho de
coluna `4px 8px`. Adotamos 34px de linha e o resto igual.

**Caixa alta sem monoespaçada.** O cabeçalho de coluna do Salesforce é 12px/700 caixa alta **na
mesma família do corpo**. Foi o que resolveu o nosso problema de "mono demais": o ruído não vinha da
frequência da mono, vinha de ela estar colada com a caixa alta numa classe só.

**A estrutura de navegação.** Horizontal no topo, 7 itens, e `temSidebar: false` na tela de lista.

**Configuração em tela própria, e mais radical do que supúnhamos:** troca de domínio, corta a
navegação de topo de 7 itens para 3, e só então cria uma lateral de 250px.

### Do Twenty (`twenty-ui`, MIT)

**A forma do tema**, não os valores. Tema como objeto TypeScript tipado, `espaco()` como função de
múltiplo de 4px, escala de raio, tokens de componente centralizados, papéis semânticos apontando
para degraus de uma escala cinza (`background.primary = gray1`), fachada de ícone sobre o Tabler.

**As duas lições já pagas em `blip-dash/app/globals.css`**, que usa o `twenty-ui` como base e
documenta o preço em comentário:

1. **Escala tipográfica em px, nunca rem.** Os tokens do Twenty são rem e o app deles roda com
   `html { font-size: 13px }`. Numa raiz de 16px cada token vem 23% maior. E a correção é em px, não
   ancorando a raiz: espaçamento também é rem e encolheria junto, apertando o layout inteiro sem que
   ninguém tivesse pedido.
2. **Severidade é um trio fundo/linha/texto num token só.** "Duas cópias de um hex sempre viram duas
   cores diferentes."

**O que não veio:** a paleta (indigo do Radix), a grade cinza em `color(display-p3 …)`, e tabela e
board — que vivem em `twenty-front`, AGPL, fora do nosso alcance. `twenty-ui` também não tem
Chip/Badge genérico. Tabela e Etiqueta foram desenhadas, não copiadas.

**Arquivo com código adaptado carrega o aviso no topo**, como manda a MIT. Hoje é
`packages/ui/src/tema.ts`.

---

## 3. As decisões que valem para sempre

### 3.1 Onde cada cor pode e não pode ser usada

| Cor | Pode | Não pode |
|---|---|---|
| **Marca — moss** (`--p-marca`) | Ação primária, estado ativo de navegação, anel de foco, borda de campo em foco, etiqueta clicável ligada | Rótulo de seção, número, título, barra de gráfico, ilustração, etiqueta de fila/canal/origem/fase, ícone decorativo |
| **Erro** (`--p-erro-*`) | Falha, SLA estourado, algo que exige ação imediata | Qualquer coisa que a pessoa não possa resolver clicando |
| **Alerta** (`--p-alerta-*`) | Número ou linha que pede atenção agora (SLA perto de estourar, fila crescendo) | Categoria, prioridade "média" fixa, decoração |
| **Sucesso** (`--p-sucesso-*`) | Estado que confirma algo concluído e não pede ação | Marcar "normal". O normal é neutro |
| **Informação** (`--p-info-*`) | Aviso do sistema, dica contextual, o que explica sem cobrar | Categoria, etiqueta de origem, decoração |
| **Paleta estendida** (`--p-grafico-1..5`) | Série de gráfico, preenchimento de barra, acento de ilustração | Cromo, texto, borda, etiqueta, ícone, fundo de linha. **Nada de interface** |
| **Neutros** (superfície e conteúdo) | Todo o resto — e "todo o resto" é a maior parte da tela | — |

**A regra de ouro:** cor é para o que exige ação. Se a pessoa não pode fazer nada a respeito, é
neutro. Meta de ocupação de cor de estado numa tela: cerca de 1%, que é o que o Salesforce pratica.

**Uma cor de marca, e uma só.** É a decisão mais importante deste documento, e a que corrige o
diagnóstico do dono. A moss pinta ação primária e estado ativo. Nada mais. Um segundo matiz de
destaque na mesma tela é o começo do carrossel.

**A paleta estendida é cercada.** Terracota, ocre, azul profundo e sage não morrem — mudam de
endereço. Vivem em `--p-grafico-*`, saem do cromo e passam a existir só onde uma série precisa se
distinguir de outra: gráfico e ilustração. `verificar-tokens.mjs` falha se uma delas reaparecer no
cromo.

**Consequência direta**, e é o fim do "carrossel": etiqueta de fila, canal, origem e fase de funil é
**neutra**. Eram oito cores só de etiqueta (quatro matizes × um par `-soft`).

**Estado é um par, com a linha que o une.** Fundo pastel com conteúdo escuro por cima, nunca cor
saturada em texto corrido. As três variáveis (`-fundo`, `-linha`, `-conteudo`) viajam juntas: nunca
use só `--p-erro-conteudo`. Duas cópias de um hex sempre viram duas cores diferentes.

### 3.2 Quando é topo e quando é lateral

- **Topo, horizontal: os módulos.** Poucos, e todos funcionando.
- **Lateral: só o contexto do módulo aberto**, e curta. `LateralContexto` devolve nulo com menos de
  dois itens, porque lateral com um item só é moldura sem função.
- **Nunca empilhe módulo, relatório e configuração no mesmo eixo.** Foi isso que quebrou, não a
  orientação em si: o Twenty é inteiramente vertical e não parece sujo, porque é um app de um objeto
  só. Nós temos três produtos.

### 3.3 O que vai para configurações

Vai para trás da engrenagem tudo que **se configura uma vez e se usa o ano inteiro**: regra, campo
personalizado, importação, deduplicação, integração, permissão, preferência.

Fica no menu de trabalho o que **se abre todo dia**: os objetos e as telas de leitura.

A área de configurações tem rota própria, lateral própria e um caminho de volta explícito. Não tem
navegação de módulo: quem está configurando não está trabalhando.

### 3.4 Item que não funciona não aparece

Nenhuma das três referências mostra um único item desabilitado. `ItemDeNavegacao` do `@pipe/ui`
**não tem campo `desabilitado`** — não é esquecimento, é o que impede a Gestão de voltar a ter 32
itens com 29 apagados.

A exceção combinada: **dentro da área de configurações** é aceitável listar o que ainda não existe,
porque quem entra ali está explorando o mapa do produto. Mesmo assim, hoje só listamos o que abre.

### 3.5 Relatório não é item de menu

Volume, conversão, por proprietário, por origem e por campanha são a mesma lista dobrada por uma
coluna. Viram **agrupamento e filtro salvos na própria lista**. Um relatório só vira tela quando lê
a operação por um eixo que a lista não tem (é o caso de "Esforço por atendente").

### 3.6 Régua tipográfica

| Papel | Token | Valor |
|---|---|---|
| Família do corpo | `--p-fonte` | uma só, IBM Plex Sans |
| Corpo destacado, título de cartão | `--p-t-lg` | **16px** |
| Corpo, tabela, campo, botão | `--p-t-md` | **14px** |
| Rótulo, apoio, etiqueta | `--p-t-sm` | **12px** |
| Verdadeiramente secundário | `--p-t-xs` | 10px |
| Título de tela | `--p-t-titulo` | 20px |
| Número de destaque | `--p-t-numero` | 28px, monoespaçada tabular |
| Pesos | — | 400 / 500 / 600 |

**Três degraus carregam a aplicação inteira: 16, 14 e 12.** É a régua medida na Blip, onde os três
somam 109 das 117 ocorrências. O de 10 serve só ao que é verdadeiramente secundário. `titulo` e
`numero` são nomeados pelo **papel**, não pelo tamanho, de propósito: assim continuam sendo duas
exceções contadas a dedo e não viram dois degraus a mais na régua.

A escala é declarada **em px**, nunca em rem. Ver 2/Twenty, lição 1.

#### A regra da monoespaçada

A IBM Plex Mono em caixa alta é **assinatura da marca** do Pipe (`docs/marca/MARCA.md`). A Blip não
usa monoespaçada nenhuma na interface, e o Salesforce também não. Nós usamos — mas em dois lugares,
e só dois. Fora deles ela não existe.

| | |
|---|---|
| **Pode** | Número tabular (`.num`, `.mono`): métrica, valor, contagem, ID, horário, percentual. É o motivo de ela existir — tabular alinha coluna. |
| **Pode** | Rótulo de seção (`.lbl`): o título miúdo em caixa alta que abre um grupo. São poucos por tela. |
| **Não pode** | Nome de fase, de fila, de canal, de origem, de campo, de pessoa. Isso é texto corrente, na família do corpo. |
| **Não pode** | Cabeçalho de coluna (`th`). Caixa alta sim, mono não. |

**Por que o cabeçalho de coluna ficou de fora**, mesmo sendo parente do rótulo de seção: são muitos
por tela. Uma tabela de nove colunas põe nove rótulos monoespaçados em caixa alta na mesma linha, e
foi exatamente esse acúmulo que o dono leu como ruído. Rótulo de seção aparece duas ou três vezes
por tela; cabeçalho de coluna aparece dez. A regra segue a contagem, não o parentesco. O `th` é
caixa alta 12px/600 na família do corpo, que é o que o Salesforce faz.

**Caixa alta e monoespaçada são dois recursos, não um.** Foi tê-los colados numa classe só que
produziu o ruído da primeira versão: `.lbl` fazia os dois papéis ao mesmo tempo, em toda linha.
Separados, cada um pode ser usado à vontade no seu lugar.

### 3.7 Densidade

| Medida | Token | Valor |
|---|---|---|
| Altura do cabeçalho | `--p-altura-topo` | 48px |
| Linha de tabela | `--p-altura-linha-tabela` | **36px** |
| Cabeçalho de coluna | — | 32px |
| Célula | `--p-celula-y` / `-x` | `8px 12px` |
| Espaçamento | `--p-e-1..10` | múltiplos de 4px (`espaco(n)`) |
| Raio padrão | `--p-r-md` | **8px** — cartão, caixa, botão, campo, tabela |
| Raio de controle pequeno | `--p-r-sm` | 5px — botão de ícone, caixa de seleção |
| Pílula | `--p-r-pilula` | 999px — avatar e etiqueta redonda |
| Lateral contextual | `--p-largura-lateral` | 200px (232px em configurações) |
| Ícone | `--p-icone-sm/md/lg` | 14 / 16 / 20px, traço 1,75 |
| Sombra | `--p-sombra-1/2` | duas elevações, tinta translúcida |
| Transição | `--p-dur-*` | 75 / 150 / 300ms |

**Três raios, e os dois últimos são exceção com propósito.** Na Blip o de 8px aparece 48 vezes, o de
5px 26 e a pílula 22 — um domina e os outros têm papel definido. O raio de 2px e o de 10px da
primeira versão não tinham papel: eram degraus a mais.

**A linha de tabela subiu de 34px para 36px** porque o corpo subiu de 13px para 14px. 14 × 1,4 de
entrelinha mais 8px de folga em cima e embaixo fecha em 36. Densidade não é apertar: é a folga
mínima que ainda deixa a linha respirar.

### 3.8 Hierarquia: cada tela tem uma coisa principal

- **Painel do CRM:** o funil. Os indicadores viram uma linha de legenda acima dele, sem caixa.
- **Monitoramento da Gestão:** o bloco de tempo real. O que fechou hoje vem depois, separado.
- **Desk:** a conversa aberta.

Oito blocos com o mesmo peso visual não têm hierarquia nenhuma, e foi essa a leitura de "unifica
tanta informação que acaba se tornando ruim".

---

## 4. O que `packages/ui` entrega

```
packages/ui/
  verificar-tokens.mjs     a verificação (npm test -w @pipe/ui)
  src/
    estilos.css            ponto único de entrada
    estilos/tokens.css     cor, tipografia, espaço, raio, sombra, duração, densidade
                           (tema claro e escuro; nenhum app declara tema)
    estilos/base.css       reset e as classes compartilhadas pelos três
    tema.ts                espelho tipado + espaco()   [adaptado de twenty-ui, MIT]
    icones.tsx             fachada sobre os desenhos do Tabler (MIT) + Simbolo da marca
    ilustracoes.tsx        Ilustracao — cenas de estado vazio em SVG
    componentes/
      estrutura.tsx        Cabecalho, NavModulos, LateralContexto, Aplicacao,
                           AreaConfiguracoes, Marca
      primitivos.tsx       Botao, BotaoDeIcone, Etiqueta, Campo, Seletor, Abas,
                           EstadoVazio, Carregando, Avatar, Cartao
      tabela.tsx           Tabela
```

### Os dois primitivos que faltavam

**`Etiqueta`, componente de primeira classe e o único do produto.** Nem Chatwoot nem `twenty-ui`
têm um genérico, e é por isso que cada tela reimplementa o seu e o conjunto fica inconsistente. A
Blip empacota `bds-chip-clickable` justamente para não cair nisso. No Pipe é um só, e ele serve os
quatro usos: **etiqueta de fila**, **faixa de score**, **status de SLA** e **conceito de
avaliação**.

```tsx
<Etiqueta>Suporte fiscal</Etiqueta>                      {/* fila: neutra */}
<Etiqueta tom="erro">SLA estourado</Etiqueta>            {/* estado: par pastel */}
<Etiqueta redonda>12</Etiqueta>                          {/* contagem */}
<Etiqueta aoClicar={alternar} ativa={ligado}>Meus</Etiqueta>  {/* recorte de lista */}
```

Nasce **neutra**: sem `tom`, não tem cor. Com `aoClicar` vira `<button>` de verdade, com teclado,
foco e `aria-pressed`. O estado ligado é o único lugar de toda a interface em que a cor de marca
toca uma etiqueta — e toca porque ali a etiqueta virou ação.

**`Ilustracao`, para estado vazio.** Quatro cenas: `vazio` (a lista nunca teve nada), `busca` (o
filtro não achou), `concluido` (a fila zerou, o único vazio que é boa notícia) e `erro` (não
carregou). Desenhadas em SVG na linguagem do símbolo da marca: monoline, traço uniforme, pontas
arredondadas, e o vão entre as peças fazendo parte do desenho. Duas cores por cena — o traço herda
`currentColor` e o acento vem da paleta estendida, que junto com o gráfico é o único lugar onde ela
pode aparecer.

Sem foto, de propósito: foto num produto de operação envelhece, pesa, e não responde ao tema
escuro. `EstadoVazio` já renderiza a cena sozinho; dentro de tabela, passe `ilustracao={false}`.

**Consumido como fonte**, via `transpilePackages: ['@pipe/ui']`. Sem passo de build: não há `dist`
para ficar velho.

**Sem dependência de `next`.** Os componentes são React puro; o caminho atual chega por prop e o
componente de link do aplicativo é injetado por `Link`. É o que permite testar sem roteador — e o
que mantém a navegação no cliente, sem recarregar a página.

**Modal e Menu não entraram.** O `<dialog>` nativo já é estilizado pela base e o Desk usa; um
dropdown genérico não é usado por nenhum dos três hoje. Entram quando houver o segundo consumidor.

---

## 5. Onde discordei do pedido, e por quê

**Engrenagem na Gestão.** Foi pedida, com Regras, Operação, Dados e Conta dentro. Esses quatro
grupos somam 20 itens e **nenhum tem tela**. Uma engrenagem que abre uma página com 20 links mortos
é o mesmo problema mudado de lugar, e contradiz a regra 3.4. A Gestão fica sem engrenagem até a
primeira tela de configuração existir. Se a preferência for mostrar o mapa mesmo vazio, é uma linha
de mudança — mas é uma decisão contra o que as três referências fazem.

**"Reduza a mono."** O diagnóstico estava certo, a causa não. O problema não era a frequência: era
`.lbl` misturar dois papéis (caixa alta de rótulo + monoespaçada de número) numa classe só.
Separados, cada um pode ser usado no seu lugar. Ver 3.6.

### Onde discordei da Blip, e por quê

**Mantivemos a monoespaçada, que eles não têm.** A medição foi clara: nenhuma monoespaçada na
interface do Blip Desk, duas regras só para código. Mesmo assim ela fica, em número tabular e em
rótulo de seção, porque é assinatura da marca do Pipe e porque tabular resolve um problema real de
alinhamento de coluna que a Blip resolve de outro jeito. O que copiamos é a **contenção**: dois
papéis, contados, e fora deles ela não existe. Se a régua voltar a inchar, o primeiro corte é esse.

**Quatro estados, não sete.** A Blip tem `error`, `delete`, `warning`, `success`, `positive`, `info`
e `system`. Metade disso é distinção que o Pipe não faz hoje: `delete` é o nosso erro em botão,
`positive` é o texto do nosso sucesso, e `system` e `info` são a mesma coisa. Sete tokens para
quatro conceitos é como duas cópias de um hex viram duas cores diferentes.

**Cinco cores de gráfico, não dezesseis.** A `extended` deles tem 16. Cinco séries é o que os nossos
gráficos realmente usam, e uma paleta maior do que o uso é um convite a usá-la fora do gráfico —
que é o erro que este documento existe para corrigir.

**O fundo da aplicação é creme, não cinza.** É o único ponto em que a identidade do Pipe ganha da
estrutura da Blip. O creme `#F2F1EC` é da marca; o cartão continua branco, para que o degrau entre
os dois continue legível.

---

## 6. Tabela de renomeação (primeira versão → esta)

Os nomes antigos continuam funcionando através da **ponte de migração** no fim de
`packages/ui/src/estilos/tokens.css`. Ela existe só enquanto os três aplicativos migram. Apague o
bloco quando `grep -r -- '--p-tinta\|--p-fundo\|--p-destaque\|--p-dado' apps/` não devolver nada.

| Antes | Agora |
|---|---|
| `--p-fundo` | `--p-superficie-1` |
| `--p-superficie` | `--p-superficie-0` |
| `--p-superficie-inversa` | `--p-superficie-4` |
| `--p-tinta` | `--p-conteudo` |
| `--p-tinta-2` | `--p-conteudo-desabilitado` |
| `--p-tinta-3` | `--p-conteudo-fantasma` |
| `--p-tinta-inversa` | `--p-marca-conteudo` (sobre a marca) ou `--p-conteudo-claro` (sobre a superfície 4) |
| `--p-destaque` | `--p-marca` |
| `--p-destaque-tinta` | `--p-marca-forte` |
| `--p-destaque-fundo` | `--p-marca-suave` |
| `--p-destaque-linha` | `--p-marca-linha` |
| `--p-erro-tinta` · `--p-alerta-tinta` · `--p-sucesso-tinta` | `--p-*-conteudo` |
| `--p-dado` | `--p-grafico-1` |
| `--p-dado-trilho` | `--p-grafico-trilho` |
| `--p-t-xl` | `--p-t-titulo` |
| `--p-t-2xl` | `--p-t-numero` |
| `--p-r-xs` · `--p-r-lg` | deixaram de existir (ver 3.7) |
| `TEMA.cor.*` | `TEMA.superficie.*` · `TEMA.conteudo.*` · `TEMA.marca.*` · `TEMA.grafico.*` |
| `TEMA.estado.X.tinta` | `TEMA.estado.X.conteudo` |
| `<Etiqueta tom="ok">` | `<Etiqueta tom="sucesso">` |

Novos, sem equivalente anterior: `--p-info-*` (o quarto estado), `--p-grafico-2..5` (a paleta
estendida cercada), `--p-marca-conteudo`, `--p-t-xs` passa a valer 10px.

---

## 7. A verificação

`npm test -w @pipe/ui` roda `verificar-tokens.mjs`. Sem framework: é uma checagem só, e ela existe
porque o modo de falhar deste pacote é sempre o mesmo. Na primeira versão, `--sage` e `--online`
não eram redefinidos no tema escuro e ninguém percebeu.

O que ela trava:

1. Todo `var(--p-*)` usado tem definição.
2. Toda cor do tema claro é redefinida nos **dois** blocos de tema escuro — sem isso o alternador
   funciona só num sentido, que foi o defeito da Gestão e do CRM.
3. As regras contáveis: cinco superfícies, quatro degraus de conteúdo, quatro estados com três
   variáveis cada, três raios, quatro degraus de texto.
4. **A cerca da paleta estendida**: nenhum `--p-grafico-*` aparece fora da barra de dado e da
   ilustração. É o teste que pega o carrossel antes de ele chegar na tela.

**Navegação vertical não é errada por si.** O Twenty é todo vertical e não parece sujo. Fomos para o
topo porque temos módulos, não porque lateral seja proibido.

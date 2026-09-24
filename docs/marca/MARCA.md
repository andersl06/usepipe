# Pipe — identidade

## Símbolo
Dois cotovelos de tubulação monoline que se encaixam sem se tocar: um traço preto que sobe e
vira à direita, e um traço moss que desce e volta à esquerda. Traço uniforme (12 em grade de 120),
pontas e curvas arredondadas. O vão entre os dois é parte do desenho — nunca fechar.

Lockup oficial: **símbolo + wordmark** (variante 1b do estudo original).
O ponto do "i" é um círculo moss — é a única cor no wordmark.

Arquivos em `packages/ui/assets/`:
- `pipe-lockup.svg` — uso padrão, duas cores
- `pipe-symbol.svg` — app icon, favicon, avatar
- `pipe-lockup-mono.svg` / `pipe-symbol-mono.svg` — herdam `currentColor`, para fundo escuro,
  gravação, uma cor só

Área de respiro: metade da altura do símbolo em toda a volta.
Tamanho mínimo do lockup: 120px de largura. Abaixo disso, só o símbolo.

## Cores

**Cores de interface** — é com estas que a tela é construída.

| Papel | Hex | Uso |
|---|---|---|
| Moss (primária) | `#4A5D23` | **a única cor de marca**: ação primária e estado ativo |
| Tinta | `#111111` | texto, traço do símbolo |
| Creme | `#F2F1EC` | fundo de aplicação |
| Borda | `#E2E0D8` | divisórias, contorno de card — na interface, aplicada como tinta translúcida |
| Cinza texto | `#55544D` `#5F5E57` `#6B6A62` | hierarquia de texto secundário |
| Branco | `#FFFFFF` | superfície de card |

**Cores de estado** — sempre como par de fundo pastel com texto escuro, nunca saturadas em texto
corrido, e só no que exige ação.

| Papel | Hex do texto | Uso |
|---|---|---|
| Terracota | `#C4442E` | erro, SLA estourado, ofensor |
| Ocre | `#C08A2E` | alerta, o que pede atenção agora |
| Verde escuro | `#1F3A2E` | sucesso, meta batida |
| Azul profundo | `#2E4A5D` | informação, aviso do sistema |

**Paleta estendida** — sage `#8A9A5B` e os quatro matizes de estado usados fora do papel de estado.
Vive em `--p-grafico-1..5` e **só aparece em gráfico e ilustração**. Não é cor de interface.

Regra: moss não vira cor de alerta. Vermelho é só terracota, e só para o que exige ação.

## Tipografia
- Texto e títulos: **IBM Plex Sans** (system stack com Helvetica/Arial de reserva). Uma família só
  no corpo.
- Números, IDs, métricas e rótulo de seção: **IBM Plex Mono**, caixa alta no rótulo,
  `letter-spacing` 0.06em, 12px — é a assinatura visual do produto, herdada do estudo da marca.

Em peça de marca a monoespaçada é livre. **Na interface ela é contada**: número tabular e rótulo de
seção, e nada além disso. Ver "Regras de interface" abaixo.

---

## Regras de interface

Esta seção existe porque a paleta acima, sozinha, permitiu o erro: quatro matizes de destaque na
mesma tela, etiqueta colorida por categoria, e a monoespaçada em caixa alta em toda linha. A tabela
de cores diz o que cada cor **é**; esta seção diz onde cada uma **pode** e **não pode** aparecer.

Medições que sustentam cada regra: `referencias-blip/pesquisa/blip-design-system.md` (o bundle real do Blip
Desk: 31 tokens de cor na aplicação inteira) e `referencias-blip/pesquisa/visual-blip-salesforce.md`.
Implementação e detalhamento: `packages/ui` (`@pipe/ui`) e
`docs/specs/2026-09-05-design-system.md`. `@pipe/ui` é a fonte única de token — nenhum aplicativo
declara cor própria.

### A regra da quantidade

A Blip tem **uma** cor de marca na aplicação inteira. Nós tínhamos quatro matizes competindo em
etiqueta, número, borda e barra ao mesmo tempo. Era isso o "carrossel".

**A paleta acima está dividida em dois grupos, e eles não se misturam:**

- **Cores de interface** — moss, tinta, creme, borda, cinzas, e os quatro estados. É com elas que a
  tela é construída.
- **Paleta estendida** — terracota, ocre, azul profundo, sage e verde escuro fora do papel de
  estado. Vivem em `--p-grafico-1..5` e **só podem aparecer em gráfico e ilustração**. Não são cor
  de interface.

### Onde cada cor pode entrar

| Cor | Pode | Não pode |
|---|---|---|
| **Moss** (a única cor de marca) | Ação primária, estado ativo de navegação, anel de foco, borda de campo em foco, etiqueta clicável ligada | Rótulo de seção, número, título, barra de gráfico, ilustração, etiqueta de fila/canal/origem/fase, ícone decorativo |
| **Terracota** (erro) | Falha, SLA estourado, o que exige ação imediata | Qualquer coisa que a pessoa não resolva clicando |
| **Ocre** (alerta) | Número ou linha que pede atenção agora | Categoria, prioridade fixa, decoração |
| **Verde escuro** (sucesso) | Estado concluído que não pede ação | Marcar o que é apenas normal |
| **Azul profundo** (informação) | Aviso do sistema, dica contextual | Etiqueta de categoria, número, borda, barra |
| **Paleta estendida** (`--p-grafico-*`) | Série de gráfico, preenchimento de barra, acento de ilustração | Cromo, texto, borda, etiqueta, ícone. **Nada de interface** |
| **Neutros** | Todo o resto, que é a maior parte da tela | — |

**Regra de ouro: cor é para o que exige ação.** Se a pessoa não pode fazer nada a respeito, é
neutro. Numa tela do Salesforce, cor de estado ocupa menos de 1% dos elementos. É a meta.

**Moss não vira cor de alerta** (regra que já estava acima) **e também não vira cor de rótulo.**
Destaque em coisa que não recebe ação é o que faz a tela parecer um carrossel.

**Etiqueta de fila, canal, origem e fase é neutra.** Categoria não é estado.

**Estado é um par: fundo pastel com texto escuro por cima**, mais a linha que une os dois. Nunca cor
saturada em texto corrido, e nunca só o texto colorido. As três variáveis viajam juntas — duas
cópias de um hex sempre viram duas cores diferentes.

**Borda é tinta translúcida, não hex opaco.** Uma borda opaca escolhe um fundo e briga com todos os
outros: sobre uma linha de severidade, uma linha de grade opaca cruza a cor do estado.

**Cinco superfícies e quatro degraus de texto.** Do branco do cartão ao escuro da sobreposição, e do
texto corrente ao fantasma. Quem precisar de um sexto degrau está resolvendo com cor um problema de
espaçamento.

### Tipografia

A monoespaçada em caixa alta continua sendo assinatura do produto, mas são **dois recursos, não um**
— e foi tê-los colados numa classe só que produziu o ruído.

- **Monoespaçada: número tabular e rótulo de seção. Só.** Ela existe porque tabular alinha coluna:
  métrica, valor, contagem, ID, horário. E abre grupo, no rótulo miúdo em caixa alta, que aparece
  duas ou três vezes por tela. **Sai de nome de fase, de fila, de canal, de origem, de campo e de
  pessoa** — isso é texto corrente. E sai de **cabeçalho de coluna**: são dez por tela, e dez
  rótulos monoespaçados na mesma linha foi metade do ruído. A Blip não usa monoespaçada nenhuma na
  interface; nós usamos, mas contada.
- **Caixa alta: rótulo de seção e cabeçalho de coluna**, 12px/600. No cabeçalho de coluna, na
  família do corpo. É o que o Salesforce faz.
- **Uma família no corpo.** Duas famílias numa tela é uma a mais do que Blip, Salesforce e Twenty
  usam.
- **Três degraus carregam a tela: 16, 14 e 12.** O corpo é 14. O de 10 só para o verdadeiramente
  secundário. Título de tela (20) e número de destaque (28) são duas exceções contadas a dedo.
- **A escala é declarada em px**, nunca em rem: token de fonte em rem depende do `font-size` da raiz,
  e ancorar a raiz encolhe junto todo o espaçamento.

### Estrutura

- **Módulo no topo, horizontal.** Poucos itens, e todos funcionando.
- **Lateral só com o contexto do módulo aberto**, e curta. Com menos de dois itens, não existe.
- **Configuração atrás da engrenagem, em tela própria**, com lateral própria e volta explícita. Sem
  navegação de módulo: quem configura não está trabalhando.
- **Item que não funciona não aparece.** Mostrar caminho morto não é transparência, é ruído.
- **Relatório é filtro e agrupamento salvos na própria lista**, não item de menu. Vira tela só
  quando lê a operação por um eixo que a lista não tem.
- **Cada tela tem uma coisa principal**, e ela é maior que o resto.

### Densidade

Cabeçalho 48px · linha de tabela 36px · cabeçalho de coluna 32px · célula 8px por 12px ·
espaçamento em múltiplos de 4px · duas elevações de sombra.

**Raio: três valores, e um domina.** 8px em tudo (cartão, caixa, botão, campo, tabela), 5px em
controle pequeno (botão de ícone, caixa de seleção), pílula em avatar e etiqueta redonda. Um quarto
raio é um degrau sem papel.

## Estrutura de cada aplicativo

Decidido em 06/09/2026: **cada aplicativo é fiel à referência do seu domínio.** A coerência entre
eles vem do vocabulário compartilhado, não da moldura.

| Aplicativo | Referência | Estrutura |
|---|---|---|
| Desk | Blip Desk | trilho de ícones em altura cheia, sem barra superior, colunas 25/50/25 |
| Gestão | Blip Portal | duas barras no topo, lateral contextual com ícones |
| CRM | Salesforce Lightning | barra única no topo com abas de objeto |

O que **é comum aos três e não se negocia**: os tokens do `@pipe/ui`, os primitivos, a régua
tipográfica de 16/14/12, o raio de 8px, uma cor de marca, e a paleta estendida cercada para gráfico.

O que **é de cada um**: a moldura de navegação.

O motivo é que a estrutura serve o trabalho, não a marca. A tela do atendente precisa de conversa
larga e nenhum cromo; a do supervisor precisa de navegação profunda; a do vendedor precisa de troca
rápida entre objetos. Blip e Salesforce chegaram sozinhos a soluções diferentes porque os problemas
são diferentes, e copiar a moldura de um para o outro pioraria os dois.

Corolário prático: ao mexer numa tela, a pergunta é "como a referência **dela** faz", nunca "como
o nosso outro aplicativo faz".

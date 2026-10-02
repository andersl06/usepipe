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

## Builder: tokens de marca (tema escuro)

O Builder renderiza sempre no tema escuro, independente da preferência de tema do resto do
produto (D-31) — o contêiner raiz do editor (`editor.tsx`) força `data-tema="escuro"`. Todo azul
de marca/ênfase da referência (`#3f7de8`, `#498bff`, `#0c50c5`, `#003c64`, `#b3d4ff`, medidos em
`referencias-blip/builder/builder/reconstrucao/MEDIDAS.md`) vira um destes tokens verdes por
papel, nunca `var(--p-marca)` direto nem `--p-foco` (violeta, foco de teclado do resto do
produto) — cada papel preserva a opacidade/blur do efeito equivalente na referência quando
medido (D-32). Os papéis `brilho`, `sombra` e `gradiente` ainda não têm captura ao vivo do canvas
(pendências registradas em `ref/inventario-visual.md`); ficam com valor semente derivado de
`--p-marca`, a recalibrar quando a captura confirmar o efeito real.

| Token | Valor | Papel | Onde é permitido |
|---|---|---|---|
| `--p-builder-marca` | `var(--p-marca)` | Cor base de marca/ênfase (equivalente a `#3f7de8`/`#1e6bf1`) | Seta do canvas, ponto de saída do nó, texto de hover do menu de contexto |
| `--p-builder-marca-hover` | `var(--p-marca-forte)` | Hover de link/botão (equivalente a `#498bff`) | `.hover-primary:hover` do Portal, hover de link de marca |
| `--p-builder-marca-ativo` | `color-mix(in srgb, var(--p-marca) 75%, black)` | Estado ativo/pressionado de um controle (equivalente a `#0c50c5`) | Radio marcado, botão pressionado |
| `--p-builder-marca-anel` | `var(--p-marca)` | Anel de seleção/hover do nó, `box-shadow: 0 0 0 4px`, sólido | `.bl-no:hover`, `.bl-no--selecionado`, `.bl-no--editando`, `.bl-no--alvo` |
| `--p-builder-marca-borda-ativa` | `var(--p-marca-forte)` | Borda inferior de campo em foco/edição, seta ativa | `.bl-panel-title:focus-visible`, `.bl-panel-add-tag:focus`, seta selecionada |
| `--p-builder-marca-selecionado` | `var(--p-marca)` | Preenchimento sólido do nó/aba quando selecionado | `.bl-no--selecionado:not(.bl-no--inicio)`, `.bl-abas button[aria-selected='true']` |
| `--p-builder-marca-destaque` | `color-mix(in srgb, var(--p-marca) 24%, #282828)` | Fundo tingido de marca a 24% sobre superfície escura | Hover/seleção de item de lista (novo bloco, menu de ações, variáveis, versões) |
| `--p-builder-marca-brilho` | `color-mix(in srgb, var(--p-marca) 50%, transparent)` | Glow/blur (sem captura ao vivo confirmada — valor semente) | Reservado; nenhum uso ainda |
| `--p-builder-marca-sombra` | `color-mix(in srgb, var(--p-marca) 35%, black)` | Sombra tingida de marca (sem captura ao vivo confirmada — valor semente) | Reservado; nenhum uso ainda |
| `--p-builder-marca-sobreposicao` | `color-mix(in srgb, var(--p-marca) 20%, transparent)` | Véu/tingimento de fundo a 20% (medido: cartão selecionado do stepper, `rgba(63,125,232,.2)`) | Fundo de cartão/opção selecionada |
| `--p-builder-marca-gradiente` | `linear-gradient(135deg, var(--p-marca), var(--p-marca-forte))` | Gradiente de marca (sem captura ao vivo confirmada — valor semente) | Reservado; nenhum uso ainda |

### Medidas do Atendimento (desk-sidebar)

Medidas da Blip por papel, sem cor: valem nos dois temas e moram no `:root` de `tokens.css`. O
azul da Blip no Atendimento continua mapeado para `--p-marca`, `--p-marca-forte`, `--p-marca-suave`
e `--p-marca-linha`; nenhum papel azul novo apareceu na casca.

| Token | Valor | Papel | Fonte |
|---|---|---|---|
| `--p-atend-lateral-subitem-recuo` | `37px` | Recuo da caixa do subitem em relação à árvore da lateral (caixa em x=53 contra 16) | `referencias-blip/pesquisa/blip-medidas-monitoramento.md` §3.3 |
| `--p-atend-lateral-borda` | `1px` | Borda transparente do subitem, igual à do item de primeiro nível; fecha os 39px e põe o rótulo a 46px da árvore | `blip-medidas-monitoramento.md` §3.1 e §3.3 (rótulo em x=62) |
| `--p-atend-lateral-marca-desloc` | `-15px` | Deslocamento da barra de 2px do subitem ativo à esquerda da borda de padding, sobre a guia do grupo | `blip-medidas-monitoramento.md` §3.3 (`::before` com `left: -15px`) |

### Medidas do Atendimento (rodapé de paginação)

Mesmo rodapé "Resultados por página" em grades e listas; só a margem de cima muda. Fonte:
`.planning/phases/03.2-paridade-do-atendimento-com-a-blip/ref/verificacao/paginacao.md`.

| Token | Valor | Papel | Fonte |
|---|---|---|---|
| `--p-atend-paginacao-margem-grade` | `10px` | Margem acima do rodapé nas grades (`mt3`) | `paginacao.md` §grade |
| `--p-atend-paginacao-margem-lista` | `20px` | Margem acima do rodapé nas listas (`mt4`) | `paginacao.md` §lista |
| `--p-atend-paginacao-seletor` | `74px` | Largura do seletor de tamanho (`ResultsSelect`) | `paginacao.md` |
| `--p-atend-paginacao-botao` | `40px` | Lado dos botões de navegação (botão de ícone curto) | `paginacao.md` |
| `--p-atend-paginacao-icone` | `24px` | Lado do ícone dos botões | `paginacao.md` |
| `--p-atend-acao-icone` | `20px` | Lado do ícone da coluna Ações do Monitoramento (ícone nu, sem caixa) | `monitoring.md` §lista; ícone `small` da Blip = 20px [M] |
| `--p-atend-acao-alvo` | `24px` | Alvo de clique em volta do ícone (mínimo de acessibilidade; a Blip não tem caixa) | `monitoring.md` §lista |
| `--p-atend-tabela-borda` | claro `rgba(0, 0, 0, 0.06)`; escuro `rgba(237, 236, 227, 0.08)` | Borda fina das linhas das tabelas do atendimento. No tema escuro segue a mesma família neutra de `--p-linha` (`rgba(237, 236, 227, ...)`), em opacidade menor, para continuar mais fraca que a linha comum | `monitoring.md` §lista |
| `--p-atend-acao-gap` | `4px` | Espaço entre alvos de 24px; deixa 8px entre ícones de 20px | `monitoring.md` §lista ([A], `gap` 1 da grade da Blip) |
| `--p-atend-menu-largura` | `240px` | Largura mínima do menu de três pontos | `monitoring.md` §menu ([M], menu suspenso da Blip) |
| `--p-atend-ticket-detalhe-largura` | `444px` | Largura do painel lateral de detalhe do ticket | `monitoring.md` §detalhe ([M], `width=444` do painel lateral da Blip) |
| `--p-atend-sombra-flutuante` | `0 6px 16px -4px rgba(0,0,0,.16)` | Sombra do menu de três pontos e dos tooltips | `monitoring.md` ([M], menu suspenso e tooltip da Blip) |
| `--p-atend-equipe-cartao-raio` | `16px` | Raio do cartão das páginas Adicionar, Editar e Permissões do atendente | `atendentes-medidas-blip.md` ([M], cartão da página) |
| `--p-atend-equipe-cartao-padding` | `40px` | Padding do cartão (20px embaixo em Permissões) | `atendentes-medidas-blip.md` ([M]) |
| `--p-atend-equipe-cartao-margem` | `20px` | Margem acima do cartão | `atendentes-medidas-blip.md` ([M]) |
| `--p-atend-equipe-campo-largura` | `643.5px` | Largura da coluna de campos (rótulos à esquerda, campos alinhados à direita) | `atendentes-medidas-blip.md` ([M]) |
| `--p-atend-equipe-avatar` | `56px` | Lado do avatar de iniciais acima do cartão de Editar e Permissões | `atendentes-medidas-blip.md` ([M]) |
| `--p-atend-equipe-linha-permissao` | `56px` | Altura de cada linha de permissão | `atendentes-medidas-blip.md` ([M]) |
| `--p-atend-equipe-interruptor-largura` / `-altura` | `32px` / `21px` | Interruptor curto das páginas de atendente (altura 18px em Adicionar, 21,3px em Editar [M]; 21px adotado) | `atendentes-medidas-blip.md` ([M]) |
| `--p-atend-resposta-cartao-padding` | `20px` | Padding dos cartões de categoria e de resposta em Respostas prontas | `replies-blip.md` ([M]) |
| `--p-atend-resposta-cartao-altura` | `86px` | Altura do cartão de categoria | `replies-blip.md` ([M]) |
| `--p-atend-resposta-cartao-passo` | `10px` | Espaço vertical entre cartões (passo de 96px) | `replies-blip.md` ([M]) |
| `--p-atend-fila-cartao-raio` | `16px` | Raio dos cinco cartões da edição de fila | `queue-management-editar-blip.md` ([M]) |
| `--p-atend-fila-cartao-padding` | `40px` | Padding dos cartões da edição de fila | `queue-management-editar-blip.md` ([M]) |
| `--p-atend-fila-cartao-margem` | `20px` | Espaço entre os cartões empilhados | `queue-management-editar-blip.md` ([M]) |
| `--p-atend-fila-cartao-sombra` | `0 2px 8px -2px rgba(0,0,0,.16)` | Sombra do cartão (o fundo `#f6f6f6` da Blip não foi adotado: o Pipe mantém a superfície branca do cartão) | `queue-management-editar-blip.md` ([M]) |
| `--p-atend-canal-cartao-largura` / `-altura` | `343px` / `270px` | Cartão de canal de atendimento (Blip: 343,4 x 270) | `channels-blip.md` ([M]) |
| `--p-atend-canal-cartao-espaco` | `16px` | Espaço entre os cartões de canal (passo de 359px) | `channels-blip.md` ([M]) |
| `--p-atend-fila-busca-borda` | `1px` | Borda do campo de busca da fila (a Blip mede 0,889px por DPR 1,125) | `queue-management-editar-blip.md` ([M]) |
| `--p-atend-fila-modal-largura` | `790px` | Largura do modal Adicionar atendentes | `queue-management-cartoes-blip.md` ([M]) |
| `--p-atend-fila-modal-raio` | `8px` | Raio do modal Adicionar atendentes | `queue-management-cartoes-blip.md` ([M]) |
| `--p-atend-fila-modal-padding` | `32px` | Padding do modal Adicionar atendentes | `queue-management-cartoes-blip.md` ([M]) |
| `--p-atend-fila-interruptor-alto-largura` | `56px` | Largura do interruptor alto do cartão Encerramento automático | `queue-management-cartoes-blip.md` ([M]) |
| `--p-atend-fila-interruptor-alto-altura` | `32px` | Altura do interruptor alto do cartão Encerramento automático | `queue-management-cartoes-blip.md` ([M]) |

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

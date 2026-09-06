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

| Papel | Hex | Uso |
|---|---|---|
| Moss (primária) | `#4A5D23` | marca, ação primária, estado ativo |
| Sage | `#8A9A5B` | apoio, gráficos, estados suaves |
| Tinta | `#111111` | texto, traço do símbolo |
| Creme | `#F2F1EC` | fundo de aplicação |
| Borda | `#E2E0D8` | divisórias, contorno de card |
| Cinza texto | `#55544D` `#5F5E57` `#6B6A62` | hierarquia de texto secundário |
| Terracota | `#C4442E` | erro, SLA estourado, ofensor |
| Azul profundo | `#2E4A5D` | informação, links de dado |
| Verde escuro | `#1F3A2E` | sucesso, meta batida |
| Branco | `#FFFFFF` | superfície de card |

Regra: moss não vira cor de alerta. Vermelho é só terracota, e só para o que exige ação.

## Tipografia
- Texto e títulos: sans geométrica (system stack com Helvetica/Arial de fallback)
- Rótulos, códigos, IDs, métricas: **IBM Plex Mono**, caixa alta, `letter-spacing` 0.14–0.16em,
  11px — é a assinatura visual do produto, herdada do estudo da marca

---

## Regras de interface

Esta seção existe porque a paleta acima, sozinha, permitiu o erro: quatro matizes de destaque na
mesma tela, etiqueta colorida por categoria, e a monoespaçada em caixa alta em toda linha. A tabela
de cores diz o que cada cor **é**; esta seção diz onde cada uma **pode** e **não pode** aparecer.

Medições que sustentam cada regra: `docs/pesquisa/visual-blip-salesforce.md`.
Implementação: `packages/ui` (`@pipe/ui`), que é a fonte única de token. Nenhum aplicativo declara
cor própria.

### Onde cada cor pode entrar

| Cor | Pode | Não pode |
|---|---|---|
| **Moss** (destaque) | Ação primária, estado ativo de navegação, anel de foco, borda de campo em foco | Rótulo de seção, número, título, barra de gráfico, etiqueta de fila/canal/origem/fase, ícone decorativo |
| **Verde escuro** (sucesso) | Estado concluído que não pede ação | Marcar o que é apenas normal |
| **Ocre** (alerta) | Número ou linha que pede atenção agora | Categoria, prioridade fixa, decoração |
| **Terracota** (erro) | Falha, SLA estourado, o que exige ação imediata | Qualquer coisa que a pessoa não resolva clicando |
| **Sage** (dado) | Preenchimento de barra e série de gráfico | Cromo, texto, borda, etiqueta, ícone |
| **Azul profundo** | Nada no cromo. Deixou de ser cor de interface | Etiqueta, número, borda, barra |
| **Neutros** | Todo o resto, que é a maior parte da tela | — |

**Regra de ouro: cor é para o que exige ação.** Se a pessoa não pode fazer nada a respeito, é
neutro. Numa tela do Salesforce, cor de estado ocupa menos de 1% dos elementos. É a meta.

**Moss não vira cor de alerta** (regra que já estava acima) **e também não vira cor de rótulo.**
Destaque em coisa que não recebe ação é o que faz a tela parecer um carrossel.

**Etiqueta de fila, canal, origem e fase é neutra.** Categoria não é estado.

**Estado é sempre um trio: fundo, linha e texto.** Nunca use só o texto colorido. Duas cópias de um
hex sempre viram duas cores diferentes.

**Borda é tinta translúcida, não hex opaco.** Uma borda opaca escolhe um fundo e briga com todos os
outros: sobre uma linha de severidade, uma linha de grade opaca cruza a cor do estado.

### Tipografia

A monoespaçada em caixa alta continua sendo assinatura do produto, mas são **dois recursos, não um**
— e foi tê-los colados numa classe só que produziu o ruído.

- **Monoespaçada: só número.** Ela existe porque tabular alinha coluna. Métrica, valor, contagem,
  ID, horário. **Nunca rotula.**
- **Caixa alta: só rótulo de seção e cabeçalho de coluna**, na família do corpo, 11px/600. Nunca em
  nome de fase, fila, canal, origem ou pessoa. É o que o Salesforce faz, e lá também não é mono.
- **Uma família no corpo.** Duas famílias numa tela é uma a mais do que Blip, Salesforce e Twenty
  usam.
- **Dois degraus carregam a tela:** 13px de corpo e 12px de miúdo. O resto é exceção contada a dedo.
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

Cabeçalho 48px · linha de tabela 34px · célula 8px por 12px · espaçamento em múltiplos de 4px ·
raio padrão 6px · duas elevações de sombra.

# Blip Desk, medido

Medição da tela do atendente da Blip. Duas fontes, e as duas concordam:

1. **A aplicação rodando**, em `supernova.desk.blip.ai`, com a sessão ativa e o atendente
   **Invisível** — nunca online, para não puxar cliente real. Viewport de 1920×863.
2. **O pacote compilado** em `Downloads/blio`: a folha de 773 KB e o `app.js` de 2,4 MB,
   que dão as regras que a tela não mostrava por falta de conversa aberta.

**Nada daqui é código copiado.** Largura, altura, raio e passo são fato medido; o que se
aplica no Pipe são os números, com os nossos token. Nenhum valor de cor deles entra no
nosso CSS.

## 0. O truque de medição, de novo

O aviso que o agente anterior deixou vale integralmente aqui, e foi confirmado em toda
medição desta página: **`getComputedStyle` no elemento hospedeiro mente**. Todo
`bds-typo` devolve `16px` no host, sempre, para qualquer texto. O tamanho real vive no
elemento dentro do `shadowRoot`, que carrega a classe `typo__variant--fs-NN`:

| O que o host diz | O que o shadow diz | Onde aparece |
|---|---|---|
| 16px | `fs-20` / 600 / entrelinha 20px | Título de tela ("Atendimentos", "Fique online para atender") |
| 16px | `fs-16` / 400 / entrelinha 24px | Corpo, rótulo, item de menu |
| 16px | `fs-14` / 400 / entrelinha 21px | Contador de aba ("Todos (0)") |

A travessia precisa descer por `el.shadowRoot.children` **e** por `el.children` no mesmo
laço, senão metade da árvore desaparece.

Régua efetiva da tela deles: **20 / 16 / 14**, mais um 10px que só aparece no horário
abaixo do balão. Bate com a contagem do bundle já registrada em `blip-design-system.md`.

## 1. Proporção geral, que não é em pixel

A descoberta que muda o desenho: **as colunas são percentuais, não fixas.**

```
#container .sidenav  { width: 25% }   coluna de atendimentos
#container .pane-chat{ width: 50% }   conversa
#container .drawer   { width: 25%; min-width: 260px }
```

Em 1920 isso deu, medido: trilho 80 · lista 460 · conversa 920 · painel 460.

As faixas, na ordem em que a folha as declara:

| Largura da janela | Lista | Conversa | Painel |
|---|---|---|---|
| acima de 1600 | 25% | 50% | 25% |
| até 1600, painel fechado | 25% | 75% | escondido |
| até 1112 | 25% | 75% | sobrepõe a conversa quando aberto (z-index 10) |
| até 950 | 100% | 100% | 100%, e os três painéis deslizam com `left: -100%` e `-200%` |

Não existe coluna de 300px em lugar nenhum. Em 1440 a coluna de atendimentos tem 340px,
em 1920 tem 460px, e o balão da conversa acompanha porque é medido em porcentagem também.

## 2. Trilho de ícones

`bds-navbar` vertical, tema escuro, altura cheia. É o único cromo escuro da tela.

| Medida | Valor |
|---|---|
| Largura do trilho | **80px** |
| Preenchimento interno | 16px em cima e embaixo, 8px nas laterais |
| Coluna útil | 64px |
| Espaço entre itens | 8px |
| Bloco da marca no topo | 64×64, com a ilustração em 40×40 |
| Folga abaixo da marca | 24px |
| Alvo de cada item | 64×40, com 12px de recuo lateral |
| Passo vertical | **48px** (40 de altura mais 8 de espaço) |
| Ícone | **24×24** |
| Indicador de ativo | retângulo de **40×40**, raio **8px**, fundo `--color-pressed` |

O indicador de ativo é `.menu-selected { background: var(--color-pressed); border-radius: 8px }`.
Medido no tema escuro deles, `--color-pressed` resolve para branco a 8% de opacidade. Não
há barra lateral, não há sublinhado, não há cor de marca: o ativo é **só** um retângulo um
degrau mais claro que o fundo do trilho.

Os itens, na ordem, lidos do `tooltip-text` de cada um:

```
topo      Atendimentos · Mensagens ativas · Métricas de atendimento · Contatos · Ações em massa
rodapé    Ajuda · Preferências
rodapé    avatar do atendente, com o ponto do estado (título "Seu status é: Invisível")
```

O rodapé usa o mesmo passo de 48px e fica colado no fim pelo `justify-content: space-between`
do trilho. O avatar é o último elemento, abaixo dos dois ícones de conta.

## 3. Coluna de atendimentos

Fundo da coluna em superfície 2 (o degrau de recesso). Ela se divide em quatro blocos
empilhados, e os dois primeiros ficam em superfície 1, um degrau acima do resto:

| Bloco | Altura | Conteúdo |
|---|---|---|
| Cabeçalho | **76px**, preenchimento 16px | Título em fs-20/700 e, embaixo, o seletor de visão "Lista ⌄" (Lista / Quadro) |
| Estado do atendente | `--sidenav-header-min-height: 111px`, máximo 160px | "Seu status é *Invisível*" com o estado na cor de marca, e um botão de 40px de altura |
| Busca | 50px | Campo de 42px, raio 8px, borda 1px, recuo 8px 4px 8px 12px, ícone de 20px numa caixa de 24px |
| Lista | o que sobra | `height: calc(100% - 109px)` quando há busca |

O `--sidenav-header-min-height` é o token que o `blip-design-system.md` já tinha
flagrado. Ele muda de valor por contexto: **111px** na tela normal, **117px** noutra
faixa, e **82px** no modo de mensagem ativa. É o mesmo bloco, com mais ou menos coisa
dentro.

O cabeçalho e o bloco de estado são separados por linha de 1px em superfície 3, em cima e
embaixo do bloco de estado.

### O item da lista

Cartão, não linha de tabela. É exatamente a mesma figura que a Gestão já adotou.

```
.chat-list-item {
  border-radius: 8px;
  background:    superfície 1;
  border:        1px sólido, superfície 3;
  padding:       8px;
}
.chat-list-item:not(:last-child) { margin-bottom: 8px }
```

Dentro, três faixas:

- `.ticket-content`, com 8px de folga embaixo: nome do contato, prévia da última mensagem
  e o horário.
- Uma linha de 1px em superfície 2, que separa o conteúdo dos metadados.
- `.ticket-info`, com 4px de recuo no topo, 8px de espaço entre os itens e entrelinha de
  24px: ícones de 24×24 em conteúdo fantasma (canal, fila, alertas) e o contador de
  não lidas.

**O estado dos três níveis é neutro, e isso é o achado que mais contraria o que fizemos:**

| Estado | Tratamento |
|---|---|
| Repouso | cartão em superfície 1 |
| Passagem do cursor | preto a 4% por cima do cartão |
| **Selecionado** | preto a **16%** por cima do cartão |

Nada de barra lateral colorida, nada de fundo na cor de marca. O selecionado é o mesmo
cartão, mais escuro. Conversas fixadas ("pinned") são renderizadas num bloco acima da
lista comum, e não recebem tratamento de cor.

## 4. Área da conversa

### Cabeçalho

`.chat-header` com preenchimento de **24px** em volta. O avatar do contato tem **45px** por
padrão, cai para 36px na faixa estreita e sobe para 60px na larga. À direita do nome ficam
os botões de ação e o `#show-user-info`, que é o botão que abre e fecha o painel do contato
— e que tem raio só do lado esquerdo (`8px 0 0 8px`), porque encosta na borda da coluna.

### Corpo

O rolador tem preenchimento **32px 24px**, que vira **40px 64px** acima de 1600px de janela.
É a única medida da tela que muda por faixa em vez de por porcentagem, e ela existe para o
balão não colar na borda quando a coluna fica larga.

### O balão

```
.bubble {
  max-width:   90%;
  min-width:   160px;
  font-size:   16px;
  line-height: 20px;
  padding:     10px 16px;
  border:      1px sólido, conteúdo fantasma;
  margin-bottom: 5px;
}
```

O raio é de **13px**, com **um canto de 2px** do lado de quem falou:

| Direção | Raio | Fundo | Texto |
|---|---|---|---|
| Entrada (`.left`) | `13 13 13 2` | superfície 1 | conteúdo padrão |
| Saída (`.right`) | `13 2 13 13` | **conteúdo padrão** (o cinza escuro do texto) | superfície 1 |
| Sistema (`.middle`) | `13` nos quatro | superfície 1, centralizado | conteúdo padrão |

Repare no balão de saída: ele não usa a cor de marca. Usa o **cinza escuro do texto** como
fundo, com o texto claro por cima. O lado e o contraste carregam a informação; a cor de
marca fica livre para a ação primária.

### Agrupamento, que é o detalhe caro de acertar

Mensagens seguidas do mesmo autor formam um `blip-card-group`:

- **20px** entre grupos.
- **3px** entre balões dentro do grupo.
- Os cantos que se encostam encolhem para 2px. O primeiro do grupo mantém o topo em 13px e
  perde o canto de baixo; os seguintes ficam com os dois cantos do lado do autor em 2px.

O horário fica **fora** do balão, como `.group-notification`: **10px** de tamanho, 14px de
entrelinha, na cor de conteúdo desabilitado, alinhado ao mesmo lado do balão.

O avatar (`.blip-card-photo`) é posicionado por cima, redondo, e o corpo do grupo é recuado
**35px** do lado da entrada e **55px** do lado da saída para abrir espaço para ele.

### Entrega e falha

- O estado de entrega vive na linha de metadados junto do horário.
- **Falha** tem tratamento duplo: o balão vai a **50% de opacidade** e um ícone de **25×25**
  na cor vermelha estendida aparece encostado no canto inferior direito, fora do balão e
  clicável. Dentro do balão entra uma linha `.failed-message` com 8px de espaço e 8px de
  recuo, que é onde o motivo aparece.

Vale reparar que a falha não pinta o balão de vermelho. Ela **apaga** o balão e põe o
vermelho num ícone de 25px. É bem mais barato de ler numa conversa longa.

### Voltar ao fim

Botão flutuante de 40×40, redondo, a 24px do fundo e a 5% da direita, com o contador de
não lidas grudado no canto (deslocamento de -6px nos dois eixos).

## 5. Compositor

Duas faixas empilhadas dentro do `.pane-chat-message-input`:

| Faixa | Medida |
|---|---|
| Campo | `.input-wrapper` com recuo 8px 0 8px 16px; a área de texto vai de **4em** a **11.5em** de altura, e cai para 7em e 4em nas faixas estreitas |
| Ações | `.action-buttons`, altura fixa de **56px**, com 12px de folga acima do campo |

Anexo, áudio e emoji ficam **na faixa de ações, abaixo do campo**, alinhados à esquerda; o
envio fica à direita. A barra de rolagem da área de texto tem 4px de largura.

Quando a conversa não aceita texto livre, o compositor inteiro é **substituído** por um
`bds-paper` de elevação estática, centralizado, com uma linha em fs-16 semi-negrito e um
botão primário. São quatro casos distintos, cada um com o seu texto: cliente encerrou,
encerrou por inatividade, atendente encerrou, e em espera. Não existe campo desabilitado
com dica no `title` — o campo sai da tela e o motivo ocupa o lugar dele.

## 6. Painel do contato

Coluna de 25% com **mínimo de 260px**, fundo em superfície 2 — recesso, igual à coluna de
atendimentos.

| Parte | Medida |
|---|---|
| Cabeçalho | **57px** (49px na faixa estreita) |
| Abas | `height: calc(100% - 58px)`, fundo superfície 1 |
| Preenchimento do painel | 8px |
| Cartão ("paper") | recuo **16px 24px** |
| Espaço entre cartões | 8px |
| Primeiro cartão | altura automática, máximo 90% da coluna |
| Cartão de histórico | mesmo recuo 16px 24px, 16px na faixa estreita |
| Cartão de metadados | recuo 16px, dentro de um bloco de 8px em superfície 2 |

O painel é **em abas**, não uma pilha de seções roladas: perfil, histórico e metadados são
abas irmãs, e cada uma é uma pilha de cartões sobre o fundo recuado.

## 7. Estados

Os dois que a sessão invisível deixou ver, medidos na tela:

**Atendente invisível, na coluna de atendimentos** — bloco de 50px de recuo, centralizado:
o título "Nenhum atendimento aberto" em fs-16 e, embaixo, "Você precisa ficar online para
atender um novo cliente", também em fs-16, com um ícone acima.

**Sem conversa selecionada, na área da conversa** — bloco de 336px de largura, centralizado
na coluna: ilustração, título em **fs-20/600**, e a explicação em fs-16/400. O texto deles é
"Fique online para atender" seguido de "Você está invisível e não consigo te ver (rimou!)".

**Lista vazia por busca** — "Nenhum resultado encontrado para *termo*", no mesmo desenho.

Os três seguem a mesma receita: ilustração, uma linha que nomeia o estado, uma linha que diz
o que fazer. Nenhum deles é uma caixa com borda; é texto centralizado no vazio.

## 8. O que vale copiar, e o que não

Vale:

1. **A proporção 25/50/25**, e a régua de faixas. Coluna fixa em 300px estrangula a lista
   em tela grande e some com a conversa em tela pequena.
2. **O cartão de 8px com 8px de recuo e 8px de espaço** na lista, sobre fundo recuado.
   É a mesma figura da Gestão, e é o que faz os dois aplicativos parecerem um só produto.
3. **O selecionado neutro.** Escurecer o cartão custa zero cor e é lido na hora.
4. **O balão de 13px com um canto de 2px**, e o agrupamento de 3px dentro e 20px entre.
   É o que separa uma conversa de uma lista de parágrafos.
5. **A falha por opacidade mais ícone**, em vez de balão vermelho.
6. **O compositor que some** quando não há o que compor, em vez de campo desabilitado.
7. **O trilho de 80px com passo de 48px** e o ativo como retângulo de 40×40 em raio 8.

Não vale:

1. **O trilho com cinco destinos.** Eles têm cinco módulos; nós temos um. Trilho é a forma;
   quantos itens ele carrega é função do produto, e item que não abre nada não entra.
2. **O painel em abas.** Três abas para três seções curtas é um clique a mais para ver
   dado que cabe numa rolagem só.
3. **O horário de 10px.** Fica abaixo da régua 16/14/12 e não sobrevive numa tela de
   escritório. Nosso menor é 12px.
4. **A janela de 24 horas ausente do cabeçalho.** Eles não mostram; a nossa spec (§5.1)
   manda mostrar, e é a diferença entre avisar antes e errar depois.

# Design system do Pipe

> Fonte única de token, primitivo e estrutura para `apps/desk`, `apps/gestao` e `apps/crm`.
> Implementado em `packages/ui` (`@pipe/ui`).
>
> Autoridade da identidade: `docs/marca/MARCA.md`.
> Números que justificam cada decisão: `docs/pesquisa/visual-blip-salesforce.md`.

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

**A escala de superfície puramente neutra.** Cinco degraus sem matiz (`#FFFFFF`, `#F6F6F6`,
`#EDEDED`, `#E3E3E3`, `#141414`). Adotamos a ideia, não os valores: o creme da marca fica no fundo
da aplicação, e da superfície de cartão para cima é branco, para que a cor que aparecer em cima seja
lida como informação.

**Borda como tinta translúcida.** A Blip usa preto em três opacidades (`.20` / `.16` / `.06`), não
três cinzas. Uma borda translúcida escurece o que estiver embaixo e nunca briga com o fundo em que
cai. Copiado direto.

**Cor de papel, não de matiz.** `surface-*`, `content-*`, `border-*`, `success/warning/error`. Um
componente que lê "conteúdo secundário" não sabe que cor é isso.

**A cerca em volta da paleta larga.** A Blip tem 16 cores "extended" — e elas servem etiqueta e
gráfico, não o cromo. Era exatamente a nossa paleta solta. Adotamos a cerca: `--p-dado` é o único
matiz fora do destaque e dos estados, e só gráfico pode usá-lo.

**O que não veio:** os valores. Azul não é a nossa marca.

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
| **Destaque (moss)** | Ação primária, estado ativo de navegação, anel de foco, borda de campo em foco | Rótulo de seção, número, título, barra de gráfico, etiqueta de fila/canal/origem/fase, ícone decorativo |
| **Sucesso** | Estado que confirma algo concluído e não pede ação | Marcar "normal". O normal é neutro |
| **Alerta** | Número ou linha que pede atenção agora (SLA perto de estourar, fila crescendo) | Categoria, prioridade "média" fixa, decoração |
| **Erro** | Falha, SLA estourado, algo que exige ação imediata | Qualquer coisa que a pessoa não possa resolver clicando |
| **Dado (`--p-dado`)** | Preenchimento de barra e série de gráfico | Cromo, texto, borda, etiqueta, ícone |
| **Neutros** | Todo o resto — e "todo o resto" é a maior parte da tela | — |

**A regra de ouro:** cor é para o que exige ação. Se a pessoa não pode fazer nada a respeito, é
neutro. Meta de ocupação de cor de estado numa tela: cerca de 1%, que é o que o Salesforce pratica.

**Consequência direta**, e é o fim do "carrossel": etiqueta de fila, canal, origem e fase de funil é
**neutra**. Eram oito cores só de etiqueta (quatro matizes × um par `-soft`).

**Estado é sempre um trio.** Nunca use só `--p-erro-tinta`: fundo, linha e texto viajam juntos.

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

| Papel | Valor |
|---|---|
| Família do corpo | uma só (`--p-fonte`) |
| Corpo | **13px** |
| Miúdo (rótulo, etiqueta, legenda) | **12px / 11px** |
| Título de tela | 19px |
| Número de destaque | 24px, monoespaçada tabular |
| Pesos | 400 / 500 / 600 |

**Dois degraus carregam a tela.** Tudo além de 13 e 12 é exceção contada a dedo.

**A monoespaçada é recurso de número**, porque tabular alinha coluna. Nunca rotula.

**Caixa alta é recurso de rótulo de seção e cabeçalho de coluna**, na família do corpo, 11px/600.
Nunca em nome de fase, fila, canal, origem ou pessoa.

A escala é declarada **em px**. Ver 2/Twenty, lição 1.

### 3.7 Densidade

| Medida | Valor |
|---|---|
| Altura do cabeçalho | 48px |
| Linha de tabela | 34px |
| Célula | `8px 12px` |
| Espaçamento | múltiplos de 4px (`espaco(n)`) |
| Raio | 2 / 4 / 6 / 10 / 999px, e 6px é o padrão |
| Lateral contextual | 200px (232px em configurações) |
| Sombra | duas elevações, tinta translúcida |
| Transição | 75 / 150 / 300ms |

### 3.8 Hierarquia: cada tela tem uma coisa principal

- **Painel do CRM:** o funil. Os indicadores viram uma linha de legenda acima dele, sem caixa.
- **Monitoramento da Gestão:** o bloco de tempo real. O que fechou hoje vem depois, separado.
- **Desk:** a conversa aberta.

Oito blocos com o mesmo peso visual não têm hierarquia nenhuma, e foi essa a leitura de "unifica
tanta informação que acaba se tornando ruim".

---

## 4. O que `packages/ui` entrega

```
packages/ui/src/
  estilos.css              ponto único de entrada
  estilos/tokens.css       cor, tipografia, espaço, raio, sombra, duração, densidade
                           (tema claro e escuro; nenhum app declara tema)
  estilos/base.css         reset e as classes compartilhadas pelos três
  tema.ts                  espelho tipado + espaco()   [adaptado de twenty-ui, MIT]
  icones.tsx               fachada sobre os desenhos do Tabler (MIT) + Simbolo da marca
  componentes/
    estrutura.tsx          Cabecalho, NavModulos, LateralContexto, Aplicacao,
                           AreaConfiguracoes, Marca
    primitivos.tsx         Botao, BotaoDeIcone, Etiqueta, Campo, Seletor, Abas,
                           EstadoVazio, Carregando, Avatar, Cartao
    tabela.tsx             Tabela
```

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

**"Reduza a mono."** O diagnóstico estava certo, a causa não. Nenhuma das três referências usa
família monoespaçada em lugar nenhum da interface. O problema não era a frequência: era `.lbl`
misturar dois papéis (caixa alta de rótulo + monoespaçada de número) numa classe só. Separados, cada
um pode ser usado à vontade no seu lugar.

**Navegação vertical não é errada por si.** O Twenty é todo vertical e não parece sujo. Fomos para o
topo porque temos módulos, não porque lateral seja proibido.

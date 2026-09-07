# Blip, as telas de cadastro — medidas no DOM vivo

Fecha o §7 de `blip-medidas-monitoramento.md`, que listava estas telas como "não abertas nesta
sessão". Medidas em 06/09/2026, no bot **AUVP Capital [DEV]** do contrato Supernova, viewport de
1707px — a mesma da medição anterior, para que os números sejam comparáveis.

**Uso.** Somente leitura: nenhum botão que grava foi tocado. Medida, nome de papel e regra descrita
em português são fato, e fato não tem copyright; código é expressão e não se copia.

## 0. O mapa da lateral, completo

Agora com os grupos abertos, o menu inteiro do módulo Atendimento:

```
Monitoramento
Histórico
Relatórios     ├ Atendimento  ├ Satisfação  ├ Calls  ├ Vendas
Comunicação    ├ Respostas prontas  ├ Modelos de mensagens
Regras         ├ Atendimento  ├ SLA  ├ Horários
Atendentes     ├ Gestão de atendentes  ├ Filas de atendimento  ├ Pausas personalizadas
Preferências   ├ Configurações gerais  ├ Canais de atendimento
```

Passo vertical entre itens: **48px** para subitem (556 → 604 → 652), **56px** do último subitem ao
próximo grupo (1023 → 1080).

E a confirmação da fileira de módulos, medida de novo nesta sessão: Builder x=639, Atendimento 730,
Análise 862, Growth 955, Canais 1048 — passos de **91 / 132 / 93 / 93**.

## 1. Duas descobertas que mudam o nosso modelo

### "Canais de atendimento" não são canais de mensageria

A tela `Preferências ├ Canais de atendimento` lista **Blip Desk, Salesforce (Live Agent), Salesforce
MIAW e Canal Personalizado**. Não é WhatsApp e Instagram: é **para qual ferramenta o transbordo
humano vai**. O canal de mensageria mora no módulo **Canais** do topo, que é outra coisa.

São dois conceitos com o mesmo nome, e nós temos só o primeiro. O segundo — "onde o humano atende" —
não existe no Pipe porque hoje a resposta é sempre "no Pipe Desk". Vira decisão real no dia em que
alguém quiser atender pelo Salesforce.

### Cada cartão de configuração salva sozinho

Em `Configurações gerais` **não há um botão Salvar da tela**. Cada cartão tem o seu, e ele nasce
desabilitado. Cartão sem alteração não oferece ação.

## 2. O cartão-linha: o padrão de listagem de cadastro

Usado igual em **Filas de atendimento** e em **Regras de atendimento**. Não é tabela — é um
`bds-paper` por registro.

| Medida | Valor |
|---|---|
| Cartão | **1366,9 × 85,6**, `bds-paper` |
| Fundo | `rgb(246,246,246)` — o mesmo cartão do Monitoramento |
| Padding | **20px** |
| Raio | **16px** |
| Sombra | `rgba(0,0,0,0.16) 0 2px 8px -2px` |
| Passo vertical | **95,5px** (85,6 + **10** de gap) |
| Primeiro cartão | y=293 |

Dentro, duas colunas de rótulo-sobre-valor e três controles à direita:

| Papel | Medida | Exemplo |
|---|---|---|
| Rótulo | **12 / 400**, lh 18, `rgb(40,40,40)` | "Fila de atendimento", "Nome da Regra" |
| Valor | **16 / 700**, lh 24 | "Abertura de contas", "Regra 2" |
| Coluna 1 | x=316 | |
| Coluna 2 | x=901 | "Atendentes atribuídos" / "Fila" |
| Ações | à direita, ~x=1488 | editar (lápis), excluir (lixeira), **toggle** |

O toggle liga e desliga o registro **na lista**, sem abrir formulário. Editar e excluir abrem
diálogo — o de exclusão tem cabeçalho vermelho (`rgb(230,15,15)`, 424×64) sobre corpo `#f6f6f6`,
raio 8, com sombra dupla.

Acima da lista, na ordem:

| Elemento | Medida |
|---|---|
| Título da tela | **24 / 400**, x=291, y=172 |
| Botão de criar | **119,5 × 40**, encostado à direita (x=1538), na linha do título |
| Busca | **410 × 41,8**, x=291, y=241, placeholder "Buscar fila" |

**O que a lista NÃO mostra:** capacidade da fila. Ela existe, mas só dentro do formulário de edição.
A lista carrega nome e contagem de atendentes, e nada mais.

## 3. O cartão de configuração

`Configurações gerais`. Um `bds-paper` por configuração, largura cheia, empilhados.

| Medida | Valor |
|---|---|
| Cartão | **1366,9** de largura, altura pelo conteúdo (252,7 / 102,3 / 303,4 nos três primeiros) |
| Fundo | `rgb(246,246,246)`, raio **16**, padding no filho |
| Gap entre cartões | **20px** |
| Título | **20 / 700**, lh 20 |
| Explicação | **14 / 400**, lh 21, logo abaixo do título |
| Toggle da seção | à direita, na altura do título |

O conteúdo da configuração vem abaixo da explicação, e o **Salvar** do cartão fica no canto inferior
direito, desabilitado até haver mudança. Cartões podem aninhar: "Blip Calls" contém o sub-cartão
"Receber ligações de voz", com o mesmo título-explicação-toggle uma superfície acima.

Texto de interface que carrega regra:

> "Crie e edite as tags disponíveis para os atendentes que operam em todas as filas do Blip Desk."

> "Tornar obrigatória a inclusão de tags em atendimentos finalizados manualmente"

> "Habilitar consulta a histórico de atendimentos no Blip Desk — Permita consultas a informações de
> atendimentos anteriores no Blip Desk. Lembre-se de conceder as permissões na página de Atendentes."

A última é a mais útil: **ver histórico é permissão, não configuração global**. A chave da tela
habilita o recurso; quem pode usar se decide em Atendentes.

## 4. A tabela de Modelos de mensagens

Aqui sim é tabela — mas em `div`, não em `<table>`, e dentro de **um** `bds-paper` que cresce com a
lista inteira: medi **75.451px** de altura. Sem paginação e sem virtualização.

| Medida | Valor |
|---|---|
| Cartão | x=291, y=234, largura 1366,9, fundo `#f6f6f6`, padding 20, raio 16 |
| Título do bloco | repete o título da tela, dentro do cartão |
| Faixa de filtro | dois seletores ("Fluxo de retorno", "Status") + busca de **844,6 × 41,8** |
| Cabeçalho | **14 / 600**, lh 22,4, altura **51,5** |
| Linha | altura **51,5** |
| Zebra | **`#f6f6f6` e `#ededed` alternados, sem fio entre linhas** |

Colunas: Nome **331,7** · Idioma **90** · Mensagem **573,5** · Fluxo de retorno **199** · Status
**66,3**. A mensagem é truncada com um link **"abrir"** no fim; o status é um toggle.

A zebra é a diferença contra a tabela do Monitoramento detalhado (§4.5 do outro doc), que usa linha
de 49px com fio de 0,889px e nenhum fundo alternado. São dois tratamentos de tabela, não um.

## 5. A grade de cartões de canal

`Canais de atendimento`. Grade de quatro colunas.

| Medida | Valor |
|---|---|
| Cartão | **334,7 × 270,8** |
| Fundo | **`rgb(255,255,255)`** — branco, não o `#f6f6f6` dos outros |
| Raio | **16** |
| Gap horizontal | **16px** (291 → 642 → 993) |
| Logo | no topo, ~120px de largura |
| Nome | **16 / 700**, lh 24 |
| Descrição | **14 / 400**, lh 21 |
| Ação | botão no rodapé do cartão: "Conectar ›" (primário) ou "Conectado ✓" (contornado) |

O estado conectado vira um botão contornado com marca de cheque, não some.

## 6. O estado vazio

`Pausas personalizadas` estava vazia, o que rendeu o padrão:

| Elemento | Medida |
|---|---|
| Ilustração | centralizada, ~100×100, caixa aberta |
| Pergunta | **20 / 700**, lh 20, **centralizada**, y=519 |
| Explicação | **16 / 400**, lh 24, centralizada, y=561 (**42px** abaixo) |
| Botão de criar | continua no topo direito, na linha do título |

> "Que tal personalizar os tipos de pausa disponíveis para sua equipe de atendimento?"

> "Pausas personalizadas ajudam atendentes a ter mais autonomia na gestão de tempo e te dão mais
> controle sobre sua operação."

Repare na forma: **pergunta, não aviso**. O estado vazio deles convida em vez de constatar falta. E
a explicação diz o benefício para os dois lados — autonomia para o atendente, controle para o
gestor.

## 7. O que isto quer dizer para o Pipe

Contra as nossas telas de hoje, três divergências reais:

1. **Filas e Regras são tabela aqui e cartão-linha lá.** O cartão-linha carrega menos coluna e
   coloca o liga-desliga na própria lista. A nossa tabela mostra capacidade e teto, que a deles
   esconde no formulário — isso é ganho nosso, e vale manter; o que vale copiar é o toggle na linha
   e o par rótulo-12/valor-16/700.

2. **O formulário de criação é inline aqui e diálogo lá.** "Nova fila" deles abre outra coisa; o
   nosso formulário mora embaixo da lista, sempre visível. Decidir se acompanhamos — o inline
   custa altura de tela em toda visita, e a criação de fila é evento raro.

3. **Não temos o cartão de configuração** com título 20/700, explicação 14/400, toggle da seção e
   Salvar próprio. É o padrão que falta para Regras ├ Atendimento e Preferências ├ Configurações
   gerais, as duas lacunas registradas em `estrutura-gestao.tsx`.

## 8. O que continua sem medida

- **Gestão de atendentes** — aberta na navegação, não medida.
- **Relatórios ├ Calls e Vendas** — não temos telefonia nem funil de vendas na Gestão.
- **O formulário de criação** de fila, regra e pausa: só a lista foi medida.
- **Builder e roteador**, que usam outro casco — continua valendo o registro de que fluxo se desenha
  em tela cheia, sem esta lateral.

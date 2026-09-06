# Blip Desk, medido no DOM vivo

Duas telas coladas pelo Anderson direto do navegador, em 06/09/2026: **Atendimentos** e
**Mensagens ativas**. É a fonte mais confiável que temos do Desk, porque traz o texto de
interface — e o texto de interface carrega regra de negócio que não está no Help.

**Uso.** Somente leitura. Nada de lá entra no repositório. Medida, nome de papel e regra
descrita em português são fato; código é expressão e não se copia.

## 1. Três regras que estavam escritas na tela e em nenhuma spec nossa

### O contato expira em 90 dias

> "Este contato não possui um histórico de conversa ou já expirou (90 dias). Para iniciar uma
> conversa, é necessário enviar uma mensagem ativa."

São **duas janelas**, não uma. A de 24 horas governa se o atendente pode responder livre ou
precisa de template. A de 90 dias governa se o contato ainda tem histórico: passou disso, ele volta
a ser um desconhecido e a conversa recomeça por mensagem ativa.

### Mensagem ativa não é ticket. Vira ticket na resposta

> "Aqui você encontra o status das mensagens ativas enviadas nas últimas 24h. As mensagens que
> receberem uma resposta dentro deste período serão transformadas em tickets e estarão disponíveis
> na aba de Atendimentos. Caso fiquem sem resposta, as mensagens irão expirar e permanecerão na
> lista por mais 48h."

Daí o "últimas 72 horas" no topo da lista: 24 de vida útil mais 48 de rastro. E daí a razão de a
tela ser separada de Atendimentos: um disparo sem resposta não é atendimento nenhum, e contá-lo
como ticket inflaria o volume exatamente como o parent_sequential_id já inflava.

### Existe modo Quadro

O seletor de modo da lista tem **Lista** e **Quadro** — kanban de atendimento, com ícone
builder-carrousel. Não temos.

## 2. Atendimentos, a estrutura

**Trilho vertical**, tema escuro sobre surface-4 (#141414), altura cheia, sem barra superior.
Cinco ícones em cima e três embaixo, com tooltip no canto superior esquerdo de cada um:

| Em cima | Ícone | Embaixo | Ícone |
|---|---|---|---|
| Atendimentos | message-talk | Ajuda | question |
| Mensagens ativas | paperplane | Preferências | settings-general |
| Métricas de atendimento | monitoring | avatar + selo de status | — |
| Contatos | contact | | |
| Ações em massa | ticket | | |

O avatar é extra-small com um selo circular por cima marcando o status. O tooltip dele diz
"Seu status é: Invisível" — o mesmo texto aparece no corpo da lista.

**Coluna da lista**: título 20/700 em h1, seletor de modo ao lado ("Lista" 16 + seta), bloco de
status com *"Seu status é Invisível"* e botão **Ficar Online**, busca com ícone e placeholder
"Busque pelo nome ou telefone...", e as fichas **Todos / Não lidos / Em espera / Inativos**, cada
uma com a contagem no rótulo. Abaixo de certa largura as fichas viram um menu suspenso único.

Estado vazio: ícone grande + *"Você precisa ficar online para atender um novo cliente"*. Com status
online e sem fila: *"Nenhum atendimento aberto"*.

**Centro**: área de soltar arquivo cobrindo a coluna inteira, com *"Solte os arquivos nessa área
para fazer o upload"*. Busca dentro da conversa em duas versões, uma para tela larga e outra para
estreita, com navegação por seta acima/abaixo entre ocorrências.

**Compositor**: campo de texto com *"Escreva uma mensagem..."*, botão de resposta pronta com ícone
"ab" e rótulo acessível "Enviar resposta pronta", campo de arquivo múltiplo escondido, e o botão de
áudio como **primário** — é a ação de maior peso visual da barra.

O painel de resposta pronta abre acima do compositor com três partes: lista, pré-visualização com o
rótulo "Pré-visualização", e o rodapé *"Pressione Enter para selecionar"*. Sem resultado:
*"Não há título de resposta pronta que contenha este texto."*

**Gaveta** à direita, com botão de voltar só em tela estreita.

## 3. Mensagens ativas, a estrutura

Duas colunas: lista à esquerda com cabeçalho *"Mensagens ativas"* (20/700) e botão **Enviar**
primário; painel à direita com 40px de recuo.

Cabeçalho do painel: *"Status geral"* em 24/700, e à direita
*"Última atualização 12:38:56 PM - 09/06/2026"* em 12 com botão **Atualizar** terciário. Divisor de
1px #cfcfcf abaixo.

**Sete cartões de status**, cada um ocupando 30% da faixa, recuo de 16px, fundo surface-1, clicável:

| Cartão | Ícone | Tinta do chip | Descrição |
|---|---|---|---|
| Mensagens agendadas | date-time | neutra | agendadas, ainda não enviadas |
| Enviando | clock | neutra | em trânsito para o destinatário |
| Enviadas | check | neutra | saíram com sucesso |
| Entregues | double-check | sistema | chegaram ao destinatário |
| Lidas | double-check | info | o destinatário abriu |
| Falhas | error | erro | não saíram por falha |
| Expiradas | time-passed | sistema | sem resposta em 24 horas |

Dentro do cartão: título 16/400, valor 24/700 com entrelinha folgada, descrição 12/400 na cor de
conteúdo desabilitado.

**O detalhe que vale copiar** é como a cor de estado é cercada. Ela não pinta texto nem borda:
pinta um chip de ícone de 8px de raio, e ainda por cima de uma camada com 50% de opacidade. Ou
seja, o pastel entra já lavado. É a mesma regra que o packages/ui do Pipe adotou, aplicada num
lugar concreto.

A grade responde por faixa: 30% até 950px, 40% até 650px, 50% abaixo.

Estado vazio da lista: ilustração de avião de papel + *"Nenhuma mensagem foi enviada até o
momento"*.

Alerta de falha parcial: *"Estamos com dificuldades para carregar as mensagens de todos os seus
chatbots ou roteadores"*, com dois botões, **Ok** e **Atualizar status**.

## 4. Tipografia e cor, confirmadas

Nunito Sans em tudo, carregada do Google Fonts nos pesos 300 a 800. A régua que aparece na tela é
12, 14, 16, 20, 24 e 32 — os três primeiros dominam, como o bundle já indicava.

Os tokens exportados pelo CSS confirmam os 31 medidos antes, e acrescentam dois que faltavam:
foco #c226fb e conteúdo "din" #000000.

Escala de espaço: 0, 0.5, 1, 1.25, 1.5, 2.5, 3 e 3.5rem. Transição padrão única, ease-in de 0.25s.

## 5. O que fica registrado como lacuna

1. **Mensagens ativas** — tela inteira, com os sete estados. Não temos.
2. **Modo Quadro** na lista de atendimentos. Não temos.
3. **Ações em massa**. Não temos.
4. **Expiração de 90 dias** do histórico do contato. Não está no modelo de dados.
5. **Busca dentro da conversa**, com navegação entre ocorrências. Não temos.

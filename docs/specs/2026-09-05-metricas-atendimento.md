# Pipe — definições de métricas de atendimento

Anexo do desenho do produto (`2026-09-05-pipe-design.md`, §4.4). Vinculante: todo número que
aparece em tela ou relatório do Pipe Gestão obedece exatamente ao que está aqui, e cada linha desta
tabela tem teste correspondente em `packages/core`.

Base de referência: o modelo da Blip, levantado em `docs/pesquisa/blip-gestao-funcoes.md`. Onde o
Pipe diverge, a divergência está marcada e justificada.

## 1. Os cinco carimbos de tempo

Toda métrica de tempo deriva de cinco marcos gravados em `evento_atendimento`. Nenhuma métrica lê
campo mutável da conversa.

| Marco | Quando é gravado |
|---|---|
| `criada_em` | conversa entra na fila |
| `atribuida_em` | conversa é atribuída a um atendente |
| `primeira_resposta_em` | primeira mensagem do atendente nessa conversa |
| `encerrada_em` | conversa sai da tela do atendente |
| `encerrada_por` | atendente, cliente, inatividade ou transferência |

Reatribuição não sobrescreve `atribuida_em`: grava novo evento. O relatório usa a primeira
atribuição; o painel de transferências usa a sequência completa.

## 2. Métricas de tempo

| Métrica | Fórmula | População |
|---|---|---|
| Tempo na fila | `atribuida_em − criada_em` | conversas que chegaram a ser atribuídas |
| Tempo até 1ª resposta | `primeira_resposta_em − atribuida_em` | conversas que tiveram resposta do atendente |
| Tempo total de espera do cliente | com resposta: `primeira_resposta_em − criada_em`; sem resposta: `encerrada_em − criada_em` | todas as encerradas no período |
| Tempo de resposta | média dos intervalos "mensagem do cliente → próxima mensagem do atendente" | conversas com pelo menos uma troca completa |
| Tempo de atendimento | `encerrada_em − primeira_resposta_em` | conversas que tiveram 1ª resposta |

**Onde o Pipe diverge da Blip.** O "tempo de atendimento" da Blip descarta as conversas que nunca
foram respondidas, o que embeleza o número justamente quando o atendimento vai mal: quanto mais
conversa cai sem resposta, melhor fica a média. O Pipe mantém a métrica com a mesma fórmula, para
ser comparável, mas **sempre a exibe ao lado da contagem de conversas excluídas do cálculo**.
Métrica que esconde o próprio denominador não entra neste produto.

Mesma regra para o tempo até a primeira resposta.

## 3. Tempo real versus período fechado

Duas populações diferentes, que a tela precisa distinguir com clareza:

- **Cartões do topo do monitoramento** (na fila, tempo máximo na fila, tempo máximo até 1ª
  resposta, em atendimento) olham conversas **ainda abertas neste instante**. O cronômetro corre.
- **Cartões de "hoje"** e todo relatório olham conversas **encerradas dentro do período**. O
  cronômetro parou.

Misturar as duas é o erro clássico de painel de atendimento. No Pipe elas ficam em blocos
visualmente separados e rotulados.

## 4. Status de encerramento

| Status | Definição |
|---|---|
| Perdida | cliente saiu **antes** de a conversa ser atribuída a um atendente |
| Abandonada | cliente saiu **depois** de atribuída, inclusive por fechamento automático de inatividade |
| Finalizada | encerrada pelo atendente, ou transferida |
| Fechada | soma das três acima |

A fronteira entre perdida e abandonada é a existência de `atribuida_em`. Perdida é problema de
capacidade ou de fila; abandonada é problema de atendimento. Separá-las é o que torna o número
acionável.

## 5. Média ponderada

Toda média por atendente ou por fila é ponderada por volume: soma dos tempos ÷ soma das conversas.
Nunca média de médias. Dia cheio pesa mais que dia vazio — é a mesma construção do
`weightedAverageOrNull` do blip-dash e da régua de esforço.

## 6. Satisfação

Existem dois modelos incompatíveis no mercado, e a Blip convive com os dois sem unificar:

- **CSAT**, escala 1 a 5 — detrator 1–2, neutro 3, promotor 4–5
- **NPS**, escala 0 a 10 — detrator 0–6, neutro 7–8, promotor 9–10

O Pipe suporta os dois, mas exige que o tenant **escolha um por pesquisa** e guarda a escala junto
da resposta. Sem isso, nota de escalas diferentes acaba somada no mesmo gráfico — que é exatamente
o que acontece hoje quando a empresa tem CSAT nativo e NPS artesanal ao mesmo tempo.

Indicadores: média geral, total de conversas encerradas, total de respostas, **taxa de resposta**
(respostas ÷ encerradas) e comparativo por atendente. A taxa de resposta é obrigatória na tela: sem
ela, uma média de 4,85 com 22% de resposta parece a mesma coisa que 4,85 com 90%.

## 7. Elegibilidade e distribuição

Um atendente pode receber uma conversa quando, ao mesmo tempo: pertence à fila, está online, e tem
vaga — `limite_simultaneo − ativas > 0`. Há um segundo teto independente: número máximo de
conversas atribuídas **ainda sem primeira resposta**, que impede o atendente de acumular fila
própria enquanto não responde ninguém.

Entre os elegíveis, o Pipe escolhe **por carga**, não por rodízio:

1. menor carga ponderada — conversa aguardando resposta do atendente pesa mais que conversa
   aguardando o cliente;
2. empate: quem está há mais tempo sem receber conversa;
3. empate persistente: ordem estável por identificador, para o resultado ser determinístico e
   testável.

A Blip oferece dois rodízios (menos tickets ativos, ou mais tempo ocioso). O Pipe usa o primeiro
critério como principal e o segundo como desempate, porque tempo ocioso sozinho ignora que dez
conversas paradas e dez conversas quentes não são a mesma carga.

## 8. Regras de fila e prioridade

**Regra de fila** avalia condições sobre conteúdo da mensagem, nome, e-mail e campos extras do
contato, com os operadores contém, não contém, igual e diferente, e devolve a fila de destino. Sem
nenhuma regra casada, a conversa cai na fila padrão.

Duas coisas que a documentação da Blip não resolve e o Pipe define explicitamente:

- **Ordem de avaliação**: as regras são ordenadas, avaliadas de cima para baixo, e a primeira que
  casa vence. A ordem é editável e visível na tela.
- **Composição de condições**: cada regra combina condições com E ou OU, escolhido pelo usuário e
  mostrado na interface. Sem isso, ninguém consegue prever o que a regra faz.

**Prioridade** é regra separada da regra de fila — baixa, média e alta —, aplicável à fila inteira
ou sob condição. Conversa com qualquer prioridade fura a fila de conversas sem prioridade.

## 9. Fechamento automático por inatividade

Contagem regressiva que **zera a cada mensagem do cliente**. Configurável por fila, com aviso
opcional ao cliente antes do fechamento. Regra de proteção obrigatória: **não fecha se a última
mensagem foi do cliente**, ou seja, se quem está devendo resposta é o atendente. Sem essa trava, o
número de abandonadas vira um jeito de esconder atendimento ruim.

## 10. Horário de atendimento

Expediente por fila, com fuso do tenant, exceções por feriado e mensagem automática fora do
horário. Conversa que chega fora do expediente entra na fila com marcação própria, e o relógio de
SLA só começa a correr na abertura seguinte — senão todo SLA estoura durante a madrugada.

## 11. SLA

A Blip mantém SLA em beta fechado e sem documentação pública, então aqui não há o que copiar. A
definição do Pipe:

Uma regra de SLA tem alvo (tempo até 1ª resposta, tempo de resposta, ou tempo até encerramento),
prazo, escopo (fila, prioridade ou etiqueta) e duas ações: uma ao atingir o limiar de alerta, outra
ao estourar. Ações possíveis: marcar a conversa, notificar supervisor, elevar prioridade,
reatribuir. O relógio respeita o horário de atendimento da fila e pausa enquanto a conversa aguarda
o cliente.

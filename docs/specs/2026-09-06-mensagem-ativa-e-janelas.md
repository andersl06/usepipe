# Mensagem ativa, as duas janelas e o quadro

Vinculante. Nasce da leitura do DOM do Blip Desk em `referencias-blip/pesquisa/blip-desk-dom.md`, onde três
regras estavam escritas no texto de interface e em nenhuma spec nossa.

## 1. São duas janelas, não uma

O Pipe já trata a **janela de 24 horas** como conceito de primeira classe, em
`packages/core/src/janela/`. Ela responde a uma pergunta: *o atendente pode escrever livre agora,
ou precisa de template?*

Falta a segunda. A **janela de 90 dias** responde a outra: *este contato ainda tem histórico?*

> "Este contato não possui um histórico de conversa ou já expirou (90 dias). Para iniciar uma
> conversa, é necessário enviar uma mensagem ativa."

As duas se parecem e não são a mesma coisa. A de 24 horas conta a partir da **última mensagem do
contato** e governa o modo de envio e o custo. A de 90 dias conta a partir do **fim da última
conversa** e governa se existe fio para retomar. Um contato pode estar com a janela de 24 horas
fechada e o histórico vivo — é o caso comum, de quem falou ontem. E pode estar com as duas
fechadas, que é quando ele volta a ser um desconhecido.

**Modelo.** `contato` ganha `ultima_conversa_em timestamptz`, escrito quando uma conversa é
encerrada. Não é derivado em consulta: a tabela `conversa` é grande e a pergunta é feita a cada
abertura de tela.

**Regra.** Em `packages/core/src/janela/`, ao lado de `JANELA_HORAS`:

```
HISTORICO_DIAS = 90
historicoVivo(ultimaConversaEm, agora): boolean
```

E `avaliarEnvio` passa a distinguir dois motivos de bloqueio onde hoje há um:
`janela_fechada` (tem histórico, precisa de template) e `sem_historico` (não tem fio, precisa de
mensagem ativa). São telas diferentes para o atendente, e é por isso que a distinção importa.

**O número é da Meta, não da Blip.** 90 dias é a janela de retenção que a plataforma oferece; se
mudar, muda no `core` e em nenhum outro lugar.

## 2. Mensagem ativa não é conversa

> "As mensagens que receberem uma resposta dentro deste período serão transformadas em tickets...
> Caso fiquem sem resposta, as mensagens irão expirar e permanecerão na lista por mais 48h."

Esta é a regra mais importante das três, e é uma **decisão de contagem**, não de tela.

Se o disparo virasse `conversa` no momento do envio, todo template não respondido entraria no
volume de atendimento. O efeito é o mesmo que já medimos nos dados reais da Blip, onde contar
ticket ingenuamente inflava o volume em cerca de 45% por causa das transferências: o número cresce,
a operação não. E aqui seria pior, porque um disparo sem resposta não é atendimento ruim — não é
atendimento nenhum.

**Modelo.** Tabela `mensagem_ativa`, particionada por mês como `mensagem`:

| Coluna | Tipo | Por quê |
|---|---|---|
| `tenant_id` | uuid | isolamento, como toda tabela de negócio |
| `contato_id` | uuid | destinatário |
| `canal_id` | uuid | por onde saiu |
| `template_id` | uuid | o que foi enviado |
| `parametros` | jsonb | os valores por posição; o texto vive na Meta |
| `estado` | text + check | ver abaixo |
| `agendada_para` | timestamptz | nulo quando é envio imediato |
| `enviada_em`, `entregue_em`, `lida_em`, `falhou_em`, `expira_em` | timestamptz | os carimbos que o webhook preenche |
| `motivo_falha` | text | o que a Meta devolveu |
| `conversa_id` | uuid | **preenchido só quando o cliente responde** |

Os sete estados, iguais aos que a tela deles mostra e que os relatórios vão contar:
`agendada`, `enviando`, `enviada`, `entregue`, `lida`, `falha`, `expirada`.

**A transição que importa** é `entregue|lida` + resposta do contato dentro de 24 horas → cria
`conversa` e grava `conversa_id`. Antes disso, nada de conversa existe.

**Retenção.** `expira_em` é o envio mais 24 horas. A linha some da tela 48 horas depois disso, mas
**não é apagada**: fica para o relatório de eficácia de disparo, que é justamente onde a diferença
entre enviada e respondida vira informação de negócio.

**No relatório.** Mensagem ativa nunca entra em TMR, TME nem TMA. Ela tem métrica própria: taxa de
entrega, taxa de leitura e **taxa de conversão em conversa**, que é a única que interessa a quem
paga o template.

## 3. Quadro é kanban de atendimento

O seletor de modo da lista do Desk tem **Lista** e **Quadro**. Não é o quadro de oportunidades do
CRM, e confundir os dois seria caro.

| | Quadro do Desk | Quadro do CRM |
|---|---|---|
| Cartão | conversa | oportunidade |
| Coluna | estado da conversa ou fila | etapa do funil |
| Quem usa | atendente e supervisor | vendedor |
| Arrastar significa | mudar fila ou estado | avançar etapa |
| Vida útil do cartão | horas | semanas |

A decisão pendente é **o que vira coluna**. Fila é o mais provável, porque é como o trabalho já se
divide e como a distribuição por carga funciona. Estado é a alternativa. Por SLA — no prazo, perto
de estourar, estourado — seria o mais útil para supervisor, e o mais estranho para atendente.

Fica registrado como pergunta aberta, com a recomendação de **fila**, e a observação de que o mesmo
componente de quadro pode servir aos dois aplicativos se a coluna for parâmetro.

## 4. Ordem de construção

1. `historico_vivo` no `core` e a coluna em `contato` — é pequeno e desbloqueia a tela certa de
   bloqueio no compositor.
2. `mensagem_ativa` com os sete estados e a transição para conversa.
3. A tela de Mensagens ativas no Desk, que é a leitura dessa tabela.
4. Quadro, depois que a coluna estiver decidida.

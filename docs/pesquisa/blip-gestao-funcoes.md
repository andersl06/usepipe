# Blip Portal — Módulo Atendimento (gestão) — Requisitos funcionais para o Pipe

> Levantamento feito a partir da central de ajuda pública da Blip (help.blip.ai). Texto reescrito
> com palavras próprias; comportamento e regras de negócio não são objeto de copyright, mas as
> definições abaixo são paráfrases da documentação original, nunca cópia literal.

---

## 1. Monitoramento

Tela de acompanhamento em tempo real da operação do dia corrente (não permite olhar dias
anteriores — para isso existe o Relatório/Histórico). Atualiza sozinha a cada 30s (ou manualmente).
Exige permissão Helpdesk (View ou View e Edit). Quando um valor é zero, o sistema mostra "0" ou
"00:00:00" conforme a unidade; quando não há dado suficiente, mostra "-".

### Filtros
Filtro de fila afeta todas as seções. Filtro de atendente afeta as seções "Atribuído/Em
andamento", Atendentes, Filas e Tags (não afeta "Aguardando atendimento", pois esses tickets ainda
não têm atendente). Existe também filtro por status de atendente na seção Atendentes.

### Indicadores gerais (topo da tela)
- **Tickets na fila** — quantidade de tickets ainda não atribuídos a nenhum atendente, somando
  todas as filas (ou as filtradas).
- **Tempo máximo de espera na fila** — maior tempo, entre os tickets que estão na fila agora,
  aguardando atribuição.
- **Tempo máximo até a 1ª resposta** — maior tempo, entre os tickets já atribuídos e ainda sem
  resposta do atendente, desde a atribuição.
- **Tickets em atendimento** — tickets já atribuídos/puxados por um atendente e que já receberam a
  1ª resposta, mas que ainda não foram fechados.
- **Média de tickets por atendente** — quantidade média de tickets atualmente atribuídos, dividida
  pelo número de atendentes considerados.

### Status de atendentes hoje
Online (disponível para novos tickets), Em pausa (pausa padrão ou pausa personalizada) e Invisível
(indisponível para receber tickets).

### Tickets fechados hoje — tempos
Ver definições exatas na seção 12 (tabela de métricas) — os cálculos de tempo médio de espera
total, tempo médio de resposta, tempo médio até 1ª resposta e tempo médio de atendimento seguem a
mesma lógica usada no Relatório de Atendimento.

### Tickets fechados hoje — status
Perdido, Abandonado, Finalizado e Fechado (soma dos três) — ver definições na seção 12.

### Aba "Atribuído/Em andamento" (ex-"Tickets em atendimento")
Lista linha a linha: tempo de espera na fila até ser atribuído, tempo até a 1ª resposta, contato,
fila, atendente, tempo em atendimento e número do ticket (com atalho para transferir). A linha fica
destacada em amarelo enquanto o contato aguarda a 1ª resposta do atendente.

### Aba "Aguardando atendimento" (ex-"Tickets na fila")
Lista os tickets ainda não atribuídos: tempo na fila, contato, fila, número do ticket e
**prioridade** (definida pelas regras de priorização — ver seção 3).

### Seção Agentes
Uma linha por atendente: tickets em atendimento (conta todos os atribuídos, mesmo sem 1ª
resposta ainda), tempo médio de resposta e tempo médio de atendimento do atendente. O gestor pode
**desconectar um atendente inativo** que ficou "online" por engano — o sistema avisa o atendente e,
se ele não confirmar em 1 minuto, o status muda; tickets já em curso não são redistribuídos
automaticamente.

### Seção Filas
Uma linha por fila: tickets aguardando, tickets em andamento, tempo médio de espera, tempo médio de
resposta e tempo médio de atendimento daquela fila.

### Seção Tags
Uma linha por tag, com tickets finalizados com aquela tag e o tempo médio de atendimento desses
tickets. Um ticket com mais de uma tag aparece uma vez em cada tag (dado contado em duplicidade
entre tags).

### Ações na tela de monitoramento
O gestor pode abrir a conversa de qualquer ticket em andamento ou em fila, transferir para outra
fila/atendente e até encerrar o ticket direto pela tela de monitoramento (com opção de adicionar
tags no fechamento). Há também modo tela cheia (para TV/monitor), que mostra também "Tickets
abertos por hora" (média de tickets abertos por hora no dia).

**Novidade (abr/2025):** filtros salvos (armazenados no navegador, não na conta do usuário — não
replicam entre máquinas) e um chat gestor→atendente direto pela tela de monitoramento. A partir
dessa versão também aparece um **indicador de SLA** na coluna de tempo de atendimento (ligado à
funcionalidade "Regras de SLA" — ver Lacunas).

Fonte: https://help.blip.ai/hc/en-us/articles/14932635417879-Service-monitoring ·
https://help.blip.ai/hc/pt-br/articles/31725666105623-Novo-Monitoramento-no-Blip-Desk-mudan%C3%A7as-na-tela-e-novas-funcionalidades

---

## 2. Regras de Atendimento (roteamento para fila)

Uma regra de atendimento decide para qual fila (time) um atendimento humano é direcionado.

### Estrutura de uma regra
- **Origem do dado (Se)**: conteúdo da mensagem do usuário, nome do contato, e-mail do contato ou
  campos extras do contato.
- **Operador**: contém / não contém / é igual a / é diferente de.
- **Valor esperado**: texto alfanumérico de comparação (pode-se adicionar mais de um valor,
  apertando Enter a cada um).
- **Fila de destino**: a fila que recebe o ticket se a regra for verdadeira.
- Se **nenhuma regra** for satisfeita, o contato cai na **fila padrão (Default)**.
- É possível combinar mais de uma condição na mesma regra (botão "Adicionar condição").

A documentação não deixa explícito se, havendo múltiplas regras cadastradas, a avaliação é
sequencial (primeira que casar vence) ou se há prioridade configurável entre regras — ver Lacunas.

Fonte: https://help.blip.ai/hc/en-us/articles/4474425334423-How-to-Manage-Queues-and-Service-Rules-in-Blip

---

## 3. Priorização de atendimento

Regra separada da regra de atendimento, usada para ordenar a fila de espera.

- **Nível de urgência**: baixa, média ou alta — importante: um ticket com prioridade **baixa**
  ainda fura a frente de um ticket **sem nenhuma prioridade** atribuída.
- Pode-se marcar "Aplicar condições a esta regra de priorização"; se essa caixa não for marcada, a
  prioridade escolhida vale para **todo** ticket que cair naquela fila, sem filtro.
- Quando há condição, ela usa a mesma estrutura das regras de atendimento: origem (mensagem, nome,
  e-mail, campos extras), operador (contém/não contém/igual/diferente) e valor.
- A prioridade só é aplicada quando o ticket é atribuído a uma fila que tenha regras de priorização
  cadastradas.

Fonte: https://help.blip.ai/hc/en-us/articles/4474425334423-How-to-Manage-Queues-and-Service-Rules-in-Blip ·
https://help.blip.ai/hc/en-us/articles/4474382428567-Service-Prioritization

---

## 4. Regras de SLA

Só foi encontrada uma menção à funcionalidade "Regras de SLA" como recurso em beta fechado, ligado
ao novo indicador visual de SLA que aparece na tela de Monitoramento (coluna "Tempo de
Atendimento"). Não há artigo público detalhando os gatilhos, os limites configuráveis nem o que
acontece quando o SLA estoura — ver Lacunas.

Fonte (menção): https://help.blip.ai/hc/pt-br/articles/31725666105623-Novo-Monitoramento-no-Blip-Desk-mudan%C3%A7as-na-tela-e-novas-funcionalidades

---

## 5. Horário de funcionamento / mensagem fora do expediente

O horário de atendimento humano não é uma tela isolada de "regras": ele é resolvido em duas
pontas —

1. **No Builder**, no bloco de Atendimento Humano, aba "Condições de saída", existe a condição
   "+ Condição por horário de atendimento", que define para qual etapa do fluxo o contato vai
   quando a operação está fora do expediente configurado.
2. **No Portal**, dentro do menu Atendimento, é possível cadastrar os horários (por dia da semana,
   com múltiplos intervalos por dia) que alimentam essa condição — versões mais novas da
   plataforma trouxeram uma interface própria para isso dentro do próprio menu Atendimento,
   reduzindo a necessidade de mexer em variáveis de configuração manualmente no Builder.
3. Também é possível fazer o mesmo controle checando feriados via planilha (abordagem antiga, via
   fórum/comunidade) e há um caminho alternativo "via Script" para montar a lógica de horário
   manualmente.

Distinto disso, existe a **Verificação de disponibilidade de atendentes**, que decide o
transbordo quando não há ninguém online (ver seção 7).

Nota de acesso: o artigo específico "How to configure the new interface in your bot's opening
hours" está indexado pelo buscador da Blip mas retornou "página não existe" nas tentativas de
acesso direto durante esta pesquisa — ver Lacunas.

Fonte: https://help.blip.ai/hc/en-us/articles/6299998786199-FAQ-Service ·
https://help.blip.ai/hc/en-us/articles/13142639483031-How-to-configure-the-new-interface-in-your-bot-s-opening-hours (link indexado, indisponível no fetch) ·
https://help.blip.ai/hc/en-us/articles/4403547742743-How-to-Set-Up-Business-Hours-Using-a-Script

---

## 6. Filas (Gerenciamento de filas)

Tela central da operação: é onde se criam filas, associam atendentes e cadastram as regras de
atendimento e priorização (seções 2 e 3).

- **Criar fila**: nome da fila (botão "+ Nova fila").
- **Atribuir atendentes**: dentro da fila, seção "Atendentes atribuídos" → "+ Adicionar
  atendentes" → seleciona os atendentes disponíveis.
- **Tags da fila**: tags cadastradas em uma fila só ficam disponíveis para tickets daquela fila
  (usadas pelo atendente ao fechar o atendimento).
- Regras de atendimento e de priorização são configuradas dentro do painel da própria fila.

Permissão exigida: Helpdesk > View e Edit.

Fonte: https://help.blip.ai/hc/en-us/articles/4474425334423-How-to-Manage-Queues-and-Service-Rules-in-Blip

---

## 7. Atendentes

### Cadastro
Quem criou o bot, ou qualquer pessoa com permissão de escrita no módulo de atendimento, pode
adicionar atendentes. Para adicionar: e-mail do atendente (precisa ter conta Blip válida) + nome
da fila à qual ele será associado (pode adicionar vários e-mails de uma vez, separados por vírgula
ou quebra de linha, para a mesma fila). Editar/excluir atendente é feito passando o mouse sobre o
nome e usando os ícones de lápis/lixeira.

### Permissões / perfis
O acesso tem duas camadas:
1. **Nível de contrato**: um usuário precisa ser convidado como membro do contrato (papel definido
   pelo administrador do contrato).
2. **Nível de bot**: dentro de cada bot, o administrador concede permissões por módulo (Helpdesk,
   Canais, IA, Configurações, Analytics, Builder etc.), cada uma com granularidade própria (ex.:
   Helpdesk = "View" ou "View e Edit"; Builder = apenas "Write" ou "sem permissão").
Não existe um "perfil de atendente" pronto — o que existe é a combinação de permissões concedidas
módulo a módulo por bot.

### Limite de atendimentos simultâneos
Configurado em Atendimento → Preferências/Configurações gerais → "Tickets por atendente" (valor
default para todos) — pode ser sobrescrito individualmente por atendente em Atendimento →
Atendentes → editar atendente → desativar "usar configuração padrão" → definir limite customizado.
Desde uma atualização recente (2024/2025) existe também um **segundo limite independente**: número
máximo de tickets que um atendente pode acumular **sem ter mandado a 1ª resposta**; ao bater nesse
teto, o atendente para de receber novos tickets automaticamente até responder pelo menos um dos
pendentes — mesmo que ainda tenha vaga no limite geral.

### Distribuição automática (algoritmo de elegibilidade e desempate)
Antes de mandar um ticket para um atendente, o sistema checa 3 critérios: (1) o atendente pertence
à fila do ticket; (2) está com status "Online"; (3) tem vaga livre (limite configurado menos
tickets ativos > 0). Havendo mais de um elegível, dois modos de rodízio, configuráveis pelo gestor:
- **Padrão** — prioriza quem tem **menos** tickets ativos; em empate, quem está há mais tempo sem
  receber ticket.
- **Alternativo** — prioriza quem está há **mais tempo sem receber** ticket; em empate, quem tem
  menos tickets ativos.
Também dá para desligar a distribuição automática e/ou impedir que o atendente puxe ticket
manualmente pelo botão "Atender" (ficando só a distribuição automática como fonte de novos
tickets).

### Times/equipes
Não existe uma entidade "time" separada da fila — a fila é, na prática, a unidade de agrupamento
de atendentes (ex.: fila "Financeiro", "Suporte", "Vendas").

### Verificação de disponibilidade de atendentes
Duas variantes: **geral** (olha se existe algum atendente online em qualquer fila antes do
transbordo — recomendada só quando há uma única fila) e **por fila** (olha se existe atendente
online especificamente na fila de destino, evitando cair numa fila vazia). Configuração acontece
em duas pontas: condição de saída "Se não há atendentes disponíveis" no bloco de Atendimento Humano
do Builder, e o switch "verificação de disponibilidade de agentes por fila" em Atendimento →
Configurações gerais, no Portal.

### Pausas personalizadas
Menu Atendimento → Pausas personalizadas. O gestor cria pausas com nome e duração em minutos
(ex.: para atender à NR-17 ou política interna). No Desk, o atendente que escolhe o status "Pausa"
seleciona o motivo entre as pausas cadastradas; a duração é só um cronômetro de referência — o
status não volta sozinho para "Online" quando o tempo estoura, é preciso trocar manualmente. Dados
de pausa entram no relatório de Produtividade (seção 9).

Fontes: https://help.blip.ai/hc/en-us/articles/4474417862423-How-to-Add-Agents-in-Blip-Desk ·
https://help.blip.ai/hc/en-us/articles/5449171341719-Managing-Access-Permissions ·
https://help.blip.ai/hc/en-us/articles/18694892640791-How-Automatic-Ticket-Distribution-Works-in-Blip-Desk ·
https://help.blip.ai/hc/pt-br/articles/31713269913239-Limite-de-Tickets-Aguardando-1%C2%AA-Resposta ·
https://help.blip.ai/hc/en-us/articles/15952255592855-Agent-Availability-Check ·
https://help.blip.ai/hc/en-us/articles/9801236103063-Custom-Breaks

---

## 8. Preferências de atendimento

Na documentação, boa parte do que o usuário chamaria de "Preferências" está no menu Atendimento →
**Configurações gerais** (não confundir com "Preferences in Blip Desk", que são preferências do
próprio atendente, como som/notificação — fora do escopo deste levantamento, que é o app de
gestão).

- **Distribuição automática** — ver seção 7 (modo padrão vs. alternativo, limite por atendente,
  limite de tickets sem 1ª resposta, permitir/impedir puxar ticket manualmente).
- **Encerramento automático por inatividade do cliente** — precisa de configuração nas duas
  pontas (Builder: identificar a condição de saída "ticket finalizado por inatividade do cliente";
  Portal: tempos e regras). No Portal define-se: tempo de inatividade (inteiro > 0, em minutos ou
  horas); se o fechamento só vale para tickets que já receberam 1ª resposta ou para qualquer
  ticket; envio de aviso de inatividade ao cliente antes do fechamento (com tempo de antecedência e
  texto da mensagem — precisa ser menor que o tempo total de fechamento); tags automáticas no
  fechamento por inatividade; remoção automática do ticket da tela do atendente ao fechar.
  A contagem de inatividade **zera a cada mensagem do cliente** (mensagem do atendente não reseta o
  contador); há uma variação de contagem ("não fechar se o cliente está esperando resposta do
  atendente") em que o contador só roda depois que o atendente já respondeu e está esperando o
  cliente. O tempo de inatividade configurado precisa ser **menor** que o timeout de sessão do
  Builder, senão a sessão expira antes.
- **Alerta de tempo máximo de resposta do atendente** — switch em Configurações gerais; define um
  tempo (segundos/minutos/horas/dias) de inatividade do atendente após receber mensagem do
  cliente; passado esse tempo aparece um ponto vermelho no ticket, some quando o atendente
  responde; conta reinicia a cada nova mensagem do cliente.
- **Verificação de disponibilidade de atendentes por fila** — ver seção 7.
- **Transferência de tickets** — switch "Transferir tickets" em Configurações gerais permite
  transferência manual de atendimentos em curso mesmo que todos os atendentes da fila estejam
  offline; essa opção só cobre transferência manual, não afeta a distribuição automática/transbordo.
- **Tipos de pausa** — ver "Pausas personalizadas" na seção 7.

Não foi encontrada, na documentação pública, uma tela chamada literalmente "transbordo" como
funcionalidade única — o que existe são as condições de saída "sem atendente disponível" (Builder +
verificação de disponibilidade) e "fora do horário de atendimento" (seção 5), cada uma
configurada separadamente.

Fontes: https://help.blip.ai/hc/en-us/articles/18694892640791-How-Automatic-Ticket-Distribution-Works-in-Blip-Desk ·
https://help.blip.ai/hc/en-us/articles/4474433590679-Automatic-Closure-due-to-Client-Inactivity ·
https://help.blip.ai/hc/en-us/articles/14977630221975-Maximum-Response-Time-Alert-for-the-Attendant ·
https://help.blip.ai/hc/en-us/articles/15952255592855-Agent-Availability-Check

---

## 9. Relatório de Atendimento

Histórico (não tempo real) de até **90 dias** por consulta na tela; para períodos maiores, existe
o "Gerenciador de relatórios" à parte. Permissão: Helpdesk View ou View e Edit.

### Filtros
Canal, atendente, fila e tag (todos multiseleção) valem para todas as seções, **exceto**
Produtividade. Período é o único filtro que vale para todas as seções, inclusive Produtividade —
de 1 dia até 90 dias, com atalhos (hoje, ontem, últimos 7/15/30 dias).

### Seções e o que cada uma mostra
- **Tempo máximo**: tempo máximo de espera na fila e tempo máximo até a 1ª resposta, calculados só
  sobre tickets já fechados no período (ver definição exata na seção 12).
- **Status dos tickets**: Aberto, Perdido, Abandonado, Finalizado, Fechado (definições na seção 12).
- **Tempo médio**: tempo médio de espera na fila, tempo médio até 1ª resposta, tempo médio total de
  espera, tempo médio de resposta, tempo médio de atendimento (definições na seção 12).
- **Abertos x Fechados**: gráfico de linha por dia no período (linha escura = abertos, linha clara
  = fechados).
- **Atendentes**: por atendente — tickets finalizados, tempo médio até 1ª resposta, tempo médio de
  espera, tempo médio de resposta, tempo médio de atendimento.
- **Filas**: mesmas métricas do bloco Atendentes, mas agrupadas por fila.
- **Tags**: mesmas métricas, agrupadas por tag (ticket com várias tags conta em cada uma).
- **Produtividade**: por atendente — tempo total Online, tempo em Pausa, tempo Invisível e Tempo
  total logado (soma dos três). Exportável em dois arquivos CSV separados: "Produtividade" (mesmas
  5 colunas da tela) e "Pausas" (atendente, data, nome da pausa, início, fim, duração de cada
  pausa individual).

Fonte: https://help.blip.ai/hc/en-us/articles/14913405614743-Report-of-Support

---

## 10. Relatório de Satisfação

Coexistem **dois modelos diferentes** de captura de satisfação na plataforma — isso é relevante
para o Pipe decidir se replica um, o outro, ou unifica os dois:

### a) Análise de Satisfação (nativo do Portal — escala 1 a 5)
Exige a versão 3.0 do bloco de Atendimento Humano no Builder, com a condição de saída "exibir
apenas blocos de pesquisa de satisfação" apontando para um bloco de pesquisa dedicado. Nota vai de
1 a 5: **1–2 = insatisfeito/detrator, 3 = neutro, 4–5 = satisfeito/promotor**. Só funciona em
PT-BR. Dados ficam disponíveis por até 3 meses, atualizados a partir do dia seguinte ao
atendimento.

Métricas: média geral de satisfação; total de tickets fechados (perdidos+abandonados+finalizados);
total de respostas (parcial = só nota, completa = nota + comentário); taxa de resposta (respostas
/ tickets fechados); gráfico de pizza (insatisfeito/neutro/satisfeito/sem resposta); comparação
entre filas ou atendentes (barras); série temporal de média geral e taxa de resposta; e tabelas
segmentadas (Geral — uma linha por resposta individual; Filas — média, total de tickets, total de
respostas, sem resposta, insatisfeitos/neutros/satisfeitos por fila; Atendentes — mesmas colunas
por atendente). Filtros: pesquisa, categoria (detrator/neutro/promotor), fila, atendente, contato e
período (até 90 dias), com filtros salvos.

### b) NPS artesanal (montado no Builder — escala 0 a 10)
Não é uma tela pronta: o gestor monta manualmente um bloco de nota após o atendimento, normaliza o
valor (script) e grava via "Registro de Eventos" para aparecer num Relatório Personalizado (módulo
Analytics). Classificação: **Detrator 0–6, Neutro 7–8, Promotor 9–10** — note que essa faixa é
diferente da faixa 1–5 usada na Análise de Satisfação nativa.

Fontes: https://help.blip.ai/hc/en-us/articles/21974005289623-Satisfaction-Analysis ·
https://help.blip.ai/hc/pt-br/articles/5423911157911-NPS-Pesquisa-de-Satisfa%C3%A7%C3%A3o

---

## 11. Histórico de Atendimentos

Lista todo ticket **fechado** dentro do período filtrado; permite ver e baixar a transcrição da
conversa. Permissão: Helpdesk View ou View e Edit.

### Filtros
Contato (nome, e-mail ou telefone — depende do fluxo capturar esse dado), atendente, fila, tags,
ID do ticket, e período (data e hora, sempre baseado na data de **abertura** do ticket).

### Limites de extração
- Consulta na tela e download individual da transcrição: até **90 dias**.
- Lista de tickets (via e-mail) para períodos além de 90 dias: até **1 ano**.
- Transcrição completa (ticket específico ou todo o histórico de um contato) via e-mail, para
  períodos além de 90 dias: até **5 anos**.
Pedidos de período >90 dias não mostram a lista na tela — o sistema oferece os botões "Lista de
tickets" ou "Transcrição da conversa", processa em segundo plano e manda o resultado por e-mail
(ou avisa por e-mail se não achou nada).

Fonte: https://help.blip.ai/hc/en-us/articles/4474418319383-Service-History

---

## 12. Relatório de Vendas (breve, fora do foco central)

Analisa tickets finalizados classificados como venda fechada ou perdida (via tags/filas
configuradas). Indicadores: tempo médio de conversão (do início ao fechamento da venda), taxa de
conversão (% fechados como venda), taxa de perda (% marcados como perda), total de vendas por
período e funil de vendas segmentado por tag/fase. Filtros: vendedor, fila, período (até 90 dias).
Configuração fica em Atendimento → Relatório de Vendas → "Configurar relatório", onde se define
quais tags/filas identificam venda fechada e venda perdida.

Fonte (via FAQ, artigo dedicado indexado mas não acessível no fetch desta pesquisa):
https://help.blip.ai/hc/pt-br/articles/32766952982807-FAQ-Relat%C3%B3rios ·
https://help.blip.ai/hc/en-us/articles/19572677484183-Sales-Report (link indexado, indisponível no fetch)

---

## 13. Relatório de Calls

Não foi localizado nenhum artigo de central de ajuda descrevendo um "Relatório de Calls"
dedicado. Existe a funcionalidade **Blip Calls** (ligações de voz feitas de dentro do Desk,
integradas ao WhatsApp), mas a documentação encontrada cobre apenas como fazer a ligação, sem
descrever indicadores/relatório de chamadas — ver Lacunas.

---

## Definições de métricas (tabela)

| Métrica | O que mede | Início do cronômetro | Fim do cronômetro / condição |
|---|---|---|---|
| Tickets na fila | Volume de tickets aguardando atribuição, no momento (monitoramento) | — | — (contagem instantânea) |
| Tempo máximo de espera na fila | Maior espera na fila até ser atribuído a um atendente | Criação do ticket (StorageDate) | Atribuição ao atendente (OpenDate). No monitoramento, olha tickets ainda na fila; no relatório, olha o maior valor entre tickets já fechados no período |
| Tempo máximo até 1ª resposta | Maior espera, após atribuído, até a 1ª mensagem do atendente | Atribuição (OpenDate) | 1ª resposta do atendente (FirstResponseDate). No relatório, só tickets fechados no período que chegaram a receber 1ª resposta |
| Tickets em atendimento / Em andamento | Tickets atribuídos que já tiveram 1ª resposta e ainda não fecharam | Atribuição | Ainda aberto |
| Média de tickets por atendente | Carga média corrente por atendente | — | — (tickets atribuídos ÷ atendentes) |
| Tempo médio de espera na fila | Média do tempo até a atribuição | Criação (StorageDate) | Atribuição (OpenDate) — só tickets fechados no período, já removidos da tela do atendente |
| Tempo médio até 1ª resposta | Média do tempo de reação do atendente após receber o ticket | Atribuição (OpenDate) | 1ª resposta (FirstResponseDate) — exclui tickets fechados sem nenhuma resposta do atendente |
| Tempo médio total de espera | Média do tempo até o cliente ser efetivamente atendido pela 1ª vez | Criação (StorageDate) | 1ª resposta, quando houve; se não houve nenhuma resposta do atendente, usa o fechamento (CloseDate) no lugar — depois soma os dois grupos e divide pelo total de fechados |
| Tempo médio de resposta | Velocidade de resposta do atendente durante a conversa | Mensagem do cliente | Resposta do atendente — só conta em tickets com pelo menos 1 troca completa (cliente→atendente) |
| Tempo médio de atendimento | Duração do atendimento em si | 1ª resposta do atendente (FirstResponseDate) | Fechamento (CloseDate) — só tickets que tiveram 1ª resposta |
| Tempo total do ticket | Ciclo de vida completo do ticket | Criação (StorageDate) | Fechamento (CloseDate), independente de ter havido atendimento |
| Tickets perdidos | Cliente desistiu **antes** de ser atribuído a alguém | — | Status ClosedClient/ClosedClientInactivity com AgentIdentity vazio; exige condição de saída configurada no fluxo |
| Tickets abandonados | Cliente desistiu **depois** de já atribuído a um atendente (ou fechamento automático por inatividade) | — | Status ClosedClient/ClosedClientInactivity com AgentIdentity preenchido |
| Tickets finalizados | Atendimento concluído pelo atendente ou transferido | — | Status ClosedAttendant (ou ClosedClientInactivity, dependendo do relatório) |
| Tickets fechados | Total de tickets encerrados no período, qualquer motivo | — | Coluna Closed = true; soma de perdidos + abandonados + finalizados |
| Tickets abertos | Volume de tickets criados no período | Criação (StorageDate) | — (contagem, sem exigir fechamento) |

---

## Lacunas

1. **Ordem de avaliação de regras de atendimento**: não é explicado se, havendo várias regras
   cadastradas na mesma fila/bot, a primeira regra que casar vence, ou se existe alguma prioridade
   configurável entre regras concorrentes.
2. **Lógica AND/OR dentro de uma regra**: ao adicionar múltiplos valores dentro do mesmo campo, ou
   múltiplas condições numa regra de atendimento/priorização, a documentação não deixa claro se a
   combinação é "E" (todas precisam bater) ou "OU".
3. **Regras de SLA**: só existe menção a um recurso em beta fechado, sem artigo público descrevendo
   os limites configuráveis, o que dispara o alerta de SLA nem o que acontece ao estourar (escalar
   automaticamente? notificar gestor? mudar prioridade?).
4. **Horário de funcionamento (tela nova)**: o artigo específico sobre a "nova interface" de
   horário de atendimento está indexado pela busca da Blip, mas retornou "página não encontrada"
   em todas as tentativas de acesso direto nesta pesquisa — não foi possível confirmar o desenho
   exato da tela (por dia da semana, feriados, múltiplos intervalos por dia).
5. **Relatório de Calls**: nenhum artigo encontrado; só há documentação de como originar uma
   ligação (Blip Calls), não de indicadores/relatório dessas ligações.
6. **Relatório de Vendas**: o artigo dedicado está indexado pela busca mas não pôde ser aberto
   diretamente nesta pesquisa; os detalhes vieram só do resumo indireto do buscador e do FAQ.
7. **Dois modelos de satisfação não unificados**: a "Análise de Satisfação" nativa usa escala 1–5
   (detrator 1–2 / neutro 3 / promotor 4–5), enquanto o NPS "artesanal" via Builder usa escala
   0–10 (detrator 0–6 / neutro 7–8 / promotor 9–10). Não há indicação de um relatório único que
   unifique as duas abordagens — decisão de produto a tomar no Pipe.
8. **Regras de horário x Verificação de disponibilidade de atendentes**: são duas condições de
   saída independentes no Builder (fora do horário vs. sem atendente online); não ficou claro se
   existe alguma composição/prioridade entre as duas quando ambas as condições são verdadeiras ao
   mesmo tempo.
9. **WebFetch direto ao help.blip.ai retornou HTTP 403** durante toda a pesquisa; todo o conteúdo
   acima foi obtido via navegação de browser (sessão logada) ou resumos do buscador — alguns links
   indexados (itens 4 e 6 acima) não puderam ser abertos por nenhuma das duas vias.

# Pipe Desk — requisitos funcionais

Anexo do desenho do produto (`2026-09-05-pipe-design.md`, §4.3). Levantado a partir do
comportamento do Blip Desk documentado em `docs/pesquisa/blip-desk-funcoes.md`, com as
divergências do Pipe marcadas e justificadas.

O princípio que governa esta tela: **o Desk não tem relatório, não tem regra e não tem
configuração de fila.** Tudo isso mora no Pipe Gestão. Se uma função exige decidir sobre a
operação em vez de conduzir um atendimento, ela não pertence aqui.

## 1. Estado do atendente

Quatro estados: **Online**, **Pausa**, **Invisível** e **Offline**. Só o último é automático
(queda de conexão ou sessão encerrada); os outros três são sempre escolha manual.

- Nenhum estado expira sozinho. O atendente sai da pausa quando decide sair.
- O padrão ao entrar é **Invisível** — ninguém recebe conversa sem afirmar que está pronto.
- **Pausa exige motivo**, escolhido de uma lista que o gestor cadastra, com duração sugerida por
  motivo. O tempo em cada motivo alimenta o relatório de ocupação.
- Só quem está **Online** entra na distribuição.

**Divergência do Pipe:** a duração sugerida é sugestão, não corte automático — mas a pausa que
ultrapassa a duração sugerida aparece destacada no monitoramento do gestor. Cortar sozinho joga
conversa para quem foi ao banheiro; não mostrar nada esconde a pausa de duas horas.

## 2. Recebimento, capacidade e prioridade

Um atendente recebe conversa quando pertence à fila, está Online e tem vaga.

- **Limite de conversas simultâneas**: valor global do tenant, sobrescrevível por atendente.
- **Segundo limite, independente**: máximo de conversas atribuídas ainda **sem primeira resposta**.
  Impede que o atendente acumule fila própria enquanto não responde ninguém.
- **Prioridade** (baixa, média, alta) vem da regra de fila e ordena a distribuição. Qualquer
  prioridade fura a fila de conversas sem prioridade.
- **Puxada manual** de conversa da fila é permissão configurável — o gestor pode desligar para
  forçar a distribuição automática.
- **Fixar conversa** no topo da própria lista, para acompanhar caso em andamento.
- **Modo de espera**: pausa uma conversa específica sem que a inatividade do cliente conte para o
  fechamento automático.

**Divergência do Pipe:** no Blip, o modo de espera congela a inatividade mas o tempo de atendimento
continua correndo, o que pune o atendente por uma espera que não é dele. No Pipe, o modo de espera
**pausa também o relógio de SLA e o tempo de atendimento**, e o intervalo pausado aparece em coluna
própria no relatório. Pausa que some do número vira desculpa; pausa visível vira gestão.

## 3. Transferência

- **Individual**, para outra fila ou outro atendente, com motivo obrigatório.
- **Em massa**, com seleção múltipla, para transferir ou encerrar em lote.

**Divergência do Pipe:** no Blip, transferir encerra o ticket como "Transferido" e abre um novo que
herda a prioridade mas **perde as etiquetas**. No Pipe a conversa é **a mesma**, com histórico
contínuo e etiquetas preservadas; a transferência é um evento na linha do tempo. Perder etiqueta na
transferência quebra tanto o relatório quanto a monitoria, porque a conversa avaliada deixa de ser
a conversa que aconteceu.

## 4. Encerramento

- **Etiquetas de encerramento**, com a opção de marcar algumas como exclusivas por fila e outras
  como obrigatórias antes de fechar.
- **Fechamento automático por inatividade do cliente**, com aviso prévio opcional e etiqueta
  automática. A contagem zera a cada mensagem do cliente e **não fecha se quem deve resposta é o
  atendente** (ver anexo de métricas, §9).
- **Alerta de inatividade do atendente**: a conversa muda de cor conforme o tempo sem resposta,
  em três degraus, antes de escalar para o supervisor.

## 5. Respostas prontas

Duas camadas desde o dia 1: as **da empresa**, organizadas por categoria e mantidas pelo gestor, e
as **do próprio atendente**, que ele cria e organiza sem pedir permissão. Suportam variáveis de
contato e de atendente.

Ficam em cache local e continuam funcionando com a rede oscilando — é uma das reclamações
recorrentes contra o Blip, e é irritação diária de quem atende.

O conteúdo inserido a partir de resposta pronta é marcado, para que o relatório de esforço possa
descontá-lo (ver anexo de métricas).

## 5.1 A janela de 24 horas na tela

A conversa de WhatsApp mostra o tempo restante da janela de atendimento no cabeçalho, e a lista
destaca as que estão perto de expirar. O estado do campo de mensagem muda com a janela:

| Estado | O que o atendente vê |
|---|---|
| Janela aberta | Campo de texto livre, mídia, áudio, respostas prontas — tudo disponível |
| Faltando menos de 1 hora | Campo normal, com aviso do tempo restante ao lado do botão de enviar |
| Janela fechada | Campo de texto livre desabilitado, com a explicação no lugar dele e o seletor de template aprovado em primeiro plano |

A regra é dizer antes, não depois. Bloquear na hora do envio, com erro da API, é a experiência que
o atendente tem hoje nas plataformas de mercado, e ela custa uma mensagem perdida e a confiança na
ferramenta.

Ao escolher um template fora da janela, a tela mostra a **categoria** (utilidade, marketing ou
autenticação) e o custo estimado antes de enviar — quem decide gastar precisa saber que está
gastando. E quando o cliente responde ao template, a janela reabre e o campo de texto livre volta
sozinho, sem o atendente precisar recarregar nada.

## 6. Mídia

Imagem, documento, áudio, vídeo e localização. Colar imagem da área de transferência, arrastar
arquivo para a janela, gravar áudio na própria tela, emoji.

Regra de entrega, que vem direto da lista de bugs da concorrência: o arquivo sobe primeiro para o
storage, é validado em tipo e tamanho, e só então é referenciado no envio. O status por mensagem é
visível, e falha mostra motivo e botão de reenviar.

## 7. Mensagem ativa

Disparo unitário a partir do Desk — disparo em massa é do Pipe Gestão, não daqui.

- Exige **template aprovado pela Meta**, com pré-visualização das variáveis preenchidas.
- Busca do destinatário por nome, telefone, e-mail ou identificador do WhatsApp.
- A resposta do cliente volta para **quem disparou**, dentro da janela de 24h.
- Histórico de status por mensagem: enviando, enviada, entregue, lida, falhou, expirada.

**Divergência do Pipe:** o Blip mantém o status visível por 48h após a janela. No Pipe o status é
permanente, porque ele é a prova de entrega — e porque a comunidade da Blip já pediu exatamente
isso: relatório de mensagem ativa que respeite a janela de 24h a partir do envio, e não o corte por
dia de calendário, com data, hora e conteúdo da resposta, e a categoria do template (utilidade ou
marketing) para controle de custo.

## 8. Painel do contato

Dados do contato editáveis na própria tela — nome, telefone, e-mail, documento —, atributos
customizados livres, anotações internas, etiquetas e histórico de conversas anteriores com
transcrição.

**Divergência do Pipe:** toda edição de dado de contato feita no Desk gera **log de auditoria** com
autor, valor anterior e horário. No Blip essa edição não deixa rastro, e num atendimento com dado
sensível isso é passivo, não conveniência.

## 9. Copiloto de IA no chat

- **Resumo do atendimento** ao abrir a conversa (o que aconteceu antes) e ao encerrar (o que
  aconteceu agora — este vira o resumo que sobe para a timeline do Lead no CRM).
- **Transcrição de áudio** sob demanda.
- **Sugestão de resposta** apoiada na base de conhecimento do tenant.
- **Melhorar texto** antes de enviar.
- **Ações**: acionar uma automação do n8n a partir do chat, com o resultado voltando na conversa.

**Divergência do Pipe:** a base de conhecimento do Blip é um arquivo único, e atualizar substitui
tudo. No Pipe a base é **incremental e versionada**, com documentos independentes, data de
atualização e indicação de qual documento embasou cada sugestão. Base que não diz de onde tirou a
resposta não é auditável, e numa operação regulada isso não passa.

Todo uso de IA aqui registra tokens e chamadas em `consumo_ia`.

## 10. Notificações

Três camadas simultâneas, porque cada uma falha sozinha: **som** (distinto para conversa nova e
para nova mensagem em conversa aberta), **contador na aba do navegador** e **notificação do
sistema**. A tela de configuração tem um botão que dispara as três para o atendente testar — a
reclamação mais comum contra o Blip é notificação que simplesmente não avisa, e quase sempre é
permissão do navegador negada sem ninguém perceber.

## 11. Atalhos de teclado

O Blip não documenta nenhum. O Pipe tem, desde o dia 1, porque atendente bom vive no teclado:
busca, próxima conversa, responder, inserir resposta pronta, transferir, encerrar, alternar status.
Todos visíveis numa folha de atalhos acessível de qualquer tela.

## 12. Visão em lista e em quadro

Lista por padrão. Quadro opcional, com colunas definidas pelo atendente ou herdadas da fila, e a
conversa abrindo em painel lateral sem sair do quadro. Alternar entre as duas visões é instantâneo
e o estado é o mesmo — arrastar cartão entre colunas muda a etapa da conversa.

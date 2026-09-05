# Levantamento de requisitos funcionais — Blip Desk (app do atendente)

> Escopo: aplicativo web do atendente humano (`desk.blip.ai`). Comportamento descrito com
> palavras próprias a partir da central de ajuda pública da Blip; nenhum parágrafo foi copiado
> da fonte. Cada função cita a URL usada como evidência.

---

## 1. Visão geral, layout e menus

### Conceito geral do Desk
**O que faz**: o Desk é a tela de atendimento humano para onde o bot "transborda" a conversa quando não consegue resolver sozinho. Do ponto de vista do cliente final, nada muda — ele continua falando com o mesmo chat, mas quem responde passa a ser uma pessoa.
**Regras/limites observados**: cada atendente precisa de conta própria na Blip; um atendente pode pertencer a N filas (times); a fila funciona no modelo FIFO (quem chega primeiro é atendido primeiro) dentro de cada time.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474416681495-Blip-Desk-Overview

### Barra lateral (sidebar) e filtros rápidos
**O que faz**: o menu deixou de ficar numa barra superior e passou para uma coluna lateral esquerda fixa — a primeira opção ("Conversas") virou a tela principal com todos os tickets do atendente; preferências, suporte e status foram realocados para o rodapé da barra. Também foram introduzidos "filtros rápidos": uma aba "Todas" e uma aba "Não lidas" (esta última remove o ticket automaticamente assim que ele é aberto/lido).
**Regras/limites observados**: recurso estava em fase beta, liberado gradualmente por cliente; a troca de status do atendente passou a ser feita clicando no avatar circular no rodapé da barra.
**Fonte**: https://help.blip.ai/hc/en-us/articles/22703102800023-Sidebar-Menus-and-Quick-Filters

### Alertas visuais na tela de atendimento
**O que faz**: o Desk usa sinalizações visuais para chamar atenção do atendente sem precisar de som: contador de tickets aguardando no canto superior esquerdo; etiqueta azul "Novo" em ticket recém-atribuído aguardando a primeira resposta; contador azul de mensagens não lidas por ticket; aviso ao marcar tags no encerramento; aviso durante transferência mostrando quantos atendentes estão disponíveis em cada fila de destino; um estímulo para iniciar novo atendimento quando há fila e o atendente fica >5 min sem interagir; e um aviso específico quando o próprio cliente encerra o ticket (fica marcado como "abandonado" e ainda precisa ser fechado pelo atendente).
**Regras/limites observados**: o alerta de "abandonado" não fecha o ticket sozinho — o atendente precisa finalizar manualmente.
**Fonte**: https://raw.githubusercontent.com/takenet/helpcenter/master/docs/helpdesk/blipdesk/alertas-agente-desk.md (mirror do antigo help center da Blip)

### Aceite e condução de um atendimento
**O que faz**: com o atendente logado e "Online", ele vê quantos usuários aguardam nas filas de que participa e inicia o atendimento clicando em "Atender novo cliente"; a partir daí toda mensagem digitada pelo atendente é repassada pelo bot ao cliente e vice-versa, até o atendente clicar em "Encerrar atendimento".
**Regras/limites observados**: só é possível atender depois de estar Online; a interface pede confirmação ao encerrar.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474399602327-How-to-do-customer-service-in-Blip-Desk

---

## 2. Estados do atendente

### Status do atendente (Online / Pausa / Invisível / Offline)
**O que faz**: existem três estados que o próprio atendente escolhe manualmente — Online (recebe novos tickets normalmente), Pausa (não recebe tickets novos, mas continua os que já tinha; ao entrar em pausa customizada precisa escolher um motivo cadastrado pelo gestor) e Invisível (também não recebe tickets novos, mas pode seguir conversas já atribuídas — indicado para quem está encerrando o turno). Offline é um quarto estado automático, atribuído quando o atendente sai/perde a sessão, e não é escolhível.
**Regras/limites observados**: o status de entrada padrão no Desk é "Invisível" — o atendente precisa mudar manualmente para "Online" para começar a receber; mesmo estourando o tempo configurado de pausa, o sistema não troca o status sozinho (fica em pausa até troca manual); o tempo em cada status só é contado enquanto a aba do Desk está aberta no navegador — ao fechar a aba, o tempo passa a contar como offline e, ao reabrir, o status volta para Invisível (a menos que a preferência "permanecer online ao fechar" esteja ativa, caso em que o Online é preservado, mas não a Pausa nem o Invisível).
**Fonte**: https://help.blip.ai/hc/en-us/articles/18046361712919-Agent-Status e https://raw.githubusercontent.com/takenet/helpcenter/master/docs/helpdesk/blipdesk/diferentes-status-agente-desk.md

### Pausas customizadas (motivos de pausa)
**O que faz**: o gestor cadastra, pelo portal, uma lista de motivos de pausa com duração sugerida em minutos (ex.: almoço, banheiro, treinamento) — pensado para atender à NR-17 e dar visibilidade operacional. Ao entrar em pausa no Desk, o atendente escolhe um desses motivos e vê um cronômetro rodando durante a pausa.
**Regras/limites observados**: exige permissão "Atendimento > Visualizar e editar" para configurar; o estouro do tempo sugerido não força saída automática da pausa; existe relatório específico de pausas por atendente.
**Fonte**: https://help.blip.ai/hc/en-us/articles/9801236103063-Custom-Breaks

---

## 3. Recebimento, fila e transferência de ticket

### Distribuição automática de tickets
**O que faz**: quando o bot transborda para humano, o sistema decide para qual atendente da fila mandar o ticket, validando três critérios: o atendente pertence à fila do ticket; está com status Online; e tem pelo menos 1 "vaga" livre (limite configurado de tickets simultâneos menos os tickets ativos). Havendo mais de um atendente elegível, o sistema usa um de dois modos de rodízio configuráveis pelo gestor: priorizar quem tem menos tickets ativos no momento (padrão, com desempate por tempo sem receber ticket) ou priorizar quem está há mais tempo sem receber ticket (com desempate por menos tickets ativos).
**Regras/limites observados**: o limite de "tickets por atendente" é um número inteiro >0 configurado em Configurações Gerais; é possível sobrescrever esse limite individualmente por atendente (a mudança global não afeta quem já tem limite customizado); existe opção de bloquear o botão "Atender" para não deixar o atendente puxar ticket manualmente, restringindo tudo à distribuição automática; existe também opção de limitar quantos tickets um atendente pode acumular sem ter mandado nenhuma primeira resposta.
**Fonte**: https://help.blip.ai/hc/en-us/articles/18694892640791-How-Automatic-Ticket-Distribution-Works-in-Blip-Desk

### Filas (times) e regras de direcionamento
**O que faz**: cada bot tem "filas de atendimento" (times) com atendentes vinculados; regras de atendimento decidem, a partir do conteúdo da mensagem, nome, e-mail ou um campo "extra" do contato, para qual fila aquele cliente vai (se nenhuma regra bater, cai na fila "Default"). Também existem regras de priorização por fila que atribuem prioridade Baixa/Média/Alta a um ticket com base nos mesmos tipos de critério — um ticket com prioridade "baixa" ainda fura a frente de um ticket sem prioridade nenhuma.
**Regras/limites observados**: tags específicas de encerramento podem ser cadastradas por fila (só aparecem para tickets daquela fila); gerenciar filas e regras exige permissão "Atendimento > Visualizar e editar".
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474425334423-How-to-Manage-Queues-and-Service-Rules-in-Blip

### Priorização e organização manual da lista de tickets
**O que faz**: independentemente das regras automáticas, o próprio atendente pode fixar manualmente até 50 tickets no topo da sua lista, e também marcar/desmarcar qualquer ticket como "não lido" (útil como lembrete para voltar depois).
**Regras/limites observados**: teto de 50 tickets fixados.
**Fonte**: https://help.blip.ai/hc/pt-br/articles/12040734953367-Prioriza%C3%A7%C3%A3o-e-visualiza%C3%A7%C3%A3o-de-tickets-no-Blip-Desk

### Modo de espera do ticket ("Standby")
**O que faz**: permite ao atendente pausar um ticket específico (sem mudar seu próprio status) enquanto resolve algo internamente — validação, cadastro, consulta em outro sistema. Enquanto o ticket está em espera, o cliente não recebe avisos de inatividade nem corre risco de fechamento automático por inatividade; tickets em espera aparecem separados numa lista própria.
**Regras/limites observados**: só é possível colocar em espera um ticket que já recebeu a primeira resposta do atendente; o cronômetro de inatividade do cliente pausa, mas o tempo médio de atendimento (TMA) continua contando normalmente; o gestor consegue ver e até tirar um ticket da espera pela tela de monitoramento.
**Fonte**: https://help.blip.ai/hc/en-us/articles/32536943707671-Ticket-Waiting-Period

### Transferência de ticket (individual e em massa)
**O que faz**: o atendente transfere um ticket em andamento para outra fila ou diretamente para outro atendente pelo ícone de setas no cabeçalho do ticket; ao transferir, o ticket atual é encerrado com status "Transferido" e um novo ticket é aberto e encaminhado — o novo ticket herda a prioridade do original, mas não herda as tags. Duas extensões pagas de terceiros ampliam isso: uma permite selecionar vários tickets na lista (com "Selecionar tudo" ou Ctrl/Cmd+clique) e transferir ou encerrar todos de uma vez; outra dá ao próprio atendente uma tela dedicada de "Ações em massa" para transferir seus próprios tickets em lote.
**Regras/limites observados**: a opção "transferir mesmo com toda a fila/atendente offline" no portal vale só para transferência manual, não para transbordo automático nem distribuição automática; ações em massa só funcionam entre tickets do mesmo bot — trocar de bot exige repetir o processo; extensões de transferência em massa exigem ativação prévia no bot e, num dos casos, instalação de extensão de navegador por atendente.
**Fonte**: https://help.blip.ai/hc/en-us/articles/29031769939863--Extension-How-to-bulk-transfer-and-close-tickets-in-Blip-Desk-with-the-Blip-Desk-Bulk-Ticket-Transfer-extension e https://help.blip.ai/hc/en-us/articles/30908634003351-Mass-Ticket-Transfer

---

## 4. Encerramento, tags e satisfação

### Encerrar (ou fechar) um ticket
**O que faz**: ao finalizar, o atendente pode marcar uma ou mais tags que classificam aquele atendimento; a distinção entre "finalizar" e "fechar" é só semântica — finalizar é quando o próprio atendente conclui ativamente, fechar é quando o cliente já havia cancelado antes.
**Regras/limites observados**: tags fixadas no ticket original não são herdadas pelo novo ticket em caso de transferência.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474416681495-Blip-Desk-Overview

### Fechamento automático por inatividade do cliente
**O que faz**: encerra sozinho tickets em que o cliente parou de responder, liberando o atendente; opcionalmente dispara antes uma mensagem avisando o cliente que o atendimento vai fechar, aplica tags automáticas de fechamento (para depois filtrar em relatório) e pode remover o ticket da lista do atendente assim que fecha.
**Regras/limites observados**: só funciona em bots com transbordo para o Desk; precisa ser configurado em dois lugares (Builder + Configurações Gerais do portal), com uma opção avançada de regra de contagem de tempo; o tempo de inatividade configurado precisa ser menor que o timeout de sessão do Builder, senão a sessão do usuário expira antes; existe uma variante "não fechar se quem está esperando resposta é o cliente" (só conta como inativo se o atendente já respondeu e o cliente não voltou).
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474433590679-Automatic-Closure-due-to-Client-Inactivity

### Dados salvos ao final do atendimento humano
**O que faz**: ao encerrar, a plataforma guarda automaticamente ID do ticket, número sequencial exibido na tela, identidade do cliente, e-mail do atendente responsável, status, datas de abertura/fechamento, fila e tags marcadas — tudo acessível no bloco seguinte do fluxo via variável `input.content` (ex.: `{{input.content@sequentialId}}`), permitindo, por exemplo, mostrar o número do protocolo numa mensagem de despedida personalizada.
**Regras/limites observados**: se o ticket foi transferido, essas variáveis só trazem os dados do último atendimento (o histórico anterior não vem junto).
**Fonte**: https://help.blip.ai/hc/pt-br/articles/5320362057751-Como-salvar-dados-do-atendimento-humano

### Pesquisa de satisfação / NPS
**O que faz**: não é um recurso nativo de "uma tela"; é montado no fluxo do bot como um bloco de nota logo após o atendimento humano, que pergunta uma nota (normalmente 0–10), normaliza a resposta por script e registra um evento para aparecer num relatório personalizado — inclusive já com lógica pronta para classificar em Detrator (0–6), Neutro (7–8) e Promotor (9–10), à moda de NPS.
**Regras/limites observados**: o evento só é gerado por conversa real (não é disparado ao testar o fluxo com o usuário "Tester"); a categoria de NPS só aparece no relatório depois que o primeiro evento real for registrado.
**Fonte**: https://help.blip.ai/hc/pt-br/articles/5423911157911-NPS-Pesquisa-de-Satisfa%C3%A7%C3%A3o

---

## 5. Respostas prontas e envio de conteúdo

### Cadastro de respostas prontas (mensagens rápidas)
**O que faz**: o gestor cria categorias (ex.: "Saudação") no menu de Configurações Gerais e, dentro de cada categoria, cadastra as respostas com título e conteúdo; o atendente acessa essa lista dentro do Desk para responder mais rápido.
**Regras/limites observados**: o título da resposta pronta tem limite de 60 caracteres; pela documentação pública, o cadastro é sempre feito pelo gestor/admin em nível de bot (compartilhado por toda a operação) — não foi encontrado recurso de resposta rápida pessoal/individual do atendente na documentação oficial (ver seção de lacunas).
**Fonte**: resultado de busca sobre "Cadastro de resposta pronta" (artigo original em https://help.blip.ai/hc/pt-br/articles/28048764429975-Cadastro-de-resposta-pronta, atualmente fora do ar) e https://help.blip.ai/hc/en-us/articles/4474418262551-How-to-Use-Variables-in-Blip-Desk-Canned-Responses

### Variáveis dentro das respostas prontas
**O que faz**: permite personalizar o texto da resposta pronta usando variáveis do contato (`contact.name`, `contact.email`, `contact.city`, `contact.phoneNumber`, `contact.extras`, etc.) e do atendente (`agent.fullName`, `agent.firstName`, `agent.email`, `agent.phoneNumber`) — a Blip substitui os valores no momento do envio.
**Regras/limites observados**: se o canal não coletar determinado dado do contato, a variável correspondente fica vazia — depende do fluxo do bot ter salvo aquela informação antes.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474418262551-How-to-Use-Variables-in-Blip-Desk-Canned-Responses

### Envio de mídia (imagem, documento, vídeo, áudio)
**O que faz**: o envio de anexos multimídia pelo atendente é um recurso que pode ser ligado/desligado nas Configurações Gerais do bot; quando ativo, o atendente consegue anexar arquivos durante o atendimento. Também é possível colar uma imagem copiada (Ctrl+C / Ctrl+V) direto na caixa de digitação, ou arrastar o arquivo para a conversa.
**Regras/limites observados**: colar uma célula copiada do Excel gera uma imagem da célula, não o texto — para colar como texto é preciso usar Ctrl+Shift+V; colar/arrastar funciona um arquivo por vez; o canal (ex. WhatsApp) também precisa estar configurado para receber arquivos do lado do cliente.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474416681495-Blip-Desk-Overview e https://help.blip.ai/hc/en-us/articles/4474399562007-How-to-allow-sending-files-in-Blip-Chat

### Uso de emoji no Desk
**O que faz**: liga/desliga, por bot, se os atendentes podem usar o seletor de emojis na caixa de mensagem.
**Regras/limites observados**: configuração feita pelo gestor em Configurações do módulo de Atendimento.
**Fonte**: https://raw.githubusercontent.com/takenet/helpcenter/master/docs/helpdesk/blipdesk/habilitando-uso-emoji-desk.md

---

## 6. Mensagem ativa (disparo de template pelo Desk)

### Envio individual de mensagem ativa do WhatsApp
**O que faz**: permite ao atendente iniciar uma conversa nova com um número de WhatsApp (fora do atendimento em andamento), usando obrigatoriamente um template pré-aprovado pela Meta. É disparo individual (um número por vez) — para disparo em massa a própria documentação recomenda a ferramenta de Growth do portal, não o Desk.
**Regras/limites observados**: exige bot publicado no Builder com canal WhatsApp (ou apontando para um roteador com WhatsApp); exige templates cadastrados e aprovados na Meta e habilitados especificamente para uso no Desk; exige fluxo de retorno configurado no Builder (para onde vai a resposta do cliente); o botão só aparece se o atendente estiver "Online"; permissão de disparo é concedida por bot, individualmente ou em massa, pelo gestor.
**Fonte**: https://help.blip.ai/hc/en-us/articles/7373954031127-Sending-Active-WhatsApp-Messages-in-Blip-Desk

### Busca e cadastro de destinatário (telefone, nome, e-mail, BSUID)
**O que faz**: na tela de nova mensagem ativa, o atendente busca um contato já existente por Nome, Telefone, E-mail ou **Meta BSUID**, ou cadastra um contato novo informando Telefone ou BSUID. A busca por telefone aceita dois modos ("Começa com", mais preciso, exigindo DDI+DDD+número completo; ou "Contém", mais aberto, com 3 a 8 dígitos); a busca por nome aceita "Igual a" ou "Começa com" (considerando só os 10 primeiros caracteres de cada palavra); busca por e-mail e por BSUID são sempre exatas.
**Regras/limites observados**: se o dado buscado não existe na base, o próprio atendente pode enviar com ou sem nome (e o nome informado é salvo automaticamente); se o contato já tem nome salvo, não é possível alterá-lo por esse fluxo.
**Fonte**: https://help.blip.ai/hc/en-us/articles/7373954031127-Sending-Active-WhatsApp-Messages-in-Blip-Desk

### Retorno do cliente e priorização de resposta a mensagem ativa
**O que faz**: quando o cliente responde a uma mensagem ativa, o novo ticket vai direto para a lista do mesmo atendente que disparou (rota direta) — se esse atendente estiver offline/invisível ou o bot não tiver transferência direta habilitada, o ticket fica esperando na fila só para aquele atendente específico. Também é possível configurar prioridade máxima automática para todo ticket nascido de resposta a mensagem ativa, superando qualquer outra regra de prioridade.
**Regras/limites observados**: a janela de roteamento direto expira em 24h sem resposta do cliente (depois disso vale a regra padrão de fila); o histórico de mensagens ativas enviadas (e seus status: Enviando, Enviado, Entregue, Lido, Falhou, Expirado) fica visível numa aba própria do Desk por até 48h após a janela de 24h.
**Fonte**: https://help.blip.ai/hc/en-us/articles/7373954031127-Sending-Active-WhatsApp-Messages-in-Blip-Desk

---

## 7. Painel lateral do contato

### Edição de dados do contato pelo Desk
**O que faz**: no painel do contato, seção "Perfil", o atendente clica em "Editar" para alterar nome, telefone, e-mail e documento — a alteração é replicada em toda a plataforma Blip (não é uma cópia isolada do Desk).
**Regras/limites observados**: é permissão liberada por bot e por atendente pelo gestor; a documentação afirma explicitamente que não existe (à época) um log de auditoria das edições dentro do Desk.
**Fonte**: https://help.blip.ai/hc/en-us/articles/11589065125271-Contact-Editing-in-Blip-Desk

### Salvar informações de contato a partir da conversa
**O que faz**: no fluxo do bot (não no Desk em si), a ação "Definir contato" grava dados coletados do usuário (nome, e-mail, cidade, telefone, documento, gênero) além de atributos extras livres (par chave/valor) — esses dados aparecem depois tanto no módulo de Contatos do portal quanto no painel do contato dentro do Desk.
**Regras/limites observados**: números de telefone internacionais precisam do padrão "+DDI DDD número"; sem essa ação configurada no fluxo, nada é salvo mesmo que o cliente informe o dado na conversa.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474414684055-How-to-Save-Contact-Information

### Histórico de atendimento / transcrição
**O que faz**: dentro do ticket aberto, o atendente lê a transcrição da conversa ao lado da tela de contato e pode baixá-la; a tela de "Histórico de Atendimento" (mais voltada a gestor) permite filtrar por contato, atendente, fila, tags ou número de ticket para localizar e baixar transcrições e listas de tickets de períodos maiores.
**Regras/limites observados**: download individual de transcrição funciona liso para tickets de até 90 dias; para períodos entre 90 dias e 1 ano (lista) ou 5 anos (transcrição completa) o pedido é assíncrono e o arquivo chega por e-mail.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474418319383-Service-History

---

## 8. Desk Actions / Blip Copilot (IA dentro do chat)

### Resumo inteligente do atendimento
**O que faz**: ao abrir um ticket, a IA generativa lê todo o histórico da conversa (inclusive a parte com o bot, antes do transbordo) e entrega ao atendente um resumo com: dados que o cliente já informou, motivo do contato atual, quantos tickets esse cliente abriu nos últimos 30 dias e o sentimento da conversa. Ao encerrar, gera também um resumo final consolidado.
**Regras/limites observados**: depende de permissão liberada por atendente/bot e de plano elegível (incluso nos planos novos "MVO"; em planos legados como Enterprise precisa de exceção comercial; não disponível no Trial).
**Fonte**: https://help.blip.ai/hc/en-us/articles/21860799152279-How-to-Use-Blip-Copilot

### Transcrição de áudio (voz para texto)
**O que faz**: dentro do ticket, ao receber um áudio do cliente, aparece um botão "Transcrever áudio" que converte a mensagem de voz em texto em poucos segundos.
**Regras/limites observados**: a transcrição não é automática — o atendente precisa clicar para disparar cada uma.
**Fonte**: https://help.blip.ai/hc/en-us/articles/21860799152279-How-to-Use-Blip-Copilot

### Sugestão de resposta
**O que faz**: sob demanda (o atendente clica num botão), a IA analisa o contexto da conversa e uma base de conhecimento configurada (produtos, preços, políticas) e devolve duas opções de resposta prontas para editar e enviar.
**Regras/limites observados**: base de conhecimento é carregada em .pdf/.xls/.txt/.tsv com um formato específico de "NOME DO CONTEXTO | texto"; qualquer atualização da base exige reenviar o arquivo inteiro (substitui, não soma); tom de resposta configurável (amigável / descontraído / técnico); parâmetro de "temperatura" da IA ajustável entre 0,1 e 0,5 (padrão 0,2).
**Fonte**: https://help.blip.ai/hc/en-us/articles/21860799152279-How-to-Use-Blip-Copilot

### Melhorar texto
**O que faz**: corrige gramática e ajusta tom/clareza do texto que o próprio atendente escreveu antes de enviar.
**Fonte**: https://help.blip.ai/hc/en-us/articles/21860799152279-How-to-Use-Blip-Copilot

### Mensagens de boas-vindas automáticas sugeridas
**O que faz**: sugere ao atendente até 3 mensagens iniciais pré-configuradas para abrir a conversa após o transbordo, com variáveis `${NAME}`/`${LASTNAME}` preenchidas automaticamente com o nome do atendente logado.
**Regras/limites observados**: só é sugerida quando, até aquele momento, só existem mensagens do cliente na conversa (ou seja, é para abertura, não para qualquer momento).
**Fonte**: https://help.blip.ai/hc/en-us/articles/21860799152279-How-to-Use-Blip-Copilot

---

## 9. Notificações

### Avisos sonoros e notificações do navegador
**O que faz**: por atendente, é possível ligar/desligar notificação do navegador para novas mensagens e para novos tickets na fila, além de dois sons diferentes (um para mensagem nova, outro para ticket novo). O favicon/aba do navegador também muda para mostrar quantas conversas não lidas existem.
**Regras/limites observados**: depende de o navegador ter concedido permissão de Som e de Notificações ao site do Desk — sem isso, nada dispara mesmo configurado; configuração fica no menu Preferências, no perfil do atendente.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474382630551-Preferences-in-Blip-Desk-and-Desk-App

### App mobile do Desk (notificações push)
**O que faz**: existe um app (Beta) para Android/iOS; nele, além de manter o atendente "online" mesmo com o app em segundo plano (via preferência "Continuar online ao fechar"), dá para configurar notificações push separadas para: novos tickets na fila, novos tickets distribuídos automaticamente e novas mensagens.
**Regras/limites observados**: no Android exige permissão de notificação do próprio sistema operacional, além da liberada dentro do app.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474382630551-Preferences-in-Blip-Desk-and-Desk-App

---

## 10. Visão em lista vs. Kanban / pastas

**O que foi encontrado**: a documentação pública indexada mostra tela de lista (com abas "Atribuído/Em andamento" e "Aguardando atendimento", renomeadas nessa ordem numa atualização de monitoramento) como o modelo padrão do Desk clássico para atendente. Um quadro Kanban de contatos (colunas por etapa do funil, cartões arrastáveis) foi encontrado documentado para o **Blip Go** (produto irmão, mais voltado a vendas/CRM leve), não como recurso confirmado do Blip Desk clássico do atendente. Também apareceram, em listas de "artigos relacionados", títulos de recursos beta chamados "[Beta] Kanban Board in Desk" e "[Beta] Folders on Desk", mas o conteúdo desses artigos não pôde ser recuperado (ver lacunas) — não dá para confirmar com segurança se "pastas viram colunas" no Desk clássico.
**Fonte**: https://help.blip.ai/hc/pt-br/articles/31725666105623-Novo-Monitoramento-no-Blip-Desk-mudan%C3%A7as-na-tela-e-novas-funcionalidades (lista) e https://help.blip.ai/hc/pt-br/articles/41262466364695-Como-Gerenciar-Contatos-e-Utilizar-o-Kanban-no-Blip-Go (Kanban, produto diferente)

---

## 11. Limites operacionais

### Limite de atendimentos simultâneos
**O que faz**: definido em Configurações Gerais como "Tickets por atendente" — um número inteiro que representa quantas "vagas" cada atendente tem ao mesmo tempo; pode ser sobrescrito individualmente por atendente.
**Fonte**: https://help.blip.ai/hc/en-us/articles/18694892640791-How-Automatic-Ticket-Distribution-Works-in-Blip-Desk

### Alerta de tempo máximo de resposta do atendente
**O que faz**: mostra um ponto vermelho (ou, na versão com múltiplos ciclos, cinza→amarelo→vermelho) ao lado do ticket quando o atendente demora demais para responder depois da última mensagem do cliente — até 3 ciclos de tempo configuráveis, cada um com sua cor.
**Regras/limites observados**: contagem zera a cada resposta do atendente e reinicia a cada nova mensagem do cliente.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474433560855-Inactive-Agent

### Encerramento automático por inatividade do cliente
Ver seção 4 — tempo configurável em minutos/horas, com aviso prévio opcional ao cliente.
**Fonte**: https://help.blip.ai/hc/en-us/articles/4474433590679-Automatic-Closure-due-to-Client-Inactivity

---

## Lacunas e irritações

- **Documentação instável**: várias URLs de artigos citados em outros artigos e em resultados de busca (ex.: "Cadastro de resposta pronta", "Ticket Transfer Setup", "Service Prioritization", "File Sending", "Notifications", "Kanban Board in Desk", "Folders on Desk") devolveram 404 ("página que você está procurando não existe") no momento da pesquisa — sinal de que a Blip está no meio de uma reorganização/migração de central de ajuda (Zendesk) e nem tudo que é referenciado está de fato publicado ou acessível.
- **Sem confirmação de Kanban nativo no Desk do atendente**: o quadro Kanban documentado é do Blip Go; não foi possível confirmar se e como "pastas" do Desk clássico viram colunas de um quadro — funcionalidade citada apenas em títulos "[Beta]" sem conteúdo recuperável.
- **Sem atalhos de teclado documentados**: não existe (ou não foi encontrado) um artigo dedicado a atalhos de teclado do Desk — o único atalho citado é colar imagem (Ctrl+C/Ctrl+V) e, para colar texto de célula do Excel sem virar imagem, Ctrl+Shift+V. Não há atalhos para aceitar ticket, encerrar, trocar de aba etc.
- **Resposta pronta parece ser só "da empresa"**: nada na documentação indica existir resposta rápida pessoal do atendente — tudo é cadastrado por categoria em nível de bot pelo gestor/admin. Se o Pipe quiser diferenciar "minhas respostas" de "respostas do time", é um gap deliberado a preencher, não um padrão herdado.
- **Sem log de auditoria de edição de contato**: a própria Blip documenta que edições de contato feitas via Desk não ficam registradas/auditáveis dentro da ferramenta.
- **Regras de status ficam "escondidas" em comportamento, não em tela**: o fato de "Pausa" e "Invisível" não expirarem sozinhos, de o status padrão de entrada ser sempre "Invisível" e de o tempo só contar com a aba aberta são regras que geram atrito real (atendente esquece de voltar para Online, gestor vê métricas de tempo erradas) e não são óbvias para quem só olha a tela.
- **Distribuição automática tem muita regra combinável** (fila + status + vaga livre + 2 modos de rodízio + limite individual que sobrevive a reset global + trava de "não permitir puxar manualmente") — é fácil um comportamento parecer "bug" quando na verdade é uma combinação de configurações não visível para quem só opera o Desk.
- **Mensagem ativa via Desk é sempre unitária**: a própria documentação empurra disparo em massa para outra ferramenta (Growth) — pipe precisa decidir se replica essa separação ou unifica em um único fluxo de disparo.

# Blip Desk — aba "Mensagens Ativas"

Levantamento feito em 07/09/2026 a partir do bundle JavaScript minificado do micro-frontend de mensagem ativa do Blip Desk: `blip-desk-ref-2/deskmfe.blip.ai/beagle/desk-active-message/latest/main.js` (2,73 MB, arquivo único na pasta — não há settings.json nem CSS irmãos). O registro do MFE está em `blip-desk-ref-2/deskmfe.blip.ai/beagle/mfesSettings.json`, que aponta este módulo como `ACTIVE_MESSAGE`, **release 15873**, servido de `https://deskmfe.blip.ai/beagle/desk-active-message/latest`. O documento descreve apenas comportamento observável: rótulos de tela, estados, validações, limites numéricos, chaves de configuração e eventos de telemetria. Não contém código, nome de classe CSS nem estilo.

---

## A. O que a aba oferece

A aba é um micro-frontend do Desk chamado internamente de "business initiated message". Ela contém:

1. **Painel "Status geral"** — cartões de contagem por situação das mensagens enviadas, com subtítulo "Acompanhe o status das mensagens enviadas nas últimas 72 horas", link "Saiba mais" (abre modal explicativo) e botão "Atualizar" com carimbo "Última atualização". Cada cartão é clicável e filtra a lista (dispara telemetria própria por status). Contagens acima de 99 aparecem como "99+".
2. **Lista de envios** com duas visões: "Envios agendados" e "Todos os envios", cabeçalho "Mensagens ativas" e botão primário "Enviar" que abre o assistente de disparo. Há botão "Voltar para status geral" e "Atualizar".
3. **Coluna de detalhes do envio** ("Detalhes do envio" / "Dados da Mensagem Ativa") com abas "Contato" e "Envios", data, resposta, "Criado em", "Mais detalhes", "Abrir conversa", e para agendamentos os botões "Enviar agora", "Reagendar mensagem" e "Cancelar envio".
4. **Assistente de disparo em 3 etapas** (ver seção B).
5. **Modal de agendamento / reagendamento** ("Agendar envio da mensagem", "Alterar data ou hora do envio").
6. **Modal de detalhe de falha** com títulos por motivo ("Tempo de espera excedido", "Falha ao se conectar com o canal WhatsApp", "Revise o conteúdo da mensagem", "Este contato já está em atendimento", "Ocorreu uma falha no envio") e um expansor "Informações avançadas" / "Ocultar informações".
7. **Modal "Padrões de busca"**, que salva chatbot padrão e tipo de busca padrão para os próximos disparos (persistido no navegador sob a chave `previousSearch`).
8. **Painel de ajuda "Ajuda na busca"** — "Como funcionam as buscas de contatos", com blocos por tipo de busca e link "Ir para documentação."
9. **Banner na thread do atendimento** avisando que há mensagem ativa agendada para aquele contato.
10. **Ficha de contato** (Nome, E-mail, Telefone, Gênero, Cidade, Documento, Extras, Id, "Tags de atendimento", "Alta prioridade", "Última classificação").

Observação: existem strings de uma 4ª etapa "Confirmar envio" no dicionário, mas o passo-a-passo renderizado tem só 3 marcadores; as chaves de "confirmar envio" que ainda são usadas são apenas os toasts, o botão "Enviar", "Cancelar" e o rótulo "Horário". Ou seja, "Confirmar envio" é vocabulário legado.

---

## B. Fluxo de disparo de template, passo a passo

Título do assistente: "Enviar mensagem ativa". Rodapé fixo com "Cancelar" e um botão primário que é "Continuar" nas duas primeiras etapas e "Enviar" na última. O botão primário fica desabilitado enquanto a etapa não valida, e entra em estado de carregamento durante o envio.

### Etapa 1 — "Selecionar contato"

- Duas opções em rádio: "Selecionar contato existente" e "Adicionar novo contato".
- Escolhe-se o chatbot ("Selecionar chatbot" / "Pesquisar no chatbot"). Se o agente só tem um chatbot autorizado, ele é pré-selecionado. A lista de chatbots vem da permissão de mensagem ativa do agente, filtrada ainda pela configuração `ActiveMessageEnabled` do owner.
- Busca-se o contato (ver seção C) e marca-se "Selecionar" nos resultados. Os escolhidos aparecem em "Contatos selecionados {n}/{limite}" com botão "Remover" e "Limpar seleção".
- **Validação para avançar:** precisa haver ao menos 1 contato selecionado **e** nenhum deles pode estar marcado como já em atendimento. Sem isso o botão não avança (e a telemetria registra a tentativa como inválida).
- Ao limpar a seleção, aparece confirmação "Você quer limpar os contatos selecionados?" com "Voltar" / "Limpar".

### Etapa 2 — "Escolher modelo"

- Busca por nome do modelo ("Pesquisar modelo de mensagem" / "Insira o nome do modelo"), filtro "Selecionar idioma" (com opção "Todos", montada a partir dos idiomas realmente existentes nos modelos daquele chatbot) e chave "Exibir favoritos".
- Modelos podem ser favoritados ("Adicionar favorito" / "Remover favorito"); o favorito é gravado no servidor por agente e por modelo, não no navegador.
- Painel de pré-visualização à direita; estado vazio: "Selecione um modelo na lista para visualizar o conteúdo completo".
- Se o modelo tem cabeçalho de mídia, a pré-visualização mostra "Insira uma imagem em 'Mídia'", "Insira um vídeo em 'Mídia'" ou "Insira um documento em 'Mídia'" conforme o formato do cabeçalho.
- **Validação para avançar:** existir um modelo selecionado. Nada mais.
- Estados vazios/erro: "Não há modelos de mensagem do WhatsApp habilitados para envio" (+ "Saiba mais"), "Poxa! Não foram encontrados resultados para sua pesquisa", "Poxa! Você não favoritou nenhum modelo de mensagem", "Poxa! Algo não funcionou muito bem durante a pesquisa" (+ "Tentar novamente").

### Etapa 3 — "Revisar conteúdo"

- Mostra "Modelo selecionado: {nome}" e um formulário com as seções "Mídia", "Conteúdo", "Botões" / "Ação dos botões", "Conteúdo do botão", "URL do botão".
- Aviso fixo: "Os campos devem ser preenchidos obrigatoriamente."
- Campos de mídia pedem URL ("Insira a URL da imagem", "Insira a URL do vídeo", "Insira a URL do documento"); URL malformada dá "URL inválida". Não há upload de arquivo — só URL.
- Chave "Editar modelo por contato" ("Habilite este recurso para editar o modelo para cada contato conforme suas preferências"): quando ligada, cada contato da lista ganha um selo de progresso "Edição pendente" (alerta), "Editando" (info) ou "Editado" (sucesso).
- Botão/painel "Pré-visualizar conteúdo".
- Quando o chatbot expõe mais de um número remetente, aparece um cartão com o número, nome verificado e o botão "Alterar número" → modal "Alterar número do chatbot" ("Selecione o número de telefone que será usado para enviar a mensagem aos contatos. O número ficará visível para o contato no WhatsApp."), com marcação "Principal", "Voltar"/"Salvar" e toast "O número foi alterado!". Se só há um número, ele é usado automaticamente e o botão não aparece.
- Botão de calendário abre "Agendar envio da mensagem" ("Defina a data e hora em que a mensagem será enviada"), com "Data" e "Horário" (hora com máscara de 5 caracteres, valor inicial "23:59"), "Cancelar agendamento" / "Voltar" / "Agendar". Há ainda a opção "Cancelar envio ao receber uma resposta antecipada do contato".
- **Validação para enviar:**
  - Com "Editar modelo por contato" **desligada**: a soma das variáveis preenchidas (cabeçalho + corpo + rodapé) tem de bater exatamente com o total de variáveis exigidas pelo modelo. O total é calculado somando as ocorrências de marcador de variável nos textos, +1 se o cabeçalho for de mídia (não-texto), e +1 para cada botão de URL cuja URL contenha variável e não seja um link estático da própria plataforma.
  - Com "Editar modelo por contato" **ligada**: todos os contatos precisam estar com o preenchimento completo (nenhum "Edição pendente" ou "Editando").
  - Se o modelo não tem variável nenhuma, a etapa já nasce válida.
- Após enviar: toast "Mensagem ativa enviada com sucesso!" / "Mensagem ativa agendada com sucesso!" com "Você enviou uma mensagem para {nome}." ou "…para múltiplos contatos.". Cinco segundos depois o Desk é avisado para recarregar as últimas mensagens dos tickets envolvidos.
- Cancelar em qualquer ponto: "Você deseja cancelar o envio da mensagem ativa?" — "Ao cancelar o envio, todas as informações serão perdidas e precisarão ser inseridas novamente…" com "Não"/"Sim".

---

## C. Busca e cadastro de destinatário

**Não existe importação de arquivo.** Uma varredura do bundle por CSV, XLSX, planilha, upload, leitura de arquivo e campo de arquivo retorna zero ocorrência. Os únicos caminhos são busca de contato existente e digitação manual de um novo contato, ambos limitados ao mesmo teto de seleção.

### Contato existente

Campo "Pesquisar contato por" com quatro tipos e um "Tipo de busca" (operador) que muda conforme o campo:

| Campo | Operadores disponíveis | Regra |
|---|---|---|
| "Nome" | "Contém" / "Igual" | "Contém" faz busca parcial que considera os primeiros 8 caracteres de cada palavra; "Igual" exige o nome completo exatamente como cadastrado |
| "Telefone" | "Contém" / "Começa com" | "Contém" acha o número em qualquer parte e pode trazer vários resultados; "Começa com" exige o número exato, com DDI e DDD |
| "E-mail" | só exata | "Informe o e-mail completo para uma busca exata." |
| "BSUID Meta" | só exata | identificador completo; formato exigido: duas letras maiúsculas, ponto, e 1 a 128 caracteres alfanuméricos |

- O campo BSUID só aparece com a chave de funcionalidade correspondente ligada; quando ela é desligada a tela volta sozinha para busca por telefone.
- Resultados vêm paginados de 10 em 10, com rolagem infinita; fim da lista: "Não há mais contatos para exibir". Estado inicial: "Busque por contatos existentes para enviar uma mensagem ativa".
- O termo buscado é destacado no resultado. Campos ausentes aparecem como "Desconhecido" / "Não cadastrado" / "Nome não cadastrado".
- Trocar de chatbot exige limpar a seleção: "Para alterar o chatbot, é necessário limpar a seleção de contatos atual".

### Novo contato

Bloco "Novo contato" ("Envie uma mensagem ativa para contatos que não estão salvos em seus chatbots."):

- "Adicionar contato por": "Telefone" ou "BSUID Meta".
- Campos: chatbot ("Salvar contato no chatbot"), telefone com seletor de país (o país inicial vem da cultura configurada no owner) ou BSUID, e "Nome do contato".
- O botão "Adicionar" só habilita com chatbot escolhido + identificador válido + nome válido.
- Se o dado digitado bate com um contato já cadastrado, aparece o alerta "Os dados são de um contato existente" com as opções "Novo contato" / "Contato existente".
- Duplicidade na própria lista: "{nome} já é um contato selecionado — Por favor, insira um novo contato."
- Há um banner de aviso sobre privacidade da Meta (usernames ocultando números), exibido quando a busca por BSUID está habilitada.

---

## D. Regras de bloqueio

### Impedem selecionar/adicionar o contato

1. **Contato já em atendimento** — "Este contato já está sendo atendido" / "{nome} já está em atendimento". Se a configuração `ActiveMessageCanSendWithOpenTicket` estiver ligada **e** o ticket aberto for do próprio agente logado, o bloqueio é dispensado. O erro correlato do backend é o código **1602**.
2. **Limite diário por contato** — só vale com a chave `desk-active-message-limit` ligada e `ActiveMessageLimitEnabled` no owner. Mensagem: "O contato já recebeu o total permitido de {N} mensagens ativas diárias. Aguarde {tempo} para enviar novamente" (singular/plural conforme N). O N vem de `ActiveMessageLimitCount` e o tempo restante é humanizado em horas e minutos. Quando esse limite está ativo, o botão de agendamento some da etapa 3.
3. **Teto de contatos por disparo** — "O limite de contatos selecionados foi atingido / Para incluir um novo contato, é necessário limpar a seleção atual."
4. **Contato duplicado** na seleção.
5. **Número de telefone possivelmente inválido** — tooltip "Número de telefone pode ser inválido."; com a chave `active-message-block-invalid-phonenumber` ligada, contatos com número inválido e sem BSUID ficam bloqueados (a telemetria registra a tentativa de adicionar número inválido).

### Impedem avançar/enviar (lado do cliente)

6. Nenhum contato selecionado, ou algum selecionado em atendimento (etapa 1).
7. Nenhum modelo selecionado (etapa 2).
8. Variáveis do modelo não totalmente preenchidas — ou, no modo por contato, algum contato ainda não concluído (etapa 3).
9. Agendamento com data/hora no passado — "A data não pode ser anterior à data atual", "A hora não pode ser anterior à hora atual", "Formato de hora inválido". Se o horário já passou no momento do envio: "Verifique a data ou hora — Não foi possível enviar sua mensagem agendada. Verifique e tente novamente."

### Bloqueios devolvidos pelo backend no envio

Todos aparecem sob o título "Ops! Não foi possível enviar sua mensagem":

| Código | Mensagem exibida |
|---|---|
| 0 | "Tempo de espera excedido. Tente novamente mais tarde." |
| 1 | "Você não tem permissão para enviar mensagens ativas." |
| 2 | "Informe o destino da mensagem. Não há nenhum fluxo definido para esta mensagem." |
| 3 | "Escolha um template válido. O modelo de mensagem não foi localizado ou não está aprovado." |
| 4 | "Escolha outro chatbot. O chatbot selecionado não pertence à sua organização." |
| 5 | "Escolha outro chatbot. O chatbot deve estar vinculado ao bot roteador da organização." |
| 6 | "Não conseguimos achar o destino da mensagem para o chatbot selecionado." |
| demais | "Verifique os dados inseridos e tente novamente." |
| **8** | agente não autorizado a disparar — além do toast, a tela **revoga localmente a permissão de disparo do agente** no estado do Desk |

Ainda há códigos previstos e sem texto próprio na tela: termo de busca vazio (7), roteador fora da organização (9), roteador não encontrado (10), identidade sem WhatsApp conectado (11), erro de validação do roteador (12), roteador igual ao owner (13), identidade não é roteador (14) e campo de contato não permitido (15).

**Sobre "template não aprovado":** a tela **não** lê status de aprovação. Ela simplesmente pede ao servidor a lista de modelos já aprovados daquele chatbot (endpoints de "approved message templates" / "waba approved message templates"). Modelo reprovado nunca chega à lista; se ficar inválido entre a escolha e o envio, cai no código 3.

**Sobre "janela de 24h":** a tela não bloqueia por janela — é o contrário, mensagem ativa existe justamente para abrir a janela. O que existe é o conceito de expiração: "A mensagem não recebeu resposta nas últimas 24 horas, ultrapassando o período de sessão de conversa."

**Funcionalidades condicionadas a chaves** (todas falham para "desligado" em caso de erro): `active-message-menu-enabled` (conteúdo do template), `enable-active-message-scheduling` (agendar), `active-message-multiple-router` (escolher número remetente / WABA), `active-message-editable-variable-by-contact` (editar variáveis por contato), `active-message-edit-schedule` (editar agendamento), `active-message-block-invalid-phonenumber`, `desk-active-message-limit`, `active-message-enable-whatsapp-bsuid`, `disable-links-on-blip-cards`.

---

## E. Números encontrados

| O que é | Valor | Onde |
|---|---|---|
| Teto padrão de contatos por disparo | 15 | constante `SELECTED_CONTACT_LIST_LIMIT`; sobrescrita pela config de owner `ActiveMessageLimitBatchDispatch` |
| Rótulo com teto fixo | "Contatos selecionados {0}/15" | chaves `..._contato_existente38` e `contatos_selecionados_empty_state2` (o rótulo da tela de novo contato usa o limite dinâmico) |
| Limite diário de mensagens ativas por contato | vem da config `ActiveMessageLimitCount` (padrão 0) | leitura de `ownerConfiguration` |
| Mínimo para buscar por telefone | 4 dígitos | mensagem `search_min_digits_error` |
| Mínimo para buscar por nome/e-mail/BSUID | 3 caracteres | `search_min_chars_error` |
| Máximo na busca de telefone por "Contém" | 8 dígitos (faixa 4–8) | `search_max_chars_error` |
| Máximo na busca de nome por "Começa com" | 8 caracteres | `search_max_chars_name_starts_with_error` |
| Caracteres considerados na busca parcial por nome | primeiros 8 de cada palavra | `search_helper_name_starts_with` |
| Página da lista de contatos | 10 por requisição | constante de paginação do serviço de contatos |
| Timeout padrão do cliente de contatos | 40.000 ms | constante do mesmo serviço |
| Máximo de dígitos nacionais para +55 no cadastro manual | 11 | validação do campo telefone |
| Mínimo do nome no novo contato | 3 caracteres (erro se ≤ 2) | `..._contato_novo_inputs4` |
| Formato do BSUID | 2 letras maiúsculas + ponto + 1 a 128 alfanuméricos | `REGEX_BSUID_VALIDATION` |
| Tamanho do campo de hora | 5 caracteres, valor inicial "23:59" | modal de agendamento |
| Janela de expiração da mensagem | 24 horas | `EXPIRATION_TIME_IN_HOUR` e textos do modal |
| Permanência de expiradas na lista após expirar | mais 48 horas | modal "Status geral de mensagens ativas" |
| Janela do painel de status | últimas 72 horas | textos do painel |
| Teto de exibição dos contadores | 99, acima disso "99+" | `DASHBOARD_COUNT_LIMIT` / `DASHBOARD_COUNT_EXCEEDED_LIMIT_TEXT` |
| Delay para recarregar mensagens dos tickets após envio | 5.000 ms | rotina de envio |
| Código que faz o envio cair da rota nova para a antiga | 62 | tratamento de erro do envio |
| Código ignorado ao consultar contato inexistente | 67 | tratamento de erro da busca |
| Código "contato já em atendimento" | 1602 | `ALREADY_IN_ATTENDANCE_ERROR_CODE` |
| Código "agente sem permissão de disparo" | 8 | `CANT_SEND_ACTIVE_MESSAGE_REASON_CODE` |
| Idioma-base de formatação | pt-BR | `BASE_LOCALE` |

### Configurações por owner lidas pela tela

`ActiveMessageEnabled` (padrão desligado), `ActiveMessageLimitEnabled` (desligado), `ActiveMessageLimitCount` (0), `ActiveMessageLimitBatchDispatch` (15), `ActiveMessageCanSendWithOpenTicket` (desligado), `AddPlusSignOnActiveMessage` (ligado).

### Eventos de telemetria

Origem "Desk", todos marcados como vindos do menu de mensagem ativa:

- Abertura do assistente (com a origem: home da aba ou pós-envio).
- Escolha entre contato existente e novo.
- Seleção do tipo de filtro de busca.
- Busca de contato (registra chatbot, tipo de filtro, tamanho do termo, quantidade de resultados).
- Adicionar novo contato; adicionar número inválido; remover contato.
- Limpar seleção e confirmação de limpeza.
- Avançar da etapa de contato; avançar da etapa de modelo.
- Favoritar modelo e filtrar por favoritos; filtrar por idioma e por modelo.
- Preencher variável.
- Selecionar e salvar número remetente.
- Salvar e cancelar agendamento.
- Enviar (registra chatbot, nome e idioma do modelo, total de contatos, quantos novos e quantos antigos, se foi agendado, sucesso ou falha, mensagem de erro, se tem variável, quantas, os valores das variáveis, se editou por contato e se havia múltiplos roteadores).
- Cancelar o assistente; cancelar envio; reprogramar.
- Validação de "pode enviar" (registra se o contato está em atendimento e se estourou o limite).
- Filtros do painel por cada situação; abertura do modal de status; detalhe do motivo da falha.
- Atualizar a aba e atualizar pela thread.

---

## F. Vocabulário de tela

**Assistente / navegação:** "Enviar mensagem ativa", "Selecionar contato", "Escolher modelo", "Revisar conteúdo", "Confirmar envio", "Cancelar", "Voltar", "Continuar", "Enviar", "Adicionar", "Remover", "Limpar seleção", "Selecionar", "Selecionado", "Novo", "Fechar", "Salvar", "Entendi", "Saiba mais", "Atualizar", "Tentar novamente", "Fazer nova busca", "Sim", "Não".

**Etapa contato:** "Selecionar contato existente", "Adicionar novo contato", "Novo contato", "Adicionar contato por", "Selecionar chatbot", "Pesquisar no chatbot", "Pesquisar contato por", "Tipo de busca", "Contém", "Começa com", "Igual", "Nome", "Telefone", "E-mail", "BSUID Meta", "Nome do contato", "Insira o nome do contato", "Telefone do contato", "Insira o telefone do contato", "E-mail do contato", "BSUID do contato", "Informe o BSUID do contato", "Salvar contato no chatbot", "Contatos selecionados {0}/{1}", "Código do país", "Desconhecido", "Não cadastrado", "Nome não cadastrado", "Padrões de busca", "Chatbot padrão", "Tipo de busca padrão", "Ajuda na busca", "Como funcionam as buscas de contatos", "Busca por telefone", "Busca por nome", "Busca por e-mail", "Busca por BSUID", "Ir para documentação.".

**Etapa modelo:** "Pesquisar modelo de mensagem", "Insira o nome do modelo", "Selecionar idioma", "Todos", "Exibir favoritos", "Adicionar favorito", "Remover favorito", "Modelo selecionado", "Modelo selecionado: {0}".

**Etapa revisão:** "Mídia", "Conteúdo", "Botões", "Ação dos botões", "Conteúdo do botão", "URL do botão", "Insira a URL da imagem", "Insira a URL do vídeo", "Insira a URL do documento", "Insira URL da variável", "URL inválida", "Número de telefone", "Pré-visualizar conteúdo", "Editar modelo por contato", "Edição pendente", "Editando", "Editado", "Os campos devem ser preenchidos obrigatoriamente.", "Insira uma imagem em 'Mídia'", "Insira um vídeo em 'Mídia'", "Insira um documento em 'Mídia'", "Alterar número", "Alterar número do chatbot", "Principal", "Número do chatbot", "Selecionar número", "Escolha uma opção da lista", "O número foi alterado!", "Não foi possível alterar o número".

**Agendamento:** "Agendar envio", "Agendar envio da mensagem", "Agendar", "Data", "Horário", "Agende o dia e horário para o envio da mensagem", "Defina a data e hora em que a mensagem será enviada", "Cancelar agendamento", "Alterar data ou hora do envio", "Cancelar envio ao receber uma resposta antecipada do contato", "Envio agendado para {0} às {1}", "Envio programado para {0}, {1} de {2} de {3} às {4}", "Agendamento feito com sucesso!", "Agendamento cancelado com sucesso!", "Mensagem reagendada com sucesso!", "Envio cancelado com sucesso!", "Enviar agora", "Enviar mensagem ativa agora?", "O agendamento atual será cancelado, e o contato receberá a mensagem imediatamente.", "Reagendar mensagem", "Enviar nova mensagem", "Deseja cancelar o envio da mensagem?", "Essa mensagem não será enviada e não poderá ser recuperada.", "Sim, cancelar envio".

**Painel e lista:** "Mensagens ativas", "Status geral", "Status geral de mensagens ativas", "Informações gerais", "Última atualização", "Mensagens enviadas", "Mensagens agendadas", "Taxa de respostas", "Envio em andamento", "Enviadas", "Entregues", "Lidas", "Com falha", "Expiradas", "Enviando", "Agendada", "Falha", "Aguardando resposta", "Aguardando envio", "Cancelada", "Todos os envios", "Envios agendados", "Ticket gerado", "Detalhes do envio", "Dados da Mensagem Ativa", "Criado em", "Resposta", "Mais detalhes", "Abrir conversa", "Voltar para status geral", "Atualizar status", "Buscando mensagens enviadas", "Nenhuma mensagem foi enviada até agora", "Clientes aguardando", "Atender", "Fila", "Histórico", "Comentários", "Copiar", "Copiado!".

**Erros e avisos:** "Poxa! Não foram encontrados resultados para sua pesquisa", "Poxa! Algo não funcionou muito bem durante a pesquisa", "Poxa! Algo não funcionou muito bem durante o carregamento dos chatbots", "Poxa! Algo não funcionou muito bem durante a criação do novo contato.", "Ops! Não foi possível enviar sua mensagem", "Este contato já está sendo atendido", "O limite de contatos selecionados foi atingido", "Insira um número de telefone válido", "Insira um código BSUID válido", "Insira pelo menos 3 caracteres", "Selecione um chatbot", "Selecione um chatbot válido", "Não há modelos de mensagem do WhatsApp habilitados para envio", "Não há mais contatos para exibir", "Algumas mensagens não foram carregadas", "Atualize o status para exibir as mensagens", "Devido a um erro técnico, não foi possível exibir as mensagens ativas enviadas. Tente novamente, por favor.", "Falha ao se conectar com o canal WhatsApp", "Revise o conteúdo da mensagem", "Tempo de espera excedido", "Ocorreu uma falha no envio", "Informações avançadas" / "Ocultar informações".

**Tooltips:** "Um número de telefone é desconhecido quando é ocultado pelo usuário.", "Username adotado pelo usuário no WhatsApp. Importante: o username pode ser alterado pelo contato a qualquer momento.", "O BSUID (Business-Scoped User ID) é um código único que a Meta atribui a cada usuário…", "Este é o número de telefone que enviará a mensagem ao seus contatos", "Para alterar o chatbot, é necessário limpar a seleção de contatos atual".

---

## G. O que não foi possível determinar

1. **Se a aba trata de janela de sessão de 24h no momento do envio.** Não há nenhuma checagem no cliente; o servidor pode ter regra própria e isso não é visível aqui.
2. **Quanto vale, na prática, o limite diário por contato e o teto de contatos por disparo em cada organização.** Ambos vêm de configuração de owner carregada em runtime; o bundle só traz os padrões (0 e 15).
3. **Quais permissões concedem o direito de disparo.** A tela apenas consome uma lista pronta de chatbots autorizados e reage ao código de erro 8; o modelo de permissão em si mora no host do Desk, não neste bundle.
4. **Se há limite de caracteres por variável de template.** Não há restrição de tamanho nos campos de variável — o único campo com limite explícito é o de hora.
5. **Se há teto de data futura para agendamento.** A única validação é "não pode ser no passado"; não há limite superior.
6. **A regra exata que o backend usa para calcular o tempo restante do limite diário.** O cliente só formata o valor em horas e minutos que recebe pronto.
7. **Se o motivo detalhado de falha (o modal com "Informações avançadas") tem mais categorias além das cinco com texto próprio.** As demais caem no texto padrão, e o mapeamento completo entre resposta do servidor e categoria não fica claro sem o código-fonte original.
8. **Estilos, layout responsivo e nomes de componentes** — deliberadamente fora do escopo deste documento.

Todos esses pontos exigiriam o código-fonte original (sourcemap) ou observar o serviço em execução.

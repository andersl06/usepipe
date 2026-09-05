# Regras de negócio da Blip — extração para o Pipe

> Objetivo: extrair regras de negócio (limite numérico, prazo, janela de tempo, estado permitido,
> transição proibida, formato aceito, tamanho máximo, quantidade máxima, ordem de avaliação,
> precedência, elegibilidade, comportamento de borda) das fontes da Blip, para virar constraint de
> banco e testes no Pipe. Não são telas nem endpoints — é o que dói descobrir em produção.
>
> Regra do levantamento: número sem fonte documentada = **"não documentado"**. Nunca estimado.
> ⚠️ marca regra que muda com o tempo (preço/tier da Meta, formato aceito) — deve virar
> configuração, nunca constante fixa no código.
>
> Fontes usadas: `docs.blip.ai` (via WebFetch — a maior parte das subpáginas retornou 404 para
> fetch direto porque o site é uma SPA; o conteúdo indexado foi obtido via busca e Chrome),
> `help.blip.ai` (bloqueia WebFetch com 403 — todo o conteúdo abaixo veio de navegação real via
> Chrome ou de busca que indexa o texto da página), `C:/Users/anderson.linhares/blip-dash/docs/`
> não existe (skill `blip-onboarding` não tem essa pasta local — a tabela de extensões vive na
> própria skill), e principalmente `C:/Users/anderson.linhares/pipe/docs/pesquisa/apis.md` e
> `blip-desk-funcoes.md`, dois levantamentos já verificados neste mesmo projeto.

---

## 1. WhatsApp e Meta

### 1.1 Janela de atendimento de 24h

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Janela de conversa de 24h | 24 horas corridas a partir da última mensagem do cliente | Toda troca de mensagem de sessão (não-template) no WhatsApp | https://help.blip.ai/hc/en-us/articles/18503624553367-WhatsApp-Business-Manager ; https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp | Campo `window_expires_at` por conversa/ticket; validação de entrada antes de permitir envio de texto livre |
| O que pode ser enviado fora da janela | Somente template pré-aprovado pela Meta ("Notificação"/active notification) | Envio ativo do bot, do Desk ou de campanha | mesmas fontes acima | Regra de negócio no `packages/core`: bloquear envio de conteúdo livre (texto/mídia solta) para contato fora da janela, forçar seleção de template |
| O que reabre/reinicia a janela | Qualquer mensagem nova do cliente (user-initiated) | Toda conversa | mesmas fontes acima (regra herdada da Meta, documentada na Blip só de forma indireta) | Trigger que atualiza `window_expires_at = now() + 24h` a cada mensagem inbound |
| Janela de roteamento direto pós-mensagem-ativa | 24h sem resposta do cliente — depois expira e volta à fila padrão | Mensagem ativa disparada pelo Desk | https://help.blip.ai/hc/en-us/articles/7373954031127-Sending-Active-WhatsApp-Messages-in-Blip-Desk | Coluna `direct_routing_expires_at` no ticket originado de disparo ativo; job/consulta que expira a rota direta |
| Retenção do histórico de mensagens ativas no Desk | Até 48h **após** a janela de 24h (ou seja, até 72h do disparo) | Aba de histórico de mensagens ativas do Desk | mesma fonte acima | Não é requisito de retenção do Pipe em si, mas referência de UX: manter status de disparo (Enviando/Enviado/Entregue/Lido/Falhou/Expirado) visível por no mínimo esse período |

### 1.2 Categorias de template

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Categorias existentes | Utilidade (Utility), Marketing, Autenticação (Authentication) — a Blip pede para escolher "a categoria que melhor representa o conteúdo" no cadastro | Cadastro de Message Template no portal | https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp | Campo `category` obrigatório (enum) na entidade `template` |
| Diferença prática entre categorias | Autenticação sempre exige o número de telefone do destinatário (não pode depender só de BSUID/username); Utilidade/Marketing não têm essa exigência documentada | Envio de template de autenticação | https://help.blip.ai/hc/en-us/articles/38934034280855-Usernames-no-WhatsApp-BSUID-novos-IDs-e-impactos-no-Blip | Validação: recusar disparo de template `category=AUTHENTICATION` para destinatário que só tem BSUID, sem telefone resolvido |
| ⚠️ Categoria muda custo/precificação Meta | Não documentado nas fontes consultadas (preço é definido pela Meta, fora do escopo da Blip) | Cobrança por conversa iniciada | — | Não modelar preço fixo por categoria no Pipe; se for cobrar, isso é campo de configuração por tenant, nunca constante |

### 1.3 Ciclo de vida do template (aprovação)

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Estados de aprovação (fluxo básico) | `Pending` (Under review) → `Approved` ou `Rejected` | Todo template submetido | https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp | Enum `template_status` com transição unidirecional Pending→{Approved,Rejected} |
| Estados estendidos (qualidade pós-aprovação) | `Active - pending quality`, `Active - high quality`, `Active - medium quality`, `Active - low quality`, `Paused`, `Disabled`, `Appeal requested`, além de `Rejected`/`Approved` | Templates já aprovados, ao longo do uso | https://help.blip.ai/hc/en-us/articles/18503624553367-WhatsApp-Business-Manager | Modelar `template_status` e `template_quality` como dois campos separados (status de aprovação ≠ qualidade em uso); ⚠️ os nomes/estados desses estágios são definidos pela Meta e podem mudar — não fixar como constante de código, ler do payload/webhook |
| Motivo de reprovação documentado | Variável de template no início ou no fim do texto → rejeitado com "erro de formatação" (regra da Meta) | Corpo do template, na criação | https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp | Validação de entrada no cadastro de template: recusar `{{1}}` como primeiro ou último token do corpo, antes mesmo de submeter à Meta |
| Tempo de aprovação | Não documentado (a Blip não informa um SLA de análise da Meta) | Análise de template novo | — | Não modelar SLA fixo; se necessário, expor apenas o status corrente via polling/webhook |
| Atraso de propagação após aprovação | Até 20 minutos para o template aprovado refletir na WhatsApp Business API | Uso do template recém-aprovado em campanha | https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp | Regra de espera/aviso na tela: bloquear ou avisar disparo de campanha nos primeiros 20 min após `status=Approved` |
| O que invalida um template já aprovado | Pausa por baixa qualidade (`Paused`), reprovação após edição, ou desativação (`Disabled`) pela Meta — notificado por webhook `message_template_status_update`, e-mail ao admin do WABA e alerta no WhatsApp Manager | Template em uso | https://help.blip.ai/hc/en-us/articles/18503624553367-WhatsApp-Business-Manager | Endpoint/consumer de webhook `message_template_status_update` no Pipe para invalidar cache local de template imediatamente, não só por polling |
| Edição de template reprovado/pausado | Na Blip, editar exige **criar um novo template** (não há edição in-place do template já cadastrado); na WABA nativa dá para editar sem reenviar para aprovação | Ciclo de correção de template | mesma fonte acima | Regra de produto: tratar "editar template" no Pipe sempre como criação de novo registro com novo `template_key`, nunca update do aprovado |

### 1.4 Variáveis de template — numeração, posição e deslocamento por mídia no cabeçalho

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Numeração de variável | `{{1}}`, `{{2}}`, ... sequencial, sem pular índice | Corpo do template | https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp | Validação de sequência contígua a partir de 1 no cadastro |
| Teto de variáveis por template | Não documentado numericamente nas fontes da Blip (WhatsApp Business API, fora da Blip, limita a 10 variáveis de corpo — não confirmado como regra própria da Blip) | Corpo do template | — (limite de 10 é conhecimento de mercado, não confirmado em `docs.blip.ai`/`help.blip.ai`) | Registrar como "não documentado pela Blip"; se for aplicar teto de 10 no Pipe, marcar explicitamente como suposição herdada da Meta, não da Blip |
| Variável no início/fim do texto | Proibido — Meta rejeita com erro de formatação | Corpo do template | https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp | Validação de entrada (client-side e server-side) antes de submeter |
| **Deslocamento de parâmetro por mídia no cabeçalho** (regra já suspeitada, agora confirmada) | Quando o template tem imagem/vídeo/documento no cabeçalho, a mídia ocupa o parâmetro de posição **1**; todas as variáveis do corpo deslocam **+1** em relação à numeração declarada no corpo | Templates com `header.type` em {image, video, document} | Confirmado no levantamento local `C:/Users/anderson.linhares/pipe/docs/pesquisa/apis.md` (seção 1.8), com endpoint de conferência `GET /message-templates-enriched?templateName=<nome>` em `postmaster@wa.gw.msging.net`; alinhado ao payload de exemplo do Chatwoot (`processed_params.header.media_url` ocupando slot antes de `processed_params.body`) | **Constraint de banco**: campo `has_header_media: boolean` na entidade `template`, calculado a partir do `message-templates-enriched`, nunca digitado manualmente por quem cadastra; função em `packages/core` que aplica o offset automaticamente ao montar `messageParams`/`processed_params`, nunca deixando o operador numerar à mão |
| Duas formas de `messageParams` no mesmo disparo de campanha | `audiences[].messageParams` é objeto chaveado por posição (`{"1":"Ana"}`); `message.messageParams` é array das chaves na ordem (`["1","2"]`) | Payload de `POST /campaign/full` (`postmaster@activecampaign.msging.net`) | `apis.md` local, seção 1.8 | Teste de unidade em `packages/core` que monta os dois formatos a partir de uma única estrutura interna, evitando o erro silencioso (a Blip só devolve erro na resposta, não valida o payload) |

### 1.5 Botões

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Tipos de botão suportados no cadastro de template pela Blip | Call to Action → "Website Link" (URL estática ou dinâmica com 1 variável) e "Phone Number" (chamada); Quick Reply (resposta rápida) | Cadastro de Message Template no portal | https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp | Enum `button_type` em {website_link, phone_number, quick_reply} — cobre o que a Blip expõe; não modelar tipos que a WABA nativa tem mas a Blip não expõe no cadastro (ex.: copy code), a menos que confirmado depois |
| Quantidade máxima de Quick Reply | **3 botões** | Template do tipo Quick Reply | https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp ("you can add up to a maximum of 3 buttons") | Constraint de banco: `CHECK (array_length(quick_reply_buttons,1) <= 3)` |
| URL dinâmica com variável | Só é permitida 1 variável, obrigatoriamente **no final** da URL — se a variável não estiver no final, o sistema não reconhece como URL dinâmica | Botão "Website Link" | mesma fonte acima | Validação de entrada: variável de URL só é aceita como sufixo, senão o cadastro trata a URL como estática (comportamento silencioso — vira aviso explícito na tela do Pipe) |
| Limite de caracteres por botão | Não documentado nas fontes da Blip consultadas | Texto de cada botão | — | Registrar como "não documentado"; validar apenas contra o retorno de erro da Meta em tempo de submissão, não travar client-side com número inventado |
| Combinação de botões com outros tipos de conteúdo | Permitido combinar botões com imagem, vídeo ou documento no mesmo template | Template com corpo de mídia + botões | mesma fonte acima | Sem constraint adicional — já coberto pelo `has_header_media` da seção 1.4 |

### 1.6 Limites de mídia por tipo (tamanho e formato)

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Tamanho máximo — documentos | **100 MB** | Upload/envio de PDF, DOC, XLS e afins pela Blip (Desk, Builder, API) | https://help.blip.ai/hc/en-us/articles/4474414088855-Blip-media-upload-policy | Constraint de validação de upload: rejeitar arquivo de documento > 100 MB antes de tentar enviar à Blip (evita erro tardio na resposta da API) |
| Tamanho máximo — vídeo e áudio | **16 MB** para ambos | Upload/envio de vídeo e áudio pela Blip | mesma fonte acima | Mesma validação de upload, com teto de 16 MB para `video/*` e `audio/*` |
| Tamanho máximo — vídeo em Message Template | **16 MB** (regra específica repetida na doc de criação de template) | Cadastro de conteúdo de vídeo em Message Template | https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp | Mesmo teto de 16 MB aplicado também no fluxo de cadastro de template, não só no envio avulso |
| Formatos aceitos — áudio | `aac, midi, mp3, mp4, mpeg, wav, ogg, wma, webm, opus, x-aac, amr` | Upload de áudio | https://help.blip.ai/hc/en-us/articles/4474414088855-Blip-media-upload-policy | ⚠️ Lista de MIME types aceitos como configuração (tabela `allowed_media_types`), não `enum` fixo no schema — a Blip já alterou essa lista ("três novidades lançadas recentemente"), então deve ser dado atualizável, não constante de código |
| Formatos aceitos — imagem | `gif, jpeg, jpg, jfif, png, svg+xml, tiff, vnd.dwg, webp` | Upload de imagem | mesma fonte acima | mesma observação ⚠️ |
| Formatos aceitos — vídeo | `3gpp, avi, mpeg, mpg, mp4, mov, m4v, wmv, webm, ogg` | Upload de vídeo | mesma fonte acima | mesma observação ⚠️ |
| Formatos aceitos — documento | `pdf, xls/xlsx (+ template), doc/docx (+ template), ppt/pptx (+ template/slideshow), outlook (.msg), zip, rar, csv, html, txt` | Upload de documento | mesma fonte acima | mesma observação ⚠️ |
| Sticker | Não documentado como tipo de mídia separado nas fontes consultadas (a lista de MIME types da Blip não lista `image/webp` como "sticker" especificamente, ainda que `webp` esteja na lista de imagem) | Envio de figurinha | — | Registrar como "não documentado"; não modelar sticker como formato próprio até confirmar |
| Verificação antivírus no upload | Toda mídia enviada passa por checagem de nome + ClamAV (vírus/trojan/malware) antes de aceitar | Todo upload de mídia pela Blip | https://help.blip.ai/hc/en-us/articles/4474414088855-Blip-media-upload-policy | Não é regra que o Pipe replica (é comportamento do lado Blip); serve só de contexto — não modelar dependência de scan próprio achando que a Blip não faz |

### 1.7 Limites de envio: tier de mensageria, qualidade do número, promoção/rebaixamento

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Níveis de tier (mensagens ativas por número, por 24h) | Tier 1: 1.000 clientes únicos/24h · Tier 2: 10.000/24h · Tier 3: 100.000/24h · Tier 4: ilimitado/24h | Conversas **iniciadas pela empresa** (não se aplica a resposta de conversa iniciada pelo cliente) | https://help.blip.ai/hc/en-us/articles/18503624553367-WhatsApp-Business-Manager | ⚠️ Campo de configuração por tenant/número (`messaging_tier`, `tier_limit_24h`), nunca constante — a Meta muda esses tetos; usar como teto de fila de disparo de campanha, com fallback seguro se a leitura do tier falhar |
| Tier inicial | 1.000 conversas/número ao concluir a verificação da empresa (business verification) | Número recém-verificado | mesma fonte acima | Valor inicial default só para exibição/estimativa — sempre confirmar o tier real via WABA antes de agendar campanha grande |
| Condição para subir de tier | Necessário atingir metade do limite atual de conversas iniciadas nos últimos 7 dias, **e** status do número = Connected, **e** classificação de qualidade = Medium ou High, **e** pelo menos 48h no tier atual | Reavaliação automática pela Meta a cada nova conversa iniciada | mesma fonte acima | ⚠️ Não modelar como automação própria do Pipe — é decisão da Meta; o Pipe deve apenas ler o tier corrente via API/webhook, não tentar prever/forçar a subida |
| Condição de rebaixamento | Classificação de qualidade em "Low" por 7 dias consecutivos → o teto do tier cai um nível imediatamente na próxima conversa iniciada | Número com qualidade ruim sustentada | mesma fonte acima | Alerta no painel do Pipe: monitorar `quality_rating` diário e emitir aviso quando entrar em "Low", antes que o rebaixamento aconteça |
| Estados de status do número | Connected · Flagged · Restricted | Status operacional do número | mesma fonte acima | Enum `phone_status`; bloquear disparo ativo quando `status = Restricted` |
| Recuperação de Flagged | Se a qualidade voltar a Medium/High e permanecer assim por **7 dias**, o status volta a Connected (mas se a qualidade não melhorar, ainda volta a Connected, só que com o tier rebaixado) | Número marcado como Flagged | mesma fonte acima | Job de leitura periódica de status, não decisão do Pipe |
| Efeito de Restricted | Não é possível enviar mensagem ativa por **24 horas**; o número ainda pode responder a mensagens recebidas | Número que bateu o teto do tier | mesma fonte acima | Validação de envio: bloquear campanha ativa quando `status = Restricted`, permitir resposta dentro da janela de 24h normalmente |
| Classificação de qualidade (Number Health) | High / Medium / Low, calculada com base nas mensagens dos últimos **7 dias** (bloqueios, denúncias e outros sinais de feedback) | Todo número WhatsApp conectado | mesma fonte acima | Campo `quality_rating` como snapshot lido da Meta via WABA/webhook, nunca calculado internamente pelo Pipe |
| Penalidade por qualidade agora é por template, não só por número | Sistema de pausa/reprovação por template com baixa performance (critério da própria Meta), separado da penalidade do número | Template específico com engajamento ruim | mesma fonte acima | Separar `template_quality` (seção 1.3) de `phone_quality_rating` (esta seção) — são dois relógios diferentes |

### 1.8 Identificadores: telefone, WhatsApp ID, BSUID/username

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| O que não muda com a evolução de usernames da Meta | Toda conta WhatsApp ainda exige telefone vinculado; templates de **autenticação** ainda exigem o telefone do destinatário; contato sem username continua identificado por telefone normalmente; disparo ativo por PN (phone number) continua funcionando | Toda a base de contatos WhatsApp | https://help.blip.ai/hc/en-us/articles/38934034280855-Usernames-no-WhatsApp-BSUID-novos-IDs-e-impactos-no-Blip | Não assumir BSUID como chave universal — telefone continua sendo obrigatório para autenticação |
| BSUID (Business-Scoped User ID) | Identificador **único por par usuário↔empresa** — o mesmo usuário final tem BSUIDs diferentes em cada empresa com que fala (escopo = Business Manager/Portfolio do WABA) | Identificação de contato quando o cliente usa username em vez de compartilhar telefone | mesma fonte acima | ⚠️ Chave de contato não pode ser globalmente única por BSUID entre tenants diferentes — o Pipe precisa de chave composta `(tenant_id, bsuid)`, nunca `bsuid` sozinho |
| Campos internos afetados | `contact.identity`, `tunnel.originator` e `tunnel.identity` podem passar a conter **GUID** no lugar do número de telefone (formato `{guid}@wa.gw.msging.net`) | Fluxo do Builder/Studio e variáveis de contexto | mesma fonte acima | Validação de entrada: parsers que hoje assumem `contact.identity` como "telefone antes do @" precisam de fallback para GUID — regex de "extrair DDD" quebra silenciosamente sem essa correção |
| Cronograma de rollout | ⚠️ A partir de **junho/2026**, países específicos já podem iniciar conversas sem compartilhar telefone; Brasil entra depois, em fase gradual (data exata não fixada, sujeita a mudança pela Meta) | Todo o ecossistema WhatsApp da Blip | mesma fonte acima | Não fixar uma data de corte no código; tratar suporte a BSUID como feature flag ativável por tenant assim que a Blip confirmar disponibilidade regional |
| Risco documentado da transição | A fragmentação de identidade **não gera erro visível** — sistemas continuam "funcionando" enquanto o histórico do contato se perde silenciosamente | Reconciliação de contato antigo (por telefone) com novo (por BSUID) | mesma fonte acima | Constraint de produto: manter uma tabela de reconciliação `phone ↔ bsuid ↔ contact_id` versionada, nunca sobrescrever identidade por completo |
| Telefone continua único formato aceito para templates de autenticação | Confirmado (ver "o que não muda" acima) | Envio de template `category=AUTHENTICATION` | mesma fonte acima | Validação de entrada: recusar envio de template de autenticação sem telefone resolvido, mesmo que exista BSUID |

---

## 2. Atendimento

### 2.1 Estados do ticket e transições permitidas

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Estados documentados | `Waiting` (na fila, aguardando atribuição) → `Open` (atribuído a um atendente) → um dos estados terminais: `Transferred`, `ClosedAttendant` (atendente/gestor fechou), `ClosedClient` (cliente saiu pela condição de saída do fluxo), `ClosedClientInactivity` (fechamento automático por inatividade) | Ciclo de vida de todo ticket no Desk | Confirmado via busca indexando `help.blip.ai` (páginas "Calculating customer service metrics" / "Blip Desk Overview"); ciclo consistente com o já registrado em `C:/Users/anderson.linhares/pipe/docs/pesquisa/blip-desk-funcoes.md` | Enum `ticket_status` com transição direcional: `Waiting → Open`, `Open → {Transferred, ClosedAttendant, ClosedClient, ClosedClientInactivity}` — nunca o inverso; constraint de banco (`CHECK`) para impedir voltar de um estado fechado para `Open` |
| Transferência não é uma transição "in place" | Transferir fecha o ticket original com status `Transferred` e **abre um ticket novo** na fila/atendente de destino — não é update de status no mesmo registro | Toda transferência, manual ou automática | `apis.md` local (seção 1.6, validado em produção) + `blip-desk-funcoes.md` local | Modelagem: `ticket.transferred_to_ticket_id` como referência ao novo registro, nunca reaproveitar a PK; comparar o `id` retornado pela Blip com o `id` enviado para saber se abriu ticket novo |
| Fila sintética em transferência para atendente específico | Campo `team` grava o valor literal `DIRECT_TRANSFER` quando o destino é um atendente específico, não o nome de uma fila real | Transferência direta atendente→atendente | `apis.md` local — medido em produção: ~74% das transferências chegam assim | Constraint de leitura: nunca agregar métricas de "atendimento por fila" contando `team` cru sem tratar `DIRECT_TRANSFER` como caso especial |
| Quem pode fechar um ticket | O atendente (no Desk), o gestor/monitor (pela tela de Monitoramento, inclusive em lote), o próprio cliente (via condição de saída no fluxo do bot, gera `ClosedClient`), ou o sistema (por inatividade, gera `ClosedClientInactivity`) | Encerramento de ticket | https://help.blip.ai/hc/en-us/articles/4474433509271-How-to-close-tickets ; https://help.blip.ai/hc/en-us/articles/6282439217943-User-Closing-Tickets | Campo `closed_by` (enum: agent, manager, client, system) derivado do `ticket_status` final — necessário para relatório de "quem fechou" no Pipe |
| Ticket "abandonado" pelo cliente não fecha sozinho | Quando o cliente encerra a própria conversa (sai/some), o Desk marca visualmente como "abandonado", mas o atendente ainda precisa finalizar manualmente | Alertas visuais do Desk | `blip-desk-funcoes.md` local (fonte: mirror do help center antigo) | Regra de produto: não tratar "cliente parou de responder" como fechamento automático — só o job de inatividade (seção 2.2) fecha de fato |

### 2.2 Prazos: inatividade do cliente, inatividade do atendente, fechamento automático

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Tempo de inatividade do cliente | Configurável por bot; precisa ser **inteiro > 0**, em minutos ou horas — sem valor default documentado | Fechamento automático por inatividade | https://help.blip.ai/hc/en-us/articles/4474433590679-Automatic-Closure-due-to-Client-Inactivity | Campo de configuração por tenant/bot (`inactivity_timeout_minutes`), com `CHECK (> 0)`; nunca constante fixa |
| Restrição entre inatividade e timeout de sessão do Builder | O tempo de inatividade configurado **precisa ser menor** que o timeout de sessão do Builder (Session Expiration, medido em **segundos** no Builder) — senão a sessão do usuário no fluxo expira antes do ticket fechar por inatividade | Configuração combinada Desk + Builder | mesma fonte + https://help.blip.ai/hc/en-us/articles/5816805305751-Setting-up-Session-Expiration-and-Timeout | Validação cruzada na tela de configuração do Pipe: recusar salvar `inactivity_timeout` >= `builder_session_timeout` quando os dois existirem |
| Alerta prévio de fechamento por inatividade | Tempo de alerta precisa ser **menor** que o tempo total de fechamento configurado; ambos inteiros > 0 (minutos ou horas) | Aviso ao cliente antes do fechamento automático | https://help.blip.ai/hc/en-us/articles/4474433590679-Automatic-Closure-due-to-Client-Inactivity | `CHECK (alert_before_minutes < inactivity_timeout_minutes)` |
| Duas regras de contagem de inatividade (modo avançado) | Modo padrão: conta a partir da 1ª resposta do atendente (se "fechar só após 1ª resposta" estiver marcado) ou a partir da criação do ticket (se desmarcado); ambos resetam só com mensagem do cliente | Contagem de tempo ocioso | mesma fonte acima | Duas estratégias de cálculo de `last_activity_at` no `packages/core`, selecionáveis por config — não hardcodar uma só |
| Variante "não fechar se o cliente está esperando resposta" | Só conta como inativo quando o **atendente** já respondeu e o cliente não voltou; se o cliente mandou mensagem e o atendente não respondeu, o ticket não fecha | Config avançada de fechamento automático | mesma fonte acima | Flag booleana `dont_close_if_waiting_agent_reply` que muda a fórmula de cálculo do timer |
| Prazo de resposta do atendente (SLA de 1ª resposta) | Alerta configurável em minutos/horas; contador **zera a cada resposta do atendente** e reinicia a cada nova mensagem do cliente — teto exato não documentado numericamente | Alerta de tempo máximo de resposta | `blip-desk-funcoes.md` local | Campo de configuração por tenant (`first_response_sla_minutes`), sem valor default assumido |
| Requisito de elegibilidade da automação | Só funciona em bots com transbordo para o Desk configurado; precisa ser configurado em **dois lugares** (Builder + Configurações Gerais do Portal) | Toda automação de fechamento por inatividade | mesma fonte acima | Checklist de onboarding de tenant: sinalizar no Pipe quando só uma das duas configurações estiver feita (estado inconsistente comum) |

### 2.3 Elegibilidade de atendente e limites simultâneos

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Critérios de elegibilidade para receber ticket automaticamente | (1) pertencer à fila do ticket; (2) status = Online; (3) ter ao menos 1 vaga livre (limite configurado de tickets simultâneos menos os já ativos) | Distribuição automática | `blip-desk-funcoes.md` local (fonte: help.blip.ai "How Automatic Ticket Distribution Works") | Query de elegibilidade em `packages/core` com os três critérios como `AND`, testável isoladamente |
| Limite de tickets simultâneos por atendente | Inteiro **> 0**, configurável globalmente em Configurações Gerais, **sobrescritível por atendente individualmente** — mudança no valor global não afeta quem já tem override | Distribuição automática | mesma fonte acima | Constraint de banco: `agent.max_concurrent_tickets` com fallback para `tenant.default_max_concurrent_tickets` quando nulo — nunca um único valor global aplicado a todos sem checar override |
| Modos de rodízio quando há mais de um atendente elegível | Modo A (padrão): prioriza quem tem menos tickets ativos, desempate por mais tempo sem receber ticket. Modo B: prioriza quem está há mais tempo sem receber ticket, desempate por menos tickets ativos | Distribuição automática, configurável pelo gestor | mesma fonte acima | Campo de configuração por tenant (`distribution_mode` enum A/B) — a ordem de desempate é parte da regra, não incidental |
| Bloqueio de "puxar" ticket manualmente | Configurável: dá para desativar o botão "Atender" e restringir 100% à distribuição automática | Operação do Desk | mesma fonte acima | Flag `manual_pull_disabled` por bot |
| Limite de tickets sem 1ª resposta acumulados | Existe opção de limitar quantos tickets um atendente pode acumular **sem ter mandado nenhuma primeira resposta** — teto exato configurável, não documentado como número fixo | Distribuição automática | mesma fonte acima | Campo de configuração (`max_tickets_without_first_response`), sem default assumido |
| Status do atendente que habilita recebimento | Só recebe novo ticket com status = **Online**; Pausa e Invisível não recebem novos (mas continuam os já atribuídos); Offline é automático (perda de sessão), não escolhível | Elegibilidade de distribuição | `blip-desk-funcoes.md` local | Enum `agent_status` em {online, paused, invisible, offline}; `offline` nunca é setado manualmente pela API do Pipe, só derivado de desconexão |
| Status padrão ao entrar no Desk | **Invisível** por padrão — o atendente precisa mudar manualmente para Online | Login no Desk | mesma fonte acima | Não assumir que login = disponível; o Pipe deve espelhar esse default, não "otimizar" auto-ativando Online |
| Persistência do status ao fechar a aba | Tempo em cada status só conta com a aba do Desk aberta; ao fechar, conta como offline; ao reabrir, volta para Invisível — **exceto** se a preferência "permanecer online ao fechar" estiver ativa (aí preserva só o Online, nunca Pausa/Invisível) | Cálculo de tempo por status | mesma fonte acima | Regra de borda a documentar em teste de `packages/core`: o cálculo de "tempo online" não pode assumir sessão contínua sem checar essa exceção |

### 2.4 Ordem de avaliação das regras de fila

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Critérios usados nas regras de direcionamento | Conteúdo da mensagem, nome, e-mail ou um campo "extra" do contato | Regras de fila (roteamento) | `blip-desk-funcoes.md` local (fonte: help.blip.ai "How to Manage Queues and Service Rules") | Modelar regra como lista ordenada de condições sobre esses 4 tipos de campo — nenhum outro tipo de critério documentado |
| Ordem exata de avaliação entre múltiplas regras (primeira que casa vs. todas avaliadas) | **Não documentado** nas fontes consultadas — só está confirmado que existe uma lista de regras e uma fila "Default" para quando nenhuma bate | mesma fonte acima | — | Registrar explicitamente como lacuna: o Pipe não deve assumir "primeira regra que bate vence" nem "última regra vence" sem confirmar com um teste em ambiente real da Blip antes de replicar a lógica |
| Comportamento quando nenhuma regra bate | Cai na fila **"Default"** | Roteamento de ticket | mesma fonte acima | Toda tabela de filas no Pipe precisa de uma fila `is_default = true` obrigatória (constraint), nunca op cional |
| Tags de encerramento por fila | Podem ser cadastradas por fila — só aparecem para tickets daquela fila específica | Encerramento de ticket | mesma fonte acima | Relação `queue_id → allowed_closing_tags` (N:N), não uma lista global de tags para todo o tenant |
| Permissão para gerenciar filas e regras | Exige permissão "Atendimento > Visualizar e editar" | Configuração de fila | mesma fonte acima | Mapeamento de permissão equivalente no RBAC do Pipe |

### 2.5 Prioridade: níveis e precedência

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Níveis de prioridade | Baixa, Média, Alta (regras de priorização por fila, mesmos critérios da seção 2.4: conteúdo, nome, e-mail, campo extra) | Priorização automática de ticket | `blip-desk-funcoes.md` local | Enum `ticket_priority` em {low, medium, high} + nível adicional abaixo (ver próxima linha) |
| Ticket sem prioridade nenhuma vs. prioridade "baixa" | Um ticket com prioridade "baixa" **fura a frente** de um ticket sem prioridade nenhuma atribuída | Ordenação da fila | mesma fonte acima | `ticket_priority` deve aceitar `NULL`/"nenhuma" como nível **abaixo** de `low`, não tratar ausência de prioridade como equivalente a "baixa" |
| Prioridade máxima automática para resposta a mensagem ativa | Configurável: dá para forçar prioridade máxima a todo ticket originado de resposta a mensagem ativa, **superando qualquer outra regra de prioridade** | Ticket originado de campanha/disparo ativo | https://help.blip.ai/hc/en-us/articles/7373954031127-Sending-Active-WhatsApp-Messages-in-Blip-Desk | Regra de precedência no `packages/core`: se `origin = active_message_reply` e a config estiver ligada, ignorar a prioridade calculada pelas regras normais |
| Priorização manual pelo atendente | Até **50 tickets fixados** no topo da lista pessoal do atendente | Organização manual da lista de tickets | `blip-desk-funcoes.md` local (fonte: help.blip.ai pt-br) | `CHECK (pinned_tickets_count <= 50)` por atendente |

### 2.6 Transferência: o que se preserva e o que se perde

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| O que se preserva | O novo ticket **herda a prioridade** do original | Transferência de fila ou de atendente | `blip-desk-funcoes.md` local | Copiar `priority` explicitamente ao criar o ticket novo na transferência |
| O que se perde | Tags fixadas no ticket original **não são herdadas** pelo novo ticket | Transferência | mesma fonte acima | Não copiar `tags` automaticamente; se o Pipe quiser preservar histórico de tags, precisa de tabela própria de histórico por `customer_identity`, não pelo ticket |
| Limite de transferência em lote nativa | **Não existe** transferência em lote na API — cada ticket é um comando individual; "lote" só existe como concorrência client-side | Transferência via API/LIME | `apis.md` local, seção 1.6 | Nunca modelar um endpoint "bulk transfer" no Pipe que dependa de suporte nativo da Blip — implementar como N chamadas com concorrência limitada e resultado por item |
| Transferência com fila/atendente offline | A opção "transferir mesmo com toda a fila/atendente offline" no portal vale **só para transferência manual**, não vale para transbordo automático nem para distribuição automática | Configuração de transferência | `blip-desk-funcoes.md` local | Duas flags de configuração separadas — não assumir que uma habilita a outra |
| Revalidação de status antes de transferir | O status do ticket pode mudar entre a leitura e o comando de transferência — é preciso reler o status imediatamente antes de enviar o comando | Transferência via API | `apis.md` local, seção 1.6 (validado em produção) | Padrão de código obrigatório em `packages/core`: sempre `GET` do ticket imediatamente antes do `POST` de transferência, tratando a corrida como esperada, não como exceção |
| Escopo de "ações em massa" (extensões pagas de terceiros) | Só funcionam entre tickets do **mesmo bot** — trocar de bot exige repetir o processo | Extensões de transferência em massa | `blip-desk-funcoes.md` local | Não modelar transferência cross-bot como operação atômica no Pipe |

---

## 3. Plataforma

### 3.1 Limites de taxa da API

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Comandos por segundo — free tier | **48 comandos/segundo** | Toda chamada de comando LIME (`POST /commands`) | `docs.blip.ai` (via WebFetch da home, seção "Throughputs"), consolidado em `apis.md` local | ⚠️ Campo de configuração por tenant/plano (`rate_limit_cmds_per_sec`), nunca constante — a Blip pode mudar o valor por contrato |
| Comandos por segundo — paid tier | **200 comandos/segundo** | mesma aplicação | mesma fonte | mesma observação ⚠️ |
| Mensagens por segundo (throughput de envio, distinto do rate limit de comando) | 3 msgs/seg (free) a 50 msgs/seg (paid), segundo o texto indexado da home de `docs.blip.ai` — não confirmado por leitura de subpágina dedicada (as subpáginas de `docs.blip.ai` retornaram 404 para fetch direto) | Envio de mensagens (não comandos de consulta) | `docs.blip.ai` (WebFetch da home — conteúdo não re-confirmado em página filha) | Tratar como **não totalmente confirmado**: registrar os dois números (3–50 msg/s) separados dos de comando (48–200 cmd/s) — são limites diferentes, não o mesmo número reformulado; validar com um teste de carga real antes de assumir para o Pipe |
| Comportamento ao exceder o limite | HTTP **429** nas próximas requisições, por uma janela de **2 minutos** | Qualquer excesso de comandos/segundo | `apis.md` local, seção 1.10 (atribuído a `docs.blip.ai`) | Cliente HTTP central do Pipe precisa de backoff explícito de pelo menos 2 minutos após um 429 — a Blip não oferece retry automático nem orientação de backoff além de "implemente controle de fila" |
| Recomendação oficial da Blip | Implementar controle de fila do lado do cliente em cenários de troca alta de mensagens/comandos — sem SDK de retry pronto | Integração via API | mesma fonte | Justifica a decisão de projeto: o Pipe precisa de fila/limitador de concorrência própria (ex.: 5–8 chamadas simultâneas), nunca `Promise.all` irrestrito |

### 3.2 Tamanho de página e tetos de paginação

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Teto de `$take` por página | **100** — em todos os endpoints OData (`/tickets`, `/attendants`, etc.) | Toda consulta paginada via `$skip`/`$take` | `apis.md` local, seção 1.9 (validado empiricamente contra a API) | Constraint de validação de entrada no client HTTP do Pipe: recusar `$take > 100` antes de enviar, e sempre paginar com loop com teto absoluto (nunca paginação sem limite superior) |
| Paginação de `/threads` | Não usa `$skip`/`$take` — usa cursor temporal `storageDate`, com risco de página repetida em loop | Histórico de conversa por identidade | `apis.md` local, seção 1.9 | Implementar detecção de página repetida (mesmo `storageDate` retornado duas vezes seguidas) como proteção contra loop infinito |
| Janela de alcance do `/threads` | ~60 dias — acima disso, devolve vazio silenciosamente | Reconstrução de conversa via `/threads` | Skill `case-sync` local (`C:/Users/anderson.linhares/.claude/skills/case-sync/SKILL.md`) | Limite de produto: qualquer feature do Pipe que dependa de `/threads` para histórico precisa avisar/bloquear consulta > 60 dias, e usar os endpoints de Service History (seção 3.4) para períodos maiores |

### 3.3 Limites de tamanho de campo

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Título de resposta pronta (canned response) | **60 caracteres** | Cadastro de resposta pronta no Desk | `blip-desk-funcoes.md` local (artigo original agora fora do ar; confirmado por citação cruzada com "How to Use Variables in Blip Desk Canned Responses") | `CHECK (char_length(title) <= 60)` na entidade `canned_response` |
| Corpo do template de mensagem (WhatsApp) | **1.024 caracteres** — mesmo teto para as categorias Marketing, Utilidade e Autenticação | Corpo de Message Template | https://help.blip.ai/hc/en-us/articles/27905582160535-Questions-about-message-templates-on-WhatsApp ; confirmado de forma cruzada em https://help.blip.ai/hc/en-us/articles/24288080745111-Carousel-Templates | `CHECK (char_length(body) <= 1024)` na entidade `template` |
| Texto de mensagem de sessão (fora de template) | Não confirmado por leitura direta de artigo da Blip — literatura de mercado aponta 4.096 caracteres para mensagem de sessão do WhatsApp Business API, mas essa página específica não pôde ser lida diretamente (retornou 404 na navegação) | Mensagem de texto livre dentro da janela de 24h | não confirmado — marcar como "não documentado pela Blip" apesar de indício externo | Não fixar 4096 como constante; se usado, marcar claramente como suposição herdada da API da Meta e revalidar antes de shippar validação de formulário |
| Nome de template | Somente letras minúsculas, números ou underscore (`_`) — sem espaço ou maiúscula | Cadastro de Message Template | https://help.blip.ai/hc/en-us/articles/4474382379799-How-to-Create-and-Approve-a-Message-Template-in-WhatsApp | Regex de validação `^[a-z0-9_]+$` no cadastro |
| Atributos extras do contato (`extras`) | Tamanho máximo não documentado nas fontes consultadas | `contact.extras` (chave-valor livre) | — | Registrar como "não documentado"; não impor teto arbitrário — se necessário por questão de operação do Pipe, expor como configuração de tenant, nunca como limite herdado da Blip |

### 3.4 Retenção de dados

| Regra | Valor ou limite exato | Onde se aplica | Fonte (URL) | O que vira no Pipe |
|---|---|---|---|---|
| Histórico de atendimento — lista completa com transcrição visível na tela | Até **90 dias** antes da data atual | Tela de Service History do Portal | https://help.blip.ai/hc/en-us/articles/4474418319383-Service-History | Regra de UX/produto: acima de 90 dias, o Pipe precisa oferecer fluxo assíncrono (like Blip: pedido processado, entrega por e-mail/arquivo), não tentar servir síncrono |
| Histórico — pedido de lista de tickets (sem transcrição) para período maior | Até **1 ano**, processamento assíncrono | Extração de lista de tickets antigos | mesma fonte acima | mesma observação — jobs assíncronos com entrega posterior |
| Histórico — pedido de transcrição completa (ticket ou contato específico) | Até **5 anos**, processamento assíncrono, entrega por e-mail | Extração de transcrição completa | mesma fonte acima | Mesmo padrão — mas com teto de 5 anos, não indefinido |
| Janela efetiva do endpoint `/threads` (API, não Portal) | ~60 dias (ver seção 3.2) | Consulta em tempo real via API | skill `case-sync` local | Diferenciar claramente para quem for construir sobre a API: 60 dias por API vs. até 5 anos por extração assíncrona do Portal — são dois caminhos de dado diferentes, com latência muito diferente |
| Retenção de execução/log do n8n (contexto do próprio Pipe, não da Blip) | 3 a 4 dias | Debug de pipelines que consomem a Blip via n8n | skill `case-sync` local | Não é regra da Blip, mas afeta o design do Pipe: qualquer replay/depuração de webhook precisa de captura própria de payload, não pode depender da retenção do orquestrador |
| Retenção de mensagens brutas em tabela de mensagens (dado não confirmado por leitura direta) | Indício de busca (não confirmado por leitura primária): 3 dias de retenção "quente" (D-0 a D-2) + carga histórica de 360 dias disponível por 7 dias para ingestão | Tabela interna de mensagens da Blip (não é dado de API pública documentada) | Resultado de busca sobre `help.blip.ai`, artigo não recuperado diretamente (link quebrado no momento da checagem) | Marcar como **não confirmado** — não usar esse número para dimensionar SLA de ingestão do Pipe sem antes confirmar lendo o artigo original ou abrindo chamado com a Blip |
| Retenção de mídia (URL de mídia expira) | Existe expiração de URL de mídia — o parâmetro `refreshExpiredMedia=true` em `/threads` renova; prazo exato de expiração não documentado numericamente | Link de mídia recebida/enviada | `apis.md` local, seção 1.5 (`/threads` com `refreshExpiredMedia`) | Nunca persistir a URL de mídia da Blip como definitiva no Pipe — sempre baixar e re-hospedar, ou renovar sob demanda antes de exibir |

---

## Lacunas explícitas (não documentado, não estimado)

Ficam registradas aqui, sem número, para não se perderem: teto de variáveis por template (a Blip não
documenta; mercado diz 10, mas não é fonte Blip), limite de caracteres por texto de botão, SLA de
aprovação de template pela Meta, ordem exata de avaliação entre múltiplas regras de fila quando mais
de uma bate, teto de tamanho de `contact.extras`, teto de caracteres de mensagem de sessão fora de
template confirmado por fonte primária Blip, prazo exato de expiração de URL de mídia, e a retenção
"quente" de mensagens em tabela interna (D-0/D-2/360 dias — apenas indício de busca, não confirmado
por leitura direta do artigo-fonte).

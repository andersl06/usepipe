# Varredura final — quebras em runtime da renomeação PT→EN (Fase 1)

Investigação somente leitura, branch `limpeza`. 8 agentes paralelos cobriram: contratos de resposta de API, CSS/JSX/seletores, rotas, filas/sockets/eventos, cookies/storage/headers, jsonb/env-vars, SQL bruto com alias + tipos locais duplicados no front, e uma varredura de cobertura adicional sobre os `useRead<...>` restantes em management-vite/desk-vite. Nenhum arquivo do repositório foi editado.

**Achado central**: a classe de bug de maior volume e impacto é um único padrão repetido dezenas de vezes: telas de `apps/management-vite` e `apps/desk-vite` declaram sua própria interface TypeScript local (em `lib/*.ts` ou inline na página) para descrever a resposta de um endpoint, em vez de importar de `@pipe/contracts` ou do tipo real de domínio da API — e essa interface local ainda usa nomes em português enquanto a API já responde em inglês (ou vice-versa). Como o campo é lido dentro de um objeto `any`/tipo local, o compilador nunca detecta a divergência. Isso já havia acontecido uma vez (`apps/management-vite/src/lib/monitoring.ts`, corrigido) e se mostrou sistêmico: foram confirmadas **mais de 40 ocorrências**, incluindo pelo menos **9 crashes de página inteira**.

Uma segunda classe de mesmo mecanismo, mas na camada SQL: consultas `db.execute<{...}>(sql\`...\`)`/`tx.execute<...>` em `apps/api` usam um generic TypeScript em camelCase enquanto o `SELECT` real não tem alias (coluna fica com o nome português/snake_case do banco) ou tem alias sem aspas (Postgres rebaixa para minúsculas). O driver não faz nenhum mapeamento de chaves — o generic é uma mentira que o compilador não confere. **16 ocorrências confirmadas**, uma delas em um fluxo de autenticação.

---

## 1. Críticos — autenticação, dinheiro, identidade de contato, risco de perda de dados

### 1.1 Troca de conta quebra a escrita da sessão (auth) — alta confiança
- SQL: `apps/api/src/controllers/my-account.ts:285` — generic `{ userId: string; slug: string }`, SQL `select u.id as usuario_id, t.slug` (sem aspas no alias).
- Consumo: `alvo.userId` é sempre `undefined`, passado para `openSessionAt(..., alvo.userId, ...)` em `my-account.ts:298`.
- Quebra: `sessao.usuario_id` é `NOT NULL` no banco — `POST /v1/accounts/exchange` deve falhar (500 ou "user_inactive") em toda troca de conta.
- Fix: `u.id as "userId"`.

### 1.2 "Minha conta" (GET/PATCH) retorna dados da empresa em branco, risco de sobrescrever com vazio
- SQL: `apps/api/src/controllers/my-account.ts:155` (GET) e `:195` (PATCH `returning`), ambos tipados como `LineAccount`, SQL sem alias para `nome, plano, funcionarios, cidade, estado, pais, telefone`.
- Consumo: `apps/api/.../my-account.ts:90 forContract` lê `.name/.plan/.employees/.city/.state/.phone` — todos `undefined`.
- Front agrava: `apps/management-vite/src/lib/account.ts:5-24` (`AccountInForce{nome,telefone,funcionarios}`) também diverge do real `{name,phone,employees}` (`my-account.ts:49-71`) → formulário "Minha Conta"/"Boas-vindas" carrega os campos telefone/tamanho da empresa em branco (`apps/management-vite/src/pages/my-account/page.tsx:169,190,212`); salvar sem preencher de novo pode **apagar dados reais salvos**.
- Fix: aliasar as colunas SQL (`nome as "name"`, etc.) e alinhar `lib/account.ts` com a API.

### 1.3 Contas pessoais vs. de empresa nunca são diferenciadas
- `apps/api/src/controllers/my-account.ts:228` — generic tem `personal: boolean`, SQL retorna `... as pessoal`. Sempre `undefined`.
- Fix: `as "personal"`.

### 1.4 Seletor de conta (barra superior, visível em quase toda página de management-vite)
- Front: `apps/management-vite/src/lib/shell.ts:10-18` / `lib/account.ts:26-37` — `AccountInList{nome,plano,emVigor,onboardingConcluido,pessoal}`.
- Real API: `apps/api/src/controllers/my-account.ts:113-125` — `{name,plan,inForce,onboardingCompleted,personal}`.
- Consumo: `apps/management-vite/src/components/barra-do-portal.tsx:19,73,75,76,79,81` — a conta atual nunca é filtrada da lista de "outras contas" (`!c.emVigor` é sempre `true`), nome/plano de toda conta renderiza em branco, ícone pessoal-vs-empresa sempre errado, badge de "em cadastro" aparece permanentemente em todas as contas. Também quebra `pages/switch-account/no-access/page.tsx:17-38`.

### 1.5 Recuperação de espelhamento CRM enfileira jobs com `contactId: undefined`
- `apps/api/src/domain/mirror-crm.ts:82` — generic `{ tenant_id; contactId }`, SQL `c.id as contato_id`.
- `:94` mapeia `contactId: l.contactId` (sempre `undefined`) → a rede de segurança que re-espelha contatos no Twenty **silenciosamente não faz nada**.
- Fix: `as "contactId"`.

### 1.6 Envio de mensagem ativa/template no Desk sempre falha (dinheiro + conteúdo de mensagem)
- Front: `apps/desk-vite/src/pages/active-message/page.tsx:97` posta `{ canal_id, template_id, parametros, contatos:[{contato_id, telefone, nome}] }`.
- API: `CorpoDoDisparo` (`apps/api/src/controllers/messages-active.ts:20`) espera `{ channelId, template_id, contacts:[{contactId, phone, name, parametros}] }`.
- `corpo.channelId` é `undefined` → todo envio lança `channel_required` (`messages-active.ts:73`). **Toda campanha de mensagem ativa do Desk está quebrada.**

### 1.7 Templates aprovados de WhatsApp perdem as variáveis (conteúdo de mensagem)
- `apps/api/src/domain/desk/consultas.ts:268` (`listarTemplatesAprovados`) não aliasa `variaveis`; contrato `TemplateAprovado.variables` (`packages/contracts/src/desk.ts:137`) sempre `undefined`.
- `desk-vite/.../attendances/composer.tsx:392` e `active-message/page.tsx:69` caem para `[]` → templates com `{{1}}` não mostram campos de parâmetro.

### 1.8 Notas internas do Desk nunca podem ser salvas
- Front: `attendances/panel.tsx:394` envia `{ conversationId, texto }`.
- API: `apps/api/src/domain/desk/actions.ts:110` lê `data.get('conversaId')`. Todo save falha com "Conversa não informada."

### 1.9 Desk esconde toda mensagem de erro do servidor
- `apps/desk-vite/src/lib/api.ts:45` procura `mensagem` no topo da resposta; `apps/api/src/errors.ts:60` envia `{ error: { code, message } }`. Todo erro do Desk mostra o genérico "A api respondeu N." (management-vite trata isso corretamente via `rest.ts motivoDe`, mas seu `api.ts:45` tem o mesmo ramo morto).

### 1.10 Regras de permissão de agente — toggles cruzados entre si
- Front: `apps/management-vite/src/lib/agents-gravar.ts:11-25` `PermissionRow{codigo,grupo}`, `agents[].nome`.
- Consumo: `pages/registrations/agents-permissions.tsx:105-121` — `key={p.codigo}` é `undefined` para toda linha (campo real é `code`) → **todas as permissões leem/escrevem pela mesma chave `editado[undefined]`**: alternar uma permissão visualmente vira todas juntas; nada salva na permissão certa.
- Real API: `apps/api/src/domain/management/permissions-of-agent.ts:34-52` `{code,group}`, `{name}`.

---

## 2. Crashes de página inteira em `apps/management-vite`

Todos verificados nos dois lados (tipo local do front vs. resposta real do domínio/controller da API).

1. **Cadastros › Filas** (`agents-queues.tsx`) — `apps/management-vite/src/lib/registrations.ts:25-44` (`nome,cor,active,horarioId`, `agents[].nome`) vs. `apps/api/src/domain/management/registrations.ts:69-89` (`name,color,ativa,scheduleId`, `agents[].name`). `agents-queues.tsx:104` roda `f.nome.toLowerCase()` → `TypeError`. Toggle "ativo" sempre mostra inativo. Afeta também `agents-queues-edit.tsx`, `agents-edit.tsx`, `pages/builder/panel-queues.tsx`.
2. **Regras de Atendimento (roteamento de fila)** — `apps/management-vite/src/lib/rule-queue.ts:91-106` (`campo,operador,nome,combinador`) vs. `apps/api/src/domain/management/registrations.ts:692-756` (`field,operator,name,combiner`). `rotuloDoCampo` (`rule-queue.ts:64-70`) roda `.startsWith` num `undefined` → crash em qualquer regra com ≥1 condição (quase universal). Também `QueueForChoose{nome,active}` vs. real `{name,ativa}`.
3. **Regras de Horários** — `lib/registrations.ts:110-115` `Horarios.queuesWithoutHour` vs. real `queuesWithoutSchedule` (`registrations.ts:269-274`). `regras-horarios.tsx:13,116` faz `.length` num `undefined` → crash em **todo carregamento**. Campos aninhados também divergem: `FaixaDoHorario{diaSemana,inicio,fim}` vs. `{dayWeek,start,end}`; `HourException{fechado,inicio,fim,motivo}` vs. `{closed,start,end,reason}`; `HorarioCadastrado.nome` vs. `.name`.
4. **Pausas de Atendentes** — `lib/registrations.ts:54-64` `MotivoDePausa{nome,ativo,pausas}` vs. real `{name,active,pauses}` (`registrations.ts:158-167`). `agents-breaks.tsx:60` roda `m.nome.toLowerCase()` → crash sempre que existe algum motivo de pausa (quase sempre).
5. **Contract › Members (busca)** — `lib/contract.ts:37-46` `ContractMember.nome` vs. real `MemberOfContract.name` (`contract.ts:88-102`). `members/tabela.tsx:109` crasha na primeira letra digitada no campo de busca.
6. **Analytics › Visão Geral** — `pages/flow/analytics/overview/page.tsx:21-25` campo `data` vs. real `dados` (`controllers/management-analytics.ts:80-84,162-179`). Crash em todo carregamento da aba.
7. **Quality Review (lista)** — wrapper `panel` (front, `pages/operation/quality-review.tsx:22-28,65`) vs. `application` (real, `controllers/management-operations.ts:106-112,318`); mais campos internos totalmente divergentes (`avaliado/formulario/notaMaxima/nota/conceito/avaliadorTipo/confiancaIa/avaliadaEm/categoria` vs. `evaluated/form/noteMaximum/note/concept/evaluatorType/confidenceAi/evaluatedAt/category`, `byEvaluator[].tipo` vs. `.type`). Crash ao carregar.
8. **Quality Review (detalhe/ficha)** — wrapper `ficha` vs. real `record` (`management-operations.ts:322-336`); mais `nome` vs. `name` (título do grupo), `fatalRejected` vs. `fatalRejecteds`, `resumo` vs. `summary`. Crash ao carregar.
9. **Reports › Esforço** e **Reports › Satisfação** — wrapper genérico `ResponseOfReport<T>` retorna `relatorio` (API, `management-operations.ts:99-104,280,296`), front lê `report` (`reports-effort.tsx:34`, `reports-satisfaction.tsx:86`) → `.reduce`/`.groups` num `undefined`, crash em ambas as telas. Campos aninhados também divergem (`lib/satisfaction.ts`: `nome/tipo/respostas/nota` vs. `name/type/responses/note`; `lib/effort.ts:16`: `nome`, `effortCannedResponseSeg` vs. `name`, `effortResponseReadySeg`).
10. **History** — `apps/management-vite/src/lib/history.ts:30` `Catalogos{queues/agents/etiquetas:{id,nome}}` vs. real `apps/api/src/domain/management/history.ts:56` `{queues/agents/labels:{id,name}}`. `pages/operation/history.tsx:341` chama `catalogos.etiquetas.map` → crash. Linha também diverge (`encerradaEm/etiquetas` vs. `closedAt/labels`).
11. **Analytics › Active Messages** — `pages/flow/analytics/active-messages/page.tsx:33-41,87` espera `{period,...,data}`; API (`controllers/management-analytics.ts:70-78,158`) envia `{periodo,intervalo,hoje,limite,template,dados}`. `data.templates` num `undefined` → crash.

---

## 3. Feature quebrada por inteiro (sem crash, mas totalmente não funcional)

- **Growth › Active Messages — seletor de template nunca funciona (não é possível disparar campanha nenhuma)**: `pages/flow/growth/active-messages/active-messages.tsx:2` importa `DataOfGrowth` do pacote `@pipe/contracts` (`packages/contracts/src/management-flow.ts:132-168`, ainda 100% em português: `estado`, `TemplateGrowth{nome,categoria,corpo,canalNome}`, `ContactGrowth{nome,telefone}`, `channels[].nome`). Só que o controller real (`apps/api/src/controllers/management-flow.ts:68,391-398`) **não usa esse tipo do contracts** — usa `../domain/management-flow.js` (`apps/api/src/domain/management-flow.ts:252-287`), já em inglês (`state`, `{name,category,body,channelName}`, `{name,phone}`, `channels[].name`). Como os dois tipos têm o mesmo nome (`DataOfGrowth`), passam despercebidos por qualquer checagem que só confia em "vem do @pipe/contracts, então está OK". Efeito: `template.categoria === categoria` (`tela.tsx:48`) é **sempre falso** → filtro de categoria nunca retorna templates → tela nunca permite escolher um template e disparar campanha. Também nomes de canal/template/contato e preview de corpo em branco; status do histórico de disparo sempre mostra "pendente".
  - **Mesmo root cause em `/flow/:id/contents`**: `pages/flow/contents/conteudos.tsx:2` importa `TemplateListed` do `@pipe/contracts` (português) enquanto o controller usa a versão do domínio (inglês) — nome/categoria de template em branco em toda a tabela.
  - **Isto é uma classe própria e merece atenção**: a heurística "se o tipo vem de `@pipe/contracts`, está seguro" usada pelos outros agentes falha aqui porque existem dois tipos com o mesmo nome em arquivos diferentes, e só um deles é o que o controller de fato usa.

- **Regras de SLA — criação sempre falha, leitura sempre exibe errado**: escrita — `lib/settings-gravar.ts:9` posta `{nome,alvo,prazoSeg,alertaSeg}`; API `PedidoDeRegraSla` (`regras-sla.ts:23`) espera `{name,target,deadlineSeg,alertSeg}` → toda criação lança `name_required`, edições descartam esses campos silenciosamente. Leitura — `lib/settings.ts:15-33` `{nome,alvo,prazoSeg,alertaSeg,active}` vs. real `{name,target,deadlineSeg,alertSeg,ativa}` (`settings.ts:73-114`, note que `active`↔`ativa` está invertido) → `regras-sla.tsx:36,44-107` mostra nomes de regra/fila em branco, texto "undefined: prazo …", toggle sempre força "ativo".

- **Comunicação › Respostas Prontas**: `lib/communication.ts:59-66` `{atalho,titulo,corpo,categoria,active}` vs. real `{shortcut,title,body,category,ativa}` (`communication.ts:72-79`, `active`↔`ativa` invertido). Toda linha mostra atalho/título/corpo/categoria em branco, status sempre "Desativada", toggle liga/desliga sempre o valor errado.

- **Comunicação › Modelos de mensagem**: `lib/communication.ts:68-84` `{corpo,nome,categoria,cabecalhoTipo}` vs. real `{body,name,category,headerType}` (`communication.ts:100-111,160-163`). Colunas em branco e **a ação de excluir por nome envia `undefined` como identificador** (risco de excluir o modelo errado).

- **WhatsApp — preferência de re-categorização de alerta**: leitura e escrita são no-op nos dois sentidos. `lib/channels.ts:47-57` usa `ativo`; real `apps/api/src/domain/whatsapp/preferences.ts:16-20,56-71` usa `active`. Toggle sempre aparece desligado; salvar nunca persiste.

- **WhatsApp Business Profile ("Sobre" e categoria)**: `lib/channels.ts:22-45` `sobre/categoria` vs. real `apps/api/src/domain/whatsapp/perfil.ts:26-52` `about/category`. Texto "Sobre" nunca aparece; seletor de categoria nunca reflete o valor salvo nem grava mudança real no Meta.

- **Cadastro de webhook — chip de autenticação**: `gravar.ts:13-18` `AuthenticationVisible.tipo` vs. real `.type` (`apps/api/src/domain/management/integrations.ts:321-326`). Chip sempre mostra "Sem autenticação" mesmo com Basic/OAuth2 configurado.

---

## 4. Dados em branco/errados (moderado, sem crash nem bloqueio total de funcionalidade)

- **Barra de contexto do bot/roteador** (quase toda página `/flow/:id/**` e `/router/:id/**`): front espera inglês (`state,imageUrl,description,channelId,channelName,channelType,channelActive,channelNumber` — `barra-of-contact.tsx:21-36`), mas `apps/api/src/domain/management-flow.ts:31-53 loadContact()` ainda retorna majoritariamente português (`estado,imagemUrl,descricao,canalId,canalNome,canalTipo,canalAtivo,canalNumero`). Foto do bot nunca aparece, badge de status sempre "Rascunho", badge de canal quebrado; campo de descrição (`settings/basic/basicas.tsx:18`) sempre carrega vazio — **salvar sem preencher de novo apaga a descrição real no servidor**.
- **Saúde do canal WhatsApp**: `lib/channels.ts:5-20` `{nome,ativo,numero}` vs. real `apps/api/src/domain/channels.ts:15-33` `{name,active,number}` — número real do Meta é ignorado, cai sempre no número desatualizado do fluxo (`perfil.tsx:281`, `visao-geral.tsx:37-38`).
- **Deployment / checklist de onboarding**: `lib/deployment.ts:12-18` `{nome,ativo,numero}` vs. real `{name,active,number}` (`deployment.ts:18-24`) → todo canal WhatsApp aparece falsamente como "precisa reconectar", nome em branco, "Sem número" mesmo quando existe.
- **Configurações Gerais (tenant)**: `lib/settings.ts:104-135` `TenantIdentity{nome,plano}`, `PesquisaConfigurada.tipo`, `ClosureTag.nome` vs. real `{name,plan}`, `.type`, `.name` (`settings.ts:236-267`) → nome da empresa, rodapé de plano, tipo de pesquisa e toda etiqueta de encerramento em branco; **salvar o nome sem preencher pode sobrescrever com vazio**.
- **Dados/Tags configuradas**: `lib/settings.ts:56-62` `EtiquetaConfigurada.nome` vs. real `.name` (`settings.ts:124-130`) → nomes de etiqueta em branco em `settings-data.tsx:59`.
- **Certificados e papéis do Contract**: `ContractSummary.nome` vs. real `.name`; `CertificadoMtls{expiraEm,emissor,sujeito}` vs. `{expiresAt,issuer,subject}` → coluna de validade sempre "Invalid Date"; `AccountRole.nome` vs. real `.name` → **dropdown de atribuição de papel em Convite/Membros fica permanentemente vazio**.
- **Prioridade de regras de fila**: `lib/rules-priority.ts:7-15` `{nome,nivel,active}` vs. real `{name,level,ativa}` (`rules-priority.ts:152-166`) → nomes/níveis em branco em `agents-queues-edit.tsx`.
- **Agentes (lista/edição)**: `lib/registrations.ts:167-180` `AgentRegistered{nome,ativo}` vs. real `{name,active}` (`registrations.ts:1070-1083`) → nomes em branco, busca compara com a string literal "undefined".
- **Dropdown de horário no editar-fila**: `agents-queues-edit.tsx:78,165` usa tipo inline `{id,nome}`; campo real é `.name` (mesmo bug do item 2.3) → toda opção do `<select>` de horário aparece em branco.
- **Growth › Log**: `log.tsx:32-40` `LinhaDoLog{tipo,conteudo}` vs. real `{type,content}` (`management-analytics.ts:371-380`) → coluna Tipo e corpo da mensagem sempre em branco.
- **Dashboard › painel de contatos**: `resposta.ts:9` `.tipo` vs. real `.type` (`management-analytics.ts:62-68`) → painel sempre renderiza a variante errada ("rejeição") com a matemática errada, independente do que o usuário clicou.
- **Tracked Links** (tabela): `data.ts:9-18` `.nome/.codigo` vs. real `.name/.code` (`rastreador-de-cliques.ts:26-35`) → nome do link e botão de copiar em branco.
- **API Keys do fluxo**: `gravar.ts:8-17` `.nome` vs. real `KeyOfFlow.name` (`integrations.ts:64-73`) → nomes em branco na lista e na confirmação de exclusão (`scopes`/`revogadaEm` também divergem, mas ainda não lidos — latente).
- **Publicação do fluxo (guarda de versão)**: `apps/api/src/domain/management/builder-of-flow.ts:501` — generic `{version}` vs. SQL `as versao` (sem aspas) → `Math.max(rascunho.versao, undefined+1)` perde a proteção contra pular a versão mais alta arquivada. Só importa depois de um restore-então-republicar.
- **SSO — callback de teste "matches user"**: `apps/api/src/controllers/sso.ts:223` — generic `{name}` vs. SQL `select nome` → sempre reporta "sem correspondência".
- **Desk › métricas de agente**: `apps/api/src/domain/desk/metrics.ts:27` — `firstResponse`/`waitQueue` vs. SQL `as primeira_resposta`/`as espera_fila` (sem aspas) → sempre `null`.
- **Cadastro/lista de filas (backend)**: `apps/api/src/controllers/catalogo.ts:287` — `capacityDefault`/`inAttendance` vs. SQL sem alias/`as em_atendimento` → `capacidade_padrao` undefined, `inAttendance` NaN. `catalogo.ts:393` — `state` vs. `as estado` → `GET /v1/agents` sempre retorna `state: undefined`.
- **Onboarding/deployment (backend)**: `apps/api/src/domain/management/deployment.ts:49,64,69` — `number`/`reauthorization`/`members`/`withAgent` vs. SQL `as numero`/`as reautorizacao`/`as membros`/`as com_atendente` (sem aspas) → contadores sempre 0/NaN, reautorização pendente nunca aparece.
- **Dashboard do bot (backend)**: `apps/api/src/domain/management-analytics.ts:54,134,208` — `channel`/`phone`/`name` vs. SQL `as canal`/`as telefone`/`as nome` (sem aspas) → canal, telefone e nome mais recorrente sempre `null`/`undefined`.
- **Desconectar canal Messenger**: `apps/api/src/domain/messenger/channel.ts:38` — `returning id,tenant_id,nome,ativo,numero_id,criado_em,config` sem alias, mas o tipo `Linha` espera `name,active,createdAt` → resposta sem nome e `criadoEm` vira "Invalid Date".
- **Desk › respostas prontas (escopo)**: `desk/consultas.ts:254` — `escopo` vs. contrato `scope` (nenhuma tela lê hoje — latente).

## 4.1 Desk-vite (além dos dois já reportados: `RecordOfContact` nome/telefone, `useQueues` nome)

- **Lista de contatos (coluna esquerda) + busca de contato no envio de mensagem ativa**: `apps/desk-vite/src/lib/contacts.ts:4-10` `ListContact{nome,telefone}` vs. real `ContactOfList{name,phone}` (`apps/api/src/domain/desk/consultas.ts:480-487`). Em `pages/contacts/page.tsx:106-134`, `letra(c.nome)` é sempre `'#'` → **todos os contatos colapsam num único grupo "#"**, nome exibido cai para email ou fragmento de ID. Em `pages/active-message/page.tsx:194,244,280,314,315` não há fallback nenhum → nome/telefone aparecem **completamente em branco** na etapa de escolher contato e nos chips de contatos selecionados.
- **Nome do canal em branco no envio de mensagem ativa**: interface local `Channel{nome,tipo}` em `active-message/page.tsx:18-23` vs. real `{name,type}` (`consultas.ts:562-573`) → `channel?.nome` em branco no resumo de aprovação de template e na revisão final.

---

## 5. CSS/JSX — um root cause, três pontos de código

**A "tinta de erro" (vermelho) nunca aparece em nenhum lugar que a usa.** O CSS foi renomeado (`erro`→`error`), mas os literais TypeScript que alimentam a `className` não são texto CSS literal, então o renomeador mecânico não os tocou.

1. **Componente `Etiqueta` (tag/pill)**: CSS `packages/ui/src/estilos/base.css:449` define `.etiqueta.error`; código `packages/ui/src/components/primitivos.tsx:76,103` — `TomDeEtiqueta` ainda inclui o literal `'erro'` e `classes.push(tom)` empurra `"erro"` → `class="etiqueta erro"`, que não casa com nada. Afeta 45+ pontos de uso: `apps/crm/src/app/contacts/[id]/page.tsx:59,193`, `leads/[id]/page.tsx:81`, `opportunities/[id]/page.tsx:107,224` ("Perdida"), `settings/api/page.tsx:89,127` (chaves revogadas, falhas de webhook), `lista-de-leads.tsx:167`, e ~25 pontos no Builder (`builder.tsx`, `builder/no.tsx:70`, `panel-actions.tsx:385`, `panel-configuration.tsx`, `test-panel.tsx`, `flow-functions-panel.tsx`) e a maioria de `pages/registrations/*`.
2. **`PillPriority` (monitoramento)**: `apps/management-vite/src/components/monitoring-detailed.tsx:94-95` reimplementa a mesma convenção com `' erro'`/`' alerta'` — usado em `monitoring-detailed.tsx:381`, na tabela de conversas ao vivo. Prioridade máxima nunca fica vermelha.
3. **Componente `Metrica`**: `apps/management-vite/src/components/metrica.tsx:26,28` — `tom === 'erro' ? 'erro' : ''`; CSS real (`estilos/global.css:1465`) só tem `.metric.error`. Usado em `pages/operation/monitoring.tsx:469,476` e `reports-attendance.tsx:338,345` — números de "Perdidos"/"Abandonados" nunca ficam vermelhos.

Fix único nas três: trocar o literal `'erro'` por `'error'` nos três arquivos de componente (ou aceitar `'erro'` na API pública e mapear para `'error'` só ao montar a classe).

**Verificado limpo** (não reportar de novo): todos os 54 `data-attr` do mapa exceto os já corrigidos; classes interativas do canvas/painel/nó do Builder; drag-and-drop do kanban e reordenação de colunas do CRM; command palette; variantes de `Botao` e variáveis `--p-error-*`. Achados sem relação com a Fase 1 (pré-existentes, fora de escopo): `bl-status--erro`, `bl-acao--aberta`, `ct-ticket--ativo`, `gr-status--pendente` (sem CSS em nenhum idioma) e `data-status` do shell do Desk esperando valores `chat`/`drawer` que nunca existiram.

---

## 6. Rotas quebradas (todas em `apps/management-vite`; desk-vite e crm ficaram limpos)

1. **Barra de abas de Analytics inteira quebrada, em todo bot/roteador**: `pages/flow/analytics/shell.tsx:34` monta `.../analise` (deveria ser `/analytics`, ver `App.tsx:179-187`). Clicar em qualquer aba (Dashboard, Overview, Journey, Reports, Active Messages, Report Manager, Data Dictionary) cai no catch-all 404.
2. **Growth › "Links rastreados"**: `pages/flow/growth/navigation.tsx:38` usa `rota: 'links-rastreados'`; rota real é `tracked-links` (`App.tsx:162`).
3. **Edição de membro de equipe inacessível** (4 pontos): `pages/flow/team/tela.tsx:215,424,429,471` navegam para `editar/${userId}` (relativo); rota real é `team/edit/:userId`, um irmão de `team`, não um filho (`App.tsx:175`).
4. **Portal › "Ver canais"** (em todo card de bot com WhatsApp): `pages/flow/cards.tsx:152` usa `/canais`; rota real é `/channels` (`App.tsx:92`). Bug pré-existente à Fase 1, nunca corrigido.
5. **Checklist de onboarding de deployment**: `lib/passos-of-deployment.ts:116,141` — `/canais` e `/atendentes/filas`, ambos caminhos absolutos sem id de contato — não resolvem nem hoje nem antes do rename (possível placeholder nunca implementado, decisão de produto pendente).
6. **Builder › atalho "Abrir gerenciamento de filas"**: `pages/builder/panel-queues.tsx:50` usa `/atendentes/filas`; rota real é `agents/queues` (`App.tsx:126`).
7. **Dashboard › link "Clique aqui" (Data Dictionary)**: `pages/flow/analytics/dashboard/tela.tsx:1147` usa `/analise/dicionario-de-dados`; rota real `data-dictionary` (`App.tsx:187`).
8. **Report Manager › link relativo para Data Dictionary**: `pages/flow/analytics/report-manager/tela.tsx:214` usa `../dicionario-de-dados`; substitui a aba atual (sem `target="_blank"`) por um 404.
9. **Relatórios de Atendimento › botão "Ir para o Gerenciador de Relatórios"**: `pages/operation/reports-attendance.tsx:165,212` usa `/analise/gerenciador-de-relatorios`; rota real `report-manager`.

Extras de baixa prioridade, fora do escopo do rename: `pages/operation/history.tsx:433` linka `/termo-de-responsabilidade` (nunca existiu como rota); `apps/crm/src/lib/search.ts:84` monta `href: '/opportunities'` sem interpolar o id (bug real, mas não é de idioma).

---

## 7. Variável de ambiente — URL pública da API errada em todo ambiente

- Código lê `PIPE_API_URL_PUBLICA` (`apps/api/src/domain/management/integrations.ts:866`, `apps/api/src/domain/rastreador-de-cliques.ts:55`).
- A convenção real, usada em 12+ outros pontos (`attachment.ts:130`, `instagram/channel.ts:50`, `messenger/channel.ts:13`, `sso.ts:54`, `whatsapp/channel.ts:28`, os `vite.config.ts` de desk-vite/management-vite, 5 testes) e documentada em `apps/crm/.env.example:14`, é `PIPE_URL_API_PUBLICA` (ordem de palavras invertida). Nenhum `.env.example`/infra define `PIPE_API_URL_PUBLICA`.
- Efeito em produção: painel "informações de conexão" do fluxo mostra `https://api.pipe.app/v1` (placeholder hardcoded) em vez da URL real (`api.usepipe.com.br`); todo link curto de rastreamento de clique (`/l/:codigo`) aponta para um domínio que a Pipe não controla — **rastreamento de clique quebrado silenciosamente em todo deployment**.
- Fix: renomear os dois pontos de leitura para `PIPE_URL_API_PUBLICA` e documentar a variável no `.env.example` raiz / `infra/compose/env.prod.exemplo`.

---

## 8. Cookie de sessão — funciona, mas por um shim frágil (risco, não bug ativo)

- `packages/authentication/src/session.ts:14` ainda define `NOME_DO_COOKIE = 'pipe_sessao'` (não renomeado) e o usa em `montarCookie()`.
- Todo ponto de escrita real (`apps/api/src/controllers/login.ts:219,301,317`, `my-account.ts:308`, `sso.ts:173`) passa a saída por `apps/api/src/session.ts:19 sessionCookie()`, que troca o nome para `SESSION_COOKIE_NAME = 'pipe_session'` antes de ir para o header. Leitura (`session.ts:70`) usa a mesma constante `'pipe_session'`. Hoje está tudo consistente no wire.
- Risco: se qualquer novo código chamar `cookieOfSession()`/`cookieDeSaida()` diretamente (sem passar por `sessionCookie()`), o cookie sai como `pipe_sessao` e desalinha instantaneamente de todo leitor. Os próprios testes de `packages/authentication` (`tests/session.test.ts:4,48`) testam contra `NOME_DO_COOKIE`, então continuariam passando mesmo que o nome de fato divergisse mais.
- Recomendação: renomear `NOME_DO_COOKIE` para `'pipe_session'` na origem e remover o shim `sessionCookie()` em `apps/api/src/session.ts`, que hoje é complexidade compensatória para um rename inacabado.
- O cookie `pipe_challenge` (map flag `approved`, não `applied`) foi verificado como correto nos dois lados — é só a planilha do mapa que está desatualizada.

---

## 9. Áreas verificadas e confirmadas limpas (não precisam de ação)

- **BullMQ** (filas/jobs): todo nome de fila e de job vem de constantes compartilhadas exportadas por `apps/workers/src/queues.ts`; produtor e consumidor sempre importam o mesmo símbolo. Sem drift.
- **WebSocket** (`apps/api/src/eventos-ws.ts`/`realtime.ts`, `packages/realtime`): o assunto (`Assunto`) é uma union TS tipada, produtor e handler tipados nunca podem divergir. **Porém**: nenhum dos três fronts importa `@pipe/realtime` ou abre o socket `/v1/eventos` — desk-vite e management-vite fazem polling em intervalo fixo. Isso é pré-existente (o recurso nunca foi conectado a um front, desde antes da Fase 1) e não é uma regressão do rename, mas vale uma decisão de produto (ligar o front ao WS, ou formalizar o backlog).
- **Redis**: único canal pub/sub (`pipe:eventos:${tenantId}`) escrito e lido na mesma função/arquivo. Sem outro uso de cache/lock key no repo.
- **postMessage**: único uso real é o popup de WhatsApp Embedded Signup da Meta — literais do protocolo da Meta, já em inglês, fora do escopo do rename.
- **CustomEvent DOM**: único evento (`pipe:ticket-finalizado`) definido como constante única em `packages/ui`, disparado e escutado só através de funções compartilhadas.
- **Cookies, localStorage/sessionStorage, headers HTTP**: nenhum mismatch encontrado. Toda chave de localStorage é derivada de uma função/constante única compartilhada entre leitor e escritor. CORS allowlist de headers (`authorization`, `content-type`) é compatível com tudo que os fronts enviam; headers de assinatura de webhook saem de uma única fonte de verdade.
- **jsonb/persisted**: sweep de ~60 identificadores de `std/persisted.csv` (jsonb do builder, árvores de score/condição, cursor HTTP, headers de webhook, espelho de dicionário CRM, atributos de contato, snapshots de auditoria, escopos de API key, códigos de erro, nomes de partição, chaves de localStorage, nomes de evento realtime, enums) — todos consistentes com o valor persistido antigo.
- **Rotas de desk-vite e crm**: toda tabela de rotas e todo `Link`/`navigate`/`redirect` interno confere, incluindo rotas de convite/OAuth construídas pela API (`apps/api/src/domain/convites.ts:56-58`) e pelo CRM (`apps/crm/src/lib/settings-data.ts`).

---

## Recomendação de padrão de correção

- **Tipos duplicados no front**: eliminar toda interface local em `lib/*.ts`/inline que descreva uma resposta de API; importar de `@pipe/contracts` **ou** do tipo exportado pelo módulo de domínio real que o controller usa (cuidado com nomes duplicados entre `@pipe/contracts` e `domain/*` — ver seção 3, `DataOfGrowth`/`TemplateListed`). Um script de CI que compara o tipo de retorno declarado do controller (`Promise<T>`) contra os tipos importados pelo front fecharia essa classe inteira.
- **Alias de SQL bruto**: exigir aspas duplas em todo alias que precise casar com uma chave camelCase do generic (`as "campo"`); um linter/script que faça o parse de `execute<{...}>(sql\`...\`)` e confira cada chave contra a lista de aliases do SELECT cobriria a classe inteira em CI.

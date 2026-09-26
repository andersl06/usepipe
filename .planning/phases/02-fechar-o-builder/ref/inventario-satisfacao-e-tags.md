# Inventário: Pesquisa de Satisfação e Tags (BUILDER-03)

**Data da investigação:** 2026-09-26
**Objetivo:** D-08.1..5, D-09, D-10 (pesquisa de satisfação nativa) e D-11, D-12, D-13 (os dois sistemas de tag) — evidência de ponta a ponta antes de qualquer decisão de schema ou ramificação, conforme D-01/D-08.
**Fontes primárias novas desta sessão:** bundle Angular do Builder (`referencias-blip/builder/builder/zip19/supernova.blip.ai/portal.js`, grep de código-fonte minificado, não capturas de tela) e evidência de API já registrada em `referencias-blip/pesquisa/blip-api-schemas.md`/`blip-schema-real.md`. Onde a fonte é DOM/bundle, marco `[BUNDLE]`; onde é documentação pública, `[HELP]`; onde é código do Pipe hoje, `[PIPE]`; onde é inferência não confirmada, `[INFER]`.

---

## 1. Builder (D-08.1)

### Modelo e ativação
A pesquisa nativa exige a versão 3.0 do bloco de Atendimento Humano (BAH 3.0) `[HELP]` (`blip-gestao-funcoes.md:330-335`). No bundle, o recurso é controlado por dois feature flags distintos e independentes `[BUNDLE]` (`portal.js:85786-85789`):
- `builder-desk-survey` (`BuilderDeskGoToSurveyEnabled`) — liga a ida para pesquisa a partir do atendimento;
- `builder-prepared-block-desk-survey` (`isBuilderPreparedBlockDeskSurveyEnabled`) — liga o **bloco pronto** "Pesquisa de Satisfação de Atendimento" (`attendanceSatisfactionSurvey`) na lista de blocos prontos que o Builder oferece (`portal.js:255255-255270`), ao lado de outros modelos de pesquisa: `shortNPSSurvey`, `longNPSSurvey`, `CSATSurvey` — ou seja, a Blip real tem **quatro** blocos de pesquisa prontos, não só o nativo 1-5; o NPS artesanal (D-06, não replicado) é um destes blocos prontos, montado à mão pelo gestor a partir do template, não um recurso ativado à parte.

### Como o bloco nasce e é ligado
"Exibir apenas blocos de pesquisa de satisfação" **é um filtro do seletor de destino**, não uma ramificação especial (confirma a pergunta em aberto do D-08) `[BUNDLE]`. É a mesma tela de configuração de saída/target usada em **qualquer** condição de saída de **qualquer** bloco (`builder-tabs-outputs`, template em `portal.js:43737`), com um `<bds-switch>` extra rotulado `builder-tabs-outputs.target.filterSurvey`. Quando o interruptor está ligado (`isSwitchSurveyChecked`):
- `updateStateDataOptions()` filtra a lista de destinos possíveis para só os blocos cujo id comece com o prefixo `survey:` (`filterSurveyState`/`isSurveyState`, `portal.js:262528-262633`);
- o botão "+ Adicionar" troca de rótulo, de `builder-tabs-outputs.addNewState` para `builder-tabs-outputs.addNewSurvey` (`updateAddNewButton`, `portal.js:262620`);
- clicar em "+ Adicionar" nesse modo chama `addNewSurvey(e)` em vez de `addNewState(e)` (`portal.js:262533-262551`): cria um **novo bloco a partir do template de pesquisa** (evento rastreado como `trackSatisfactionSurveyCreatedFromTemplate`, `portal.js:252943`), com id prefixado `survey:`, e devolve esse novo bloco já como destino da saída que estava sendo editada.

Ou seja: o mecanismo é genérico (o mesmo componente de "para onde essa saída vai" usado em todo bloco), só ganha um filtro/atalho de criação quando a pesquisa está envolvida — **não existe uma lógica de ramificação separada embutida no bloco de Atendimento Humano para a pesquisa**; a ligação é uma condição de saída como outra qualquer, apontando para um bloco `survey:`.

### Os três encerramentos (`ClosedAttendant`, `ClosedClient`, `ClosedClientInactivity`)
No motor de saída do Builder, cada um dos três é uma condição de saída independente (mesmo mecanismo de `$conditionOutputs`/`conditions` de qualquer bloco) e, portanto, **cada um tem destino configurável individualmente** — inclusive o destino "ir para pesquisa" descrito acima é por-condição, não por-bloco. O espelho exato dessa estrutura já existe implementado no Pipe (`novoBlocoDeAtendimento`, `apps/gestao-vite/src/paginas/builder/modelo.ts:283-319`) `[PIPE]`:
```typescript
export const SAIDAS_DE_ATENDIMENTO = [
  { status: 'ClosedAttendant', rotulo: 'ticket finalizado pelo atendente' },
  { status: 'ClosedClient', rotulo: 'ticket finalizado pelo cliente' },
  { status: 'ClosedClientInactivity', rotulo: 'ticket finalizado por inatividade do cliente' },
] as const;
```
cada saída nasce com sua própria condição `input.content@status equals <status>` e destino vazio — três condições de saída distintas, uma por status, exatamente o padrão do Builder de referência.

**Achado relevante para D-12/D-13 (não é o mesmo assunto de pesquisa, mas usa o mesmo `status`):** a documentação pública da API de Tickets `[HELP]` (`blip-api-schemas.md:339-358`) lista o `TicketStatusEnum` oficial com **sete** valores (`None`, `Waiting`, `Open`, `Assigned`, `ClosedAttendant`, `ClosedClient`, `Transferred`) — **`ClosedClientInactivity` não está nessa lista**. A fonte oficial registra a suspeita explicitamente: ou é um valor gerado só em outra camada (relatório/portal), ou é um sinônimo de `ClosedClient` por timeout, nunca confirmado ao vivo. O Pipe já trata isso como um valor próprio, mapeado no motor por quem encerrou a conversa (`STATUS_DO_TICKET`, `apps/api/src/dominio/fluxo.ts:208-213`: `atendente→ClosedAttendant`, `cliente→ClosedClient`, `inatividade→ClosedClientInactivity`, `transferencia→Transferred`) `[PIPE]`. Ver Capturas pendentes #6.

### Estrutura serializada do bloco nativo
Confirmado em código real do bundle (fábrica de conteúdo padrão do editor, `portal.js:252122-252130`) `[BUNDLE]`:
```javascript
case iu.SurveyType:
  return {
    id: (0, M.A)(),
    type: "application/vnd.lime.satisfaction-survey+json",
    content: { type: "", scale: "", question: "", score: "" }
  };
```
O MIME `application/vnd.lime.satisfaction-survey+json` também aparece em pontos de renderização de mensagem do Desk (`atendimento/desk/.../vendor.*.js:34061`, `analytics-dashboard/.../main.js:27096`) — confirma que a resposta da pesquisa circula com esse mesmo tipo de documento no chat, não só na configuração do bloco. Os blocos de pesquisa/atendimento/menu/subfluxo têm prefixo de id próprio (`portal.js:250664-250667`): `desk:` (atendimento), `survey:` (pesquisa), `answers:` (bloco de resposta/menu), `subflow:` (subfluxo) — o Pipe já segue o mesmo padrão para atendimento (`PREFIXO_DO_ATENDIMENTO`, `desk:`) e deveria adotar `survey:` para o novo tipo de bloco, por consistência de import/export (D-16, mesmo formato).

### Nota, comentário e ramificação por resposta
O `content` do bloco de pesquisa (`type`, `scale`, `question`, `score`) descreve a **pergunta enviada**, não a resposta recebida — o valor de `score` aqui é vazio (`""`) no template, ou seja, é preenchido/validado a partir da resposta do cliente, análogo a uma "Entrada do usuário" com validação de tipo. Não foi possível, nesta sessão, abrir ao vivo a aba "Condições de saída" de um bloco `survey:` real para confirmar o **nome exato da variável de contexto** que carrega a nota e o comentário (ex.: um equivalente a `input.content@score`/`input.content@comment`) nem se existe alguma condição pré-configurada por classificação. **Isto é evidência de bundle/DOM, não uma captura funcional do Builder rodando** — ver Capturas pendentes #1.

**Sobre a ramificação observada no fluxo real (D-09 — atenção, não inferir do relatório):** `blip-portal-telas.md:58-66` registra que o fluxo real do AUVP Capital tem "vários blocos 'Pesquisa de Satisfação' com ramificação por Promotores/Neutros/Detratores". Como o mecanismo de saída de qualquer bloco (inclusive `survey:`) é o `$conditionOutputs`/`conditions` genérico configurado pelo autor do fluxo (seção acima), a leitura mais provável é que **"Promotores/Neutros/Detratores" são rótulos de condição de saída que o próprio dono do fluxo AUVP Capital configurou manualmente** sobre o valor de resposta — não uma ramificação nativa de três vias embutida no bloco pronto. Isso é consistente com D-09 (não copiar a categorização 1-2/3/4-5 do relatório como se fosse a ramificação do bloco) e com a ausência de qualquer `case`/enum de "categoria de satisfação" no template de conteúdo do bloco de pesquisa citado acima. Tratar como não confirmado que existe ramificação nativa automática; a base seguinte (persistência, D-08.5) assume ramificação por condição genérica configurável, não uma categoria fixa.

### Timeout e destino após timeout
Não encontrado nos bundles lidos nesta sessão (nenhuma referência a timeout específico do bloco `survey:`, distinto do timeout genérico de "Entrada do usuário" que todo bloco com `input.expiration` já tem no formato do Builder). Ver Capturas pendentes #3.

---

## 2. Atendimento (D-08.2)

A resposta da pesquisa fica associada ao ticket/atendimento pelo mesmo mecanismo de qualquer variável de contexto do fluxo — o bloco de pesquisa roda **depois** do bloco de Atendimento Humano ter fechado o ticket (é um destino de saída do `desk:`, seção 1), então a resposta nasce já sem um "ticket aberto" formal associado no Desk: ela é um evento de conversa do bot, correlacionável ao ticket anterior só pela ordem/tempo dentro do mesmo fluxo, não por um vínculo de banco de dados nativo da Blip `[INFER]` — a documentação pública não descreve uma tabela de "respostas de pesquisa" ligada por `ticketId`; o único endpoint de agregação encontrado (seção 4) devolve contagens, não linhas correlacionadas a ticket.

Os quatro estados possíveis de uma pesquisa, pela combinação de comportamento documentado (`blip-gestao-funcoes.md:337-339`, contagens do relatório) e da estrutura do bloco (uma "Entrada do usuário" com validação, como qualquer outro bloco):
- **Resposta completa** — nota + comentário (a métrica "total de respostas / completa" já existe no relatório, seção 3);
- **Só nota** — resposta parcial, sem comentário (métrica "parcial" já existe no relatório);
- **Sem resposta** — o ticket fechou e contabiliza no "total de tickets fechados", mas não gerou entrada de resposta (o relatório tem fatia "sem resposta" no gráfico de pizza);
- **Abandono** — o cliente inicia a resposta (a conversa chega no bloco `survey:`) mas não conclui; do ponto de vista do fluxo isso é indistinguível de "sem resposta" sem uma marca própria de "entrou mas não terminou" — não encontrada evidência de um evento específico de abandono distinto de timeout/sem-resposta nesta sessão.

Associação a fila e atendente: como o bloco de pesquisa é alcançado só depois do encerramento do atendimento, os únicos dados de fila/atendente disponíveis para a pesquisa são os mesmos que `input.content` já expõe do ticket que acabou de fechar (seção 7) — não existe um segundo mecanismo de associação fila/atendente específico da pesquisa.

---

## 3. Relatórios/Analytics (D-08.3)

Fase futura (Analytics) — só documentar a estrutura da referência para o schema do Pipe conseguir alimentá-la depois, não construir a tela agora.

Fonte: `blip-gestao-funcoes.md:325-354` (`[HELP]`, Help Center: Satisfaction Analysis).

**Métricas:**
- Média geral de satisfação
- Total de tickets fechados (perdidos + abandonados + finalizados)
- Total de respostas, com dois subtipos: **parcial** (só nota) e **completa** (nota + comentário)
- Taxa de resposta = respostas / tickets fechados

**Visualizações:**
- Gráfico de pizza: insatisfeito / neutro / satisfeito / sem resposta
- Comparação entre filas ou entre atendentes (gráfico de barras)
- Série temporal de média geral e taxa de resposta

**Tabelas segmentadas:**
- **Geral** — uma linha por resposta individual (campos: ID do ticket, data, fila, atendente, ID do cliente, nota, avaliação/categoria, comentário — confirmado no `<context>` do plano e coerente com o padrão de "Geral" das demais tabelas do módulo)
- **Filas** — média, total de tickets, total de respostas, sem resposta, contagem insatisfeitos/neutros/satisfeitos por fila
- **Atendentes** — mesmas colunas por atendente

**Filtros:** busca livre, categoria (detrator/neutro/promotor), fila, atendente, contato, período (até 90 dias), com suporte a filtros salvos.

**Classificação usada só no relatório** (não confundir com ramificação do bloco, D-09): nota 1-2 = insatisfeito/detrator, 3 = neutro, 4-5 = satisfeito/promotor. Essa é uma classificação de **apresentação do relatório**, calculada em cima da nota bruta armazenada — o schema do Pipe (seção 5) deve guardar a nota bruta e calcular a categoria na consulta/relatório, nunca gravar só a categoria.

Busca de comentários e exportação: não encontrada documentação pública específica de um botão de exportação desta tela em particular (diferente do Histórico de Atendimentos, que documenta exportação de transcrição); tratar como não confirmado — ver Capturas pendentes #2.

---

## 4. API (D-08.4)

**Endpoint confirmado ao vivo** `[HELP + evidência ao vivo, `blip-schema-real.md:300-319,403-405,436-437`]`:
```
GET /attendance-survey-answer/summary
  to: postmaster@desk.msging.net
  $filter=surveyDate gt '<data>'   (testado)
  $skip=0&$take=50                 (paginação testada)
```
Resposta real observada:
```json
{ "closedTicketsCount": 0, "answersCount": 0 }
```
Só dois números agregados — **não** uma lista de respostas individuais. Isso **contradiz** uma documentação interna anterior (`api-blip.md`, citada em `blip-schema-real.md:300-319`) que descrevia este mesmo endpoint como devolvendo uma lista com `agentEmail` por resposta. A fonte registra explicitamente que não foi possível decidir entre "existe uma variação de URI para a lista detalhada, não testada" e "a documentação interna estava errada/desatualizada", por falta de uma pesquisa real recente no tenant sondado.

**Conclusão para o Pipe:** o único contrato de API confirmado por evidência ao vivo é o de **contagem agregada com filtro de data e paginação**; a tabela detalhada do relatório (ID do ticket, atendente, nota, comentário — seção 3) **não tem endpoint público confirmado**. O contrato do Pipe (seção 5) não deve copiar às cegas um endpoint de "lista de respostas" da Blip — deve desenhar o próprio, já que a origem não tem um confirmado. Ver Capturas pendentes #4.

Identificadores e formato de erro: qualquer endpoint de pesquisa que a Blip exponha segue o mesmo envelope de erro do restante da API de Ticket (`status`/`reason.code`/`reason.description`, HTTP sempre 200, `blip-schema-real.md:364-388`) — não é um padrão específico de pesquisa, é o padrão geral do protocolo Lime/msging usado em toda a API da Blip.

---

## 5. Proposta de persistência (D-08.5)

Só agora, depois de 1-4, a proposta de schema do Pipe — capaz de reproduzir o comportamento e as consultas documentadas acima, sem copiar as limitações que são limitação, não recurso (D-10).

Ramificação: por condições de saída genéricas (`$conditionOutputs`/`conditions`) configuradas pelo autor do fluxo sobre o valor de resposta do bloco de pesquisa — não existe uma categoria fixa embutida no bloco nativo (fonte: seção 1, `portal.js:252122-252130` — o `content` do bloco só carrega `type`/`scale`/`question`/`score`, sem enum de categoria; e `blip-portal-telas.md:58-66`, onde os rótulos "Promotores/Neutros/Detratores" do fluxo AUVP Capital são interpretados como condições configuradas pelo autor sobre o mesmo mecanismo genérico de saída, não uma ramificação nativa — D-09).

**Tabela `pesquisa_satisfacao_resposta`** (analog estrutural: `etiqueta`/`conversa_etiqueta`, `packages/db/src/schema/conversas.ts:486-520` — `pgTable` por tenant com `carimbos()`/`refTenant()`):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid (pk) | |
| `tenant_id` | uuid | `refTenant()`, RLS `tenant_isolado` |
| `conversa_id` | uuid → `conversa.id` | a conversa do bot onde a pesquisa rodou (`ON DELETE RESTRICT`, mesma regra de não apagar histórico que `execucao_fluxo`) |
| `conversa_atendimento_id` | uuid → `conversa.id`, nullable | o atendimento humano que a pesquisa está avaliando (o `ultimoAtendimento` da seção 8) |
| `fluxo_bloco_id` | text | id do bloco `survey:` de origem, para permitir filtrar/agrupar por fluxo/bloco (a Blip não expõe isso na análise, mas o Pipe pode) |
| `fila_id` | uuid → `fila.id`, nullable | copiado do atendimento avaliado, para a tabela "Filas" da seção 3 |
| `atendente_id` | uuid → `usuario.id`, nullable | idem, para a tabela "Atendentes" |
| `contato_id` | uuid → `contato.id` | |
| `nota` | integer, nullable | nota bruta 1-5 (D-06); nunca gravar só a categoria (seção 3) |
| `comentario` | text, nullable | |
| `estado` | text, check | `completa` \| `so_nota` \| `sem_resposta` \| `abandono` (seção 2) |
| `criada_em` | timestamptz | quando o bloco de pesquisa foi alcançado |
| `respondida_em` | timestamptz, nullable | quando a resposta chegou (nulo se `sem_resposta`/`abandono`) |

Sem coluna de expiração/retenção e sem coluna de idioma — ao contrário da referência, os dados não têm prazo de validade automático nem ficam restritos a um idioma (D-10); a política de retenção, se existir algum dia, é geral do produto (backup/expurgo), não uma regra própria desta tabela.

Índices: `(tenant_id, fila_id, criada_em)` e `(tenant_id, atendente_id, criada_em)` para as tabelas segmentadas da seção 3; `(tenant_id, criada_em)` para a série temporal.

**PII (T-2-10):** `comentario` (texto livre do cliente) e `contato_id` (identifica a pessoa) são as colunas sensíveis desta tabela — `nota`, `fila_id`, `atendente_id`, `estado` e as datas não identificam a pessoa sozinhas. A tabela nasce com `tenant_id` e RLS `tenant_isolado` (mesmo padrão de `etiqueta`/`conversa_etiqueta`); a implementação (02-11) aplica essa RLS antes de expor qualquer consulta.

**Endpoint de consulta do Pipe:** `GET /v1/gestao/pesquisas-satisfacao` (padrão REST já usado pelo resto da API, `comTenant`) com filtros equivalentes aos da seção 3 (fila, atendente, contato, período, nota) e paginação — sem se prender ao contrato específico não confirmado da Blip (seção 4); a categoria (insatisfeito/neutro/satisfeito) é calculada na consulta a partir de `nota`, nunca armazenada.

---

## 6. $tags do bloco (D-11a, D-13)

Estes são os rótulos livres por bloco (`bloco.$tags`), sistema **diferente** das etiquetas de encerramento de ticket (seção 7) — confirma D-11.

**Mecanismo real da referência (`portal.js:270398-270410`, `[BUNDLE]`):**
```javascript
.service("TagsService", class {
  constructor() { this.tags = [] }
  add(e) { this.tags.some(t => t.label == e.label) || (this.tags = this.tags.concat(e)) }
  changeBackground(e) {
    this.tags = this.tags.map(t => t.id === e.props.id ? { ...t, background: e.props.background } : t)
  }
})
```
`TagsService.tags` **nasce vazio e cresce dinamicamente**: cada tag criada em qualquer bloco do fluxo entra nessa lista compartilhada (`options="$ctrl.TagsService.tags"`, componente `<blip-tags>`, `portal.js:17357`). Ou seja, **a "sugestão automática de rótulo" não é uma lista fixa pré-definida pela Blip** — é o autocomplete das tags já usadas em qualquer outro bloco do mesmo fluxo (mesmo princípio de "sugestão pelo que já existe no desenho" que o Pipe já usa para variáveis do usuário, `variaveisDoUsuario`). A cor é escolhida por um seletor livre (`can-change-background="true"`) e fica gravada por tag (`changeBackground`, casada pelo `id` da tag, não pelo rótulo) — **não há evidência, nesta sessão, de uma paleta fixa e enumerada de cores no bundle Angular** (o widget de escolha de cor em si é provavelmente um componente Web Component `bds-*` renderizado fora do JS lido, sem swatches em texto). Ver Capturas pendentes #5.

**O que o Pipe já faz (`etiquetas-do-bloco.ts:9-21`, `painel.tsx:147`) `[PIPE]`:** paleta fixa de 6 cores (`#4a5d23`, `#ff961e`, `#61d36f`, `#ee82ee`, `#000000`, `#ff4c4c`) e uma regra manual de troca azul→verde (`['#3f7de8', '#0096fa', '#1e6bf1', '#498bff']` → `#4a5d23`, aplicada tanto na leitura de tags de bloco importado quanto na cor de ação por tipo, ex. `ExecuteScript` = laranja). Isso já cumpre a "sugestão pelo que existe no fluxo" só parcialmente — hoje o Pipe sugere rótulo por digitação livre, sem autocomplete das tags já usadas em outros blocos do mesmo fluxo (gap real a fechar na implementação, fora do escopo desta investigação).

azul → token --p-builder-marca-tag (D-13/D-32): qualquer um dos hex azuis hoje hardcoded em `etiquetas-do-bloco.ts`/`painel.tsx` deve virar esse token semântico em vez do literal `#4a5d23`, seguindo o mesmo mecanismo que o resto do Builder usa para papéis visuais (D-32) — a lista de hex azuis observados na tela do Pipe hoje (`#3f7de8`, `#0096fa`, `#1e6bf1`, `#498bff`) é a candidata a virar chave de detecção "isto é azul de marca", já que o bundle da Blip em si não expõe uma paleta fixa para comparar 1:1.

---

## 7. Etiquetas de encerramento no fluxo (D-11b, D-12)

Sistema real de tag: `Ticket.tags` — confirmado como **`string[]`** no schema oficial `[HELP]` (`blip-api-schemas.md:328`: `tags | string[] | tags | ✅ 3/100`), isto é, um array de **nomes** de tag, não de objetos com cor/id. Isso responde diretamente o formato de `input.content@tags`: é a mesma lista de strings do campo `tags` do documento `Ticket` que fecha o atendimento.

**Dados salvos ao final do atendimento humano** `[HELP]` (`blip-desk-funcoes.md:88-91`): ID do ticket, número sequencial exibido na tela (`sequentialId`), identidade do cliente, e-mail do atendente responsável, status, datas de abertura/fechamento, fila e tags marcadas — tudo acessível no bloco seguinte via `input.content` (ex.: `{{input.content@sequentialId}}`); por extensão do mesmo mecanismo, `input.content@tags` traz o array de nomes de tag do ticket que acabou de fechar.

**Diferença por tipo de encerramento (D-12):**
- **Fechado pelo atendente (`ClosedAttendant`) e por inatividade (`ClosedClientInactivity`)** — disponibilizam os dados do ticket, incluindo `tags`, em `input.content` (confirmado pela nota acima e pelo próprio mecanismo dos comandos de Ticket: `POST /tickets/{id}/close` já aceita `tags` no corpo — `blip-api-schemas.md:385-387` — então o encerramento "oficial" pelo atendente sempre tem chance de ter tags no momento do fechamento).
- **Fechado pelo cliente (`ClosedClient`)** — segundo a documentação do BAH 3.0 citada no `<context>` do plano, não gera o mesmo `input.content` com o ticket. Isso é coerente com o catálogo de comandos: fechar como cliente é só `PUT /tickets/change-status` com `status: "ClosedClient"` (`blip-api-schemas.md:381-383`), **sem** o payload de `tags`/`closedBy` que o comando de fechamento "oficial" (`/tickets/{id}/close`) carrega — ou seja, o caminho de fechamento pelo cliente tecnicamente não passa pelo mesmo comando que grava as tags no momento do fechamento, o que explica a lacuna de `input.content` documentada.

**Mecanismo para recuperar os dados quando `input.content` não vem preenchido:** a doc pública confirma a existência de `GET /ticket/{ticketId}` (singular, `blip-api-schemas.md:399-402`, `to: postmaster@desk.msging.net`) como o comando de consulta direta de um ticket por id — este é o candidato mais forte para a Blip (ou um fluxo customizado) buscar os dados do ticket quando o encerramento pelo cliente não os entregou de graça via `input.content`. **Isto é inferência a partir do catálogo geral de comandos da API de Ticket, não uma captura confirmada do Builder de referência fazendo essa chamada especificamente nesse cenário** — ver Capturas pendentes #7. Não foi encontrada evidência de mudança desse comportamento em versões recentes do Builder (D-12, último pedido) nas fontes lidas nesta sessão — ver Capturas pendentes #8.

**Sem ramificação especial por etiqueta, sem UI nova (D-12):** confirmado — nenhuma evidência em nenhuma fonte lida (bundle ou documentação) de um mecanismo de "ramificar por etiqueta" diferente da condição de saída genérica já usada em todo o Builder (a mesma mecânica da seção 1). Uma etiqueta de encerramento, uma vez em `input.content@tags`, é usada como qualquer outra variável de contexto nas condições normais de saída — não precisa (e não deve) ganhar um editor próprio.

---

## 8. Mapa para o Pipe

O que `ultimoAtendimento` (`apps/api/src/dominio/fluxo.ts:944-965`) **precisa passar a incluir**, hoje devolvendo só `{ id, status, closed: true }` `[PIPE]`:

| Campo do `Ticket` a expor | Fonte no Pipe hoje | Observação |
|---|---|---|
| `sequentialId` | **não existe** | `conversa` (`packages/db/src/schema/conversas.ts:264-301`) não tem número sequencial por tenant/bot hoje — é uma coluna nova a propor num plano de implementação, não desta investigação |
| `tags` (`string[]`) | `conversa_etiqueta` → `etiqueta.nome` (`conversas.ts:486-520`) | join simples, uma linha por etiqueta marcada naquela conversa |
| `team` (fila) | `conversa.filaId` → `fila.nome` (`conversas.ts:77`, `264-275`) | |
| `agentIdentity` (atendente) | `conversa.atendenteId` → `usuario` (email) (`identidade.ts:150`) | |
| `openDate`/`closeDate` | `conversa.criadaEm`/`conversa.encerradaEm` (`conversas.ts:282-285`) | já existem |
| `closedBy` | `conversa.encerradaPor` (`conversas.ts:286`) | já existe |

A tabela `etiqueta` (`conversas.ts:486-502`) e o contrato `EncerrarConversaInput.etiqueta_ids` (`packages/contracts/src/encerramento.ts`) já resolvem CRUD e associação de etiqueta a conversa — o mapa acima só liga esse dado já existente ao `Ticket` que o motor de fluxo recebe, sem criar um segundo sistema de tag.

## Resumo

| Item | Classificação proposta | Plano alvo | Bloqueado por captura |
|---|---|---|---|
| Ramificação da pesquisa por condição de saída genérica (não fixa) | Reproduzível no Pipe | 02-12 | Não |
| Bloco `survey:` com conteúdo `type/scale/question/score` | Reproduzível no Pipe | 02-12 | Sim (#1, #2, #3) |
| Endpoint de contagem agregada de pesquisa (`closedTicketsCount`/`answersCount`) | Reproduzível no Pipe (contrato próprio) | 02-11 | Sim (#4, endpoint detalhado não confirmado na origem) |
| Schema `pesquisa_satisfacao_resposta` (nota, comentário, estado, sem TTL/idioma) | Reproduzível no Pipe | 02-11 | Não |
| `$tags` do bloco: autocomplete pelas tags já usadas no fluxo | Reproduzível no Pipe | 02-12 | Não |
| `$tags` do bloco: paleta de cor livre (sem enum fixo confirmado na origem) | Reproduzível no Pipe (paleta própria do Pipe, D-32) | 02-12 | Sim (#5) |
| `input.content@tags`/`@sequentialId` expostos ao fluxo | Reproduzível no Pipe | 02-08 | Não |
| `sequentialId` por tenant (coluna nova) | Reproduzível no Pipe | 02-08 | Não |
| Mecanismo de recuperação de dados no fechamento pelo cliente (`GET /ticket/{id}` equivalente) | Reproduzível no Pipe | 02-08 | Sim (#7, #8) |
| `ClosedClientInactivity` como valor real de status vs. convenção interna do Pipe | A confirmar (não muda a implementação, muda a documentação) | 02-08 | Sim (#6) |

## Capturas pendentes (D-03)

1. **PENDENTE-CAPTURA #1** — Abrir ao vivo (ou por Network) a aba "Condições de saída" de um bloco `survey:` real no Builder da Blip, para confirmar o nome exato da(s) variável(is) de contexto que carregam nota/comentário da resposta e se existe alguma condição pré-configurada por classificação.
2. **PENDENTE-CAPTURA #2** — Confirmar (Network/Help Center) se a tela "Análise de Satisfação" tem botão de exportação/extração de dados própria, e em que formato.
3. **PENDENTE-CAPTURA #3** — Timeout do bloco de pesquisa (se distinto do timeout genérico de "Entrada do usuário") e destino após timeout.
4. **PENDENTE-CAPTURA #4** — Network de um tenant com respostas de pesquisa reais, testando variações de `GET /attendance-survey-answer/summary` (sem `/summary`, com `$filter` por fila/atendente) para confirmar se existe endpoint de lista detalhada com `agentEmail`/nota/comentário por resposta.
5. **PENDENTE-CAPTURA #5** — DOM/CSS do color-picker do componente `<blip-tags>` no Builder (provável Web Component `bds-*`, fora do bundle Angular lido nesta sessão) para confirmar se existe uma paleta fixa e enumerada de cores, e seus valores hex exatos.
6. **PENDENTE-CAPTURA #6** — Confirmar ao vivo (Network de um fechamento por inatividade real) se a Blip emite `ClosedClientInactivity` como valor de `Ticket.status`, ou se esse valor só existe em camada de relatório/portal e o `Ticket.status` real fica `ClosedClient`.
7. **PENDENTE-CAPTURA #7** — Confirmar, capturando um fluxo publicado real que trate o encerramento pelo cliente, se a Blip usa de fato `GET /ticket/{id}` (ou outro comando) para recuperar dados do ticket quando `input.content` não vem preenchido, e o payload exato.
8. **PENDENTE-CAPTURA #8** — Comparar cronologia de changelog/Help Center da Blip para confirmar se alguma versão recente do Builder mudou o comportamento de `input.content` para `ClosedClient` (D-12 pede verificação explícita).

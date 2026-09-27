# Inventário de rotas e redirecionamentos (insumo da fase 01.1)

Levantado em 2026-09-27 no código de `limpeza`, já com a fase 1 aplicada. Três
fontes: as rotas declaradas nos fronts, os 207 endpoints que o `route-match`
extrai da API, e as capturas da Blip em `referencias-blip/` — em especial
`portal/INDICE.md`, que registra o caminho real de cada uma das 54 páginas
capturadas, e as notas em `pesquisa/`.

## 1. O padrão da Blip, medido

Dois hosts por cliente, e é exatamente o desenho da fase 01.1:

```
<cliente>.blip.ai/application/detail/<identificador-do-bot>/<módulo>
<cliente>.desk.blip.ai/<página>
```

O terceiro nível é o **identificador do bot**, nunca um id técnico. Nas
capturas: `supernovaprincipal`, `supernovaroteador`, `pipeprincipal`,
`auvpsegurosrouter`, `auvpescolaprd`. No código da Blip o valor vem de
`applicationIdentity` e de `botIdentifier`. Não existe segmento de tipo: o
mesmo caminho serve chatbot e roteador, e quem diz qual é é o nome.

### Painel do contrato, fora do bot

`/application` (lista de bots), `/application/tenant/index` (painel),
`/application/tenant/panel`, `/application/tenant/mtls`,
`/application/tenant/agent`, `/application/tenant/create`,
`/application/tenant/pipeline`, `/application/tenant/personal`,
`/application/historic`, `/application/function`, e a criação de bot em
`/application/create/name`, `/application/create/router` e
`/application/create/marketplace`.

### Módulos sob o bot

| grupo | caminhos |
|---|---|
| visão | `home` |
| construtor | `templates/builder`, `template/master` |
| canais | `channels`, `channels/whatsapp-embedded` |
| conteúdos | `contents/messagetemplate` |
| configurações | `configurations/basic`, `configurations/welcome`, `configurations/persistent`, `configurations/apikey` |
| crescimento | `growth/activemessages`, `growth/activemessages/payments`, `growth/clicktracker`, `growth/adsbuying`, `growth/messages/log` |
| integrações | `integrations` |
| pessoas | `team`, `users` |
| análise | `analytics/dashboard`, `analytics/dataExtractor`, `analytics/data` |
| atendimento | `attendance/desk/` + `monitoring`, `history`, `queue-management`, `team`, `attendance-hours`, `personalizedbreaks`, `rules`, `sla-policy`, `replies`, `message-template`, `channels`, `general-settings`, `report`, `effort`, `calls-dashboard`, `sales-dashboard`, `survey-dashboard`, `blip-copilot` |
| ticket | `attendance/history/<ticketId>` |

### Desk

`index` (atendimento), `contacts`, `analytics`, `activeMessage`,
`bulk-ticket`, `preferences`, sempre na raiz do host `desk`.

## 2. O que o Pipe tem hoje

### Desk: paridade praticamente completa

| Blip | Pipe |
|---|---|
| `index` | `/` |
| `contacts` | `/contacts` |
| `analytics` | `/analytics` |
| `activeMessage` | `/activeMessage/send` |
| `bulk-ticket` | `/bulk-ticket` |
| `preferences` | `/preferences` |

Só desvia no sufixo `/send` e no camelCase de `activeMessage`, que está fora do
padrão kebab das outras rotas.

### Gestão: mesmas telas, organização diferente

O Pipe tem `/portal`, `/contract` (com `members` e `certificates`),
`/my-account`, `/deployment`, `/create/flow/:passo?`, `/create/router/:passo?`
e, por bot, `/flow/:id/<módulo>` ou `/router/:id/<módulo>` com 54 módulos.

A diferença estrutural: a Blip agrupa toda a **configuração** do atendimento
sob `attendance/desk/*`, enquanto o Pipe espalha em `monitoring`, `history`,
`agents/*`, `rules/*`, `communication/*`, `reports/*` e `quality-review`.

### API: 207 endpoints

`/v1/management` 112, `/v1/channels` 18, `/v1/contacts` 11,
`/v1/conversations` 11, `/v1/desk` 9, `/v1/auth` 8, `/v1/convites` 4,
`/webhooks/whatsapp` 4, resto 30.

## 3. Redirecionamentos existentes

**No navegador:** `/` para `/portal`; e três índices de módulo (`growth` para
`active-messages`, `settings` para `basic`, `attendance` para `monitoring`).

**No servidor**, todos 302: fim do login para a base ou para o destino guardado
no desafio; falha de provedor para a tela de login com `?error=`; início do
OAuth e do SSO; e `/l/:codigo`, o link rastreado público.

**Na borda (Traefik, VPS):** `/v1`, `/webhooks` e `/l/` para a API, `/desk`
para o Desk com remoção de prefixo, o resto para a Gestão.

## 4. O que falta, por tipo

### 4.1 A divergência de URL que motivou o inventário

Blip: `/application/detail/<nome-do-bot>/<módulo>`.
Pipe: `/flow/<id>/<módulo>` e `/router/<id>/<módulo>`.

Dois desvios de uma vez: o tipo do bot aparece na URL e o identificador é
técnico. A coluna para a forma da Blip já existe no banco,
`flow.short_name` (`packages/db/src/schema/automation.ts:48`), e o comentário
dela diz literalmente que o valor aparece em `/application/detail/{shortName}`.
Não há índice único: a unicidade é conferida hoje só no nome.

### 4.2 Telas que a Blip tem e o Pipe não

| Blip | o que é |
|---|---|
| `attendance/desk/calls-dashboard` | painel de chamadas (voz) |
| `attendance/desk/sales-dashboard` | painel de vendas |
| `attendance/desk/blip-copilot` | copiloto de IA no atendimento |
| `attendance/desk/general-settings` | configurações gerais do atendimento |
| `channels/whatsapp-embedded` | cadastro embutido da Meta (já diferido, bloqueado por CNPJ) |
| `application/create/marketplace` | criar bot a partir de modelo de loja |
| `application/tenant/pipeline`, `tenant/agent`, `tenant/personal` | painéis do contrato |
| `application/historic`, `application/function` | histórico e funções da conta |

Nada disso é escopo da fase 01.1, que é de endereçamento. É material para uma
fase de produto, e vale registrar como ideias diferidas em vez de deixar
espalhado em captura.

### 4.3 Resíduos da fase 1

1. **Seis endpoints ficaram em português sem linha no mapa aprovado**, logo não
   foram esquecidos na aplicação: nunca foram propostos. `/v1/convites`,
   `/v1/convites/:token/aceitar`, `/v1/convites/:token/reenviar`,
   `/v1/etiquetas`, `/v1/eu` e `/v1/auth/sair`. Incoerente porque a tela já é
   `/invite/:token`, em inglês, e a API responde em `/v1/convites`.
2. **Uma tradução ruim passou:** `/v1/gestao/fluxos/:id/equipe/eu` virou
   `/v1/management/flows/:id/team/i`; em inglês é `/me`.
3. **Quatro resíduos nos fronts:** `/bem-vindo`, o módulo `alerta`, o parâmetro
   `:passo` em dois assistentes, e `/activeMessage/send` em camelCase.

Mudar endpoint é mudar contrato, então cada um precisa de linha no mapa antes
de ser aplicado, na varredura final da fase 1 (plano 01-31).

## 5. Decisões que a fase 01.1 precisa tomar antes de executar

A fase foi planejada com o host por cliente e o prefixo `/application`
(decisão D-02), mas **sem** o trecho `detail/<nome-do-bot>`. Para fechar a
paridade:

1. O caminho do bot usa `short_name`? Se sim, ele passa a ser único por
   cliente, com migração para preencher os valores de hoje e regra de colisão.
2. O tipo do bot sai da URL, como na Blip? Isso significa resolver fluxo ou
   roteador pelo nome, não pelo caminho.
3. As URLs atuais redirecionam ou morrem? A decisão D-10 da própria fase já
   escolheu corte seco para os hosts antigos; o mesmo critério vale aqui.
4. A configuração do atendimento é reagrupada sob `attendance/desk/*` como na
   Blip, ou o Pipe mantém a organização própria? Isso mexe em 54 rotas de
   front e é a maior decisão de escopo das quatro.

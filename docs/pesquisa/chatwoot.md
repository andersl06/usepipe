# Chatwoot — Relatório de Extensibilidade para o Pipe (Desk + Gestão)

Fontes: clone raso oficial (`chatwoot/chatwoot`, HEAD `8314676`, versão do `package.json` = `4.17.1`) em
`scratchpad/repos/chatwoot`, e material local em `C:/Users/anderson.linhares/barboo_chatwoot`
(compose de instalação real: web + worker Sidekiq + Postgres + Redis, sem enterprise habilitado).

## 1. Stack, estrutura e licença

- **Backend**: Rails `7.2.3.1` (`Gemfile:1`), Ruby `3.4.4` (`Gemfile: ruby '3.4.4'`), Puma `~>7.2`,
  Sidekiq `~>7.3.10` + `sidekiq-cron` para jobs assíncronos/periódicos, `redis`/`redis-namespace` para
  filas, cache, presença (`OnlineStatusTracker`) e ActionCable (websockets para a UI em tempo real).
  Postgres é o banco relacional (schema em `db/schema.rb`, ~120+ tabelas).
- **Frontend**: Vue (SPA em `app/javascript/dashboard`), build via Vite (`vite.config.ts`), Vuex/Pinia
  para estado. `app/javascript/dashboard/i18n` guarda todos os locales.
- **Licença dual** (`LICENSE:1-25`, `enterprise/LICENSE:1-37`): tudo fora de `enterprise/` é MIT. O que
  está sob `enterprise/` é sob "Chatwoot Enterprise License" — pode ser lido/modificado para
  desenvolvimento/teste, mas **usar em produção exige assinatura Enterprise paga por assento**; é
  proibido copiar/redistribuir/vender esse código.
- **O que vive em `enterprise/`** (`enterprise/app/*`, ~122 arquivos): Captain (IA/copiloto —
  `captain/`, `copilot_message.rb`, `copilot_thread.rb`, `article_embedding.rb`), SLA
  (`sla_policy.rb`, `sla_event.rb`, `applied_sla.rb`), SSO/SAML (`account_saml_settings.rb`), **RBAC
  customizado** (`custom_role.rb`), **roteamento avançado por carga** (`agent_capacity_policy.rb`,
  `inbox_capacity_limit.rb`, `Enterprise::AutoAssignment::AssignmentService`), Companies/CRM leve
  (`company.rb`), Calls/voz (`call.rb`), campanhas, portal público avançado. Ou seja: **o pedaço mais
  relevante para "Gestão" de verdade (roteamento por carga real e papéis customizados) é justamente
  Enterprise**, não MIT.

## 2. Modelo de dados central

`app/models/account.rb`, `inbox.rb`, `conversation.rb`, `message.rb`, `contact.rb`, `user.rb`,
`team.rb`, `label.rb`:
- `Account` é o tenant (multi-tenant single-schema); tem `custom_attributes` (jsonb), `feature_flags`
  (bitset via `FlagShihTzu`) — é assim que features Enterprise (`advanced_assignment`, `channel_voice`
  etc.) são ligadas/desligadas por conta.
- `Inbox` → canal de entrada; `Conversation` pertence a `account` + `inbox` + `contact`, tem
  `assignee_id`, `status`, `additional_attributes` (jsonb) e `display_id` sequencial por conta.
  `csat_survey_responses` é tabela própria ligada à conversa.
- `Contact`/`ContactInbox` desacoplam identidade do contato do canal específico (permite o mesmo
  contato ter presença em WhatsApp e e-mail).
- `User` + `AccountUser` (join table) carregam o `role` (administrator/agent) e, no Enterprise,
  `custom_role_id`. `Team`/`TeamMember`, `InboxMember` fazem a filiação agente↔fila.
- `AgentBot`/`AgentBotInbox` são o mecanismo nativo de bot por inbox (webhook de bot, não é IA
  embutida — isso é o Captain, que é Enterprise).

## 3. Canais

- **WhatsApp** (`app/models/channel/whatsapp.rb:1-186`): suporta dois `PROVIDERS`: `default`
  (360dialog) e `whatsapp_cloud` (API oficial da Meta). Campos-chave: `phone_number`,
  `provider_config` (jsonb: `api_key`, `business_account_id`, `phone_number_id`, `source` —
  `embedded_signup` ou `manual_setup_v2`), `business_management_token` (criptografado),
  `webhook_verify_token` (auto-gerado). Para conectar um número oficial da Meta é preciso: token de
  sistema/negócio (WABA), `business_account_id`, `phone_number_id`, e o Chatwoot registra
  webhooks automaticamente (`setup_webhooks`/`Whatsapp::WebhookSetupService`) — ou via fluxo de
  *embedded signup* (Meta faz o onboarding, token vem pronto) ou setup manual v2. Chamadas de voz via
  Cloud API existem mas são gateadas por feature flag Enterprise (`channel_voice`).
- **Canal "API" genérico** (`app/models/channel/api.rb`): canal minimalista para integrar qualquer
  sistema externo — tem `identifier` + `hmac_token` (autenticação de webhook), `webhook_url` (para o
  Chatwoot notificar o sistema externo de novas mensagens) e endpoints públicos
  (`public/api/v1/inboxes/:id/contacts/.../conversations/.../messages`) para o externo enviar
  mensagens de volta. É a via mais barata para plugar um canal proprietário (ex.: um bot próprio de
  IA) sem escrever um `Channel::*` novo no Rails.
- **E-mail**: `channel/email.rb`, integra IMAP/SMTP e reply-by-email; **Website widget**:
  `channel/web_widget.rb`, servido pelo entrypoint Vite separado `widget.js`.
- Outros canais nativos: Facebook, Instagram, Line, SMS/Twilio, Telegram, TikTok, Twitter.

## 4. Roteamento e atribuição

- MIT/core: `app/models/assignment_policy.rb` (linhas 1-41) — política por inbox com
  `assignment_order: round_robin` (único valor liberado fora do Enterprise, linha 38:
  `enum assignment_order: { round_robin: 0 } unless ChatwootApp.enterprise?`),
  `fair_distribution_limit`/`fair_distribution_window` (limite de conversas por agente numa janela de
  tempo) e `conversation_priority` (`earliest_created`/`longest_waiting`). A seleção real roda em
  `app/services/auto_assignment/round_robin_selector.rb` e
  `agent_assignment_service.rb`, que fazem round-robin **apenas entre agentes online** (via
  `OnlineStatusTracker`, dados no Redis) e lock otimista na `Conversation` para evitar corrida.
- **Enterprise adiciona `balanced` como segunda ordem** (`enterprise/app/models/enterprise/concerns/assignment_policy.rb`):
  `enum assignment_order: { round_robin: 0, balanced: 1 } if ChatwootApp.enterprise?`. A lógica de
  carga real está em `enterprise/app/services/enterprise/auto_assignment/assignment_service.rb`:
  filtra agentes por `AgentCapacityPolicy`/`InboxCapacityLimit` (`filter_agents_by_capacity`,
  `capacity_filtering_enabled?`) e só usa o `BalancedSelector` (que distribui por número de conversas
  abertas, não round-robin cego) se a feature `advanced_assignment` estiver habilitada na conta.
- **Conclusão prática**: no core MIT, "carga de trabalho" só existe como *limite* (máximo N
  conversas/hora por agente) — não existe balanceamento por quantidade de conversas abertas
  simultâneas sem Enterprise. Para o Pipe, dá para reimplementar um `WorkloadBalancedSelector` próprio
  no MIT (o ponto de extensão é exatamente esses `Selector` classes, plugáveis por
  `find_available_agent`), sem precisar copiar código Enterprise — só reescrever a lógica de seleção
  olhando `Conversation.where(assignee_id: agent, status: :open).count`.

## 5. Métricas nativas

- Evento cru fica em `reporting_events` (`db/schema.rb:1387-1402`): `name`, `value`,
  `value_in_business_hours`, `account_id`, `inbox_id`, `user_id`, `conversation_id` — já indexado por
  `(account_id, name, created_at)` e `(account_id, name, inbox_id, created_at)`.
- Eventos emitidos (`app/services/reporting_events/event_metric_registry.rb`): `conversation_resolved`
  (contagem + tempo de resolução), `first_response` (TMR), `reply_time` (tempo entre mensagens —
  proxy de TME), `conversation_bot_resolved`, `conversation_bot_handoff`. Existe uma tabela de rollup
  (`reporting_events_rollups`) para agregações rápidas.
- API pública de relatórios (`app/services/reports/report_metric_registry.rb`) expõe:
  `conversations_count`, `incoming/outgoing_messages_count`, `avg_first_response_time`,
  `avg_resolution_time`, `reply_time`, `resolutions_count`, métricas de bot. CSAT é tabela separada
  (`csat_survey_responses`: rating 1-5, `feedback_message`, `assigned_agent_id`,
  `csat_review_notes` — já pensada para monitoria/QA manual).
- **O que falta para um relatório semanal individual de esforço por atendente**: os dados existem
  (`reporting_events.filter_by_user_id` já suportado no model), mas não há um *job* nativo que gere um
  digest semanal por agente nem um relatório de "esforço" (mensagens escritas/lidas, tempo de fala em
  áudio etc. — conceito usado na régua de esforço do Barboo). É preciso: (a) um Sidekiq job agendado
  (via `sidekiq-cron`, já na stack) que agrega `ReportingEvent` + contagem de mensagens por `user_id`
  numa janela semanal, e (b) opcionalmente uma tela nova em Gestão para exibir — a infraestrutura de
  agregação (rollups) já existe, só falta o "por agente, por semana, enviado/mostrado".

## 6. Canned responses, macros, automation rules

- `CannedResponse` (`app/models/canned_response.rb`): simples, `short_code` + `content`, único por
  conta, com busca ranqueada por `ILIKE` — sem variáveis dinâmicas nativas além do texto.
- `Macro` (`app/models/macro.rb`): `actions` em jsonb, `visibility` (`personal`/`global`) — executa
  ações (atribuir, marcar como resolvida, adicionar label, enviar mensagem, webhook etc.) sob demanda
  do agente, um clique.
- `AutomationRule` (`app/models/automation_rule.rb:1-30 + resto`): `event_name`, `conditions` e
  `actions` em jsonb, `execution_delay` de 10 min a 30 dias (`EXECUTION_DELAY_RANGE`), com fila própria
  de execuções adiadas (`automation_rule_pending_execution.rb`,
  `app/jobs/automation_rules/trigger_pending_executions_job.rb`). Dispara em eventos como
  `message_created`/mudança de status/etc. (`AutomationRuleListener`). É um motor condição→ação
  razoavelmente flexível (bom o bastante para SLA simples, tags automáticas, follow-up), mas **não é
  um motor de fluxo visual (não é BPM)** — para lógica complexa de bot ainda se usa `AgentBot`
  (webhook externo) ou Captain (Enterprise/IA).

## 7. APIs disponíveis sem tocar código

- **Platform API** (`config/routes.rb:592-614`, `/platform/api/v1`): CRUD de `users`, `agent_bots`,
  `accounts`, `account_users` — é a API de *provisionamento* (criar contas/usuários programaticamente),
  autenticada por token de plataforma, pensada para quem opera múltiplos tenants.
- **Application API** (`/api/v1/accounts/:account_id/...`): CRUD completo de conversas, mensagens,
  contatos, inboxes, labels, teams, canned responses, macros, automation rules, webhooks,
  assignment_policies — é o que o próprio dashboard consome, então **qualquer coisa que o dashboard
  faz, dá para automatizar via API** com o token do usuário/conta.
- **Client API** (`/public/api/v1/inboxes/:id/...`) e a API do widget: usada pelo SDK do site/app do
  contato, sem autenticação de agente — serve para inbounds custom.
- **Webhooks** (`app/models/webhook.rb`): por conta ou por inbox (`webhook_type`), `subscriptions`
  jsonb (eventos como `conversation_created`, `message_created`, `conversation_status_changed`) — é o
  principal ponto de saída para integrar o Pipe (CRM) sem tocar no Rails: escutar webhook e replicar
  estado no CRM Twenty.

## 8. Frontend Vue: separação de rotas, esforço de dois builds, permissões

- Roteador único (`app/javascript/dashboard/routes/index.js` + `dashboard.routes.js`): um `AppContainer`
  (`Dashboard.vue`) engloba conversas do agente, `settings/*` (admin) e `captain/*` como **filhos do
  mesmo componente raiz**, todos no mesmo bundle Vite (`app/javascript/entrypoints/dashboard.js`).
  Permissão é feita **por rota**, via `meta.permissions: ['administrator','agent','custom_role', ...]`
  (ex. `dashboard.routes.js:40`) e validada centralmente em `validateAuthenticateRoutePermission`
  (`routes/index.js:18-64`), que também decide onboarding/redirecionamento. `role === 'administrator'`
  é checado direto na conta do usuário (`accounts.find(...).role`); Enterprise adiciona
  `custom_role_id` (RBAC granular) na tabela `account_users`.
- **Evidência forte a favor da separação**: o projeto **já compila múltiplos bundles Vite
  independentes** a partir do mesmo backend Rails — `app/javascript/entrypoints/`:
  `dashboard.js`, `widget.js` (chat do site), `sdk.js`, `survey.js`, `portal.js` (central de ajuda),
  `superadmin.js`/`superadmin_pages.js` (painel Rails de superadmin, praticamente vanilla JS sobre
  views ERB), `v3app.js`. Ou seja, a arquitetura de build **já é multi-app**; criar um quinto
  entrypoint "Gestão" (Vite) enxuto, reaproveitando os componentes de `settings/reports` e
  `components-next` (design system compartilhado), é o mesmo padrão que o projeto já usa — não é uma
  ruptura arquitetural. Já existe inclusive uma tela de relatório "overview" dedicada em
  `routes/dashboard/settings/reports/components/overview` que já parece com um embrião de "Gestão".
- **Onde dói**: `dashboard` (Vuex/Pinia store), o cliente API (`app/javascript/dashboard/api`),
  ActionCable subscriptions e i18n são compartilhados por *todas* as telas hoje — separar em dois apps
  de verdade significa (a) decidir o que cada bundle importa do `dashboard/store` (provavelmente dá
  para reusar as mesmas actions/getters em ambos os builds, já que é código JS puro, não componente),
  (b) extrair layout/shell (sidebar, header) duplicado hoje dentro de `Dashboard.vue`, e (c) manter dois
  `entrypoints/*.js` + duas entradas de rota no `vite.config.ts`. Estimativa: esforço **médio**, não
  trivial mas bem menor que reescrever — a maior parte da lógica de negócio (API calls, permissões,
  websockets) é reutilizável como está; o trabalho real é de shell/layout e roteamento, inspirado
  exatamente no padrão Desk/Gestão da Blip.

## 9. Theming / white-label

Sem fork pesado: `config/installation_config.yml:16-58` expõe `INSTALLATION_NAME`, `LOGO`,
`LOGO_DARK`, `LOGO_THUMBNAIL` (favicon), `BRAND_URL`, `BRAND_NAME`, `WIDGET_BRAND_URL`, `TERMS_URL`,
`PRIVACY_URL`, `DISPLAY_MANIFEST` (liga/desliga metadata "powered by Chatwoot") — tudo configurável via
super_admin UI ou variável de ambiente, sem editar código, para trocar nome/logo/links do produto.
Cor/tema visual (paleta, CSS) não está nesse arquivo de config — precisa editar os design tokens
SCSS/Tailwind do dashboard (mudança de código, mas localizada, não "fork pesado" no sentido de lógica).

## 10. i18n pt-BR

Tradução robusta: `app/javascript/dashboard/i18n/locale/pt_BR/*.json` soma ~10.098 linhas contra
~10.625 do `en` (base) — cobertura na casa de 95%, e ainda existe um locale `pt` (Portugal) separado
de `pt_BR`, mostrando manutenção ativa dessa variante. Backend (`config/locales/pt_BR.yml`,
`devise.pt_BR.yml`) também traduzido. Qualidade real (naturalidade, jargão) não foi auditada
string-a-string, mas a cobertura estrutural é alta — risco baixo de telas "quebradas" em inglês.

## 11. Riscos de manter fork e estratégia recomendada

- Chatwoot lança releases frequentes (múltiplos PRs por semana no upstream — `git log` mostra
  atividade constante mesmo em um clone raso). Um fork "hard" (editar arquivos MIT diretamente) tende
  a `merge/rebase hell` rapidamente, especialmente em `app/javascript/dashboard/store`, rotas e schema
  do banco (migrations do Chatwoot mudam com frequência).
- Estratégia recomendada: **não editar core**. (1) Customizações de negócio via os pontos de extensão
  já existentes no MIT: `AutomationRule`, `Webhook`, canal `Channel::Api` genérico, `AgentBot`,
  `prepend_mod_with`/`include_mod_with` (o próprio Chatwoot usa esse padrão para o Enterprise se
  "encaixar" sem herdar — ex. `Channel::Whatsapp.prepend_mod_with('Channel::Whatsapp')` em
  `whatsapp.rb:186`, `AssignmentPolicy.include_mod_with(...)` em `assignment_policy.rb:41`) — dá para
  criar um diretório próprio (`pipe/`) seguindo o mesmo padrão de módulos que o `enterprise/` usa, em
  vez de sobrescrever arquivo. (2) Novo build Vite "Gestão" como app separado consumindo a Application
  API existente, sem tocar no dashboard original — reduz drasticamente a superfície de conflito em
  upgrades. (3) Congelar em tags/releases (não `main`), testar upgrade em ambiente isolado antes de
  promover (o `barboo_chatwoot` já segue esse princípio com `CHATWOOT_TAG` parametrizado no
  `compose.prod.example.yml`). (4) Ficar de olho na Enterprise License: features enterprise só podem
  ser copiadas/rodadas em produção com assinatura — reimplementar balanceamento por carga e RBAC
  customizado *do zero* no MIT, inspirando-se na *interface* pública dos modelos enterprise (que é
  legível) mas sem copiar o código deles.

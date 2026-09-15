# Chatwoot — segurança e performance, o que copiar e o que não

Complementa `chatwoot.md` (que cobre stack, dados, canais, atribuição, métricas e licença).
Aqui só o que decide construção: autorização, isolamento entre contas, vulnerabilidades já
exploradas, índices, paginação, limites e criptografia. Pesquisa no código-fonte
(`chatwoot/chatwoot`, branch `develop`, set/2026).

## O resumo, para quem só vai ler isto

1. **Duas das três piores falhas do Chatwoot foram SQL injection no motor de filtros
   dinâmicos.** É onde o esforço de segurança rende mais em produto desse tipo.
2. **`account_id` gravável em strong params virou CVE** — transferência de recurso entre
   contas. FK de tenant nunca entra em parâmetro permitido.
3. **O Chatwoot não tem Row Level Security.** O isolamento é manual em três camadas. O Pipe
   já usa RLS no Postgres, o que é estruturalmente mais seguro — vale manter.
4. **Pundit protege o registro; a lista é filtrada em outro lugar.** Errar na segunda camada
   vaza coleção inteira.
5. **Contagem de não lidas fica no Redis, não no Postgres.** É o que evita `COUNT(*)` a cada
   refresh do sidebar.

---

## 1. Autorização — Pundit, com uma armadilha

`app/policies/application_policy.rb` recebe um hash `user_context` com `{user, account, account_user}`.
Todos os defaults são `false`. São 26 policies (`conversation_policy`, `inbox_policy`,
`contact_policy`, `report_policy`, `macro_policy`…).

Papéis no core são só dois: `account_users.role` enum `{ agent: 0, administrator: 1 }`.

**A armadilha:** `ConversationPolicy#index?` retorna `true` sem checagem nenhuma. A restrição da
lista não está na policy — está em `Conversations::PermissionFilterService`:

```ruby
return conversations if user_role == 'administrator'
conversations.where(inbox: user.inboxes.where(account_id: account.id))
```

São duas camadas independentes: Pundit para o registro, finder/service para a coleção. Quem
replica precisa das duas — proteger só a primeira vaza a lista inteira.

**Enterprise** (`custom_role.rb`, tabela `custom_roles`, `permissions text[]`): só 6 permissões —
`conversation_manage`, `conversation_unassigned_manage`, `conversation_participating_manage`,
`contact_manage`, `report_manage`, `knowledge_base_manage`. O módulo enterprise faz
`return false unless super`: a custom role **só restringe**, nunca amplia.

## 2. Isolamento entre contas — manual, sem RLS

Três camadas, todas manuais:

1. Rota: todo endpoint é `/api/v1/accounts/:account_id/...`
2. `EnsureCurrentAccountHelper#ensure_current_account`: acha a conta, recusa inativa, exige
   `account_users` do usuário atual, seta `Current.account`
3. `Current` (`lib/current.rb`) é `thread_mattr_accessor` puro — **não** é
   `ActiveSupport::CurrentAttributes`, então não há reset automático entre requests. Quem limpa
   é chamada explícita. Isso é risco em job ou thread reaproveitada.

Como cada controller depois faz `Current.account.conversations.find(...)`, **qualquer controller
que escreva `Model.find(params[:id])` sem escopo vaza**.

### Onde já vazou de verdade

`CVE-2026-72719` (corrigido em 4.9.0): `account_id` era gravável nos strong params de Portals,
Automation Rules, Macros e canais Twilio. Um admin autenticado transferia o recurso para outra
conta mandando `account_id` no payload. A lição é direta: FK de tenant nunca em
`permitted_params`; construir sempre a partir de `Current.account.<assoc>.new(...)`.

### Endpoints públicos

- **Widget**: não passa pelo helper de conta. Usa `website_token` para achar a inbox e um JWT
  com `contact_id`/`inbox_id`. Se o contato tem HMAC verificado (`contact_inboxes.hmac_verified`),
  o escopo abre para todos os `contact_inboxes` verificados — a verificação HMAC é o que autoriza
  ver histórico entre dispositivos.
- **Webhook WhatsApp**: valida assinatura antes de processar e enfileira `Webhooks::WhatsappEventsJob`.
- **ActionCable** (`RoomChannel`): autentica por `pubsub_token`, faz `stream_from pubsub_token` e,
  para usuários, também `stream_from "account_#{id}"`. **Não confirmado** se um agente sem acesso
  a uma inbox recebe evento dela pelo canal `account_*` — verificar antes de copiar o desenho.

## 3. Vulnerabilidades — o padrão importa mais que a lista

| ID | Sev | Corrigido | O quê |
|---|---|---|---|
| CVE-2025-21628 | 9.1 | 3.16.0 | Blind SQLi: `query_operator` dos filtros não sanitizado |
| GHSA-9pgm-75gg-6948 | 8.5 | 4.11.2 | SQLi em filtro por custom attribute; **cross-tenant**: lia e-mails, hashes de senha e API tokens de outras contas |
| CVE-2026-72719 | 6.7 | 4.9.0 | `account_id` gravável → transferência entre contas |
| CVE-2026-44707 | Moderada | 4.13.0 | Pre-account takeover: OAuth confirmava conta pré-registrada sem invalidar a senha do atacante |
| CVE-2026-63765 | — | 4.16.0 | Direct upload do ActiveStorage sem autenticação |
| CVE-2026-5205 | Crítica | **sem patch** | SSRF no `Webhooks::Trigger`: URL de destino não validada, alcança metadata de cloud |

**Três regras que saem daqui:**
- Filtro dinâmico: nome de campo por allowlist, valor por bind param, operador lógico por allowlist.
- OAuth em conta não confirmada precisa invalidar credenciais pré-existentes.
- URL de webhook fornecida pelo usuário precisa de deny de IP privado antes do request sair.

## 4. Performance de banco

**Índices em `conversations`** — o composto principal é
`(account_id, inbox_id, status, assignee_id)`, mais `(account_id, display_id)` único,
`(status, priority)`, `(waiting_since)`, `(first_reply_created_at)`.

**Índices em `messages`** — `(account_id, content_type, created_at)`,
`(account_id, created_at, message_type)`, `(sender_type, sender_id, created_at)`,
**GIN em `content`** e GIN em `additional_attributes -> campaign_id`.

**Paginação assimétrica, e é proposital:**

| O quê | Estratégia | Tamanho |
|---|---|---|
| Conversas | offset (Kaminari) | 25 (`CONVERSATION_RESULTS_PER_PAGE`) |
| Mensagens recentes | cursor por id | 20 |
| Scroll pra cima | cursor por id | 20 |
| Mensagens depois | cursor por id | 100 |
| Intervalo | cursor por id | 1000 |

**N+1 é tratado explicitamente** no `conversations_base_query`, com `includes` de taggings, team,
contact_inbox e — o clássico — `avatar_attachment: [:blob]` do ActiveStorage.
Ponto lento conhecido: busca textual usa `ILIKE %termo%`, que **não** usa o índice GIN.

**Sem `counter_cache`.** No lugar:
- colunas derivadas em `conversations`: `cached_label_list` (evita join em taggings),
  `last_activity_at` (ordenação default), `first_reply_created_at`, `waiting_since`
- **contagem de não lidas no Redis**, em sets por inbox/label/team/assignee, com TTL
- métricas em `reporting_events_rollups`, chave `(account_id, date, dimension_type, dimension_id, metric)`,
  escrita por `upsert_all` somando

**Detalhe que vale ouro:** o rollup **é escrito mas ainda não é lido** — `Reports::DataSource.for`
tem `# TODO: Route to Reports::RollupDataSource when rollup reads are implemented` e sempre devolve
a fonte crua. Ou seja: relatório do Chatwoot ainda varre `reporting_events` inteiro. Se o Pipe já
tem `metrica_diaria`, está à frente nesse ponto.

## 5. Limites operacionais

Rate limit por Rack::Attack, store no Redis. Geral: **3000/min por IP**. Login: 5/5min por IP e
10/15min por e-mail. Widget: 30 conversas/min, 60 mensagens/min. Upload: 60/h por conta.
Reports: 100/min por usuário e 1000/min por conta.

**Anexo: 40 MB** (`MAXIMUM_FILE_UPLOAD_SIZE`), **15 anexos por mensagem**. A validação de tamanho e
content-type roda **só para o canal WebWidget** — outros canais não passam por ela.
(Para comparação, o Blip Desk aceita 100 MB e 10 anexos.)

**Retenção: não existe no open source.** Nenhum job apaga mensagem ou conversa por idade. A
retenção por plano (30 dias a 3 anos) é política do Chatwoot Cloud, não do produto.

## 6. Dados sensíveis

Criptografia com Rails 7 `encrypts`, quase toda **condicional** a `Chatwoot.encryption_configured?` —
sem as chaves, grava em claro. Cobre `business_management_token`, senhas de IMAP/SMTP,
`access_token` de integrações e `secret` de webhook. Só `otp_secret` e `otp_backup_codes` são
sempre criptografados.

**Não é criptografado:** e-mail, telefone e identificador do contato; conteúdo das mensagens; e
`access_tokens.token`, que é texto puro com índice único — quem lê o banco tem os tokens de API de
todos. Não há mascaramento de PII em lugar nenhum.

**Delete de contato (LGPD)** não tem ferramenta dedicada: é o `DELETE` do contato, que recusa se o
contato estiver online e faz cascade `dependent: :destroy_async`. Consequências:
- não é atômico — há janela com contato apagado e mensagens ainda presentes;
- os agregados em `reporting_events_rollups` **não são revertidos** (upsert soma, não decrementa):
  o dado agregado sobrevive ao delete.

## 7. Assinatura de webhook — copiar esta parte

```ruby
ts = Time.now.to_i.to_s
headers['X-Chatwoot-Timestamp'] = ts
headers['X-Chatwoot-Signature'] = "sha256=#{OpenSSL::HMAC.hexdigest('SHA256', @secret, "#{ts}.#{body}")}"
```

Formato `sha256=HMAC(secret, "timestamp.body")` — o timestamp dentro da assinatura é o que protege
contra replay. É a mesma função onde vive o SSRF sem patch, então: copiar a assinatura, **não** a
falta de validação da URL de destino.

## Não confirmado

- Algoritmo exato de verificação da assinatura do webhook WhatsApp (arquivo do concern não
  encontrado no repositório).
- Se o canal `account_*` do ActionCable respeita permissão por inbox.

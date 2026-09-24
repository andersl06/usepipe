---
last_mapped_commit: a6f27429c7ea9be3bff55dc212d1534c3ec90a21
last_mapped_at: 2026-09-24
---
# External Integrations

**Analysis Date:** 2026-09-24

## APIs & External Services

**AI:**

- Anthropic API - summarization, classification, and evaluation of attendance conversations
  - SDK/Client: `@anthropic-ai/sdk`, wrapped in `packages/ai/src/cliente/cliente.ts`
  - Auth: `ANTHROPIC_API_KEY` (env, resolved automatically by the SDK)
  - Model: defaults to `claude-sonnet-5`, overridable via `PIPE_IA_MODELO`
  - Design: structured output validated with `zod` (`zodOutputFormat`); calls go through an injectable `ChamadaEstruturada` type so tests replay recorded responses instead of hitting the real API; usage/consumption tracked in `packages/ai/src/consumo`

**Messaging (WhatsApp):**

- Meta WhatsApp Cloud API - outbound/inbound WhatsApp messaging, delivered via `apps/workers` (BullMQ)
  - Auth/config: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_TOKEN_ACESSO`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSAO`, `WHATSAPP_APP_ID`, `WHATSAPP_CONFIG_ID`
  - `PIPE_WHATSAPP_CLIENTE` / `PIPE_WHATSAPP_CONEXAO` select the active client/connection
  - A double/stub implementation is configurable via `PIPE_WHATSAPP_DUBLE_*` env vars (delay, forced failure, permanent failure code/text) for local dev and tests without hitting Meta

**CRM Mirror:**

- Twenty CRM - one-way mirror target for CRM data
  - Implementation: `apps/api/src/dominio/twenty.ts`, `apps/api/src/dominio/espelho-crm.ts`
  - Config: `PIPE_TWENTY_URL`, `PIPE_TWENTY_TIMEOUT_MS`, `PIPE_ESPELHO_CRM_CONCORRENCIA`, `PIPE_ESPELHO_CRM_VARREDURA_MS` (scan interval for the mirror job)

**Email:**

- Transactional email, provider abstracted behind a mode flag
  - Config: `PIPE_EMAIL_MODO`, `PIPE_EMAIL_URL`, `PIPE_EMAIL_TOKEN`, `PIPE_EMAIL_REMETENTE`, `PIPE_EMAIL_TIMEOUT_MS`

## Data Storage

**Databases:**

- PostgreSQL 16 with pgvector extension (`pgvector/pgvector:pg16` image, `docker-compose.yml`)
  - Connection: `DATABASE_URL` (migration/admin) and `DATABASE_URL_APP` (application runtime, presumably scoped by RLS)
  - Client/ORM: `drizzle-orm` + `drizzle-kit`, schema in `packages/db/src/schema/*` (`automacao.ts`, `comum.ts`, `conversas.ts`, `identidade.ts`, `monitoria.ts`)
  - Vector column: `trecho_conhecimento.embedding` is `vector(1536)` — used for embedding-based knowledge search
  - RLS (row-level security) policies are part of the `packages/db` responsibility (per its `package.json` description)
  - Local dev port: host `5433` → container `5432`

**File Storage:**

- `packages/armazenamento` - object storage abstraction "port in S3 format, disk backend" (S3-compatible interface, local disk implementation for dev)
  - Config: `PIPE_STORAGE_DIR`, `PIPE_STORAGE_URL_BASE`

**Caching / Queues:**

- Redis 7 (`docker-compose.yml`, host port `6380` → container `6379`)
  - Config: `REDIS_URL`
  - Client: `ioredis`, used by `bullmq` queues in `apps/workers` and `apps/api`

## Authentication & Identity

**Auth Provider:**

- OIDC (custom implementation, provider-agnostic) - `packages/autenticacao`
  - Google as a first-class constant issuer: `packages/autenticacao/src/google.ts`, config `GOOGLE_CLIENTE_ID`, `GOOGLE_CLIENTE_SEGREDO`, `GOOGLE_URL_RETORNO`
  - Generic OIDC (Microsoft Entra ID, Google Workspace, Okta, etc.): `packages/autenticacao/src/oidc.ts`, provider list driven by the `PROVEDORES_SSO` enum in `@pipe/db/schema`
  - JWT/JWKS verification via `jose` (`createRemoteJWKSet`, `jwtVerify`), issuer discovered via `.well-known`
  - Security invariants documented in code: signature checked against issuer JWKS with exact `iss`/`aud`; `state`/`nonce`/PKCE per attempt; account key is `(issuer, subject)` tuple, never email
  - Session/tenant resolution: `packages/autenticacao/src/index.ts`
  - Secret rotation: `PIPE_CHAVES_SEGREDO` (key set) / `PIPE_CHAVE_SEGREDO_ATUAL` (active key id), handled in `packages/db/src/segredo.ts`

## Monitoring & Observability

**Error Tracking:**

- None detected in dependencies (no Sentry/Datadog SDK found)

**Logs:**

- `infra/observabilidade` directory present in infra config (not application-level SDK); application logging approach not evidenced by dependency list

**Metrics:**

- `PIPE_METRICS_TOKEN` env var - protects a metrics endpoint (likely Prometheus-style scrape, exposed by `apps/api`)
- `PIPE_SAUDE_TIMEOUT_MS` - health-check timeout config

## CI/CD & Deployment

**Hosting:**

- Containerized deployment: `infra/compose` (Docker Compose) and `infra/k8s` (Kubernetes manifests)
- `infra/terraform` - infrastructure as code
- `infra/.sops.yaml` - SOPS-encrypted secrets for infra

**CI Pipeline:**

- Not detected in this pass (no `.github/workflows` found during exploration)

## Environment Configuration

**Required env vars (partial, see `.env.example` for full ~60-variable list):**

- Core: `DATABASE_URL`, `DATABASE_URL_APP`, `REDIS_URL`, `PORT`, `PIPE_VERSAO`
- AI: `ANTHROPIC_API_KEY`, `PIPE_IA_MODELO`
- Auth: `GOOGLE_CLIENTE_ID`, `GOOGLE_CLIENTE_SEGREDO`, `GOOGLE_URL_RETORNO`, `PIPE_CHAVES_SEGREDO`, `PIPE_CHAVE_SEGREDO_ATUAL`, `PIPE_DOMINIO_CONTAS`
- WhatsApp: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_TOKEN_ACESSO`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSAO`, `WHATSAPP_APP_ID`, `WHATSAPP_CONFIG_ID`
- CRM mirror: `PIPE_TWENTY_URL`, `PIPE_TWENTY_TIMEOUT_MS`
- Email: `PIPE_EMAIL_MODO`, `PIPE_EMAIL_URL`, `PIPE_EMAIL_TOKEN`, `PIPE_EMAIL_REMETENTE`
- CORS/cookies: `PIPE_ORIGENS`, `PIPE_COOKIE_DOMINIO`, `PIPE_COOKIE_SEGURO`
- URLs: `PIPE_URL_APP`, `PIPE_URL_ENTRADA`, `PIPE_URL_API`

**Secrets location:**

- `.env` (gitignored, local only)
- Production secrets encrypted via SOPS (`infra/.sops.yaml`)
- Application-level secret rotation for signing/encryption keys handled by `packages/db/src/segredo.ts` (`PIPE_CHAVES_SEGREDO` / `PIPE_CHAVE_SEGREDO_ATUAL`)

## Webhooks & Callbacks

**Incoming:**

- WhatsApp Cloud API webhook (verification via `WHATSAPP_VERIFY_TOKEN`, signature via `WHATSAPP_APP_SECRET`) — handled in `apps/api` domain layer
- LIME protocol bridge - `apps/ponte` translates the LIME protocol (from the Blip clone) into Pipe's domain, described as "Traduz o protocolo LIME da cópia do Blip para o domínio do Pipe"

**Outgoing:**

- Generic outgoing webhook delivery, retry-tunable via `PIPE_WEBHOOK_MAX_TENTATIVAS`, `PIPE_WEBHOOK_TIMEOUT_MS`
- Twenty CRM one-way mirror push (see CRM Mirror above)

---

*Integration audit: 2026-09-24*

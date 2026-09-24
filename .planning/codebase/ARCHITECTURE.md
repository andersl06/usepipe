---
last_mapped_commit: a6f27429c7ea9be3bff55dc212d1534c3ec90a21
last_mapped_at: 2026-09-24
---
<!-- refreshed: 2026-09-24 -->

# Architecture

**Analysis Date:** 2026-09-24

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                          Frontends (Vite / Next.js SPAs)                  │
├──────────────────┬──────────────────┬──────────────────┬─────────────────┤
│   Gestão (admin)  │   Desk (agent)   │   CRM (Next.js)  │   Site (static)│
│ `apps/gestao-vite`│ `apps/desk-vite` │   `apps/crm`     │  `apps/site`   │
└─────────┬─────────┴────────┬─────────┴────────┬─────────┴────────────────┘
          │  REST (fetch, cookie sessão)         │
          ▼                  ▼                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        API (NestJS, single module)                        │
│                            `apps/api/src`                                 │
│  controladores/*  →  dominio/*  (thin controller, fat domain)             │
└───────────┬──────────────────────────────┬────────────────────────────────┘
            │ enqueue (BullMQ/Redis)        │ Postgres (RLS, Drizzle)
            ▼                               ▼
┌────────────────────────────┐   ┌──────────────────────────────────────────┐
│   apps/workers (BullMQ)     │   │        packages/db (Drizzle schema)      │
│  entrega, importação, mídia,│   │  RLS por tenant, migrations, seeds        │
│  WhatsApp Cloud API client  │   └──────────────────────────────────────────┘
└──────────────┬───────────────┘
               │ WhatsApp Cloud API / Instagram / Messenger Graph API
               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  External channels (Meta WhatsApp, Instagram, Messenger) + Twenty CRM     │
└───────────────────────────────────────────────────────────────────────────┘

Side systems:
  apps/ponte     — bridge/translation service talking to Blip LIME protocol (`apps/ponte/src/lime.ts`)
  packages/tempo-real — realtime/WebSocket push layer, used by API (`eventos-ws.ts`) and Desk/Gestão frontends
  packages/mcp   — MCP server surface (`packages/mcp/src/index.ts`)
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| API (NestJS) | HTTP/webhook entry point, auth, tenant resolution, thin controllers | `apps/api/src/app.modulo.ts` |
| Domain layer | Business logic per bounded area (desk, gestão, canais, CRM mirror) | `apps/api/src/dominio/**` |
| Queues | Async job definitions and enqueue helpers used by the API | `apps/api/src/filas.ts` |
| Workers | BullMQ consumers: message delivery, imports, media download, channel clients | `apps/workers/src/**` |
| DB package | Drizzle schema, tenant/RLS helpers, migrations, seed data | `packages/db/src/**` |
| Contracts | Shared request/response/event DTO types between API and frontends | `packages/contracts/src/**` |
| Auth package | Session/token resolution, cookie/CORS helpers shared by API | `packages/autenticacao/src/**` |
| Realtime package | WebSocket channel abstraction (ports, disk-backed queue) | `packages/tempo-real/src/**` |
| Storage package | Attachment size limits and storage helpers | `packages/armazenamento/src/**` |
| AI package | Prompt/analysis/classification/summary logic for monitoring & scoring | `packages/ai/src/**` |
| Ponte (bridge) | Translates Pipe flows to/from Blip's LIME builder format | `apps/ponte/src/lime.ts`, `apps/ponte/src/traducao.ts` |
| Gestão frontend | Admin app: flow builder, team/queue config, deployment wizard | `apps/gestao-vite/src/paginas/**` |
| Desk frontend | Agent-facing attendance app: conversations, bulk actions, analytics | `apps/desk-vite/src/paginas/**` |
| CRM frontend | Next.js CRM UI (leads, opportunities, contacts) | `apps/crm/src/app/**` |

## Pattern Overview

**Overall:** Turborepo/pnpm monorepo. Backend is a modular monolith (single NestJS module, `AppModulo`) with domain logic separated from HTTP controllers ("thin controller, fat domain"). Async work is offloaded to a separate `apps/workers` process via BullMQ/Redis. Multi-tenant via Postgres Row-Level Security (RLS), never via application-level `WHERE tenant_id = ...` filtering alone.

**Key Characteristics:**

- Portuguese identifiers throughout (`dominio`, `controladores`, `fila`, `banco`) — this is the established naming convention, not a translation artifact.
- No dependency injection via constructor typing in Nest controllers — domain functions are imported and called directly (see comment in `apps/api/src/app.modulo.ts:47-51`). This avoids `emitDecoratorMetadata`, keeps domain logic testable without booting Nest.
- Two auth guards registered globally (`GuardaChaveApi` for API keys/integrations, `GuardaSessao` for browser cookie sessions); routes opt in via `@Escopos(...)` or `@ComSessao()` decorators. Unmarked routes are intentionally public (Meta webhooks, `/saude`).
- Queue mode is switchable: `PIPE_FILAS=memoria` runs jobs inline (dev/e2e), `bullmq` (default) uses Redis — same code path either way (`apps/api/src/filas.ts`).
- Frontends are three separate Vite/Next SPAs per surface (gestão, desk, crm) rather than one shared app — each owns its own `paginas/`, `componentes/`, `contexto/`, `lib/`.

## Layers

**Controllers (`apps/api/src/controladores/`):**

- Purpose: HTTP routing, request/response shaping, guard annotations
- Location: `apps/api/src/controladores/*.ts`
- Contains: NestJS `@Controller` classes, one file per resource area (crm, desk, canais, webhooks-whatsapp, etc.)
- Depends on: domain functions (`dominio/`), session/auth helpers (`sessao.ts`, `autenticacao.ts`), queue enqueue functions (`filas.ts`)
- Used by: HTTP clients (frontends, Meta webhooks, external integrations)

**Domain (`apps/api/src/dominio/`):**

- Purpose: business rules, one subtree per bounded context (`gestao/`, `desk/`, `whatsapp/`, `instagram/`, `messenger/`)
- Location: `apps/api/src/dominio/**`
- Contains: pure/near-pure functions operating on the Drizzle client passed in
- Depends on: `packages/db` for schema/queries, `packages/contracts` for shared types
- Used by: controllers, queue consumers in `apps/workers`

**Queues (`apps/api/src/filas.ts` + `apps/workers/src/`):**

- Purpose: decouple slow/external-facing work (message delivery, media download, CRM sync, imports) from the request/response cycle
- Location: `apps/api/src/filas.ts` (producer side), `apps/workers/src/*.ts` (consumer side)
- Depends on: BullMQ, Redis (`ioredis`), shared job type definitions in `@pipe/workers`
- Used by: API controllers/domain (enqueue), scheduled sweeps (`agendarVarredura*`)

**Data (`packages/db/`):**

- Purpose: schema definition, tenant isolation, migrations, seeding
- Location: `packages/db/src/schema/*.ts` (per-domain schema files: `crm.ts`, `gestao.ts`, `conversas.ts`, `identidade.ts`, `monitoria.ts`, `automacao.ts`, `implantacao.ts`, `comum.ts`)
- Contains: Drizzle ORM table definitions, RLS-aware client factory (`cliente.ts`), tenant-scoped query wrapper (`tenant.ts`)
- Used by: `apps/api`, `apps/workers`, `apps/ponte`

## Data Flow

### Primary Request Path (browser action)

1. Frontend calls REST endpoint with session cookie `pipe_sessao` (e.g. `apps/desk-vite/src/lib/*`)
2. `GuardaSessao` guard resolves tenant from the session, not from the request body/URL (`apps/api/src/sessao.ts`)
3. Controller method (`apps/api/src/controladores/*.ts`) calls a domain function passing the tenant-scoped db handle
4. Domain function (`apps/api/src/dominio/**`) runs Drizzle queries under Postgres RLS via `noTenant`/tenant-scoped helpers (`apps/api/src/banco.ts`)
5. Response DTO shaped per `packages/contracts/src/*.ts` types returned to frontend

### Inbound Webhook Path (WhatsApp/Instagram/Messenger)

1. Meta posts to `/v1/canais/whatsapp/webhooks` etc. — body captured as raw bytes (`corpoCru`) before JSON parsing so the `X-Hub-Signature-256` HMAC can be verified against exact bytes (`apps/api/src/servidor.ts:35-38`)
2. `ControladorWebhookWhatsApp`/Instagram/Messenger validate signature, call `processarPayload` (`apps/api/src/dominio/entrada.ts`)
3. Work that must not block the webhook response (delivery, media download) is enqueued (`enfileirarEntrega`, `enfileirarDownloadMidia` style calls in `filas.ts`)
4. `apps/workers` consumers pick up the job and call the WhatsApp/Instagram/Messenger Graph API client (`apps/workers/src/whatsapp/*.ts`)

### Outbound Message Delivery

1. Domain/controller writes a row to the `outbox_mensagem` table — this row is the source of truth, not the queue (`apps/api/src/filas.ts` header comment)
2. A BullMQ job is enqueued as a "nudge" to process now; a periodic sweep (`agendarVarreduraProcessHttp`, etc.) also picks up unprocessed rows if the job is lost
3. `apps/workers/src/entrega.ts` sends via the appropriate channel client

**State Management:**

- No client-side global state framework observed beyond React Context per app (`contexto/` in gestao-vite, desk-vite). Server state lives in Postgres; realtime push via `packages/tempo-real` and `apps/api/src/eventos-ws.ts` keeps frontends in sync without polling.

## Key Abstractions

**Tenant-scoped database access:**

- Purpose: enforce multi-tenancy at the Postgres RLS level, never trust `tenant_id` from client input
- Examples: `apps/api/src/banco.ts` (`noTenant`, tenant-scoped wrappers), `packages/db/src/tenant.ts`, `packages/db/src/cliente.ts` (comment: app role has no `bypassrls`; migration/seed use owner role)
- Pattern: every query runs through a function that sets the Postgres session tenant before executing

**Guards over decorators:**

- Purpose: two independent auth mechanisms (API key vs. session) composed declaratively
- Examples: `apps/api/src/autenticacao.ts` (`GuardaChaveApi`, `@Escopos`), `apps/api/src/sessao.ts` (`GuardaSessao`, `@ComSessao`)
- Pattern: `SetMetadata` + `CanActivate`, checked globally via `APP_GUARD` providers in `app.modulo.ts`

**Job type contracts:**

- Purpose: shared job payload types between producer (API) and consumer (workers)
- Examples: `JobEntrega`, `JobEntrada`, `JobMidia`, `JobImportacao` exported from `@pipe/workers`, imported by `apps/api/src/filas.ts`
- Pattern: queue name constants + typed job payload live in the workers package, imported by both sides

## Entry Points

**API server:**

- Location: `apps/api/src/main.ts` → `apps/api/src/servidor.ts` (`subirApi`)
- Triggers: process start (`node dist/main.js` or `pnpm dev`)
- Responsibilities: builds Nest app, configures CORS/body-size limits per route, starts queue consumers and scheduled sweeps, attaches WebSocket channel, listens on port (default 3000; Gestão=3100, Desk=3200, CRM=3300 by convention)

**Workers process:**

- Location: `apps/workers/src/main.ts`
- Triggers: separate process/container, consumes BullMQ queues
- Responsibilities: message delivery, contact import (CSV), media download, WhatsApp/Instagram/Messenger client calls

**Ponte (bridge) process:**

- Location: `apps/ponte/src/main.ts` → `apps/ponte/src/servidor.ts`
- Triggers: separate process, translates flow definitions to/from Blip's LIME builder protocol
- Responsibilities: `builder.ts`, `traducao.ts`, `lime.ts`

**Frontend entry points:**

- `apps/gestao-vite/src/main.tsx`, `apps/desk-vite/src/main.tsx` — Vite SPA bootstraps
- `apps/crm/src/app/*` — Next.js App Router pages

## Architectural Constraints

- **Multi-tenancy:** Enforced via Postgres RLS, not app-level filtering. Two DB roles exist: an app role (no `bypassrls`, used by the API) and an owner role (used only by migrations/seeds). Mixing these up silently disables tenant isolation — flagged explicitly in `packages/db/src/cliente.ts`.
- **Body parsing order matters:** Raw-body middleware for webhooks/uploads/CSV must be registered before the global `express.json()` parser in `apps/api/src/servidor.ts`, and is scoped per-path with distinct size limits (100MB anexos, 20MB CSV import, 8MB WhatsApp profile photo, 140MB template media, 16MB builder flow, 15MB mTLS cert, 2MB default JSON).
- **Outbox pattern for delivery:** the queue job is only a "nudge"; the `outbox_mensagem` table row is the durable truth, with periodic sweeps as a fallback if a job is dropped.
- **No constructor-based DI in Nest controllers:** domain functions are called directly as plain imports, not injected — deliberate choice to avoid `emitDecoratorMetadata` conflicting with `verbatimModuleSyntax`, and to keep domain logic unit-testable without Nest's test harness.
- **CORS never wildcards with credentials:** allowed origins come from `PIPE_ORIGENS` env var and are checked per-request; `credentials: true` combined with `*` is explicitly avoided (`apps/api/src/servidor.ts:44-47`).
- **Single Postgres HTTP server shares the WebSocket upgrade:** the realtime channel attaches to the same HTTP server after `listen()`, not a separate port, so Desk/Gestão/CRM only need one origin each.

## Anti-Patterns

### Trusting tenant_id from the request

**What happens:** N/A as observed — the codebase actively avoids this; call it out because it's the one rule enforced everywhere.
**Why it's wrong:** would let one tenant read/write another tenant's data by manipulating a URL/body field.
**Do this instead:** resolve `tenantId` only from the authenticated session/API key (`sessaoDe(requisicao)` in `apps/api/src/sessao.ts`) and pass it into the RLS-scoped db wrapper.

### Reserializing webhook bodies before signature check

**What happens:** if JSON is parsed/reserialized before verifying `X-Hub-Signature-256`, the HMAC comparison silently fails because whitespace/key order changes the byte sequence.
**Why it's wrong:** breaks Meta webhook verification unpredictably ("misteriosamente" per the code comment).
**Do this instead:** capture `corpoCru` (raw buffer) in the JSON parser's `verify` callback and HMAC against that, as done in `apps/api/src/servidor.ts:115-121`.

## Error Handling

**Strategy:** Centralized Nest exception filter (`FiltroDeErro`, `apps/api/src/erros.ts`) applied globally via `app.useGlobalFilters`.

**Patterns:**

- Domain-level custom error type (`ErroPipe`) thrown from domain/guard code, caught and formatted by the global filter
- Guards throw on missing/invalid auth rather than letting requests fall through

## Cross-Cutting Concerns

**Logging:** Structured via request instrumentation middleware (`medirRequisicao`, `apps/api/src/metricas.ts`) mounted before routing so unmatched routes are still measured.
**Validation:** Per-route body size limits enforced at the Express middleware layer per endpoint (see servidor.ts); business validation lives in domain functions.
**Authentication:** Dual guard model (API key + session), described above; both are global `APP_GUARD` providers, opt-in via decorators.

---

*Architecture analysis: 2026-09-24*

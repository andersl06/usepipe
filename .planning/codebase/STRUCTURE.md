---
last_mapped_commit: a6f27429c7ea9be3bff55dc212d1534c3ec90a21
last_mapped_at: 2026-09-24
---
# Codebase Structure

**Analysis Date:** 2026-09-24

## Directory Layout

```
pipe/
├── apps/
│   ├── api/              # NestJS backend — controllers + domain logic + queue producers
│   ├── workers/          # BullMQ consumers — delivery, imports, media, channel clients
│   ├── ponte/             # Bridge service translating Pipe flows to/from Blip LIME protocol
│   ├── gestao-vite/       # Admin/management SPA (Vite + React)
│   ├── desk-vite/         # Agent attendance SPA (Vite + React)
│   ├── crm/               # CRM app (Next.js App Router)
│   └── site/              # Static marketing site (assets, blog, ferramentas)
├── packages/
│   ├── db/                # Drizzle schema, migrations, seeds, tenant/RLS helpers
│   ├── contracts/         # Shared DTO/event types between API and frontends
│   ├── autenticacao/      # Session/token/cookie/CORS helpers shared by API
│   ├── armazenamento/     # Attachment storage helpers, size limits
│   ├── tempo-real/        # Realtime/WebSocket channel abstraction
│   ├── ai/                # Prompt, classification, scoring, transcription logic
│   ├── core/               # Shared cross-cutting utilities
│   ├── mcp/                # MCP server surface
│   └── ui/                 # Shared design system (components, theme, icons)
├── docker/postgres/       # Local Postgres bootstrap
├── infra/                 # Terraform, k8s manifests, observability config
├── docs/specs/            # Dated design/requirements notes (markdown decision log)
├── referencias-blip/      # Captured reference screenshots/HTML of the Blip product (design source of truth)
├── scripts/               # Repo-level automation scripts
├── .planning/             # GSD planning artifacts (this directory)
├── turbo.json             # Turborepo pipeline (build/typecheck/lint/test)
├── pnpm-workspace.yaml     # Workspace globs: apps/*, packages/*
└── package.json            # Root scripts (banco:*, desk, ponte, etc.)
```

## Directory Purposes

**`apps/api/src/controladores/`:**

- Purpose: HTTP-facing NestJS controllers, one file per resource (crm, desk, canais, webhooks-whatsapp, gestao-*, etc.)
- Contains: `@Controller` classes, route decorators, guard annotations (`@Escopos`, `@ComSessao`)
- Key files: `app.modulo.ts` (root module, wires every controller + global guards)

**`apps/api/src/dominio/`:**

- Purpose: business logic, organized by bounded context; subfolders per channel/area (`whatsapp/`, `instagram/`, `messenger/`, `gestao/`, `desk/`)
- Contains: plain functions taking a tenant-scoped db handle, no framework coupling
- Key files: `entrada.ts` (inbound message processing), `fluxo.ts` (flow execution), `espelho-crm.ts` (CRM mirror sync), `gestao/sla-motor.ts` (SLA engine)

**`apps/workers/src/`:**

- Purpose: BullMQ job consumers, one file per concern (`entrega.ts` delivery, `importacao-de-contatos.ts`, `agregacao.ts`)
- Contains: `whatsapp/`, subfolder with channel-specific client, media, template, and a `duble.ts` (test double) plus `real.ts` (real client)
- Key files: `filas.ts` (queue name constants + job types re-exported to API)

**`packages/db/src/schema/`:**

- Purpose: Drizzle table definitions split by domain
- Contains: `identidade.ts` (users/tenants/auth), `conversas.ts`, `crm.ts`, `gestao.ts`, `automacao.ts`, `monitoria.ts`, `implantacao.ts`, `comum.ts` (shared enums/columns)
- Key files: `cliente.ts` (db client factory, RLS role distinction), `tenant.ts` (tenant-scoped query wrapper), `migrar.ts`, `semente.ts`/`semente-demo.ts` (seed scripts)

**`apps/gestao-vite/src/paginas/` and `apps/desk-vite/src/paginas/`:**

- Purpose: one subfolder per screen/feature area
- Gestão: `builder/`, `cadastros/`, `contrato/`, `fluxo/`, `implantacao/`, `operacao/`, `minha-conta/`
- Desk: `atendimentos/`, `analytics/`, `contatos/`, `acoes-em-massa/`, `mensagem-ativa/`, `preferencias/`
- Each app also has `componentes/`, `contexto/`, `estilos/`, `lib/` at the `src/` root shared across pages

**`referencias-blip/`:**

- Purpose: reference material — screenshots/HTML captures of the Blip product used as the visual/behavioral spec for Gestão/Desk features
- Generated: no (manually captured), Committed: yes

**`docs/specs/`:**

- Purpose: dated markdown decision log (`YYYY-MM-DD-topic.md`) capturing product/architecture decisions as they're made
- Generated: no, Committed: yes

## Key File Locations

**Entry Points:**

- `apps/api/src/main.ts`: API process bootstrap
- `apps/workers/src/main.ts`: worker process bootstrap
- `apps/ponte/src/main.ts`: bridge process bootstrap
- `apps/gestao-vite/src/main.tsx`, `apps/desk-vite/src/main.tsx`: SPA bootstraps

**Configuration:**

- `turbo.json`: task pipeline (build/typecheck/lint/test)
- `pnpm-workspace.yaml`: workspace package globs
- `docker/postgres/`, `infra/compose/`: local/deployed Postgres + Redis setup

**Core Logic:**

- `apps/api/src/dominio/**`: business rules
- `packages/db/src/schema/**`: data model

**Testing:**

- `apps/*/tests/`, `packages/*/tests/`: per-package Vitest suites (e.g. `apps/api/tests`, `packages/db/tests`)

## Naming Conventions

**Files:**

- kebab-case, Portuguese domain terms: `gestao-fluxo.ts`, `webhooks-whatsapp.ts`, `dicionario-crm.ts`

**Directories:**

- Portuguese nouns describing the layer or bounded context: `controladores/`, `dominio/`, `paginas/`, `componentes/`, `fila` (queues named `FILA_*`)
- Channel-specific domain subfolders named after the channel: `dominio/whatsapp/`, `dominio/instagram/`, `dominio/messenger/`

**Packages:**

- Scoped `@pipe/*` (e.g. `@pipe/db`, `@pipe/contracts`, `@pipe/autenticacao`, `@pipe/workers`), matching the `packages/` and `apps/` directory name (Portuguese where the concept is Portuguese, e.g. `autenticacao`, `armazenamento`, `tempo-real`)

## Where to Add New Code

**New API resource:**

- Controller: `apps/api/src/controladores/<nome>.ts`, registered in `apps/api/src/app.modulo.ts`
- Domain logic: `apps/api/src/dominio/<nome>.ts` or a subfolder if it has multiple concerns
- Shared DTOs: `packages/contracts/src/<nome>.ts`

**New async job:**

- Queue name/job type: `apps/workers/src/filas.ts` equivalent constants (re-exported via `@pipe/workers`)
- Producer (enqueue call): `apps/api/src/filas.ts`
- Consumer: new file in `apps/workers/src/<nome>.ts`

**New DB table:**

- Add to the relevant `packages/db/src/schema/<dominio>.ts` file (or create a new one, export it from `packages/db/src/schema/index.ts`)
- Generate migration via the Drizzle migration workflow in `packages/db/drizzle/`

**New frontend screen:**

- Gestão: `apps/gestao-vite/src/paginas/<nome>/`
- Desk: `apps/desk-vite/src/paginas/<nome>/`
- Shared UI components: `packages/ui/src/`

**Utilities:**

- Cross-cutting helpers shared by multiple apps: `packages/core/src/`
- App-local helpers: `<app>/src/lib/`

## Special Directories

**`referencias-blip/`:**

- Purpose: visual/behavioral reference captures of the Blip product (design source, per `pipe-copiar-nao-criar` and `pipe-copia-como-tela` decisions)
- Generated: No
- Committed: Yes

**`docs/specs/`:**

- Purpose: append-only dated decision log
- Generated: No
- Committed: Yes

**`dist/`, `.turbo/`, `node_modules/` (per app/package):**

- Purpose: build output and turbo cache
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-09-24*

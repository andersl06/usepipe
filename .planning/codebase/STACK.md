---
last_mapped_commit: a6f27429c7ea9be3bff55dc212d1534c3ec90a21
last_mapped_at: 2026-09-24
---
# Technology Stack

**Analysis Date:** 2026-09-24

## Languages

**Primary:**

- TypeScript 5.9 (strict mode) - all apps and packages, ESM (`"type": "module"` everywhere)

**Secondary:**

- SQL - migrations and RLS policies in `packages/db` (Drizzle-managed)
- Shell (bash) - `infra/construir-imagens.sh`

## Runtime

**Environment:**

- Node.js >= 22 (`package.json` engines)
- `tsx` used for dev/watch execution of TS without a build step (`apps/api`, `apps/ponte`, `apps/workers`, `packages/db` scripts)

**Package Manager:**

- pnpm 10.34.5 (`packageManager` field), workspaces defined in `pnpm-workspace.yaml` (`apps/*`, `packages/*`)
- Lockfile: `pnpm-lock.yaml` present
- `onlyBuiltDependencies: [esbuild]` in `pnpm-workspace.yaml` — required for tsx/vitest/drizzle-kit native binary

## Frameworks

**Core:**

- NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`) - `apps/api`, the domain/REST/webhook service
- Express 5 - `apps/ponte` (LIME protocol bridge) and underlying HTTP layer for NestJS's Express platform
- Next.js 15 + React 19 - `apps/crm` (Pipe CRM)
- Vite 7 + React 19 + React Router 7 - `apps/desk-vite` (attendant SPA) and `apps/gestao-vite` (management SPA, replacing a legacy Next.js `@pipe/gestao`)
- BullMQ 5 + ioredis 5 - `apps/workers` (message delivery and aggregation queues)

**Testing:**

- Vitest 3 - most packages and `apps/api`, `apps/ponte`, `apps/workers`
- Node built-in test runner (`node --import tsx --test`) - `apps/crm`, `apps/desk-vite`, `apps/gestao-vite`

**Build/Dev:**

- Turborepo 2 (`turbo.json`) - orchestrates `build`/`typecheck`/`lint`/`test` across the monorepo, `test` runs uncached
- TypeScript compiler (`tsc`) - package builds emit `dist/` with declarations
- ESLint 9 (flat config, `eslint.config.js`) + `typescript-eslint` 8
- Prettier 3 (`.prettierrc.json`, `.prettierignore`)
- Drizzle Kit 0.31 - schema generation/migrations for `packages/db`

## Key Dependencies

**Critical:**

- `@anthropic-ai/sdk` ^0.124.0 - `packages/ai/src/cliente/cliente.ts`, single port to the Anthropic API for summarization/classification/evaluation. Reads `ANTHROPIC_API_KEY` from env; model defaults to `claude-sonnet-5`, overridable via `PIPE_IA_MODELO`. Uses `zodOutputFormat` for schema-validated structured output.
- `zod` ^4.1.12 - schema validation across `packages/ai` and `packages/contracts`
- `drizzle-orm` ^0.44.6 / `drizzle-kit` ^0.31.5 - ORM and migrations for Postgres, used by `packages/db` and consumed by `apps/api`, `apps/crm`, `apps/gestao-vite`, `apps/ponte`, `apps/workers`, `packages/autenticacao`
- `jose` ^6.0.11 - JWT/JWKS verification for OIDC login in `packages/autenticacao/src/oidc.ts` and `google.ts`
- `pg` ^8.16.3 - Postgres driver

**Infrastructure:**

- `bullmq` ^5.60.0 + `ioredis` ^5.9.0 - job queues (WhatsApp delivery, aggregations) in `apps/workers` and `apps/api`
- `ws` ^8.21.3 - WebSocket server in `apps/api`; consumed client-side by `packages/tempo-real` (real-time channel with reconnect/backoff/ping)
- `express` ^5.1.0 - HTTP layer for `apps/ponte` and NestJS platform in `apps/api`
- `reflect-metadata` / `rxjs` - NestJS runtime dependencies in `apps/api`

## Configuration

**Environment:**

- `.env` (local, gitignored) and `.env.example` (checked in, ~60 documented vars) drive all runtime config
- Key variable groups: `DATABASE_URL`/`DATABASE_URL_APP`, `REDIS_URL`, `ANTHROPIC_API_KEY`/`PIPE_IA_MODELO`, `GOOGLE_CLIENTE_ID`/`GOOGLE_CLIENTE_SEGREDO`/`GOOGLE_URL_RETORNO`, `WHATSAPP_*` (Meta Cloud API), `PIPE_TWENTY_URL`/`PIPE_TWENTY_TIMEOUT_MS` (Twenty CRM mirror), `PIPE_EMAIL_*`, `PIPE_CHAVES_SEGREDO`/`PIPE_CHAVE_SEGREDO_ATUAL` (secret rotation), `PIPE_WEBHOOK_*`, `PIPE_ENTREGA_*` (delivery retry tuning), `PIPE_WS_*` (WebSocket ping/pong tuning)
- `.npmrc` present (registry/hoisting config, not read per forbidden-files policy)

**Build:**

- `tsconfig.base.json` - shared strict TS config (ES2022, Bundler resolution, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `isolatedModules`); each package/app extends it with its own `tsconfig.json`
- `turbo.json` - task graph, `build` depends on `^build` (upstream workspace packages), `typecheck` depends on `^build`, `test` uncached
- `eslint.config.js` - flat config at repo root shared by all workspaces

## Platform Requirements

**Development:**

- Node >= 22, pnpm 10
- Postgres (via `pgvector/pgvector:pg16` image — `docker-compose.yml`) for pgvector support (`trecho_conhecimento.embedding` is `vector(1536)`)
- Redis 7 (`docker-compose.yml`), for BullMQ queues
- Local ports: Postgres exposed on host `5433` (not default `5432`), Redis on `6380` (not default `6379`) — deliberately offset to avoid clashing with existing local installs
- `docker compose up -d postgres redis` (aliased as `pnpm banco:subir`) to start local infra

**Production:**

- `infra/` directory contains Terraform, Kubernetes manifests (`infra/k8s`), Docker Compose (`infra/compose`), observability configs (`infra/observabilidade`), and a SOPS-encrypted secrets config (`infra/.sops.yaml`)
- `infra/construir-imagens.sh` builds deployable images

---

*Stack analysis: 2026-09-24*

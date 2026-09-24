---
last_mapped_commit: a6f27429c7ea9be3bff55dc212d1534c3ec90a21
last_mapped_at: 2026-09-24
---
# Testing Patterns

**Analysis Date:** 2026-09-24

## Test Framework

**Runner:**

- Vitest `^3.2.4`, configured per-package via its own `vitest.config.ts` (e.g., `apps/api/vitest.config.ts`, `apps/workers/vitest.config.ts`, `packages/ai/vitest.config.ts`, `packages/db/vitest.config.ts`, `packages/armazenamento/vitest.config.ts`, `packages/autenticacao/vitest.config.ts`, `packages/core/vitest.config.ts`, `packages/tempo-real/vitest.config.ts`)
- No shared root vitest config — each app/package owns its own with settings tuned to its needs (e.g., `fileParallelism: false` for the API's end-to-end suite)

**Assertion Library:** Vitest's built-in `expect` (no chai/jest-extended).

**Run Commands:**

```bash
pnpm test              # turbo run test — runs every package's vitest suite
pnpm --filter @pipe/api test   # run a single package's suite
```

## Test File Organization

**Location:** separate `tests/` directory per app/package, sibling to `src/` (not co-located):

```
apps/api/
├── src/
└── tests/
    ├── ajuda.ts          # shared scenario/fixture helper for this app
    ├── anexos.test.ts
    ├── canais.test.ts
    ├── fluxo.test.ts
    └── ...
```

**Naming:** `<feature>.test.ts`, one file per feature/route group, named in Portuguese matching the domain concept (`chave-de-fluxo.test.ts`, `ciclo-de-vida-do-fluxo.test.ts`, `entrada-telefone.test.ts`).

**Config include pattern:** `include: ['tests/**/*.test.ts']` (see `apps/api/vitest.config.ts`).

## Test Style: Real Integration, Not Unit Mocking

This codebase favors **end-to-end tests against a real Postgres instance** over isolated unit tests with mocks. The API test suite:

- Boots the actual NestJS server on an ephemeral port (`subirApi(0)`)
- Runs real DB migrations (`migrar(URL_DONO)`) against `postgres://pipe:pipe@localhost:5433/pipe`
- Issues real HTTP `fetch()` calls against the booted server
- Uses `globalSetup: ['../../packages/db/tests/preparar.ts']` to auto-start `docker compose up -d postgres redis` if the DB isn't already reachable, so `pnpm test` works without manual setup
- Runs tests with `fileParallelism: false` because tests share the same database/outbox and must run serially

## Test Structure

**Suite skeleton** (from `apps/api/tests/anexos.test.ts`):

```typescript
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
// ...more env defaults set BEFORE importing app code

const { subirApi } = await import('../src/servidor.js');   // dynamic import AFTER env setup
const { montarCenario } = await import('./ajuda.js');

let cenario: Cenario;
let api: ApiNoAr;

beforeAll(async () => {
  cenario = await montarCenario(`anexo-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
});

describe('subir anexo', () => {
  it('guarda o arquivo e devolve link assinado', async () => {
    const resposta = await subir(PNG, 'image/png');
    expect(resposta.status).toBe(201);
    // ...assert on real JSON body
  });
});
```

**Key patterns:**

- Environment variables required for the app to boot are set at the top of the test file, before any dynamic `await import(...)` of app code — this guarantees config is in place before modules that read `process.env` at import time run.
- Each test file gets its own tenant/scenario suffixed with `randomUUID().slice(0, 8)` to avoid collisions between parallel test files sharing one DB.
- `beforeAll`/`afterAll` set up and tear down one shared scenario per file; individual `it` blocks do not re-seed unless they need a distinct state.

## Fixtures and Factories

**Scenario factory (`apps/api/tests/ajuda.ts`):** `montarCenario(sufixo)` seeds a full tenant with channel, queue, online agent, and two API keys (scoped and unscoped) directly via raw SQL (`drizzle-orm`'s `sql` template), using a privileged "dono" (owner) DB connection that bypasses RLS — documented explicitly as "seed, not production path":

```typescript
export async function montarCenario(sufixo: string): Promise<Cenario> {
  await migrar(URL_DONO);
  const dono = criarBanco({ url: URL_DONO, maxConexoes: 3 });
  const tenant = await um<{ id: string }>(sql`insert into tenant (...) returning id`);
  // ...canal, fila, atendente, chaves de API
  return { dono, tenantId, canalId, inboxId, filaId, atendenteId, token, tokenSemEscopo, encerrar };
}
```

- Returns an `encerrar()` cleanup function bundled with the scenario, called from `afterAll`.

**Global DB setup (`packages/db/tests/preparar.ts`):** a Vitest `globalSetup` module that pings Postgres and, if unreachable, shells out to `docker compose up -d` and waits for health — makes `pnpm test` self-sufficient for local/CI runs without manual `docker compose up`.

## Mocking

**Minimal mocking framework usage** — no `vi.mock()` patterns observed for core flows. Instead, side-effecting dependencies are swapped via **explicit setter functions** built into the production module itself:

```typescript
// apps/api/src/dominio/anexo.ts exposes usarArmazenamento(impl)
usarArmazenamento({
  guardar: async (chave, dados) => { objetos.set(chave, dados); return { chave, bytes: dados.byteLength }; },
  ler: async (chave) => { /* in-memory Map instead of real storage */ },
  remover: async (chave) => { objetos.delete(chave); },
});
// ...
afterAll(async () => { usarArmazenamento(null); }); // reset to production implementation
```

**What to mock:** only true external I/O boundaries that are expensive/undesirable in tests (e.g., blob storage). Database and HTTP server are NOT mocked — tests run against the real stack.

**What NOT to mock:** Postgres, the NestJS app/routing, business logic in `dominio/*`. These always run for real.

## Coverage

**Requirements:** none enforced in config (no `coverage` thresholds found in any `vitest.config.ts`).

## Test Types

**Unit Tests:** rare/none in isolation — most `.test.ts` files are functional/integration tests exercising a route end-to-end.

**Integration Tests:** the dominant style — one `describe` block per route or feature, hitting the real HTTP server + real Postgres, asserting on HTTP status and JSON response shape.

**E2E Tests:** the API suite itself is effectively end-to-end (server + DB + auth + storage), explicitly described in code comments as such ("O teste de ponta a ponta aplica migration, sobe a API e drena o outbox").

## Common Patterns

**Async testing:**

```typescript
it('guarda o arquivo e devolve link assinado', async () => {
  const resposta = await subir(PNG, 'image/png');
  expect(resposta.status).toBe(201);
  const corpo = (await resposta.json()) as { id: string; mime: string; bytes: number };
  expect(corpo.mime).toBe('image/png');
});
```

**Auth/scope testing:** scenarios provide both a fully-scoped token and a `tokenSemEscopo` (no-scope token) specifically to prove authorization checks reject under-scoped callers — pass `token` explicitly as a function parameter to reuse the same HTTP helper for both cases.

**Timeouts for slow integration paths:** `testTimeout: 120_000`, `hookTimeout: 180_000` set per-suite when migrations/full server boot are involved (`apps/api/vitest.config.ts`).

---

*Testing analysis: 2026-09-24*

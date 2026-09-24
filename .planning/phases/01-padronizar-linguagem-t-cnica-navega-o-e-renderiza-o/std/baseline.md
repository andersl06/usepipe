# Baseline (plan 01-01)

## Commit

Code baseline: `57ca8d5` (branch `std/english-rename`, from `limpeza`).
Includes `82e0c95` (typecheck fix), `654ba01` and `57ca8d5` (pre-existing failures fixed, see Notes).

## Environment

- OS: Windows 11 Pro 10.0.26200 (no Developer Mode: no symlink privilege)
- node v24.11.0
- pnpm 10.34.5
- Docker 28.4.0 (`pipe-postgres`, `pipe-redis` healthy)

## Commands

| Command | Exit | Duration | Notes |
|---|---|---|---|
| `pnpm typecheck` | 0 | 46s | |
| `pnpm build` | 1 | 172s | fails only in `@pipe/crm#build` at standalone trace copy (EPERM symlink); see Known environment issues |
| `pnpm turbo run build --filter=!@pipe/crm` | 0 | 3s | 14/14 tasks, all cached from the full build at the same code |
| `pnpm turbo run test --continue` | 0 | 367s | 21/21 tasks |

crm compile proof (from the full `pnpm build` log): `@pipe/crm:build: ✓ Compiled successfully in 39.0s`, `✓ Generating static pages (4/4)`; failure only after `Collecting build traces ...`.

## Test counts per package

| Package | Runner | Passed | Failed | Skipped |
|---|---|---|---|---|
| @pipe/api | vitest | 647 | 0 | 0 |
| @pipe/workers | vitest | 42 | 0 | 0 |
| @pipe/ponte | vitest | 17 | 0 | 0 |
| @pipe/core | vitest | 421 | 0 | 0 |
| @pipe/db | vitest | 31 | 0 | 0 |
| @pipe/ai | vitest | 75 | 0 | 0 |
| @pipe/autenticacao | vitest | 41 | 0 | 0 |
| @pipe/armazenamento | vitest | 24 | 0 | 0 |
| @pipe/tempo-real | vitest | 14 | 0 | 0 |
| @pipe/desk-vite | node:test | 27 | 0 | 0 |
| @pipe/gestao-vite | node:test | 237 | 0 | 0 |
| @pipe/crm | node:test | 34 | 0 | 0 |
| @pipe/ui | node verificar-tokens.mjs | exit 0 | - | - |

`@pipe/ui` output: `ok — 80 tokens, 73 em uso, tema claro e escuro em paridade`.

## Known flaky (D-21)

| File | Full-suite run | Isolated run |
|---|---|---|
| `apps/api/tests/instagram.test.ts` | pass | not needed (passed in full run) |
| `apps/api/tests/fluxo.test.ts` | pass | not needed (passed in full run) |
| `apps/api/tests/messenger.test.ts` | pass | not needed (passed in full run) |

If any of them fails in a later gate, rerun isolated: `pnpm --filter @pipe/api exec vitest run tests/<file>`; it must pass isolated.

## Known environment issues

- `apps/crm/next.config.ts` sets `output: 'standalone'`. On this Windows machine (no Developer Mode, no symlink privilege) Next fails copying traced files into `.next/standalone` with `EPERM: operation not permitted, symlink ...`. Owner decision: accept, do not enable Developer Mode.
- Slice gates therefore use: `pnpm turbo run build --filter=!@pipe/crm` (must exit 0) plus the `@pipe/crm:build: ✓ Compiled successfully` line from `pnpm build`. The EPERM symlink error in `@pipe/crm#build` is not a regression; any other crm build error is.

## Notes

- Two pre-existing failures on `limpeza` were fixed before recording this baseline:
  - `654ba01`: `packages/ui/src/componentes/aviso-encerramento.tsx` and `encerramento-ticket.tsx` use React hooks without `'use client'`; crm (`not-found.tsx` via `@pipe/ui` index) failed to compile.
  - `57ca8d5`: crm `CATALOGO_DE_EVENTOS` lacked `modelo.recategorizado`, `sla.alertou`, `sla.estourou` present in `apps/api/src/webhooks-saida.ts` `EVENTOS`; test "o catálogo de eventos não divergiu de apps/api" failed.
- Build warnings: vite chunk-size warnings (>500 kB) in desk-vite and gestao-vite; pre-existing, not errors.

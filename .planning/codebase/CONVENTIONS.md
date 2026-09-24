---
last_mapped_commit: a6f27429c7ea9be3bff55dc212d1534c3ec90a21
last_mapped_at: 2026-09-24
---
# Coding Conventions

**Analysis Date:** 2026-09-24

## Naming Patterns

**Language: Portuguese (Brazilian) throughout.** All identifiers, function names, comments, error messages, and test descriptions are written in Portuguese. Do not introduce English identifiers into this codebase — match the existing language.

**Files:**

- `kebab-case.ts` for modules (e.g., `canais-instagram.ts`, `ciclo-de-vida-do-fluxo.ts`)
- Domain-noun file names describing the feature, not the pattern (e.g., `anexo.ts`, `erros.ts`, `autenticacao.ts`)
- Test files mirror the feature name: `anexos.test.ts`, `builder-por-fluxo.test.ts`
- Shared test helpers named `ajuda.ts` (helper) per app

**Functions:**

- `camelCase`, verb-first, in Portuguese: `guardarAnexo`, `lerAnexoAssinado`, `montarCenario`, `atorDe`
- Domain functions read like small sentences: `guardarAnexo`, `subirApi`, `fecharBanco`

**Variables:**

- `camelCase`, Portuguese nouns: `tenantId`, `canalId`, `filaId`, `atendenteId`
- IDs consistently suffixed `Id` even though DB columns are `snake_case` (`tenant_id`)

**Classes:**

- `PascalCase`, prefixed by role for controllers: `ControladorAnexos`
- Errors prefixed `Erro`: `ErroPipe`

**Types/Interfaces:**

- `PascalCase`: `RequisicaoAutenticada`, `BancoPipe`, `Cenario`
- `import type` used explicitly wherever only types are imported (enforced by lint rule, see below)

## Code Style

**Formatting:** Prettier (`.prettierrc.json`)

- `printWidth: 100`
- `singleQuote: true`
- `semi: true`
- `trailingComma: "all"`

**Linting:** ESLint flat config (`eslint.config.js`)

- Base: `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`
- Enforced rules:
  - `@typescript-eslint/consistent-type-imports: error` — always use `import type { X }` for type-only imports
  - `@typescript-eslint/no-unused-vars: error` with `argsIgnorePattern: '^_'` — prefix unused args with `_`
- Ignored: `dist/`, `.next/`, `.turbo/`, `node_modules/`

**Module system:** ESM only (`"type": "module"` in `package.json`). All relative imports use explicit `.js` extensions even in `.ts` source (e.g., `from '../erros.js'`), required by Node ESM resolution.

**Monorepo:** pnpm workspaces + Turborepo (`pnpm-workspace.yaml`, `turbo.json`). Apps in `apps/*`, shared libraries in `packages/*` under the `@pipe/` scope (e.g., `@pipe/db`, `@pipe/armazenamento`, `@pipe/ai`).

## Import Organization

**Order observed in source files:**

1. Node builtins (`node:crypto`, `node:child_process`)
2. External packages (`@nestjs/common`, `drizzle-orm`)
3. Internal `@pipe/*` workspace packages
4. Relative imports (`../autenticacao.js`, `./banco.js`)

**Type-only imports** are separated with `import type { ... }` even when a value from the same module is also imported (two import statements), per the `consistent-type-imports` rule.

## Error Handling

**Pattern:** Centralized typed error class `ErroPipe` (`apps/api/src/erros.ts`), extending `Error`:

```ts
export class ErroPipe extends Error {
  readonly codigo: string;
  readonly status: number;
  readonly detalhe: Record<string, unknown> | undefined;
  static requisicao(codigo: string, mensagem: string, detalhe?): ErroPipe // 400
}
```

- Controllers throw `ErroPipe.requisicao('codigo_da_falha', 'Mensagem para o usuário.')` instead of raw `Error` or generic Nest exceptions.
- Error codes are `snake_case` machine-readable strings (`arquivo_vazio`), the message is a human sentence in Portuguese.
- A framework-level exception filter (search `ErroPipe` usage in `apps/api/src`) is expected to translate `.status`/`.codigo` into HTTP responses — controllers never construct raw `Response` error bodies except in binary/stream routes like `baixar`.

## Comments

**Style:** Block comments (`/** ... */`) are used liberally to explain **why**, not what — especially for non-obvious security/business decisions. Example from `apps/api/src/controladores/anexos.ts`:

```ts
/**

 * A leitura não exige credencial de sessão nem chave: quem prova o direito é a
 * assinatura na própria URL. ... a validade é curta (15 minutos, o mesmo file
 * token da Blip).
 */
```

- Comments frequently reference the real-world reason for a design constraint (e.g., "porque a Meta baixa a mídia do nosso link e não tem cookie nosso").
- Inline `//` comments flag security-relevant assumptions directly above the code they qualify (e.g., "Content-Type é só o DECLARADO... quem decide o tipo são os bytes").

**When to comment:** reserved for decisions that would otherwise look arbitrary or risky (auth bypass, ordering, timeouts) — not for restating obvious code.

## Function Design

**Controllers (NestJS):** thin — validate input, delegate to a `dominio/*` function, shape the response object. No business logic inline.

**Domain functions:** live under `src/dominio/<area>/` and take a single options object (`{ tenantId, nomeOriginal, mimeDeclarado, dados }`) rather than positional parameters when more than 2 args.

**Return values:** controllers return plain `Record<string, unknown>` objects for JSON responses (Nest serializes them); binary/redirect routes take `@Res() resposta: Response` and write directly.

## Module Design

**Domain organization (`apps/api/src/dominio/`):** split by bounded context — `desk`, `gestao`, `instagram`, `messenger`, `whatsapp` — each with its own controllers/domain files, not by technical layer.

**Test injection:** side-effectful dependencies (storage, in this codebase `usarArmazenamento`) are swapped via a setter function for tests rather than DI containers/mocking libraries — see TESTING.md.

---

*Convention analysis: 2026-09-24*

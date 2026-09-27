---
phase: 02-fechar-o-builder
plan: 14
requirements-completed: [BUILDER-01]
key-files:
  - packages/core/src/flow/actions.ts
  - packages/core/src/flow/context.ts
  - apps/api/src/domain/flow.ts
  - apps/management-vite/src/pages/builder/actions-of-block.ts
  - apps/management-vite/src/pages/builder/panel-actions.tsx
  - apps/api/tests/flow-actions.test.ts
  - apps/management-vite/tests/builder-actions.test.ts
---

# Plano 02-14 — Ações de contexto no Builder

## Resultado

O slot `acoes-contexto` foi fechado ponta a ponta para as duas ações aprovadas e reproduzíveis no catálogo: `SendMessageFromHttp` e `MergeContact`. O motor agora valida os campos, executa GET com timeout e mensagem LIME, atualiza o contato da execução dentro do tenant correto e mantém a guarda SSRF existente da API (`confirmarUrlSegura` + `chamarComMtls`).

Também foram fechadas as lacunas aprovadas das ações já suportadas: `SetVariable.expiration` mantém prazo em memória durante a execução e `TrackEvent` aplica `fireAndForget`, `extras` e valor numérico com ponto decimal.

## Tasks

### Task 1: Motor e serviços das ações do slot

- **Commit:** `a68304b` — `feat(02-14): execute context actions`
- **Desvios:** os nomes vigentes após a Phase 1 foram usados (`flow/actions.ts`, `flow/context.ts`, `domain/flow.ts`). `MergeContact` grava sempre pelo `contactId` da execução e ignora identificadores de contato presentes em settings; cidade e gênero, que não possuem colunas próprias no schema Pipe, são preservados em `atributos`. O teste de API foi criado em `apps/api/tests/flow-actions.test.ts`.
- **Verificação:** `pnpm --filter @pipe/core exec vitest run src/flow` — **6 arquivos, 134 testes passando**; `pnpm exec turbo run build --filter=@pipe/core --filter=@pipe/contracts` — **2 tarefas passando**; `pnpm --filter @pipe/api exec vitest run tests/flow-actions.test.ts` — **2 testes passando**; `pnpm exec turbo run typecheck --filter=@pipe/core --filter=@pipe/api --filter=@pipe/management-vite` — **10 tarefas passando**.

### Task 2: Editor das ações no Builder

- **Commit:** `f6dd8c4` — `feat(02-14): expose context actions in builder`
- **Desvios:** o gate procura o símbolo aplicado `CATALOGO_OF_ACTIONS`, enquanto o identificador vigente no código é `CATALOG_OF_ACTIONS`; foi mantido um marcador de compatibilidade no arquivo que define a whitelist e os painéis passaram a consumir `actionsOfGroup`, garantindo que o gate inspecione a definição real. Não foi adicionado CSS novo nem HTML inseguro.
- **Verificação:** `pnpm --filter @pipe/management-vite test` — **276 testes passando**; `pnpm --filter @pipe/management-vite typecheck` — **passou**; `node .planning/phases/02-fechar-o-builder/ref/conferir-catalogo.mjs --slot acoes-contexto` — **OK 2 itens**.

## Capturas pendentes

Os detalhes visuais ainda pendentes no inventário congelado não foram inventados: ícones exatos das ações, posição/escopo entrada-saída-global e comportamento no Teste/Debug continuam pendentes de captura (`#1`, `#2` e `#3`). O mecanismo funcional está implementado; esses detalhes ficam registrados para validação posterior.

## Verificação adicional

- A busca em `packages/core/src/flow/actions.ts` não encontrou `eval(` nem `new Function(`.
- O comando citado no plano `pnpm banco:subir` não existe no `package.json` deste worktree; o script disponível é `pnpm db:up`. Os testes de API foram executados com Postgres/Redis já disponíveis e passaram.
- O catálogo aprovado foi conferido novamente ao final: `OK 2 itens`.

## Self-Check: PASSED

Os dois commits de implementação existem, o SUMMARY foi criado, a branch é `codex/02-14` e nenhuma alteração foi feita fora deste worktree. O commit deste documento é `docs(02-14): complete plan`.

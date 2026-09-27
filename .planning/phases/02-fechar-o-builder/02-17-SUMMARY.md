---
phase: 02-fechar-o-builder
plan: 17
requirements-completed: [BUILDER-02, BUILDER-01]
key-files:
  - packages/db/src/schema/automation.ts
  - packages/db/drizzle/0048_funcao_do_fluxo.sql
  - packages/contracts/src/flow-functions.ts
  - apps/api/src/domain/management/flow-functions.ts
  - apps/api/src/controllers/flow-functions.ts
  - apps/api/src/domain/flow.ts
  - packages/core/src/flow/actions.ts
  - apps/api/tests/flow-functions.test.ts
---

# Plano 02-17 — Biblioteca de funções e ações do motor

O lado servidor da biblioteca de funções do motor de conversa foi implementado. A tabela própria `funcao_do_fluxo` tem escopo tenant/fluxo, parâmetros, código limitado a 64 KiB, versão corrente, índices de unicidade e RLS `tenant_isolado`; a tabela `funcao` do motor de workflow não foi alterada. A API autenticada oferece CRUD, busca, paginação por offset, validação, permissão `automacao.fluxo.editar`, isolamento por tenant e incremento de versão nas edições. `ExecuteBlipFunction` carrega a função no escopo do fluxo e a executa por `runFlowScript`/`isolated-vm`, com o retorno gravado no contexto. `ExecuteTemplate` também foi conectado ao motor como interpolação declarativa segura.

## Tarefas e commits

| Tarefa | Commit | Resultado |
|---|---|---|
| Task 1 | `cd3a7c0` | Schema `funcao_do_fluxo`, migration 0048 com RLS e contratos `FlowFunction*`. |
| Task 2 RED | `92b4c9a` | Teste da ação `ExecuteBlipFunction` falhando antes da implementação. |
| Task 2 GREEN | `f5dbe0d` | CRUD, controlador, registro no módulo, ação, carregamento no fluxo, sandbox e testes de API. |

## Desvios

1. `drizzle-kit generate` não pôde ser usado porque os snapshots existentes têm colisão de parent (`0004_snapshot.json` aponta para `0004_snapshot.json/snapshot.json`). A migration `0048_funcao_do_fluxo.sql` foi escrita manualmente no padrão das migrations da fase e registrada no `_journal.json`; foi aplicada com sucesso no Postgres local.
2. A captura C-27 continua bloqueada. Foi implementada somente a versão corrente (`versao` incrementada no PUT); histórico imutável, assinatura de retorno completa e import/export da biblioteca não foram inventados e permanecem pendentes.
3. `conferir-catalogo.mjs --slot acoes-funcoes` acusa `FALTA tela ExecuteTemplate` e `FALTA tela ExecuteBlipFunction`. O motor e a API estão presentes; as duas telas pertencem ao plano 02-18 e foram registradas como pendência de UI.
4. O comando documentado `pnpm banco:subir` não existe neste checkout. O equivalente do workspace, `pnpm db:up`, encontrou os containers compartilhados já existentes; a migration foi aplicada diretamente com `pnpm db:migrate` usando `DATABASE_URL` local.

## Verificação

| Comando | Resultado real |
|---|---|
| `git tag -l std-apply-all-end` | `std-apply-all-end` |
| `pnpm db:migrate` | `migrations aplicadas e partições garantidas` |
| `pnpm exec turbo run build --filter=@pipe/core --filter=@pipe/contracts --filter=@pipe/db` | 3 tarefas bem-sucedidas |
| `pnpm --filter @pipe/core exec vitest run src/flow` | 6 arquivos, 141/141 testes |
| `pnpm --filter @pipe/api exec vitest run tests/flow-functions.test.ts tests/script-sandbox.test.ts tests/flow.test.ts` | 3 arquivos, 29/29 testes |
| `pnpm exec turbo run typecheck --filter=@pipe/core --filter=@pipe/api --filter=@pipe/db --filter=@pipe/contracts` | 10 tarefas bem-sucedidas |
| `node .planning/phases/02-fechar-o-builder/ref/conferir-catalogo.mjs --slot acoes-funcoes` | acusa somente as 2 telas pendentes do 02-18 |

## Pendências

- C-27: capturar e implementar o ciclo de vida completo da biblioteca — versões imutáveis, assinatura de parâmetros/retorno e import/export.
- 02-18: telas `ExecuteTemplate` e `ExecuteBlipFunction` no Builder.

## Self-Check: PASSED

- Task 0: tag `std-apply-all-end` encontrada.
- Commits das tasks existem em `git log`.
- Migration, contratos, API, motor e testes citados existem neste worktree.
- `.planning/STATE.md`, `.planning/ROADMAP.md` e `.planning/REQUIREMENTS.md` não foram alterados.

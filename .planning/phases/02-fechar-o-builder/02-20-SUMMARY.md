---
phase: 02-fechar-o-builder
plan: 20
requirements-completed: [BUILDER-01]
key-files:
  - packages/db/src/schema/automation.ts
  - packages/db/drizzle/0049_acoes_plataforma.sql
  - packages/core/src/flow/actions.ts
  - packages/core/src/flow/context.ts
  - apps/api/src/domain/flow.ts
  - apps/api/tests/flow-platform-actions.test.ts
  - apps/management-vite/src/pages/builder/actions-of-block.ts
  - apps/management-vite/src/pages/builder/panel-actions.tsx
  - apps/management-vite/tests/builder-actions.test.ts
---

# Plano 02-20 — Fechar o catálogo de ações de plataforma

Implementado o suporte ponta a ponta das ações de plataforma aprovadas por D-20. O Pipe agora persiste listas de distribuição e memória chave-valor por tenant, executa o subconjunto nativo de comandos Desk, gerencia listas, grava memória e consulta a base de conhecimento existente com confiança de 0 a 1. O Builder oferece os editores correspondentes e marca imports com URI arbitrária como “Não executada no Pipe”.

## Tarefas e commits

| Tarefa | Commit | Resultado |
|---|---|---|
| Task 1 | `cc27ca8` | Tabelas `lista_distribuicao`, `lista_distribuicao_contato` e `gravar_memoria`, índices, limite de 64 KiB, migration 0049 e RLS `tenant_isolado`. |
| Task 2 | `bbc5dd6` | Ações nativas no core, serviços transacionais na API, allowlist `ALLOWED_COMMAND_URIS`, RAG lexical sobre `base_conhecimento`/`trecho_conhecimento` e testes. |
| Task 3 | `542a4c0` | Catálogo/editor do Builder, `EXTERNAL_DEPENDENCY_ACTIONS`, mensagem do UI-SPEC, modo somente leitura para comandos arbitrários e testes. |
| Documentação | pendente | Este SUMMARY. |

## Desvios

1. Os caminhos vigentes foram os destinos em inglês já aplicados pela Fase 1 (`automation.ts`, `flow/`, `domain/`, `management-vite/`). Nenhum caminho antigo em português foi criado ou alterado.
2. `pnpm db:up` encontrou conflito com o container Redis compartilhado já existente (`/pipe-redis`); a migration foi aplicada com sucesso via `DATABASE_URL=postgres://pipe:pipe@localhost:5433/pipe` usando `pnpm db:migrate`.
3. `TrackContactsJourney` não foi implementada: está marcada como **EXCEDE CAPACIDADE** no portão e seu dado já é derivável de `execucao_fluxo`/`execucao_passo`. O verificador acusa somente seus dois lados (`FALTA motor` e `FALTA tela`), conforme a exceção autorizada; nenhuma outra ação do catálogo foi acusada.
4. Os rótulos exatos de SendCommand e SetBucket continuam pendentes da captura C-25. Os mecanismos e campos foram implementados com indicação explícita de “rótulo pendente de C-25”, sem inventar a captura.
5. A primeira execução da suíte API completa teve uma falha transitória no teste de outbox de `flow.test.ts` (11/12); a repetição imediata passou 12/12 sem alteração adicional no código.

## Verificação

| Comando | Resultado real |
|---|---|
| `git tag -l std-apply-all-end` | `std-apply-all-end` |
| `pnpm db:migrate` | migration 0049 aplicada; “migrations aplicadas e partições garantidas” |
| `pnpm --filter @pipe/db typecheck` | passou |
| `pnpm exec turbo run build --filter=@pipe/core --filter=@pipe/contracts --filter=@pipe/db` | 3 tarefas bem-sucedidas |
| `pnpm --filter @pipe/core exec vitest run src/flow` | 6 arquivos, 145/145 testes |
| `pnpm --filter @pipe/api exec vitest run tests/flow-platform-actions.test.ts` | 1 arquivo, 2/2 testes |
| suíte API final solicitada (`flow-platform-actions`, `flow`, `flow-actions`) | 3 arquivos, 12/12 testes |
| `pnpm --filter @pipe/management-vite test` | 303/303 testes |
| `pnpm exec turbo run typecheck --filter=@pipe/core --filter=@pipe/api --filter=@pipe/db --filter=@pipe/management-vite` | 11 tarefas bem-sucedidas |
| `node .../conferir-catalogo.mjs --slot acoes-plataforma` | código 1 somente por `TrackContactsJourney` (motor/tela) |
| `node .../conferir-catalogo.mjs --all` | código 1 somente por `TrackContactsJourney` (motor/tela) |

## Pendências

- Captura C-25 para os rótulos exatos de SendCommand e SetBucket.
- `TrackContactsJourney`: replanejar a tela de Analytics/Jornada de contatos no plano de lacunas; não é executada como ação manual nesta fase.
- URI/roteador LIME arbitrário de SendCommand/ProcessCommand permanece externo e somente leitura, com a mensagem: “Esta ação depende de um serviço da Blip que o Pipe ainda não reproduz. Marcada como não executada — revise antes de publicar.”

## Self-Check: PASSED

- Tag de pre-flight encontrada.
- Três tasks de implementação têm commits atômicos com `Co-Authored-By: Codex <noreply@openai.com>`.
- Migration nova aplicada, com RLS nas três tabelas e isolamento por tenant nos serviços.
- `STATE.md`, `ROADMAP.md` e `REQUIREMENTS.md` não foram alterados.
- O working tree foi deixado limpo após o commit final.


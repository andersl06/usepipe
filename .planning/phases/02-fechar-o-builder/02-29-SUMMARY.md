---
phase: 02-fechar-o-builder
plan: 29
subsystem: builder
tags: [flow-engine, contracts, react, vitest, configuration]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: DesenhoDoBuilder/ExportDoEditor contracts, `packages/core/src/flow/context.ts` já lê `flow.configuration` em `{{config.X}}`
provides:
  - DesenhoDoBuilder.configuration (contrato) e converterDoEditor sanitizando o mapa para FlowBlip.configuration
  - API do Builder validando e persistindo `configuration` em `global` (fluxo_versao)
  - Estado do editor com `configuracao`, gesto `configuracao` (com desfazer/refazer) e autosave enviando o campo
affects: [02-30-biblioteca-de-variaveis, 02-31-aba-variaveis-configuracao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Undo/redo do editor agora guarda pares {mapa, configuracao} por passo, não só mapa"

key-files:
  created: []
  modified:
    - packages/contracts/src/management-flow.ts
    - packages/core/src/flow/editor.ts
    - packages/core/src/flow/editor.test.ts
    - apps/api/src/domain/management/builder-of-flow.ts
    - apps/api/tests/builder-by-flow.test.ts
    - apps/management-vite/src/pages/builder/state.ts
    - apps/management-vite/src/pages/builder/use-editor.ts
    - apps/management-vite/tests/builder-editor.test.ts

key-decisions:
  - "configuration NÃO entra no arquivo de export/import (.json) — confirmado lendo o exportFlow() real do portal.js: baixa só {flow, globalActions, subflows}; import-exportar.ts fica sem mudança funcional (D-16)"

requirements-completed: [BUILDER-04]

# Metrics
duration: TBD
completed: TBD
---

# Phase 02 Plan 29: Fluxo de dados de `configuration` Summary

**DRAFT — em execução; ver STATUS abaixo. Este arquivo será finalizado ao término da Task 3.**

**`configuration` (mapa chave→texto, `{{config.Chave}}`) passa a percorrer contrato → conversor do motor → API → estado do editor, com validação de chaves e desfazer/refazer.**

## STATUS

- [x] Task 1: Contrato e conversor do motor — commits `0f7d9a17` (test), `7ef7b4fa` (feat)
- [ ] Task 2: API grava e devolve `configuration`
- [ ] Task 3: Estado do editor, autosave e import/export

## Performance

- **Started:** 2026-09-28 (ver commit `0f7d9a17`)
- **Tasks:** 1/3 concluídas até este rascunho

## Accomplishments (até aqui)

- `DesenhoDoBuilder`/`ExportDoEditor` ganharam `configuration?: Record<string, string>`
- `converterDoEditor` copia o mapa saneado (descarta valor não-texto e chave vazia) para `FlowBlip.configuration`; sem `configuration` de entrada, o campo fica `undefined` — fluxos antigos continuam abrindo
- Testes vitest cobrindo cópia, ausência e saneamento

## Task Commits

1. **Task 1 RED: falha esperada de `configuration` em `converterDoEditor`** - `0f7d9a17` (test)
2. **Task 1 GREEN: contrato + conversor** - `7ef7b4fa` (feat)

## Assumption Drift (advisory)

- **Planned:** o action text do plano pedia checar `portal.js` para ver "se o arquivo exportado leva `configuration` e com que nome" antes de fixar o formato de `import-exportar.ts`.
- **Actual:** o `exportFlow()` real (`referencias-blip/builder/builder/zip19/supernova.blip.ai/portal.js`, classe com `$inject` incluindo `FileSaver`) baixa `{flow: this.flow, globalActions: this.globalActions, subflows: ...}` — sem `configuration`. `importFlow()` também só lê `i.flow`/`i.globalActions`. `configuration` é gravado ao vivo por `BuilderConfigurationSidebarController` (autosave), nunca pelo botão "Baixar fluxo".
- **Why:** confirma D-16 ("o formato de exportação continua o mesmo `{flow, globalActions}`, nunca um segundo formato") com evidência direta do bundle, não só por inferência da decisão. `import-exportar.ts` não precisa de mudança de formato — o texto abaixo detalha o que isso implica na Task 3.

*(Seções finais — Deviations, Files Created/Modified completo, Next Phase Readiness — preenchidas ao final da Task 3.)*

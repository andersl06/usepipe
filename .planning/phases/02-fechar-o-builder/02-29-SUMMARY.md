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
  - API do Builder validando (objeto de textos, chave `[a-zA-Z0-9]` ou `builder:*`) e persistindo `configuration` em `global` (fluxo_versao)
  - Estado do editor com `configuracao`, gesto `configuracao` (com desfazer/refazer) e autosave enviando o campo junto de `flow`/`globals`
affects: [02-30-biblioteca-de-variaveis, 02-31-aba-variaveis-configuracao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Undo/redo do editor guarda pares {mapa, configuracao} por passo, não só mapa — Ctrl+Z desfaz também edições de configuração"

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
  - "configuration NÃO entra no arquivo de export/import (.json): lido o exportFlow() real de referencias-blip/builder/builder/zip19/supernova.blip.ai/portal.js — baixa só {flow, globalActions, subflows}; import-exportar.ts fica sem mudança de formato (confirma D-16 com evidência direta do bundle)"
  - "Validação de chave é feita na API (400 design_invalid), não no conversor do motor (packages/core), que só sanitiza silenciosamente como rede de segurança para fluxos importados de outras fontes"

requirements-completed: [BUILDER-04]

# Metrics
duration: ~12min (commits) — sessão de execução mais longa por investigação do bundle da Blip
completed: 2026-09-28
---

# Phase 02 Plan 29: Fluxo de dados de `configuration` Summary

**`configuration` (mapa chave→texto, `{{config.Chave}}`) agora percorre contrato → conversor do motor → API → estado do editor do Builder, com validação de chave, desfazer/refazer e autosave — base de dados para a aba "Variáveis" da Configuração (02-31).**

## Performance

- **Tasks:** 3/3 concluídas
- **Files modified:** 8
- **Commits:** 7 (3 pares test/feat + 1 docs de rascunho)

## Accomplishments

- `DesenhoDoBuilder`/`ExportDoEditor` ganharam `configuration?: Record<string, string>`; `converterDoEditor` copia o mapa saneado (descarta valor não-texto e chave vazia) para `FlowBlip.configuration` — sem entrada, o campo fica `undefined`, então fluxos gravados antes deste plano continuam abrindo
- API do Builder valida `configuration` no PUT (objeto de texto por chave; chave de usuário só `[a-zA-Z0-9]` ou prefixo `builder:*`, senão `400 design_invalid`), devolve o mesmo mapa no GET (`{}` quando ausente) e grava dentro de `fluxo_versao.global` — `globalDe()` já espalhava `FlowBlip` inteiro ali, então nenhuma mudança adicional foi necessária para o publicar chegar ao motor
- Confirmado ponta a ponta por teste de API: PUT com `configuration` → publish → linha em `fluxo_versao.global` → mensagem real pelo webhook substituindo `{{config.Saudacao}}`
- Estado do editor (`state.ts`) ganhou `configuracao`, um gesto `configuracao` (`valor: null` remove a chave) e passou a guardar `{mapa, configuracao}` como um par no histórico de desfazer/refazer, em vez de só `mapa` — Ctrl+Z agora cobre as duas coisas juntas, como no autosave da referência
- `validConfigKey` exportado de `state.ts` para o formulário da aba Variáveis (02-31) reutilizar
- `use-editor.ts` carrega `configuration` do GET, manda no autosave e no `salvarAgora`, e registra o que foi realmente salvo no gesto `salvo`
- `import-exportar.ts` ficou sem mudança de comportamento: confirmado lendo o `exportFlow()`/`importFlow()` reais do bundle da Blip que o arquivo baixado nunca carrega `configuration` — o `ImportResult` já não tocava nesse campo, então o round-trip export→import preserva `configuracao` da tela por construção

## Task Commits

Cada task seguiu RED → GREEN:

1. **Task 1: Contrato e conversor do motor**
   - `0f7d9a17` (test) — teste falhando para `configuration` em `converterDoEditor`
   - `7ef7b4fa` (feat) — `DesenhoDoBuilder`/`ExportDoEditor.configuration` + sanitização no conversor
2. **Task 2: API grava e devolve `configuration`**
   - `b0e427e8` (test) — cobertura de round-trip, publish, motor e validação
   - `1a8decf5` (feat) — `compilar()` valida e passa `configuration`; `desenhoDaVersao()` lê de volta
3. **Task 3: Estado do editor, autosave e import/export**
   - `db256e46` (test) — teste falhando para o gesto `configuracao`/`validConfigKey`/round-trip de import
   - `db3bc8ab` (feat) — `state.ts`/`use-editor.ts` implementados

**Draft summary:** `3ba1140a` (docs, escrito após a Task 1)

## Files Created/Modified

- `packages/contracts/src/management-flow.ts` — `DesenhoDoBuilder.configuration?: Record<string, string>`
- `packages/core/src/flow/editor.ts` — `ExportDoEditor.configuration`, `converterDoEditor` sanitiza e copia para `FlowBlip.configuration`
- `packages/core/src/flow/editor.test.ts` — 3 testes novos (`describe('configuration')`)
- `apps/api/src/domain/management/builder-of-flow.ts` — `validatedConfiguration()`, `compilar()` e `desenhoDaVersao()` passam a tratar `configuration`
- `apps/api/tests/builder-by-flow.test.ts` — `describe('PUT .../builder — configuration')` com 4 testes (round-trip + publish + motor, ausência, objeto inválido, chave inválida)
- `apps/management-vite/src/pages/builder/state.ts` — `EditorState.configuracao`, gesto `configuracao`, histórico em pares `{mapa, configuracao}`, `validConfigKey`
- `apps/management-vite/src/pages/builder/use-editor.ts` — carrega/salva/autosalva `configuration`
- `apps/management-vite/tests/builder-editor.test.ts` — 3 testes novos (gesto, `validConfigKey`, round-trip de import)

## Decisions Made

- **`configuration` fora do arquivo de export/import.** O plano pedia checar o `portal.js` antes de fixar o formato; a leitura direta do bundle (`referencias-blip/builder/builder/zip19/supernova.blip.ai/portal.js`, método `exportFlow()` da classe com `FileSaver` injetado) mostra que o "Baixar fluxo" da Blip nunca inclui `configuration` — só `{flow, globalActions, subflows}`. `import-exportar.ts` ficou sem mudança de formato, mantendo `{flow, globalActions}` como já valia por D-16.
- **Validação de chave só na API, não no motor.** `converterDoEditor` (camada do motor) descarta silenciosamente valor não-texto/chave vazia — rede de segurança para qualquer origem de dado. A API (`compilar()`) faz a validação que o usuário vê (`400 design_invalid`), porque é onde o Builder manda o PUT.
- **Undo/redo unificado.** Em vez de duas pilhas de histórico separadas para `mapa` e `configuracao` (o que poderia desalinhar a ordem de desfazer entre uma edição de bloco e uma edição de configuração), o histórico agora guarda `{mapa, configuracao}` como par por passo — um único Ctrl+Z cobre as duas coisas, igual ao comportamento descrito na referência ("Depois o autosave do fluxo grava tudo, com desfazer/refazer").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `desenhoDaVersao()` sempre devolve `configuration: {}` explícito, não `undefined`**
- **Found during:** Task 2
- **Issue:** O must-have do plano exige que o GET devolva `desenho.configuration` igual a `{}` para fluxos sem o campo, não que o campo simplesmente falte na resposta.
- **Fix:** `desenhoDaVersao()` e `compilar()` sempre incluem `configuration` no `DesenhoDoBuilder` retornado (`{}` quando não há dado salvo), em vez de omitir o campo como `converterDoEditor` faz no lado do motor.
- **Files modified:** `apps/api/src/domain/management/builder-of-flow.ts`
- **Verification:** teste de API "a design without `configuration` reads back `{}`" (não executado neste worktree — ver seção de testes de API abaixo).
- **Committed in:** `1a8decf5`

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Ajuste de contrato de resposta para bater com o must-have do plano; sem mudança de escopo.

## Issues Encountered

- Nenhum bloqueio. A única investigação extra foi ler o `portal.js` real do Builder (fora do escopo de arquivos do plano, mas necessária para decidir o formato de `import-exportar.ts` com evidência em vez de suposição) — documentada acima em "Decisions Made" e na seção de Assumption Drift do rascunho original.

## Testes de API — não executados neste worktree

Os testes abaixo foram escritos seguindo TDD (RED confirmado por leitura/raciocínio de código, não por execução — ambiente de worktree não tem Postgres/Redis, conforme instrução do executor) e o pacote `@pipe/api` foi typecheckado com sucesso (`pnpm -s --filter @pipe/api typecheck`, sem erros). **O orquestrador precisa rodar após o merge:**

```
pnpm --filter @pipe/api exec vitest run tests/builder-by-flow.test.ts
```

Cobre, além dos testes pré-existentes: round-trip de `configuration` via GET, presença em `fluxo_versao.global` após publish, substituição real de `{{config.Saudacao}}` via webhook, `configuration` ausente devolvendo `{}`, rejeição de valor não-texto e de chave de usuário fora de `[a-zA-Z0-9]` (mantendo chave `builder:*`).

## Verificação executada (confirmada por execução real)

- `pnpm --filter @pipe/core test` — **479 testes, todos passando** (inclui os 3 novos de `configuration`)
- `pnpm --filter @pipe/management-vite test` — **354 testes, todos passando** (inclui os 3 novos de `configuration`/`validConfigKey`/import-export)
- `pnpm -s --filter @pipe/contracts typecheck` — sem erros
- `pnpm -s --filter @pipe/core typecheck` — sem erros
- `pnpm -s --filter @pipe/api typecheck` — sem erros
- `pnpm -s --filter @pipe/management-vite typecheck` — sem erros
- `pnpm --filter @pipe/api exec vitest run tests/builder-by-flow.test.ts` — **NÃO executado** (Postgres/Redis indisponíveis no worktree); ver seção acima.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Base de dados pronta para 02-30 (Biblioteca de variáveis, "Minhas variáveis" listando chaves de `configuration`) e 02-31 (aba Variáveis da Configuração, seção "Variáveis de configuração" com `validConfigKey` já disponível).
- Pendência única: o orquestrador deve rodar `apps/api/tests/builder-by-flow.test.ts` após o merge para confirmar os 4 testes novos de API (nunca executados neste worktree).
- Nenhum bloqueio conhecido para 02-30/02-31.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-28*

## Self-Check: PASSED

- All 8 modified files confirmed present on disk.
- All 7 commit hashes (`0f7d9a17`, `7ef7b4fa`, `b0e427e8`, `1a8decf5`, `db256e46`, `db3bc8ab`, `3ba1140a`) confirmed present in `git log`.

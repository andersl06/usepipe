---
phase: 02-fechar-o-builder
plan: 09
subsystem: ui
tags: [react, flow-builder, search, combobox, testing]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder (02-06)
    provides: caracterização de arestasDe() com 9 testes edges:, sem divergência encontrada
  - phase: 02-fechar-o-builder (02-08)
    provides: tokens --p-builder-marca-* e paleta de tags do Builder
provides:
  - "DestinationPicker: combobox pesquisável (sem acento/caixa) para os 3 campos 'Ir para' do painel de saídas"
  - "filterDestinations em variables.ts, unit-testado sem carregar a árvore React de @pipe/ui"
  - "ref/validacao-setas.md: registro formal de que D-29.3 (fluxo real AUVP Capital) segue bloqueado por C-42"
affects: [qualquer plano futuro que feche C-42 (export real do AUVP Capital) e precise reabrir a validação de setas]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Lógica pura de busca/filtro em variables.ts, componente React separado em destination-picker.tsx — evita que testes node:test executem o barrel de @pipe/ui (mesmo split que filterVariables/panel-variables.tsx já usava)"]

key-files:
  created:
    - apps/management-vite/src/pages/builder/destination-picker.tsx
    - .planning/phases/02-fechar-o-builder/ref/validacao-setas.md
  modified:
    - apps/management-vite/src/pages/builder/panel-outputs.tsx
    - apps/management-vite/src/pages/builder/variables.ts
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/tests/builder-editor.test.ts

key-decisions:
  - "filterDestinations foi definida em variables.ts (não em destination-picker.tsx como o texto do plano sugeria) porque destination-picker.tsx importa Icone de @pipe/ui, cujo barrel (index.ts) carrega illustrations.tsx; sob node --test/tsx esse arquivo lança 'ReferenceError: React is not defined' (o transform automático de JSX não é aplicado da forma esperada fora do Vite) — importar qualquer export de destination-picker.tsx nos testes quebrava a suíte inteira. Mover a função pura para variables.ts, o mesmo arquivo que já hospeda normalizar/filterVariables/systemFilterVariables, resolve sem tocar em @pipe/ui; destination-picker.tsx só é responsável por DestinationPicker, que é o único export exigido pelo contrato de artefato do plano."
  - "D-29.3 (validação de setas com o fluxo real do AUVP Capital) fica NEEDS VALIDATION: nenhum export real {flow, globalActions} foi encontrado em referencias-blip/ nem em outro lugar do repositório — só fixtures sintéticas (editor-sintetico.json, flow-block-content.json). modelo.ts/model.ts não foi alterado: 02-06 já caracterizou arestasDe() com 9 testes sem divergência, e nenhuma evidência nova surgiu para justificar mudança."

patterns-established: []

requirements-completed: [BUILDER-02, BUILDER-05]

duration: 40min
completed: 2026-09-27
---

# Phase 02 Plan 09: Seletor de destino com busca e validação de setas Summary

**DestinationPicker (combobox sem acento/caixa) substitui o `<select>` nos três "Ir para" do painel de saídas; BUILDER-05 permanece NEEDS VALIDATION por falta de export real do AUVP Capital (C-42), sem alteração especulativa em `arestasDe()`.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-09-27
- **Tasks:** 2/2
- **Files modified:** 6 (1 novo componente, 1 novo doc de validação, 4 arquivos existentes)

## Accomplishments
- Seletor de destino com busca (D-23): `DestinationPicker` filtra blocos por título ou id, sem acento/caixa, nos três pontos do painel de saídas (condição normal, saídas de disponibilidade, saída padrão), preserva o valor de um destino removido (`<id> (não existe)`) e mantém o laço (bloco como seu próprio destino) permitido pela referência.
- `filterDestinations` ganhou 5 testes (`filterDestinations:`) cobrindo título com/sem acento, busca vazia, busca por id e o caso de laço.
- Validação de setas com fluxo real (D-29.3): busca exaustiva por qualquer export real em `referencias-blip/` e no repositório não encontrou nada além de fixtures sintéticas; registrado em `ref/validacao-setas.md` como `NEEDS VALIDATION (captura C-42 pendente)`, sem tocar em `model.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: DestinationPicker com busca sem acento/caixa (D-23)** - `95fb085` (feat)
2. **Task 2: Validar setas com fluxos reais e corrigir só divergência reproduzida (D-29.3-5)** - `ae56436` (docs)

**Plan metadata:** commit pendente (docs: complete plan) — feito após este SUMMARY.

## Files Created/Modified
- `apps/management-vite/src/pages/builder/destination-picker.tsx` - Componente `DestinationPicker`: input de busca com `role="combobox"`, lista filtrada, navegação por teclado (setas, Enter, Esc), estado de destino inexistente.
- `apps/management-vite/src/pages/builder/variables.ts` - `normalizar` exportada; nova `filterDestinations` (mesmo filtro sem acento/caixa, testável sem `@pipe/ui`).
- `apps/management-vite/src/pages/builder/panel-outputs.tsx` - Os 3 usos de `destinationSelector`/`<Selection>` viraram `<DestinationPicker>` direto; `Selection` deixou de ser importado.
- `apps/management-vite/src/pages/builder/panel-block.css` - Classes novas `bl-destination-picker*`, só tokens (`--p-builder-marca-*`, `--p-superficie-1`, `--p-conteudo*`), sem hex.
- `apps/management-vite/tests/builder-editor.test.ts` - 5 testes `filterDestinations:` novos.
- `.planning/phases/02-fechar-o-builder/ref/validacao-setas.md` (novo) - Registro da busca por exports reais, tabela de validação (1 linha, AUVP Capital = NEEDS VALIDATION) e justificativa de não alterar `model.ts`.

## Decisions Made
- `filterDestinations` mora em `variables.ts`, não em `destination-picker.tsx` — ver "key-decisions" no frontmatter (bloqueio de teste causado pelo barrel de `@pipe/ui`).
- BUILDER-05 fecha parcialmente: o comportamento de `arestasDe()` já está validado (herdado de 02-06); a validação com fluxo real específica do AUVP Capital (D-29.3) segue pendente de captura do dono (C-42), não fechada nesta wave.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Movida `filterDestinations` de `destination-picker.tsx` para `variables.ts`**
- **Found during:** Task 1 (ao rodar `pnpm --filter @pipe/management-vite test` pela primeira vez)
- **Issue:** Com `filterDestinations` definida em `destination-picker.tsx`, importar a função no teste (`import { filterDestinations } from '../src/pages/builder/destination-picker.tsx'`) executa todo o módulo, incluindo `import { Icone } from '@pipe/ui'`. O barrel `@pipe/ui/src/index.ts` reexporta `illustrations.tsx`, que sob `node --import tsx --test` falha com `ReferenceError: React is not defined` (o runtime `tsx` não aplica o JSX automático da mesma forma que o Vite para esse arquivo) — a suíte inteira de `builder-editor.test.ts` quebrava.
- **Fix:** `filterDestinations` passou a viver em `variables.ts` (mesmo arquivo de `normalizar`/`filterVariables`/`systemFilterVariables`); `destination-picker.tsx` importa de lá para uso interno do componente. O teste importa `filterDestinations` de `variables.ts`, que não depende de `@pipe/ui`.
- **Files modified:** `apps/management-vite/src/pages/builder/variables.ts`, `apps/management-vite/src/pages/builder/destination-picker.tsx`, `apps/management-vite/tests/builder-editor.test.ts`
- **Verification:** `pnpm --filter @pipe/management-vite test` — 276/276 testes passando, exit 0. `pnpm exec turbo run typecheck --filter=@pipe/management-vite` — sucesso. `pnpm --filter @pipe/management-vite build` — sucesso.
- **Committed in:** `95fb085` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessário para que o próprio `<verify>` da Task 1 (rodar os testes) funcionasse; o contrato de artefato do plano (`exports: ["DestinationPicker"]` em `destination-picker.tsx`) continua satisfeito. Nenhum scope creep.

## Issues Encountered
- Nenhum export real `{flow, globalActions}` do fluxo AUVP Capital (nem de qualquer outro fluxo) foi encontrado em `referencias-blip/` ou no restante do repositório — confirmado por busca recursiva por `conditionOutputs`/`globalActions` e por nome (`auvp`). Isso já era esperado pelo contexto do plano (D-03, C-42) e foi tratado como instruído: registrar `NEEDS VALIDATION` e seguir, sem inventar dado nem alterar `model.ts` sem evidência.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- BUILDER-02 (D-23) fechado: seletor de destino com busca está em produção nos 3 pontos do painel de saídas.
- BUILDER-05 (D-29) fica com o comportamento de código validado, mas a validação com o fluxo real do AUVP Capital continua bloqueada por C-42 — quando o dono fornecer o export + print do canvas, repetir o procedimento descrito em `ref/validacao-setas.md` para fechar D-29.3 definitivamente.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: `apps/management-vite/src/pages/builder/destination-picker.tsx`
- FOUND: `apps/management-vite/src/pages/builder/panel-outputs.tsx`
- FOUND: `apps/management-vite/src/pages/builder/variables.ts`
- FOUND: `apps/management-vite/src/pages/builder/panel-block.css`
- FOUND: `apps/management-vite/tests/builder-editor.test.ts`
- FOUND: `.planning/phases/02-fechar-o-builder/ref/validacao-setas.md`
- FOUND: commit `95fb085` (Task 1)
- FOUND: commit `ae56436` (Task 2)
- `pnpm --filter @pipe/management-vite test` executado de fato: 276/276 testes passando, exit 0 (última rodada, após Task 2)
- `pnpm exec turbo run typecheck --filter=@pipe/management-vite` executado de fato: sucesso (5/5 tasks)
- `pnpm --filter @pipe/management-vite build` executado de fato: sucesso (`vite build` concluído)

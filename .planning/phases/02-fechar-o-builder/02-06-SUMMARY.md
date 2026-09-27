---
phase: 02-fechar-o-builder
plan: 06
subsystem: testing
tags: [builder, node-test, arestasDe, copy-paste, canvas, D-29, D-17]

requires:
  - phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
    provides: mapa old→new aplicado (tag std-apply-all-end), símbolos/arquivos do Builder já em inglês (arestasDe manteve o nome; newBlock/attendanceNewBlock/duplicateBlock/copiedBlockText/copiedTextBlock/pasteBlock renomeados)
provides:
  - Suite de caracterização de arestasDe() (9 testes `edges:`) cobrindo os 9 casos exigidos pelo plano
  - Confirmação de cobertura de copiar/colar/duplicar de bloco (4 testes `copy-paste:`) e do limite de 15 (já coberto em outro arquivo, para ações — não bloco)
affects: [02-09 (validação com fluxos reais do AUVP Capital, D-29.3), qualquer plano futuro de BUILDER-05/canvas]

tech-stack:
  added: []
  patterns: [caracterização com node:test + node:assert/strict sem fixture, mesmo padrão dos testes já existentes em builder-editor.test.ts]

key-files:
  created: []
  modified:
    - apps/management-vite/tests/builder-editor.test.ts

key-decisions:
  - "arestasDe() já corresponde à referência nos 9 casos testados; nenhuma divergência encontrada — BUILDER-05 (setas) fecha sem alteração de código nesta wave (D-29.4)"
  - "$isDeskCustomOutput gera seta hoje (arestasDe não filtra por esse campo, só por $isDeskDefaultOutput) — comportamento caracterizado e documentado com comentário no teste, consistente com ref/inventario-paineis-e-setas.md (D-29.2); não é a divergência que D-29.5 esperava capturar"
  - "O limite de 15 citado em docs/builder-cards-pendencias.md é do colarAcoes/pasteActions (ações dentro de um bloco), não do copiar/colar de bloco — já coberto por builder-painels.test.ts:39 e :227; nenhum teste novo necessário para esse item"

patterns-established: []

requirements-completed: [BUILDER-05, BUILDER-04]

duration: 35min
completed: 2026-09-27
---

# Phase 02 Plan 06: Caracterização de arestasDe() e confirmação de copiar/colar Summary

**Suite de 13 testes novos (`node:test`) que caracteriza o comportamento atual de `arestasDe()` e confirma a cobertura de copiar/colar de bloco, sem tocar em `model.ts` — BUILDER-05 fecha sem correção de código nesta wave.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-27T00:10:00Z (aprox.)
- **Completed:** 2026-09-27T00:45:48Z
- **Tasks:** 2 (+ Task 0 de pré-flight)
- **Files modified:** 1

## Accomplishments
- 9 testes `edges:` cobrindo exatamente os 9 casos do D-29.1: saída válida, `stateId` inexistente, dedupe por destino, múltiplos destinos em ordem, bloco de atendimento com três saídas (`ClosedAttendant`/`ClosedClient`/`ClosedClientInactivity`), `$isDeskDefaultOutput` sem seta, `$isDeskCustomOutput` com seta (caracterização), `$defaultOutput` preenchido sem seta, mapa vazio/sem saídas.
- 4 testes `copy-paste:` confirmando: `duplicateBlock` gera id novo com dados independentes (deep clone via `copiar`); colar o mesmo texto copiado duas vezes gera ids distintos; texto inválido (JSON quebrado ou sem `id`) devolve `null` sem alterar o mapa; uma saída copiada preserva o `stateId` original, mas `arestasDe()` não desenha seta para destino ausente no mapa de destino.
- Confirmado por `grep`: o "limite de 15" de `docs/builder-cards-pendencias.md` é do colar de **ações** (`pasteActions`/`colarAcoes`), não do colar de **bloco** — já coberto em `builder-painels.test.ts:39` (`pasting actions preserves origin, creates unique ids and respects the limit atomically`) e `:227` (`addGlobalAction rejects past the limit of 15, same as block actions`). Nenhum teste novo precisou ser adicionado para esse item.
- `model.ts` permanece intocado (`git diff --stat` desde o commit base mostra só o arquivo de teste alterado).

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Testes de caracterização de arestasDe() (D-29.1)** - `e94a73d` (test)
2. **Task 2: Cobertura de copiar/colar/duplicar (D-17)** - `3d97170` (test)

**Plan metadata:** (a seguir, commit de documentação com este SUMMARY)

## Files Created/Modified
- `apps/management-vite/tests/builder-editor.test.ts` - 13 testes novos (`arestasDe`, `attendanceNewBlock`, `duplicateBlock` adicionados ao import); nenhuma outra função de produção tocada.

## Decisions Made
- Ver `key-decisions` no frontmatter — nenhuma decisão nova de arquitetura, só confirmações de comportamento já implementado.

## Deviations from Plan

**Nota sobre nomes (não é deviation, é aplicação de D-05):** o mapa old→new da Phase 1 já rodou neste repositório (tag `std-apply-all-end` presente, confirmada na Task 0). Os caminhos e símbolos citados pelo plano em português foram resolvidos contra o disco real antes de escrever o teste:
- `apps/gestao-vite/tests/builder-editor.test.ts` → `apps/management-vite/tests/builder-editor.test.ts`
- `apps/gestao-vite/src/paginas/builder/modelo.ts` → `apps/management-vite/src/pages/builder/model.ts`
- `arestasDe` manteve o nome (não foi traduzido pelo mapa)
- `novoBlocoDeAtendimento` → `attendanceNewBlock`; `novoBloco` → `newBlock`; `copiaDoBloco` → `blockCopy` (privada); `duplicarBloco` → `duplicateBlock`; `textoDoBlocoCopiado` → `copiedBlockText`; `blocoDoTextoCopiado` → `copiedTextBlock`; `colarBloco` → `pasteBlock`
- `painel-saidas.tsx` → `panel-outputs.tsx` (consultado apenas para confirmar o campo `$isDeskCustomOutput`, não modificado)

None - plano executado exatamente como especificado, usando os nomes vigentes no disco.

## Issues Encountered
- `pnpm --filter @pipe/management-vite test` falhou inicialmente com `ERR_MODULE_NOT_FOUND` para `@pipe/core` e `@pipe/contracts` porque o worktree não tinha os pacotes buildados (`dist/` ausente). Resolvido rodando `pnpm --filter @pipe/core build` e `pnpm --filter @pipe/contracts build` antes dos testes — não é uma mudança de código, só passo de ambiente necessário no worktree (sem `node_modules`/`dist` pré-existentes).
- Um teste falhou na primeira rodada porque o bloco de atendimento (`attendanceNewBlock`) prefixa o id com `desk:` (`PREFIX_OF_ATTENDANCE`); corrigido usando `attendance.id` dinamicamente em vez do id literal passado para a função, antes de qualquer commit (não chegou a ser commitado incorreto).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- BUILDER-05 (setas do canvas): a caracterização de `arestasDe()` está feita e não revelou divergência de comportamento reproduzível — o plano 02-09 (validação com fluxos reais, D-29.3, incluindo o export do AUVP Capital) pode prosseguir sem um "caso mínimo" pendente desta wave.
- D-17 (copiar/colar): cobertura funcional confirmada; a paridade visual do menu de contexto (posição, ícones, ordem exata) continua `PENDENTE-CAPTURA` conforme já registrado em `ref/inventario-paineis-e-setas.md` — não é escopo deste plano.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: `apps/management-vite/tests/builder-editor.test.ts`
- FOUND: `.planning/phases/02-fechar-o-builder/02-06-SUMMARY.md`
- FOUND: commit `e94a73d` (Task 1)
- FOUND: commit `3d97170` (Task 2)
- `pnpm --filter @pipe/management-vite test` executado de fato: 256/256 testes passando, exit 0 (última rodada, após Task 2)

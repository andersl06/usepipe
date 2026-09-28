---
phase: 02-fechar-o-builder
plan: 37
subsystem: management-vite/builder
tags: [builder, search, blip-fidelity, gap-closure]
requires: [02-25]
provides: [SEARCH_DEBOUNCE_MS, isSearchDimming]
key-files:
  modified:
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/src/pages/builder.css
    - apps/management-vite/src/pages/builder/search.ts
    - apps/management-vite/src/pages/builder/canvas.tsx
    - apps/management-vite/tests/builder-search.test.ts
decisions:
  - "Term with no match keeps the canvas intact (Blip `searchedStates.length > 0` gate), not all-dimmed as the plan assumed"
  - "Search box stays dark: the Builder chrome (pill #282828, canvas #141414) is dark, so the box follows it"
metrics:
  completed: 2026-09-28
  tasks: 1
  files: 5
---

# Phase 02 Plan 37: Builder search fidelity Summary

Busca do Builder alinhada ao comportamento lido no `portal.js` da Blip: tooltip do (i) sólido por hover/foco (não mais clique), Esc fecha e limpa, debounce de 500ms e regra de esmaecimento extraídos para `search.ts` com testes.

## O que a Blip faz (lido em `referencias-blip/bundles-e-css/portal.js` e `portal.css`)

- `debouncedMakeSearch = debounce(makeSearch, 500)`; `builder-search` chama `onGetInput` a cada `bdsChange`.
- Bloco: `'no-match-node': searchedStates.length > 0 && !isSearched(id)` -> `opacity: .2`. Canvas: `hide-conns` com a mesma condição `searchedStates.length > 0` -> `.canvas.hide-conns svg { display: none }` (setas somem).
- `makeSearch` com termo sem resultado define `searchedStates = []` -> nenhuma classe aplicada: **o canvas fica intacto**.
- Pílula: `icon="{{showSearch ? 'close' : 'search'}}"`, `toggleSearch` com aberto chama `clearSearch` (limpa, fecha, blur). Clique fora com campo vazio (`checkClicksOutsideScope`) chama `clearSearch`; `onBlur` com campo vazio só reenvia termo vazio.
- Caixa: `bds-paper.search-wrapper` 440px, padding 10, raio 8, gap 10; `bds-input icon="search" placeholder="Pesquisar"`; `bds-icon name="info" theme="solid"` com tooltip `bottom`, `small`; `.search-wrapper bds-icon` com borda ghost, raio 10, 25px de altura, padding 10px 8px.

## Respostas às três perguntas do dono

1. **Só o bloco encontrado fica visível?** Sim, com uma ressalva. Na Blip e no Pipe os blocos que batem ficam 100%, os demais ficam a 20% de opacidade e as setas somem enquanto houver pelo menos um resultado. Se o termo não encontra nada, a Blip não esmaece nada (fica tudo normal), e o Pipe faz o mesmo. O plano supunha "tudo esmaecido"; seguimos a Blip.
2. **Só filtra depois de parar de digitar?** Sim. Blip usa 500ms de debounce; o Pipe usa `SEARCH_DEBOUNCE_MS = 500` (testado). Limpar o termo restaura o canvas na hora.
3. **O X aparece no lugar da lupa?** Sim. Com a busca aberta a pílula mostra X (rótulo "Fechar"); X ou Esc fecham e limpam; clique fora com o campo vazio fecha.

## Mudanças

- `search.ts`: `SEARCH_DEBOUNCE_MS` e `isSearchDimming(matches)` (regra `searchedStates.length > 0`).
- `canvas.tsx`: usa `isSearchDimming` (comportamento igual ao anterior, agora testado).
- `builder.tsx`: `<details>` de clique trocado por `span.bl-pesquisa-info` focável com ícone `informacao-cheia` e `role="tooltip"` exibido por hover/foco; texto "Para facilitar a pesquisa, use: / title: Início / tags: valor / content: valor / actions: valor / output: valor"; `onKeyDown` Esc -> `fecharPesquisa()`; debounce usa a constante.
- `builder.css`: chip do (i) com medidas da Blip e tokens (`--p-conteudo-fantasma`, `--p-superficie-4`, `--p-builder-marca-anel`); tooltip pequeno abaixo.

## Verificação (executada)

- `tsc -p tsconfig.json --noEmit`: exit 0.
- `eslint src tests`: exit 0.
- `node --import tsx --test tests/*.test.ts`: 407 pass, 0 fail (inclui 2 testes novos em `builder-search.test.ts`).
- Checkpoint visual do dono: pendente (não verificado em navegador).

## Deviations from Plan

- **Term without match:** plan step 2 expected all blocks dimmed; Blip's `portal.js` gates dimming on `searchedStates.length > 0`, so the existing Pipe behaviour (canvas intact) was kept, as the plan instructed ("verify Blip and follow it").
- **Box colour:** plan asked to avoid a hardcoded dark box if the toolbar is light. The Builder chrome is dark (pill `#282828`, canvas `#141414`), so the dark box (Blip dark surface-3 measured `#141414`) was kept; the new tooltip/chip use tokens.
- Tests live in `node:test` (the app's runner), not vitest.

## Assumption Drift (advisory)

- Found during: reading `portal.js`. Planned: no-match term dims everything. Actual: Blip shows everything. Why: `no-match-node`/`hide-conns` both require `searchedStates.length > 0`.

## Self-Check: PASSED

- Commit a18e4983 present; all five modified files exist.

---
phase: 02-fechar-o-builder
plan: 25
subsystem: ui
tags: [builder, search, react, css, blip-parity]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: builder/model.ts, builder/conteudo.ts, builder/actions-of-block.ts, builder/conditions.ts (block map, content cards, actions, output conditions)
provides:
  - "builder/search.ts: parseSearch/matchBlock/searchMatches (title/tags/output/actions/content prefixes, no id match)"
  - "dark search box matching Blip measurements (440x66, #141414, 368x42 input, info tooltip with the five prefixes)"
  - "canvas untouched on no-result search; pill flips to X/Fechar and always clears the term on close; click-outside-when-empty closes it"
affects: [02-35 (formal F-4 visual measurement, incl. exact pill-relative position and the 0.5s fade), builder search/canvas consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pure search module (parse+match+aggregate) in search.ts, reused the same way tags-of-block.ts/conteudo.ts feed canvas.tsx"
    - "500ms debounce local to builder.tsx via setTimeout cleared in a useEffect; clearing the term skips the debounce"
    - "dark-outside-editor scoping: --p-superficie-0/--p-linha-media/--p-conteudo overridden directly on the box's class, same technique as builder/panel-block.css's .bl-panel"
    - "accessible tooltip reused via the .dica/.dica-balao CSS classes (native <details>/<summary>, established in components/metrica.tsx) instead of a new tooltip primitive"

key-files:
  created:
    - apps/management-vite/src/pages/builder/search.ts
    - apps/management-vite/tests/builder-search.test.ts
  modified:
    - apps/management-vite/src/pages/builder/canvas.tsx
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/src/pages/builder.css

key-decisions:
  - "tags: prefix reads block.$tags labels directly, not the canvas badge helper blockTags() (which also mixes in action types and 'UserInput') — keeps title/tags/output/actions/content as five distinct fields per the plan's must_haves"
  - "action-field search flattens every string value found in an action's settings (recursively), not just the catalog's declared fields, so imported/unknown actions stay searchable by field value"
  - "packages/ui/src/icones.tsx was NOT touched: the search icon, X and info icons already exist in components/icones-portal.tsx and are already used throughout builder.tsx, so no new icon was needed (D-33 already satisfied)"
  - "search box position implemented as 'anchored to the magnifier button, vertically centered on it' (a wrapper div around just that one 40px button, box positioned off the wrapper) rather than a measured pixel offset from the whole pill — V-F4-01 (exact position vs. the pill) is still marked 'a medir' in ref/FIDELIDADE-F1-F6.md and is explicitly deferred to 02-35's formal visual pass"
  - "skipped the captured 0.5s opacity fade-in/out of the search box (C:14172-14199): the box mounts/unmounts with React state instead of a show/hide class, so no transition plays; none of the plan's must_haves or verify steps require it, and it is a cosmetic nicety, not a correctness truth"

requirements-completed: [BUILDER-02]

# Metrics
duration: ~30min
completed: 2026-09-28
---

# Phase 2 Plan 25: Busca do Builder (lupa) Summary

**Busca do Builder reescrita: `search.ts` casa blocos por título/etiquetas/saídas/ações/conteúdo com os cinco prefixos da Blip, e a caixa flutuante virou escura (440×66, #141414) com pílula em X, sem mais esmaecer o canvas quando a busca não acha nada.**

## Performance

- **Started:** ver commit `d7ddddb9` (18:06 -03:00)
- **Completed:** 2026-09-28T21:21:37Z
- **Duration:** ~30min (inclui `pnpm install`/build de `@pipe/core` e `@pipe/contracts` no worktree, do zero)
- **Tasks:** 2/2 concluídas
- **Files modified:** 5 (2 criados, 3 editados)

## Accomplishments
- `builder/search.ts` criado com `parseSearch`, `matchBlock` e `searchMatches`: cinco prefixos (`title:`, `tags:`, `content:`, `actions:`, `output:`), busca sem prefixo nos cinco campos, normalização NFD sem diacríticos, e a regra "nunca casa pelo id" — sempre por `includes` puro, nunca `RegExp` do termo digitado (T-2-25-02).
- `canvas.tsx` migrado para `searchMatches`: termo vazio (`null`) ou sem resultado (`Set` vazio) deixam o canvas intacto; só um resultado não vazio esmaece os blocos fora dele e some com as setas (`bl-canvas--pesquisando`), corrigindo as duas causas do "em branco" descritas em F-4.2.
- Caixa de busca escura (`#141414`, 440×66, raio 8, sombra medida), lupa 20px à esquerda do campo, campo 368×42, e botão de informação com tooltip claro listando os cinco prefixos — reaproveitando o padrão acessível `.dica`/`.dica-balao` já usado em `components/metrica.tsx`.
- Pílula "Pesquisar" vira "Fechar" (ícone X) quando aberta; fechar por ela sempre limpa o termo; clicar fora com o campo vazio também fecha; abrir foca o campo (`autoFocus`).
- Busca com atraso de 500ms depois de digitar; limpar o termo restaura o canvas na hora, sem esperar o atraso.

## Task Commits

Each task was committed atomically:

1. **Task 1: Casamento de blocos com prefixos (`search.ts`)** - `d7ddddb9` (feat)
2. **Task 2: Caixa escura, pílula X, fechar limpa e canvas intacto sem resultado** - `455287a8` (feat)

**Draft summary:** `e319bbdf` (docs, after Task 1)

## Files Created/Modified
- `apps/management-vite/src/pages/builder/search.ts` - casamento puro de blocos com prefixos (`parseSearch`/`matchBlock`/`searchMatches`)
- `apps/management-vite/tests/builder-search.test.ts` - 15 testes: cinco prefixos, sem prefixo, sem id, termo vazio e sem resultado
- `apps/management-vite/src/pages/builder/canvas.tsx` - `corresponde`/`bl-canvas--pesquisando` passam a usar `searchMatches`; sem resultado não esmaece nada
- `apps/management-vite/src/pages/builder.tsx` - atraso de 500ms, pílula em X, fechar sempre limpa, clique fora fecha com campo vazio, caixa com lupa e (i)
- `apps/management-vite/src/pages/builder.css` - caixa escura ancorada junto ao botão da lupa, campo escuro com anel de foco da marca do Builder, botão (i) com tooltip claro

## Decisions Made
Ver `key-decisions` no frontmatter — resumo:
- `tags:` busca só `$tags` reais (não os badges sintéticos do canvas).
- Campos de ação buscados por valor de `settings` recursivamente, não só pelos campos do catálogo.
- `packages/ui/src/icones.tsx` não foi tocado: ícones equivalentes já existiam em `icones-portal.tsx`.
- Posição da caixa: ancorada ao botão da lupa (não à pílula inteira) por CSS puro, sem medir pixels contra a pílula — a medição exata (V-F4-01) segue pendente para o 02-35.
- Transição de opacidade de 0,5s da caixa (medida nas capturas) não foi implementada — não é um must-have desta plan e é puramente cosmética.

## Deviations from Plan

None - plan executado como escrito. A auto-correção de um bug interno (o `Set` vazio de "sem resultado" esmaecendo todos os blocos) foi feita e testada antes de qualquer commit, então nunca chegou a ser um código incorreto commitado.

## Issues Encountered
- O hook do RTK reescreve `grep` neste worktree e interpretou mal o padrão literal `"setPesquisa('')"` (deu 38 falsos positivos em vez do único match real). Contornado chamando `/usr/bin/grep` diretamente; os três greps de verificação da Task 2 (`searchMatches`, `setPesquisa('')`, ausência de `Fechar pesquisa`) foram confirmados por essa via, além do `Grep` tool (ripgrep), que também confirmou o match correto.
- `pnpm install --prefer-offline --frozen-lockfile` falhou uma vez com `EPERM` renomeando `next` em `node_modules/.pnpm` (lock de arquivo concorrente, provavelmente outro executor rodando em paralelo); a segunda tentativa completou sem erro.

## Verification Performed
- `pnpm --filter @pipe/management-vite test` — 351/351 testes verdes (inclui os 15 novos de `builder-search.test.ts`).
- `pnpm -s --filter @pipe/management-vite typecheck` — sem erros.
- `grep -q "searchMatches" .../canvas.tsx && grep -q "setPesquisa('')" .../builder.tsx && ! grep -q "Fechar pesquisa" .../builder.tsx` — todos os três confirmados (via `/usr/bin/grep`, ver Issues acima).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- F-4 (busca) tem as três causas do "em branco" corrigidas: tema escuro, sem resultado intacto, fechar limpa.
- A medição visual formal (posição exata da caixa em relação à pílula, transição de 0,5s, cor exata do anel de foco em pixels) fica para o 02-35, junto com F-1..F-6.
- Nenhum bloqueio para os planos paralelos 02-23/02-24 — os arquivos tocados aqui (`canvas.tsx`, `builder.tsx`, `builder.css`) tiveram edições localizadas, sem reformatar trechos fora do escopo da busca.

## Self-Check: PASSED

All 5 files created/modified confirmed present on disk; all 3 commits (`d7ddddb9`, `e319bbdf`, `455287a8`) confirmed in `git log`.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-28*

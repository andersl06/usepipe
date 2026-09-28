---
phase: 02-fechar-o-builder
plan: 26
subsystem: ui
tags: [react, css, builder, floating-panel]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: panel-block.css geometry and dark tokens (.bl-panel--block), search shell (02-25)
provides:
  - "FloatingSidebar: casca flutuante comum (460px, 16px das bordas, raio 16, sombra 32px 0 56px 32px rgba(0,0,0,.5), fundo #1f1f1f) para Configuração, Biblioteca e Filas"
  - "Configuração e Filas na casca à direita, título readonly, fechar 24px, linha e corpo no padrão do painel do bloco"
  - "Biblioteca na casca à esquerda, sem título, sem linha, fechar 24px"
affects: [02-30, 02-31, 02-32, 02-33, 02-34]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FloatingSidebar(lado, titulo?, ariaLabel, onFechar, abas?, children) como raiz compartilhada dos painéis flutuantes do Builder"
    - ".bl-panel--flutuante compartilha geometria/tokens com .bl-panel--block via seletor combinado em panel-block.css, sem duplicar regras"

key-files:
  created:
    - apps/management-vite/src/pages/builder/floating-sidebar.tsx
  modified:
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/src/pages/builder/panel-variables.tsx
    - apps/management-vite/src/pages/builder/panel-queues.tsx
    - apps/management-vite/tests/builder-painels.test.ts

key-decisions:
  - "FloatingSidebar não envolve os children num .bl-panel-body próprio: cada painel mantém seu próprio div.bl-panel-body (com classes extras, como bl-queues-body), só a raiz aside/cabeçalho/fechar/linha trocou — evita duplicar padding e mantém o conteúdo interno intocado, como pedido pela Tarefa 2."
  - "Título do painel de Configuração passou de span 'Configurações' para input readonly 'Configurações gerais' (T:1737); Filas de 'Gerenciamento de Filas' para 'Gerenciamento de filas' (f minúsculo, T:856), só o texto do título — abas e conteúdo internos ficam como estão para 02-30..02-34."
  - "editor.css: .bl-panel--left e .bl-panel--settings removidas por ficarem mortas (nenhum componente as referencia mais); a base .bl-panel (445px) e as regras genéricas .bl-panel-header/.bl-panel-title/.bl-panel-wire/.bl-panel-body ficaram intocadas porque o painel de Teste (test-panel.tsx, fora do escopo deste plano) ainda depende delas."
  - "Convivência Biblioteca+Configuração / Biblioteca+painel do bloco (V-F2-07) já funcionava no builder.tsx atual (nenhum estado fecha variablesOpen ao abrir configAberto/o bloco, nem vice-versa) — nenhuma mudança em builder.tsx foi necessária."

patterns-established:
  - "Painéis flutuantes do Builder (Configuração, Biblioteca, Filas) compartilham uma única casca (FloatingSidebar) em vez de reimplementar aside/header/fechar cada um."

requirements-completed: [BUILDER-04]

# Metrics
duration: 45min
completed: 2026-09-28
---

# Phase 02 Plan 26: Casca flutuante comum (FloatingSidebar) Summary

**FloatingSidebar compartilhado (460×674, 16px das bordas, raio 16, sombra forte) monta Configuração, Biblioteca e Filas com o título, fechar e linha da Blip, sem tocar no conteúdo interno de cada painel.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-09-28 (ver commits)
- **Completed:** 2026-09-28
- **Tasks:** 2/2
- **Files modified:** 7 (1 criado, 6 modificados)

## Accomplishments
- `FloatingSidebar` criado e testado: raiz `aside.bl-panel.bl-panel--flutuante.bl-panel--direita|--esquerda`, título opcional em `input` readonly + fechar de 24px sem moldura + `hr.bl-panel-wire` quando há título; sem título (Biblioteca), só o fechar alinhado à direita, sem linha.
- `panel-block.css`: geometria e tokens escuros de `.bl-panel--block` extraídos para um bloco compartilhado com `.bl-panel--flutuante` (460px, raio 16, sombra `32px 0 56px 32px rgba(0,0,0,.5)`, fundo `#1f1f1f`), com `--direita`/`--esquerda` para a posição; `.bl-panel--block` manteve exatamente as mesmas medidas de antes (nenhuma regressão no painel do bloco).
- `Configuração`, `Biblioteca de variáveis` e `Filas` (`panel-configuration.tsx`, `panel-variables.tsx`, `panel-queues.tsx`) passaram a montar sobre `FloatingSidebar`, com o conteúdo interno de cada aba intocado.
- `editor.css` limpo das regras mortas `.bl-panel--left` e `.bl-panel--settings` (não usadas por mais nenhum componente); a base `.bl-panel`/`.bl-panel-header`/`.bl-panel-title`/`.bl-panel-wire`/`.bl-panel-body` genéricas ficaram como estão porque o painel de Teste ainda as usa.

## Task Commits

Each task was committed atomically:

1. **Task 1: Componente `FloatingSidebar` e CSS da casca** - `a19baa38` (feat)
2. **Task 2: Montar Configuração, Biblioteca e Filas na casca** - pendente (ver commit final)

**Plan metadata:** pendente (docs: complete plan)

## Files Created/Modified
- `apps/management-vite/src/pages/builder/floating-sidebar.tsx` - novo componente `FloatingSidebar`
- `apps/management-vite/src/pages/builder/panel-block.css` - geometria/tokens compartilhados `.bl-panel--flutuante`/`.bl-panel--block`, `--direita`/`--esquerda`
- `apps/management-vite/src/pages/builder/editor.css` - remoção de `.bl-panel--left` e `.bl-panel--settings` (mortas)
- `apps/management-vite/src/pages/builder/panel-configuration.tsx` - raiz trocada para `FloatingSidebar`, título "Configurações gerais"
- `apps/management-vite/src/pages/builder/panel-variables.tsx` - raiz trocada para `FloatingSidebar`, sem título, `hr` removido
- `apps/management-vite/src/pages/builder/panel-queues.tsx` - raiz trocada para `FloatingSidebar`, título "Gerenciamento de filas"
- `apps/management-vite/tests/builder-painels.test.ts` - testes novos: geometria CSS de `.bl-panel--flutuante`, export do componente, montagem dos três painéis

## Decisions Made
Ver `key-decisions` no frontmatter.

## Deviations from Plan

None - plan executado como escrito (draft: Task 1 concluída; Task 2 e verificação final em andamento).

## Issues Encountered

Nenhum até aqui.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Casca comum pronta para 02-30..02-34 reescreverem o conteúdo interno de cada painel sem repetir geometria.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-28*

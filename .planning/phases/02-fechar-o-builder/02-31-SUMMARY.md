---
phase: 02-fechar-o-builder
plan: 31
subsystem: builder
tags: [react, vitest, configuration, blip-parity]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: "configuration flow through the engine (02-29): flow.configuration, gesto configuracao, validConfigKey"
provides:
  - "configuration-sections.ts: pure definition of the 8 captured Variáveis sections, TimeSpan conversions"
  - "panel-configuration-variables.tsx: the Variáveis tab, functional 'Variáveis de configuração' + 7 disabled sections marked 'Não disponível no Pipe'"
  - "Configuração tab order: Variáveis (default) · Versões · Ações globais · Funções"
affects: [02-32-versoes-acoes-globais]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-page reuse of Interruptor (apps/management-vite/src/pages/flow/integrations/interruptor.tsx) for the 42x24 Blip switch, already used by panel-queues.tsx"

key-files:
  created:
    - apps/management-vite/src/pages/builder/configuration-sections.ts
    - apps/management-vite/src/pages/builder/panel-configuration-variables.tsx
  modified:
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/tests/builder-painels.test.ts

key-decisions:
  - "(rascunho — preenchido na finalização)"

requirements-completed: [BUILDER-04]

# Metrics
duration: (rascunho — preenchido na finalização)
completed: 2026-09-28
---

# Phase 02 Plan 31: Configuração — aba Variáveis Summary

**(rascunho, escrito após a Task 1 — finalizado ao fim do plano)**

Draft criado após a Task 1 (definição pura das 8 seções); será substituído por um resumo completo ao final da execução.

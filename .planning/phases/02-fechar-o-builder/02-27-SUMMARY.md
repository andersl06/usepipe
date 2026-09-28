---
phase: 02-fechar-o-builder
plan: 27
subsystem: builder
tags: [builder, toast, erros, publicar, d-56]
dependency-graph:
  requires: ["02-26"]
  provides: ["builder-toast-unico"]
  affects: ["apps/management-vite/src/pages/builder.tsx", "apps/management-vite/src/pages/builder/editor.tsx"]
tech-stack:
  added: []
  patterns: ["fila de toast pura + timer no componente", "publicar sem modal"]
key-files:
  created:
    - apps/management-vite/src/pages/builder/toast-queue.ts
    - apps/management-vite/src/pages/builder/toast.tsx
    - apps/management-vite/tests/builder-toast.test.ts
  modified:
    - apps/management-vite/src/pages/builder/editor.css
    - packages/ui/src/icones.tsx
decisions: []
metrics:
  duration: "em andamento"
  completed: null
---

# Phase 02 Plan 27: F-6 toast único (bottom-left, D-56) Summary

**Status:** rascunho — Task 1 concluída; Task 2 e o checkpoint do dono seguem em execução nesta mesma sessão.

Fila de toast pura (`toast-queue.ts`) e componente `BuilderToasts` (`toast.tsx`) reproduzindo o toast da Blip: canto inferior esquerdo, gradientes por tom, até 6 empilhados com o mais novo no topo, pausa no hover.

## Task 1 — Fila de toasts e componente (concluída)

- `toast-queue.ts`: `pushToast`/`dismissToast`/`expireToasts` puros, `TOAST_LIMIT=6`, `TOAST_DURATION_MS=5000`; `expireToasts` mantém os pausados e reempurra o prazo deles (`expiraEm = agora + duracaoMs`) a cada chamada, então retomar dá um prazo cheio novo, sem expirar na hora com um prazo velho.
- `toast.tsx`: `BuilderToasts({ toasts, onFechar, onPausar, onRetomar })`. Guarda uma cópia local da lista (`local`) sincronizada com `toasts` para preservar o `expiraEm` recalculado dos itens pausados entre re-renders do pai; um `setInterval` de 250ms dentro do componente chama `expireToasts` e avisa o pai via `onFechar` para cada id que sumiu.
- `editor.css`: `.bl-toast` reescrito com as medidas do F-6.1 K (`left:18px; bottom:20px`, raio 10, padding 14px 20px, 14px branco, base `#4a4a4a`, gradientes `90deg` por tom, ícone com `margin-right:25px`, entrada com `.3s`).
- `icones.tsx`: novo glifo `perigo` (círculo com "!") para o tom perigo do toast; `alerta` (aviso) e `cheque` (sucesso) reaproveitados (D-33).
- `builder-toast.test.ts`: cobre limite de 6 descartando o mais antigo, mais novo no topo, duração padrão de 5s, `titulo`/`duracaoMs` custom, `dismissToast` isolado e o ciclo pausa→retomada de `expireToasts`.

**Verificação (Task 1):** `pnpm --filter @pipe/management-vite test` — 361/361 passando. `pnpm --filter @pipe/management-vite typecheck` — sem erros.

## Task 2 — Publicar/salvar por toast; remover faixa e modal (em andamento)

Pendente nesta sessão.

## Task 3 — Checkpoint do dono

Pendente; instruções de verificação serão escritas ao final desta sessão.

## Self-Check

Pendente até o fim da execução.

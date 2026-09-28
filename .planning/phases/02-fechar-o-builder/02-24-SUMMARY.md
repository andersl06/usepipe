---
phase: 02-fechar-o-builder
plan: 24
subsystem: builder-ui
tags: [builder, acoes, css, fidelidade-visual, icones]
dependency-graph:
  requires: ["02-23"]
  provides: ["F-1 action-row visual parity"]
  affects:
    - apps/management-vite/src/pages/builder/panel-actions.tsx
    - apps/management-vite/src/pages/builder/actions-of-block.ts
    - apps/management-vite/src/pages/builder/cabecalho-info.tsx
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/src/pages/builder/panel.tsx
    - apps/management-vite/src/pages/builder/editor.tsx
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - packages/ui/src/icones.tsx
tech-stack:
  added: []
  patterns:
    - "ACTION_TYPE_ICON/iconOfActionType(tipo): map an action type to a Pipe-drawn @pipe/ui icon, generic fallback for unmapped types"
    - "removeActions(list, indices): pure bulk-delete by position, used by 'Deletar selecionados'"
    - "DescricaoParte[] + renderDescricao(): T:836 bold segments render through React (<strong>), never dangerouslySetInnerHTML; CabecalhoInfo grew an optional 'etiqueta' badge slot"
key-files:
  created: []
  modified:
    - packages/ui/src/icones.tsx
    - apps/management-vite/src/pages/builder/actions-of-block.ts
    - apps/management-vite/src/pages/builder/cabecalho-info.tsx
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/tests/builder-actions.test.ts
decisions: []
metrics:
  duration: TBD
  completed: TBD
---

# Phase 2 Plan 24: Linhas de ação da aba Ações (F-1) Summary

STATUS: DRAFT — Task 1 concluída e commitada; Task 2 (linha/CSS/cabeçalhos) e Task 3 (Biblioteca de funções) pendentes.

## One-liner

Ícone por tipo de ação, remoção em lote e descrições com trechos em negrito estruturados (sem HTML cru), preparando a linha de ação e os cabeçalhos da aba Ações para bater com as medidas ao vivo do Builder da Blip.

(Este é um rascunho intermediário. Será substituído por um resumo final ao término de todas as tasks.)

## Progresso

### Task 1 — Ícones por tipo e remoção em lote

Concluída. Commits:
- `71d62e88` test(02-24): add failing coverage for action icons, removeActions and description parts (RED)
- `6ac6d7f9` feat(02-24): action-type icons, bulk removal and structured descriptions (GREEN)

`ACTION_TYPE_ICON`/`iconOfActionType(tipo)` em `actions-of-block.ts` mapeiam os 12 tipos de ação da tabela F-1.2 para um ícone próprio de `@pipe/ui` (`ExecuteScript`/`ExecuteScriptV2` reaproveitam `script`; `ProcessHttp` reaproveita `httpRequest`), com `actionGeneric` como fallback para tipos fora da tabela (ex.: `SendMessageFromHttp`, `SetBucket`). Onze ícones novos foram desenhados em `packages/ui/src/icones.tsx` no mesmo estilo (grade 24, sem preenchimento, traço arredondado), nenhum copiado da Blip (D-33): `trackEvent`, `mergeContact`, `redirect`, `manageList`, `blipFunction`, `setVariable`, `processCommand`, `executeTemplate`, `forwardToAgent`, `actionGeneric`, `addOutline`.

`removeActions(list, indices)` em `actions-of-block.ts` é uma função pura que remove as posições selecionadas preservando a ordem das demais (base para "Deletar selecionados" da Task 2/linha 23 da F-1.4).

`LABELS_OF_ACTIONS` ganhou os textos de seleção em lote (`copiarSelecionados`, `deletarSelecionados`), o texto do chip (`erro`) e os textos da Biblioteca de funções (`bibliotecaFuncoes`, `bibliotecaFuncoesEtiqueta`, `bibliotecaFuncoesDescricao`, `gerenciarFuncoes`, `criarFuncao`) para a Task 3. `entradaDescricao`/`saidaDescricao` viraram `DescricaoParte[]` (partes `{ texto, forte }`) em vez de string simples, com o trecho em negrito de T:836 marcado por `forte: true`.

`cabecalho-info.tsx` ganhou `renderDescricao(partes)` (renderiza `forte` como `<strong>` via React, nunca `dangerouslySetInnerHTML`) e um slot opcional `etiqueta` no `CabecalhoInfo` para a etiqueta "Novo" da Task 3.

**Deviação (Rule 3 — correção de bloqueio):** a mudança de tipo de `entradaDescricao`/`saidaDescricao` (de `string` para `DescricaoParte[]`) quebrou o typecheck de `panel-configuration.tsx`, que também consome esses textos em `ActionsGlobalList` (aba "Ações Globais" da Configuração, fora dos arquivos deste plano). Corrigido o mínimo necessário: o prop `description` de `ActionsGlobalList` passou a `DescricaoParte[]` e sua renderização usa `renderDescricao`, mantendo o build verde. `panel-actions.tsx` (que também consome esses textos) ainda não foi atualizado — isso é o objeto da Task 2, que segue com o typecheck falhando nesses dois pontos até lá.

Verificação executada: `node --import tsx --test tests/builder-actions.test.ts` (invocação direta, já que `pnpm --filter @pipe/management-vite test`'s glob `tests/*.test.ts` não expande todos os arquivos neste ambiente Windows — falha pré-existente, fora do escopo deste plano, registrada como achado, não corrigida) — 18 passed, 0 failed (RED confirmado antes da implementação via `git stash` temporário nos 3 arquivos de implementação; GREEN confirmado depois). `pnpm --filter @pipe/ui typecheck` — limpo. `pnpm -s --filter @pipe/management-vite typecheck` — 2 erros esperados em `panel-actions.tsx` (Task 2 os resolve).

### Task 2 — Linha da ação, barra de seleção e cabeçalhos (F-1.4 linhas 14–24)

Pendente.

### Task 3 — Seção BIBLIOTECA DE FUNÇÕES no topo da aba Ações

Pendente.

## Deviations from Plan

(a preencher ao final)

## Assumption Drift (advisory)

(a preencher ao final, se houver)

## Self-Check

(a preencher ao final)

---
phase: 02-fechar-o-builder
plan: 42
subsystem: front (management-vite, desk-vite, packages/ui)
tags: [cleanup, shared-ui, pagination, modal, toast, select, chips]
requires: []
provides: [ui-icones-portal, ui-api-client, ui-select, ui-chips-input, ui-pagination, ui-toast, ui-modal]
affects: [every Gestão screen with pagination/modal/toast, Desk composer and conversation]
key-files:
  created:
    - packages/ui/src (subpaths icones-portal, api, select, chips-input, pagination, toast, modal)
  modified:
    - apps/management-vite/src/** (61 screens/components switched to @pipe/ui imports)
    - apps/desk-vite/src/pages/attendances/composer.tsx
    - apps/desk-vite/src/pages/attendances/conversation.tsx
    - apps/desk-vite/vite.config.ts
decisions:
  - Each shared control is its own @pipe/ui subpath so an app only ships the CSS/code it imports; Vite aliases only the bare @pipe/ui, subpaths resolve through package exports.
  - Shared components take a skin/layout prop that keeps each screen's existing classes, so markup and measurements per screen stay the same (wrap, don't restyle).
  - The single API client reads errors from the api's real shape { error: { message } }. The old Gestão copy read corpo.mensagem, which the api never sends.
completed: 2026-09-29
---

# Phase 02 Plan 42: Front — remove idle code, one set of global components

## Commits (one step each, revertable alone)

| Commit | Step | Files | +/- |
|---|---|---|---|
| c1636fb7 | Idle exports, their tests and unused CSS removed (`.bl-values*`, `.bl-queues-*`, `.bl-panel-id`, `.bl-recado-titulo`, seven `dk-*` rules; builder/flow/desk helpers with no importer) | 18 | +9 / -368 |
| eea33e42 | One `icones-portal` (~220 KB) at `@pipe/ui/icones-portal`, imported by Gestão and Desk | 71 | +72 / -873 |
| 10f0739e | One API client and sign-in helpers at `@pipe/ui/api` (was `lib/api.ts` + `lib/inbound.ts` in each app) | 62 | +231 / -365 |
| fe530e71 | Select, ChipsInput, Pagination (+ `usePage`), Toasts (+ queue), Modal/ConfirmModal in `@pipe/ui`; builder queue rules use ConfirmModal instead of `window.confirm` | 63 | +1224 / -1362 |

## Before / after (apps/management-vite/src + apps/desk-vite/src + packages/ui/src)

| | Files | Lines |
|---|---|---|
| Before (aad59186) | 373 | 90,047 |
| After | 370 | 88,669 |
| Net | -3 | -1,378 |

Whole diff: 182 files, +1,534 / -2,966.

## Verification

- `tsc --noEmit`: management-vite and desk-vite clean; packages build clean.
- ESLint: management-vite 0, desk-vite 0, packages/ui 0.
- Tests: management-vite 416/416, desk-vite 34/34, packages/ui token check ok (91 tokens, light/dark parity).
- `vite build`: both apps build (only the existing chunk-size warning).

## Screens the owner should eyeball

- Builder: queue rules (delete now asks through ConfirmModal), block panels (Select/ChipsInput), toasts on publish/save/import.
- Operação > Monitoria (grid pagination and conversation modal), Histórico, Revisão de qualidade, Relatórios de atendimento e satisfação.
- Regras de atendimento list (pagination), Portal (pagination and icons).
- Cadastros: all modals (agents, breaks, queues, SLA rules, replies, templates, manual channel connection).
- Fluxo: Configurações básicas and Chaves (cf-modal), Equipe, Mensagens ativas and Links rastreados (gr-modal), Conteúdos, Log, Recursos, Webhook, Jornada, Gerenciador de relatórios.
- Minha conta, Atualizações.
- Desk: composer and conversation (dk-modal, Select, toasts).
- Any screen showing an API error: the real message now appears instead of "A api respondeu N.".

## Left for a later pass

Some modal shells still hand-made and not yet on `@pipe/ui/modal`: `cm-modal` (Contrato > Certificados), `mb-modal` (Contrato > Membros, convidar/tabela), `an-modal` (Analytics visão geral, jornada, relatórios), and the two `gr-modal` in the report manager (the shell class remains, content untouched). Certificados still has its own popover toast. The audit counted 9 modal families; 5 were moved here.
